import { useCallback, useState } from 'react';

export type ToastColor = 'accent' | 'gold' | 'red' | 'blue' | 'orange' | 'teal' | 'purple';

export interface Toast {
  id:      number;
  message: string;
  color:   ToastColor;
}

let _id = 0;

// Module-level listeners so any component can fire a toast
type Listener = (t: Toast) => void;
const listeners: Set<Listener> = new Set();

export function fireToast(message: string, color: ToastColor = 'accent') {
  const t: Toast = { id: ++_id, message, color };
  listeners.forEach((l) => l(t));
}

/** Mount once at app root — renders toasts */
export function useToastState() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((t: Toast) => {
    setToasts((prev) => [...prev, t]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 3500);
  }, []);

  // Register listener
  useState(() => {
    listeners.add(add);
    return () => { listeners.delete(add); };
  });

  return toasts;
}
