import { useState } from "react";
import { C } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import WeighModal from "./WeighModal";
import type { Booking, Trip } from "../../types";

interface Props {
  trip: Trip;
  bookings: Booking[];
  onClose: () => void;
  onBookingUpdate: (b: Booking) => void;
  initialView?: "list" | "walkin";
}

type View = "list" | "walkin";

export default function WeighListModal({ trip, bookings, onClose, onBookingUpdate, initialView = "list" }: Props) {
  const [view, setView] = useState<View>(initialView);
  const [search, setSearch] = useState("");
  const [weighing, setWeighing] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);

  // Walk-in form
  const [waSender, setWaSender]               = useState("");
  const [waPhone, setWaPhone]                 = useState("");
  const [waRecipient, setWaRecipient]         = useState("");
  const [waCity, setWaCity]                   = useState("");
  const [waItems, setWaItems]                 = useState("");
  const [waCollectionType, setWaCollectionType] = useState<"self_collect" | "operator_delivers">("self_collect");
  const [waDeliveryLine1, setWaDeliveryLine1] = useState("");
  const [waDeliveryLine2, setWaDeliveryLine2] = useState("");
  const [waDeliveryCity, setWaDeliveryCity]   = useState("");
  const [waDeliveryState, setWaDeliveryState] = useState("");
  const [waDeliveryZip, setWaDeliveryZip]     = useState("");
  const [waDeliveryNotes, setWaDeliveryNotes] = useState("");

  const isFullyWeighed = (b: Booking) => {
    if (b.packages && b.packages.length > 0) return b.packages.every((p) => p.weight_kg != null);
    return b.confirmed_weight_kg != null;
  };
  const weighed = bookings.filter(isFullyWeighed);
  const pending = bookings.filter((b) => !isFullyWeighed(b));

  const q = search.toLowerCase().trim();
  const filtered = q
    ? pending.filter((b) =>
        b.sender_name.toLowerCase().includes(q) ||
        b.recipient_name.toLowerCase().includes(q) ||
        b.reference_number.toLowerCase().includes(q) ||
        b.recipient_city.toLowerCase().includes(q)
      )
    : pending;

  const isInbound = trip.direction === "inbound" ||
    trip.destination_country?.toUpperCase() === "US" ||
    trip.destination_country?.toUpperCase() === "GB";

  const waMailing = isInbound && waCollectionType === "operator_delivers";
  const canSubmitWalkin = !!(
    waSender && waPhone && waRecipient && waCity && waItems && !loading &&
    (!waMailing || (waDeliveryLine1 && waDeliveryCity && waDeliveryState && waDeliveryZip))
  );

  async function submitWalkin() {
    if (!canSubmitWalkin) return;
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        trip_id: trip.id,
        sender_name: waSender,
        sender_phone: waPhone,
        recipient_name: waRecipient,
        recipient_city: waCity,
        item_description: waItems,
        quantity: 1,
        estimated_weight_kg: 0,
      };
      if (isInbound) {
        payload.collection_type = waCollectionType;
        if (waMailing) {
          payload.delivery_address_line1 = waDeliveryLine1;
          if (waDeliveryLine2) payload.delivery_address_line2 = waDeliveryLine2;
          payload.delivery_city    = waDeliveryCity;
          payload.delivery_state   = waDeliveryState;
          payload.delivery_zip     = waDeliveryZip;
          payload.delivery_country = "US";
          if (waDeliveryNotes) payload.delivery_notes = waDeliveryNotes;
        }
      }
      // Step 1: create booking via public endpoint
      const { data: created } = await api.post<{ id: string }>("/bookings", payload);
      // Step 2: fetch the full operator booking (all fields WeighModal needs)
      const { data: full } = await api.get<Booking>(`/bookings/${created.id}`);
      onBookingUpdate(full);
      setWeighing(full);
      setView("list");
    } finally {
      setLoading(false);
    }
  }

  const cutoff = new Date(trip.cutoff_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (weighing) {
    return (
      <WeighModal
        booking={weighing}
        trip={trip}
        onClose={onClose}
        onDone={(updated) => {
          onBookingUpdate(updated);
          setWeighing(null);
        }}
        onBack={() => setWeighing(null)}
      />
    );
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        {view === "list" ? (
          <>
            {/* Header */}
            <div style={{ marginBottom: 16, paddingRight: 40 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>⚖️ Weigh Packages</div>
              <div style={{ fontSize: 12, color: C.textSub }}>
                Drop-off day · {weighed.length}/{bookings.length} weighed · Cutoff {cutoff}
              </div>
            </div>

            {/* Search */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or reference # (e.g. GP-2026-A1B2)"
                style={{
                  width: "100%",
                  background: C.card2,
                  border: `1px solid ${C.accentBorder}`,
                  borderRadius: 12, padding: "11px 40px 11px 14px",
                  color: C.text, fontSize: 13, outline: "none",
                  fontFamily: "'DM Sans',sans-serif",
                  boxSizing: "border-box",
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: C.textSub, cursor: "pointer", fontSize: 16,
                  }}
                >×</button>
              )}
            </div>

            {/* Walk-in button */}
            <button
              onClick={() => setView("walkin")}
              style={{
                width: "100%", marginBottom: 14,
                background: "transparent",
                border: `2px dashed ${C.accentBorder}`,
                borderRadius: 12, padding: "11px 16px",
                color: C.accent, fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
              }}
            >
              ➕ Walk-in — no prior booking
            </button>

            {/* Pending list */}
            <div style={{ maxHeight: "40vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {filtered.length === 0 && pending.length === 0 && weighed.length > 0 && (
                <div style={{
                  textAlign: "center", padding: "24px 0",
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 14,
                }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.accent, marginBottom: 4 }}>All packages weighed!</div>
                  <div style={{ fontSize: 12, color: C.textSub }}>You can close this and mark the trip as departed.</div>
                </div>
              )}
              {filtered.length === 0 && search && (
                <div style={{ textAlign: "center", padding: "24px 0", color: C.textSub }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>No results for "{search}"</div>
                  <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>
                    Try searching by reference number (e.g. GP-2026-XXXX)
                  </div>
                  <button
                    onClick={() => setView("walkin")}
                    style={{
                      background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                      borderRadius: 10, padding: "8px 16px",
                      color: C.accent, fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    + Add as Walk-in Instead
                  </button>
                </div>
              )}
              {filtered.map((b) => {
                const isMulti = b.packages && b.packages.length > 1;
                return (
                  <div key={b.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    <div
                      style={{
                        background: C.card2, border: `1px solid ${C.border}`,
                        borderRadius: isMulti ? "14px 14px 0 0" : 14, padding: "14px 16px",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: "50%",
                          background: `linear-gradient(135deg,${C.gold},#D97706)`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, fontWeight: 900, color: "#07090F", flexShrink: 0,
                        }}>
                          {b.sender_name.charAt(0)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 700 }}>{b.sender_name}</span>
                            {(b as any).is_walk_in && (
                              <span style={{
                                background: C.goldDim, border: `1px solid ${C.goldBorder}`,
                                borderRadius: 6, padding: "1px 7px",
                                fontSize: 9, fontWeight: 800, color: C.gold,
                              }}>WALK-IN</span>
                            )}
                            {isMulti && (
                              <span style={{
                                background: C.blueDim, border: `1px solid ${C.blueBorder}`,
                                borderRadius: 6, padding: "1px 7px",
                                fontSize: 9, fontWeight: 800, color: C.blue,
                              }}>{b.package_count} PKG</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                            {b.item_description} → {b.recipient_name}
                          </div>
                          <code style={{ fontSize: 10, color: C.teal, fontFamily: "monospace", fontWeight: 700 }}>
                            {b.reference_number}
                          </code>
                        </div>
                      </div>
                      <button
                        onClick={() => setWeighing(b)}
                        style={{
                          background: C.gold, border: "none", borderRadius: 10,
                          padding: "8px 14px", color: "#07090F",
                          fontSize: 12, fontWeight: 800, cursor: "pointer",
                          fontFamily: "'DM Sans',sans-serif", flexShrink: 0,
                        }}
                      >
                        ⚖️ Weigh
                      </button>
                    </div>

                    {/* Package sub-rows for multi-package bookings */}
                    {isMulti && b.packages.map((pkg, pi) => {
                      const pkgLbs = pkg.weight_kg != null ? (Number(pkg.weight_kg) * 2.20462).toFixed(1) : null;
                      const isLast = pi === b.packages.length - 1;
                      return (
                        <div
                          key={pkg.id}
                          style={{
                            background: pkg.weight_kg != null ? C.accentDim : "#0A0E1A",
                            border: `1px solid ${pkg.weight_kg != null ? C.accentBorder : C.border}`,
                            borderTop: "none",
                            borderRadius: isLast ? "0 0 14px 14px" : 0,
                            padding: "8px 16px",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <code style={{ fontSize: 10, color: C.teal, fontFamily: "monospace", fontWeight: 700 }}>
                              {pkg.package_reference}
                            </code>
                            {pkg.description && (
                              <span style={{ fontSize: 10, color: C.textSub, marginLeft: 6 }}>
                                {pkg.description}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: pkg.weight_kg != null ? C.accent : C.textDim }}>
                            {pkgLbs != null ? `✓ ${pkgLbs} lbs` : "pending"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Weighed (dimmed) */}
            {weighed.length > 0 && (
              <div style={{ opacity: 0.45 }}>
                <div style={{ fontSize: 11, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  ✓ Weighed ({weighed.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {weighed.map((b) => {
                    const lbs = (Number(b.confirmed_weight_kg) * 2.20462).toFixed(1);
                    return (
                      <div
                        key={b.id}
                        style={{
                          background: C.card2, border: `1px solid ${C.border}`,
                          borderRadius: 12, padding: "10px 14px",
                          display: "flex", alignItems: "center", gap: 10,
                        }}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, color: C.accent, flexShrink: 0,
                        }}>✓</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{b.sender_name}</div>
                          <div style={{ fontSize: 11, color: C.textSub }}>{b.confirmed_cost_display ?? ""} · {lbs}lbs</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Walk-in form */}
            <div style={{ paddingRight: 40 }}>
              <button
                onClick={() => setView("list")}
                style={{ background: "none", border: "none", color: C.textSub, cursor: "pointer", fontSize: 13, marginBottom: 12, fontFamily: "'DM Sans',sans-serif" }}
              >
                ← Back to list
              </button>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Walk-in Booking</div>
              <div style={{ fontSize: 12, color: C.textSub, marginBottom: 20 }}>No prior booking — add details now</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "60vh", overflowY: "auto", paddingBottom: 4 }}>
              <div>
                <label style={lblStyle}>Sender Name</label>
                <input value={waSender} onChange={(e) => setWaSender(e.target.value)} placeholder="e.g. Fatou Camara" style={inpStyle} />
              </div>

              <div>
                <label style={lblStyle}>WhatsApp Number</label>
                <input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="+1 206 555 0142" style={inpStyle} />
              </div>

              {/* Collection type selector — inbound trips only */}
              {isInbound && (
                <div>
                  <label style={lblStyle}>How will they receive it?</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {([
                      { value: "self_collect" as const, emoji: "📍", title: "Self-collect", sub: "I'll pick it up", color: C.teal, dimColor: C.tealDim, borderColor: C.tealBorder },
                      { value: "operator_delivers" as const, emoji: "📬", title: "Mail to me", sub: "Operator mails via USPS/UPS", color: C.accent, dimColor: C.accentDim, borderColor: C.accentBorder },
                    ] as const).map(({ value, emoji, title, sub, color, dimColor, borderColor }) => {
                      const active = waCollectionType === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setWaCollectionType(value)}
                          style={{
                            background: active ? dimColor : C.card2,
                            border: `1px solid ${active ? borderColor : C.border}`,
                            borderRadius: 12, padding: "14px 10px",
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                          }}
                        >
                          <span style={{ fontSize: 20 }}>{emoji}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: active ? color : C.text }}>{title}</span>
                          <span style={{ fontSize: 10, color: C.textSub, textAlign: "center" }}>{sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Delivery address — inbound + Mail to me */}
              {waMailing && (
                <div style={{
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 14, padding: "14px",
                  display: "flex", flexDirection: "column", gap: 12,
                }}>
                  <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    📬 Mailing Address
                  </div>

                  <div>
                    <label style={lblStyle}>Street Address *</label>
                    <input value={waDeliveryLine1} onChange={(e) => setWaDeliveryLine1(e.target.value)} placeholder="e.g. 123 Main St" style={inpStyle} />
                  </div>

                  <div>
                    <label style={lblStyle}>Apt / Suite</label>
                    <input value={waDeliveryLine2} onChange={(e) => setWaDeliveryLine2(e.target.value)} placeholder="e.g. Apt 4B (optional)" style={inpStyle} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={lblStyle}>City *</label>
                      <input value={waDeliveryCity} onChange={(e) => setWaDeliveryCity(e.target.value)} placeholder="Seattle" style={inpStyle} />
                    </div>
                    <div>
                      <label style={lblStyle}>State *</label>
                      <input value={waDeliveryState} onChange={(e) => setWaDeliveryState(e.target.value)} placeholder="WA" style={inpStyle} />
                    </div>
                    <div>
                      <label style={lblStyle}>ZIP *</label>
                      <input value={waDeliveryZip} onChange={(e) => setWaDeliveryZip(e.target.value)} placeholder="98101" style={inpStyle} />
                    </div>
                  </div>

                  <div>
                    <label style={lblStyle}>Delivery Notes</label>
                    <input value={waDeliveryNotes} onChange={(e) => setWaDeliveryNotes(e.target.value)} placeholder="e.g. Ring doorbell, leave at door (optional)" style={inpStyle} />
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lblStyle}>Recipient Name</label>
                  <input value={waRecipient} onChange={(e) => setWaRecipient(e.target.value)} placeholder="Lamin Camara" style={inpStyle} />
                </div>
                <div>
                  <label style={lblStyle}>{isInbound ? "Recipient City (US)" : "City in Gambia"}</label>
                  <input value={waCity} onChange={(e) => setWaCity(e.target.value)} placeholder={isInbound ? "e.g. Seattle" : "e.g. Serrekunda"} style={inpStyle} />
                </div>
              </div>

              <div>
                <label style={lblStyle}>What are they sending?</label>
                <input value={waItems} onChange={(e) => setWaItems(e.target.value)} placeholder="e.g. Clothes, medicine, shoes" style={inpStyle} />
              </div>

              <button
                onClick={submitWalkin}
                disabled={!canSubmitWalkin}
                style={{
                  width: "100%",
                  background: canSubmitWalkin ? C.gold : C.border,
                  color: canSubmitWalkin ? "#07090F" : C.textDim,
                  border: "none", borderRadius: 16,
                  padding: "16px 20px", fontSize: 15, fontWeight: 900,
                  cursor: canSubmitWalkin ? "pointer" : "not-allowed",
                  fontFamily: "'DM Sans',sans-serif",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginTop: 4,
                }}
              >
                <span>{loading ? "Adding…" : "⚖️ Add & Weigh Now"}</span>
                <span>→</span>
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const lblStyle: React.CSSProperties = {
  fontSize: 11, color: C.textSub, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.06em",
  display: "block", marginBottom: 6,
};

const inpStyle: React.CSSProperties = {
  width: "100%",
  background: C.card2,
  border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "12px 14px",
  color: C.text, fontSize: 14,
  outline: "none",
  fontFamily: "'DM Sans',sans-serif",
  boxSizing: "border-box",
};
