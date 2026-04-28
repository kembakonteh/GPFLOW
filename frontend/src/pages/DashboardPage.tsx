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
import type { Booking, Operator, Trip } from "../types";

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
      if (weighed < total)              return "dropoff";
      return "dropoff_done";
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

  const stage      = deriveStage(trip, bookings);
  const color      = stageColor[stage];
  const weighed    = bookings.filter((b) => b.confirmed_weight_kg != null);
  const pending    = bookings.filter((b) => b.confirmed_weight_kg == null);
  const delivered  = bookings.filter((b) => ["collected", "delivered"].includes(b.status));
  const toDeliver  = bookings.filter((b) => !["collected", "delivered"].includes(b.status));
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

  function logout() { clearTokens(); window.location.href = "/login"; }
  function closeModal() { setModal(null); }

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
              <div style={{ fontSize: 22, fontWeight: 800 }}>{toDeliver.length} packages to hand over</div>
              {trip?.pickup_location && (
                <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>
                  📍 {trip.pickup_location}{trip.pickup_window ? ` · 📅 ${trip.pickup_window}` : ""}
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
                  <code style={{ fontSize: 11, color: C.accent, fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    /trip/{trip.public_slug}
                  </code>
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
            <div style={{ display: "flex", gap: 10 }}>
              <BigBtn label={`⚖️ Weigh Packages (${pending.length} left)`} color={`linear-gradient(135deg,${C.gold},#D97706)`} onClick={() => setModal("weighList")} />
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
          )}
          {stage === "dropoff_done" && (
            <BigBtn label="✈️ We've Departed" color={`linear-gradient(135deg,${C.purple},#6D28D9)`} onClick={() => setModal("departed")} />
          )}
          {stage === "departed" && (
            <BigBtn label="🇬🇲 We've Arrived!" color={`linear-gradient(135deg,${C.orange},#EA580C)`} onClick={() => setModal("arrived")} />
          )}
          {stage === "arrived" && (
            <BigBtn label="📱 Scan to Deliver" color={`linear-gradient(135deg,${C.teal},#0891B2)`} onClick={() => setModal("scan")} />
          )}
          {stage === "complete" && (
            <BigBtn label="+ Start Next Trip" color={`linear-gradient(135deg,${C.accent},#00A87A)`} onClick={() => setModal("tripSetup")} />
          )}
        </div>

        {/* ── Booking List (announced / dropoff / dropoff_done) ── */}
        {(["announced", "dropoff", "dropoff_done"] as UIStage[]).includes(stage) && bookings.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
              Bookings ({total})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bookings.map((b) => {
                const isWeighed = b.confirmed_weight_kg != null;
                const lbs = isWeighed ? (Number(b.confirmed_weight_kg) * KG_TO_LB).toFixed(1) : null;
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
                        <code style={{ fontSize: 10, color: C.teal, fontFamily: "monospace" }}>{b.reference_number}</code>
                      </div>
                      {isWeighed && (
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{b.confirmed_cost_display ?? ""}</div>
                          <div style={{ fontSize: 11, color: C.textSub }}>{lbs}lbs</div>
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
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
              Deliveries ({total})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bookings.map((b) => {
                const done = ["collected", "delivered"].includes(b.status);
                return (
                  <div key={b.id} style={{
                    background: C.card2, border: `1px solid ${C.border}`,
                    borderRadius: 14, padding: "13px 16px", opacity: done ? 0.5 : 1,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                        background: done ? C.accentDim : C.tealDim,
                        border: `1px solid ${done ? C.accentBorder : C.tealBorder}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 900, color: done ? C.accent : C.teal,
                      }}>
                        {done ? "✅" : b.recipient_name.charAt(0)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{b.recipient_name}</div>
                        <div style={{ fontSize: 11, color: C.textSub }}>{b.recipient_city} · from {b.sender_name}</div>
                        <code style={{ fontSize: 10, color: C.teal, fontFamily: "monospace" }}>{b.reference_number}</code>
                      </div>
                      {done && <span style={{ fontSize: 11, color: C.accent, fontWeight: 700, flexShrink: 0 }}>✅ Done</span>}
                    </div>
                  </div>
                );
              })}
            </div>
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
    </div>
  );
}

function StageBadge({ stage, color }: { stage: UIStage; color: string }) {
  const labels: Record<UIStage, string> = {
    draft:        "● Draft",
    announced:    "● Open for Bookings",
    dropoff:      "⚖️ Drop-off Day",
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
