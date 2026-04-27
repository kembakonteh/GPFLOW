import { useState } from "react";
import { C, KG_TO_LB } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import QRLabel from "../ui/QRLabel";
import type { Booking, Trip } from "../../types";

type State = "weigh" | "label";

interface Props {
  booking: Booking;
  trip: Trip;
  onClose: () => void;
  onDone: (updated: Booking) => void;
  onBack: () => void; // → return to WeighListModal
}

export default function WeighModal({ booking, trip, onClose, onDone, onBack }: Props) {
  const [state, setState] = useState<State>("weigh");
  const [lbs, setLbs] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedBooking, setUpdatedBooking] = useState<Booking>(booking);
  const [screenMode, setScreenMode] = useState(false);

  const rateLb = trip.rate_per_kg / KG_TO_LB;
  const lbsNum = parseFloat(lbs) || 0;
  const cost = (lbsNum * rateLb).toFixed(2);
  const currSym = trip.currency === "USD" ? "$" : trip.currency === "GBP" ? "£" : "€";

  async function confirmWeigh() {
    if (lbsNum <= 0 || loading) return;
    setLoading(true);
    try {
      const kg = lbsNum / KG_TO_LB;
      const { data } = await api.post<Booking>(`/bookings/${booking.id}/weigh`, {
        confirmed_weight_kg: kg,
      });
      setUpdatedBooking(data);
      setState("label");
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleScreen() {
    setScreenMode(true);
  }

  async function handleWhatsApp() {
    const fn = booking.sender_name.split(" ")[0];
    const recipient = booking.recipient_name;
    const city = booking.recipient_city;
    const ref = booking.reference_number;
    const op = trip.operator_business_name;
    const msg = encodeURIComponent(
      `Hi ${fn} 👋\nHere is the QR label for ${recipient}'s package 🏷️\n\nPlease forward this to ${recipient} in ${city} so they can show it when collecting. They'll need it to pick up the package.\n\nRef: ${ref}\n— ${op} via GPFLOW`
    );
    const phone = booking.sender_phone?.replace(/\D/g, "") ?? "";
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  }

  if (screenMode) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#fff", display: "flex", flexDirection: "column",
        alignItems: "center",
      }}>
        <div style={{
          background: "#000", color: "#fff", width: "100%",
          padding: "16px 20px", textAlign: "center",
          fontSize: 13, fontWeight: 700,
        }}>
          Hold up — sender photographs this label
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <QRLabel booking={updatedBooking} trip={trip} />
        </div>
        <button
          onClick={() => setScreenMode(false)}
          style={{
            width: "100%", maxWidth: 540,
            background: C.accent, color: "#07090F",
            fontSize: 15, fontWeight: 800,
            padding: "18px 22px", border: "none", cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          ✓ Sender Photographed It — Next Package
        </button>
      </div>
    );
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        {state === "weigh" ? (
          <>
            {/* Booking summary */}
            <div style={{ marginBottom: 18, paddingRight: 40 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: `linear-gradient(135deg,${C.gold},#D97706)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 900, color: "#07090F", flexShrink: 0,
                }}>
                  {booking.sender_name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{booking.sender_name}</div>
                  <div style={{ fontSize: 12, color: C.textSub }}>
                    {booking.item_description} → {booking.recipient_name}, {booking.recipient_city}
                  </div>
                </div>
              </div>
            </div>

            {/* Weight input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
                Actual Weight (lbs) — from scale
              </label>
              <input
                type="number"
                step="0.1"
                value={lbs}
                onChange={(e) => setLbs(e.target.value)}
                placeholder="0.0"
                autoFocus
                style={{
                  width: "100%",
                  background: "#0A0E1A",
                  border: `2px solid ${lbsNum > 0 ? C.gold : C.border}`,
                  borderRadius: 14, padding: "16px",
                  color: C.text, fontSize: 30, fontWeight: 800,
                  textAlign: "center", outline: "none",
                  fontFamily: "monospace",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
              />
            </div>

            {/* Live cost */}
            {lbsNum > 0 && (
              <div style={{
                background: C.goldDim, border: `1px solid ${C.goldBorder}`,
                borderRadius: 14, padding: "16px", marginBottom: 18,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: C.textSub }}>{lbsNum}lbs × {currSym}{rateLb.toFixed(2)}/lb</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: C.gold }}>{currSym}{cost}</span>
                </div>
                <div style={{ fontSize: 11, color: C.textSub }}>
                  = {(lbsNum / KG_TO_LB).toFixed(2)}kg
                </div>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={confirmWeigh}
              disabled={lbsNum <= 0 || loading}
              style={{
                width: "100%",
                background: lbsNum > 0 ? C.gold : C.border,
                color: lbsNum > 0 ? "#07090F" : C.textDim,
                border: "none", borderRadius: 16,
                padding: "16px 20px", fontSize: 15, fontWeight: 900,
                cursor: lbsNum > 0 ? "pointer" : "not-allowed",
                fontFamily: "'DM Sans',sans-serif",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <span>{loading ? "Saving…" : `Confirm ${lbsNum > 0 ? lbsNum : ""}lbs · ${currSym}${cost} → Get QR Label`}</span>
              {!loading && <span>→</span>}
            </button>
          </>
        ) : (
          <>
            {/* Label state */}
            <div style={{ textAlign: "center", marginBottom: 8, paddingRight: 40 }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>🏷️ QR Label Ready</div>
            </div>

            {/* Label preview */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <div style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.5)", borderRadius: 14 }}>
                <QRLabel booking={updatedBooking} trip={trip} />
              </div>
            </div>

            {/* 3 options */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {/* Print */}
              <button
                onClick={handlePrint}
                style={optBtn(C.teal)}
              >
                <span>🖨️ Print Label</span>
                <span style={{ fontSize: 12, color: C.textSub }}>Send to printer</span>
              </button>

              {/* Show on screen */}
              <button
                onClick={handleScreen}
                style={optBtn(C.blue)}
              >
                <span>📱 Show on Screen</span>
                <span style={{ fontSize: 12, color: C.textSub }}>Sender photographs label</span>
              </button>

              {/* WhatsApp */}
              <button
                onClick={handleWhatsApp}
                style={optBtn("#25D366")}
              >
                <span>📲 Send to WhatsApp</span>
                <span style={{ fontSize: 12, color: C.textSub }}>
                  Sent to {booking.sender_name.split(" ")[0]} with instructions to forward to {booking.recipient_name} in {booking.recipient_city}
                </span>
              </button>
            </div>

            {/* No printer note */}
            <div style={{
              background: C.card2, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "12px 14px", marginBottom: 16,
              fontSize: 11, color: C.textSub, lineHeight: 1.7,
            }}>
              No printer? Use <strong style={{ color: C.text }}>Show on Screen</strong> — sender photographs and forwards to recipient in Gambia. Or <strong style={{ color: C.text }}>Send to WhatsApp</strong>. Reference <code style={{ color: C.teal, fontFamily: "monospace" }}>{booking.reference_number}</code> also works at collection.
            </div>

            {/* Done button */}
            <button
              onClick={() => { onDone(updatedBooking); onBack(); }}
              style={{
                width: "100%",
                background: `linear-gradient(135deg,${C.accent},#00A87A)`,
                color: "#07090F", border: "none", borderRadius: 16,
                padding: "16px 20px", fontSize: 15, fontWeight: 900,
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <span>✓ Done — Next Package</span>
              <span>→</span>
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function optBtn(color: string): React.CSSProperties {
  return {
    width: "100%",
    background: C.card2,
    border: `1px solid ${color}`,
    borderRadius: 14,
    padding: "14px 16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 4,
    textAlign: "left",
    fontFamily: "'DM Sans',sans-serif",
    color: C.text,
    fontSize: 14,
    fontWeight: 700,
  };
}
