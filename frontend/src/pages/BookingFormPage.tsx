import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { C } from "../lib/tokens";
import type { BookingPublicResponse, PublicTrip } from "../types";

function NavBar({ label, onBack }: { label: string; onBack?: () => void }) {
  return (
    <div style={{
      background: "rgba(7,13,24,0.95)", backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${C.border}`, padding: "14px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "sticky", top: 0, zIndex: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onBack && (
          <button onClick={onBack} style={{
            background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 8, color: C.textSub, padding: "5px 12px",
            fontSize: 11, fontWeight: 600, cursor: "pointer", marginRight: 6,
          }}>←</button>
        )}
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

export default function BookingFormPage() {
  const { slug }  = useParams<{ slug: string }>();
  const navigate   = useNavigate();

  const { data: trip } = useQuery<PublicTrip>({
    queryKey: ["public-trip", slug],
    queryFn:  () => api.get(`/trips/public/${slug}`).then((r) => r.data),
    enabled:  !!slug,
  });

  const [senderName,    setSenderName]    = useState("");
  const [senderPhone,   setSenderPhone]   = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientCity, setRecipientCity] = useState("");
  const [itemDesc,      setItemDesc]      = useState("");
  const [packageCount,  setPackageCount]  = useState(1);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  // Delivery address — for inbound trips
  const [deliveryLine1, setDeliveryLine1] = useState("");
  const [deliveryLine2, setDeliveryLine2] = useState("");
  const [deliveryCity,  setDeliveryCity]  = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryZip,   setDeliveryZip]   = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  // "Inbound" = packages arriving at the operator's home country (US/UK).
  // Three independent signals — any one being true is sufficient:
  //   1. direction field set correctly
  //   2. destination_country is US or GB (most reliable for GPFLOW trips)
  //   3. origin_country is neither US nor GB (fallback if origin was set correctly)
  const isInbound = trip != null && (
    trip.direction === "inbound" ||
    trip.destination_country?.toUpperCase() === "US" ||
    trip.destination_country?.toUpperCase() === "GB"
  );

  // wantsDelivery: null = user hasn't touched the toggle → fall back to isInbound default
  const [wantsDelivery, setWantsDelivery] = useState<boolean | null>(null);
  const showDelivery = wantsDelivery !== null ? wantsDelivery : isInbound;

  const allFilled = senderName && senderPhone && recipientName && recipientCity && itemDesc;

  const cutoffFmt = trip ? new Date(trip.cutoff_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const origin    = trip ? `${trip.origin_city}, ${trip.origin_country}` : "";
  const dest      = trip ? `${trip.destination_city}, ${trip.destination_country}` : "";

  async function submit() {
    if (!allFilled || !trip || loading) return;
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        trip_id:             trip.id,
        sender_name:         senderName,
        sender_phone:        senderPhone,
        recipient_name:      recipientName,
        recipient_city:      recipientCity,
        item_description:    itemDesc,
        quantity:            1,
        package_count:       packageCount,
        estimated_weight_kg: 0,
        collection_type:     showDelivery ? "operator_delivers" : "self_collect",
      };
      if (showDelivery && deliveryLine1) {
        body.delivery_address_line1 = deliveryLine1;
        body.delivery_address_line2 = deliveryLine2 || undefined;
        body.delivery_city          = deliveryCity  || undefined;
        body.delivery_state         = deliveryState || undefined;
        body.delivery_zip           = deliveryZip   || undefined;
        body.delivery_country       = "US";
        body.delivery_notes         = deliveryNotes || undefined;
      }
      const { data } = await api.post<BookingPublicResponse>("/bookings", body);
      navigate(`/booking/${data.reference_number}/confirmed`, { state: { booking: data, trip } });
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Booking failed — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: `linear-gradient(160deg,#060B14,#0A1220,#060B14)`, minHeight: "100vh", color: C.text }}>
      <NavBar label={`Book · ${origin} → ${dest}`} onBack={() => navigate(`/trip/${slug}`)} />

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px 60px" }}>
        {/* Trip summary strip */}
        {trip && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: "14px 18px", marginBottom: 22,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{origin} → {dest}</div>
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{trip.operator_business_name} · Cutoff {cutoffFmt}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.gold }}>{trip.rate_display}</div>
            </div>
          </div>
        )}

        {/* Your details */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: isInbound ? 4 : 16 }}>Your details</div>
          {isInbound && (
            <div style={{ fontSize: 12, color: C.textSub, marginBottom: 16 }}>Your contact info as the receiver in the US</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={lbl}>Your Name</label>
              <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="e.g. Fatou Camara" style={inp} />
            </div>
            <div>
              <label style={lbl}>WhatsApp Number</label>
              <input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="+1 206 555 0142" style={inp} />
            </div>
            <div style={{
              background: C.blueDim, border: `1px solid ${C.blueBorder}`,
              borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.textSub,
            }}>
              📲 You'll receive WhatsApp confirmation and updates every stage.
            </div>
          </div>
        </div>

        {/* Who is this for */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>
            {isInbound ? "Who is sending this?" : "Who is this for?"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>{isInbound ? "Sender Name" : "Recipient Name"}</label>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder={isInbound ? "e.g. Fatou Camara" : "Lamin Camara"}
                style={inp}
              />
              {isInbound && (
                <div style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>The person dropping off the package in Gambia</div>
              )}
            </div>
            <div>
              <label style={lbl}>{isInbound ? "Recipient City (US)" : "City in Gambia"}</label>
              <input value={recipientCity} onChange={(e) => setRecipientCity(e.target.value)} placeholder={isInbound ? "e.g. Seattle" : "e.g. Serrekunda"} style={inp} />
            </div>
          </div>
        </div>

        {/* Collection type toggle — always visible once trip is loaded */}
        {trip && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>How would you like to receive it?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={() => setWantsDelivery(false)}
                style={{
                  background: !showDelivery ? C.tealDim : C.card2,
                  border: `1.5px solid ${!showDelivery ? C.teal : C.border}`,
                  borderRadius: 12, padding: "14px 10px",
                  color: !showDelivery ? C.teal : C.textSub,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 22 }}>🤝</span>
                <span>Self-collect</span>
                <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 400 }}>I'll pick it up</span>
              </button>
              <button
                type="button"
                onClick={() => setWantsDelivery(true)}
                style={{
                  background: showDelivery ? C.accentDim : C.card2,
                  border: `1.5px solid ${showDelivery ? C.accent : C.border}`,
                  borderRadius: 12, padding: "14px 10px",
                  color: showDelivery ? C.accent : C.textSub,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'DM Sans',sans-serif",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 22 }}>🚚</span>
                <span>Deliver to me</span>
                <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 400 }}>Operator drops it off</span>
              </button>
            </div>
          </div>
        )}

        {/* Delivery address — shown when "Deliver to me" is selected */}
        {showDelivery && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🚚 Delivery Address</div>
            <div style={{ fontSize: 12, color: C.textSub, marginBottom: 14, lineHeight: 1.6 }}>
              Optional — you can confirm this with {trip?.operator_business_name} later.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={lbl}>Street address</label>
                <input value={deliveryLine1} onChange={(e) => setDeliveryLine1(e.target.value)} placeholder="123 Main St" style={inp} />
              </div>
              <div>
                <label style={lbl}>Apt / Suite (optional)</label>
                <input value={deliveryLine2} onChange={(e) => setDeliveryLine2(e.target.value)} placeholder="Apt 4B" style={inp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10 }}>
                <div>
                  <label style={lbl}>City</label>
                  <input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} placeholder="Seattle" style={inp} />
                </div>
                <div>
                  <label style={lbl}>State</label>
                  <input value={deliveryState} onChange={(e) => setDeliveryState(e.target.value)} placeholder="WA" style={inp} />
                </div>
                <div>
                  <label style={lbl}>ZIP</label>
                  <input value={deliveryZip} onChange={(e) => setDeliveryZip(e.target.value)} placeholder="98101" style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Delivery notes (optional)</label>
                <input value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} placeholder="Gate code, call on arrival, etc." style={inp} />
              </div>
            </div>
          </div>
        )}

        {/* Mailing fee notice */}
        {showDelivery && (trip?.domestic_mailing_fee ?? 0) > 0 && (
          <div style={{
            background: C.goldDim, border: `1px solid ${C.goldBorder}`,
            borderRadius: 10, padding: "10px 14px",
            fontSize: 12, color: C.gold, display: "flex", gap: 8, marginBottom: 24,
          }}>
            <span style={{ flexShrink: 0 }}>📬</span>
            <span>
              A domestic mailing fee of <strong>${Number(trip!.domestic_mailing_fee).toFixed(2)}</strong> will be added to your total for home delivery.
            </span>
          </div>
        )}

        {/* What are you sending */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>What are you sending?</div>
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 14 }}>
            No need to weigh — operator does that at drop-off.
          </div>
          <textarea
            value={itemDesc}
            onChange={(e) => setItemDesc(e.target.value)}
            placeholder="e.g. Winter jacket, medicine, shoes"
            rows={3}
            style={{ ...inp, resize: "none", lineHeight: 1.6 }}
          />

          {/* Package count picker */}
          <div style={{ marginTop: 16 }}>
            <label style={lbl}>Number of packages</label>
            <div style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>
              Each package gets its own QR label and tracking code
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button
                onClick={() => setPackageCount((q) => Math.max(1, q - 1))}
                style={{
                  width: 48, height: 48, borderRadius: "10px 0 0 10px",
                  background: "#0A0E1A", border: `1px solid ${C.border}`,
                  color: C.text, fontSize: 22, fontWeight: 700,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >−</button>
              <div style={{
                flex: 1, height: 48,
                background: "#0A0E1A", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 800, color: C.text,
              }}>
                {packageCount}
              </div>
              <button
                onClick={() => setPackageCount((q) => Math.min(20, q + 1))}
                style={{
                  width: 48, height: 48, borderRadius: "0 10px 10px 0",
                  background: "#0A0E1A", border: `1px solid ${C.border}`,
                  color: C.text, fontSize: 22, fontWeight: 700,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >+</button>
            </div>
            {packageCount > 1 && (
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>
                Each package will be weighed and charged separately at drop-off.
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 14,
            fontSize: 13, color: C.red,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={submit}
          disabled={!allFilled || loading}
          style={{
            width: "100%",
            background: allFilled ? `linear-gradient(135deg,${C.accent},#00A87A)` : C.border,
            color: allFilled ? "#07090F" : C.textDim,
            border: "none", borderRadius: 14, padding: "15px",
            fontSize: 15, fontWeight: 800, cursor: allFilled ? "pointer" : "not-allowed",
            fontFamily: "'DM Sans',sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: allFilled ? `0 6px 24px ${C.accent}35` : "none",
          }}
        >
          {loading ? "Booking…" : "Confirm Booking →"}
        </button>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = {
  fontSize: 11, color: C.textSub, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.06em",
  display: "block", marginBottom: 6,
};
const inp: React.CSSProperties = {
  width: "100%",
  background: "#0A0E1A",
  border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "12px 14px",
  color: C.text, fontSize: 14, outline: "none",
  fontFamily: "'DM Sans',sans-serif",
  boxSizing: "border-box",
};
