import { useEffect, useRef } from "react";
import { C } from "../../lib/tokens";

export interface ToastItem {
  id: string;
  msg: string;
  color: string;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      pointerEvents: "none",
    }}>
      {toasts.map((t) => (
        <ToastEntry key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastEntry({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const ref = useRef(toast.id);
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(ref.current), 3200);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div style={{
      background: toast.color,
      color: "#07090F",
      borderRadius: 14,
      padding: "11px 20px",
      fontSize: 13,
      fontWeight: 700,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      fontFamily: "'DM Sans',sans-serif",
      whiteSpace: "nowrap",
    }}>
      {toast.msg}
    </div>
  );
}

// ── Simple hook-based toast state ──────────────────────────────────────────
import { useState, useCallback } from "react";

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const fire = useCallback((msg: string, color: string = C.accent) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, msg, color }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, fire, dismiss };
}
