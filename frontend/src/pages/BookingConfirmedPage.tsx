import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { C } from "../lib/tokens";
import WaBubble from "../components/ui/WaBubble";
import type { BookingPublicResponse, PublicTrip } from "../types";

function formatAddress(b: BookingPublicResponse): string | null {
  if (!b.delivery_address_line1) return null;
  const parts = [b.delivery_address_line1];
  if (b.delivery_address_line2) parts.push(b.delivery_address_line2);
  const city = [b.delivery_city, b.delivery_state, b.delivery_zip].filter(Boolean).join(" ");
  if (city) parts.push(city);
  return parts.join(", ");
}

export default function BookingConfirmedPage() {
  useParams<{ reference: string }>();
  const { state }              = useLocation() as { state?: { booking: BookingPublicResponse; trip: PublicTrip } };
  const navigate               = useNavigate();
  const [msgVisible, setMsgVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setMsgVisible(true), 350);
  }, []);

  const booking = state?.booking;
  const trip    = state?.trip;

  if (!booking || !trip) {
    return (
      <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Booking not found</div>
          <button onClick={() => navigate("/")} style={{ marginTop: 16, background: C.accent, border: "none", borderRadius: 10, padding: "10px 20px", color: "#07090F", fontWeight: 700, cursor: "pointer" }}>Home</button>
        </div>
      </div>
    );
  }

  const origin  = `${trip.origin_city}, ${trip.origin_country}`;
  const dest    = `${trip.destination_city}, ${trip.destination_country}`;
  const op      = trip.operator_business_name;
  const cutoffFmt = new Date(trip.cutoff_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const ref     = booking.reference_number;
  const fn      = booking.sender_name.split(" ")[0];

  const waMsg =
    `Hi ${fn} 👋\n\nYour booking with ${op} has been confirmed! ✅\n\n` +
    `📋 Ref: ${ref}\n` +
    `📦 Items: ${booking.item_description}\n` +
    `✈️ ${origin} → ${dest}\n\n` +
    `Track your parcel:\n🔗 gpflow.app/track/${ref}\n\n` +
    `You'll receive WhatsApp updates at every stage automatically!\n\n` +
    `— ${op} via GPFLOW`;

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: `linear-gradient(160deg,#060B14,#0A1220,#060B14)`, minHeight: "100vh", color: C.text }}>
      {/* Header */}
      <div style={{
        background: "rgba(7,13,24,0.95)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`, padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.textSub, padding: "5px 12px",
            fontSize: 11, fontWeight: 600, cursor: "pointer", marginRight: 6,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >←</button>
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          background: `linear-gradient(135deg,${C.accent},#00A87A)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 900, color: "#07090F",
        }}>G</div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>GPFLOW</div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: C.textSub }}>Booking Confirmed</div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "28px 16px 60px" }}>
        {/* Success icon */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: C.accentDim, border: `2px solid ${C.accent}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 34, margin: "0 auto 18px",
            boxShadow: `0 0 32px ${C.accent}30`,
          }}>✅</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px" }}>You're booked!</h2>
          <p style={{ color: C.textSub, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Your spot is confirmed on {op}'s trip to {dest}.
          </p>
        </div>

        {/* Reference(s) */}
        <div style={{
          background: `linear-gradient(135deg,${C.accentDim},${C.card2})`,
          border: `1px solid ${C.accentBorder}`,
          borderRadius: 16, padding: "20px 24px", marginBottom: 18, textAlign: "center",
        }}>
          {booking.package_count > 1 ? (
            <>
              <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                Your Booking — {booking.package_count} Packages
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: C.accent, letterSpacing: "0.06em", marginBottom: 10 }}>{ref}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {booking.packages.map((pkg) => (
                  <div
                    key={pkg.package_reference}
                    style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: "8px 12px",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 11, color: C.textSub }}>Package {pkg.package_number}</span>
                    <code style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: C.teal }}>
                      {pkg.package_reference}
                    </code>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 10 }}>
                Each package gets its own QR label at drop-off
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Your Reference Number</div>
              <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 800, color: C.accent, letterSpacing: "0.08em" }}>{ref}</div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 8 }}>Tracking link included in your WhatsApp confirmation</div>
            </>
          )}
        </div>

        {/* Summary */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: "18px 20px", marginBottom: 18,
        }}>
          <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Booking Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            {[
              { l: "Sender",    v: booking.sender_name },
              { l: "Recipient", v: `${booking.recipient_name}, ${booking.recipient_city}` },
              { l: "Item",      v: booking.item_description },
              { l: "Route",     v: `${origin} → ${dest}` },
              { l: "Cutoff",    v: cutoffFmt },
            ].map(({ l, v }) => (
              <div key={l}>
                <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{
            background: C.goldDim, border: `1px solid ${C.goldBorder}`,
            borderRadius: 10, padding: "10px 14px",
            fontSize: 12, color: C.gold, display: "flex", gap: 8,
          }}>
            <span style={{ flexShrink: 0 }}>⚖️</span>
            <span>Cost confirmed when operator weighs package at drop-off.</span>
          </div>

          {/* Delivery address — shown when provided */}
          {formatAddress(booking) && (
            <div style={{
              marginTop: 14,
              background: C.card2, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                🚚 Delivery Address
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{formatAddress(booking)}</div>
              {booking.delivery_notes && (
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>{booking.delivery_notes}</div>
              )}
            </div>
          )}

          {/* Mailing address — shown for outbound trips when operator has one */}
          {trip.direction === "outbound" && trip.operator_mailing_address_line1 && (
            <div style={{
              marginTop: 14,
              background: C.accentDim, border: `1px solid ${C.accentBorder}`,
              borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                📬 Mail Your Package To
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.7 }}>
                {trip.operator_business_name}<br />
                {trip.operator_mailing_address_line1}
                {trip.operator_mailing_address_line2 && <><br />{trip.operator_mailing_address_line2}</>}
                <br />{trip.operator_mailing_city}, {trip.operator_mailing_state} {trip.operator_mailing_zip}
              </div>
              {trip.operator_mailing_instructions && (
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 6 }}>{trip.operator_mailing_instructions}</div>
              )}
            </div>
          )}
        </div>

        {/* WhatsApp preview */}
        <div style={{
          background: "#060D14", border: `1px solid ${C.border}`,
          borderRadius: 16, overflow: "hidden", marginBottom: 18,
        }}>
          <div style={{
            background: "#0A0E18", padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: `linear-gradient(135deg,${C.accent},#00A87A)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 900, color: "#07090F",
            }}>{op.charAt(0)}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{op}</div>
              <div style={{ fontSize: 10, color: C.accent }}>📲 Sending to {booking.sender_name}…</div>
            </div>
            <div style={{
              marginLeft: "auto",
              background: C.accentDim, border: `1px solid ${C.accentBorder}`,
              borderRadius: 8, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.accent,
            }}>JUST SENT</div>
          </div>
          <div style={{ padding: "14px", background: "#070C16" }}>
            <div style={{
              opacity: msgVisible ? 1 : 0,
              transform: msgVisible ? "none" : "translateY(10px)",
              transition: "all 0.5s ease",
            }}>
              <WaBubble msg={waMsg} time="Just now" isNew operatorName={op} />
            </div>
          </div>
        </div>

        {/* What happens next */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: "18px 20px", marginBottom: 22,
        }}>
          <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>What happens next</div>
          {/* Step 1 — Contact operator */}
          <div style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>📞</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Contact the operator</div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 2, marginBottom: 10 }}>
                Reach out to {op} to arrange your drop-off before {cutoffFmt}.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a
                  href={`https://wa.me/${trip.operator_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi, I just booked with ${op}. My ref is ${ref}. I'd like to arrange my drop-off.`)}`}
                  target="_blank" rel="noreferrer"
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: "#25D366", border: "none", borderRadius: 10, padding: "9px 12px",
                    color: "#07090F", fontSize: 12, fontWeight: 800, textDecoration: "none",
                  }}
                >
                  💬 WhatsApp
                </a>
                <a
                  href={`tel:${trip.operator_phone}`}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px",
                    color: C.text, fontSize: 12, fontWeight: 800, textDecoration: "none",
                  }}
                >
                  📞 Call
                </a>
              </div>
            </div>
          </div>

          {/* Steps 2 & 3 */}
          {[
            { icon: "⚖️", step: "Weighed at drop-off",   desc: "Operator weighs your item. Final cost locked and sent to you via WhatsApp." },
            { icon: "📲", step: "Automatic updates",     desc: "WhatsApp at every stage — Received, In Transit, Arrived, Delivered." },
          ].map(({ icon, step, desc }, i) => (
            <div key={i} style={{
              display: "flex", gap: 14, padding: "10px 0",
              borderBottom: i === 0 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{step}</div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Track CTA */}
        <button
          onClick={() => navigate(`/track/${ref}`)}
          style={{
            width: "100%",
            background: `linear-gradient(135deg,${C.accent},#00A87A)`,
            border: "none", borderRadius: 14, padding: "14px",
            color: "#07090F", fontSize: 14, fontWeight: 800, cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif",
            boxShadow: `0 6px 24px ${C.accent}35`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          🔗 Track My Package →
        </button>
      </div>
    </div>
  );
}
