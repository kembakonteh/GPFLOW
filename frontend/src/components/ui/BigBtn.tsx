import { CSSProperties } from "react";

interface Props {
  label: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}

export default function BigBtn({ label, color, onClick, disabled = false }: Props) {
  const style: CSSProperties = {
    width: "100%",
    background: disabled ? "#2A3545" : color,
    color: disabled ? "#4A5568" : "#07090F",
    fontSize: 16,
    fontWeight: 900,
    padding: "20px 22px",
    borderRadius: 18,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontFamily: "'DM Sans',sans-serif",
    transition: "opacity 0.15s",
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <button style={style} onClick={disabled ? undefined : onClick} disabled={disabled}>
      <span>{label}</span>
      <span style={{ fontSize: 18 }}>→</span>
    </button>
  );
}
