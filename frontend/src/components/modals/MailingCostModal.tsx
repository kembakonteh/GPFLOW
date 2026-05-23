import { useState } from "react";
import { C, KG_TO_LB } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import type { Booking, Trip } from "../../types";

interface Props {
  booking: Booking;
  trip: Trip;
  onClose: () => void;
  onSaved: (updated: Booking) => void;
}

export default function MailingCostModal({ booking, trip, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const amtNum  = parseFloat(amount) || 0;
  const canSave = amtNum > 0 && !loading;

  const estimate =
    booking.confirmed_weight_kg != null && (trip.domestic_mailing_rate_per_lb ?? 0) > 0
      ? (Number(booking.confirmed_weight_kg) * KG_TO_LB * trip.domestic_mailing_rate_per_lb!).toFixed(2)
      : null;

  async function save() {
    if (!canSave) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.patch<Booking>(`/bookings/${booking.id}/mailing-fee`, { mailing_fee: amtNum });
      onSaved(data);
      onClose();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to save — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        <div style={{ paddingRight: 40, marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>📬 Enter Mailing Cost</div>
          <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
            Enter the actual amount charged by USPS/UPS for {booking.recipient_name}'s package.
          </div>
        </div>

        <div style={{
          background: C.card2, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: "10px 14px", marginBottom: 16,
          fontSize: 12, color: C.textSub,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{booking.sender_name} → {booking.recipient_name}</span>
          <code style={{ fontFamily: "monospace", color: C.teal, fontSize: 11 }}>{booking.reference_number}</code>
        </div>

        {estimate && (
          <div style={{
            background: C.goldDim, border: `1px solid ${C.goldBorder}`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 14,
            fontSize: 12, color: C.gold,
          }}>
            💡 Estimated based on weight: <strong>${estimate}</strong> — adjust if different
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
            Actual USPS/UPS Amount (USD)
          </label>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              fontSize: 22, fontWeight: 700, color: C.textSub, pointerEvents: "none",
            }}>$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              style={{
                width: "100%",
                background: "#0A0E1A",
                border: `2px solid ${amtNum > 0 ? C.accent : C.border}`,
                borderRadius: 14, padding: "16px 16px 16px 38px",
                color: C.text, fontSize: 28, fontWeight: 800,
                outline: "none",
                fontFamily: "monospace",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
              }}
            />
          </div>
        </div>

        {error && (
          <div style={{
            background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 12,
            fontSize: 13, color: C.red,
          }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={save}
          disabled={!canSave}
          style={{
            width: "100%",
            background: canSave ? `linear-gradient(135deg,${C.accent},#00A87A)` : C.border,
            color: canSave ? "#07090F" : C.textDim,
            border: "none", borderRadius: 16,
            padding: "18px 22px", fontSize: 16, fontWeight: 900,
            cursor: canSave ? "pointer" : "not-allowed",
            fontFamily: "'DM Sans',sans-serif",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <span>{loading ? "Saving…" : `💾 Save $${amtNum > 0 ? amtNum.toFixed(2) : "0.00"} mailing cost`}</span>
          {!loading && <span>→</span>}
        </button>
      </div>
    </Modal>
  );
}
