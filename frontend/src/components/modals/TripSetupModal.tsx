import { useState } from "react";
import { C } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import type { Trip } from "../../types";

const ITEM_TYPES = ["👕 Clothes", "💊 Medicine", "📱 Electronics", "📄 Documents", "👟 Shoes", "🍼 Baby Items", "🍲 Food", "💼 Other"];
const CURRENCIES = ["USD", "GBP", "EUR"];

interface Props {
  operatorCity?: string;
  onClose: () => void;
  onCreated: (trip: Trip) => void;
}

export default function TripSetupModal({ operatorCity = "Your City", onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"outbound" | "inbound" | null>(null);
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [cutoffDate, setCutoffDate] = useState("");
  const [itemTypes, setItemTypes] = useState<string[]>([]);
  const [rateLb, setRateLb] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const rateLbNum = parseFloat(rateLb) || 0;
  const slug = `trip-${Date.now()}`;

  function pickDirection(dir: "outbound" | "inbound") {
    setDirection(dir);
    if (dir === "outbound") {
      setOrigin(operatorCity);
      setDest("Banjul, Gambia");
    } else {
      setOrigin("Banjul, Gambia");
      setDest(operatorCity);
    }
  }

  function toggleItem(item: string) {
    setItemTypes((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  }

  async function publish() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const ratePerKg = rateLbNum * 2.20462; // convert lb rate → kg rate
      const originCity = origin.split(",")[0].trim();
      const destCity   = dest.split(",")[0].trim();
      // Always use 2-char ISO codes based on direction
      const originCountry = direction === "inbound"  ? "GM" : "US";
      const destCountry   = direction === "inbound"  ? "US" : "GM";
      const { data } = await api.post<Trip>("/trips", {
        direction: direction ?? "outbound",
        origin_city: originCity,
        origin_country: originCountry,
        destination_city: destCity,
        destination_country: destCountry,
        departure_date: departDate,
        cutoff_date: cutoffDate,
        pricing_model: "per_kg",
        rate_per_kg: ratePerKg,
        currency,
        accepted_item_types: itemTypes,
      });
      onCreated(data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to publish trip. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const bookingLink = `gpflow.app/trip/${slug}`;
  const waAnnouncement = `GP leaving from ${origin} to ${dest} on ${departDate}. Last day to drop off your package is ${cutoffDate}. Book now 👇\n${bookingLink}`;
  const currSym = currency === "USD" ? "$" : currency === "GBP" ? "£" : "€";

  const steps = 4;

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        {/* Step progress bars */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, paddingRight: 40 }}>
          {Array.from({ length: steps }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: 4, borderRadius: 4,
                background: i <= step ? C.accent : C.border,
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>

        {/* Step 1 — Direction */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Which direction?</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>Select the trip route</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {(["outbound", "inbound"] as const).map((dir) => {
                const isSelected = direction === dir;
                const isOther = direction !== null && direction !== dir;
                return (
                  <button
                    key={dir}
                    onClick={() => pickDirection(dir)}
                    style={{
                      background: isSelected ? C.accentDim : C.card2,
                      border: `2px solid ${isSelected ? C.accent : C.border}`,
                      borderRadius: 16, padding: "18px 20px",
                      cursor: "pointer", textAlign: "left",
                      opacity: isOther ? 0.4 : 1,
                      fontFamily: "'DM Sans',sans-serif",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{dir === "outbound" ? "🇺🇸→🇬🇲" : "🇬🇲→🇺🇸"}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                      {dir === "outbound" ? "Outbound" : "Inbound"}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>
                      {dir === "outbound"
                        ? `${operatorCity} → Banjul, Gambia`
                        : `Banjul, Gambia → ${operatorCity}`}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{
              overflow: "hidden", maxHeight: direction ? 80 : 0,
              transition: "max-height 0.3s ease",
            }}>
              <button
                onClick={() => setStep(1)}
                disabled={!direction}
                style={ctaBtn(!!direction)}
              >
                <span>Continue →</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Dates & Items */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Dates & Items</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>Set your trip schedule</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lbl}>Departing From</label>
                <input value={origin} onChange={(e) => setOrigin(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Arriving In</label>
                <input value={dest} onChange={(e) => setDest(e.target.value)} style={inp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Departure Date *</label>
                  <input type="date" value={departDate} onChange={(e) => setDepartDate(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Last Drop-off Day *</label>
                  <input type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)} style={inp} />
                </div>
              </div>

              {/* Item type chips */}
              <div>
                <label style={lbl}>Accepting (optional)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {ITEM_TYPES.map((item) => (
                    <button
                      key={item}
                      onClick={() => toggleItem(item)}
                      style={{
                        background: itemTypes.includes(item) ? C.accentDim : C.card2,
                        border: `1px solid ${itemTypes.includes(item) ? C.accent : C.border}`,
                        borderRadius: 10, padding: "7px 14px",
                        color: itemTypes.includes(item) ? C.accent : C.text,
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                        fontFamily: "'DM Sans',sans-serif",
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setStep(0)} style={backBtn}>← Back</button>
              <button
                onClick={() => setStep(2)}
                disabled={!departDate || !cutoffDate}
                style={{ ...ctaBtn(!!(departDate && cutoffDate)), flex: 2 }}
              >
                <span>Continue →</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Rate */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Set Your Rate</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 24 }}>How much per pound?</div>

            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 24, color: C.textSub, fontWeight: 700 }}>{currSym}</span>
                <input
                  type="number"
                  step="0.01"
                  value={rateLb}
                  onChange={(e) => setRateLb(e.target.value)}
                  placeholder="3.50"
                  autoFocus
                  style={{
                    background: "transparent", border: "none",
                    borderBottom: `3px solid ${rateLbNum > 0 ? C.accent : C.border}`,
                    color: C.text, fontSize: 48, fontWeight: 900,
                    width: 160, textAlign: "center", outline: "none",
                    fontFamily: "monospace",
                  }}
                />
                <span style={{ fontSize: 18, color: C.textSub, fontWeight: 700 }}>/lb</span>
              </div>

              {/* Currency toggle */}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
                {CURRENCIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    style={{
                      background: currency === c ? C.accentDim : C.card2,
                      border: `1px solid ${currency === c ? C.accent : C.border}`,
                      borderRadius: 8, padding: "6px 14px",
                      color: currency === c ? C.accent : C.textSub,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Live example */}
              {rateLbNum > 0 && (
                <div style={{
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 12, padding: "12px 20px",
                  fontSize: 13, color: C.textSub,
                }}>
                  5lb = {currSym}{(5 * rateLbNum).toFixed(2)} · 10lb = {currSym}{(10 * rateLbNum).toFixed(2)}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)} style={backBtn}>← Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={rateLbNum <= 0}
                style={{ ...ctaBtn(rateLbNum > 0), flex: 2 }}
              >
                <span>Continue →</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Review & Announce */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Review & Announce</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>Check details before publishing</div>

            {/* Summary */}
            <div style={{
              background: C.card2, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "16px", marginBottom: 16,
            }}>
              {[
                ["Direction", direction === "outbound" ? "🇺🇸→🇬🇲 Outbound" : "🇬🇲→🇺🇸 Inbound"],
                ["From", origin],
                ["To", dest],
                ["Departs", departDate],
                ["Cutoff", cutoffDate],
                ["Rate", `${currSym}${rateLbNum.toFixed(2)}/lb`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, color: C.textSub }}>{k}</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Booking link */}
            <div style={{
              background: C.card2, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "12px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 14,
            }}>
              <code style={{ fontSize: 12, color: C.accent, fontFamily: "monospace" }}>{bookingLink}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(`https://${bookingLink}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                style={{
                  background: copied ? C.accent : C.accentDim,
                  border: `1px solid ${C.accentBorder}`,
                  borderRadius: 8, padding: "5px 12px",
                  color: copied ? "#07090F" : C.accent,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>

            {/* WA preview */}
            <div style={{
              background: "#0A1420", border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "14px", marginBottom: 18,
            }}>
              <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, marginBottom: 8 }}>📲 WhatsApp Announcement Preview</div>
              <div style={{
                background: "#1C2840", borderRadius: "4px 14px 14px 14px",
                padding: "12px 14px", fontSize: 12.5, color: C.text,
                lineHeight: 1.8, whiteSpace: "pre-line",
              }}>
                {waAnnouncement}
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

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(2)} style={backBtn}>← Back</button>
              <button
                onClick={publish}
                disabled={loading}
                style={{ ...ctaBtn(!loading), flex: 2 }}
              >
                <span>{loading ? "Publishing…" : "🚀 Publish & Send Announcement"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

const lbl: React.CSSProperties = {
  fontSize: 11, color: C.textSub, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.06em",
  display: "block", marginBottom: 6,
};
const inp: React.CSSProperties = {
  width: "100%",
  background: C.card2,
  border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "12px 14px",
  color: C.text, fontSize: 14, outline: "none",
  fontFamily: "'DM Sans',sans-serif",
  boxSizing: "border-box",
};
function ctaBtn(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    background: active ? `linear-gradient(135deg,${C.accent},#00A87A)` : C.border,
    color: active ? "#07090F" : C.textDim,
    border: "none", borderRadius: 16,
    padding: "16px 20px", fontSize: 15, fontWeight: 900,
    cursor: active ? "pointer" : "not-allowed",
    fontFamily: "'DM Sans',sans-serif",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  };
}
const backBtn: React.CSSProperties = {
  flex: 1, background: "transparent",
  border: `1px solid ${C.border}`, borderRadius: 14,
  padding: "14px", color: C.textSub,
  fontSize: 13, fontWeight: 700, cursor: "pointer",
  fontFamily: "'DM Sans',sans-serif",
};
