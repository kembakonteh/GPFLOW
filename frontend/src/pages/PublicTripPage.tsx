import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { C } from "../lib/tokens";
import type { PublicTrip } from "../types";

function NavBar({ label }: { label: string }) {
  return (
    <div style={{
      background: "rgba(7,13,24,0.95)", backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${C.border}`, padding: "14px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky", top: 0, zIndex: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          background: `linear-gradient(135deg,${C.accent},#00A87A)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 900, color: "#07090F",
        }}>G</div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>GPFLOW</div>
      </div>
      <div style={{ fontSize: 11, color: C.textSub }}>{label}</div>
    </div>
  );
}

export default function PublicTripPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate  = useNavigate();

  const { data: trip, isLoading } = useQuery<PublicTrip>({
    queryKey: ["public-trip", slug],
    queryFn:  () => api.get(`/trips/public/${slug}`).then((r) => r.data),
    enabled:  !!slug,
  });

  if (isLoading) return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      <NavBar label="Loading…" />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 20px", textAlign: "center", color: C.textSub }}>Loading trip…</div>
    </div>
  );

  if (!trip) return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      <NavBar label="Not Found" />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Trip not found</div>
        <div style={{ color: C.textSub }}>This link may have expired or the trip has ended.</div>
      </div>
    </div>
  );

  const origin = `${trip.origin_city}, ${trip.origin_country}`;
  const dest   = `${trip.destination_city}, ${trip.destination_country}`;
  const departFmt = new Date(trip.departure_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const cutoffFmt = new Date(trip.cutoff_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const spotsLeft = trip.spots_remaining ?? 0;
  const cap       = (trip as any).capacity_kg ?? 0;
  const taken     = cap > 0 ? cap - spotsLeft : 0;

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: `linear-gradient(160deg,#060B14,#0A1220,#060B14)`, minHeight: "100vh", color: C.text }}>
      <NavBar label={`${trip.operator_name} · Trip Announcement`} />

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "28px 16px 60px" }}>
        {/* Operator card */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: "22px", marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: `linear-gradient(135deg,${C.accent},#00A87A)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, fontWeight: 900, color: "#07090F", flexShrink: 0,
            }}>
              {trip.operator_business_name.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{trip.operator_business_name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent }} />
                <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>Verified GP Operator</span>
              </div>
            </div>
          </div>

          {/* Announcement strip */}
          <div style={{
            background: C.accentDim, border: `1px solid ${C.accentBorder}`,
            borderRadius: 12, padding: "12px 16px", marginBottom: 18,
            fontSize: 13, lineHeight: 1.7,
          }}>
            GP leaving from <strong style={{ color: C.accent }}>{origin}</strong> to <strong style={{ color: C.accent }}>{dest}</strong> on {departFmt}. Drop off by <strong style={{ color: C.gold }}>{cutoffFmt}</strong>.
          </div>

          {/* Details grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
            {[
              { icon: "✈️", label: "Departs", value: departFmt },
              { icon: "📅", label: "Cutoff",  value: cutoffFmt },
              { icon: "💰", label: "Rate",    value: trip.rate_display },
            ].map(({ icon, label, value }) => (
              <div key={label} style={{
                background: C.card2, borderRadius: 12, padding: "12px",
                border: `1px solid ${C.border}`, textAlign: "center",
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Spots bar */}
          {cap > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.textSub, fontWeight: 600 }}>Availability</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{taken}/{cap}kg taken</span>
              </div>
              <div style={{ background: C.border, borderRadius: 4, height: 7 }}>
                <div style={{ width: `${Math.min((taken / cap) * 100, 100)}%`, background: `linear-gradient(90deg,${C.accent},#00A87A)`, height: "100%", borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 11, color: C.red, marginTop: 5, fontWeight: 600 }}>⚡ {spotsLeft}kg remaining</div>
            </div>
          )}

          {/* Accepted items chips */}
          {trip.accepted_item_types.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Accepting</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {trip.accepted_item_types.map((a) => (
                  <span key={a} style={{
                    background: C.card2, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 600,
                  }}>{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={() => navigate(`/trip/${slug}/book`)}
            style={{
              width: "100%",
              background: `linear-gradient(135deg,${C.accent},#00A87A)`,
              border: "none", borderRadius: 14, padding: "15px",
              color: "#07090F", fontSize: 15, fontWeight: 800, cursor: "pointer",
              boxShadow: `0 6px 24px ${C.accent}35`,
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            📦 Book My Spot Now
          </button>
        </div>

        {/* Trust strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            { icon: "📲", t: "Auto Updates",  s: "Every stage" },
            { icon: "⚖️", t: "We Weigh",      s: "At drop-off" },
            { icon: "🏷️", t: "Package Label", s: "On your item" },
          ].map(({ icon, t, s }) => (
            <div key={t} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "12px", textAlign: "center",
            }}>
              <div style={{ fontSize: 20, marginBottom: 5 }}>{icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{t}</div>
              <div style={{ fontSize: 9, color: C.textSub, marginTop: 2 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
