/**
 * ColorPicker.tsx — Full HSB colour wheel picker (Aseprite-inspired).
 *
 * Renders:
 *  - Circular hue ring + saturation/brightness triangle drawn on <canvas>
 *  - Hex input, RGB sliders, Alpha slider
 *  - Recent-colours strip (last 8, stored in localStorage)
 *  - Collapsible built-in palette swatch grid
 *
 * The onPick(hex) callback API is identical to the old implementation.
 */
import React, {
  useRef, useEffect, useState, useCallback, useMemo,
} from "react";
import { BUILT_IN_PALETTES } from "./colorPalettes";
import type { PaletteColor, ColorPalette } from "./colorPalettes";

// ── helpers ────────────────────────────────────────────────────────────────

function hexToHsb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const bri = max;
  const sat = max === 0 ? 0 : d / max;
  let hue = 0;
  if (d !== 0) {
    if (max === r)      hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else                hue = ((r - g) / d + 4) / 6;
  }
  return [hue, sat, bri];
}

function hsbToHex(h: number, s: number, b: number): string {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = b * (1 - s), q = b * (1 - f * s), t = b * (1 - (1 - f) * s);
  let r = 0, g = 0, bv = 0;
  switch (i % 6) {
    case 0: r = b;  g = t;  bv = p;  break;
    case 1: r = q;  g = b;  bv = p;  break;
    case 2: r = p;  g = b;  bv = t;  break;
    case 3: r = p;  g = q;  bv = b;  break;
    case 4: r = t;  g = p;  bv = b;  break;
    case 5: r = b;  g = p;  bv = q;  break;
  }
  const toH = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toH(r)}${toH(g)}${toH(bv)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)];
}

function contrastText(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? "#000" : "#fff";
}

function isValidHex(s: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(s);
}

const RECENT_KEY = "vnv_recent_colors";
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function pushRecent(hex: string) {
  const list = [hex, ...loadRecent().filter(h => h !== hex)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

// ── Canvas wheel ───────────────────────────────────────────────────────────

const RING = 18;   // hue ring thickness px

function drawWheel(canvas: HTMLCanvasElement, hue: number, sat: number, bri: number) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const outerR = Math.min(cx, cy) - 2;
  const innerR = outerR - RING;

  ctx.clearRect(0, 0, W, H);

  // ── Hue ring ──────────────────────────────────────────────────────────────
  for (let deg = 0; deg < 360; deg++) {
    const a1 = ((deg - 0.5) * Math.PI) / 180;
    const a2 = ((deg + 0.5) * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, a1, a2);
    ctx.arc(cx, cy, innerR, a2, a1, true);
    ctx.fillStyle = `hsl(${deg}, 100%, 50%)`;
    ctx.fill();
  }

  // Subtle inner border — separates ring from triangle
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Outer ring border
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Hue cursor — glowing ring with shadow
  const hRad = hue * 2 * Math.PI - Math.PI / 2;
  const hMarkerR = (outerR + innerR) / 2;
  const hx = cx + hMarkerR * Math.cos(hRad);
  const hy = cy + hMarkerR * Math.sin(hRad);
  const hueColor = `hsl(${Math.round(hue * 360)}, 100%, 50%)`;

  ctx.shadowColor = hueColor;
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.arc(hx, hy, 8, 0, Math.PI * 2);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(hx, hy, 5, 0, Math.PI * 2);
  ctx.fillStyle = hueColor;
  ctx.fill();

  // ── SB Triangle ───────────────────────────────────────────────────────────
  const triR = innerR - 8;
  const A = { x: cx + triR * Math.cos(hRad),                      y: cy + triR * Math.sin(hRad) };
  const B = { x: cx + triR * Math.cos(hRad + (2 * Math.PI) / 3), y: cy + triR * Math.sin(hRad + (2 * Math.PI) / 3) };
  const C = { x: cx + triR * Math.cos(hRad - (2 * Math.PI) / 3), y: cy + triR * Math.sin(hRad - (2 * Math.PI) / 3) };

  // Drop-shadow for the triangle
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur  = 10;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y);
  ctx.closePath();
  ctx.fillStyle = "#000"; // shadow only, not visible
  ctx.fill();
  ctx.restore();

  // Clip and fill the saturation-brightness gradients
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y);
  ctx.closePath();
  ctx.clip();

  // Black → hue (saturation axis)
  const gHue = ctx.createLinearGradient(C.x, C.y, A.x, A.y);
  gHue.addColorStop(0, "#000");
  gHue.addColorStop(1, `hsl(${Math.round(hue * 360)}, 100%, 50%)`);
  ctx.fillStyle = gHue;
  ctx.fill();

  // Transparent → white (brightness axis)
  const gWhite = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
  gWhite.addColorStop(0, "rgba(255,255,255,0)");
  gWhite.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = gWhite;
  ctx.fill();

  ctx.restore();

  // Triangle border — thin glow matching hue
  ctx.save();
  ctx.shadowColor = `hsla(${Math.round(hue * 360)}, 80%, 60%, 0.7)`;
  ctx.shadowBlur  = 6;
  ctx.beginPath();
  ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y);
  ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();

  // ── SB cursor — large with drop-shadow ───────────────────────────────────
  const px = sat * bri * A.x + (1 - sat) * bri * B.x + (1 - bri) * C.x;
  const py = sat * bri * A.y + (1 - sat) * bri * B.y + (1 - bri) * C.y;
  const cursorColor = hsbToHex(hue, sat, bri);

  // Outer white ring + shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur  = 6;
  ctx.beginPath();
  ctx.arc(px, py, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();

  // Inner colour
  ctx.beginPath();
  ctx.arc(px, py, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = cursorColor;
  ctx.fill();

  // Thin dark ring for contrast on light colours
  ctx.beginPath();
  ctx.arc(px, py, 6.5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth   = 1;
  ctx.stroke();
}

// ── Main component ─────────────────────────────────────────────────────────

export interface ColorPickerProps {
  onPick?: (hex: string) => void;
  onChange?: (hex: string) => void;
  projectColors?: PaletteColor[];
  initialColor?: string;
}

export function ColorPicker({ onPick, onChange, projectColors, initialColor = "#4b6cfb" }: ColorPickerProps) {
  const [hsb, setHsb]         = useState<[number, number, number]>(() => hexToHsb(initialColor));
  const [hexInput, setHexInput] = useState(initialColor);
  const [alpha, setAlpha]      = useState(255);
  const [recent, setRecent]    = useState<string[]>(loadRecent);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteId, setPaletteId]     = useState("renpy-dark");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging  = useRef<"hue" | "sb" | null>(null);

  const hex = useMemo(() => hsbToHex(...hsb), [hsb]);
  const [r, g, b] = useMemo(() => hexToRgb(hex), [hex]);

  // Sync hex input when HSB changes
  useEffect(() => { 
    setHexInput(hex); 
    onChange?.(hex);
  }, [hex, onChange]);

  // Redraw wheel
  useEffect(() => {
    if (canvasRef.current) drawWheel(canvasRef.current, ...hsb);
  }, [hsb]);

  // ── Canvas interaction ─────────────────────────────────────────────────
  const processCanvasPoint = useCallback((cx_: number, cy_: number, rect: DOMRect, mode: "hue" | "sb") => {
    const canvas = canvasRef.current!;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const outerR = Math.min(cx, cy) - 2;
    const innerR = outerR - RING;
    const triR   = innerR - 8;
    const mx = (cx_ - rect.left) * (W / rect.width) - cx;
    const my = (cy_ - rect.top)  * (H / rect.height) - cy;

    if (mode === "hue") {
      const angle = Math.atan2(my, mx);
      const newHue = ((angle / (2 * Math.PI)) + 1) % 1;
      setHsb(([, s, bv]) => [newHue, s, bv]);
    } else {
      // Invert barycentric from triangle
      const [hue, sat, bri] = hsb;
      const hRad = hue * 2 * Math.PI - Math.PI / 2;
      const A = { x: triR * Math.cos(hRad),                        y: triR * Math.sin(hRad) };
      const B = { x: triR * Math.cos(hRad + (2 * Math.PI) / 3),   y: triR * Math.sin(hRad + (2 * Math.PI) / 3) };
      const C = { x: triR * Math.cos(hRad - (2 * Math.PI) / 3),   y: triR * Math.sin(hRad - (2 * Math.PI) / 3) };
      // Solve for barycentric coords
      const denom = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
      const wA = ((B.y - C.y) * (mx - C.x) + (C.x - B.x) * (my - C.y)) / denom;
      const wB = ((C.y - A.y) * (mx - C.x) + (A.x - C.x) * (my - C.y)) / denom;
      const wC = 1 - wA - wB;
      if (wA >= 0 && wB >= 0 && wC >= 0) {
        const newBri = Math.max(0, Math.min(1, wA + wB));
        const newSat = newBri === 0 ? 0 : Math.max(0, Math.min(1, wA / newBri));
        setHsb([hue, newSat, newBri]);
      }
    }
  }, [hsb]);

  const onCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const outerR = Math.min(cx, cy) - 2;
    const innerR = outerR - RING;
    const mx = (e.clientX - rect.left) * (W / rect.width) - cx;
    const my = (e.clientY - rect.top)  * (H / rect.height) - cy;
    const dist = Math.sqrt(mx * mx + my * my);
    if (dist >= innerR && dist <= outerR) {
      dragging.current = "hue";
    } else if (dist < innerR - 6) {
      dragging.current = "sb";
    }
    processCanvasPoint(e.clientX, e.clientY, rect, dragging.current ?? "sb");
  }, [processCanvasPoint]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !canvasRef.current) return;
      processCanvasPoint(e.clientX, e.clientY, canvasRef.current.getBoundingClientRect(), dragging.current);
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [processCanvasPoint]);

  // ── Pick / emit ────────────────────────────────────────────────────────
  const pick = useCallback((h: string) => {
    pushRecent(h);
    setRecent(loadRecent());
    onPick?.(h);
  }, [onPick]);

  const handleHexInput = (s: string) => {
    setHexInput(s);
    const clean = s.startsWith("#") ? s : "#" + s;
    if (isValidHex(clean)) setHsb(hexToHsb(clean.slice(0, 7)));
  };

  const palettes = useMemo<ColorPalette[]>(() => {
    const list = [...BUILT_IN_PALETTES];
    if (projectColors?.length) list.unshift({ id: "project", label: "Project Theme", colors: projectColors });
    return list;
  }, [projectColors]);

  const activePalette = palettes.find(p => p.id === paletteId) ?? palettes[0];

  // ── Slider helpers ─────────────────────────────────────────────────────
  const Slider = ({ label, value, max, color, onChange }: { label: string; value: number; max: number; color: string; onChange: (v: number) => void }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
      <span style={{ width: 12, color: "var(--dim)", fontWeight: 700 }}>{label}</span>
      <div style={{ flex: 1, position: "relative", height: 10 }}>
        <input type="range" min={0} max={max} value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          style={{ width: "100%", accentColor: color }}
        />
      </div>
      <span style={{ width: 26, textAlign: "right", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 10 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "row", gap: 24, padding: "8px", height: "100%", width: "100%" }}>

      {/* Left side: Wheel & Hex Input */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "0 0 200px" }}>
        <canvas
          ref={canvasRef}
          width={200} height={200}
          style={{ width: "100%", aspectRatio: "1", borderRadius: 8, cursor: "crosshair", userSelect: "none" }}
          onMouseDown={onCanvasMouseDown}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            onClick={() => pick(hex)}
            style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: hex, cursor: "pointer", border: "2px solid var(--bdr)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: contrastText(hex), fontWeight: 700,
            }}
            title="Click to pick this colour"
          >PICK</div>
          <input
            value={hexInput}
            onChange={e => handleHexInput(e.target.value)}
            onBlur={() => { if (isValidHex(hexInput)) pick(hexInput.startsWith("#") ? hexInput : "#" + hexInput); }}
            onKeyDown={e => { if (e.key === "Enter") pick(isValidHex(hexInput) ? (hexInput.startsWith("#") ? hexInput : "#" + hexInput) : hex); }}
            style={{
              flex: 1, background: "var(--bg3)", border: "1px solid var(--bdr)",
              borderRadius: 6, color: "var(--text)", fontFamily: "var(--mono)",
              fontSize: 13, padding: "6px 10px", outline: "none", width: "100%"
            }}
            placeholder="#4b6cfb"
            maxLength={7}
          />
        </div>
      </div>

      {/* Right side: Sliders, Recent, Palettes */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 200 }}>
        {/* RGB Sliders */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", background: "var(--bg3)", borderRadius: 8, border: "1px solid var(--bdr)" }}>
          <Slider label="R" value={r} max={255} color="#f87171"
            onChange={v => setHsb(hexToHsb(`#${v.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`))} />
          <Slider label="G" value={g} max={255} color="#4ade80"
            onChange={v => setHsb(hexToHsb(`#${r.toString(16).padStart(2,"0")}${v.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`))} />
          <Slider label="B" value={b} max={255} color="#60a5fa"
            onChange={v => setHsb(hexToHsb(`#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${v.toString(16).padStart(2,"0")}`))} />
          <Slider label="A" value={alpha} max={255} color="var(--dim)"
            onChange={v => setAlpha(v)} />
        </div>

        {/* Recent & Palettes Row */}
        <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
          {/* Recent colours */}
          <div style={{ flex: "0 0 100px", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "var(--faint)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>Recent</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignContent: "flex-start" }}>
              {recent.map(rc => (
                <button key={rc} title={rc}
                  onClick={() => { setHsb(hexToHsb(rc)); pick(rc); }}
                  style={{
                    width: 20, height: 20, borderRadius: 4, border: "1px solid var(--bdr)",
                    background: rc, cursor: "pointer", flexShrink: 0,
                    transition: "transform .1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.2)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                />
              ))}
              {recent.length === 0 && <span style={{ fontSize: 10, color: "var(--faint)" }}>None</span>}
            </div>
          </div>

          {/* Palette section */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--faint)", letterSpacing: ".1em", textTransform: "uppercase" }}>Palettes</div>
              <select
                value={paletteId}
                onChange={e => setPaletteId(e.target.value)}
                style={{
                  flex: 1, padding: "2px 6px", borderRadius: 4,
                  border: "1px solid var(--bdr)", background: "var(--bg3)",
                  color: "var(--text)", fontSize: 11, outline: "none",
                }}
              >
                {palettes.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(20px, 1fr))", gap: 4,
              background: "var(--bg3)", borderRadius: 6, border: "1px solid var(--bdr)", padding: 8,
              overflowY: "auto", flex: 1, alignContent: "flex-start"
            }}>
              {activePalette.colors.map(color => (
                <button key={color.hex + color.name} title={color.name ?? color.hex}
                  onClick={() => { const h = color.hex.startsWith("#") ? color.hex : "#" + color.hex; setHsb(hexToHsb(h)); pick(h); }}
                  style={{
                    aspectRatio: "1", borderRadius: 3, border: "1px solid rgba(0,0,0,0.2)",
                    background: color.hex, cursor: "pointer",
                    transition: "transform .1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.2)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
