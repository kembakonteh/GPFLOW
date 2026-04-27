import { ReactNode } from "react";
import { C } from "../../lib/tokens";

interface Props {
  children: ReactNode;
  onClose: () => void;
}

export default function Modal({ children, onClose }: Props) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: "22px 22px 0 0",
        width: "100%",
        maxWidth: 540,
        maxHeight: "92vh",
        overflowY: "auto",
        boxShadow: "0 -20px 80px rgba(0,0,0,0.6)",
        position: "relative",
      }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 14, paddingBottom: 6 }}>
          <div style={{ width: 40, height: 4, borderRadius: 4, background: C.border }} />
        </div>
        {children}
      </div>
    </div>
  );
}
