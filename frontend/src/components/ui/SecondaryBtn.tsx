import { C } from "../../lib/tokens";

interface Props {
  label: string;
  sub?: string;
  icon: string;
  color: string;
  onClick: () => void;
}

export default function SecondaryBtn({ label, sub, icon, color, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        background: C.card2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif",
        textAlign: "left",
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: color + "22",
        border: `1px solid ${color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{sub}</div>}
      </div>
      <span style={{ color: C.textSub, fontSize: 16 }}>→</span>
    </button>
  );
}
