import { useState } from "react";
import { C } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import WaBubble from "../ui/WaBubble";
import type { Booking, Trip } from "../../types";

interface Props {
  trip: Trip;
  bookings: Booking[]; // weighed bookings only
  onClose: () => void;
  onDeparted: () => void;
}

export default function DepartedModal({ trip, bookings, onClose, onDeparted }: Props) {
  const [loading, setLoading] = useState(false);

  const weighed = bookings.filter((b) => b.confirmed_weight_kg != null);
  const sample = weighed[0];

  const origin = `${trip.origin_city}, ${trip.origin_country}`;
  const dest   = `${trip.destination_city}, ${trip.destination_country}`;
  const op     = trip.operator_business_name;

  function buildMsg(b: Booking): string {
    const fn  = b.sender_name.split(" ")[0];
    const lbs = b.confirmed_weight_kg != null ? (b.confirmed_weight_kg * 2.20462).toFixed(1) : "?";
    const kg  = b.confirmed_weight_kg?.toFixed(2) ?? "?";
    return (
      `Hi ${fn} 👋\n\nWe've left ${origin}! ✈️\n` +
      `Your package is on its way to ${dest}.\n\n` +
      `📋 Ref: ${b.reference_number}\n` +
      `📦 ${b.item_description}\n` +
      `⚖️ ${lbs}lbs (${kg}kg)\n` +
      `👤 For: ${b.recipient_name}, ${b.recipient_city}\n\n` +
      `Will update you when we land 🙏\n— ${op} via GPFLOW`
    );
  }

  async function sendAndDepart() {
    if (loading) return;
    setLoading(true);
    try {
      await api.patch(`/trips/${trip.id}`, { status: "in_transit" });
      onDeparted();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        <div style={{ paddingRight: 40, marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>✈️ Mark as Departed</div>
          <div style={{ fontSize: 12, color: C.textSub }}>
            {weighed.length} personalised WhatsApp messages will be sent — not a group broadcast.
          </div>
        </div>

        {/* Sample message */}
        {sample && (
          <div style={{
            background: "#070C16", border: `1px solid ${C.border}`,
            borderRadius: 16, overflow: "hidden", marginBottom: 18,
          }}>
            <div style={{
              background: C.card2, padding: "10px 16px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: `linear-gradient(135deg,${C.accent},#00A87A)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 900, color: "#07090F",
              }}>
                {op.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{op}</div>
                <div style={{ fontSize: 10, color: C.accent }}>
                  Sample Message (1 of {weighed.length})
                </div>
              </div>
            </div>
            <div style={{ padding: "14px" }}>
              <WaBubble
                msg={buildMsg(sample)}
                time="Now"
                isNew={false}
                operatorName={op}
              />
            </div>
          </div>
        )}

        <div style={{
          background: C.accentDim, border: `1px solid ${C.accentBorder}`,
          borderRadius: 12, padding: "10px 14px",
          fontSize: 12, color: C.textSub, marginBottom: 18,
        }}>
          Each sender gets their own — not a group broadcast.
        </div>

        <button
          onClick={sendAndDepart}
          disabled={loading}
          style={{
            width: "100%",
            background: loading ? C.border : `linear-gradient(135deg,${C.purple},#6D28D9)`,
            color: loading ? C.textDim : "#fff",
            border: "none", borderRadius: 16,
            padding: "18px 22px", fontSize: 16, fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans',sans-serif",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <span>{loading ? "Sending…" : `✈️ Send & Mark Departed`}</span>
          {!loading && <span>→</span>}
        </button>
      </div>
    </Modal>
  );
}
