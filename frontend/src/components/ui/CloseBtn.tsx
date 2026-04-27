import { C } from "../../lib/tokens";

interface Props {
  onClick: () => void;
}

export default function CloseBtn({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "absolute", top: 18, right: 18,
        width: 32, height: 32, borderRadius: "50%",
        background: C.card2, border: `1px solid ${C.border}`,
        color: C.textSub, fontSize: 18, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, zIndex: 10, flexShrink: 0,
        fontFamily: "'DM Sans',sans-serif",
      }}
    >
      ×
    </button>
  );
}
