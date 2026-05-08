/**
 * SceneEditor.tsx — 3-column scene editor.
 * Left: EventList  |  Center: ScenePreview  |  Right: Inspector
 * Bottom: event-type add toolbar
 */
// Module-level clipboard so copy/paste works across scene switches
let _evClipboard: import("./types").VNEvent | null = null;

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { VNProject, VNScene, VNEvent, EventType } from "./types";
import { newEvent, newScene, uid } from "./types";
import { Inspector } from "./Inspector";
import { EventList } from "./EventList";
import { ScenePreview } from "./ScenePreview";
import { AssetBrowser } from "./AssetBrowser";
import { computeSceneBgs } from "./sceneGraphUtils";
import { compilePreview, compileSingleAnimationPreview } from "./compiler";
import { launchRenpyPreview, findRenpySdk, DEFAULT_RENPY_SDK, listAssetFiles } from "./tauriApi";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AnimPropertiesPanel, AnimActionsPanel, AnimTimelinePanel } from "./AnimationTrack";
import { SdkSetupModal } from "./SdkSetupModal";
import { ToastManager } from "./toastContext";
import { ColorGradePanel, colorGradeToCss } from "./ColorGradePanel";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { parseGuiRpy } from "./guiParser";
import type { GuiConfig } from "./guiParser";
import { useTranslation } from "./translationContext";

const LS_SDK_KEY = "vnv_renpy_sdk_path";

// ── Constants ─────────────────────────────────────────────────────────────────

const TOOL_COLORS: Record<string, string> = {
  dialogue:"#4b6cf7", narration:"#a78bfa", choice:"#f472b6",
  jump:"#00d4c8", wait:"#64748b", bg:"#22c55e", image:"#34d399",
  music:"#f59e0b", sfx:"#fb923c", effect:"#e879f9", setvar:"#60a5fa", if:"#fbbf24", random:"#f97316", animation:"#f43f5e", camera:"#a3e635", raw:"#1e293b", achievement:"#facc15",
};
const TOOL_ICONS: Record<string, string> = {
  dialogue:"💬", narration:"📖", choice:"🔀", jump:"➡️",
  wait:"⏱", bg:"🖼", image:"🎨", music:"🎵",
  sfx:"🔊", effect:"✨", setvar:"📦", if:"🔂", random:"🎲", animation:"🎬", camera:"🎥", raw:"💻", achievement:"🏆",
};
const TOOLS: EventType[] = ["dialogue","narration","choice","jump","wait","bg","image","music","sfx","effect","setvar","if","random","camera","achievement","raw"];

// ── Undo/Redo ─────────────────────────────────────────────────────────────────


// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  project: VNProject;
  onProjectChange: (p: VNProject) => void;
  initialSceneId?: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

function SidebarAssetBrowser({ project, mode, onPick }: { project: VNProject, mode: "images" | "audio" | "effects", onPick: (path: string) => void }) {
  const [files, setFiles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  
  useEffect(() => {
    if (!project._rootPath) return;
    const typeMap = { images: "images", audio: "audio", effects: "images" } as const;
    if (mode === "effects") {
      setFiles([]); return;
    }
    listAssetFiles(project._rootPath, typeMap[mode]).then(setFiles).catch(() => setFiles([]));
  }, [project._rootPath, mode]);

  const filtered = useMemo(() => files.filter(f => f.toLowerCase().includes(search.toLowerCase())), [files, search]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <input 
          className="input" 
          placeholder={t('editor.scene.search_placeholder').replace('{mode}', mode)}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", padding: "4px 8px", fontSize: 11, background: "rgba(0,0,0,0.2)", border: "1px solid var(--bdr)" }}
        />
      </div>
      <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {mode === "images" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {filtered.map(f => {
              const url = convertFileSrc(`${project._rootPath}/${f}`);
              const name = f.split('/').pop() || f;
              return (
                <div key={f} 
                  onClick={() => onPick(f)}
                  title={name}
                  style={{ 
                    aspectRatio: "1", background: "var(--bg2)", borderRadius: 4, overflow: "hidden", 
                    cursor: "pointer", border: "1px solid var(--bdr)", transition: "border 0.1s" 
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--teal)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
                >
                  <img src={url} alt={name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              );
            })}
          </div>
        )}
        {mode === "audio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map(f => {
              const name = f.split('/').pop();
              return (
                <div key={f}
                  onClick={() => onPick(f)}
                  title={name}
                  style={{
                    padding: "6px 8px", background: "var(--bg2)", borderRadius: 4, cursor: "pointer",
                    border: "1px solid var(--bdr)", fontSize: 11, color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--teal)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
                >
                  🎵 {name}
                </div>
              );
            })}
          </div>
        )}
        {mode === "effects" && (
          <div style={{ padding: 12, color: "var(--dim)", fontSize: 11, textAlign: "center" }}>
            (Effects preset list coming soon)
          </div>
        )}
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 11 }}>{t('editor.scene.no_results')}</div>
        )}
      </div>
    </div>
  );
}

export function SceneEditor({ project, onProjectChange, initialSceneId, canUndo, canRedo, onUndo, onRedo }: Props) {
  const { t } = useTranslation();
  const [selSceneId, setSelSceneId] = useState<string | null>(
    initialSceneId || project.scenes[0]?.id || null
  );
  const [selIdx, setSelIdx]     = useState<number | null>(null);
  const [zoom, setZoom]         = useState<number>(1);
  const [armedTool, setArmedTool] = useState<EventType | null>(null);
  // Origin (center of toolbar button) for the SVG wire when tool is armed
  const armedToolOrigin = useRef<{ x: number; y: number } | null>(null);
  // Live mouse position for SVG wire
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal]   = useState("");
  const [, setTick]             = useState(0);
  // Picker modal opened from clicking bg/sprite in the preview
  const [pickerModal, setPickerModal] = useState<{ field: "bg" | "image" } | null>(null);
  // Ren'Py live preview
  const [sdkPath, setSdkPath] = useState<string>(() => localStorage.getItem(LS_SDK_KEY) ?? DEFAULT_RENPY_SDK);
  const [showSdkModal, setShowSdkModal] = useState(false);
  const [previewState, setPreviewState] = useState<"idle" | "launching" | "ok" | "err">("idle");
  const [previewMsg, setPreviewMsg]   = useState("");
  // pendingLaunch: rootPath to launch after SDK is confirmed via modal
  const pendingLaunchRef = React.useRef<string | null>(null);

  const [oldSceneId, setOldSceneId] = useState<string | null>(null);
  const [transitionKind, setTransitionKind] = useState<string | null>(null);
  const [guiCfg, setGuiCfg] = useState<GuiConfig | null>(null);
  const [showGuides, setShowGuides] = useState(false);

  // Track mouse for SVG wire when a tool is armed
  useEffect(() => {
    if (!armedTool) { setMousePos(null); return; }
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [armedTool]);

  // Load GUI Config
  useEffect(() => {
    if (!project._rootPath) return;
    readTextFile(`${project._rootPath}/game/gui.rpy`)
      .then(content => setGuiCfg(parseGuiRpy(content)))
      .catch(err => console.warn("Failed to load gui.rpy for scene editor:", err));
  }, [project._rootPath]);

  // Transition preview listener
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      const { targetScene, transition } = ce.detail;
      setOldSceneId(selSceneId);
      setTransitionKind(transition);
      setSelSceneId(targetScene);
      // Let the CSS animation play (1s), then remove the old scene
      setTimeout(() => {
        setOldSceneId(null);
        setTransitionKind(null);
      }, 1000);
    };
    window.addEventListener("preview-transition", handler);
    return () => window.removeEventListener("preview-transition", handler);
  }, [selSceneId]);

  const refresh = () => setTick(t => t + 1);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-detect Ren'Py SDK on first mount
  useEffect(() => {
    const saved = localStorage.getItem(LS_SDK_KEY);
    if (!saved) {
      findRenpySdk().then(found => {
        if (found) { setSdkPath(found); localStorage.setItem(LS_SDK_KEY, found); }
      }).catch(() => { /* ignore */ });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sceneIdx = project.scenes.findIndex(s => s.id === selSceneId);
  const scene    = sceneIdx >= 0 ? project.scenes[sceneIdx] : null;
  const events   = scene?.events ?? [];

  const [showAnimTrack, setShowAnimTrack] = useState(false);
  const selEvent = selIdx !== null ? scene?.events[selIdx] : null;
  const isAnimMode = selEvent?.type === "animation" && showAnimTrack;
  const [animSelIdx, setAnimSelIdx] = useState(0);

  const [leftMode, setLeftMode] = useState<"scenes" | "images" | "audio" | "effects">("scenes");
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(320);
  const [bottomHeight, setBottomHeight] = useState(120);

  useEffect(() => {
    if (selEvent?.type === "animation") {
      setShowAnimTrack(true);
    } else {
      setShowAnimTrack(false);
    }
  }, [selIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // State (bg + sprite) inherited from the game flow BEFORE this scene's first event
  const { inheritedBg, inheritedSprite } = useMemo(() => {
    if (!scene) return { inheritedBg: null, inheritedSprite: null };
    const { inheritedBg: bgMap, inheritedSprite: sprMap } = computeSceneBgs(project as import("./types").VNProject);
    return { inheritedBg: bgMap[scene.id] ?? null, inheritedSprite: sprMap[scene.id] ?? null };
  }, [project, scene?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selSceneId in sync when initialSceneId changes
  useEffect(() => {
    if (initialSceneId) setSelSceneId(initialSceneId);
  }, [initialSceneId]);

  // Reset selection when switching scenes
  useEffect(() => { setSelIdx(null); }, [selSceneId]);

  // Auto-switch left bar asset browser when selecting an event
  useEffect(() => {
    if (!selEvent) return;
    const t = selEvent.type;
    if (t === "bg" || t === "image" || t === "movie" || t === "camera" || t === "animation") {
      setLeftMode("images");
    } else if (t === "music" || t === "sfx") {
      setLeftMode("audio");
    } else if (t === "effect") {
      setLeftMode("effects");
    } else if (t === "jump") {
      setLeftMode("scenes");
    }
  }, [selIdx]); // Fire when selection changes

  // ── Scene update helper ──────────────────────────────────────────────────
  const updateScene = useCallback((fn: (sc: VNScene) => void, label: string) => {
    if (!scene) return;
    const sceneId = scene.id;
    const newScenes = project.scenes.map(s => {
      if (s.id === sceneId) {
        const copy = JSON.parse(JSON.stringify(s)) as VNScene;
        fn(copy);
        return copy;
      }
      return s;
    });
    onProjectChange({ ...project, scenes: newScenes });
  }, [scene, project, onProjectChange]);

  // ── Rename scene ─────────────────────────────────────────────────────────
  const commitRename = () => {
    if (!scene || !nameVal.trim()) { setEditingName(false); return; }
    const val = nameVal.trim();
    updateScene(sc => { sc.label = val; }, "Rename scene");
    setEditingName(false);
  };

  // ── Add event ────────────────────────────────────────────────────────────
  const addEvent = useCallback((type: EventType) => {
    if (!scene) return;
    const ev = newEvent(type);
    const insertAt = selIdx !== null ? selIdx + 1 : events.length;
    updateScene(sc => { sc.events.splice(insertAt, 0, ev); }, `Add ${type}`);
    setSelIdx(insertAt);
    setArmedTool(null);
  }, [scene, selIdx, events.length, updateScene]);

  // ── Delete event ─────────────────────────────────────────────────────────
  const deleteEvent = useCallback((i: number) => {
    updateScene(sc => { sc.events.splice(i, 1); }, "Delete event");
    setSelIdx(prev => prev === i ? null : prev !== null && prev > i ? prev - 1 : prev);
  }, [updateScene]);

  // ── Duplicate event ───────────────────────────────────────────────────────
  const duplicateEvent = useCallback((i: number) => {
    if (!scene) return;
    const copy = { ...scene.events[i], id: `ev_${Date.now()}` };
    updateScene(sc => { sc.events.splice(i + 1, 0, copy); }, "Duplicate event");
    setSelIdx(i + 1);
  }, [scene, updateScene]);

  // ── Reorder event ─────────────────────────────────────────────────────────
  const moveEvent = useCallback((from: number, to: number) => {
    if (!scene || from === to) return;
    updateScene(sc => {
      const [item] = sc.events.splice(from, 1);
      sc.events.splice(to, 0, item);
    }, "Reorder event");
    setSelIdx(to);
  }, [scene, updateScene]);

  // ── Event change from Inspector ───────────────────────────────────────────
  const onEventChange = useCallback((updated: VNEvent) => {
    if (!scene || selIdx === null) return;
    updateScene(sc => { sc.events[selIdx] = updated; }, "Edit event");
  }, [scene, selIdx, updateScene]);

  // ── Copy / Cut / Paste ───────────────────────────────────────────────────
  const copyEvent = useCallback((i: number) => {
    if (!scene) return;
    _evClipboard = JSON.parse(JSON.stringify(scene.events[i])) as import("./types").VNEvent;
    refresh();
  }, [scene]);

  const cutEvent = useCallback((i: number) => {
    if (!scene) return;
    _evClipboard = JSON.parse(JSON.stringify(scene.events[i])) as import("./types").VNEvent;
    deleteEvent(i);
  }, [scene, deleteEvent]);

  const pasteEvent = useCallback(() => {
    if (!_evClipboard || !scene) return;
    const pasted = { ..._evClipboard, id: `ev_${Date.now()}` };
    const insertAt = selIdx !== null ? selIdx + 1 : events.length;
    updateScene(sc => { sc.events.splice(insertAt, 0, pasted); }, "Paste event");
    setSelIdx(insertAt);
  }, [scene, selIdx, events.length, updateScene]);

  // ── Keyboard nav ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "c" && selIdx !== null) { copyEvent(selIdx); return; }
      if (ctrl && e.key === "x" && selIdx !== null) { cutEvent(selIdx); return; }
      if (ctrl && e.key === "v") { pasteEvent(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelIdx(i => i === null ? 0 : Math.min(events.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelIdx(i => i === null ? 0 : Math.max(0, i - 1));
      }
      if (e.key === "Escape")  { setArmedTool(null); }
      if (e.key === "Delete" && selIdx !== null) deleteEvent(selIdx);
      if (e.key === "d" && ctrl && selIdx !== null) duplicateEvent(selIdx);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [events.length, selIdx, deleteEvent, duplicateEvent, copyEvent, cutEvent, pasteEvent]);

  // ── Nav between scenes ────────────────────────────────────────────────────
  const goScene = (delta: number) => {
    const next = project.scenes[sceneIdx + delta];
    if (next) setSelSceneId(next.id);
  };

  // ── Live Preview ──────────────────────────────────────────────────────────
  const handlePreview = useCallback(async (rootPath: string) => {
    if (!scene) return;
    const sdk = sdkPath.trim() || null;
    if (!sdk) {
      // No SDK path — open the wizard modal
      pendingLaunchRef.current = rootPath;
      setShowSdkModal(true);
      return;
    }
    setPreviewState("launching"); setPreviewMsg("");
    try {
      const script = compilePreview(project, scene.id, undefined, undefined, inheritedBg ?? undefined, inheritedSprite ?? undefined);
      const RENPY_LANGS: Record<string, string> = {
        es: "spanish", fr: "french", de: "german", ja: "japanese", ko: "korean", ru: "russian", zh: "simplified_chinese", "zh-TW": "traditional_chinese"
      };
      const prefLang = localStorage.getItem("pref_language") || "en";
      const envLang = RENPY_LANGS[prefLang] || "";
      const usedPath = await launchRenpyPreview(rootPath, script, sdk || null, envLang);
      // Cache the confirmed path
      setSdkPath(usedPath); localStorage.setItem(LS_SDK_KEY, usedPath);
      setPreviewState("ok"); setPreviewMsg("Launched!");
      setTimeout(() => setPreviewState("idle"), 3000);
    } catch (err) {
      const msg = String(err);
      setPreviewState("err"); setPreviewMsg(msg);
      // If the error looks like a bad path, open the wizard
      if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no such") || msg.toLowerCase().includes("cannot find")) {
        pendingLaunchRef.current = rootPath;
        setShowSdkModal(true);
      } else {
        ToastManager.error(t('toasts.preview_failed').replace('{err}', msg));
      }
    }
  }, [scene, project, sdkPath]);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg0)", cursor: armedTool ? "crosshair" : "default" }}
      onClick={() => {
        // Clicking anywhere outside the timeline cancels the armed tool
        if (armedTool) {
          setArmedTool(null);
          armedToolOrigin.current = null;
        }
      }}
    >
      {/* ── SVG Wire Overlay (armed tool mode) ── */}
      {armedTool && armedToolOrigin.current && mousePos && (() => {
        const ox = armedToolOrigin.current!.x;
        const oy = armedToolOrigin.current!.y;
        const mx = mousePos.x;
        const my = mousePos.y;
        const color = TOOL_COLORS[armedTool] ?? "#4b6cf7";
        // Cubic bezier — control points create an elegant downward arc
        const cp1x = ox;
        const cp1y = (oy + my) / 2;
        const cp2x = mx;
        const cp2y = (oy + my) / 2;
        const d = `M ${ox} ${oy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${mx} ${my}`;
        return (
          <svg
            style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 9999 }}
          >
            <defs>
              <filter id="wire-glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* Glow copy */}
            <path d={d} fill="none" stroke={color} strokeWidth={6} strokeDasharray="8 6" strokeOpacity={0.3} filter="url(#wire-glow)" />
            {/* Main line */}
            <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="8 6" strokeLinecap="round" />
            {/* Origin dot */}
            <circle cx={ox} cy={oy} r={5} fill={color} opacity={0.9} />
            {/* Cursor dot */}
            <circle cx={mx} cy={my} r={4} fill={color} opacity={0.7} />
          </svg>
        );
      })()}


      {/* ── Header ── */}
      <div style={{
        height: 46, flexShrink: 0, display: "flex", alignItems: "center",
        gap: 8, padding: "0 12px", background: "var(--bg1)",
        borderBottom: "1px solid var(--bdr)",
      }}>
        {/* Scene nav */}
        <button className="btn btn-ghost btn-icon" onClick={() => goScene(-1)} disabled={sceneIdx <= 0} title="Previous scene">‹</button>
        <button className="btn btn-ghost btn-icon" onClick={() => goScene(1)}  disabled={sceneIdx >= project.scenes.length - 1} title="Next scene">›</button>

        {/* Scene name */}
        {editingName ? (
          <input
            autoFocus value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingName(false); }}
            style={{ background: "var(--bg3)", border: "1px solid var(--acc)", borderRadius: 6, color: "var(--text)", fontSize: 14, fontWeight: 600, padding: "4px 10px", outline: "none", width: 220 }}
          />
        ) : (
          <button
            onClick={() => { setNameVal(scene?.label ?? ""); setEditingName(true); }}
            style={{ background: "none", border: "none", color: "var(--text)", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "4px 6px", borderRadius: 4 }}
            title="Click to rename scene"
          >
            {scene?.label ?? t('editor.scene.no_scene')}
            <span style={{ fontSize: 10, color: "var(--faint)", marginLeft: 6 }}>✎</span>
          </button>
        )}

        <span style={{ color: "var(--bdr)", margin: "0 2px" }}>│</span>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>{events.length} {t('editor.nav.events').toLowerCase()}</span>

        <div style={{ flex: 1 }} />

        {/* Zoom Controls */}
        <div style={{
          display: "flex", gap: 4, alignItems: "center",
          background: "var(--bg2)", border: "1px solid var(--bdr)", 
          borderRadius: 6, padding: "2px 6px", marginRight: 8
        }}>
          <button onClick={() => setZoom(z => Math.max(0.25, z - 0.1))}
            style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>−</button>
          <span style={{ fontSize: 10, color: "var(--text)", fontFamily: "var(--mono)", minWidth: 36, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.1))}
            style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>+</button>
          <div style={{ width: 1, height: 14, background: "var(--bdr)", margin: "0 2px" }} />
          <button onClick={() => setZoom(1)}
            style={{ background: "none", border: "none", color: "var(--faint)", cursor: "pointer", fontSize: 9, fontFamily: "var(--mono)" }}
            title="Reset zoom">{t('canvas.fit_all')}</button>
          <div style={{ width: 1, height: 14, background: "var(--bdr)", margin: "0 2px" }} />
          <button onClick={() => setShowGuides(g => !g)}
            style={{ background: showGuides ? "var(--teal)" : "none", border: "none", color: showGuides ? "#000" : "var(--faint)", cursor: "pointer", fontSize: 11, borderRadius: 4, padding: "2px 6px" }}
            title="Toggle Composition Guides (Rule of Thirds & Safe Zones)">⌗</button>
        </div>

        {/* Undo/Redo */}
        <button className="btn btn-ghost btn-icon" onClick={onUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3 }} title="Undo (Ctrl+Z)">↩</button>
        <button className="btn btn-ghost btn-icon" onClick={onRedo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : 0.3 }} title="Redo (Ctrl+Y)">↪</button>

        <span style={{ color: "var(--bdr)", margin: "0 2px" }}>│</span>

        {/* ▶ Preview */}
        <button
          className="btn btn-accent"
          style={{ fontSize: 11, gap: 4, flexShrink: 0, background: previewState === "err" ? "var(--err)" : undefined }}
          disabled={!scene || previewState === "launching" || !project._rootPath}
          title={sdkPath ? `Launch Ren'Py (${sdkPath})` : "Launch Ren'Py — click to configure SDK"}
          onClick={() => project._rootPath && handlePreview(project._rootPath)}
        >
          {previewState === "launching" ? "⏳" : previewState === "ok" ? "✔" : previewState === "err" ? "✕" : "▶"} {t('editor.scene.preview')}
        </button>
        {previewState === "err" && (
          <span style={{ fontSize: 10, color: "var(--err)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
            title={previewMsg}
            onClick={() => { pendingLaunchRef.current = project._rootPath ?? null; setShowSdkModal(true); }}>
            ⚠ {previewMsg.split("\n")[0]}
          </span>
        )}
        {/* SDK gear — always visible so the user can reconfigure */}
        <button className="btn btn-ghost btn-icon" style={{ fontSize: 12 }}
          title={sdkPath ? `SDK: ${sdkPath}\nClick to change` : "Configure Ren'Py SDK path"}
          onClick={() => { pendingLaunchRef.current = null; setShowSdkModal(true); }}>⚙
        </button>
      </div>

      {/* SDK Setup Modal */}
      {showSdkModal && (
        <SdkSetupModal
          initialPath={sdkPath}
          onConfirm={(path) => {
            setSdkPath(path);
            localStorage.setItem(LS_SDK_KEY, path);
            setShowSdkModal(false);
            // If we were triggered by a Play button, re-fire preview
            const root = pendingLaunchRef.current;
            pendingLaunchRef.current = null;
            if (root) {
              // Small delay so modal unmounts cleanly first
              setTimeout(() => handlePreview(root), 50);
            }
          }}
          onDismiss={() => { setShowSdkModal(false); pendingLaunchRef.current = null; }}
        />
      )}

      {/* ── Main Layout: Preview + Floating Inspector + Bottom Timeline ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        
        {/* Top Section: Preview & Floating Panels */}
        <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden", padding: 16, gap: 16 }}>
          
          {/* LEFT: Dynamic Sidebar */}
          <div style={{
            width: leftWidth, flexShrink: 0, position: "relative",
            display: "flex", flexDirection: "column",
            background: "rgba(13, 15, 26, 0.75)", backdropFilter: "blur(12px)",
            border: "1px solid var(--bdr)", borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)", overflow: "hidden", zIndex: 10,
          }}>
            {/* Resizer */}
            <div 
              style={{ position: "absolute", top: 0, right: 0, width: 6, height: "100%", cursor: "ew-resize", zIndex: 100 }}
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = leftWidth;
                const move = (e: MouseEvent) => setLeftWidth(Math.max(150, startWidth + (e.clientX - startX)));
                const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
            />

            {/* Headers Area (Horizontal Tabs) */}
            <div style={{ flexShrink: 0, display: "flex", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {(["scenes", "images", "audio", "effects"] as const).map(mode => {
                const isActive = leftMode === mode;
                const icons = { scenes: "🎬", images: "🖼", audio: "🎵", effects: "✨" };
                const labels = {
                  scenes: t('editor.scene.sidebar_scenes'),
                  images: t('editor.scene.sidebar_images'),
                  audio:  t('editor.scene.sidebar_audio'),
                  effects: t('editor.scene.sidebar_effects'),
                };
                return (
                  <button
                    key={mode}
                    title={labels[mode]}
                    onClick={() => setLeftMode(mode)}
                    style={{
                      flex: 1, padding: "10px 0",
                      background: isActive ? "rgba(255,255,255,0.05)" : "transparent",
                      border: "none", borderBottom: isActive ? "2px solid var(--teal)" : "2px solid transparent",
                      color: isActive ? "var(--teal)" : "var(--dim)",
                      cursor: "pointer", transition: "all 0.15s",
                      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{icons[mode]}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>{labels[mode]}</span>
                  </button>
                );
              })}
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "rgba(0,0,0,0.15)" }}>
              {isAnimMode ? (
                <AnimPropertiesPanel 
                  frames={selEvent.animation_keyframes || []}
                  selIdx={animSelIdx}
                  onChange={(v) => { if (selEvent) onEventChange({ ...selEvent, animation_keyframes: v }) }}
                />
              ) : leftMode === "scenes" ? (
                        <>
                <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {project.scenes.map(s => (
                      <div key={s.id}
                        className="scene-list-row"
                        style={{ display: "flex", alignItems: "center", borderRadius: 6, overflow: "hidden" }}
                      >
                        <button
                          onClick={() => setSelSceneId(s.id)}
                          style={{
                            flex: 1, textAlign: "left", padding: "8px 12px", borderRadius: 6,
                            background: selSceneId === s.id ? "rgba(0, 212, 200, 0.15)" : "transparent",
                            border: selSceneId === s.id ? "1px solid var(--teal)" : "1px solid transparent",
                            color: selSceneId === s.id ? "var(--teal)" : "var(--text)",
                            fontSize: 13, fontWeight: selSceneId === s.id ? 700 : 500,
                            cursor: "pointer", transition: "all 0.1s"
                          }}
                        >
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
                          {s.description && (
                            <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.description}
                            </div>
                          )}
                        </button>
                        <div className="scene-row-actions" style={{ display: "flex", gap: 2, padding: "0 4px", opacity: 0, transition: "opacity 0.12s" }}>
                          <button
                            title="Duplicate scene"
                            onClick={e => {
                              e.stopPropagation();
                              const dup: typeof s = {
                                ...s,
                                id: uid(),
                                label: s.label + " (copy)",
                                events: s.events.map(ev => ({ ...ev, id: uid() })),
                              };
                              const idx = project.scenes.indexOf(s);
                              const newScenes = [...project.scenes];
                              newScenes.splice(idx + 1, 0, dup);
                              onProjectChange({ ...project, scenes: newScenes });
                              setSelSceneId(dup.id);
                              refresh();
                            }}
                            style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 12, padding: "3px 5px", borderRadius: 3, lineHeight: 1 }}
                          >⧉</button>
                          <button
                            title="Delete scene"
                            onClick={e => {
                              e.stopPropagation();
                              if (!confirm(`Delete "${s.label}"?`)) return;
                              const idx = project.scenes.indexOf(s);
                              const newScenes = [...project.scenes];
                              newScenes.splice(idx, 1);
                              onProjectChange({ ...project, scenes: newScenes });
                              setSelSceneId(newScenes[Math.max(0, idx - 1)]?.id ?? "");
                              refresh();
                            }}
                            style={{ background: "none", border: "none", color: "var(--err)", cursor: "pointer", fontSize: 11, padding: "3px 5px", borderRadius: 3, lineHeight: 1 }}
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "8px", borderTop: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)" }}>
                  <button className="btn" style={{ width: "100%", fontSize: 11 }}
                    onClick={() => {
                      const s = newScene(`Scene ${project.scenes.length + 1}`);
                      const newScenes = [...project.scenes, s];
                      onProjectChange({ ...project, scenes: newScenes });
                      setSelSceneId(s.id);
                      refresh();
                }}
              >{t('editor.scene.new_scene_btn')}</button>
                          </div>
                        </>
                      ) : (
                        <SidebarAssetBrowser 
                          project={project} 
                          mode={leftMode as any} 
                          onPick={path => {
                            if (selEvent && selIdx !== null) {
                              const key = leftMode === "images" ? (selEvent.type === "bg" ? "bg" : "image") : (leftMode === "audio" ? "music" : "");
                              if (key) {
                                const updated = { ...selEvent, [key]: path } as VNEvent;
                                const snap = JSON.parse(JSON.stringify(scene?.events || [])) as VNEvent[];
                                const newScenes = project.scenes.map(sc => {
                                  if (scene && sc.id === scene.id) {
                                    const copy = JSON.parse(JSON.stringify(sc)) as VNScene;
                                    copy.events[selIdx] = updated;
                                    return copy;
                                  }
                                  return sc;
                                });
                                onProjectChange({ ...project, scenes: newScenes });
                                refresh();
                              }
                            }
                          }}
                        />
                      )}
            </div>
          </div>

          {/* CENTER: Preview */}
          <div style={{ flex: 1, borderRadius: 12, overflow: "hidden", display: "flex", position: "relative", background: "#000" }}>
            <style>{`
              .scene-list-row:hover .scene-row-actions { opacity: 1 !important; }
              @keyframes vnv-dissolve-out { from { opacity: 1; } to { opacity: 0; } }
              @keyframes vnv-dissolve-in { from { opacity: 0; } to { opacity: 1; } }
              
              @keyframes vnv-fade-out { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 0; } }
              @keyframes vnv-fade-in { 0% { opacity: 0; } 50% { opacity: 0; } 100% { opacity: 1; } }

              @keyframes vnv-wipeleft-out { from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } to { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); } }
              @keyframes vnv-wipeleft-in { from { clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%); } to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } }

              @keyframes vnv-wiperight-out { from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } to { clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%); } }
              @keyframes vnv-wiperight-in { from { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); } to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } }

              @keyframes vnv-wipeup-out { from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } to { clip-path: polygon(0 0, 100% 0, 100% 0, 0 0); } }
              @keyframes vnv-wipeup-in { from { clip-path: polygon(0 100%, 100% 100%, 100% 100%, 0 100%); } to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } }

              @keyframes vnv-wipedown-out { from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } to { clip-path: polygon(0 100%, 100% 100%, 100% 100%, 0 100%); } }
              @keyframes vnv-wipedown-in { from { clip-path: polygon(0 0, 100% 0, 100% 0, 0 0); } to { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } }

              @keyframes vnv-slideleft-out { from { transform: translateX(0); } to { transform: translateX(-100%); } }
              @keyframes vnv-slideleft-in { from { transform: translateX(100%); } to { transform: translateX(0); } }

              @keyframes vnv-slideright-out { from { transform: translateX(0); } to { transform: translateX(100%); } }
              @keyframes vnv-slideright-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }

              @keyframes vnv-slideup-out { from { transform: translateY(0); } to { transform: translateY(-100%); } }
              @keyframes vnv-slideup-in { from { transform: translateY(100%); } to { transform: translateY(0); } }

              @keyframes vnv-slidedown-out { from { transform: translateY(0); } to { transform: translateY(100%); } }
              @keyframes vnv-slidedown-in { from { transform: translateY(-100%); } to { transform: translateY(0); } }
            `}</style>
            
            {oldSceneId && (() => {
              const oldSc = project.scenes.find(s => s.id === oldSceneId);
              if (!oldSc) return null;
              // Fallback to dissolve if transition is unknown
              const animOut = `vnv-${transitionKind || 'dissolve'}-out 1s forwards cubic-bezier(0.4, 0, 0.2, 1)`;
              return (
                <div style={{ position: "absolute", inset: 0, zIndex: 5, animation: animOut, pointerEvents: "none", display: "flex" }}>
                  <ScenePreview
                    events={oldSc.events}
                    selectedIdx={oldSc.events.length - 1}
                    project={project}
                    rootPath={project._rootPath ?? ""}
                    inheritedBg={inheritedBg}
                    inheritedSprite={inheritedSprite}
                    colorGradeFilter={colorGradeToCss(oldSc.color_grade) || undefined}
                    guiCfg={guiCfg}
                    showGuides={false}
                    zoom={zoom} setZoom={setZoom}
                  />
                </div>
              );
            })()}

            <div style={{ 
              position: "absolute", inset: 0, zIndex: 1, display: "flex",
              animation: oldSceneId ? `vnv-${transitionKind || 'dissolve'}-in 1s forwards cubic-bezier(0.4, 0, 0.2, 1)` : "none" 
            }}>
              <ScenePreview
                events={events}
                selectedIdx={selIdx}
                project={project}
                rootPath={project._rootPath ?? ""}
                inheritedBg={inheritedBg}
                inheritedSprite={inheritedSprite}
                colorGradeFilter={colorGradeToCss(scene?.color_grade) || undefined}
                guiCfg={guiCfg}
                showGuides={showGuides}
                zoom={zoom}
                setZoom={setZoom}
                onNavigateToScene={setSelSceneId}
                onImageClick={(field) => {
                  if (selEvent && (field === "bg" ? selEvent.type === "bg" : selEvent.type === "image")) {
                    setPickerModal({ field });
                  }
                }}
                onUpdateEventById={(id, partial) => {
                  if (!scene) return;
                  const idx = scene.events.findIndex(e => e.id === id);
                  if (idx === -1) return;
                  updateScene(sc => { sc.events[idx] = { ...sc.events[idx], ...partial }; }, "Drag sprite");
                }}
                isCurrentThumbnail={scene?.thumbnail_event_id === selEvent?.id}
                onSetThumbnail={(id) => {
                  updateScene(sc => {
                    sc.thumbnail_event_id = sc.thumbnail_event_id === id ? undefined : id;
                  }, "Toggle Thumbnail Override");
                }}
              />
            </div>
          </div>

          {/* RIGHT: Inspector */}
          <div style={{
            width: rightWidth, flexShrink: 0, position: "relative",
            display: "flex", flexDirection: "column",
            background: "rgba(13, 15, 26, 0.75)", backdropFilter: "blur(12px)",
            border: "1px solid var(--bdr)", borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)", overflow: "hidden", zIndex: 10,
          }}>
            {/* Resizer */}
            <div 
              style={{ position: "absolute", top: 0, left: 0, width: 8, height: "100%", cursor: "ew-resize", zIndex: 100 }}
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = rightWidth;
                const move = (e: MouseEvent) => setRightWidth(Math.max(200, startWidth - (e.clientX - startX)));
                const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
            />
            {isAnimMode ? (
              <AnimActionsPanel 
                frames={selEvent.animation_keyframes || []}
                selIdx={animSelIdx}
                onChange={(v) => { if (selEvent) onEventChange({ ...selEvent, animation_keyframes: v }) }}
                onPlayIde={() => window.dispatchEvent(new CustomEvent("vnv_play_animation", { detail: { eventId: selEvent.id } }))}
                onTestRenpy={async () => {
                  try {
                    const fileStr = compileSingleAnimationPreview(project, selEvent);
                    ToastManager.info("Launching Ren'Py preview engine...");
                    const RENPY_LANGS: Record<string, string> = {
                      es: "spanish", fr: "french", de: "german", ja: "japanese", ko: "korean", ru: "russian", zh: "simplified_chinese", "zh-TW": "traditional_chinese"
                    };
                    const prefLang = localStorage.getItem("pref_language") || "en";
                    const envLang = RENPY_LANGS[prefLang] || "";
                    await launchRenpyPreview(project._rootPath ?? "", fileStr, sdkPath || null, envLang);
                    ToastManager.success("Animation is playing in Ren'Py window.");
                  } catch (e: any) {
                    ToastManager.error("Preview Error: " + String(e));
                  }
                }}
                onClose={() => setShowAnimTrack(false)}
              />
            ) : selEvent ? (
              <>
                {/* Inspector header */}
                <div style={{
                  padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.1)",
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 10, fontWeight: 700, color: "var(--dim)",
                  letterSpacing: ".1em", textTransform: "uppercase", background: "rgba(0,0,0,0.2)"
                }}>
                  <span style={{ fontSize: 14 }}>{TOOL_ICONS[selEvent.type] ?? "○"}</span>
                  <span style={{ color: TOOL_COLORS[selEvent.type] ?? "var(--dim)" }}>{selEvent.type || "empty"}</span>
                  <span style={{ fontSize: 9, color: "var(--faint)", marginLeft: "auto" }}>#{(selIdx ?? 0) + 1}</span>
                </div>

                {/* Inspector fields */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <Inspector
                    ev={selEvent}
                    project={project}
                    rootPath={project._rootPath ?? ""}
                    onChange={onEventChange}
                    onOpenAnimTrack={() => setShowAnimTrack(true)}
                  />
                </div>

                {/* Action buttons */}
                <div style={{
                  padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.1)",
                  display: "flex", flexWrap: "wrap", gap: 4, background: "rgba(0,0,0,0.2)"
                }}>
                  <button className="btn" style={{ flex: 1, fontSize: 11, minWidth: 60 }}
                    title="Copy event (Ctrl+C)"
                    onClick={() => selIdx !== null && copyEvent(selIdx)}>⎘ {t('editor.scene.copy')}</button>
                  <button className="btn" style={{ flex: 1, fontSize: 11, minWidth: 60 }}
                    title="Cut event (Ctrl+X)"
                    onClick={() => selIdx !== null && cutEvent(selIdx)}>✂ {t('editor.scene.cut')}</button>
                  <button className="btn" style={{ flex: 1, fontSize: 11, minWidth: 60 }}
                    title="Paste event after this one (Ctrl+V)"
                    disabled={!_evClipboard}
                    onClick={pasteEvent}>⎘ {t('editor.scene.paste')}</button>
                  <button className="btn" style={{ flex: 1, fontSize: 11, minWidth: 60 }}
                    title="Duplicate event (Ctrl+D)"
                    onClick={() => selIdx !== null && duplicateEvent(selIdx)}>⧉ {t('editor.scene.dupe')}</button>
                  <button className="btn btn-danger" style={{ flex: "0 0 100%", fontSize: 11 }}
                    title="Delete event (Del)"
                    onClick={() => selIdx !== null && deleteEvent(selIdx)}>✕ {t('editor.scene.delete_event')}</button>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Scene Notes */}
                {scene && (
                  <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>📝</span> {t('editor.scene.scene_notes')}
                    </div>
                    <textarea
                      value={scene.description ?? ""}
                      onChange={e => updateScene(sc => { sc.description = e.target.value; }, "Edit scene notes")}
                      placeholder={t('editor.scene.notes_placeholder')}
                      rows={5}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: "rgba(251,191,36,0.04)",
                        border: "1px solid rgba(251,191,36,0.2)",
                        borderRadius: 8, color: "var(--text)", fontSize: 12,
                        padding: "10px 12px", resize: "vertical", outline: "none",
                        fontFamily: "inherit", lineHeight: 1.6,
                        transition: "border-color 0.15s",
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = "rgba(251,191,36,0.5)"}
                      onBlur={e => e.currentTarget.style.borderColor = "rgba(251,191,36,0.2)"}
                    />
                    {scene.description && (
                      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 4, textAlign: "right" }}>
                        {scene.description.length} chars · {scene.description.trim().split(/\s+/).filter(Boolean).length} words
                      </div>
                    )}
                    
                    {/* Thumbnail options */}
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 11, color: "var(--text)", cursor: "pointer" }} title="Prevents character portraits from rendering on this scene's thumbnail in the Graph.">
                      <input 
                        type="checkbox" 
                        checked={!!scene.thumbnail_hide_sprites}
                        onChange={e => updateScene(sc => { sc.thumbnail_hide_sprites = e.target.checked; }, "Toggle thumbnail sprites")}
                        style={{ accentColor: "var(--teal)" }}
                      />
                      {t('editor.scene.hide_sprites')}
                    </label>
                  </div>
                )}
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: "var(--faint)", padding: 16, textAlign: "center" }}>
                  <span style={{ fontSize: 28 }}>🔍</span>
                  <span style={{ fontSize: 11 }}>{t('editor.scene.select_event_hint')}</span>
                </div>
                {/* Scene-level color grading when no event is selected */}
                {scene && (
                  <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                    <ColorGradePanel
                      grade={scene.color_grade}
                      onChange={g => updateScene(sc => { sc.color_grade = g; }, "Color grade")}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM: Horizontal Timeline */}
        <div style={{
          height: bottomHeight, flexShrink: 0, display: "flex", flexDirection: "column", position: "relative",
          borderTop: "1px solid var(--bdr)", background: "var(--bg1)", overflow: "hidden",
        }}>
          {/* Resizer */}
          <div 
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 6, cursor: "ns-resize", zIndex: 100 }}
            onMouseDown={(e) => {
              e.preventDefault();
              const startY = e.clientY;
              const startHeight = bottomHeight;
              const move = (e: MouseEvent) => setBottomHeight(Math.max(100, startHeight - (e.clientY - startY)));
              const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          />
          {isAnimMode ? (
            <AnimTimelinePanel
              frames={selEvent.animation_keyframes || []}
              selIdx={animSelIdx}
              setSelIdx={setAnimSelIdx}
              onChange={(v) => { if (selEvent) onEventChange({ ...selEvent, animation_keyframes: v }) }}
            />
          ) : (
            <>
              <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--bdr)", fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: ".1em", textTransform: "uppercase" }}>
                {t('editor.scene.timeline')}
              </div>
              <div ref={listRef} style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
                <EventList
                  events={events}
                  project={project}
                  selectedIdx={selIdx}
                  onSelect={setSelIdx}
                  onMove={moveEvent}
                  onDelete={deleteEvent}
                  onDuplicate={duplicateEvent}
                  armedToolType={armedTool}
                  onToolDrop={(type, insertAt) => {
                    if (!scene) return;
                    const ev = newEvent(type);
                    updateScene(sc => { sc.events.splice(insertAt, 0, ev); }, `Add ${type}`);
                    setSelIdx(insertAt);
                    setArmedTool(null);
                    armedToolOrigin.current = null;
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bottom: Add toolbar ── */}
      <div style={{
        height: 56, flexShrink: 0, display: "flex", alignItems: "center",
        gap: 6, padding: "0 10px", background: "var(--bg1)",
        borderTop: "1px solid var(--bdr)", overflowX: "auto", position: "relative",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", letterSpacing: ".1em", textTransform: "uppercase", marginRight: 4, flexShrink: 0 }}>{t('editor.scene.add')}</span>
        {TOOLS.map(type => {
          const active = armedTool === type;
          const color  = TOOL_COLORS[type];
          return (
            <button key={type}
              onClick={e => {
                e.stopPropagation(); // prevent cancel from outer div
                if (armedTool === type) {
                  // Second click on same tool simply disarms it
                  setArmedTool(null);
                  armedToolOrigin.current = null;
                } else {
                  // Arm the tool and record button center for the wire
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  armedToolOrigin.current = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  };
                  setArmedTool(type);
                }
              }}
              title={t('editor.scene.arm_tooltip').replace('{tool}', t(`events.${type}`))}
              style={{
                flexShrink: 0, padding: "6px 14px", borderRadius: 6, border: "none",
                background: active ? `${color}33` : "transparent",
                color: active ? color : "var(--dim)",
                fontSize: 13, fontWeight: 600, cursor: active ? "crosshair" : "pointer",
                outline: active ? `1px solid ${color}` : "none",
                boxShadow: active ? `0 0 10px ${color}55` : "none",
                transition: "all .15s", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>{TOOL_ICONS[type]}</span>
              <span style={{ textTransform: "capitalize" }}>{t(`events.${type}`)}</span>
            </button>
          );
        })}
        {armedTool && (
          <div style={{
            position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
            background: "var(--bg1)", padding: "6px 16px", borderRadius: 20,
            border: `1px solid ${TOOL_COLORS[armedTool] ?? "var(--bdr)"}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)", zIndex: 10,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 11, color: TOOL_COLORS[armedTool] ?? "var(--acc)", fontWeight: 700, animation: "pulse 1s ease-in-out infinite" }}>
              {t('editor.scene.armed_hint')} {t(`events.${armedTool}`)}
            </span>
            <button onClick={e => { e.stopPropagation(); setArmedTool(null); armedToolOrigin.current = null; }}
              style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
          </div>
        )}
      </div>

      {/* ── Asset Picker Modal (opened by clicking bg/sprite in the preview) ── */}
      {pickerModal && project._rootPath && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setPickerModal(null)}
        >
          <div
            style={{
              width: "82vw", height: "78vh", maxWidth: 1200,
              background: "var(--bg1)", border: "1px solid var(--bdr)",
              borderRadius: 14, overflow: "hidden",
              display: "flex", flexDirection: "column",
              boxShadow: "0 32px 96px rgba(0,0,0,0.7)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              padding: "12px 18px", borderBottom: "1px solid var(--bdr)",
              background: "var(--bg2)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            }}>
              <span style={{ fontSize: 16 }}>{pickerModal.field === "bg" ? "🖼" : "🎨"}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {pickerModal.field === "bg" ? t('editor.scene.choose_bg') : t('editor.scene.choose_image')}
              </span>
              <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: 4 }}>
                {t('editor.scene.picker_hint')}
              </span>
              <button
                onClick={() => setPickerModal(null)}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--faint)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                title="Close (Esc)"
              >✕</button>
            </div>

            {/* Full AssetBrowser in picker mode */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <AssetBrowser
                rootPath={project._rootPath}
                project={project}
                onPick={(path) => {
                  if (selEvent && selIdx !== null) {
                    const key = pickerModal.field === "bg" ? "bg" : "image";
                    onEventChange({ ...selEvent, [key]: path });
                  }
                  setPickerModal(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
