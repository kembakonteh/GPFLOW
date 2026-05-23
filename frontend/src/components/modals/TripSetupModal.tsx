import { useState } from "react";
import { C } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import type { Trip, TripAnnouncement } from "../../types";

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
  const [dropoffLocs, setDropoffLocs] = useState<{ label: string; address: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [createdTrip, setCreatedTrip] = useState<Trip | null>(null);
  const [announcement, setAnnouncement] = useState<TripAnnouncement | null>(null);
  const [annCopied, setAnnCopied] = useState(false);
  const [mailingRate, setMailingRate] = useState("");

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

  function addDropoffLoc() {
    setDropoffLocs((prev) => [...prev, { label: "", address: "" }]);
  }
  function updateDropoffLoc(idx: number, field: "label" | "address", value: string) {
    setDropoffLocs((prev) => prev.map((loc, i) => i === idx ? { ...loc, [field]: value } : loc));
  }
  function removeDropoffLoc(idx: number) {
    setDropoffLocs((prev) => prev.filter((_, i) => i !== idx));
  }

  async function publish() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const ratePerKg = rateLbNum; // backend converts lb→kg based on operator.weight_unit
      const originCity = origin.split(",")[0].trim();
      const destCity   = dest.split(",")[0].trim();
      // Always use 2-char ISO codes based on direction
      const originCountry = direction === "inbound"  ? "GM" : "US";
      const destCountry   = direction === "inbound"  ? "US" : "GM";
      const { data: trip } = await api.post<Trip>("/trips", {
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
        domestic_mailing_rate_per_lb: parseFloat(mailingRate) > 0 ? parseFloat(mailingRate) : undefined,
        drop_off_locations: dropoffLocs
          .filter((loc) => loc.label.trim())
          .map((loc, i) => ({
            label:         loc.label.trim(),
            address:       loc.address.trim() || undefined,
            display_order: i,
          })),
      });
      setCreatedTrip(trip);
      // Fetch the formatted announcement from the backend
      try {
        const { data: ann } = await api.get<TripAnnouncement>(`/trips/${trip.id}/announcement`);
        setAnnouncement(ann);
      } catch {
        // If the fetch fails, build a minimal fallback so the modal doesn't get stuck
        setAnnouncement({
          whatsapp_message: `✈️ ${trip.operator_business_name} — New trip!\n\n📲 Book your spot:\n${window.location.origin}/trip/${trip.public_slug}`,
          public_url: `${window.location.origin}/trip/${trip.public_slug}`,
        });
      }
      setStep(4);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d: { msg?: string; loc?: string[] }) =>
            `${d.loc?.slice(1).join(" → ") ?? "field"}: ${d.msg ?? "invalid"}`
          ).join(", ")
        : typeof detail === "string"
          ? detail
          : "Failed to publish trip. Please try again.";
      setError(msg);
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

              {/* Drop-off Locations */}
              <div>
                <label style={lbl}>
                  {direction === "inbound" ? "Drop-off Locations in Gambia" : "Drop-off Locations (optional)"}
                </label>
                {direction === "inbound" && (
                  <div style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>
                    Where senders can drop off packages in Gambia
                  </div>
                )}
                {dropoffLocs.map((loc, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <input
                        value={loc.label}
                        onChange={(e) => updateDropoffLoc(idx, "label", e.target.value)}
                        placeholder={direction === "inbound" ? "e.g. Bakau, Banjul" : "e.g. African Supermart – Lynnwood"}
                        style={inp}
                      />
                      <input
                        value={loc.address}
                        onChange={(e) => updateDropoffLoc(idx, "address", e.target.value)}
                        placeholder={direction === "inbound" ? "Full address (optional)" : "Address (optional)"}
                        style={{ ...inp, fontSize: 12, padding: "9px 14px" }}
                      />
                    </div>
                    <button
                      onClick={() => removeDropoffLoc(idx)}
                      style={{
                        background: "transparent", border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: "10px 11px",
                        color: C.textSub, cursor: "pointer",
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 14, flexShrink: 0, marginTop: 2,
                      }}
                    >🗑</button>
                  </div>
                ))}
                <button
                  onClick={addDropoffLoc}
                  style={{
                    background: C.card2, border: `1px dashed ${C.border}`,
                    borderRadius: 10, padding: "10px 14px",
                    color: C.textSub, fontSize: 13, fontWeight: 600,
                    cursor: "pointer", width: "100%", textAlign: "center",
                    fontFamily: "'DM Sans',sans-serif",
                  }}
                >+ Add Location</button>
              </div>
            </div>

            {/* Date validation errors */}
            {departDate && cutoffDate && (() => {
              const today = new Date(); today.setHours(0,0,0,0);
              const depart = new Date(departDate);
              const cutoff = new Date(cutoffDate);
              if (depart <= today) return (
                <div style={{ marginTop: 10, fontSize: 12, color: "#F43F5E" }}>⚠️ Departure date must be in the future.</div>
              );
              if (cutoff >= depart) return (
                <div style={{ marginTop: 10, fontSize: 12, color: "#F43F5E" }}>⚠️ Drop-off deadline must be before departure date.</div>
              );
              return null;
            })()}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setStep(0)} style={backBtn}>← Back</button>
              <button
                onClick={() => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const depart = new Date(departDate);
                  const cutoff = new Date(cutoffDate);
                  if (!departDate || !cutoffDate) return;
                  if (depart <= today) return;
                  if (cutoff >= depart) return;
                  setStep(2);
                }}
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

            {/* Mailing rate */}
            <div style={{ textAlign: "left", marginBottom: 20 }}>
              <label style={lbl}>Mailing Rate (USD per lb) — optional</label>
              <div style={{ fontSize: 11, color: C.textSub, marginBottom: 6 }}>
                Per-lb rate charged for USPS/UPS mailing to out-of-state customers
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, color: C.textSub, fontWeight: 700 }}>$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={mailingRate}
                  onChange={(e) => setMailingRate(e.target.value)}
                  placeholder="e.g. 0.50"
                  style={{ ...inp, width: "100%" }}
                />
              </div>
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

        {/* Step 5 — Share Announcement (post-publish) */}
        {step === 4 && announcement && createdTrip && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>📢 Share This Trip</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 18 }}>
              Paste this directly to your WhatsApp Status or broadcast list.
            </div>

            {/* Message textarea */}
            <textarea
              readOnly
              value={announcement.whatsapp_message}
              style={{
                width: "100%", background: C.card2,
                border: `1px solid ${C.border}`, borderRadius: 12,
                padding: "14px", color: C.text, fontSize: 12.5,
                fontFamily: "monospace", lineHeight: 1.7,
                resize: "none", outline: "none", boxSizing: "border-box",
                minHeight: 200,
              }}
              rows={12}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 10, marginBottom: 18, alignItems: "center" }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(announcement.whatsapp_message);
                  setAnnCopied(true);
                  setTimeout(() => setAnnCopied(false), 2000);
                }}
                style={{
                  background: annCopied ? C.accent : C.accentDim,
                  border: `1px solid ${C.accentBorder}`,
                  borderRadius: 10, padding: "9px 18px",
                  color: annCopied ? "#07090F" : C.accent,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif", flexShrink: 0,
                }}
              >
                {annCopied ? "Copied ✓" : "📋 Copy Message"}
              </button>
              <span style={{ fontSize: 11, color: C.textDim, lineHeight: 1.4 }}>
                Paste to WhatsApp Status or broadcast list
              </span>
            </div>

            <button
              onClick={() => onCreated(createdTrip)}
              style={ctaBtn(true)}
            >
              <span>Done — Go to Dashboard</span>
              <span>→</span>
            </button>
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
