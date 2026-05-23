import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, clearTokens } from "../lib/api";
import { C, KG_TO_LB } from "../lib/tokens";
import Toast, { useToast } from "../components/ui/Toast";
import ProgressBar from "../components/ui/ProgressBar";
import BigBtn from "../components/ui/BigBtn";
import InstallPrompt from "../components/ui/InstallPrompt";
import TripSetupModal from "../components/modals/TripSetupModal";
import WeighListModal from "../components/modals/WeighListModal";
import DepartedModal from "../components/modals/DepartedModal";
import CutoffModal from "../components/modals/CutoffModal";
import ArrivedModal from "../components/modals/ArrivedModal";
import ScanModal from "../components/modals/ScanModal";
import type { Booking, Operator, Trip, TripAnnouncement } from "../types";

// ── Types ──────────────────────────────────────────────────────────────────
type UIStage =
  | "draft"
  | "announced"
  | "dropoff"
  | "dropoff_done"
  | "departed"
  | "arrived"
  | "complete";

type ModalKey =
  | "tripSetup"
  | "weighList"
  | "walkIn"
  | "departed"
  | "cutoff"
  | "arrived"
  | "scan"
  | null;

// ── Stage derivation ───────────────────────────────────────────────────────
function deriveStage(trip: Trip | null, bookings: Booking[]): UIStage {
  if (!trip) return "draft";
  const total   = bookings.length;
  const weighed = bookings.filter((b) => b.confirmed_weight_kg != null).length;
  switch (trip.status) {
    case "draft":      return "draft";
    case "open":
      if (total === 0 || weighed === 0) return "announced";
      return "dropoff"; // stay on dropoff until operator explicitly departs
    case "closed":     return "dropoff_done";
    case "in_transit": return "departed";
    case "arrived":    return "arrived";
    case "completed":  return "complete";
    default:           return "draft";
  }
}

const stageColor: Record<UIStage, string> = {
  draft:        C.blue,
  announced:    C.accent,
  dropoff:      C.gold,
  dropoff_done: C.gold,
  departed:     C.purple,
  arrived:      C.orange,
  complete:     C.accent,
};

export default function DashboardPage() {
  const qc                        = useQueryClient();
  const { toasts, fire, dismiss } = useToast();
  const [modal, setModal]         = useState<ModalKey>(null);
  const [cutoffSent, setCutoffSent] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [annCopied, setAnnCopied] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────
  const { data: operator } = useQuery<Operator>({
    queryKey: ["operator", "me"],
    queryFn:  () => api.get("/operators/me").then((r) => r.data),
  });

  const { data: trips = [] } = useQuery<Trip[]>({
    queryKey: ["trips"],
    queryFn:  () => api.get("/trips").then((r) => r.data),
  });

  const trip = trips.find((t) => t.status !== "completed") ?? trips[0] ?? null;

  const { data: bookings = [], refetch: refetchBookings } = useQuery<Booking[]>({
    queryKey: ["bookings", trip?.id],
    queryFn:  () => api.get(`/bookings?trip_id=${trip!.id}&limit=200`).then((r) => r.data),
    enabled:  !!trip?.id,
  });

  const { data: announcement } = useQuery<TripAnnouncement>({
    queryKey: ["announcement", trip?.id],
    queryFn:  () => api.get(`/trips/${trip!.id}/announcement`).then((r) => r.data),
    enabled:  showAnnouncement && !!trip?.id,
    staleTime: 5 * 60 * 1000,
  });

  const stage      = deriveStage(trip, bookings);
  const color      = stageColor[stage];
  const weighed    = bookings.filter((b) => b.confirmed_weight_kg != null);
  const pending    = bookings.filter((b) => b.confirmed_weight_kg == null);
  const delivered  = bookings.filter((b) => ["collected", "delivered"].includes(b.status));
  const heldOver   = bookings.filter((b) => b.status === "held");
  const toDeliver  = bookings.filter((b) => !["collected", "delivered", "held"].includes(b.status));
  const total      = bookings.length;
  const cutoffFmt  = trip ? new Date(trip.cutoff_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const origin     = trip ? `${trip.origin_city}, ${trip.origin_country}` : "";
  const dest       = trip ? `${trip.destination_city}, ${trip.destination_country}` : "";

  const handleBookingUpdate = useCallback((updated: Booking) => {
    qc.setQueryData<Booking[]>(["bookings", trip?.id], (prev = []) => {
      const idx = prev.findIndex((b) => b.id === updated.id);
      if (idx === -1) return [...prev, updated];
      const next = [...prev]; next[idx] = updated; return next;
    });
  }, [trip?.id, qc]);

  const refetchTrips = () => qc.invalidateQueries({ queryKey: ["trips"] });

  async function togglePayment(b: Booking) {
    const next = b.payment_status === "paid" ? "unpaid" : "paid";
    try {
      const { data } = await api.patch<Booking>(`/bookings/${b.id}/payment`, { payment_status: next });
      handleBookingUpdate(data);
      fire(next === "paid" ? `💰 ${b.sender_name.split(" ")[0]} marked paid` : `↩ Marked unpaid`, next === "paid" ? C.gold : C.textSub);
    } catch { /* silent */ }
  }

  function logout() { clearTokens(); window.location.href = "/login"; }
  function closeModal() { setModal(null); }

  async function completeTrip() {
    if (!trip) return;
    try {
      await api.post(`/trips/${trip.id}/complete`);
      refetchTrips();
      fire("✅ Trip complete! Alhamdulillah 🙏", C.accent);
    } catch {
      fire("Could not complete trip — check all packages are handed over.", C.red ?? "#f43f5e");
    }
  }

  function downloadCSV() {
    if (!trip || bookings.length === 0) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["Ref #", "Sender", "Phone", "Recipient", "City", "Items", "Qty", "Weight (lbs)", "Weight (kg)", "Cost", "Payment", "Status"];
    const rows = bookings.map((b) => {
      const kg  = b.confirmed_weight_kg != null ? Number(b.confirmed_weight_kg) : null;
      const lbs = kg != null ? (kg * KG_TO_LB).toFixed(1) : "";
      const kgStr = kg != null ? kg.toFixed(2) : "";
      return [b.reference_number, b.sender_name, b.sender_phone, b.recipient_name,
              b.recipient_city, b.item_description, b.quantity, lbs, kgStr,
              b.confirmed_cost_display ?? "", b.payment_status, b.status];
    });
    const totalKg   = bookings.reduce((s, b) => s + (b.confirmed_weight_kg != null ? Number(b.confirmed_weight_kg) : 0), 0);
    const totalLbs  = (totalKg * KG_TO_LB).toFixed(1);
    const currSym   = trip.currency === "USD" ? "$" : trip.currency === "GBP" ? "£" : "€";
    const totalCost = bookings.reduce((s, b) => s + (b.confirmed_weight_kg != null ? Number(b.confirmed_weight_kg) * trip.rate_per_kg : 0), 0);
    const csv = [
      headers.map(esc).join(","),
      ...rows.map((r) => r.map(esc).join(",")),
      "",
      `"TOTAL","","","","","","","${totalLbs}","${totalKg.toFixed(2)}","${currSym}${totalCost.toFixed(2)}","",""`,
    ].join("\n");
    // UTF-8 BOM so Excel / Numbers opens it cleanly
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `gpflow-${trip.public_slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoke so iOS has time to read the blob before it's released
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>

      {/* Header */}
      <div style={{
        background: "rgba(7,13,24,0.95)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
        padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg,${C.accent},#00A87A)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, fontWeight: 900, color: "#07090F",
          }}>G</div>
          <span style={{ fontSize: 16, fontWeight: 800 }}>GPFLOW</span>
        </div>
        <button onClick={logout} style={{
          width: 36, height: 36, borderRadius: "50%",
          background: `linear-gradient(135deg,${C.accent},#00A87A)`,
          border: "none", cursor: "pointer",
          fontSize: 16, fontWeight: 900, color: "#07090F",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {operator?.name?.charAt(0)?.toUpperCase() ?? "A"}
        </button>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px 100px" }}>

        {/* ── Living Trip Card ── */}
        <div style={{
          background: `linear-gradient(135deg,${color}12,${C.card})`,
          border: `2px solid ${color}35`,
          borderRadius: 22, padding: "22px 20px", marginBottom: 20,
          position: "relative", overflow: "hidden",
          boxShadow: `0 0 60px ${color}18`,
        }}>
          <div style={{
            position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: "50%",
            background: `radial-gradient(circle,${color}20,transparent 70%)`, pointerEvents: "none",
          }} />

          {/* Badge */}
          <StageBadge stage={stage} color={color} />

          {/* Headline */}
          <div style={{ marginBottom: 18, marginTop: 10 }}>
            {stage === "draft" && <div style={{ fontSize: 22, fontWeight: 800 }}>Create your trip to get started</div>}
            {stage === "announced" && <>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{total} booking{total !== 1 ? "s" : ""} received</div>
              <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>Drop-off cutoff: {cutoffFmt}</div>
            </>}
            {stage === "dropoff" && <>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{weighed.length} of {total} weighed</div>
              <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>Tap whoever just walked in — any order.</div>
            </>}
            {stage === "dropoff_done" && <div style={{ fontSize: 22, fontWeight: 800 }}>All {total} packages weighed & labelled</div>}
            {stage === "departed" && <>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{total} packages on the way</div>
              <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>{origin} → {dest} · Alhamdulillah 🙏</div>
            </>}
            {stage === "arrived" && <>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {toDeliver.length === 0 ? "All packages handed over! 🙌" : `${toDeliver.length} of ${total} left to hand over`}
              </div>
              {heldOver.length > 0 && (
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>
                  📦 {heldOver.length} held over — not picked up yet
                </div>
              )}
              {trip?.pickup_location && (
                <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>
                  📍 {trip.pickup_location}{trip.pickup_window ? ` · 📅 ${trip.pickup_window}` : ""}
                </div>
              )}
              {trip?.arrival_notified_at && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  marginTop: 8, background: C.accentDim,
                  border: `1px solid ${C.accentBorder}`,
                  borderRadius: 8, padding: "4px 10px",
                  fontSize: 11, fontWeight: 700, color: C.accent,
                }}>
                  ✓ Customers Notified
                </div>
              )}
            </>}
            {stage === "complete" && <div style={{ fontSize: 22, fontWeight: 800 }}>Trip complete! Alhamdulillah 🙏</div>}
          </div>

          {/* Progress */}
          {stage === "dropoff" && (
            <div style={{ marginBottom: 18 }}>
              <ProgressBar done={weighed.length} total={total} color={C.gold} />
            </div>
          )}
          {stage === "arrived" && (
            <div style={{ marginBottom: 18 }}>
              <ProgressBar done={delivered.length} total={total} color={C.teal} />
            </div>
          )}

          {/* CTAs */}
          {stage === "draft" && (
            <BigBtn label="📣 Create & Announce Trip" color={`linear-gradient(135deg,${C.blue},#2563EB)`} onClick={() => setModal("tripSetup")} />
          )}
          {stage === "announced" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Booking link — tap to copy, tap again to open */}
              {trip && (
                <div style={{
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 14, padding: "12px 14px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                }}>
                  <a
                    href={`/trip/${trip.public_slug}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11, color: C.accent, fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}
                  >
                    /trip/{trip.public_slug}
                  </a>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/trip/${trip.public_slug}`;
                        navigator.clipboard.writeText(url);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      }}
                      style={{
                        background: linkCopied ? C.accent : "transparent",
                        border: `1px solid ${C.accentBorder}`,
                        borderRadius: 8, padding: "5px 10px",
                        color: linkCopied ? "#07090F" : C.accent,
                        fontSize: 11, fontWeight: 700, cursor: "pointer",
                        fontFamily: "'DM Sans',sans-serif",
                      }}
                    >
                      {linkCopied ? "Copied ✓" : "Copy"}
                    </button>
                    <a
                      href={`/trip/${trip.public_slug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        background: "transparent", border: `1px solid ${C.accentBorder}`,
                        borderRadius: 8, padding: "5px 10px",
                        color: C.accent, fontSize: 11, fontWeight: 700,
                        textDecoration: "none", display: "flex", alignItems: "center",
                      }}
                    >
                      Open ↗
                    </a>
                    <a
                      href={(() => {
                        const url = `${window.location.origin}/trip/${trip.public_slug}`;
                        const dep = new Date(trip.departure_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                        const msg =
                          `✈️ *${trip.operator_business_name}* — Banjul → ${trip.destination_city}\n\n` +
                          `📅 Departing: *${dep}*\n` +
                          `📦 Accepting: ${trip.accepted_item_types?.join(", ") || "All packages"}\n\n` +
                          `Book your spot here 👇\n${url}`;
                        return `https://wa.me/?text=${encodeURIComponent(msg)}`;
                      })()}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        background: "#25D366", border: "none",
                        borderRadius: 8, padding: "5px 10px",
                        color: "#fff", fontSize: 11, fontWeight: 700,
                        textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
                        whiteSpace: "nowrap",
                      }}
                    >
                      📲 Share
                    </a>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <BigBtn label="⚖️ Start Weighing" color={`linear-gradient(135deg,${C.gold},#D97706)`} onClick={() => setModal("weighList")} disabled={total === 0} />
                <button
                  onClick={() => setModal("walkIn")}
                  style={{
                    flexShrink: 0,
                    background: C.card2, border: `2px dashed ${C.accentBorder}`,
                    borderRadius: 16, padding: "14px 18px",
                    color: C.accent, fontSize: 13, fontWeight: 800,
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  ➕ Walk-in
                </button>
              </div>
              <button onClick={() => setModal("cutoff")} style={{
                background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "12px 16px",
                color: C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif", textAlign: "left",
              }}>
                {cutoffSent === 0
                  ? `📅 Send Cutoff Reminder — last day is ${cutoffFmt}`
                  : `📅 Send Cutoff Reminder Again (sent ${cutoffSent}×)`}
              </button>
            </div>
          )}
          {stage === "dropoff" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {pending.length > 0 ? (
                  <BigBtn label={`⚖️ Weigh Packages (${pending.length} left)`} color={`linear-gradient(135deg,${C.gold},#D97706)`} onClick={() => setModal("weighList")} />
                ) : (
                  <BigBtn label="⚖️ All Weighed ✓" color={`linear-gradient(135deg,${C.gold},#D97706)`} onClick={() => setModal("weighList")} />
                )}
                <button
                  onClick={() => setModal("walkIn")}
                  style={{
                    flexShrink: 0,
                    background: C.card2, border: `2px dashed ${C.accentBorder}`,
                    borderRadius: 16, padding: "14px 18px",
                    color: C.accent, fontSize: 13, fontWeight: 800,
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  ➕ Walk-in
                </button>
              </div>
              <BigBtn label="✈️ Mark as Departed" color={`linear-gradient(135deg,${C.purple},#6D28D9)`} onClick={() => setModal("departed")} />
            </div>
          )}
          {stage === "dropoff_done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <BigBtn label="✈️ Mark as Departed" color={`linear-gradient(135deg,${C.purple},#6D28D9)`} onClick={() => setModal("departed")} />
            </div>
          )}
          {stage === "departed" && (
            <BigBtn label="🇬🇲 We've Arrived!" color={`linear-gradient(135deg,${C.orange},#EA580C)`} onClick={() => setModal("arrived")} />
          )}
          {stage === "arrived" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {toDeliver.length > 0 ? (
                <BigBtn label={`🤝 Hand Over Packages (${toDeliver.length} left)`} color={`linear-gradient(135deg,${C.teal},#0891B2)`} onClick={() => setModal("scan")} />
              ) : (
                <>
                  <BigBtn label="✅ Complete Trip — All Handed Over" color={`linear-gradient(135deg,${C.accent},#00A87A)`} onClick={completeTrip} />
                  <button onClick={() => setShowReport(true)} style={{
                    background: "transparent", border: `1px solid ${C.border}`,
                    borderRadius: 14, padding: "12px 16px",
                    color: C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'DM Sans',sans-serif", textAlign: "left",
                  }}>📊 View Weight & Cost Report</button>
                </>
              )}
            </div>
          )}
          {stage === "complete" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <BigBtn label="+ Start Next Trip" color={`linear-gradient(135deg,${C.accent},#00A87A)`} onClick={() => setModal("tripSetup")} />
              <button onClick={() => setShowReport(true)} style={{
                background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "12px 16px",
                color: C.textSub, fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif", textAlign: "left",
              }}>📊 View Weight & Cost Report</button>
            </div>
          )}
        </div>

        {/* ── Drop-off Locations ── */}
        {trip && trip.drop_off_locations && trip.drop_off_locations.length > 0 && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: "16px 18px", marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              📍 Drop-off Locations
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {trip.drop_off_locations.map((loc) => (
                <div key={loc.id} style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>• {loc.label}</span>
                  {loc.address && <span style={{ color: C.textSub, fontSize: 12 }}> — {loc.address}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Share Trip Announcement ── */}
        {(stage === "announced" || stage === "dropoff") && trip && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowAnnouncement((v) => !v)}
              style={{
                width: "100%", background: C.card,
                border: `1px solid ${C.border}`, borderRadius: 14,
                padding: "13px 16px", cursor: "pointer",
                fontFamily: "'DM Sans',sans-serif",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>📢 Share Trip Announcement</span>
              <span style={{ fontSize: 12, color: C.textSub }}>{showAnnouncement ? "▲" : "▼"}</span>
            </button>

            {showAnnouncement && (
              <div style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderTop: "none", borderRadius: "0 0 14px 14px",
                padding: "14px 16px",
              }}>
                {announcement ? (
                  <>
                    <textarea
                      readOnly
                      value={announcement.whatsapp_message}
                      style={{
                        width: "100%", background: C.card2,
                        border: `1px solid ${C.border}`, borderRadius: 10,
                        padding: "12px 14px", color: C.text, fontSize: 12,
                        fontFamily: "monospace", lineHeight: 1.7,
                        resize: "none", outline: "none", boxSizing: "border-box",
                        minHeight: 180,
                      }}
                      rows={10}
                    />
                    <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(announcement.whatsapp_message);
                          setAnnCopied(true);
                          setTimeout(() => setAnnCopied(false), 2000);
                        }}
                        style={{
                          background: annCopied ? C.accent : C.accentDim,
                          border: `1px solid ${C.accentBorder}`,
                          borderRadius: 8, padding: "8px 16px",
                          color: annCopied ? "#07090F" : C.accent,
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                          fontFamily: "'DM Sans',sans-serif", flexShrink: 0,
                        }}
                      >
                        {annCopied ? "Copied ✓" : "📋 Copy Message"}
                      </button>
                      <span style={{ fontSize: 11, color: C.textDim }}>
                        Paste to WhatsApp Status or broadcast list
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: C.textSub, padding: "8px 0" }}>
                    Loading announcement…
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Empty state ── */}
        {stage === "announced" && total === 0 && (
          <div style={{
            textAlign: "center", padding: "36px 20px",
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 18, marginBottom: 20,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>No bookings yet</div>
            <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6 }}>
              Share your trip link so customers can book, or add a walk-in customer directly.
            </div>
          </div>
        )}

        {/* ── Booking List (announced / dropoff / dropoff_done) ── */}
        {(["announced", "dropoff", "dropoff_done"] as UIStage[]).includes(stage) && bookings.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
              Bookings ({total})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bookings.map((b) => {
                const isWeighed = b.packages.length > 0
                  ? b.packages.every((p) => p.weight_kg != null)
                  : b.confirmed_weight_kg != null;
                const lbs = b.confirmed_weight_kg != null
                  ? (Number(b.confirmed_weight_kg) * KG_TO_LB).toFixed(1)
                  : null;
                return (
                  <div key={b.id} style={{
                    background: C.card2, border: `1px solid ${C.border}`,
                    borderRadius: 14, padding: "13px 16px",
                    opacity: isWeighed ? 0.55 : 1, transition: "opacity 0.2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                        background: isWeighed ? C.accentDim : `linear-gradient(135deg,${C.gold},#D97706)`,
                        border: isWeighed ? `1px solid ${C.accentBorder}` : "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: isWeighed ? 14 : 15, fontWeight: 900,
                        color: isWeighed ? C.accent : "#07090F",
                      }}>
                        {isWeighed ? "✓" : b.sender_name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{b.sender_name}</div>
                        <div style={{ fontSize: 11, color: C.textSub, marginTop: 1 }}>{b.item_description} → {b.recipient_name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                          <code style={{ fontSize: 10, color: C.teal, fontFamily: "monospace" }}>{b.reference_number}</code>
                          {b.sender_phone && (
                            <a
                              href={`https://wa.me/${b.sender_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${b.sender_name.split(" ")[0]} 👋, just checking — are you still bringing your package today?`)}`}
                              style={{ fontSize: 10, color: C.textSub, textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}
                            >
                              📞 {b.sender_phone}
                            </a>
                          )}
                          {(b.mailing_fee_charged ?? 0) > 0 && (
                            <div style={{
                              display: "inline-flex", alignItems: "center",
                              background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                              borderRadius: 6, padding: "2px 7px",
                              fontSize: 10, fontWeight: 700, color: C.accent,
                            }}>
                              📬 +${Number(b.mailing_fee_charged).toFixed(2)} mailing
                            </div>
                          )}
                        </div>
                      </div>
                      {isWeighed && (
                        <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{b.confirmed_cost_display ?? ""}</div>
                          <div style={{ fontSize: 11, color: C.textSub }}>
                            {lbs}lbs{b.package_count > 1 ? ` · ${b.package_count} packages` : ""}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePayment(b); }}
                            style={{
                              background: b.payment_status === "paid" ? "rgba(0,212,160,0.12)" : "rgba(251,191,36,0.12)",
                              border: `1px solid ${b.payment_status === "paid" ? C.accentBorder : C.goldBorder}`,
                              borderRadius: 8, padding: "3px 8px",
                              fontSize: 10, fontWeight: 700,
                              color: b.payment_status === "paid" ? C.accent : C.gold,
                              cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                            }}
                          >
                            {b.payment_status === "paid" ? "✓ Paid" : "💰 Unpaid"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Delivery List (arrived) ── */}
        {stage === "arrived" && bookings.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {/* Pending */}
            {toDeliver.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                  Pending ({toDeliver.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {toDeliver.map((b) => (
                    <div key={b.id} style={{
                      background: C.card2, border: `1px solid ${C.tealBorder}`,
                      borderRadius: 14, padding: "13px 16px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                          background: C.tealDim, border: `1px solid ${C.tealBorder}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, fontWeight: 900, color: C.teal,
                        }}>
                          {b.recipient_name.charAt(0)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{b.recipient_name}</div>
                          <div style={{ fontSize: 11, color: C.textSub }}>{b.recipient_city} · from {b.sender_name}</div>
                          <code style={{ fontSize: 10, color: C.teal, fontFamily: "monospace" }}>{b.reference_number}</code>
                          {b.delivery_address_line1 && (
                            <div style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              background: "#0D1B2A", border: `1px solid ${C.border}`,
                              borderRadius: 6, padding: "2px 7px", marginTop: 4,
                              fontSize: 10, fontWeight: 700, color: C.textSub,
                            }}>
                              🚚 Delivery · {b.delivery_city || b.delivery_address_line1}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Handed over (dimmed) */}
            {delivered.length > 0 && (
              <div style={{ opacity: 0.45 }}>
                <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  ✓ Handed Over ({delivered.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {delivered.map((b) => (
                    <div key={b.id} style={{
                      background: C.card2, border: `1px solid ${C.border}`,
                      borderRadius: 12, padding: "10px 14px",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, color: C.accent, flexShrink: 0,
                      }}>✓</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{b.recipient_name}</div>
                        <div style={{ fontSize: 11, color: C.textSub }}>{b.recipient_city} · {b.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal === "tripSetup" && (
        <TripSetupModal
          operatorCity={operator?.city}
          onClose={closeModal}
          onCreated={(t) => {
            qc.setQueryData<Trip[]>(["trips"], (prev = []) => [t, ...prev]);
            fire("🚀 Trip published!", C.accent);
            closeModal();
          }}
        />
      )}
      {modal === "weighList" && trip && (
        <WeighListModal
          trip={trip}
          bookings={bookings}
          onClose={() => { closeModal(); refetchBookings(); }}
          onBookingUpdate={(b) => {
            handleBookingUpdate(b);
            fire(`⚖️ ${b.sender_name.split(" ")[0]} weighed`, C.gold);
          }}
        />
      )}
      {modal === "walkIn" && trip && (
        <WeighListModal
          trip={trip}
          bookings={bookings}
          initialView="walkin"
          onClose={() => { closeModal(); refetchBookings(); }}
          onBookingUpdate={(b) => {
            handleBookingUpdate(b);
            fire(`⚖️ ${b.sender_name.split(" ")[0]} weighed`, C.gold);
          }}
        />
      )}
      {modal === "departed" && trip && (
        <DepartedModal
          trip={trip}
          bookings={weighed}
          onClose={closeModal}
          onDeparted={() => { refetchTrips(); fire("✈️ Departed! Updates sent.", C.purple); closeModal(); }}
        />
      )}
      {modal === "cutoff" && trip && (
        <CutoffModal
          trip={trip}
          sendCount={cutoffSent}
          onClose={closeModal}
          onSent={() => { setCutoffSent((n) => n + 1); fire("📲 Reminder sent!", C.gold); closeModal(); }}
        />
      )}
      {modal === "arrived" && trip && (
        <ArrivedModal
          trip={trip}
          bookings={bookings}
          onClose={closeModal}
          onArrived={() => { refetchTrips(); fire("🇬🇲 Arrived! Senders notified.", C.orange); closeModal(); }}
        />
      )}
      {modal === "scan" && trip && (
        <ScanModal
          trip={trip}
          bookings={bookings}
          onClose={closeModal}
          onDelivered={(b) => {
            handleBookingUpdate(b);
            fire(`${b.status === "delivered" ? "✅ Delivered!" : "🤝 Collected!"} WhatsApp sent.`, b.status === "delivered" ? C.accent : C.teal);
            refetchBookings();
          }}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismiss} />
      <InstallPrompt />

      {/* ── In-app report overlay ── */}
      {showReport && trip && (
        <ReportOverlay
          trip={trip}
          bookings={bookings}
          onClose={() => setShowReport(false)}
          onDownload={downloadCSV}
        />
      )}
    </div>
  );
}

// ── In-app report overlay ────────────────────────────────────────────────────
function ReportOverlay({
  trip, bookings, onClose, onDownload,
}: {
  trip: Trip; bookings: Booking[];
  onClose: () => void; onDownload: () => void;
}) {
  const totalKg   = bookings.reduce((s, b) => s + (b.confirmed_weight_kg != null ? Number(b.confirmed_weight_kg) : 0), 0);
  const totalLbs  = (totalKg * KG_TO_LB).toFixed(1);
  const currSym   = trip.currency === "USD" ? "$" : trip.currency === "GBP" ? "£" : "€";
  const totalCost = bookings.reduce((s, b) => s + (b.confirmed_weight_kg != null ? Number(b.confirmed_weight_kg) * trip.rate_per_kg : 0), 0);
  const totalCostFmt = `${currSym}${totalCost.toFixed(2)}`;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.82)",
      display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans',sans-serif",
    }}>
      {/* Header bar */}
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.border}`,
        padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>📊 Weight & Cost Report</div>
          <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{trip.public_slug} · {bookings.length} packages</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={onDownload}
            style={{
              background: C.accentDim, border: `1px solid ${C.accentBorder}`,
              borderRadius: 10, padding: "8px 14px",
              color: C.accent, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            }}
          >
            ⬇ Download CSV
          </button>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: C.textSub, fontSize: 24, cursor: "pointer", lineHeight: 1, padding: 4 }}
          >×</button>
        </div>
      </div>

      {/* Scrollable table */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "16px 12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: C.text, minWidth: 500 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {["Ref #", "Sender", "Recipient", "City", "Items", "Qty", "lbs", "kg", "Cost", "Payment", "Status"].map((h) => (
                <th key={h} style={{
                  padding: "8px 10px", textAlign: "left",
                  fontSize: 10, fontWeight: 700, color: C.textSub,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bookings.map((b, i) => {
              const kg  = b.confirmed_weight_kg != null ? Number(b.confirmed_weight_kg) : null;
              const lbs = kg != null ? (kg * KG_TO_LB).toFixed(1) : "—";
              const kgStr = kg != null ? kg.toFixed(2) : "—";
              return (
                <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : C.card2 }}>
                  <td style={{ padding: "9px 10px", fontFamily: "monospace", fontSize: 11, color: C.teal, whiteSpace: "nowrap" }}>{b.reference_number}</td>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{b.sender_name}</td>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{b.recipient_name}</td>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{b.recipient_city}</td>
                  <td style={{ padding: "9px 10px" }}>{b.item_description}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center" }}>{b.quantity ?? "—"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700 }}>{lbs}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: C.textSub }}>{kgStr}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right", color: C.gold, fontWeight: 700 }}>{b.confirmed_cost_display ?? "—"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center" }}>
                    <span style={{
                      background: b.payment_status === "paid" ? "rgba(0,212,160,0.12)" : "rgba(251,191,36,0.12)",
                      border: `1px solid ${b.payment_status === "paid" ? C.accentBorder : C.goldBorder}`,
                      borderRadius: 8, padding: "2px 8px",
                      fontSize: 10, fontWeight: 700,
                      color: b.payment_status === "paid" ? C.accent : C.gold,
                    }}>{b.payment_status === "paid" ? "✓ Paid" : "Unpaid"}</span>
                  </td>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                    <span style={{
                      background: b.status === "delivered" ? C.accentDim : C.card2,
                      border: `1px solid ${b.status === "delivered" ? C.accentBorder : C.border}`,
                      borderRadius: 8, padding: "2px 8px",
                      fontSize: 10, fontWeight: 700,
                      color: b.status === "delivered" ? C.accent : C.textSub,
                    }}>{b.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.goldDim }}>
              <td colSpan={6} style={{ padding: "10px 10px", fontWeight: 800, fontSize: 12, color: C.gold }}>TOTAL</td>
              <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 900, color: C.gold }}>{totalLbs} lbs</td>
              <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 900, color: C.gold }}>{totalKg.toFixed(2)} kg</td>
              <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 900, color: C.gold }}>{totalCostFmt}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function StageBadge({ stage, color }: { stage: UIStage; color: string }) {
  const labels: Record<UIStage, string> = {
    draft:        "● Draft",
    announced:    "● Open for Bookings",
    dropoff:      "⚖️ Drop-off",
    dropoff_done: "✓ All Weighed",
    departed:     "✈️ In Transit",
    arrived:      "🇬🇲 Arrived",
    complete:     "✅ Complete",
  };
  return (
    <div style={{ display: "inline-flex" }}>
      <span style={{
        background: color + "22", border: `1px solid ${color}44`,
        borderRadius: 20, padding: "4px 12px",
        fontSize: 11, fontWeight: 800, color,
      }}>
        {labels[stage]}
      </span>
    </div>
  );
}
