import { useState } from "react";
import { C } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import WaBubble from "../ui/WaBubble";
import type { Booking, Trip } from "../../types";

interface Props {
  trip: Trip;
  bookings: Booking[];
  onClose: () => void;
  onArrived: () => void;
}

export default function ArrivedModal({ trip, bookings, onClose, onArrived }: Props) {
  const [location, setLocation]   = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [hours, setHours]         = useState("10am – 4pm");
  const [loading, setLoading]     = useState(false);

  const weighed = bookings.filter((b) => b.confirmed_weight_kg != null);
  const sample  = weighed[0];
  const dest    = `${trip.destination_city}, ${trip.destination_country}`;
  const op      = trip.operator_business_name;

  const fromFmt = dateFrom
    ? new Date(dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  const toFmt = dateTo
    ? new Date(dateTo).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  const dateRange = fromFmt === toFmt || !toFmt ? fromFmt : `${fromFmt} – ${toFmt}`;

  function buildMsg(b: Booking): string {
    const fn = b.sender_name.split(" ")[0];
    return (
      `Hi ${fn} 👋\n\nAlhamdulillah, landed in ${dest}! 🇬🇲\n` +
      `Your package for ${b.recipient_name} is ready.\n\n` +
      `📍 ${location}\n` +
      `📅 ${dateRange} · ${hours} daily\n` +
      `Ref: ${b.reference_number} — bring this when collecting 🙏\n\n` +
      `— ${op} via GPFLOW`
    );
  }

  const canSubmit = location && dateFrom && !loading;

  async function notifyAll() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await api.post(`/trips/${trip.id}/arrive`, {
        pickup_location: location,
        pickup_window: `${dateRange} · ${hours} daily`,
        collection_assignments: weighed.map((b) => ({
          booking_id: b.id,
          collection_type: "self_collect",
        })),
      });
      onArrived();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        <div style={{ paddingRight: 40, marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>🇬🇲 We've Arrived!</div>
          <div style={{ fontSize: 12, color: C.textSub }}>
            {weighed.length} personalised WhatsApp messages will be sent.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
          <div>
            <label style={lbl}>Collection Location *</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. 14 Kairaba Avenue, Serrekunda"
              style={inp}
            />
          </div>

          <div>
            <label style={lbl}>Collection Window</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...inp, flex: 1 }} />
              <span style={{ color: C.textSub }}>→</span>
              <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
              Not everyone can come same day — a window gives flexibility.
            </div>
          </div>

          <div>
            <label style={lbl}>Daily Hours</label>
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="10am – 4pm"
              style={inp}
            />
          </div>
        </div>

        {/* Sample message */}
        {sample && location && dateFrom && (
          <div style={{
            background: "#070C16", border: `1px solid ${C.border}`,
            borderRadius: 14, overflow: "hidden", marginBottom: 18,
          }}>
            <div style={{
              background: C.card2, padding: "10px 16px",
              borderBottom: `1px solid ${C.border}`,
              fontSize: 11, color: C.textSub, fontWeight: 600,
            }}>
              Sample Message (1 of {weighed.length}) · Each sender gets their own.
            </div>
            <div style={{ padding: "14px" }}>
              <WaBubble
                msg={buildMsg(sample)}
                time="Now"
                operatorName={op}
              />
            </div>
          </div>
        )}

        <button
          onClick={notifyAll}
          disabled={!canSubmit}
          style={{
            width: "100%",
            background: canSubmit ? `linear-gradient(135deg,${C.orange},#EA580C)` : C.border,
            color: canSubmit ? "#07090F" : C.textDim,
            border: "none", borderRadius: 16,
            padding: "18px 22px", fontSize: 16, fontWeight: 900,
            cursor: canSubmit ? "pointer" : "not-allowed",
            fontFamily: "'DM Sans',sans-serif",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <span>{loading ? "Sending…" : "🇬🇲 Notify All Senders"}</span>
          {!loading && <span>→</span>}
        </button>
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
