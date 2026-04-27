import { useState } from "react";
import { C } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import type { Trip } from "../../types";

interface Props {
  trip: Trip;
  sendCount: number;
  onClose: () => void;
  onSent: () => void;
}

export default function CutoffModal({ trip, sendCount, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(false);

  const origin = `${trip.origin_city}, ${trip.origin_country}`;
  const dest   = `${trip.destination_city}, ${trip.destination_country}`;
  const slug   = trip.public_slug;
  const bookingLink = `gpflow.app/trip/${slug}`;

  // Determine if today is the cutoff day
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(trip.cutoff_date);
  cutoff.setHours(0, 0, 0, 0);
  const isLastDay = today.getTime() === cutoff.getTime();

  const cutoffFmt = new Date(trip.cutoff_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const departFmt = new Date(trip.departure_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const earlyMsg =
    `Drop off deadline for the ${origin} → ${dest} trip is ${cutoffFmt}.\n` +
    `Don't miss it — book now 📦\n${bookingLink}`;

  const lastDayMsg =
    `⚠️ Last chance! Today is the final day to drop off your package.\n` +
    `The ${origin} → ${dest} trip leaves ${departFmt}.\n` +
    `Drop off by end of day today 📦\n${bookingLink}`;

  const message = isLastDay ? lastDayMsg : earlyMsg;
  const badge   = isLastDay ? "🚨 Last Day Message" : "📅 Early Reminder";
  const badgeColor = isLastDay ? C.red : C.gold;
  const ctaLabel = isLastDay ? "🚨 Send Last Chance Message" : "📲 Send Reminder";

  async function send() {
    if (loading) return;
    setLoading(true);
    try {
      await api.post(`/trips/${trip.id}/cutoff-reminder`);
      onSent();
    } catch {
      // fire anyway — optimistic
      onSent();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        <div style={{ paddingRight: 40, marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Cutoff Reminder</div>
          <span style={{
            display: "inline-block",
            background: badgeColor + "22",
            border: `1px solid ${badgeColor}44`,
            borderRadius: 8, padding: "4px 12px",
            fontSize: 12, fontWeight: 700, color: badgeColor,
          }}>
            {badge}
          </span>
        </div>

        {sendCount > 0 && (
          <div style={{
            background: C.card2, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "8px 14px",
            fontSize: 12, color: C.textSub, marginBottom: 14,
          }}>
            Sent {sendCount} time{sendCount !== 1 ? "s" : ""} so far.
          </div>
        )}

        {/* Message preview */}
        <div style={{
          background: "#070C16", border: `1px solid ${C.border}`,
          borderRadius: 14, overflow: "hidden", marginBottom: 18,
        }}>
          <div style={{
            background: C.card2, padding: "10px 16px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 11, color: C.textSub, fontWeight: 600,
          }}>
            📲 Message Preview
          </div>
          <div style={{ padding: "14px" }}>
            <div style={{
              background: "#1C2840", borderRadius: "4px 14px 14px 14px",
              padding: "12px 14px", fontSize: 13, color: C.text,
              lineHeight: 1.8, whiteSpace: "pre-line",
            }}>
              {message}
            </div>
          </div>
        </div>

        <button
          onClick={send}
          disabled={loading}
          style={{
            width: "100%",
            background: loading ? C.border : badgeColor,
            color: loading ? C.textDim : "#07090F",
            border: "none", borderRadius: 16,
            padding: "18px 22px", fontSize: 16, fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans',sans-serif",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <span>{loading ? "Sending…" : ctaLabel}</span>
          {!loading && <span>→</span>}
        </button>
      </div>
    </Modal>
  );
}
