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
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");

  const allFilled = senderName && senderPhone && recipientName && recipientCity && itemDesc;

  const cutoffFmt = trip ? new Date(trip.cutoff_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const origin    = trip ? `${trip.origin_city}, ${trip.origin_country}` : "";
  const dest      = trip ? `${trip.destination_city}, ${trip.destination_country}` : "";

  async function submit() {
    if (!allFilled || !trip || loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post<BookingPublicResponse>("/bookings", {
        trip_id:             trip.id,
        sender_name:         senderName,
        sender_phone:        senderPhone,
        recipient_name:      recipientName,
        recipient_city:      recipientCity,
        item_description:    itemDesc,
        quantity:            1,
        estimated_weight_kg: 0,
      });
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
              <div style={{ fontSize: 13, fontWeight: 700 }}>🇺🇸→🇬🇲 {origin} → {dest}</div>
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{trip.operator_business_name} · Cutoff {cutoffFmt}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.gold }}>{trip.rate_display}</div>
            </div>
          </div>
        )}

        {/* Your details */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Your details</div>
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
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Who is this for?</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Recipient Name</label>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Lamin Camara" style={inp} />
            </div>
            <div>
              <label style={lbl}>City in Gambia</label>
              <input value={recipientCity} onChange={(e) => setRecipientCity(e.target.value)} placeholder="Serrekunda" style={inp} />
            </div>
          </div>
        </div>

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
            style={{
              ...inp,
              resize: "none",
              lineHeight: 1.6,
            }}
          />
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
