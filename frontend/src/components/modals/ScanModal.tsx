import { useState } from "react";
import { C } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import WaBubble from "../ui/WaBubble";
import type { Booking, Trip } from "../../types";

type Step   = "find" | "done";
type Action = "collected" | "delivered" | "held";

interface Props {
  trip: Trip;
  bookings: Booking[];
  onClose: () => void;
  onDelivered: (b: Booking) => void;
}

export default function ScanModal({ trip, bookings, onClose, onDelivered }: Props) {
  const [step, setStep]       = useState<Step>("find");
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [action, setAction]   = useState<Action | null>(null);
  const [loading, setLoading] = useState(false);

  const pending = bookings.filter((b) => !["collected", "delivered", "held"].includes(b.status));
  const q = search.toLowerCase().trim();
  const filtered = q
    ? pending.filter((b) =>
        b.recipient_name.toLowerCase().includes(q) ||
        b.sender_name.toLowerCase().includes(q) ||
        b.reference_number.toLowerCase().includes(q) ||
        b.recipient_city.toLowerCase().includes(q) ||
        b.packages.some((p) => p.package_reference.toLowerCase().includes(q))
      )
    : pending;

  const op = trip.operator_business_name;

  async function confirm(act: Action) {
    if (!selected || loading) return;
    setLoading(true);
    try {
      const { data } = await api.patch<Booking>(`/bookings/${selected.id}/status`, { status: act });
      setAction(act);
      onDelivered(data);
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  function buildDoneMsg(b: Booking, act: Action): string {
    const senderFirst = b.sender_name.split(" ")[0];
    const emoji = act === "collected" ? "🤝" : "✅";
    return (
      `Hi ${senderFirst} 👋\n\n` +
      `${emoji} ${act === "collected" ? `${b.recipient_name} collected` : `Delivered to ${b.recipient_name}`} in ${b.recipient_city}!\n\n` +
      `Ref: ${b.reference_number}\n` +
      `Thank you 🙏 — ${op} via GPFLOW`
    );
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        {/* ── STEP 1: FIND ── */}
        {step === "find" && (
          <>
            <div style={{ marginBottom: 16, paddingRight: 40 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Who is collecting?</div>
              <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
                Search by name, city, or ref number — then tap a name to confirm handover.
              </div>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, city, or ref (GP-2026-XXXX)"
              autoFocus
              style={{
                width: "100%",
                background: C.card2,
                border: `1px solid ${C.accentBorder}`,
                borderRadius: 12, padding: "11px 14px",
                color: C.text, fontSize: 13, outline: "none",
                fontFamily: "'DM Sans',sans-serif",
                boxSizing: "border-box",
                marginBottom: 12,
              }}
            />

            {/* Booking list */}
            <div style={{ maxHeight: "50vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: "24px 0", color: C.textSub, fontSize: 13 }}>
                  <div style={{ marginBottom: 6 }}>No results{q ? ` for "${q}"` : ""}</div>
                  <div style={{ fontSize: 11, color: C.textDim }}>
                    Try the sender's name or ref # from their WhatsApp confirmation.
                  </div>
                </div>
              )}
              {filtered.map((b) => {
                const isSel = selected?.id === b.id;
                return (
                  <div key={b.id}>
                    {/* Booking row — tap to select */}
                    <div
                      onClick={() => setSelected(isSel ? null : b)}
                      style={{
                        background: isSel ? C.tealDim : C.card2,
                        border: `1px solid ${isSel ? C.teal : C.border}`,
                        borderRadius: isSel ? "14px 14px 0 0" : 14,
                        padding: "13px 16px", cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{b.recipient_name}</div>
                          <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                            {b.recipient_city} · from {b.sender_name}
                          </div>
                          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{b.item_description}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, marginLeft: 10 }}>
                          <code style={{ fontSize: 11, color: C.teal, fontFamily: "monospace", fontWeight: 700 }}>
                            {b.reference_number}
                          </code>
                          {isSel && (
                            <span style={{ fontSize: 10, color: C.teal, fontWeight: 700 }}>▲ confirm below</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Inline confirm buttons — only show for selected */}
                    {isSel && (
                      <div style={{
                        background: C.card, border: `1px solid ${C.teal}`,
                        borderTop: "none", borderRadius: "0 0 14px 14px",
                        padding: "14px 14px 14px",
                      }}>
                        <div style={{ fontSize: 11, color: C.textSub, marginBottom: 10, textAlign: "center" }}>
                          How was this package handed over?
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                          <button
                            onClick={() => confirm("collected")}
                            disabled={loading}
                            style={{
                              background: C.teal, border: "none", borderRadius: 12,
                              padding: "14px 10px", color: "#07090F",
                              fontSize: 13, fontWeight: 800, cursor: "pointer",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                              fontFamily: "'DM Sans',sans-serif",
                              opacity: loading ? 0.6 : 1,
                            }}
                          >
                            <span style={{ fontSize: 22 }}>🤝</span>
                            <span>Collected</span>
                            <span style={{ fontSize: 10, opacity: 0.8 }}>They picked it up</span>
                          </button>
                          <button
                            onClick={() => confirm("delivered")}
                            disabled={loading}
                            style={{
                              background: C.accent, border: "none", borderRadius: 12,
                              padding: "14px 10px", color: "#07090F",
                              fontSize: 13, fontWeight: 800, cursor: "pointer",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                              fontFamily: "'DM Sans',sans-serif",
                              opacity: loading ? 0.6 : 1,
                            }}
                          >
                            <span style={{ fontSize: 22 }}>✅</span>
                            <span>Delivered</span>
                            <span style={{ fontSize: 10, opacity: 0.8 }}>We dropped it off</span>
                          </button>
                        </div>
                        {/* Hold over — recipient didn't show up */}
                        <button
                          onClick={() => confirm("held")}
                          disabled={loading}
                          style={{
                            width: "100%",
                            background: "transparent",
                            border: `1px solid ${C.border}`,
                            borderRadius: 12, padding: "11px 14px",
                            color: C.textSub, fontSize: 12, fontWeight: 700,
                            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            opacity: loading ? 0.6 : 1,
                          }}
                        >
                          <span>📦</span>
                          <span>Not Here — Hold for Next Trip</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── STEP 2: DONE ── */}
        {step === "done" && selected && action && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>
              {action === "collected" ? "🤝" : action === "delivered" ? "✅" : "📦"}
            </div>
            <div style={{
              fontSize: 22, fontWeight: 800, marginBottom: 6,
              color: action === "collected" ? C.teal : action === "delivered" ? C.accent : C.textSub,
            }}>
              {action === "collected" ? "Collected!" : action === "delivered" ? "Delivered!" : "Held Over"}
            </div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 6 }}>
              {selected.recipient_name} · {selected.recipient_city}
            </div>
            {selected.package_count > 1 && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                borderRadius: 8, padding: "4px 12px", marginBottom: 14,
                fontSize: 12, fontWeight: 700, color: C.accent,
              }}>
                ✓ All {selected.package_count} packages {action === "held" ? "held" : action}
              </div>
            )}
            {selected.package_count === 1 && <div style={{ marginBottom: 14 }} />}

            {/* Held — show a note instead of WA confirmation */}
            {action === "held" ? (
              <div style={{
                background: C.card2, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "16px", marginBottom: 20, textAlign: "left",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📋 Package held in your possession</div>
                <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
                  Let <strong>{selected.sender_name}</strong> know that <strong>{selected.recipient_name}</strong> didn't come to collect. The package will be available on your next trip to {selected.recipient_city}.
                </div>
              </div>
            ) : (
              /* WA preview for collected / delivered */
              <div style={{
                background: "#070C16", border: `1px solid ${C.border}`,
                borderRadius: 14, padding: "14px", marginBottom: 20, textAlign: "left",
              }}>
                <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, marginBottom: 8 }}>
                  📲 Sent to {selected.sender_name}
                </div>
                <WaBubble
                  msg={buildDoneMsg(selected, action)}
                  time="Just now"
                  operatorName={op}
                />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => { setSelected(null); setAction(null); setStep("find"); setSearch(""); }}
                style={{
                  width: "100%",
                  background: C.card2, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: "12px",
                  color: C.text, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                }}
              >
                Next Package →
              </button>
              <button
                onClick={onClose}
                style={{
                  width: "100%",
                  background: `linear-gradient(135deg,${C.teal},#0891B2)`,
                  border: "none", borderRadius: 12, padding: "13px",
                  color: "#07090F", fontSize: 14, fontWeight: 800,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                }}
              >
                Done ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
