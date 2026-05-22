import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { C } from "../lib/tokens";
import { api } from "../lib/api";
import { useMe } from "../hooks/useAuth";
import type { Operator } from "../types";

const inputStyle = {
  width: "100%",
  background: C.card2,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 14px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  fontFamily: "'DM Sans',sans-serif",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  fontSize: 11,
  color: C.textSub,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  marginBottom: 6,
  display: "block",
};

function Field({
  label, name, value, onChange, placeholder, type = "text", maxLength,
}: {
  label: string; name: string; value: string; onChange: (n: string, v: string) => void;
  placeholder?: string; type?: string; maxLength?: number;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={inputStyle}
      />
    </div>
  );
}

export default function SettingsPage() {
  const navigate             = useNavigate();
  const qc                   = useQueryClient();
  const { data: operator }   = useMe();
  const [saving, setSaving]  = useState(false);
  const [saved, setSaved]    = useState(false);
  const [error, setError]    = useState<string | null>(null);

  const [form, setForm] = useState<Record<string, string>>({});

  function val(field: keyof Operator): string {
    if (field in form) return form[field as string];
    return (operator?.[field] as string | undefined) ?? "";
  }

  function set(name: string, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
    setSaved(false);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !Object.keys(form).length) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch<Operator>("/operators/me", form);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["operator", "me"] });
      setForm({});
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const hasMailingAddress = !!(
    operator?.mailing_address_line1 || operator?.mailing_city
  );

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      {/* Nav */}
      <div style={{
        background: "rgba(7,13,24,0.95)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`, padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <button
          onClick={() => navigate("/dashboard")}
          style={{
            background: "none", border: "none", color: C.textSub,
            fontSize: 13, cursor: "pointer", padding: 0,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          ← Dashboard
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 13, fontWeight: 700 }}>⚙️ Settings</div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px 60px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Settings</h1>
        <p style={{ fontSize: 13, color: C.textSub, marginBottom: 28 }}>
          Manage your profile, preferences, and mailing address.
        </p>

        <form onSubmit={save}>
          {/* ── Profile ──────────────────────────────────────────────────────── */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: "22px", marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 18 }}>Profile</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Your name"     name="name"          value={val("name")}          onChange={set} />
              <Field label="Business name" name="business_name" value={val("business_name")} onChange={set} />
              <Field label="City"          name="city"          value={val("city")}          onChange={set} />
              <Field label="Country (2-letter)" name="country"  value={val("country")}       onChange={set} maxLength={2} placeholder="US" />
            </div>
          </div>

          {/* ── Mailing address ───────────────────────────────────────────────── */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: "22px", marginBottom: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>📬 Mailing Address</div>
              {hasMailingAddress && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: C.accent,
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 6, padding: "2px 8px",
                }}>ACTIVE</span>
              )}
            </div>
            <p style={{ fontSize: 12, color: C.textSub, marginBottom: 16, lineHeight: 1.6 }}>
              Where out-of-area customers can mail packages to you. Shown prominently on your public trip page.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Address line 1" name="mailing_address_line1" value={val("mailing_address_line1")} onChange={set} placeholder="123 Main St" />
              <Field label="Address line 2 (optional)" name="mailing_address_line2" value={val("mailing_address_line2")} onChange={set} placeholder="Apt 4B, c/o John Smith" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 14 }}>
                <Field label="City"  name="mailing_city"  value={val("mailing_city")}  onChange={set} />
                <Field label="State" name="mailing_state" value={val("mailing_state")} onChange={set} placeholder="NY" />
                <Field label="ZIP"   name="mailing_zip"   value={val("mailing_zip")}   onChange={set} placeholder="10001" />
              </div>
              <Field label="Country (2-letter)" name="mailing_country" value={val("mailing_country") || "US"} onChange={set} maxLength={2} placeholder="US" />
              <div>
                <label style={labelStyle}>Mailing instructions (optional)</label>
                <textarea
                  value={val("mailing_instructions")}
                  onChange={(e) => set("mailing_instructions", e.target.value)}
                  placeholder='e.g. "Write your booking ref on the outside of the box. Call me when shipped."'
                  maxLength={1000}
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    lineHeight: 1.6,
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── Actions ──────────────────────────────────────────────────────── */}
          {error && (
            <div style={{
              background: "#1A0A0A", border: "1px solid #7F1D1D",
              borderRadius: 10, padding: "12px 16px",
              fontSize: 13, color: "#FCA5A5", marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {saved && (
            <div style={{
              background: C.accentDim, border: `1px solid ${C.accentBorder}`,
              borderRadius: 10, padding: "12px 16px",
              fontSize: 13, color: C.accent, marginBottom: 16,
            }}>
              ✓ Settings saved successfully
            </div>
          )}

          <button
            type="submit"
            disabled={saving || Object.keys(form).length === 0}
            style={{
              width: "100%",
              background: Object.keys(form).length === 0
                ? C.card2
                : `linear-gradient(135deg,${C.accent},#00A87A)`,
              border: "none", borderRadius: 12, padding: "14px",
              color: Object.keys(form).length === 0 ? C.textSub : "#07090F",
              fontSize: 14, fontWeight: 800, cursor: Object.keys(form).length === 0 ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans',sans-serif",
              opacity: saving ? 0.6 : 1,
              transition: "all 0.15s",
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
