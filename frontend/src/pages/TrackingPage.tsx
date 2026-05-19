import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { C, KG_TO_LB } from "../lib/tokens";
import WaBubble from "../components/ui/WaBubble";
import QRCode from "../components/ui/QRCode";
import type { BookingTracking } from "../types";

// ── Status metadata ─────────────────────────────────────────────────────────
const STATUSES = [
  { key: "confirmed",  label: "Booking Confirmed",   short: "Confirmed",  color: C.blue,   icon: "📋", step: 1 },
  { key: "received",   label: "Item Received",        short: "Received",   color: C.gold,   icon: "📦", step: 2 },
  { key: "in_transit", label: "In Transit",           short: "In Transit", color: C.purple, icon: "✈️",  step: 3 },
  { key: "ready",      label: "Ready for Collection", short: "Ready",      color: C.orange, icon: "🔔", step: 4 },
  { key: "collected",  label: "Collected",            short: "Collected",  color: C.teal,   icon: "🤝", step: 5 },
  { key: "delivered",  label: "Delivered",            short: "Delivered",  color: C.accent, icon: "✅", step: 6 },
];

function buildWaMsg(status: string, b: BookingTracking, op: string): string {
  const fn = b.sender_first_name;
  switch (status) {
    case "confirmed":
      return `Hi ${fn} 👋\n\nYour booking with ${op} has been confirmed! ✅\n\n📋 Ref: ${b.reference_number}\n📦 Items: ${b.item_description}\n\nTrack your parcel:\n🔗 gpflow.app/track/${b.reference_number}\n\nYou'll receive WhatsApp updates at every stage automatically!\n\n— ${op} via GPFLOW`;
    case "received":
      return `Hi ${fn} 👋\n\nWe've received and weighed your item! ✅\n\n📋 Ref: ${b.reference_number}\n📦 Items: ${b.item_description}\n\nYour item is safely packed. QR label printed & attached.\n\n🔗 gpflow.app/track/${b.reference_number}\n\n— ${op} via GPFLOW`;
    case "in_transit":
      return `Hi ${fn} 👋\n\n✈️ We've departed! Your item is on its way.\n\n📋 Ref: ${b.reference_number}\n📦 For: ${b.recipient_city}\n\nAlhamdulillah — safe travels! 🙏\n\n🔗 gpflow.app/track/${b.reference_number}\n\n— ${op} via GPFLOW`;
    case "ready":
      return `Hi ${fn} 👋\n\n🇬🇲 Alhamdulillah, we've arrived!\n\nYour item is ready:\n\n📋 Ref: ${b.reference_number}\n📍 ${b.pickup_location ?? "Details sent separately"}\n📅 ${b.pickup_window ?? ""}\n\nBring your reference number when collecting.\n\n🔗 gpflow.app/track/${b.reference_number}\n\n— ${op} via GPFLOW`;
    case "collected":
      return `Hi ${fn} 👋\n\n🤝 Your item has been collected in ${b.recipient_city}!\n\n📋 Ref: ${b.reference_number} · ✅ Collected\n\nThank you for using ${op}. See you next trip! 🙏\n\n— ${op} via GPFLOW`;
    case "delivered":
      return `Hi ${fn} 👋\n\n✅ Your item has been delivered!\n\n📋 Ref: ${b.reference_number}\n📦 Items: ${b.item_description} · 🎉 Trip complete!\n\n— ${op} via GPFLOW`;
    default: return "";
  }
}

export default function TrackingPage() {
  const { ref }       = useParams<{ ref: string }>();
  const [activeTab, setActiveTab] = useState<"timeline" | "updates" | "details">("timeline");
  const msgEndRef = useRef<HTMLDivElement>(null);

  const { data: booking, isLoading } = useQuery<BookingTracking>({
    queryKey:        ["track", ref],
    queryFn:         () => api.get(`/bookings/track/${ref}`).then((r) => r.data),
    enabled:         !!ref,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (activeTab === "updates" && msgEndRef.current) {
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [booking?.status, activeTab]);

  if (isLoading) return (
    <Shell>
      <div style={{ textAlign: "center", padding: "60px 20px", color: C.textSub }}>Loading tracking info…</div>
    </Shell>
  );

  if (!booking) return (
    <Shell>
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Tracking not found</div>
        <div style={{ color: C.textSub }}>Check your reference number and try again.</div>
      </div>
    </Shell>
  );

  const cur     = STATUSES.find((s) => s.key === booking.status) ?? STATUSES[0];
  const history = STATUSES.filter((s) => s.step <= cur.step);
  const op      = booking.trip?.origin_city ? `${booking.trip.origin_city} Operator` : "Operator";

  const confKg  = (booking as any).confirmed_weight_kg as number | undefined;
  const confLbs = confKg != null ? (confKg * KG_TO_LB).toFixed(1) : null;
  const confCost = (booking as any).confirmed_cost_display as string | undefined;
  const weightConfirmed = confLbs != null;

  const originCity = booking.trip?.origin_city ?? "";
  const destCity   = booking.trip?.destination_city ?? "";

  return (
    <Shell>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 60px" }}>

        {/* Status hero */}
        <div style={{
          background: `linear-gradient(135deg,${cur.color}12,${C.card})`,
          border: `2px solid ${cur.color}35`,
          borderRadius: 22, padding: "22px 20px", marginBottom: 20,
          position: "relative", overflow: "hidden",
          boxShadow: `0 0 60px ${cur.color}18`,
        }}>
          <div style={{
            position: "absolute", top: -50, right: -50, width: 160, height: 160, borderRadius: "50%",
            background: `radial-gradient(circle,${cur.color}18,transparent 70%)`, pointerEvents: "none",
          }} />

          <div style={{ marginBottom: 16 }}>
            <code style={{ fontSize: 12, color: C.textSub, fontFamily: "monospace" }}>{booking.reference_number}</code>
            <div style={{ fontSize: 26, fontWeight: 800, color: cur.color, marginTop: 4 }}>{cur.icon} {cur.label}</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>
              {booking.sender_first_name} → {booking.recipient_city}
            </div>
          </div>

          {/* Weight/cost pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {weightConfirmed ? (
              <>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 10, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: C.accent,
                }}>{confLbs}lbs ✓</span>
                {confCost && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                    borderRadius: 10, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: C.accent,
                  }}>{confCost} ✓ final</span>
                )}
              </>
            ) : (
              <div style={{
                background: C.goldDim, border: `1px solid ${C.goldBorder}`,
                borderRadius: 10, padding: "8px 12px",
                fontSize: 12, color: C.gold,
              }}>⚖️ Cost confirmed at drop-off</div>
            )}
          </div>

          {/* 5-step progress dots */}
          <div style={{ display: "flex", alignItems: "center" }}>
            {STATUSES.map((s, i) => {
              const done = s.step <= cur.step;
              const isCur = s.key === booking.status;
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", flex: i < STATUSES.length - 1 ? 1 : "none" }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: done ? s.color : C.border,
                    color: done ? "#07090F" : C.textDim,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 800, flexShrink: 0,
                    boxShadow: isCur ? `0 0 12px ${s.color}90` : "none",
                    transition: "all 0.5s",
                  }}>{done ? "✓" : i + 1}</div>
                  {i < STATUSES.length - 1 && (
                    <div style={{ flex: 1, height: 3, background: done && s.step < cur.step ? s.color : C.border, transition: "background 0.5s" }} />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", marginTop: 5 }}>
            {STATUSES.map((s) => (
              <div key={s.key} style={{
                flex: 1, textAlign: "center", fontSize: 8,
                color: s.key === booking.status ? s.color : C.textDim,
                fontWeight: s.key === booking.status ? 800 : 400,
                letterSpacing: "0.02em",
              }}>{s.short}</div>
            ))}
          </div>

          {/* Ready callout + QR code for recipient */}
          {booking.status === "ready" && (
            <div style={{ marginTop: 16 }}>
              {/* QR code — show prominently so recipient can show it when collecting */}
              <a
                href={`${window.location.origin}/track/${booking.reference_number}`}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "none", display: "block", marginBottom: 12 }}
              >
                <div style={{
                  background: "#fff", borderRadius: 16, padding: "20px 16px 16px",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  boxShadow: `0 0 0 3px ${C.orange}`,
                  cursor: "pointer",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#07090F", marginBottom: 12, textAlign: "center", letterSpacing: "0.04em" }}>
                    🔔 SHOW THIS QR CODE WHEN COLLECTING
                  </div>
                  <QRCode
                    value={`${window.location.origin}/track/${booking.reference_number}`}
                    size={200}
                    color="#07090F"
                    bg="#ffffff"
                  />
                  <div style={{ marginTop: 12, fontFamily: "monospace", fontSize: 15, fontWeight: 800, color: "#07090F", letterSpacing: "0.1em" }}>
                    {booking.reference_number}
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                    {booking.recipient_city} — {booking.item_description}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: C.orange, fontWeight: 700 }}>
                    Tap to open →
                  </div>
                </div>
              </a>

              {/* Pickup details */}
              {booking.pickup_location && (
                <div style={{
                  background: C.orangeDim, border: `1px solid ${C.orangeBorder}`,
                  borderRadius: 12, padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.orange, marginBottom: 8 }}>📍 Collection details</div>
                  <div style={{ fontSize: 13, color: C.text }}>📍 {booking.pickup_location}</div>
                  {booking.pickup_window && <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>📅 {booking.pickup_window}</div>}
                  <div style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>
                    Ref: <code style={{ fontFamily: "monospace", color: C.orange, fontWeight: 700 }}>{booking.reference_number}</code>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Delivered */}
          {["collected", "delivered"].includes(booking.status) && (
            <div style={{
              marginTop: 14, background: C.accentDim, border: `1px solid ${C.accentBorder}`,
              borderRadius: 12, padding: "12px 16px", fontSize: 14, fontWeight: 700, color: C.accent, textAlign: "center",
            }}>
              {booking.status === "delivered" ? "🎉 Delivered! Alhamdulillah 🙏" : "🤝 Collected! Alhamdulillah 🙏"}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 5, marginBottom: 16,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: 5,
        }}>
          {([
            { k: "timeline", l: "📍 Timeline" },
            { k: "updates",  l: `💬 Updates (${history.length})` },
            { k: "details",  l: "📦 Details" },
          ] as const).map(({ k, l }) => (
            <button
              key={k}
              onClick={() => setActiveTab(k)}
              style={{
                flex: 1, background: activeTab === k ? cur.color : "transparent",
                border: "none", borderRadius: 10, padding: "8px 6px",
                color: activeTab === k ? "#07090F" : C.textSub,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "'DM Sans',sans-serif",
              }}
            >{l}</button>
          ))}
        </div>

        {/* ── TIMELINE ── */}
        {activeTab === "timeline" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: "22px 20px" }}>
            <div style={{ fontSize: 12, color: C.textSub, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>
              Journey Timeline
            </div>
            {STATUSES.map((s, i) => {
              const done = s.step <= cur.step;
              const isCur = s.key === booking.status;
              const event = booking.timeline?.find((e) => e.status === s.key);
              return (
                <div key={s.key} style={{ display: "flex", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: done ? s.color : C.border,
                      color: done ? "#07090F" : C.textDim,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: done ? 15 : 12, fontWeight: 800, flexShrink: 0,
                      boxShadow: isCur ? `0 0 18px ${s.color}70` : "none",
                      transition: "all 0.5s",
                    }}>{done ? "✓" : i + 1}</div>
                    {i < STATUSES.length - 1 && (
                      <div style={{ width: 2, height: 36, background: done && s.step < cur.step ? s.color : C.border, transition: "background 0.5s" }} />
                    )}
                  </div>
                  <div style={{ paddingTop: 6, paddingBottom: i < STATUSES.length - 1 ? 16 : 0, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontSize: 14, fontWeight: isCur ? 800 : 600, color: isCur ? s.color : done ? C.text : C.textDim, transition: "color 0.4s" }}>
                        {s.label}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0, marginLeft: 10 }}>
                        {event?.occurred_at && (
                          <span style={{ fontSize: 10, color: C.textDim }}>
                            {new Date(event.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {isCur && (
                          <span style={{
                            background: `${s.color}20`, border: `1px solid ${s.color}40`,
                            borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: s.color,
                          }}>NOW</span>
                        )}
                      </div>
                    </div>
                    {/* Weight/cost badges on received step */}
                    {s.key === "received" && done && weightConfirmed && (
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                          borderRadius: 10, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: C.accent,
                        }}>{confLbs}lbs ✓</span>
                        {confCost && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                            borderRadius: 10, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: C.accent,
                          }}>{confCost} ✓ final</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── UPDATES (WhatsApp) ── */}
        {activeTab === "updates" && (
          <div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden" }}>
              <div style={{
                background: "#0A0E18", padding: "13px 16px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: `linear-gradient(135deg,${C.accent},#00A87A)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 17, fontWeight: 900, color: "#07090F",
                }}>G</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>GP Operator</div>
                  <div style={{ fontSize: 11, color: C.accent }}>● GPFLOW · {history.length} update{history.length !== 1 ? "s" : ""}</div>
                </div>
              </div>
              <div style={{ padding: "16px", background: "#070C16", maxHeight: 480, overflowY: "auto" }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <span style={{
                    background: C.card2, borderRadius: 20, padding: "3px 12px",
                    fontSize: 10, color: C.textSub, fontWeight: 600,
                  }}>
                    {originCity} → {destCity}
                  </span>
                </div>
                {history.map((s, i) => (
                  <div key={s.key}>
                    <div style={{ textAlign: "center", marginBottom: 10, marginTop: i > 0 ? 18 : 0 }}>
                      <span style={{
                        background: `${s.color}18`, border: `1px solid ${s.color}25`,
                        borderRadius: 20, padding: "3px 12px", fontSize: 10, color: s.color, fontWeight: 700,
                      }}>
                        {s.icon} {s.label}
                      </span>
                    </div>
                    <WaBubble
                      msg={buildWaMsg(s.key, booking, op)}
                      time={(() => {
                        const ev = booking.timeline?.find((e) => e.status === s.key);
                        return ev?.occurred_at
                          ? new Date(ev.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "Now";
                      })()}
                      isNew={i === history.length - 1}
                      operatorName="GP Operator"
                    />
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>
              {/* Read-only input bar */}
              <div style={{
                background: "#0A0E18", padding: "11px 14px",
                borderTop: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  flex: 1, background: C.card2, borderRadius: 20,
                  padding: "8px 14px", fontSize: 12, color: C.textDim,
                }}>Updates sent automatically by GPFLOW</div>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                }}>🔔</div>
              </div>
            </div>
          </div>
        )}

        {/* ── DETAILS ── */}
        {activeTab === "details" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: "20px 22px" }}>
              <div style={{ fontSize: 11, color: C.textSub, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Your Item</div>
              <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{booking.item_description}</div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>To: {booking.recipient_city}</div>
              </div>
              <div style={{ marginTop: 14, padding: "14px", background: "#0A0E1A", borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Weight & Cost</div>
                {weightConfirmed ? (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span style={{
                      background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                      borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: C.accent,
                    }}>{confLbs}lbs ✓</span>
                    {confCost && (
                      <span style={{
                        background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                        borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: C.accent,
                      }}>{confCost} ✓ final</span>
                    )}
                  </div>
                ) : (
                  <div style={{
                    background: C.goldDim, border: `1px solid ${C.goldBorder}`,
                    borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.gold,
                  }}>⚖️ Not yet weighed. Final cost confirmed at drop-off.</div>
                )}
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: "20px 22px" }}>
              <div style={{ fontSize: 11, color: C.textSub, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Trip & Operator</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { l: "Route",     v: `${originCity} → ${destCity}` },
                  { l: "Departed",  v: booking.trip?.departure_date ?? "—" },
                  { l: "Recipient", v: booking.recipient_city },
                  { l: "Status",    v: cur.label },
                ].map(({ l, v }) => (
                  <div key={l}>
                    <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: `linear-gradient(160deg,#060B14,#0A1220,#060B14)`, minHeight: "100vh", color: C.text }}>
      <div style={{
        background: "rgba(7,13,24,0.95)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`, padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 10,
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          background: `linear-gradient(135deg,${C.accent},#00A87A)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 900, color: "#07090F",
        }}>G</div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>GPFLOW</div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: C.textSub }}>Track Parcel</div>
      </div>
      {children}
    </div>
  );
}
