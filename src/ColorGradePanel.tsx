/**
 * ColorGradePanel.tsx — Per-scene color grading controls.
 * Provides presets (Night, Sepia, B&W, etc.) + fine-tune sliders.
 * Compiles to Ren'Py MatrixColor on bg events via the compiler.
 */
import React, { useState } from "react";
import type { VNColorGrade } from "./types";

// ─── Presets ──────────────────────────────────────────────────────────────────
interface CGPreset { label: string; icon: string; grade: VNColorGrade; }

export const CG_PRESETS: CGPreset[] = [
  { label: "Normal",  icon: "☀️",  grade: { saturation: 1.0, brightness: 0.0, contrast: 1.0, sepia: 0.0 } },
  { label: "Night",   icon: "🌙",  grade: { saturation: 0.3, brightness: -0.4, contrast: 1.2, sepia: 0.0, tint: "#001833", tint_mix: 0.3 } },
  { label: "Sunset",  icon: "🌅",  grade: { saturation: 1.1, brightness: 0.05, contrast: 1.1, sepia: 0.15, tint: "#ff6633", tint_mix: 0.18 } },
  { label: "Sepia",   icon: "📷",  grade: { saturation: 0.1, brightness: -0.05, contrast: 0.95, sepia: 0.85 } },
  { label: "B&W",     icon: "⬛",  grade: { saturation: 0.0, brightness: 0.0, contrast: 1.0, sepia: 0.0 } },
  { label: "Warm",    icon: "🔥",  grade: { saturation: 1.15, brightness: 0.05, contrast: 1.05, sepia: 0.1, tint: "#ff9933", tint_mix: 0.1 } },
  { label: "Cool",    icon: "❄️",  grade: { saturation: 0.85, brightness: -0.05, contrast: 1.0, sepia: 0.0, tint: "#3366cc", tint_mix: 0.12 } },
  { label: "Vivid",   icon: "✨",  grade: { saturation: 1.5, brightness: 0.05, contrast: 1.15, sepia: 0.0 } },
  { label: "Horror",  icon: "🩸",  grade: { saturation: 0.2, brightness: -0.3, contrast: 1.3, sepia: 0.0, tint: "#440000", tint_mix: 0.35 } },
  { label: "Dream",   icon: "💭",  grade: { saturation: 0.7, brightness: 0.15, contrast: 0.85, sepia: 0.1, tint: "#aaccff", tint_mix: 0.2 } },
];

const DEFAULT_GRADE: VNColorGrade = { saturation: 1.0, brightness: 0.0, contrast: 1.0, sepia: 0.0 };

// ─── CSS filter string for preview ────────────────────────────────────────────
export function colorGradeToCss(cg: VNColorGrade | undefined): string {
  if (!cg) return "";
  const { saturation = 1, brightness = 0, contrast = 1, sepia = 0 } = cg;
  // Convert Ren'Py brightness (-1..1) to CSS brightness (0..2)
  const cssBrightness = 1 + brightness;
  return [
    `saturate(${saturation.toFixed(2)})`,
    `brightness(${cssBrightness.toFixed(2)})`,
    `contrast(${contrast.toFixed(2)})`,
    sepia > 0 ? `sepia(${sepia.toFixed(2)})` : null,
  ].filter(Boolean).join(" ");
}

// ─── Ren'Py MatrixColor string ────────────────────────────────────────────────
export function colorGradeToRenpy(cg: VNColorGrade | undefined): string | null {
  if (!cg) return null;
  const { saturation = 1, brightness = 0, contrast = 1, sepia = 0, tint, tint_mix = 0 } = cg;
  const isNormal = saturation === 1 && brightness === 0 && contrast === 1 && sepia === 0 && !tint;
  if (isNormal) return null;

  const parts: string[] = [];
  if (saturation !== 1) parts.push(`SaturationMatrix(${saturation.toFixed(2)})`);
  if (brightness !== 0) parts.push(`BrightnessMatrix(${brightness.toFixed(2)})`);
  if (contrast !== 1)   parts.push(`ContrastMatrix(${contrast.toFixed(2)})`);
  if (sepia > 0)        parts.push(`SepiaMatrix(${sepia.toFixed(2)})`);
  if (tint && tint_mix && tint_mix > 0) parts.push(`TintMatrix("${tint}", ${tint_mix.toFixed(2)})`);

  if (!parts.length) return null;
  return parts.join(" * ");
}

// ─── Slider helper ────────────────────────────────────────────────────────────
function CGSlider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const fmt = format ?? (v => v.toFixed(2));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: "var(--dim)", width: 80, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: "var(--acc2)", height: 4 }} />
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text)", width: 40, textAlign: "right", flexShrink: 0 }}>
        {fmt(value)}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  grade: VNColorGrade | undefined;
  onChange: (grade: VNColorGrade | undefined) => void;
}

export function ColorGradePanel({ grade, onChange }: Props) {
  const [open, setOpen] = useState(!!grade);
  const cg = grade ?? DEFAULT_GRADE;
  const active = grade != null && colorGradeToRenpy(grade) !== null;

  const set = (key: keyof VNColorGrade, value: number | string) => {
    onChange({ ...cg, [key]: value });
  };

  return (
    <div style={{ borderTop: "1px solid var(--bdr)", marginTop: 8 }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "none", border: "none",
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", cursor: "pointer",
          color: active ? "var(--acc2)" : "var(--dim)", fontSize: 11,
        }}
      >
        <span style={{ fontSize: 15 }}>🎨</span>
        <span style={{ fontWeight: 700, flex: 1, textAlign: "left" }}>
          Color Grade {active ? "●" : "(off)"}
        </span>
        <span style={{ fontSize: 10, color: "var(--faint)" }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {/* Preset grid */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
            {CG_PRESETS.map(p => {
              const isCurrent = grade &&
                p.grade.saturation === cg.saturation &&
                p.grade.brightness === cg.brightness &&
                p.grade.contrast   === cg.contrast &&
                p.grade.sepia      === cg.sepia;
              return (
                <button key={p.label}
                  onClick={() => onChange(p.label === "Normal" ? undefined : { ...p.grade })}
                  title={p.label}
                  style={{
                    padding: "4px 8px", fontSize: 11, borderRadius: 6, cursor: "pointer",
                    background: isCurrent ? "rgba(75,108,247,0.2)" : "var(--bg3)",
                    border: `1px solid ${isCurrent ? "var(--acc2)" : "var(--bdr)"}`,
                    color: isCurrent ? "var(--acc2)" : "var(--dim)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Fine-tune sliders */}
          <div style={{ fontSize: 10, color: "var(--faint)", marginBottom: 8 }}>Fine tune</div>
          <CGSlider label="Saturation" value={cg.saturation} min={0} max={2} step={0.05}
            onChange={v => set("saturation", v)} />
          <CGSlider label="Brightness" value={cg.brightness} min={-1} max={1} step={0.05}
            onChange={v => set("brightness", v)} />
          <CGSlider label="Contrast"   value={cg.contrast}   min={0} max={2} step={0.05}
            onChange={v => set("contrast", v)} />
          <CGSlider label="Sepia"      value={cg.sepia}      min={0} max={1} step={0.05}
            onChange={v => set("sepia", v)} />

          {/* Tint */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 10, color: "var(--dim)", width: 80, flexShrink: 0 }}>Tint</span>
            <input type="color" value={cg.tint ?? "#000000"}
              onChange={e => set("tint", e.target.value)}
              style={{ width: 32, height: 24, border: "none", borderRadius: 4, cursor: "pointer", background: "none" }} />
            <input type="range" min={0} max={1} step={0.05} value={cg.tint_mix ?? 0}
              onChange={e => set("tint_mix", parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: cg.tint ?? "var(--acc2)", height: 4 }} />
            <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text)", width: 40, textAlign: "right", flexShrink: 0 }}>
              {((cg.tint_mix ?? 0) * 100).toFixed(0)}%
            </span>
          </div>

          {/* Clear */}
          {grade && (
            <button className="btn btn-ghost" style={{ marginTop: 10, fontSize: 11, color: "var(--err)", width: "100%" }}
              onClick={() => onChange(undefined)}>
              ✕ Remove Color Grade
            </button>
          )}

          {/* Ren'Py output preview */}
          {grade && colorGradeToRenpy(grade) && (
            <div style={{ marginTop: 10, padding: "6px 10px", background: "var(--bg0)", borderRadius: 6, fontSize: 10, fontFamily: "var(--mono)", color: "var(--faint)", wordBreak: "break-all" }}>
              matrixcolor={colorGradeToRenpy(grade)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
