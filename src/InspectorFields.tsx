/**
 * InspectorFields.tsx — Field widgets used by the event inspector.
 */
import React, { useRef, useEffect, useState } from "react";
import { VN_TRANSITIONS } from "./types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "./translationContext";

// ─── Shared sub-components ────────────────────────────────────────────────────

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="label" style={{ marginBottom: 4 }}>{children}</div>;
}

export function Row({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) {
  return <div className="row wrap" style={{ gap }}>{children}</div>;
}

export function ChipRow({ options, value, onChange }: {
  options: string[];
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Row>
      {options.map((o) => (
        <button key={o} className={`legacy-tool-btn ${value === o ? "active" : ""}`} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </Row>
  );
}

// ─── Asset Picker (image or audio) ────────────────────────────────────────────
// Shows the chosen file. Files are picked from the asset sidebar or the full
// asset browser.

export function AssetPicker({
  value, onChange, onOpenFullBrowser,
}: {
  value: string;
  onChange: (v: string) => void;
  onOpenFullBrowser?: () => void;
}) {
  const { t: tr } = useTranslation();

  return (
    <div className="col gap8">
      {/* Current selection chip */}
      <div className="card" style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
        {value ? (
          <>
            <span style={{ fontSize: 12, color: "var(--teal)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ✓ {value.split("/").pop()}
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: "1px 6px", flexShrink: 0 }}
              onClick={() => onChange("")}>✕</button>
          </>
        ) : (
          <span style={{ fontSize: 11, color: "var(--faint)" }}>{tr('inspector.no_file')} (Pick from left sidebar)</span>
        )}
      </div>

      {/* Open Full Browser shortcut */}
      {onOpenFullBrowser && (
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onOpenFullBrowser}>
          {tr('inspector.open_browser')}
        </button>
      )}

    </div>
  );
}


// ─── DraggableNumber ─────────────────────────────────────────────────────────
// Inspired by ActionEditor3's DraggableValue:
//   Drag ⟷ left/right to scrub the value · Click to open a text input

export function DraggableNumber({
  value, onChange, min, max, step = 0.1, suffix = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");
  const startX   = useRef<number>(0);
  const startVal = useRef<number>(0);
  const dragged  = useRef(false);
  const { t: tr } = useTranslation();

  const clamp = (n: number) => {
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    return parseFloat(n.toFixed(2));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    startX.current   = e.clientX;
    startVal.current = value;
    dragged.current  = false;
    const onMove = (me: MouseEvent) => {
      const delta = me.clientX - startX.current;
      if (Math.abs(delta) > 2) dragged.current = true;
      if (dragged.current) onChange(clamp(startVal.current + delta * step * 0.12));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
      if (!dragged.current) { setEditVal(String(value)); setEditing(true); }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={editVal}
        step={step}
        onChange={e => setEditVal(e.target.value)}
        onBlur={() => { const n = parseFloat(editVal); if (!isNaN(n)) onChange(clamp(n)); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === "Enter")  { const n = parseFloat(editVal); if (!isNaN(n)) onChange(clamp(n)); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        style={{
          width: 100, background: "var(--bg3)", border: "1px solid var(--acc)",
          borderRadius: 5, color: "var(--text)", fontSize: 13,
          fontFamily: "var(--mono)", padding: "4px 8px", outline: "none",
        }}
      />
    );
  }

  return (
    <span
      onMouseDown={handleMouseDown}
      title="Drag ⟷ to scrub · Click to type a value"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        cursor: "ew-resize", userSelect: "none",
        padding: "4px 10px", borderRadius: 5,
        background: "var(--bg3)", border: "1px solid var(--bdr)",
        color: "var(--teal)", fontWeight: 700,
        fontFamily: "var(--mono)", fontSize: 14,
        transition: "border-color 0.1s",
      }}
    >
      {value.toFixed(2)}{suffix}
      <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 400, display: "flex", gap: 4, alignItems: "center" }}>⟷ {tr('inspector.drag')}</span>
    </span>
  );
}

// ─── ATL Transform Field (Item #9) ────────────────────────────────────────────

const ATL_PRESETS = [
  { label: "Zoom in",    code: "zoom 1.2\nlinear 2.0 zoom 1.0" },
  { label: "Fade in",   code: "alpha 0.0\nlinear 0.8 alpha 1.0" },
  { label: "Shake",     code: "parallel:\n    ease 0.1 xoffset 8\n    ease 0.1 xoffset -8\n    ease 0.1 xoffset 0" },
  { label: "Pan right", code: "xoffset -80\nlinear 4.0 xoffset 0" },
];

export function AtlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const { t: tr } = useTranslation();

  const getProp = (prop: string, def: number) => {
    if (!value) return def;
    const m = value.match(new RegExp(`${prop}\\s+([0-9.-]+)`));
    return m ? parseFloat(m[1]) : def;
  };

  const setProp = (prop: string, val: number) => {
    let c = value || "";
    const regex = new RegExp(`^(\\s*)${prop}\\s+[0-9.-]+`, "m");
    if (regex.test(c)) {
      c = c.replace(regex, `$1${prop} ${val}`);
    } else {
      c += (c ? "\n" : "") + `${prop} ${val}`;
    }
    onChange(c.trim());
  };

  return (
    <div className="col gap4">
      <button
        className="btn btn-ghost"
        style={{ fontSize: 11, justifyContent: "flex-start", gap: 6 }}
        onClick={() => setOpen(o => !o)}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span style={{ color: value ? "var(--acc2)" : "var(--dim)" }}>
          {tr('inspector.atl_label')} {value ? "●" : "(optional)"}
        </span>
      </button>
      {open && (
        <div className="col gap8" style={{ paddingLeft: 8 }}>
          
          {/* Visual Sliders */}
          <div className="col gap6" style={{ background: "var(--bg1)", padding: 10, borderRadius: 6, border: "1px solid var(--bdr)" }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 4 }}>
              <Label>{tr('inspector.atl_props')}</Label>
              <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 6px" }} onClick={() => setShowRaw(!showRaw)}>
                {showRaw ? tr('inspector.hide_raw') : tr('inspector.show_raw')}
              </button>
            </div>

            <div className="row wrap gap12" style={{ marginTop: 4 }}>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>Zoom</span>
                <DraggableNumber value={getProp("zoom", 1.0)} onChange={v => setProp("zoom", v)} min={0} max={10} step={0.05} suffix="x" />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>Alpha</span>
                <DraggableNumber value={getProp("alpha", 1.0)} onChange={v => setProp("alpha", v)} min={0} max={1.0} step={0.05} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>Rotate</span>
                <DraggableNumber value={getProp("rotate", 0)} onChange={v => setProp("rotate", v)} min={-360} max={360} step={1} suffix="°" />
              </div>
            </div>

            <div className="row wrap gap12">
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>X Align</span>
                <DraggableNumber value={getProp("xalign", 0.5)} onChange={v => setProp("xalign", v)} min={-2.0} max={2.0} step={0.01} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>Y Align</span>
                <DraggableNumber value={getProp("yalign", 1.0)} onChange={v => setProp("yalign", v)} min={-2.0} max={2.0} step={0.01} />
              </div>
            </div>
          </div>

          {/* Raw Code Textarea */}
          {showRaw && (
            <div className="col gap4">
              <div className="sublabel">
                Ren'Py ATL block inserted after the scene/show statement.
              </div>
              {/* Preset buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {ATL_PRESETS.map(p => (
                  <button key={p.label} className="btn btn-ghost"
                    style={{ fontSize: 10, padding: "2px 7px" }}
                    title={p.code}
                    onClick={() => onChange(value ? value + "\n" + p.code : p.code)}>
                    {p.label}
                  </button>
                ))}
                {value && (
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 7px", color: "var(--err)" }}
                    onClick={() => onChange("")}>✕ Clear</button>
                )}
              </div>
              <textarea
                className="inspector-input mono"
                rows={5}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={"zoom 1.0\nlinear 2.0 zoom 1.05"}
                spellCheck={false}
                style={{ resize: "vertical", fontFamily: "var(--mono)", fontSize: 11 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rich Text Area (with formatting toolbar) ─────────────────────────────────

export function RichTextarea({ value, onChange, placeholder }: { value: string, onChange: (v: string) => void, placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const applyTag = (open: string, close: string) => {
    if (!ref.current) return;
    const start = ref.current.selectionStart;
    const end = ref.current.selectionEnd;
    const selected = value.substring(start, end);
    const newVal = value.substring(0, start) + open + selected + close + value.substring(end);
    onChange(newVal);
    setTimeout(() => {
      ref.current!.focus();
      ref.current!.setSelectionRange(start + open.length, end + open.length);
    }, 0);
  };

  return (
    <div className="col" style={{ background: "var(--bg1)", borderLeft: "4px solid var(--teal)", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3)" }}>
      <div className="row gap4" style={{ padding: "4px 8px", background: "var(--bg2)", borderBottom: "1px solid var(--bdr)", overflowX: "auto" }}>
        <button className="btn btn-ghost" style={{ padding: "2px 6px", fontWeight: "bold", fontSize: 11 }} onClick={() => applyTag("{b}", "{/b}")} title="Bold">B</button>
        <button className="btn btn-ghost" style={{ padding: "2px 6px", fontStyle: "italic", fontSize: 11, fontFamily: "serif" }} onClick={() => applyTag("{i}", "{/i}")} title="Italic">I</button>
        <button className="btn btn-ghost" style={{ padding: "2px 6px", textDecoration: "line-through", fontSize: 11 }} onClick={() => applyTag("{s}", "{/s}")} title="Strikethrough">S</button>
        <div style={{ width: 1, height: 14, background: "var(--bdr)", margin: "0 2px" }} />
        <button className="btn btn-ghost" style={{ padding: "2px 6px", color: "#60a5fa", fontSize: 11 }} onClick={() => applyTag("{color=#60a5fa}", "{/color}")} title="Text Color">Color</button>
        <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => applyTag("{size=30}", "{/size}")} title="Text Size">Size</button>
        <div style={{ width: 1, height: 14, background: "var(--bdr)", margin: "0 2px" }} />
        <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => applyTag("{cps=20}", "{/cps}")} title="Typing Speed (Characters Per Second)">Speed</button>
        <div style={{ width: 1, height: 14, background: "var(--bdr)", margin: "0 2px" }} />
        <button className="btn btn-ghost" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => applyTag("{rb}", "{/rb}{rt}ruby{/rt}")} title="Ruby Text">Ruby</button>
      </div>
      <textarea
        ref={ref}
        className="inspector-input"
        rows={5}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          border: "none", resize: "vertical", minHeight: 100, fontSize: 13, lineHeight: 1.6, padding: "12px", background: "transparent", boxShadow: "none"
        }}
      />
    </div>
  );
}

export function TransitionPicker({ value, onChange }: { value: string | null | undefined, onChange: (v: string) => void }) {
  const [hovTrans, setHovTrans] = useState<string | null>(null);

  const key = hovTrans || "none";

  return (
    <div className="col gap8">
      <style>{`
        @keyframes vnv-dissolve-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vnv-fade-in { 0% { opacity: 0; } 50% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes vnv-wipeleft-in { from { clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%); } to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } }
        @keyframes vnv-wiperight-in { from { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); } to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } }
        @keyframes vnv-wipeup-in { from { clip-path: polygon(0 100%, 100% 100%, 100% 100%, 0 100%); } to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } }
        @keyframes vnv-wipedown-in { from { clip-path: polygon(0 0, 100% 0, 100% 0, 0 0); } to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } }
        @keyframes vnv-slideleft-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes vnv-slideright-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes vnv-slideup-in { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes vnv-slidedown-in { from { transform: translateY(-100%); } to { transform: translateY(0); } }
      `}</style>
      <div 
        key={key}
        style={{ 
          width: "100%", height: 100, background: "var(--bg1)", 
          borderRadius: 6, overflow: "hidden", position: "relative",
          border: "1px solid var(--bdr)"
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)" }}>Scene A</div>
        {hovTrans && (
          <div style={{ 
            position: "absolute", inset: 0, background: "var(--teal)", 
            display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: "bold",
            animation: `vnv-${hovTrans}-in 1s forwards cubic-bezier(0.4, 0, 0.2, 1)`
          }}>
            Scene B
          </div>
        )}
      </div>

      <div className="row wrap gap4">
        {VN_TRANSITIONS.map((o) => (
          <button 
            key={o} 
            className={`legacy-tool-btn ${value === o ? "active" : ""}`}
            onClick={() => onChange(o)}
            onMouseEnter={() => setHovTrans(o)}
            onMouseLeave={() => setHovTrans(null)}
          >
            {o}
          </button>
        ))}
        {value && (
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 7px", color: "var(--err)" }}
            onClick={() => onChange("")}>✕ Clear</button>
        )}
      </div>
    </div>
  );
}

// ── Audio Player Helper ───────────────────────────────────────────────────────

export function AudioPreview({ rootPath, file }: { rootPath: string, file: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  }, [file]);

  if (!file) return null;

  const play = () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    
    const clean = file.replace(/['"]/g, '');
    const paths = [clean];
    if (!clean.startsWith('game/')) {
      paths.push(`game/${clean}`);
      paths.push(`game/audio/${clean}`);
    }
    const urls = paths.map(p => convertFileSrc(`${rootPath}/${p}`));
    
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setPlaying(false);
    }
    
    const tryPlay = (idx: number) => {
      if (idx >= urls.length) {
        console.error("Audio playback failed for all candidate paths:", file);
        setPlaying(false);
        return;
      }
      if (audioRef.current) {
        audioRef.current.src = urls[idx];
        audioRef.current.play().then(() => setPlaying(true)).catch(() => tryPlay(idx + 1));
      }
    };

    tryPlay(0);
  };

  return (
    <button className="btn btn-ghost" style={{ padding: "4px 8px", background: playing ? "var(--accent)" : "var(--bg3)", color: playing ? "#fff" : "var(--fg)" }} onClick={play}>
      {playing ? "⏸ Pause" : "▶️ Play"}
    </button>
  );
}
