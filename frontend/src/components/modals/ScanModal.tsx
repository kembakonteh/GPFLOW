import { useEffect, useRef, useState } from "react";
import { C } from "../../lib/tokens";
import { api } from "../../lib/api";
import Modal from "../ui/Modal";
import CloseBtn from "../ui/CloseBtn";
import WaBubble from "../ui/WaBubble";
import type { Booking, Trip } from "../../types";

type Step = "find" | "scan" | "done";
type Action = "collected" | "delivered";

interface Props {
  trip: Trip;
  bookings: Booking[];
  onClose: () => void;
  onDelivered: (b: Booking) => void;
}

export default function ScanModal({ trip, bookings, onClose, onDelivered }: Props) {
  const [step, setStep]         = useState<Step>("find");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [action, setAction]     = useState<Action | null>(null);
  const [loading, setLoading]   = useState(false);
  const [camDenied, setCamDenied] = useState(false);
  const [, setUpdatedBooking] = useState<Booking | null>(null);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const frameRef   = useRef<number>(0);
  const jsqrRef    = useRef<typeof import("jsqr") | null>(null);

  const pending = bookings.filter((b) => !["collected", "delivered"].includes(b.status));
  const q = search.toLowerCase().trim();
  const filtered = q
    ? pending.filter((b) =>
        b.recipient_name.toLowerCase().includes(q) ||
        b.sender_name.toLowerCase().includes(q) ||
        b.reference_number.toLowerCase().includes(q) ||
        b.recipient_city.toLowerCase().includes(q)
      )
    : pending;

  const op = trip.operator_business_name;

  // Load jsqr dynamically
  useEffect(() => {
    import("jsqr").then((mod) => { jsqrRef.current = mod; }).catch(() => {});
  }, []);

  // Start camera when entering scan step
  useEffect(() => {
    if (step !== "scan") return;
    startCamera();
    return stopCamera;
  }, [step]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        scheduleFrame();
      }
    } catch {
      setCamDenied(true);
    }
  }

  function stopCamera() {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  function scheduleFrame() {
    frameRef.current = requestAnimationFrame(scanFrame);
  }

  function scanFrame() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    const jsqr   = jsqrRef.current;
    if (!video || !canvas || !jsqr || video.readyState !== 4) {
      scheduleFrame();
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) { scheduleFrame(); return; }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result    = (jsqr as any).default
      ? (jsqr as any).default(imageData.data, canvas.width, canvas.height)
      : (jsqr as any)(imageData.data, canvas.width, canvas.height);
    if (result?.data) {
      handleQRData(result.data);
    } else {
      scheduleFrame();
    }
  }

  function handleQRData(data: string) {
    stopCamera();
    // Parse reference from full URL or bare ref
    let ref = data;
    const match = data.match(/GP-\d{4}-[A-Z0-9]+/i);
    if (match) ref = match[0].toUpperCase();

    const found = bookings.find((b) =>
      b.reference_number.toUpperCase() === ref.toUpperCase()
    );
    if (found) {
      setSelected(found);
      setScanDone(true);
    } else {
      // No match — stay in scan but show unmatched ref
      setSearch(ref);
      setStep("find");
    }
  }

  function simulateScan() {
    if (!selected) return;
    setScanDone(true);
    stopCamera();
  }

  async function confirm(act: Action) {
    if (!selected || loading) return;
    setLoading(true);
    try {
      // Record scan checkpoint if a real QR was scanned
      if (scanDone && !camDenied) {
        await api.post(`/bookings/${selected.id}/scan`, {}).catch(() => {});
      }
      // Update booking status to collected or delivered
      const { data } = await api.patch<Booking>(`/bookings/${selected.id}/status`, { status: act });
      setAction(act);
      setUpdatedBooking(data);
      onDelivered(data);
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  function buildDoneMsg(b: Booking, act: Action): string {
    const senderFirst = b.sender_name.split(" ")[0];
    const emoji = act === "collected" ? "🤝" : "✅";
    return (
      `Hi ${senderFirst} 👋\n\n` +
      `${emoji} ${act === "collected" ? `${b.recipient_name} collected` : `Delivered to ${b.recipient_name}`} in ${b.recipient_city}!\n\n` +
      `Ref: ${b.reference_number}\n` +
      `Thank you 🙏 — ${op} via GPFLOW`
    );
  }

  const stepIdx = step === "find" ? 0 : step === "scan" ? 1 : 2;
  const stepLabels = ["Find", "Scan", "Done"];

  return (
    <Modal onClose={onClose}>
      <div style={{ position: "relative", padding: "8px 20px 28px" }}>
        <CloseBtn onClick={onClose} />

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 20, paddingRight: 40 }}>
          {stepLabels.map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: i < stepLabels.length - 1 ? 1 : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: i < stepIdx ? C.teal : i === stepIdx ? C.teal : C.border,
                  color: i <= stepIdx ? "#07090F" : C.textDim,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 800,
                }}>
                  {i < stepIdx ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: i === stepIdx ? C.teal : i < stepIdx ? C.textSub : C.textDim, whiteSpace: "nowrap" }}>
                  {label}
                </span>
              </div>
              {i < stepLabels.length - 1 && (
                <div style={{ flex: 1, height: 2, background: i < stepIdx ? C.teal : C.border, margin: "0 6px" }} />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP 1: FIND ── */}
        {step === "find" && (
          <>
            <div style={{ marginBottom: 14, paddingRight: 40 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Who is collecting?</div>
              <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
                Search by recipient name, sender name, or reference number. If someone else is picking up, ask for the sender's name or ref # from their WhatsApp confirmation.
              </div>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, city, or reference (GP-2026-XXXX)"
              autoFocus
              style={{
                width: "100%",
                background: C.card2,
                border: `1px solid ${C.accentBorder}`,
                borderRadius: 12, padding: "11px 14px",
                color: C.text, fontSize: 13, outline: "none",
                fontFamily: "'DM Sans',sans-serif",
                boxSizing: "border-box",
                marginBottom: 12,
              }}
            />

            <div style={{ maxHeight: "38vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px 0", color: C.textSub, fontSize: 13 }}>
                  <div style={{ marginBottom: 8 }}>No results for "{search}"</div>
                  <div style={{ fontSize: 12, color: C.textDim }}>
                    Ask them to show their WhatsApp confirmation and search by reference number (GP-2026-XXXX) or sender name.
                  </div>
                </div>
              )}
              {filtered.map((b) => (
                <div
                  key={b.id}
                  onClick={() => setSelected(b)}
                  style={{
                    background: selected?.id === b.id ? C.tealDim : C.card2,
                    border: `1px solid ${selected?.id === b.id ? C.teal : C.border}`,
                    borderRadius: 14, padding: "13px 16px", cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{b.recipient_name}</div>
                      <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
                        {b.recipient_city} · Sent by {b.sender_name}
                      </div>
                      <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{b.item_description}</div>
                    </div>
                    <code style={{ fontSize: 11, color: C.teal, fontFamily: "monospace", fontWeight: 700, flexShrink: 0, marginLeft: 10 }}>
                      {b.reference_number}
                    </code>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => { if (selected) setStep("scan"); }}
              disabled={!selected}
              style={{
                width: "100%",
                background: selected ? C.teal : C.border,
                color: selected ? "#07090F" : C.textDim,
                border: "none", borderRadius: 14,
                padding: "14px 20px", fontSize: 14, fontWeight: 800,
                cursor: selected ? "pointer" : "not-allowed",
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              {selected ? `📷 Scan QR for ${selected.recipient_name.split(" ")[0]}` : "Select a recipient above"}
            </button>
          </>
        )}

        {/* ── STEP 2: SCAN ── */}
        {step === "scan" && selected && (
          <>
            <div style={{ marginBottom: 14, paddingRight: 40 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Scan QR Code</div>
              <div style={{ fontSize: 12, color: C.textSub }}>
                Point camera at the QR code — on {selected.recipient_name.split(" ")[0]}'s phone screen or on the printed label on the package.
              </div>
            </div>

            {/* Camera viewfinder */}
            <div style={{
              background: "#000", borderRadius: 16,
              overflow: "hidden", marginBottom: 14,
              position: "relative", aspectRatio: "4/3",
            }}>
              {/* Hidden video + canvas for jsQR */}
              <video ref={videoRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: scanning && !scanDone ? "block" : "none" }} muted playsInline />
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Corner brackets */}
              {[["top-3 left-3", "tl"], ["top-3 right-3", "tr"], ["bottom-3 left-3", "bl"], ["bottom-3 right-3", "br"]].map(([pos, corner]) => (
                <div key={corner} style={{
                  position: "absolute",
                  top: pos.includes("top") ? 12 : "auto",
                  bottom: pos.includes("bottom") ? 12 : "auto",
                  left: pos.includes("left") ? 12 : "auto",
                  right: pos.includes("right") ? 12 : "auto",
                  width: 28, height: 28,
                  borderTop: corner.startsWith("t") ? `3px solid ${C.teal}` : "none",
                  borderBottom: corner.startsWith("b") ? `3px solid ${C.teal}` : "none",
                  borderLeft: corner.endsWith("l") ? `3px solid ${C.teal}` : "none",
                  borderRight: corner.endsWith("r") ? `3px solid ${C.teal}` : "none",
                  pointerEvents: "none",
                }} />
              ))}

              {/* Scanning line animation */}
              {scanning && !scanDone && (
                <div style={{
                  position: "absolute", left: "10%", right: "10%",
                  height: 2,
                  background: `linear-gradient(90deg,transparent,${C.teal},transparent)`,
                  animation: "scanline 1.4s ease-in-out infinite alternate",
                  top: "40%",
                }} />
              )}

              {/* Idle state (no camera) */}
              {!scanning && !scanDone && !camDenied && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <div style={{ fontSize: 32 }}>📱</div>
                  <span style={{ color: "#555", fontSize: 11 }}>Recipient's phone screen</span>
                  <div style={{ fontSize: 20, color: "#444" }}>·</div>
                  <div style={{ fontSize: 32 }}>📦</div>
                  <span style={{ color: "#555", fontSize: 11 }}>or printed label on package</span>
                </div>
              )}

              {/* Scan done */}
              {scanDone && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
                  <div style={{ fontSize: 14, color: C.teal, fontWeight: 700 }}>QR Scanned!</div>
                </div>
              )}

              {/* Camera denied */}
              {camDenied && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🚫</div>
                  <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>
                    Camera access denied. Ask the recipient for their reference number and search above.
                  </div>
                </div>
              )}
            </div>

            {/* After scan — confirm action */}
            {scanDone ? (
              <div>
                <div style={{
                  background: C.card2, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: "14px", marginBottom: 14,
                }}>
                  <code style={{ fontSize: 11, color: C.teal, fontFamily: "monospace", fontWeight: 700, display: "block", marginBottom: 8 }}>
                    {selected.reference_number} — Match confirmed ✓
                  </code>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      ["Recipient", selected.recipient_name],
                      ["City", selected.recipient_city],
                      ["Items", selected.item_description],
                      ["Sender", selected.sender_name],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 9, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <button
                    onClick={() => confirm("collected")}
                    disabled={loading}
                    style={{
                      background: C.teal, border: "none", borderRadius: 12,
                      padding: "14px", color: "#07090F",
                      fontSize: 13, fontWeight: 800, cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    <span style={{ fontSize: 22 }}>🤝</span>
                    <span>Collected</span>
                    <span style={{ fontSize: 10, opacity: 0.8 }}>Recipient picked up</span>
                  </button>
                  <button
                    onClick={() => confirm("delivered")}
                    disabled={loading}
                    style={{
                      background: C.accent, border: "none", borderRadius: 12,
                      padding: "14px", color: "#07090F",
                      fontSize: 13, fontWeight: 800, cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      fontFamily: "'DM Sans',sans-serif",
                    }}
                  >
                    <span style={{ fontSize: 22 }}>✅</span>
                    <span>Delivered</span>
                    <span style={{ fontSize: 10, opacity: 0.8 }}>We dropped it off</span>
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setScanDone(false)} style={ghostBtn}>← Rescan</button>
                  <button onClick={() => { setSelected(null); setScanDone(false); setStep("find"); }} style={ghostBtn}>← Search again</button>
                </div>
              </div>
            ) : (
              <div>
                {/* Simulate scan (demo fallback) */}
                <button
                  onClick={simulateScan}
                  style={{
                    width: "100%",
                    background: C.tealDim, border: `1px solid ${C.tealBorder}`,
                    borderRadius: 12, padding: "12px",
                    color: C.teal, fontSize: 13, fontWeight: 700,
                    cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                    marginBottom: 8,
                  }}
                >
                  📷 Simulate Scan (demo)
                </button>
                <button onClick={() => { setStep("find"); setScanDone(false); }} style={ghostBtn}>← Search again</button>
              </div>
            )}
          </>
        )}

        {/* ── STEP 3: DONE ── */}
        {step === "done" && selected && action && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>{action === "collected" ? "🤝" : "✅"}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: action === "collected" ? C.teal : C.accent, marginBottom: 6 }}>
              {action === "collected" ? "Collected!" : "Delivered!"}
            </div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 4 }}>
              {selected.recipient_name} · {selected.recipient_city}
            </div>

            {/* WA preview */}
            <div style={{
              background: "#070C16", border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "14px", marginBottom: 20, textAlign: "left",
            }}>
              <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, marginBottom: 8 }}>📲 Sent to {selected.sender_name}</div>
              <WaBubble
                msg={buildDoneMsg(selected, action)}
                time="Just now"
                operatorName={op}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => { setSelected(null); setScanDone(false); setAction(null); setStep("find"); setSearch(""); }}
                style={{
                  width: "100%",
                  background: C.card2, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: "12px",
                  color: C.text, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                }}
              >
                📷 Scan Another Package
              </button>
              <button
                onClick={onClose}
                style={{
                  width: "100%",
                  background: `linear-gradient(135deg,${C.teal},#0891B2)`,
                  border: "none", borderRadius: 12, padding: "13px",
                  color: "#07090F", fontSize: 14, fontWeight: 800,
                  cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                }}
              >
                Done ✓
              </button>
            </div>
          </div>
        )}

        <style>{`@keyframes scanline { from { top: 20%; } to { top: 75%; } }`}</style>
      </div>
    </Modal>
  );
}

const ghostBtn: React.CSSProperties = {
  flex: 1, background: "transparent",
  border: `1px solid ${C.border}`, borderRadius: 10,
  padding: "10px", color: C.textSub, fontSize: 12,
  fontWeight: 600, cursor: "pointer",
  fontFamily: "'DM Sans',sans-serif",
};
