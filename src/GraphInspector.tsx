import React, { useState, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import type { VNProject, VNFolder } from "./types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { computeSceneBgs } from "./sceneGraphUtils";
import { MAIN_MENU_ID } from "./StoryCanvas";
import { compilePreview } from "./compiler";
import { playFromScene } from "./tauriApi";
import { ToastManager } from "./toastContext";
import { SdkSetupModal } from "./SdkSetupModal";
import { useTranslation } from "./translationContext";

// ── Fuzzy bg resolver (mirrors NodeBgThumb logic) ─────────────────────────────
const EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const RENPY_COLORS = new Set(["black", "white", "transparent"]);

function bgCandidates(rootPath: string, name: string): string[] {
  if (!name || !rootPath || RENPY_COLORS.has(name.toLowerCase())) return [];
  const norm = name.replace(/\s+/g, "_");
  const urls: string[] = [];
  for (const base of [name, norm]) {
    if (/\.[a-zA-Z]{2,5}$/.test(base)) {
      urls.push(convertFileSrc(`${rootPath}/${base}`));
      if (!base.startsWith("game/"))   urls.push(convertFileSrc(`${rootPath}/game/images/${base}`));
      if (!base.startsWith("images/")) urls.push(convertFileSrc(`${rootPath}/images/${base}`));
    } else {
      for (const ext of EXTS) {
        urls.push(convertFileSrc(`${rootPath}/game/images/${base}${ext}`));
        urls.push(convertFileSrc(`${rootPath}/images/${base}${ext}`));
        urls.push(convertFileSrc(`${rootPath}/${base}${ext}`));
      }
    }
  }
  return [...new Set(urls)];
}

/** Self-contained image component that cycles through candidate paths on error.
 *  Mirrors NodeBgThumb in StoryCanvas — same pattern, provably works. */
function BgImage({ rootPath, name, style }: { rootPath: string; name: string | null; style?: React.CSSProperties }) {
  const list = React.useMemo(
    () => (name && !RENPY_COLORS.has(name.toLowerCase()) ? bgCandidates(rootPath, name) : []),
    [rootPath, name]
  );
  const [idx, setIdx] = React.useState(0);
  const [dead, setDead] = React.useState(false);
  React.useEffect(() => { setIdx(0); setDead(false); }, [list.join("|")]); // eslint-disable-line

  if (dead || list.length === 0) return null;
  return (
    <img
      src={list[idx]}
      alt=""
      onError={() => { if (idx + 1 < list.length) setIdx(i => i + 1); else setDead(true); }}
      style={style}
    />
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Section({ title, defaultOpen = true, children }: { title: string, defaultOpen?: boolean, children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="col" style={{ width: "100%" }}>
      <button 
        className="btn-ghost" 
        style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "var(--bg2)", borderBottom: "1px solid var(--bdr)", borderRadius: 0, justifyContent: "flex-start", gap: 8 }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ fontSize: 10, color: "var(--dim)" }}>{open ? "▼" : "▶"}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 1 }}>{title}</span>
      </button>
      {open && (
        <div className="col" style={{ padding: "12px", background: "var(--bg1)", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Inspector Component ──────────────────────────────────────────────────────

interface Props {
  project: VNProject;
  rootPath: string;
  selection: Set<string>;
  onEditScene?: (id: string) => void;
  onGoScene?: (id: string) => void;
  onDeleteSelected?: () => void;
  onRenameNode?: (id: string, label: string) => void;
  onSetStart?: (id: string) => void;
  onEnterMainMenu?: () => void;
  onMoveToRoot?: (id: string) => void;
  onUpdateFolderType?: (id: string, type: 'folder' | 'hub') => void;
}

export function GraphInspector({ project, rootPath, selection, onEditScene, onGoScene, onDeleteSelected, onRenameNode, onSetStart, onEnterMainMenu, onMoveToRoot, onUpdateFolderType }: Props) {
  const { t } = useTranslation();
  const [renameVal, setRenameVal] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<'windowed' | 'fullscreen'>('windowed');
  const [showSdkModal, setShowSdkModal] = useState(false);
  const sdkPendingRef = React.useRef<(() => void) | null>(null);

  // Compute effective bgs for all scenes at top level (hooks must not be conditional)
  const { effectiveBg, effectiveMusic, inheritedMusic, inheritedBg, inheritedSprite } = useMemo(() => computeSceneBgs(project), [project]);
  const id = selection.size === 1 ? Array.from(selection)[0] : null;
  const scene = id ? project.scenes.find(s => s.id === id) ?? null : null;
  const bgName = scene ? (effectiveBg[scene.id] ?? null) : null;
  const musicTrack = scene ? (inheritedMusic[scene.id] ?? effectiveMusic[scene.id] ?? null) : null;

  // SDK modal renders as a portal at document.body so it floats above all inspector branches
  const sdkModalJsx = showSdkModal
    ? ReactDOM.createPortal(
        <SdkSetupModal
          initialPath={localStorage.getItem("vnv_renpy_sdk_path") ?? ""}
          onConfirm={(path) => {
            localStorage.setItem("vnv_renpy_sdk_path", path);
            setShowSdkModal(false);
            setPlayError(null);
            const pending = sdkPendingRef.current;
            sdkPendingRef.current = null;
            if (pending) setTimeout(pending, 50);
          }}
          onDismiss={() => { setShowSdkModal(false); sdkPendingRef.current = null; }}
        />,
        document.body
      )
    : null;

  // When nothing (or multiple) is selected, render a collapsed panel that takes no space.
  // The canvas gets the full width by default, and the inspector slides in only when needed.
  if (selection.size !== 1) {
    const multiSel = selection.size > 1;
    return (
      <>
        <div
          className="col"
          style={{
            width: '100%',
            background: "var(--bg1)",
            flexShrink: 0,
            overflow: "hidden",
            transition: "width 0.2s ease, min-width 0.2s ease",
            alignItems: "center",
            justifyContent: multiSel ? "flex-start" : "center",
            padding: 20,
            textAlign: "center",
            color: "var(--faint)",
            minHeight: 120,
          }}
        >
          {multiSel && (
            <>
              <span style={{ fontSize: 48, marginBottom: 12 }}>📦</span>
              <span style={{ fontSize: 14, color: "var(--dim)" }}>
                {t('canvas.inspector_multi').replace('{n}', String(selection.size))}
              </span>
              {/* Don't offer delete if only main_menu is in selection */}
              {![...selection].every(id => id === MAIN_MENU_ID) && (
                <button className="btn btn-ghost" style={{ marginTop: 16, color: "var(--err)" }} onClick={onDeleteSelected}>
                  {t('canvas.delete_selected')}
                </button>
              )}
            </>
          )}
        </div>
        {sdkModalJsx}
      </>
    );
  }

  const nonNullId = id ?? "";
  const folder = project.folders.find(f => f.id === nonNullId);

  const handleStartRename = (currentLabel: string) => {
    setRenamingId(nonNullId);
    setRenameVal(currentLabel);
  };

  const finishRename = () => {
    if (renamingId && onRenameNode) {
      onRenameNode(renamingId, renameVal);
    }
    setRenamingId(null);
  };

  if (id === MAIN_MENU_ID) {
    return (
      <>
        <div className="col" style={{ width: '100%', background: "var(--bg0)", overflowY: "auto", transition: "width 0.2s ease" }}>
        
        {/* Header */}
        <div className="col" style={{ background: "var(--bg2)", padding: "16px", borderBottom: "1px solid var(--bdr)", gap: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Main Menu</span>
          <span style={{ fontSize: 16, color: "var(--dim)" }}>{project.title || "Project"}</span>
          <span style={{ fontSize: 12, color: "var(--faint)" }}>{t('canvas.system_node')}</span>
        </div>

        {/* Actions */}
        <div className="col gap8" style={{ padding: "16px", borderBottom: "1px solid var(--bdr)" }}>
          <button
            className="btn"
            style={{ width: '100%', justifyContent: 'center', background: "var(--bg3)", color: "#facc15", border: "1px solid #facc1555", fontWeight: 700 }}
            onClick={onEnterMainMenu}
          >
            {t('canvas.enter_menu')}
          </button>
          {project.start && (
            <>
              <button
                className="btn flex1"
                disabled={playing || !rootPath}
                style={{ width: '100%', justifyContent: 'center', gap: 6, background: playing ? 'rgba(74,222,128,0.07)' : 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 700 }}
                onClick={async () => {
                  setPlaying(true); setPlayError(null);
                  try {
                    const sdk = localStorage.getItem("vnv_renpy_sdk_path") || undefined;
                    const rpy = compilePreview(project, MAIN_MENU_ID, undefined, playMode);
                    await playFromScene(rootPath, MAIN_MENU_ID, rpy, sdk);
                  } catch (e) {
                    const msg = String(e);
                    setPlayError(msg);
                    ToastManager.error(t('toasts.play_failed').replace('{err}', msg));
                    if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no such") || msg.toLowerCase().includes("cannot find")) {
                      sdkPendingRef.current = null; // main menu play handler
                      setShowSdkModal(true);
                    }
                  } finally {
                    setPlaying(false);
                  }
                }}
              >
                {playing ? t('canvas.launching') : t('canvas.play_project')}
              </button>
              <div className="row gap4">
                <button
                  className="btn flex1"
                  style={{
                    background: playMode === 'windowed' ? 'rgba(34,211,238,0.15)' : 'var(--bg3)',
                    color: playMode === 'windowed' ? '#22d3ee' : 'var(--dim)',
                    border: playMode === 'windowed' ? '1px solid #22d3ee55' : '1px solid var(--bdr)',
                    fontSize: 11,
                    justifyContent: 'center',
                  }}
                  onClick={() => setPlayMode('windowed')}
                >
                  🪟 Windowed
                </button>
                <button
                  className="btn flex1"
                  style={{
                    background: playMode === 'fullscreen' ? 'rgba(34,211,238,0.15)' : 'var(--bg3)',
                    color: playMode === 'fullscreen' ? '#22d3ee' : 'var(--dim)',
                    border: playMode === 'fullscreen' ? '1px solid #22d3ee55' : '1px solid var(--bdr)',
                    fontSize: 11,
                    justifyContent: 'center',
                  }}
                  onClick={() => setPlayMode('fullscreen')}
                >
                  {t('canvas.fullscreen')}
                </button>
              </div>
              {playError && (
                <div style={{ fontSize: 11, color: 'var(--err)', background: 'rgba(239,68,68,0.1)', padding: '6px 8px', borderRadius: 4 }}>
                  ⚠ {playError}
                </div>
              )}
            </>
          )}
        </div>

        <Section title={t('canvas.section_out')}>
          {project.start ? (
            <div className="col gap4">
              <div className="row gap8" style={{ background: "var(--bg2)", padding: "6px 10px", borderRadius: 4, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "var(--faint)" }}>➕</span>
                <div className="col flex1" style={{ overflow: "hidden" }}>
                  <span style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>screen</span>
                  <span style={{ fontSize: 13, color: "var(--teal)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                    {project.scenes.find(s => s.id === project.start)?.label || "Start"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--err)" }}>{t('canvas.no_start')}</span>
          )}
        </Section>
      </div>
      {sdkModalJsx}
    </>
  );
}

  if (folder) {
    const scenesInFolder = project.scenes.filter(s => folder.scene_ids.includes(s.id));
    return (
      <>
        <div className="col" style={{ width: '100%', background: "var(--bg1)", overflowY: "auto", transition: "width 0.2s ease" }}>
        
        {/* Header */}
        <div className="col" style={{ background: "var(--bg2)", padding: "16px", borderBottom: "1px solid var(--bdr)" }}>
          <div className="row gap8" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 24 }}>{folder.folder_type === 'hub' ? '🗺️' : '📁'}</span>
            {renamingId === id ? (
              <input autoFocus className="input flex1" value={renameVal} onChange={e => setRenameVal(e.target.value)} onBlur={finishRename} onKeyDown={e => { if (e.key === "Enter") finishRename(); if (e.key === "Escape") setRenamingId(null); }} />
            ) : (
              <span style={{ fontSize: 18, fontWeight: 600, flex: 1, cursor: "pointer", color: "var(--text)" }} onDoubleClick={() => handleStartRename(folder.label)} title="Double click to rename">{folder.label}</span>
            )}
          </div>
          <span style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>{folder.scene_ids.length} {t('editor.nav.scenes').toLowerCase()}</span>
        </div>

        {/* Actions */}
        <div className="col gap8" style={{ padding: "16px", borderBottom: "1px solid var(--bdr)" }}>
          <div className="col gap4">
            <span style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600 }}>{t('canvas.folder_type')}</span>
            <select className="input" value={folder.folder_type || 'folder'} onChange={e => onUpdateFolderType && onUpdateFolderType(folder.id, e.target.value as 'folder' | 'hub')} style={{ width: '100%', cursor: 'pointer' }}>
              <option value="folder">{t('canvas.folder_standard')}</option>
              <option value="hub">{t('canvas.folder_hub')}</option>
            </select>
          </div>
          <button className="btn btn-ghost" style={{ color: "var(--err)", marginTop: 8 }} onClick={onDeleteSelected}>{t('canvas.delete_folder')}</button>
        </div>

        {/* Content */}
        <Section title={t('canvas.section_scenes')}>
          {scenesInFolder.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--faint)" }}>{t('canvas.no_scenes')}</span>
          ) : (
            <div className="col gap4">
              {scenesInFolder.map(s => (
                <div key={s.id} className="row gap8" style={{ background: "var(--bg2)", padding: "6px 10px", borderRadius: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--dim)" }}>🎬</span>
                  <span style={{ fontSize: 13 }}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
      {sdkModalJsx}
    </>
  );
}

  if (scene) {
    const isStart = project.start === scene.id;
    // bgUrl is already computed at top level
    // Calculate inbound and outbound connections
    const outEdges: { label: string, target: string, color: string }[] = [];
    scene.events.forEach(ev => {
      if (ev.type === 'choice') {
        ev.opts?.forEach(opt => {
          if (opt.scene) {
            const tgt = project.scenes.find(s => s.id === opt.scene);
            if (tgt) outEdges.push({ label: opt.text || "?", target: tgt.label, color: "var(--teal)" });
          }
        });
      } else if (ev.type === 'jump' && ev.scene_id) {
        const tgt = project.scenes.find(s => s.id === ev.scene_id);
        if (tgt) outEdges.push({ label: "jump", target: tgt.label, color: "var(--acc)" });
      }
    });

    const inEdges: string[] = [];
    project.scenes.forEach(other => {
      if (other.id === scene.id) return;
      other.events.forEach(ev => {
        if (ev.type === 'choice') {
          if (ev.opts?.some(opt => opt.scene === scene.id)) inEdges.push(other.label);
        } else if (ev.type === 'jump' && ev.scene_id === scene.id) {
          inEdges.push(other.label);
        }
      });
    });

    return (
      <>
        <div className="col" style={{ width: '100%', background: "var(--bg0)", overflowY: "auto", transition: "width 0.2s ease" }}>
        
        {/* Hero BG */}
        {bgName ? (
          <div style={{ height: 120, width: "100%", position: "relative", overflow: "hidden", background: "var(--bg0)" }}>
            <BgImage rootPath={rootPath} name={bgName}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 8px", background: "rgba(0,0,0,0.6)" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "var(--mono)" }}>{bgName}</span>
            </div>
          </div>
        ) : (
          <div style={{ height: 4, width: "100%", background: "var(--acc)" }} />
        )}

        {/* Header */}
        <div className="col" style={{ background: "var(--bg2)", padding: "16px", borderBottom: "1px solid var(--bdr)", gap: 6 }}>
          {renamingId === id ? (
            <div className="col gap8">
              <input autoFocus className="input" style={{ fontSize: 18 }} value={renameVal} onChange={e => setRenameVal(e.target.value)} onBlur={finishRename} onKeyDown={e => { if (e.key === "Enter") finishRename(); if (e.key === "Escape") setRenamingId(null); }} />
              <button className="btn btn-accent" onClick={finishRename}>{t('canvas.save_name')}</button>
            </div>
          ) : (
            <div className="row gap8" style={{ alignItems: "center" }}>
              <span style={{ fontSize: 20, fontWeight: 700, flex: 1, cursor: "pointer", color: "var(--text)" }} onDoubleClick={() => handleStartRename(scene.label)} title="Double click to rename">{scene.label}</span>
              <button className="btn-ghost btn-icon" onClick={() => handleStartRename(scene.label)}>✏️</button>
            </div>
          )}
          <div className="row gap8" style={{ fontSize: 12, color: "var(--dim)", flexWrap: 'wrap' }}>
            <span>{scene.events.length} event{scene.events.length !== 1 ? 's' : ''}</span>
            <span style={{ color: "var(--faint)" }}>|</span>
            <span>{outEdges.length} link{outEdges.length !== 1 ? 's' : ''}</span>
            {musicTrack && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: 11,
                background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 4, padding: '1px 7px', fontFamily: 'var(--mono)', maxWidth: 140,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={`Music playing: ${musicTrack}`}>
                🎵 {musicTrack.split('/').pop()?.split('\\').pop()}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="col gap8" style={{ padding: "12px", borderBottom: "1px solid var(--bdr)" }}>
          <div className="row gap8">
            <button className="btn btn-accent flex1" onClick={() => onEditScene && onEditScene(scene.id)}>{t('canvas.enter_scene')}</button>
            <button className="btn btn-ghost flex1" onClick={() => onGoScene && onGoScene(scene.id)}>{t('canvas.go_scene')}</button>
          </div>
          <button
            className="btn flex1"
            disabled={playing || !rootPath}
            style={{ width: '100%', justifyContent: 'center', gap: 6, background: playing ? 'rgba(74,222,128,0.07)' : 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 700 }}
            onClick={async () => {
              setPlaying(true); setPlayError(null);
              try {
                const sdk = localStorage.getItem("vnv_renpy_sdk_path") || undefined;
                const rpy = compilePreview(project, scene.id, musicTrack ?? undefined, playMode, inheritedBg[scene.id] ?? undefined, inheritedSprite[scene.id] ?? undefined);
                await playFromScene(rootPath, scene.id, rpy, sdk);
              } catch (e) {
                const msg = String(e);
                setPlayError(msg);
                ToastManager.error(t('toasts.play_failed').replace('{err}', msg));
                if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no such") || msg.toLowerCase().includes("cannot find")) {
                  sdkPendingRef.current = null;
                  setShowSdkModal(true);
                }
              } finally {
                setPlaying(false);
              }
            }}
          >
            {playing ? t('canvas.launching') : t('canvas.play_from')}
          </button>
          <div className="row gap4">
            <button
              className="btn flex1"
              style={{
                background: playMode === 'windowed' ? 'rgba(34,211,238,0.15)' : 'var(--bg3)',
                color: playMode === 'windowed' ? '#22d3ee' : 'var(--dim)',
                border: playMode === 'windowed' ? '1px solid #22d3ee55' : '1px solid var(--bdr)',
                fontSize: 11,
                justifyContent: 'center',
              }}
              onClick={() => setPlayMode('windowed')}
            >
              🪟 Windowed
            </button>
            <button
              className="btn flex1"
              style={{
                background: playMode === 'fullscreen' ? 'rgba(34,211,238,0.15)' : 'var(--bg3)',
                color: playMode === 'fullscreen' ? '#22d3ee' : 'var(--dim)',
                border: playMode === 'fullscreen' ? '1px solid #22d3ee55' : '1px solid var(--bdr)',
                fontSize: 11,
                justifyContent: 'center',
              }}
              onClick={() => setPlayMode('fullscreen')}
            >
              🖥️ Full Screen
            </button>
          </div>
          {playError && (
            <div style={{ fontSize: 11, color: 'var(--err)', background: 'rgba(239,68,68,0.1)', padding: '6px 8px', borderRadius: 4 }}>
              ⚠ {playError}
            </div>
          )}
          {isStart ? (
            <div className="row gap8" style={{ background: "rgba(74, 222, 128, 0.1)", padding: "8px 10px", borderRadius: 4, color: "var(--teal)" }}>
              <span>ℹ️</span>
              <span style={{ fontSize: 13 }}>{t('canvas.is_start')}</span>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => onSetStart && onSetStart(scene.id)}>{t('canvas.set_start')}</button>
          )}
          
          {(() => {
            const parentFolder = project.folders.find(f => f.scene_ids.includes(scene.id));
            const parentScene = project.scenes.find(s => (s.scene_ids || []).includes(scene.id));
            if (parentFolder || parentScene) {
              return (
                <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", color: "var(--acc)", borderColor: "var(--acc)" }} onClick={() => onMoveToRoot && onMoveToRoot(scene.id)}>
                  {t('canvas.move_to_root')}
                </button>
              );
            }
            return null;
          })()}
        </div>

        {/* Sections */}
        <Section title={t('canvas.section_bg')}>
          <div style={{ position: "relative", width: "100%", height: 100, borderRadius: 4, overflow: "hidden", background: "var(--bg3)" }}>
            <BgImage rootPath={rootPath} name={bgName}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {!bgName && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--faint)", fontSize: 12 }}>
                {t('canvas.no_bg')}
              </div>
            )}
          </div>
        </Section>

        <Section title={t('canvas.section_events')}>
          {scene.events.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--faint)" }}>{t('canvas.no_events')}</span>
          ) : (
            <div className="col gap4">
              {scene.events.slice(0, 8).map((ev, i) => (
                <div key={ev.id || i} className="row gap8" style={{ background: "var(--bg2)", padding: "6px 10px", borderRadius: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--dim)" }}>{ev.type || "○"}</span>
                </div>
              ))}
              {scene.events.length > 8 && <span style={{ fontSize: 11, color: "var(--faint)", marginTop: 4 }}>... {scene.events.length - 8} {t('canvas.more')}</span>}
            </div>
          )}
        </Section>

        <Section title={t('canvas.section_out')}>
          {outEdges.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--faint)" }}>{t('canvas.no_out_links')}</span>
          ) : (
            <div className="col gap4">
              {outEdges.map((edge, i) => (
                <div key={i} className="row gap8" style={{ background: "var(--bg2)", padding: "6px 10px", borderRadius: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "var(--faint)" }}>➕</span>
                  <div className="col flex1" style={{ overflow: "hidden" }}>
                    <span style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{edge.label}</span>
                    <span style={{ fontSize: 13, color: edge.color, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{edge.target}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={t('canvas.section_in')}>
          {inEdges.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--faint)" }}>{t('canvas.no_in_links')}</span>
          ) : (
            <div className="col gap4">
              {Array.from(new Set(inEdges)).map((src, i) => (
                <div key={i} className="row gap8" style={{ background: "var(--bg2)", padding: "6px 10px", borderRadius: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "var(--faint)" }}>➕</span>
                  <span style={{ fontSize: 13, color: "var(--text)" }}>{src}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {!isStart && (
          <Section title={t('canvas.danger')}>
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", color: "var(--err)" }} onClick={onDeleteSelected}>{t('canvas.delete_scene')}</button>
          </Section>
        )}
      </div>
      {sdkModalJsx}
    </>
  );
}

  return sdkModalJsx;
}
