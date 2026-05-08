/**
 * Inspector.tsx — Per-event property editor.
 * Mirrors vn_inspector.rpy from the legacy VNVMaker.
 */
import React, { useRef, useEffect, useState, useCallback } from "react";
import type { VNEvent, VNProject, VNChoiceOpt } from "./types";
import { newOpt, VN_POSES, VN_SIDES, VN_TRANSITIONS, VN_EFFECTS } from "./types";
import { listAssetFiles, launchRenpyPreview, DEFAULT_RENPY_SDK } from "./tauriApi";
import { compileSingleAnimationPreview } from "./compiler";
import { convertFileSrc } from "@tauri-apps/api/core";

import type { PaletteColor } from "./colorPalettes";
import { useMusicPlayer } from "./musicPlayerContext";
import { useTranslation } from "./translationContext";

// ─── Shared sub-components ────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div className="label" style={{ marginBottom: 4 }}>{children}</div>;
}

function Row({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) {
  return <div className="row wrap" style={{ gap }}>{children}</div>;
}

function ChipRow({ options, value, onChange }: {
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
// Inspired by ActionEditor3's image_viewer: hover-preview, Tab-completion,
// keyboard navigation (↑ ↓ Enter), and file count.

/** Longest common prefix of an array of strings (for Tab completion). */
function longestCommonPrefix(strs: string[]): string {
  if (!strs.length) return "";
  let prefix = strs[0];
  for (let i = 1; i < strs.length; i++) {
    while (!strs[i].startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) return "";
  }
  return prefix;
}

export function AssetPicker({
  rootPath, assetType, value, onChange, onOpenFullBrowser,
}: {
  rootPath: string;
  assetType: "images" | "audio" | "video";
  value: string;
  onChange: (v: string) => void;
  onOpenFullBrowser?: () => void;
}) {
  const [files, setFiles]           = useState<string[]>([]);
  const [search, setSearch]         = useState("");
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const [hov, setHov]               = useState("");
  const [mousePos, setMousePos]     = useState({ x: 0, y: 0 });
  const listRef                     = useRef<HTMLDivElement>(null);
  const searchRef                   = useRef<HTMLInputElement>(null);
  const music                       = useMusicPlayer();
  const { t: tr }                   = useTranslation();

  useEffect(() => {
    if (!rootPath) return;
    listAssetFiles(rootPath, assetType).then(setFiles).catch(() => setFiles([]));
  }, [rootPath, assetType]);

  // Reset focus when search changes
  useEffect(() => { setFocusedIdx(-1); }, [search]);

  const filtered = search
    ? files.filter((f) => f.toLowerCase().includes(search.toLowerCase()))
    : files;

  // Move selected item to the top of the list
  if (value && filtered.includes(value)) {
    filtered.sort((a, b) => {
      if (a === value) return -1;
      if (b === value) return 1;
      return 0;
    });
  }

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[focusedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx]);

  const playAudio = useCallback((path: string) => {
    if (music.playing && music.track === path) {
      music.pause();
    } else {
      music.play(path, rootPath);
    }
  }, [rootPath, music]);

  // ── Keyboard handler (ActionEditor3-inspired) ──────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx(i => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      if (focusedIdx >= 0 && filtered[focusedIdx]) {
        onChange(filtered[focusedIdx]);
        setSearch("");
      }
    } else if (e.key === "Tab") {
      // Tab completion: fill to longest common prefix of filtered basenames
      e.preventDefault();
      if (!filtered.length) return;
      const names = filtered.map(f => f.split("/").pop()!);
      const lcp   = longestCommonPrefix(names);
      if (lcp && lcp !== search) {
        setSearch(lcp);
      } else if (filtered.length === 1) {
        onChange(filtered[0]);
        setSearch("");
      }
    } else if (e.key === "Escape") {
      setSearch("");
      setFocusedIdx(-1);
    }
  };

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
          ⊞ {tr('inspector.open_browser')}
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

function AtlField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

function RichTextarea({ value, onChange, placeholder }: { value: string, onChange: (v: string) => void, placeholder?: string }) {
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

function TransitionPicker({ value, onChange }: { value: string | null | undefined, onChange: (v: string) => void }) {
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
            className={`legacy-tool-btn \${value === o ? "active" : ""}`} 
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

// ─── Inspector ────────────────────────────────────────────────────────────────

interface InspectorProps {
  ev: VNEvent;
  project: VNProject;
  rootPath: string;
  onChange: (updated: VNEvent) => void;
  onOpenAnimTrack?: () => void;
  openFullBrowser?: (tab: string, tag: string) => void;
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

export function Inspector({ ev, project, rootPath, onChange, onOpenAnimTrack, openFullBrowser }: InspectorProps) {
  const set = (key: string, val: unknown) => onChange({ ...ev, [key]: val });
  const t = ev.type;
  const { t: tr } = useTranslation();
  // Build project colour palette from character colors
  const projectColors: PaletteColor[] = project.characters
    .filter((c) => c.color)
    .map((c) => ({ hex: c.color, name: c.display }));

  return (
    <div className="col" style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* Event tab */}
      <div className="col gap12" style={{ padding: "14px 16px", overflowY: "auto", flex: 1 }}>
      {/* ── Type switcher ── */}
        {(t === "dialogue" || t === "narration" || t === "effect") && (
          <div className="col gap4">
            <Label>{tr('inspector.event_type')}</Label>
            <Row>
              {(["dialogue", "narration", "effect"] as const).map((ty) => (
                <button key={ty} className={`legacy-tool-btn ${t === ty ? "active" : ""}`}
                  onClick={() => onChange({ ...ev, type: ty })}>{ty}</button>
              ))}
            </Row>
          </div>
        )}
      {(t === "bg" || t === "image" || t === "movie") && (
        <div className="col gap4">
          <Label>{tr('inspector.event_type')}</Label>
          <Row>
            {(["bg", "image", "movie"] as const).map((ty) => (
              <button key={ty} className={`btn ${t === ty ? "active" : ""}`}
                onClick={() => onChange({ ...ev, type: ty })}>{ty === "bg" ? tr('inspector.bg_type') : ty === "image" ? tr('inspector.image_type') : tr('inspector.video_type')}</button>
            ))}
          </Row>
        </div>
      )}
      {(t === "setvar" || t === "if") && (
        <div className="col gap4">
          <Label>Event Type</Label>
          <Row>
            {(["setvar", "if"] as const).map((ty) => (
              <button key={ty} className={`btn ${t === ty ? "active" : ""}`}
                onClick={() => onChange({ ...ev, type: ty })}>{ty === "setvar" ? tr('inspector.variable_type') : tr('inspector.logic_if_type')}</button>
            ))}
          </Row>
        </div>
      )}

      {/* ── Dialogue ── */}
      {t === "dialogue" && (
        <>
          <div className="col gap4">
            <Label>{tr('inspector.speaker')}</Label>
            <Row>
              <button className={`btn ${!ev.char_id ? "active" : ""}`} onClick={() => set("char_id", null)}>{tr('inspector.narrator')}</button>
              {project.characters.map((c) => (
                <button key={c.id} className={`btn ${ev.char_id === c.id ? "active" : ""}`}
                  style={ev.char_id === c.id ? { borderColor: c.color, color: c.color } : {}}
                  onClick={() => set("char_id", c.id)}>{c.display}</button>
              ))}
            </Row>
          </div>
          {ev.char_id && (
            <div className="col gap4">
              <Label>{tr('inspector.pose')}</Label>
              <ChipRow options={project.characters.find(c => c.id === ev.char_id)?.poses ?? VN_POSES}
                value={ev.pose} onChange={(v) => set("pose", v)} />
            </div>
          )}
          <div className="col gap4">
            <Label>{tr('inspector.position')}</Label>
            <ChipRow options={[...VN_SIDES]} value={ev.side} onChange={(v) => set("side", v)} />
          </div>
          <div className="col gap4">
            <Label>{tr('chars.dialogue_mode') || 'Dialogue Mode'}</Label>
            <select className="input" value={ev.dialogue_mode ?? 'adv'} onChange={(e) => set("dialogue_mode", e.target.value as any)}>
              <option value="adv">{tr('chars.adv_mode') || 'ADV (Standard Box)'}</option>
              <option value="nvl">{tr('chars.nvl_mode') || 'NVL (Full Screen)'}</option>
              <option value="bubble">{tr('chars.bubble_mode') || 'Bubble (Speech Bubble)'}</option>
            </select>
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.dialogue_text')}</Label>
            <RichTextarea value={ev.text ?? ""} onChange={v => set("text", v)} placeholder={tr('inspector.dialogue_ph')} />
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.voice')}</Label>
            <AssetPicker assetType="audio" value={ev.voice ?? ""} onChange={(v) => set("voice", v)} rootPath={project._rootPath ?? ""} onOpenFullBrowser={() => openFullBrowser && openFullBrowser("audio", "voice")} />
          </div>
        </>
      )}

      {/* ── Narration ── */}
      {t === "narration" && (
        <>
          <div className="col gap4">
            <Label>{tr('chars.dialogue_mode') || 'Dialogue Mode'}</Label>
            <select className="input" value={ev.dialogue_mode ?? 'adv'} onChange={(e) => set("dialogue_mode", e.target.value as any)}>
              <option value="adv">{tr('chars.adv_mode') || 'ADV (Standard Box)'}</option>
              <option value="nvl">{tr('chars.nvl_mode') || 'NVL (Full Screen)'}</option>
              <option value="bubble">{tr('chars.bubble_mode') || 'Bubble (Speech Bubble)'}</option>
            </select>
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.narration_text')}</Label>
            <RichTextarea value={ev.text ?? ""} onChange={v => set("text", v)} placeholder={tr('inspector.narration_ph')} />
          </div>
        </>
      )}

      {/* ── Choice ── */}
      {t === "choice" && (
        <>
          <div className="col gap4">
            <Label>{tr('inspector.prompt')}</Label>
            <input className="input" value={ev.prompt ?? ""}
              onChange={(e) => set("prompt", e.target.value)} placeholder={tr('inspector.prompt_ph')} />
          </div>
          <div className="col gap8">
            <Label>{tr('inspector.options')}</Label>
            {(ev.opts ?? []).map((opt, i) => (
              <div key={opt.id} className="card col gap8">
                <Row>
                  <span style={{ fontSize: 11, color: "var(--dim)", width: 18, flexShrink: 0 }}>{i + 1}.</span>
                  <input className="input flex1" value={opt.text}
                    onChange={(e) => {
                      const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, text: e.target.value } : o);
                      set("opts", opts);
                    }} />
                  <button className="btn btn-ghost btn-icon" style={{ color: "var(--err)" }}
                    onClick={() => set("opts", (ev.opts ?? []).filter((_, j) => j !== i))}>✕</button>
                </Row>
                <div className="row wrap gap8">
                  <div className="col gap4" style={{ flex: 1 }}>
                    <Label>{tr('inspector.jump_target')}</Label>
                    <select className="input" value={opt.scene ?? ""}
                      onChange={(e) => {
                        const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, scene: e.target.value || null } : o);
                        set("opts", opts);
                      }}>
                      <option value="">{tr('inspector.no_target')}</option>
                      {project.scenes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="col gap4" style={{ width: 140 }}>
                    <Label>{tr('inspector.path_type')}</Label>
                    <div className="row gap4" style={{ flexWrap: 'wrap' }}>
                      <button 
                        className={`btn btn-ghost ${opt.is_correct ? 'active' : ''}`}
                        style={{ padding: '4px 8px', fontSize: 11, ...(opt.is_correct ? { borderColor: '#10b981', color: '#10b981', background: 'rgba(16,185,129,0.1)' } : {}) }}
                        onClick={() => {
                          const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, is_correct: !o.is_correct, is_incorrect: false, is_key: false, is_timed: false, is_hidden: false, is_repeatable: false, is_random: false, is_cond_loop: false } : o);
                          set("opts", opts);
                        }}
                        title="Mark as Good/Correct Path"
                      >{tr('inspector.good')}</button>
                      <button 
                        className={`btn btn-ghost ${opt.is_incorrect ? 'active' : ''}`}
                        style={{ padding: '4px 8px', fontSize: 11, ...(opt.is_incorrect ? { borderColor: '#f87171', color: '#f87171', background: 'rgba(248,113,113,0.1)' } : {}) }}
                        onClick={() => {
                          const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, is_incorrect: !o.is_incorrect, is_correct: false, is_key: false, is_timed: false, is_hidden: false, is_repeatable: false, is_random: false, is_cond_loop: false } : o);
                          set("opts", opts);
                        }}
                        title="Mark as Bad/Incorrect Path"
                      >{tr('inspector.bad')}</button>
                      <button 
                        className={`btn btn-ghost ${opt.is_key ? 'active' : ''}`}
                        style={{ padding: '4px 8px', fontSize: 11, ...(opt.is_key ? { borderColor: '#fbbf24', color: '#fbbf24', background: 'rgba(251,191,36,0.1)' } : {}) }}
                        onClick={() => {
                          const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, is_key: !o.is_key, is_correct: false, is_incorrect: false, is_timed: false, is_hidden: false, is_repeatable: false, is_random: false, is_cond_loop: false } : o);
                          set("opts", opts);
                        }}
                        title="Mark as Key Choice (gives reward / unlocks something)"
                      >{tr('inspector.key')}</button>
                      <button
                        className={`btn btn-ghost ${opt.is_timed ? 'active' : ''}`}
                        style={{ padding: '4px 8px', fontSize: 11, ...(opt.is_timed ? { borderColor: '#facc15', color: '#facc15', background: 'rgba(250,204,21,0.1)' } : {}) }}
                        onClick={() => {
                          const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, is_timed: !o.is_timed, is_correct: false, is_incorrect: false, is_key: false, is_hidden: false, is_repeatable: false, is_random: false, is_cond_loop: false } : o);
                          set("opts", opts);
                        }}
                        title="Timed choice — player must pick before countdown expires"
                      >{tr('inspector.timed')}</button>
                      <button
                        className={`btn btn-ghost ${opt.is_hidden ? 'active' : ''}`}
                        style={{ padding: '4px 8px', fontSize: 11, ...(opt.is_hidden ? { borderColor: '#94a3b8', color: '#94a3b8', background: 'rgba(148,163,184,0.1)' } : {}) }}
                        onClick={() => {
                          const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, is_hidden: !o.is_hidden, is_correct: false, is_incorrect: false, is_key: false, is_timed: false, is_repeatable: false, is_random: false, is_cond_loop: false } : o);
                          set("opts", opts);
                        }}
                        title="Hidden/locked — only available when a condition is met"
                      >{tr('inspector.hidden')}</button>
                      <button
                        className={`btn btn-ghost ${opt.is_repeatable ? 'active' : ''}`}
                        style={{ padding: '4px 8px', fontSize: 11, ...(opt.is_repeatable ? { borderColor: '#2dd4bf', color: '#2dd4bf', background: 'rgba(45,212,191,0.1)' } : {}) }}
                        onClick={() => {
                          const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, is_repeatable: !o.is_repeatable, is_correct: false, is_incorrect: false, is_key: false, is_timed: false, is_hidden: false, is_random: false, is_cond_loop: false } : o);
                          set("opts", opts);
                        }}
                        title="Repeatable — player can freely revisit this branch"
                      >{tr('inspector.loop')}</button>
                      <button
                        className={`btn btn-ghost ${opt.is_random ? 'active' : ''}`}
                        style={{ padding: '4px 8px', fontSize: 11, ...(opt.is_random ? { borderColor: '#cbd5e1', color: '#cbd5e1', background: 'rgba(203,213,225,0.1)' } : {}) }}
                        onClick={() => {
                          const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, is_random: !o.is_random, is_correct: false, is_incorrect: false, is_key: false, is_timed: false, is_hidden: false, is_repeatable: false, is_cond_loop: false } : o);
                          set("opts", opts);
                        }}
                        title="Randomized — outcome chosen at runtime (RNG, dice, gacha)"
                      >{tr('inspector.rng')}</button>
                      <button
                        className={`btn btn-ghost ${opt.is_cond_loop ? 'active' : ''}`}
                        style={{ padding: '4px 8px', fontSize: 11, ...(opt.is_cond_loop ? { borderColor: '#c084fc', color: '#c084fc', background: 'rgba(192,132,252,0.1)' } : {}) }}
                        onClick={() => {
                          const opts = (ev.opts ?? []).map((o, j) => j === i ? { ...o, is_cond_loop: !o.is_cond_loop, is_correct: false, is_incorrect: false, is_key: false, is_timed: false, is_hidden: false, is_repeatable: false, is_random: false } : o);
                          set("opts", opts);
                        }}
                        title="Conditional loop — repeats until condition met (training arc, puzzle)"
                      >{tr('inspector.cond_loop')}</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost" onClick={() => set("opts", [...(ev.opts ?? []), newOpt()])}>
              {tr('inspector.add_option')}
            </button>
          </div>
        </>
      )}

      {/* ── Jump ── */}
      {t === "jump" && (
        <>
          <div className="col gap4">
            <Label>{tr('inspector.jump_to')}</Label>
            <select className="input" value={ev.scene_id ?? ""}
              onChange={(e) => set("scene_id", e.target.value || null)}>
              <option value="">(end)</option>
              {project.scenes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.transition')}</Label>
            <div className="row gap8" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <TransitionPicker value={ev.transition} onChange={(v) => set("transition", v)} />
              </div>
              {ev.transition && ev.scene_id && (
                <button className="btn btn-ghost" style={{ flexShrink: 0, marginTop: 4, background: "rgba(107,138,251,0.15)", color: "var(--teal)" }} onClick={() => window.dispatchEvent(new CustomEvent('preview-transition', { detail: { targetScene: ev.scene_id, transition: ev.transition } }))}>
                  🎬 {tr('inspector.preview')}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Wait ── */}
      {t === "wait" && (
        <div className="col gap4">
          <Label>Duration (seconds)</Label>
          {/* DraggableNumber: drag ⟷ to scrub · click to type (ActionEditor3 DraggableValue) */}
          <DraggableNumber
            value={ev.dur ?? 1.0}
            onChange={v => set("dur", v)}
            min={0.1} step={0.1} suffix="s"
          />
          <div className="sublabel" style={{ marginTop: 2 }}>{tr('inspector.quick_presets')}</div>
          <ChipRow options={["0.5", "1.0", "1.5", "2.0", "3.0", "5.0"]}
            value={String(ev.dur ?? 1.0)} onChange={(v) => set("dur", parseFloat(v))} />
        </div>
      )}

      {/* ── Effect ── */}
      {t === "effect" && (
        <>
          <div className="col gap4">
            <Label>{tr('inspector.text_optional')}</Label>
            <textarea className="input" rows={3} value={ev.text ?? ""}
              onChange={(e) => set("text", e.target.value)} placeholder={tr('inspector.text_optional_ph')} />
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.effect_type')}</Label>
            <ChipRow options={VN_EFFECTS} value={ev.kind} onChange={(v) => set("kind", v)} />
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.duration')}</Label>
            <DraggableNumber
              value={ev.dur ?? 0.5}
              onChange={v => set("dur", v)}
              min={0.05} step={0.05} suffix="s"
            />
            <div className="sublabel" style={{ marginTop: 2 }}>Quick presets:</div>
            <ChipRow options={["0.2", "0.5", "1.0", "1.5", "2.0"]}
              value={String(ev.dur ?? 0.5)} onChange={(v) => set("dur", parseFloat(v))} />
          </div>
        </>
      )}

      {/* ── Music / SFX ── */}
      {(t === "music" || t === "sfx") && (
        <>
          <div className="col gap4">
            <Label>{tr('inspector.event_type')}</Label>
            <Row>
              {(["music", "sfx"] as const).map((ty) => (
                <button key={ty} className={`btn ${t === ty ? "active" : ""}`}
                  onClick={() => onChange({ ...ev, type: ty })}>
                  {ty === "music" ? "🎵 Music" : "🔊 SFX"}
                </button>
              ))}
            </Row>
            <div className="sublabel">{tr('inspector.music_sfx_hint')}</div>
          </div>
          <div className="col gap4">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Label>{t === "music" ? tr('inspector.music_file') : tr('inspector.sfx_file')}</Label>
              <AudioPreview rootPath={rootPath} file={(t === "music" ? ev.music : ev.sfx) ?? ""} />
            </div>
            <AssetPicker
              rootPath={rootPath} assetType="audio"
              value={(t === "music" ? ev.music : ev.sfx) ?? ""}
              onChange={(v) => set(t === "music" ? "music" : "sfx", v)}
            />
          </div>
          {t === "music" && (
            <div className="col gap4">
              <Label>{tr('inspector.stop_music')}</Label>
              <button className="btn btn-ghost" style={{ fontSize: 11, justifyContent: "flex-start" }}
                onClick={() => set("music", "")}>
                {tr('inspector.clear_stop')}
              </button>
              <div className="sublabel">{tr('inspector.stop_hint')}</div>
            </div>
          )}

          {/* Advanced Audio Controls */}
          <div className="col gap12" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--bdr)" }}>
            <Label>{tr('inspector.audio_props')}</Label>
            
            <div className="row gap12">
              <div className="col gap4 flex1">
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)" }}>{tr('inspector.volume')}</div>
                <input className="input" type="number" step="0.1" min="0" max="1" 
                  value={ev.volume ?? ""} placeholder="Default"
                  onChange={e => set("volume", e.target.value ? parseFloat(e.target.value) : undefined)} />
              </div>
              <div className="col gap4 flex1">
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)" }}>{tr('inspector.fade_in')}</div>
                <input className="input" type="number" step="0.5" min="0"
                  value={ev.fadein ?? ""} placeholder="0"
                  onChange={e => set("fadein", e.target.value ? parseFloat(e.target.value) : undefined)} />
              </div>
              <div className="col gap4 flex1">
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)" }}>{tr('inspector.fade_out')}</div>
                <input className="input" type="number" step="0.5" min="0"
                  value={ev.fadeout ?? ""} placeholder={t === "music" && !ev.music ? "0.5" : "0"}
                  onChange={e => set("fadeout", e.target.value ? parseFloat(e.target.value) : undefined)} />
              </div>
            </div>
            
            <label className="row gap8" style={{ alignItems: "center", cursor: "pointer", alignSelf: "flex-start" }}>
              <input type="checkbox"
                checked={ev.loop ?? (t === "music")} 
                onChange={e => set("loop", e.target.checked)} />
              <span style={{ fontSize: 12 }}>{tr('inspector.loop_audio')}</span>
            </label>
          </div>
        </>
      )}

      {/* ── BG / Image / Movie ── */}
      {(t === "bg" || t === "image" || t === "movie") && (
        <>
          {t === "image" && (
            <div className="col gap4">
              <Label>{tr('inspector.position')}</Label>
              <ChipRow options={[...VN_SIDES]} value={ev.side} onChange={(v) => set("side", v)} />
            </div>
          )}
          <div className="col gap4">
            <Label>{t === "bg" ? tr('inspector.bg_file') : t === "image" ? tr('inspector.image_file') : tr('inspector.video_file')}</Label>
            <AssetPicker
              rootPath={rootPath} assetType={t === "movie" ? "video" : "images"}
              value={(t === "bg" ? ev.bg : t === "image" ? ev.image : ev.movie) ?? ""}
              onChange={(v) => set(t === "bg" ? "bg" : t === "image" ? "image" : "movie", v)}
            />
          </div>
          {/* ATL Transform & Transition */}
          {t !== "movie" && (
            <>
              <div className="col gap4">
                <Label>{tr('inspector.transition_with')}</Label>
                <div className="sublabel">{tr('inspector.applied_after')}</div>
                <select 
                  className="input" 
                  value={ev.transition ?? ""} 
                  onChange={e => set("transition", e.target.value || undefined)}
                  style={{ width: '100%', padding: '6px' }}
                >
                  <option value="">{tr('inspector.none_instant')}</option>
                  {VN_EFFECTS.map(fx => <option key={fx} value={fx}>{fx}</option>)}
                </select>
              </div>
              <AtlField value={ev.atl_code ?? ""} onChange={(v) => set("atl_code", v || undefined)} />
            </>
          )}
          {t === "image" && (
            <div className="col gap4" style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--bdr)" }}>
              <Label>Animation properties</Label>
              <div className="sublabel">Convert this static image to an animation to move it across the screen using keyframes.</div>
               <button className="btn btn-ghost" style={{ background: "var(--bg3)", color: "var(--teal)" }} onClick={() => onChange({...ev, type: "animation"})}>
                 ✨ Convert to Animation
               </button>
            </div>
          )}
        </>
      )}

      {/* ── Animation (ActionEditor style) ── */}
      {t === "animation" && (
        <>
          <div className="col gap4">
            <Label>{tr('inspector.image_sprite')}</Label>
            <AssetPicker
              rootPath={rootPath} assetType="images"
              value={ev.image ?? ""}
              onChange={(v) => set("image", v)}
            />
          </div>
          <div className="col gap4" style={{ marginTop: 8 }}>
            <div className="sublabel">
              {tr('inspector.anim_keyframe_hint')}
            </div>
            {onOpenAnimTrack && (
              <button className="btn" onClick={onOpenAnimTrack}>
                {tr('inspector.open_anim_track')}
              </button>
            )}
          </div>
          <div className="col gap4" style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--bdr)" }}>
            <Label>Static properties</Label>
            <div className="sublabel">Convert this back to a static image.</div>
             <button className="btn btn-ghost" style={{ background: "var(--bg3)", color: "var(--err)" }} onClick={() => onChange({...ev, type: "image"})}>
               ⏪ Convert to Static Image
             </button>
          </div>
        </>
      )}

      {/* ── SetVar ── */}
      {t === "setvar" && (
        <>
          <div className="col gap4">
            <Label>{tr('inspector.var_name')}</Label>
            <input className="input" value={ev.var_name ?? ""}
              onChange={(e) => set("var_name", e.target.value)} placeholder="my_variable" />
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.var_value')}</Label>
            <div className="sublabel" style={{ marginBottom: 4 }}>Python expression: True, False, 1, "hello"</div>
            <input className="input mono" value={ev.var_val ?? "True"}
              onChange={(e) => set("var_val", e.target.value)} />
          </div>
        </>
      )}

      {/* ── If / Branch ── */}
      {t === "if" && (
        <>
          <div className="col gap4">
            <Label>{tr('inspector.condition')}</Label>
            <div className="sublabel" style={{ marginBottom: 4 }}>Python expression: my_var == True</div>
            <input className="input mono" value={ev.condition ?? ""}
              onChange={(e) => set("condition", e.target.value)} placeholder="my_var == True" />
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.true_jump')}</Label>
            <select className="input" value={ev.scene_true ?? ""}
              onChange={(e) => set("scene_true", e.target.value || null)}>
              <option value="">(no target)</option>
              {project.scenes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.false_jump')}</Label>
            <select className="input" value={ev.scene_false ?? ""}
              onChange={(e) => set("scene_false", e.target.value || null)}>
              <option value="">(no target)</option>
              {project.scenes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </>
      )}

      {/* ── Camera (3D Stage) ── */}
      {t === "camera" && (
        <>
          <div className="col gap4">
            <Label>{tr('inspector.duration_s')}</Label>
            <input type="number" step="0.1" className="input mono" value={ev.camera_dur ?? 1.0}
              onChange={(e) => set("camera_dur", parseFloat(e.target.value) || 0)} />
          </div>
          <div className="row gap12">
            <div className="col gap4 flex1">
              <Label>{tr('inspector.camera_x')}</Label>
              <input type="number" className="input mono" value={ev.camera_x ?? 0}
                onChange={(e) => set("camera_x", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="col gap4 flex1">
              <Label>{tr('inspector.camera_y')}</Label>
              <input type="number" className="input mono" value={ev.camera_y ?? 0}
                onChange={(e) => set("camera_y", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="row gap12">
            <div className="col gap4 flex1">
              <Label>{tr('inspector.camera_z')}</Label>
              <input type="number" className="input mono" value={ev.camera_z ?? 0}
                onChange={(e) => set("camera_z", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="col gap4 flex1">
              <Label>{tr('inspector.camera_zoom')}</Label>
              <input type="number" step="0.1" className="input mono" value={ev.camera_zoom ?? 1.0}
                onChange={(e) => set("camera_zoom", parseFloat(e.target.value) || 1.0)} />
            </div>
          </div>
          <div className="col gap4">
            <Label>{tr('inspector.camera_rot')}</Label>
            <div className="row gap8">
              <input type="number" className="input mono" placeholder="Pitch" value={ev.camera_pitch ?? 0}
                onChange={(e) => set("camera_pitch", parseFloat(e.target.value) || 0)} title="Pitch (X-axis)" />
              <input type="number" className="input mono" placeholder="Yaw" value={ev.camera_yaw ?? 0}
                onChange={(e) => set("camera_yaw", parseFloat(e.target.value) || 0)} title="Yaw (Y-axis)" />
              <input type="number" className="input mono" placeholder="Roll" value={ev.camera_roll ?? 0}
                onChange={(e) => set("camera_roll", parseFloat(e.target.value) || 0)} title="Roll (Z-axis)" />
            </div>
          </div>
        </>
      )}

      {/* ── Achievement ── */}
      {t === "achievement" && (
        <div className="col gap12">
          <div className="col gap4">
            <Label>{tr('inspector.grant_achievement')}</Label>
            <div className="sublabel">
              Unlocks this achievement for the player at runtime via{" "}
              <code style={{ fontSize: 11, color: "var(--acc)", fontFamily: "var(--mono)" }}>
                $ achievement.grant("name")
              </code>
            </div>
            {(project.achievements ?? []).length > 0 ? (
              <select className="input" value={ev.achievement_id ?? ""}
                onChange={(e) => set("achievement_id", e.target.value)}>
                <option value="">{tr('inspector.select_achievement')}</option>
                {(project.achievements ?? []).map(a => (
                  <option key={a.id} value={a.name}>{a.name}{a.hidden ? " 🔒" : ""}</option>
                ))}
              </select>
            ) : (
              <>
                <input className="input mono" value={ev.achievement_id ?? ""}
                  onChange={(e) => set("achievement_id", e.target.value)}
                  placeholder="achievement_name" />
                <div className="sublabel" style={{ color: "var(--warn)" }}>
                  ⚠ No achievements defined yet — go to the Achievements tab to add some first.
                </div>
              </>
            )}
          </div>
          {ev.achievement_id && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.25)", display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 20 }}>🏆</span>
              <div className="col" style={{ gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#facc15" }}>{ev.achievement_id}</span>
                <span style={{ fontSize: 11, color: "var(--dim)" }}>{tr('inspector.unlock_hint')}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Random Branch ── */}
      {t === "random" && (() => {
        const slots: string[] = ev.random_scenes && ev.random_scenes.length > 0 ? ev.random_scenes : ['', ''];
        const weights: number[] = ev.random_weights && ev.random_weights.length === slots.length
          ? ev.random_weights
          : slots.map(() => 1);
        const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
        const isWeighted = weights.some((w, i) => w !== weights[0]);

        const setSlot = (i: number, val: string) => {
          const next = [...slots]; next[i] = val;
          onChange({ ...ev, random_scenes: next, random_weights: weights });
        };
        const setWeight = (i: number, val: number) => {
          const next = [...weights]; next[i] = Math.max(1, Math.round(val));
          onChange({ ...ev, random_scenes: slots, random_weights: next });
        };
        const addSlot = () => onChange({ ...ev, random_scenes: [...slots, ''], random_weights: [...weights, 1] });
        const removeSlot = (i: number) => {
          const ns = slots.filter((_, idx) => idx !== i);
          const nw = weights.filter((_, idx) => idx !== i);
          onChange({ ...ev, random_scenes: ns.length > 0 ? ns : [''], random_weights: nw.length > 0 ? nw : [1] });
        };

        return (
          <div className="col gap12">
            <div className="col gap4">
              <Label>{tr('inspector.random_branch')}</Label>
              <div className="sublabel">
                At runtime, Ren'Py randomly picks one scene with {isWeighted ? "weighted" : "equal"} probability.
                Adjust weights to make some outcomes more likely.
              </div>
            </div>
            <div className="col gap6">
              {/* Column header */}
              <div className="row gap6" style={{ paddingLeft: 26, alignItems: "center" }}>
                <span style={{ flex: 1, fontSize: 10, color: "var(--faint)", fontWeight: 700 }}>SCENE</span>
                <span style={{ width: 52, fontSize: 10, color: "var(--faint)", fontWeight: 700, textAlign: "center" }}>WEIGHT</span>
                <span style={{ width: 36, fontSize: 10, color: "var(--faint)", fontWeight: 700, textAlign: "center" }}>%</span>
                <span style={{ width: 24 }} />
              </div>
              {slots.map((sceneId, i) => {
                const pct = Math.round((weights[i] / totalWeight) * 100);
                return (
                  <div key={i} className="row gap6" style={{ alignItems: "center" }}>
                    <div style={{ width: 20, fontSize: 10, color: "var(--faint)", textAlign: "center", flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <select className="input" style={{ flex: 1 }} value={sceneId}
                      onChange={e => setSlot(i, e.target.value)}>
                      <option value="">(no target)</option>
                      {project.scenes.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                    <input type="number" min={1} max={999}
                      className="input mono"
                      style={{ width: 52, textAlign: "center" }}
                      value={weights[i]}
                      onChange={e => setWeight(i, parseInt(e.target.value) || 1)}
                    />
                    <span style={{ width: 36, fontSize: 10, color: pct > 50 ? "var(--teal)" : "var(--dim)", textAlign: "center", fontFamily: "var(--mono)", flexShrink: 0 }}>
                      {pct}%
                    </span>
                    <button className="btn btn-ghost btn-icon" style={{ color: "var(--err)", fontSize: 12, flexShrink: 0 }}
                      onClick={() => removeSlot(i)}
                      disabled={slots.length <= 1}
                      title="Remove this option">
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 11, alignSelf: "flex-start" }}
              onClick={addSlot}>
              {tr('inspector.add_option')}
            </button>
            {slots.filter(Boolean).length > 0 && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)", fontSize: 11, fontFamily: "var(--mono)", color: "var(--dim)", lineHeight: 1.6 }}>
                <div style={{ color: "#f97316", fontWeight: 700, marginBottom: 4 }}>▸ Emitted Ren'Py</div>
                {isWeighted ? (
                  <>
                    <div>{"$ _pool = ["}</div>
                    {slots.filter(Boolean).map((id, i) => {
                      const sc = project.scenes.find(s => s.id === id);
                      return <div key={i} style={{ paddingLeft: 16 }}>*{weights[i]} + ["{sc ? `vns_scene_${id}` : id}"],</div>;
                    })}
                    <div>{"]"}</div>
                    <div>{"$ _rnd = renpy.random.choice(_pool)"}</div>
                  </>
                ) : (
                  <>
                    <div>{"$ _rnd = renpy.random.choice(["}</div>
                    {slots.filter(Boolean).map((id, i) => {
                      const sc = project.scenes.find(s => s.id === id);
                      return <div key={i} style={{ paddingLeft: 16 }}>"{sc ? `vns_scene_${id}` : id}"{i < slots.filter(Boolean).length - 1 ? "," : ""}</div>;
                    })}
                    <div>{"])"}</div>
                  </>
                )}
                <div>{"jump expression _rnd"}</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Raw Code ── */}
      {t === "raw" && (
        <div className="col gap4">
          <Label>Raw Ren'Py Code</Label>
          <div className="sublabel">
            This code will be injected directly into the script. Use with caution.
            Indent properly if adding python blocks.
          </div>
          <textarea
            className="input mono"
            style={{ minHeight: 200, fontSize: 13, whiteSpace: "pre", overflowWrap: "normal" }}
            value={ev.raw_code ?? ""}
            onChange={(e) => set("raw_code", e.target.value)}
            placeholder={"$ my_var = True\nshow eileen happy\n\"Hello world!\""}
          />
        </div>
      )}

      {/* Optional padding at bottom so scrolling works nicely */}
      <div style={{ height: 20 }} />
      </div>

      {/* ── Apply Button (Docked Bottom) ── */}
      <div style={{ padding: "16px", borderTop: "1px solid var(--bdr)", background: "var(--bg1)" }}>
        <button className="btn-apply" style={{ width: "100%" }} onClick={() => {
          // Visual feedback
        }}>
          {tr('inspector.apply')}
        </button>
      </div>
    </div>
  );
}
