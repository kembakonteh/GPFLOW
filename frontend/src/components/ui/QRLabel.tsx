import type { Booking, BookingPackage, Trip } from "../../types";

interface Props {
  booking: Booking;
  trip: Trip;
  pkg?: BookingPackage;
}

export default function QRLabel({ booking, trip, pkg }: Props) {
  const origin = `${trip.origin_city}, ${trip.origin_country}`;
  const dest   = `${trip.destination_city}, ${trip.destination_country}`;

  const isConsolidated = booking.packages.length > 1 && !pkg;

  // Weight and cost — per-package or booking-level
  const rawKg      = pkg ? pkg.weight_kg : booking.confirmed_weight_kg;
  const confKg     = rawKg != null ? Number(rawKg) : null;
  const confLbs    = confKg != null ? (confKg * 2.20462).toFixed(1) : null;
  const weightLabel = confLbs != null ? `${confLbs}lbs (${confKg!.toFixed(2)}kg)` : null;
  const costLabel   = pkg ? null : (booking.confirmed_cost_display ?? null);

  // Consolidated: sum of all confirmed package weights
  const totalKg  = isConsolidated
    ? booking.packages.reduce((s, p) => s + (p.weight_kg != null ? Number(p.weight_kg) : 0), 0)
    : null;
  const totalLbs = totalKg != null && totalKg > 0 ? (totalKg * 2.20462).toFixed(1) : null;
  const consolidatedWeight = totalLbs ? `${totalLbs}lbs (${totalKg!.toFixed(2)}kg)` : null;

  const displayRef = pkg ? pkg.package_reference : booking.reference_number;
  const trackUrl   = `gpflow.app/track/${booking.reference_number}`;

  const effectiveWeight = isConsolidated ? consolidatedWeight : weightLabel;

  return (
    <div style={{
      background: "#fff", color: "#111", borderRadius: 12,
      padding: "20px", fontFamily: "'DM Sans',sans-serif",
      border: "2px solid #000",
      display: "flex", flexDirection: "column", gap: 14,
      width: "100%", maxWidth: 380,
    }}>
      {/* Header */}
      <div style={{ borderBottom: "2px solid #000", paddingBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.08em", color: "#000" }}>GPFLOW</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{trip.operator_business_name}</div>
        <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>{origin} → {dest}</div>
        <div style={{ fontSize: 10, color: "#555" }}>Departs {trip.departure_date}</div>
        {pkg && (
          <div style={{
            marginTop: 6, background: "#000", color: "#fff", borderRadius: 4,
            padding: "2px 8px", display: "inline-block", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
          }}>
            PACKAGE {pkg.package_number} OF {booking.package_count}
            {pkg.description ? ` — ${pkg.description.toUpperCase()}` : ""}
          </div>
        )}
        {isConsolidated && (
          <div style={{
            marginTop: 6, background: "#000", color: "#fff", borderRadius: 4,
            padding: "2px 8px", display: "inline-block", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
          }}>
            {booking.packages.length} PACKAGES
          </div>
        )}
      </div>

      {/* Reference */}
      <div style={{ textAlign: "center", background: "#000", borderRadius: 6, padding: "10px" }}>
        <div style={{ fontSize: 10, color: "#aaa", letterSpacing: "0.12em", marginBottom: 3 }}>
          {pkg ? "PACKAGE REFERENCE" : "BOOKING REFERENCE"}
        </div>
        <div style={{ fontFamily: "monospace", fontSize: pkg ? 18 : 22, fontWeight: 900, color: "#fff", letterSpacing: "0.1em" }}>
          {displayRef}
        </div>
      </div>

      {/* Package list — consolidated only */}
      {isConsolidated && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: "12px" }}>
          <div style={{ fontSize: 9, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Package References
          </div>
          {booking.packages.map((p) => {
            const pkgLbs = p.weight_kg != null ? (Number(p.weight_kg) * 2.20462).toFixed(1) : null;
            return (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <code style={{ fontSize: 12, fontWeight: 700, color: "#000", fontFamily: "monospace" }}>
                  {p.package_reference}
                </code>
                {pkgLbs && (
                  <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>{pkgLbs}lbs</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* From → To */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 6, alignItems: "center" }}>
        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: "12px" }}>
          <div style={{ fontSize: 9, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>FROM (Sender)</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#000" }}>{booking.sender_name}</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{origin}</div>
          {booking.sender_phone && <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{booking.sender_phone}</div>}
        </div>
        <div style={{ fontSize: 22, color: "#000", textAlign: "center", flexShrink: 0 }}>→</div>
        <div style={{ background: "#000", borderRadius: 8, padding: "12px" }}>
          <div style={{ fontSize: 9, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>TO (Recipient)</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{booking.recipient_name}</div>
          <div style={{ fontSize: 11, color: "#ccc", marginTop: 2 }}>{booking.recipient_city}, Gambia</div>
        </div>
      </div>

      {/* Items */}
      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: "12px" }}>
        <div style={{ fontSize: 9, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Item</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#000" }}>{booking.item_description}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
          <div>
            <div style={{ fontSize: 9, color: "#888" }}>{isConsolidated ? "TOTAL WEIGHT" : "WEIGHT"}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: effectiveWeight ? "#059669" : "#d97706" }}>
              {effectiveWeight ?? "Pending"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#888" }}>COST</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: costLabel ? "#059669" : "#d97706" }}>
              {costLabel ?? "TBC"}
            </div>
          </div>
          {!isConsolidated && (
            <div>
              <div style={{ fontSize: 9, color: "#888" }}>QTY</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#000" }}>{booking.quantity} pcs</div>
            </div>
          )}
        </div>
        {effectiveWeight && (
          <div style={{ marginTop: 6, fontSize: 9, color: "#059669", fontWeight: 700 }}>✓ Weight & cost confirmed at drop-off</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "2px solid #000", paddingTop: 10, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>{trackUrl}</div>
        <div style={{ fontSize: 9, color: "#888" }}>Powered by GPFLOW</div>
      </div>
    </div>
  );
}
