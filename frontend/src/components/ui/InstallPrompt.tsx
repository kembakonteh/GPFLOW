import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { C } from "../../lib/tokens";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "gpflow_install_dismissed";

export default function InstallPrompt() {
  const { pathname } = useLocation();
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    function onInstalled() {
      setVisible(false);
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Only show on /dashboard
  if (!pathname.startsWith("/dashboard")) return null;
  if (!visible || !prompt) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setVisible(false);
  }

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  }

  return (
    <div style={{
      position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
      width: "calc(100% - 32px)", maxWidth: 508, zIndex: 100,
      background: C.card2, border: `1px solid ${C.accentBorder}`,
      borderRadius: 16, padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      fontFamily: "'DM Sans',sans-serif",
    }}>
      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: `linear-gradient(135deg,${C.accent},#00A87A)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 900, color: "#07090F",
      }}>G</div>

      {/* Text */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Install GPFLOW</div>
        <div style={{ fontSize: 11, color: C.textSub }}>Add to home screen for quick access</div>
      </div>

      {/* Buttons */}
      <button
        onClick={install}
        style={{
          background: C.accent, border: "none", borderRadius: 10,
          padding: "7px 14px", color: "#07090F",
          fontSize: 12, fontWeight: 800, cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Install
      </button>
      <button
        onClick={dismiss}
        style={{
          background: "none", border: "none",
          color: C.textSub, fontSize: 18, cursor: "pointer",
          flexShrink: 0, lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
