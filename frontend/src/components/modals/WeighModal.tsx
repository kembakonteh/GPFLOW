import { useState } from "react";
import { C, KG_TO_LB } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import QRLabel from "../ui/QRLabel";
import type { Booking, BookingPackage, Trip } from "../../types";

type State = "weigh" | "label";

interface Props {
  booking: Booking;
  trip: Trip;
  onClose: () => void;
  onDone: (updated: Booking) => void;
  onBack: () => void;
}

export default function WeighModal({ booking, trip, onClose, onDone, onBack }: Props) {
  const isMulti = booking.packages.length > 1;

  // For multi-package: start on first unweighed package
  const firstUnweighedIdx = isMulti
    ? Math.max(0, booking.packages.findIndex((p) => p.weight_kg == null))
    : 0;

  const [pkgIdx,        setPkgIdx]        = useState(firstUnweighedIdx);
  const [state,         setState]         = useState<State>("weigh");
  const [lbs,           setLbs]           = useState("");
  const [loading,       setLoading]       = useState(false);
  const [latestBooking, setLatestBooking] = useState<Booking>(booking);
  const [screenMode,    setScreenMode]    = useState(false);
  const [error,         setError]         = useState("");

  const pkg: BookingPackage | undefined = latestBooking.packages[pkgIdx];
  const allWeighed = latestBooking.packages.every((p) => p.weight_kg != null);
  const isLastPkg  = pkgIdx === latestBooking.packages.length - 1 || allWeighed;

  const rateLb = trip.rate_per_kg / KG_TO_LB;
  const lbsNum = parseFloat(lbs) || 0;
  const cost   = (lbsNum * rateLb).toFixed(2);
  const currSym = trip.currency === "USD" ? "$" : trip.currency === "GBP" ? "£" : "€";

  // Running total of weighed packages in lbs
  const weighedLbs = latestBooking.packages
    .filter((p) => p.weight_kg != null)
    .reduce((s, p) => s + Number(p.weight_kg!) * KG_TO_LB, 0);

  async function confirmWeigh() {
    if (lbsNum <= 0 || loading) return;
    setLoading(true);
    setError("");
    try {
      const kg      = lbsNum / KG_TO_LB;
      const payload: Record<string, unknown> = { confirmed_weight_kg: kg };
      if (isMulti && pkg) payload.package_id = pkg.id;

      const { data } = await api.post<Booking>(`/bookings/${booking.id}/weigh`, payload);
      setLatestBooking(data);
      setState("label");
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to save weight — please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleNextPackage() {
    // Find next unweighed package after current
    const nextIdx = latestBooking.packages.findIndex(
      (p, i) => i > pkgIdx && p.weight_kg == null
    );
    if (nextIdx !== -1) {
      setPkgIdx(nextIdx);
      setLbs("");
      setState("weigh");
    } else {
      // All done
      onDone(latestBooking);
      onBack();
    }
  }

  function handleDone() {
    onDone(latestBooking);
    onBack();
  }

  // WhatsApp URL (single link for the booking, regardless of package count)
  const waHref = (() => {
    const b   = latestBooking;
    const fn  = b.sender_name.split(" ")[0];
    const ref = b.reference_number;
    const op  = trip.operator_business_name;
    const trackUrl = `${window.location.origin}/track/${ref}`;
    const msg = encodeURIComponent(
      `Hi ${fn} 👋\nHere is the tracking link for ${b.recipient_name}'s package 🏷️\n\n` +
      `📲 ${trackUrl}\n\n` +
      `Please forward this to ${b.recipient_name} in ${b.recipient_city} so they can track the package and show their reference number when collecting.\n\n` +
      `Ref: ${ref}\n— ${op} via GPFLOW`
    );
    return `https://wa.me/?text=${msg}`;
  })();

  if (screenMode && pkg) {
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
          Hold up — sender takes a screenshot of this label
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 20px 8px" }}>
          <QRLabel booking={latestBooking} trip={trip} pkg={isMulti ? pkg : undefined} />
        </div>
        <div style={{ display: "flex", gap: 0, width: "100%", maxWidth: 540, flexShrink: 0 }}>
          <button
            onClick={() => setScreenMode(false)}
            style={{
              flex: "0 0 56px",
              background: C.card2, color: C.textSub,
              fontSize: 20, fontWeight: 700,
              padding: "18px 0", border: "none", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif",
              borderRight: `1px solid ${C.border}`,
            }}
          >←</button>
          <button
            onClick={() => { setScreenMode(false); if (isLastPkg) handleDone(); else handleNextPackage(); }}
            style={{
              flex: 1,
              background: C.accent, color: "#07090F",
              fontSize: 15, fontWeight: 800,
              padding: "18px 22px", border: "none", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            {isLastPkg ? "✓ Done" : "✓ Next Package →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        {state === "weigh" ? (
          <>
            {/* Booking / package header */}
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
                  {isMulti && pkg && (
                    <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, marginTop: 3 }}>
                      Package {pkg.package_number} of {latestBooking.packages.length} — {pkg.package_reference}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Running total for multi-package */}
            {isMulti && weighedLbs > 0 && (
              <div style={{
                background: C.card2, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "8px 14px", marginBottom: 14,
                fontSize: 12, color: C.textSub,
                display: "flex", justifyContent: "space-between",
              }}>
                <span>Total so far</span>
                <span style={{ fontWeight: 700, color: C.text }}>{weighedLbs.toFixed(1)} lbs</span>
              </div>
            )}

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
                <div style={{ fontSize: 11, color: C.textSub }}>= {(lbsNum / KG_TO_LB).toFixed(2)}kg</div>
              </div>
            )}

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
              <span>{loading ? "Saving…" : `Confirm ${lbsNum > 0 ? lbsNum : ""}lbs · ${currSym}${cost} → Get Label`}</span>
              {!loading && <span>→</span>}
            </button>
          </>
        ) : (
          <>
            {/* Label state */}
            <div style={{ marginBottom: 14, paddingRight: 40 }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>🏷️ QR Label Ready</div>
              <div style={{ fontSize: 12, color: C.textSub }}>
                {latestBooking.sender_name} · {isMulti && pkg ? pkg.package_reference : latestBooking.reference_number}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              <button onClick={() => setScreenMode(true)} style={optBtn(C.blue)}>
                <span>📱 Show Label on Screen</span>
                <span style={{ fontSize: 12, color: C.textSub }}>Sender takes a screenshot for their records</span>
              </button>
              <a href={waHref} style={{ ...optBtn("#25D366"), textDecoration: "none" }}>
                <span>📲 Send via WhatsApp</span>
                <span style={{ fontSize: 12, color: C.textSub }}>
                  Sends tracking link to {booking.sender_name.split(" ")[0]}
                </span>
              </a>
              <button onClick={() => window.print()} style={optBtn(C.teal)}>
                <span>🖨️ Print Label</span>
                <span style={{ fontSize: 12, color: C.textSub }}>Send to printer</span>
              </button>
            </div>

            {/* Done / Next */}
            <button
              onClick={isLastPkg ? handleDone : handleNextPackage}
              style={{
                width: "100%",
                background: `linear-gradient(135deg,${C.accent},#00A87A)`,
                color: "#07090F", border: "none", borderRadius: 16,
                padding: "16px 20px", fontSize: 15, fontWeight: 900,
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <span>{isLastPkg ? "✓ Done" : "✓ Next Package →"}</span>
              <span>→</span>
            </button>

            {/* Label preview */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <div style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.5)", borderRadius: 14, transform: "scale(0.92)", transformOrigin: "top center" }}>
                <QRLabel booking={latestBooking} trip={trip} pkg={isMulti && pkg ? pkg : undefined} />
              </div>
            </div>
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
