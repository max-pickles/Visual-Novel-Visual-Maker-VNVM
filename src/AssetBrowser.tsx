/**
 * AssetBrowser.tsx — Full searchable image/audio asset browser.
 * Mirrors vn_assets.rpy from the legacy VNVMaker.
 * Features: folder tree, grid/list toggle, image preview panel,
 *           audio playback, sort options, copy-path, usage scan.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { VNProject } from "./types";
import { listAssetFiles } from "./tauriApi";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useMusicPlayer } from "./musicPlayerContext";
import { useTranslation } from "./translationContext";

interface Props {
  rootPath: string;
  project?: VNProject;
  /** Picker mode — shows a Select button, calls back with relative path */
  onPick?: (path: string) => void;
  /** The tab it opens on (images unless given). */
  initialType?: AssetType;
}

type AssetType = "images" | "video" | "audio";
type ViewMode = "grid" | "list";
type SortMode = "name" | "folder" | "ext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFolders(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return Array.from(dirs).sort();
}

function extOf(f: string): string {
  return f.split(".").pop()?.toLowerCase() ?? "";
}

// Wrap the parts of a translated string that are in backticks, e.g. "Add `.png` files"
function wrapTicked(text: string, wrap: (part: string, key: number) => React.ReactNode): React.ReactNode[] {
  return text.split("`").map((part, i) => (i % 2 ? wrap(part, i) : part));
}

// Count how many times a file path appears in the project events
function countUsages(relPath: string, project?: VNProject): number {
  if (!project) return 0;
  let n = 0;
  for (const sc of project.scenes) {
    for (const ev of sc.events) {
      if (ev.bg === relPath || ev.image === relPath || ev.music === relPath || ev.sfx === relPath) n++;
    }
    // Check characters
    for (const ch of project.characters) {
      for (const v of Object.values(ch.sprites)) {
        if (v === relPath) n++;
      }
    }
  }
  return n;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssetBrowser({ rootPath, project, onPick, initialType = "images" }: Props) {
  const { t } = useTranslation();
  const [assetType, setAssetType] = useState<AssetType>(initialType);
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [previewError, setPreviewError] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // Global music player — drive the persistent bar
  const musicPlayer = useMusicPlayer();
  const playing = musicPlayer.track;  // relative path of currently playing file
  // ── Advanced preview state ──────────────────────────────────────────────────
  const [pvZoom,        setPvZoom]       = useState(1);
  const [pvPan,         setPvPan]        = useState({ x: 0, y: 0 });
  const [pvRotation,    setPvRotation]   = useState(0);
  const [pvBg,          setPvBg]         = useState<'dark'|'checker'|'white'>('dark');
  const [pvFullscreen,  setPvFullscreen] = useState(false);
  const [imageDims,     setImageDims]    = useState<{ w: number; h: number } | null>(null);
  const [previewWidth,  setPreviewWidth] = useState(940);
  const pvDragRef = useRef<{ active: boolean; sx: number; sy: number; spx: number; spy: number }>({
    active: false, sx: 0, sy: 0, spx: 0, spy: 0,
  });
  const resizeDragRef = useRef<{ active: boolean; startX: number; startW: number }>({
    active: false, startX: 0, startW: 940,
  });

  // Preview resize handlers (attached to window so drag works outside the handle)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeDragRef.current.active) return;
      const dx = resizeDragRef.current.startX - e.clientX; // dragging left increases width
      setPreviewWidth(Math.max(280, Math.min(1600, resizeDragRef.current.startW + dx)));
    };
    const onUp = () => { resizeDragRef.current.active = false; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  useEffect(() => { setPreviewError(false); }, [selected]);
  // Reset preview state on new selection
  useEffect(() => {
    setPvZoom(1); setPvPan({ x: 0, y: 0 }); setPvRotation(0); setImageDims(null);
  }, [selected]);

  const load = useCallback(() => {
    if (!rootPath) return;
    setLoading(true);
    setFiles([]);
    listAssetFiles(rootPath, assetType)
      .then((list) => { setFiles(list); setLoading(false); })
      .catch(() => { setFiles([]); setLoading(false); });
  }, [rootPath, assetType]);

  useEffect(() => {
    load();
    setFolder(null);
    setSearch("");
    setSelected(null);
    setPreviewError(false);
  }, [assetType, rootPath]);

  // ── Folders ────────────────────────────────────────────────────────────────

  const folders = useMemo(() => getFolders(files), [files]);

  // ── Collapsible tree helpers ───────────────────────────────────────────────
  const toggleCollapse = (dir: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir); else next.add(dir);
      return next;
    });
  };
  const hasFolderChildren = (dir: string) => folders.some(f => f.startsWith(dir + "/"));
  const isFolderVisible = (dir: string) => {
    const parts = dir.split("/");
    for (let i = 1; i < parts.length; i++) {
      if (collapsedFolders.has(parts.slice(0, i).join("/"))) return false;
    }
    return true;
  };

  // ── Filtered + sorted file list ────────────────────────────────────────────

  const visibleFiles = useMemo(() => {
    let list = files.filter((f) => {
      if (folder && !f.startsWith(folder + "/")) return false;
      if (search && !f.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    if (sortMode === "name") list = [...list].sort((a, b) => {
      const an = a.split("/").pop() ?? a;
      const bn = b.split("/").pop() ?? b;
      return an.localeCompare(bn);
    });
    if (sortMode === "folder") list = [...list].sort();
    if (sortMode === "ext") list = [...list].sort((a, b) => extOf(a).localeCompare(extOf(b)));
    return list;
  }, [files, folder, search, sortMode]);

  // ── Selected file info ─────────────────────────────────────────────────────

  const selectedUrl = selected && rootPath
    ? convertFileSrc(`${rootPath}/${selected}`)
    : null;
  const selectedName = selected?.split("/").pop() ?? "";
  const selectedExt = selected ? extOf(selected) : "";
  const usageCount = useMemo(() => countUsages(selected ?? "", project), [selected, project]);

  // ── Audio — delegate to global MusicPlayerContext ──────────────────────────

  const playAudio = (f: string) => {
    if (playing === f) {
      // Toggle pause/resume on the global player
      musicPlayer.playing ? musicPlayer.pause() : musicPlayer.resume();
      return;
    }
    const audioFiles = visibleFiles.filter(v => v.match(/\.(mp3|ogg|wav|m4a)$/i));
    musicPlayer.play(f, rootPath, audioFiles.length > 0 ? audioFiles : undefined);
  };

  const stopAudio = () => musicPlayer.stop();

  // ── Selection ──────────────────────────────────────────────────────────────

  const select = (path: string) => {
    setSelected(path);
    if (assetType === "audio" && playing !== path) playAudio(path);
  };

  // Takes the file rather than reading `selected`: a row's Use button selects and
  // picks in one click, and `selected` only changes on the next render.
  const confirmPick = (path: string) => {
    if (onPick) onPick(path);
  };

  // ── Copy path to clipboard ─────────────────────────────────────────────────

  const copyPath = () => {
    if (selected) navigator.clipboard.writeText(selected).catch(() => {});
  };

  return (
    <div className="col" style={{ height: "100%", overflow: "hidden" }}>

      {/* ── Toolbar ── */}
      <div className="row" style={{ gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--bdr)", background: "var(--bg2)", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>

        {/* Type toggle */}
        <div className="row gap4">
          {(["images", "video", "audio"] as AssetType[]).map((type) => (
            <button key={type}
              style={{
                padding: "4px 12px", fontSize: 11, fontWeight: 600, border: "1px solid",
                borderColor: assetType === type ? "var(--teal)" : "var(--bdr)",
                borderRadius: 5, cursor: "pointer",
                background: assetType === type ? "color-mix(in srgb, var(--teal) 12%, transparent)" : "transparent",
                color: assetType === type ? "var(--teal)" : "var(--dim)",
              }}
              onClick={() => setAssetType(type)}>
              {t(type === "images" ? "asset_browser.images" : type === "video" ? "asset_browser.video" : "asset_browser.music")}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "var(--bdr)", flexShrink: 0 }} />

        {/* Search */}
        <input className="input" placeholder={t("asset_browser.search_ph")} value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 200 }} />

        {/* Sort */}
        <select className="input" value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          style={{ width: "auto", minWidth: 130, fontSize: 11 }}>
          <option value="name">{t("asset_browser.sort_name")}</option>
          <option value="folder">{t("asset_browser.sort_folder")}</option>
          <option value="ext">{t("asset_browser.sort_ext")}</option>
        </select>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {/* View mode toggle (images and videos only) */}
          {(assetType === "images" || assetType === "video") && (
            <div className="row gap4">
              {(["grid", "list"] as ViewMode[]).map((v) => (
                <button key={v}
                  onClick={() => setViewMode(v)}
                  title={t(v === 'grid' ? 'asset_browser.grid_view' : 'asset_browser.list_view')}
                  style={{
                    padding: "4px 8px", fontSize: 12, border: "1px solid",
                    borderColor: viewMode === v ? "var(--teal)" : "var(--bdr)",
                    borderRadius: 4, cursor: "pointer",
                    background: viewMode === v ? "color-mix(in srgb, var(--teal) 12%, transparent)" : "transparent",
                    color: viewMode === v ? "var(--teal)" : "var(--dim)",
                  }}>
                  {v === "grid" ? "⊞" : "☰"}
                </button>
              ))}
            </div>
          )}

          <button className="btn btn-ghost" onClick={load} title={t("asset_browser.refresh")} style={{ padding: "4px 8px", fontSize: 12 }}>↻</button>

          {playing && (
            <button className="btn btn-ghost" style={{ fontSize: 11, color: "var(--teal)" }} onClick={stopAudio}>
              {t("asset_browser.stop")}
            </button>
          )}
        </div>
      </div>

      <div className="row" style={{ flex: 1, overflow: "hidden" }}>

        {/* ── Folder Tree ── */}
        <div className="panel col" style={{ width: 264, height: "100%", overflowY: "auto", flexShrink: 0 }}>
          <div className="sec-hdr" style={{ fontSize: 13 }}>{t("asset_browser.folders")}</div>


          {folders.filter(dir => isFolderVisible(dir)).map((dir) => {
            const depth = dir.split("/").length - 1;
            const name = dir.split("/").pop() ?? dir;
            const count = files.filter(f => f.startsWith(dir + "/")).length;
            const hasKids = hasFolderChildren(dir);
            const isCollapsed = collapsedFolders.has(dir);
            return (
              <div key={dir}
                className={`nav-item ${folder === dir ? "active" : ""}`}
                style={{ paddingLeft: 12 + depth * 20, gap: 8, padding: '10px 14px' }}
                onClick={() => setFolder(dir)}>
                {/* Collapse/expand chevron */}
                <span
                  onClick={hasKids ? (e) => toggleCollapse(dir, e) : undefined}
                  style={{
                    fontSize: 14, width: 20, flexShrink: 0, textAlign: 'center',
                    color: hasKids ? 'var(--dim)' : 'transparent',
                    cursor: hasKids ? 'pointer' : 'default',
                    userSelect: 'none', transition: 'color 0.15s',
                  }}
                >
                  {hasKids ? (isCollapsed ? '▶' : '▼') : '·'}
                </span>
                <span style={{ fontSize: 22 }}>{folder === dir && !isCollapsed ? "📂" : "📁"}</span>
                <div className="col flex1" style={{ minWidth: 0, gap: 1 }}>
                  <span style={{ fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                  <span style={{ fontSize: 12, color: "var(--faint)" }}>{t(count === 1 ? "asset_browser.folder_files_one" : "asset_browser.folder_files_many").replace("{n}", String(count))}</span>
                </div>
              </div>
            );
          })}

          {!loading && !folders.length && (
            <div style={{ padding: "12px 14px", fontSize: 14, color: "var(--faint)" }}>{t("asset_browser.no_subfolders")}</div>

          )}
        </div>

        {/* ── File Grid / List ── */}
        <div className="col flex1" style={{ height: "100%", overflow: "hidden" }}>

          {/* File count bar */}
          <div className="row" style={{ padding: "6px 14px", borderBottom: "1px solid var(--bdr)", background: "var(--bg1)", flexShrink: 0, alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--dim)" }}>
              {loading ? t("asset_browser.loading_short") : t(assetType === "images" ? "asset_browser.count_images" : assetType === "video" ? "asset_browser.count_videos" : "asset_browser.count_tracks")
                .replace("{shown}", String(visibleFiles.length)).replace("{total}", String(files.length))}
            </span>
            {selected && (
              <>
                <div style={{ width: 1, height: 14, background: "var(--bdr)" }} />
                <span style={{ fontSize: 11, color: "var(--teal)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  ✓ {selectedName}
                </span>
                <button onClick={copyPath} title={t("asset_browser.copy_path_title")}
                  style={{ fontSize: 10, padding: "2px 8px", background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: 4, cursor: "pointer", color: "var(--dim)" }}>
                  {t("asset_browser.copy_path")}
                </button>
                {onPick && (
                  <button className="btn btn-teal" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => confirmPick(selected)}>
                    {t("asset_browser.use_this")}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="row flex1" style={{ overflow: "hidden", alignItems: "stretch" }}>

            {/* Main file area */}
            <div className="flex1 asset-scroll" style={{ overflowY: "auto", padding: "12px 14px" }}>

              {/* Video Support Notice */}
              {assetType === "video" && (
                <div style={{ marginBottom: 16, padding: "10px 14px", background: "color-mix(in srgb, var(--warn) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)", borderRadius: 6, color: "var(--text)", fontSize: 13, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
                  <div>
                    <strong style={{ color: "var(--warn)" }}>{t("asset_browser.note")}</strong> {wrapTicked(t("asset_browser.video_notice"), (part, key) => <strong key={key}>{part}</strong>)}
                  </div>
                </div>
              )}

              {loading && (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--faint)", fontSize: 13 }}>
                  <div style={{ fontSize: 24, marginBottom: 8, animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</div>
                  <div>{t("asset_browser.loading")}</div>
                </div>
              )}

              {!loading && !rootPath && (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--faint)", fontSize: 13 }}>
                  {t("asset_browser.open_project_first")}
                </div>
              )}

              {/* ── Images / Videos ── */}
              {!loading && rootPath && (assetType === "images" || assetType === "video") && (
                viewMode === "grid" ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {visibleFiles.map((f) => {
                      const url = convertFileSrc(`${rootPath}/${f}`);
                      const name = f.split("/").pop() ?? f;
                      const isSel = selected === f;
                      return (
                        <div key={f}
                          className={`asset-tile${isSel ? " selected" : ""}`}
                          onClick={() => select(f)}
                          onDoubleClick={() => confirmPick(f)}
                          title={f}
                          style={{ width: 100, height: 100, padding: 4 }}>
                          {assetType === "video" ? (
                            <video src={url} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 3 }} />
                          ) : (
                            <img src={url} alt={name} loading="lazy"
                              style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 3 }} />
                          )}
                        </div>
                      );
                    })}
                    {!visibleFiles.length && (
                      <EmptyState type={assetType} hasFiles={!!files.length} search={search} />
                    )}
                  </div>
                ) : (
                  /* List view */
                  <div className="col gap2">
                    {visibleFiles.map((f) => {
                      const url = convertFileSrc(`${rootPath}/${f}`);
                      const name = f.split("/").pop() ?? f;
                      const isSel = selected === f;
                      return (
                        <div key={f}
                          onClick={() => select(f)}
                          onDoubleClick={() => confirmPick(f)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "6px 10px", borderRadius: 5, cursor: "pointer",
                            background: isSel ? "color-mix(in srgb, var(--teal) 8%, transparent)" : "transparent",
                            border: `1px solid ${isSel ? "var(--teal)" : "transparent"}`,
                            transition: "background 0.12s, border-color 0.12s",
                          }}>
                          {assetType === "video" ? (
                            <video src={url} style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 3, background: "var(--bg3)", flexShrink: 0 }} />
                          ) : (
                            <img src={url} alt={name} loading="lazy"
                              style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 3, background: "var(--bg3)", flexShrink: 0 }} />
                          )}
                          <div className="col flex1" style={{ gap: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12, color: isSel ? "var(--teal)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                            <span style={{ fontSize: 10, color: "var(--faint)", fontFamily: "var(--mono)" }}>{f}</span>
                          </div>
                          <span style={{ fontSize: 10, color: "var(--faint)", flexShrink: 0 }}>.{extOf(f)}</span>
                          {onPick && isSel && (
                            <button className="btn btn-teal" style={{ fontSize: 11, padding: "2px 8px", flexShrink: 0 }}
                              onClick={(e) => { e.stopPropagation(); confirmPick(f); }}>
                              {t("asset_browser.use_row")}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {!visibleFiles.length && <EmptyState type={assetType} hasFiles={!!files.length} search={search} />}
                  </div>
                )
              )}

              {/* ── Audio ── */}
              {!loading && rootPath && assetType === "audio" && (
                <div className="col gap4">
                  {visibleFiles.map((f) => {
                    const name = f.split("/").pop() ?? f;
                    const isSel = selected === f;
                    const isPlaying = playing === f;
                    return (
                      <div key={f}
                        style={{
                          display: "flex", alignItems: "center",
                          background: isSel ? "color-mix(in srgb, var(--teal) 6%, transparent)" : isPlaying ? "color-mix(in srgb, var(--teal) 3%, transparent)" : "var(--bg2)",
                          borderRadius: 5, overflow: "hidden", cursor: "pointer",
                          border: `1px solid ${isSel ? "var(--teal)" : isPlaying ? "color-mix(in srgb, var(--teal) 30%, transparent)" : "var(--bdr)"}`,
                          transition: "background 0.12s, border-color 0.12s",
                        }}
                        onClick={() => select(f)}
                        onDoubleClick={() => confirmPick(f)}>
                        {/* Playing bar indicator */}
                        {isPlaying && <div style={{ width: 3, height: 52, background: "var(--teal)", flexShrink: 0 }} />}
                        {/* Play/pause button (double-clicking it doesn't pick the track) */}
                        <button
                          style={{ width: 44, height: 52, background: "var(--bg3)", border: "none", borderRight: "1px solid var(--bdr)", cursor: "pointer", color: isPlaying ? "var(--teal)" : "var(--dim)", fontSize: 18, flexShrink: 0 }}
                          onClick={(e) => { e.stopPropagation(); playAudio(f); }}
                          onDoubleClick={(e) => e.stopPropagation()}>
                          {isPlaying ? "⏸" : "▶"}
                        </button>
                        {/* File info */}
                        <div style={{ flex: 1, padding: "0 14px" }}>
                          <div style={{ fontSize: 13, color: isSel ? "var(--teal)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {isSel && <span style={{ marginRight: 6, fontSize: 10 }}>✓</span>}
                            {name}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--faint)", fontFamily: "var(--mono)" }}>{f}</div>
                        </div>
                        {/* Extension badge */}
                        <div style={{ padding: "0 10px", fontSize: 10, fontFamily: "var(--mono)", color: "var(--faint)", flexShrink: 0 }}>
                          .{extOf(f)}
                        </div>
                        {onPick && (
                          <button className="btn btn-teal" style={{ margin: "0 8px", fontSize: 11, padding: "3px 8px", flexShrink: 0 }}
                            onClick={(e) => { e.stopPropagation(); select(f); confirmPick(f); }}>
                            {t("asset_browser.use_track")}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!visibleFiles.length && <EmptyState type="audio" hasFiles={!!files.length} search={search} />}
                </div>
              )}
            </div>

            {/* ── Advanced Preview Panel ── */}
            {(assetType === "images" || assetType === "video") && selected && selectedUrl && (() => {
              const bgStyle = pvBg === 'checker'
                ? { backgroundImage: 'var(--preview-checker)', backgroundSize: '20px 20px' }
                : pvBg === 'white' ? { background: 'var(--preview-white)' } : { background: 'var(--preview-dark)' };
              const selectedIdx = visibleFiles.indexOf(selected);
              const prevFile = selectedIdx > 0 ? visibleFiles[selectedIdx - 1] : null;
              const nextFile = selectedIdx < visibleFiles.length - 1 ? visibleFiles[selectedIdx + 1] : null;

              const handlePvWheel = (e: React.WheelEvent) => {
                e.preventDefault();
                e.stopPropagation();
                const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
                setPvZoom(z => Math.max(0.1, Math.min(20, z * factor)));
              };
              const handlePvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
                if (pvZoom <= 1) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                pvDragRef.current = { active: true, sx: e.clientX, sy: e.clientY, spx: pvPan.x, spy: pvPan.y };
              };
              const handlePvPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
                if (!pvDragRef.current.active) return;
                setPvPan({ x: pvDragRef.current.spx + e.clientX - pvDragRef.current.sx, y: pvDragRef.current.spy + e.clientY - pvDragRef.current.sy });
              };
              const handlePvPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
                pvDragRef.current.active = false;
                e.currentTarget.releasePointerCapture(e.pointerId);
              };

              const iconBtn = (label: string, title: string, onClick: () => void, active = false) => (
                <button onClick={onClick} title={title} style={{
                  padding: '4px 8px', fontSize: 13, borderRadius: 4, border: '1px solid',
                  borderColor: active ? 'var(--teal)' : 'var(--bdr)',
                  background: active ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'var(--bg2)',
                  color: active ? 'var(--teal)' : 'var(--dim)', cursor: 'pointer',
                  transition: 'all .12s', flexShrink: 0,
                }}>{label}</button>
              );

              return (
                <div className="col" style={{ width: previewWidth, maxWidth: '60%', flexShrink: 0, borderLeft: '1px solid var(--bdr)', background: 'var(--bg0)', overflow: 'hidden', position: 'relative' }}>
                  {/* Resize handle */}
                  <div
                    onMouseDown={e => {
                      resizeDragRef.current = { active: true, startX: e.clientX, startW: previewWidth };
                      document.body.style.cursor = 'ew-resize';
                      e.preventDefault();
                    }}
                    style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
                      cursor: 'ew-resize', zIndex: 10, background: 'transparent',
                    }}
                    title={t('asset_browser.resize_preview')}
                  />

                  {/* Header toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginRight: 4 }}>{t('asset_browser.preview')}</span>
                    {/* Nav */}
                    {iconBtn('◀', t('asset_browser.prev_image'), () => prevFile && select(prevFile), false)}
                    {iconBtn('▶', t('asset_browser.next_image'), () => nextFile && select(nextFile), false)}
                    <div style={{ width: 1, height: 18, background: 'var(--bdr)' }} />
                    {/* Zoom controls */}
                    {iconBtn('−', t('asset_browser.zoom_out'), () => setPvZoom(z => Math.max(0.1, z / 1.25)))}
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--dim)', minWidth: 44, textAlign: 'center' }}>{Math.round(pvZoom * 100)}%</span>
                    {iconBtn('+', t('asset_browser.zoom_in'), () => setPvZoom(z => Math.min(20, z * 1.25)))}
                    {iconBtn('⊙', t('asset_browser.zoom_reset'), () => { setPvZoom(1); setPvPan({ x: 0, y: 0 }); })}
                    <div style={{ width: 1, height: 18, background: 'var(--bdr)' }} />
                    {/* Rotate */}
                    {iconBtn('↺', t('asset_browser.rotate_ccw'), () => setPvRotation(r => (r - 90 + 360) % 360))}
                    {iconBtn('↻', t('asset_browser.rotate_cw'), () => setPvRotation(r => (r + 90) % 360))}
                    <div style={{ width: 1, height: 18, background: 'var(--bdr)' }} />
                    {/* Background */}
                    {iconBtn('◼', t('asset_browser.bg_dark'), () => setPvBg('dark'), pvBg === 'dark')}
                    {iconBtn('▦', t('asset_browser.bg_checker'), () => setPvBg('checker'), pvBg === 'checker')}
                    {iconBtn('◻', t('asset_browser.bg_white'), () => setPvBg('white'), pvBg === 'white')}
                    <div style={{ flex: 1 }} />
                    {iconBtn('⛶', t('asset_browser.fullscreen'), () => setPvFullscreen(true))}
                  </div>

                  {/* Image viewport */}
                  <div
                    onWheel={handlePvWheel}
                    onPointerDown={handlePvPointerDown}
                    onPointerMove={handlePvPointerMove}
                    onPointerUp={handlePvPointerUp}
                    style={{
                      flex: 1, position: 'relative', overflow: 'hidden',
                      cursor: pvZoom > 1 ? 'grab' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      ...bgStyle,
                    }}
                  >
                    {!previewError ? (
                      assetType === "video" ? (
                        <video
                          key={selectedUrl}
                          src={selectedUrl}
                          controls
                          onLoadedMetadata={(e) => {
                            const vid = e.currentTarget;
                            setImageDims({ w: vid.videoWidth, h: vid.videoHeight });
                          }}
                          onError={() => setPreviewError(true)}
                          style={{
                            maxWidth: pvZoom <= 1 ? '100%' : 'none',
                            maxHeight: pvZoom <= 1 ? '100%' : 'none',
                            objectFit: 'contain',
                            transform: `translate(${pvPan.x}px, ${pvPan.y}px) scale(${pvZoom}) rotate(${pvRotation}deg)`,
                            transformOrigin: 'center',
                            transition: pvDragRef.current.active ? 'none' : 'transform 0.05s',
                          }}
                        />
                      ) : (
                        <img
                          key={selectedUrl}
                          src={selectedUrl}
                          alt={selectedName}
                          draggable={false}
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
                          }}
                          onError={() => setPreviewError(true)}
                          style={{
                            maxWidth: pvZoom <= 1 ? '100%' : 'none',
                            maxHeight: pvZoom <= 1 ? '100%' : 'none',
                            objectFit: 'contain',
                            transform: `translate(${pvPan.x}px, ${pvPan.y}px) scale(${pvZoom}) rotate(${pvRotation}deg)`,
                            transformOrigin: 'center',
                            transition: pvDragRef.current.active ? 'none' : 'transform 0.05s',
                            userSelect: 'none', pointerEvents: 'none',
                          }}
                        />
                      )
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--faint)' }}>
                        <div style={{ fontSize: 40 }}>{assetType === "video" ? "🎬" : "🖼"}</div>
                        <div style={{ fontSize: 11, marginTop: 8 }}>{t(assetType === "video" ? "asset_browser.cannot_load_video" : "asset_browser.cannot_load_image")}</div>
                      </div>
                    )}
                    {/* Zoom hint */}
                    {pvZoom > 1 && (
                      <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10, color: 'color-mix(in srgb, var(--preview-white) 35%, transparent)', pointerEvents: 'none' }}>{t('asset_browser.pan_hint')}</div>
                    )}
                    {/* Rotation badge */}
                    {pvRotation !== 0 && (
                      <div style={{ position: 'absolute', top: 8, left: 8, background: 'color-mix(in srgb, var(--preview-dark) 60%, transparent)', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: 'var(--teal)' }}>{pvRotation}°</div>
                    )}
                  </div>

                  {/* Details strip */}
                  <div style={{ flexShrink: 0, borderTop: '1px solid var(--bdr)', background: 'var(--bg1)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', wordBreak: 'break-all' }}>{selectedName}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                      <InfoRow label={t('asset_browser.info_path')} value={selected} mono />
                      <InfoRow label={t('asset_browser.info_type')} value={`.${selectedExt.toUpperCase()}`} />
                      {imageDims && <InfoRow label={t('asset_browser.info_size')} value={`${imageDims.w} × ${imageDims.h} px`} />}
                      <InfoRow label={t('asset_browser.info_used')} value={t(usageCount === 1 ? 'asset_browser.used_one' : 'asset_browser.used_many').replace('{n}', String(usageCount))} color={usageCount > 0 ? 'var(--ok)' : 'var(--faint)'} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={copyPath} style={{ flex: 1, padding: '5px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--bdr)', color: 'var(--dim)', textAlign: 'left' }}>{t('asset_browser.copy_path')}</button>
                      <button
                        onClick={() => {
                          const folderPath = selected.split('/').slice(0, -1).join('/');
                          setFolder(folderPath);
                          setCollapsedFolders(prev => {
                            const next = new Set(prev);
                            const parts = folderPath.split('/');
                            for (let i = 1; i <= parts.length; i++) {
                              next.delete(parts.slice(0, i).join('/'));
                            }
                            return next;
                          });
                        }}
                        style={{ flex: 1, padding: '5px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--bdr)', color: 'var(--dim)', textAlign: 'left' }}
                      >
                        {t('asset_browser.go_to_folder')}
                      </button>
                      {onPick && <button className="btn btn-teal" style={{ flex: 1, fontSize: 11 }} onClick={() => confirmPick(selected)}>{t('asset_browser.use_this')}</button>}
                    </div>
                  </div>

                  {/* ── Fullscreen Lightbox ── */}
                  {pvFullscreen && (
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'color-mix(in srgb, var(--preview-dark) 96%, transparent)', display: 'flex', flexDirection: 'column' }}
                      onClick={() => setPvFullscreen(false)}
                    >
                      {/* Lightbox toolbar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'color-mix(in srgb, var(--preview-dark) 70%, transparent)', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <span style={{ fontSize: 13, color: 'color-mix(in srgb, var(--preview-white) 85%, transparent)', fontWeight: 600, flex: 1 }}>{selectedName}</span>
                        {imageDims && <span style={{ fontSize: 11, color: 'color-mix(in srgb, var(--preview-white) 40%, transparent)', fontFamily: 'var(--mono)' }}>{imageDims.w} × {imageDims.h}px</span>}
                        <button onClick={() => setPvFullscreen(false)} style={{ background: 'color-mix(in srgb, var(--preview-white) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--preview-white) 20%, transparent)', color: 'var(--preview-white)', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>{t('asset_browser.close')}</button>
                      </div>
                      {/* Lightbox image */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        {assetType === "video" ? (
                          <video src={selectedUrl} controls style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `rotate(${pvRotation}deg)`, borderRadius: 4, boxShadow: '0 8px 60px color-mix(in srgb, var(--preview-dark) 80%, transparent)' }} />
                        ) : (
                          <img src={selectedUrl} alt={selectedName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `rotate(${pvRotation}deg)`, borderRadius: 4, boxShadow: '0 8px 60px color-mix(in srgb, var(--preview-dark) 80%, transparent)' }} />
                        )}
                      </div>
                      {/* Nav arrows */}
                      {prevFile && (
                        <button onClick={e => { e.stopPropagation(); select(prevFile); }} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', background: 'color-mix(in srgb, var(--preview-white) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--preview-white) 20%, transparent)', color: 'var(--preview-white)', borderRadius: '50%', width: 48, height: 48, fontSize: 22, cursor: 'pointer' }}>◀</button>
                      )}
                      {nextFile && (
                        <button onClick={e => { e.stopPropagation(); select(nextFile); }} style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', background: 'color-mix(in srgb, var(--preview-white) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--preview-white) 20%, transparent)', color: 'var(--preview-white)', borderRadius: '50%', width: 48, height: 48, fontSize: 22, cursor: 'pointer' }}>▶</button>
                      )}
                      {/* ESC hint */}
                      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: 'color-mix(in srgb, var(--preview-white) 30%, transparent)' }}>{t('asset_browser.click_to_close')}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ type, hasFiles, search }: { type: AssetType; hasFiles: boolean; search: string }) {
  const { t } = useTranslation();
  if (search && hasFiles) {
    return (
      <div style={{ width: "100%", textAlign: "center", padding: "40px 0", color: "var(--faint)", fontSize: 13 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
        {/* A function, so "$&" and the like in the search text aren't replacement patterns */}
        {t("asset_browser.no_results").replace("{search}", () => search)}
      </div>
    );
  }
  const kind = type === "images" ? "images" : type === "video" ? "videos" : "audio";
  return (
    <div style={{ width: "100%", textAlign: "center", padding: "40px 0", color: "var(--faint)", fontSize: 13, lineHeight: 1.8 }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{type === "images" ? "🖼" : type === "video" ? "🎬" : "🎵"}</div>
      {t(`asset_browser.no_${kind}`)}<br />
      <span style={{ fontSize: 11 }}>
        {wrapTicked(t(`asset_browser.no_${kind}_sub`), (part, key) => <code key={key} style={{ fontFamily: "var(--mono)" }}>{part}</code>)}
      </span>
    </div>
  );
}

function InfoRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
      <span style={{ fontSize: 10, color: "var(--dim)", flexShrink: 0, minWidth: 56 }}>{label}</span>
      <span style={{ fontSize: 10, color: color ?? "var(--text)", fontFamily: mono ? "var(--mono)" : "inherit", wordBreak: "break-all", lineHeight: 1.4 }}>{value}</span>
    </div>
  );
}
