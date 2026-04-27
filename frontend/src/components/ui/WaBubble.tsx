import { C } from "../../lib/tokens";

interface Props {
  msg: string;
  time: string;
  isNew?: boolean;
  operatorName?: string;
}

export default function WaBubble({ msg, time, isNew = false, operatorName = "Operator" }: Props) {
  const initial = operatorName.charAt(0).toUpperCase();
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 14 }}>
      <div style={{ maxWidth: "90%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%",
            background: `linear-gradient(135deg,${C.accent},#00A87A)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 900, color: "#070D18", flexShrink: 0,
          }}>{initial}</div>
          <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{operatorName}</span>
          {isNew && (
            <span style={{
              background: C.accent, color: "#070D18", borderRadius: 6,
              padding: "1px 7px", fontSize: 9, fontWeight: 800,
            }}>NEW</span>
          )}
        </div>
        <div style={{
          background: "#131E30", borderRadius: "4px 16px 16px 16px",
          padding: "12px 14px", border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.85, whiteSpace: "pre-line" }}>{msg}</div>
          <div style={{
            fontSize: 10, color: C.textDim, marginTop: 8,
            textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 4,
          }}>
            {time} <span style={{ color: C.teal }}>✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}
