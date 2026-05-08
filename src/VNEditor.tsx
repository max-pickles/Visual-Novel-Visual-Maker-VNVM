/**
 * VNEditor.tsx — Main authoring shell for .vnvmaker projects.
 * Houses the top bar, sidebar nav, and renders the active panel.
 * Enhanced with: undo/redo (useHistory), Stats, Variables, Diagnostics, Translation tabs,
 *                useShortcuts (global hotkeys), resizable sidebar, status bar.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import type { VNProject } from "./types";
import { StoryCanvas } from "./StoryCanvas";
import { SceneEditor } from "./SceneEditor";
import { CharacterEditor } from "./CharacterEditor";
import { useCanvasStore } from "./store/canvasStore";
import { AssetBrowser } from "./AssetBrowser";
import { ExportPanel } from "./ExportPanel";
import { SearchPanel } from "./SearchPanel";
import { QuickOpen } from "./QuickOpen";
import { saveVnvProject, writeTextFile } from "./tauriApi";
import { compilePreview } from "./compiler";
import { ToastManager } from "./toastContext";
import { useTabHistory } from "./useHistory";
import { useShortcuts } from "./useShortcuts";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "./translationContext";
import StatsView from "./StatsView";
import VariableManager from "./VariableManager";
import DiagnosticsPanel from "./DiagnosticsPanel";
import TranslationDashboard from "./TranslationDashboard";
import GuiEditor from "./GuiEditor";
import VoiceDirector from "./VoiceDirector";
import AchievementManager from "./AchievementManager";
import { ShortcutsModal } from "./ShortcutsModal";
import BotAnalyzerPanel from "./BotAnalyzerPanel";
import { autoTagProject } from "./botAnalyzer";
import { MusicPlayerBar } from "./MusicPlayerBar";
import { PlaytestEngine } from "./PlaytestEngine";
import ScriptReader from "./ScriptReader";
import { useMusicPlayer } from "./musicPlayerContext";

type NavTab = "graph" | "gui" | "scenes" | "chars" | "assets" | "export" | "stats" | "script" | "vars" | "bot" | "diag" | "tl" | "play" | "voice" | "achievements";

interface Props {
  project: VNProject;
  onClose: () => void;
}

// ── Sidebar width presets ─────────────────────────────────────────────────────
const SIDEBAR_COMPACT  = 64;
const SIDEBAR_STANDARD = 64;   // default (icon + tiny label)
const SIDEBAR_WIDE     = 160;  // icon + full label

function loadSidebarWidth(): number {
  const v = parseInt(localStorage.getItem("vnv_sidebar_width") ?? "", 10);
  return isNaN(v) ? SIDEBAR_STANDARD : v;
}

export function VNEditor({ project: initialProject, onClose }: Props) {
  const [project, setProject] = useState<VNProject>(initialProject);
  const { pushState, popUndo, popRedo, canUndo, canRedo } = useTabHistory<VNProject>();
  
  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; }, [project]);

  const [activeTab, setActiveTab]       = useState<NavTab>("graph");
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const [targetSceneId, setTargetSceneId] = useState<string | null>(null);
  const [playtestSceneId, setPlaytestSceneId] = useState<string | null>(null);
  const [unsaved, setUnsaved]           = useState(false);
  const [showSearch, setShowSearch]     = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  // flyToSceneId: set when QuickOpen confirms; StoryCanvas reads & pans to it
  const [flyToSceneId, setFlyToSceneId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const didOpenToast = useRef(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);

  const musicPlayer = useMusicPlayer();
  useEffect(() => { musicPlayer.stop(); }, [activeTab]);

  // Expose project to window for debugging
  useEffect(() => { (window as any).__VNV_PROJECT = project; }, [project]);

  // Run auto-tagging on initial load + show single "Project opened" toast
  useEffect(() => {
    const autoTagged = autoTagProject(project);
    if (autoTagged !== project) {
      setProject(autoTagged);
      setUnsaved(true);
      // Bot auto-tag runs silently — no toast
    }
    // Guard against React StrictMode double-invoke
    if (!didOpenToast.current) {
      didOpenToast.current = true;
      ToastManager.info(t('toasts.project_opened'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run exactly once on mount

  const { setGameTranslations, t } = useTranslation();
  useEffect(() => {
    if (project._rootPath) {
      invoke<Record<string, Record<string, string>>>("scan_tl_translations", { rootPath: project._rootPath })
        .then(dict => setGameTranslations(dict))
        .catch(err => console.warn("Failed to load translations:", err));
    }
  }, [project._rootPath, setGameTranslations]);

  const updateProject = useCallback((p: VNProject) => {
    pushState(activeTabRef.current, projectRef.current);
    setProject(p);
    setUnsaved(true);
  }, [pushState]);

  const handleSave = useCallback(async () => {
    if (!project._filePath || !project._rootPath) return;
    try {
      await saveVnvProject(project._filePath, project);
      
      // Auto-compile preview so that Shift+R hot-reloading works in Ren'Py
      try {
        const previewRpy = compilePreview(project);
        await writeTextFile(`${project._rootPath}/game/vnv_preview.rpy`, previewRpy);
      } catch (compileErr) {
        ToastManager.warning(t('toasts.preview_compile_failed'), String(compileErr));
      }

      setUnsaved(false);
      ToastManager.info(t('toasts.project_saved'));
    } catch (e) {
      ToastManager.error(t('toasts.save_failed').replace('{err}', String(e)));
    }
  }, [project]);

  // Auto-save interval (1 minute)
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const interval = setInterval(() => {
      handleSave();
    }, 60000);
    return () => clearInterval(interval);
  }, [autoSaveEnabled, handleSave]);

  // Fly-to: switch to Graph tab then signal canvas to pan to the scene
  const handleFlyToScene = useCallback((id: string) => {
    setActiveTab("graph");
    setFlyToSceneId(id);
  }, []);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  const tabIds: NavTab[] = ["graph","scenes","chars","assets","export","stats","vars","diag","tl"];
  const handleUndo = useCallback(() => {
    const tab = activeTabRef.current;
    const pastState = popUndo(tab, projectRef.current);
    if (!pastState) return;

    if (tab === 'graph') {
      const mergedScenes = pastState.scenes.map(pastScene => {
         const currentScene = projectRef.current.scenes.find(s => s.id === pastScene.id);
         return currentScene ? { ...pastScene, events: currentScene.events } : pastScene;
      });
      setProject(prev => ({ ...prev, layout: pastState.layout, folders: pastState.folders, sticky_notes: pastState.sticky_notes, scenes: mergedScenes, start: pastState.start }));
      useCanvasStore.getState().setTriggerFitAll(Date.now());
      useCanvasStore.getState().setUiVisible(false);
    } else if (tab === 'scenes' || tab === 'script') {
      setProject(prev => ({ ...prev, scenes: pastState.scenes }));
    } else if (tab === 'chars') {
      setProject(prev => ({ ...prev, characters: pastState.characters }));
    } else if (tab === 'gui') {
      setProject(prev => ({ ...prev, main_menu: pastState.main_menu, text_tpls: pastState.text_tpls, trans_tpls: pastState.trans_tpls }));
    } else {
      setProject(pastState);
    }
    setUnsaved(true);
  }, [popUndo]);

  const handleRedo = useCallback(() => {
    const tab = activeTabRef.current;
    const futureState = popRedo(tab, projectRef.current);
    if (!futureState) return;

    if (tab === 'graph') {
      const mergedScenes = futureState.scenes.map(futScene => {
         const currentScene = projectRef.current.scenes.find(s => s.id === futScene.id);
         return currentScene ? { ...futScene, events: currentScene.events } : futScene;
      });
      setProject(prev => ({ ...prev, layout: futureState.layout, folders: futureState.folders, sticky_notes: futureState.sticky_notes, scenes: mergedScenes, start: futureState.start }));
      useCanvasStore.getState().setTriggerFitAll(Date.now());
      useCanvasStore.getState().setUiVisible(false);
    } else if (tab === 'scenes' || tab === 'script') {
      setProject(prev => ({ ...prev, scenes: futureState.scenes }));
    } else if (tab === 'chars') {
      setProject(prev => ({ ...prev, characters: futureState.characters }));
    } else if (tab === 'gui') {
      setProject(prev => ({ ...prev, main_menu: futureState.main_menu, text_tpls: futureState.text_tpls, trans_tpls: futureState.trans_tpls }));
    } else {
      setProject(futureState);
    }
    setUnsaved(true);
  }, [popRedo]);

  useShortcuts({
    save:       handleSave,
    undo:       handleUndo,
    redo:       handleRedo,
    search:     () => setShowSearch(v => !v),
    quickOpen:  () => setShowQuickOpen(v => !v),
    escape:     () => { setShowSearch(false); setShowQuickOpen(false); setShowShortcuts(false); },
    tab1:    () => setActiveTab(tabIds[0]),
    tab2:    () => setActiveTab(tabIds[1]),
    tab3:    () => setActiveTab(tabIds[2]),
    tab4:    () => setActiveTab(tabIds[3]),
    tab5:    () => setActiveTab(tabIds[4]),
    tab6:    () => setActiveTab(tabIds[5]),
    tab7:    () => setActiveTab(tabIds[6]),
    tab8:    () => setActiveTab(tabIds[7]),
    tab9:    () => setActiveTab(tabIds[8]),
  });

  // Ctrl+/ or ? to open shortcuts modal
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey && e.key === "/") || (!e.ctrlKey && !e.altKey && e.key === "?")) {
        e.preventDefault();
        setShowShortcuts(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);


  const navs: { id: NavTab; icon: string; label: string }[] = [
    { id: "graph",    icon: "🕸️",  label: t('editor.nav.graph') },
    { id: "scenes",   icon: "🎬",  label: t('editor.nav.scenes') },
    { id: "gui",      icon: "🎨",  label: t('editor.nav.gui') },
    { id: "chars",    icon: "👥",  label: t('editor.nav.chars') },
    { id: "assets",   icon: "📁",  label: t('editor.nav.assets') },
    { id: "voice",    icon: "🎙️",  label: t('editor.nav.voice') },
    { id: "tl",       icon: "🌐",  label: t('editor.nav.tl') },
    { id: "bot",      icon: "🤖",  label: t('editor.nav.bot') },
    { id: "vars",     icon: "📦",  label: t('editor.nav.vars') },
    { id: "achievements", icon: "🏆", label: t('editor.nav.achievements') },
    { id: "script",   icon: "📜",  label: t('editor.nav.script') },
    { id: "diag",     icon: "🔍",  label: t('editor.nav.diag') },
    { id: "stats",    icon: "📊",  label: t('editor.nav.stats') },
    { id: "play",     icon: "▶️",  label: t('editor.nav.play') },
    { id: "export",   icon: "🚀",  label: t('editor.nav.export') },
  ];

  // ── Status bar content ────────────────────────────────────────────────────
  const activeNav     = navs.find(n => n.id === activeTab)!;
  const totalEvents   = project.scenes.reduce((s, sc) => s + (sc.events?.length ?? 0), 0);
  const totalWords    = project.scenes.reduce((s, sc) =>
    s + (sc.events ?? []).reduce((ws, ev) =>
      ws + ((ev as any).text ?? "").split(/\s+/).filter(Boolean).length, 0), 0);
  const activeSceneTitle = targetSceneId
    ? (project.scenes.find(s => s.id === targetSceneId) as any)?.title
      ?? (project.scenes.find(s => s.id === targetSceneId) as any)?.name
      ?? targetSceneId
    : "";

  return (
    <div className="col" style={{ width: "100%", height: "100%", overflow: "hidden", background: "transparent" }}>

      {/* ── Top Bar ── */}
      <div className="row" style={{
        height: 48, flexShrink: 0,
        background: "var(--bg1)",
        borderBottom: "1px solid var(--bdr)",
        padding: "0 12px", gap: 10,
        alignItems: "center",
      }}>

        {/* Back button */}
        <button className="btn btn-ghost" onClick={onClose} style={{ gap: 6, fontSize: 12, padding: "0 12px", height: 32, borderRadius: 8, display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>←</span> {t('editor.nav.back')}
        </button>

        <div style={{ width: 1, height: 28, background: "var(--bdr)", flexShrink: 0 }} />

        {/* Cover art + project info */}
        <div className="row" style={{ gap: 10, flex: 1, minWidth: 0, alignItems: "center" }}>
          {project.cover && (
            <div style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              background: `url("${project.cover}") center/cover no-repeat var(--bg3)`,
              border: "1px solid var(--bdr)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
            }} />
          )}
          <div className="col" style={{ gap: 1, minWidth: 0 }}>
            <div className="row" style={{ alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", textShadow: "0 0 12px color-mix(in srgb, var(--teal) 35%, transparent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {project.title}
              </span>
              {unsaved && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--acc2)",
                  flexShrink: 0,
                }} title="Unsaved changes" />
              )}
            </div>
            <span style={{
              fontSize: 9, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", direction: "rtl", textAlign: "left", maxWidth: 360,
            }}>&lrm;{project._filePath}</span>
          </div>
        </div>

        {/* Auto-Save Toggle */}
        <div className="row" style={{ alignItems: 'center', gap: 6, marginRight: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 700, letterSpacing: '0.05em' }}>{t('editor.nav.auto_save').toUpperCase()}</span>
          <div 
            style={{
              width: 32, height: 18, borderRadius: 10,
              background: autoSaveEnabled ? 'var(--acc)' : 'var(--bg3)',
              position: 'relative', cursor: 'pointer',
              transition: 'background 0.2s',
              border: '1px solid var(--bdr)'
            }}
            onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
            title={`${t('editor.nav.auto_save')} (every 1 minute)`}
          >
            <div style={{
              width: 14, height: 14, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 1, left: autoSaveEnabled ? 15 : 1,
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
            }} />
          </div>
        </div>

        {/* Undo / Redo */}
        <div className="row" style={{ gap: 2 }}>
          <button
            className="btn btn-ghost"
            onClick={handleUndo}
            disabled={!canUndo(activeTab)}
            title="Undo (Ctrl+Z)"
            style={{
              opacity: canUndo(activeTab) ? 1 : 0.28,
              fontSize: 15, padding: "0 8px", height: 32, borderRadius: 7,
              display: "flex", alignItems: "center",
              transition: "opacity 0.15s, background 0.15s",
            }}
          >↩</button>
          <button
            className="btn btn-ghost"
            onClick={handleRedo}
            disabled={!canRedo(activeTab)}
            title="Redo (Ctrl+Shift+Z)"
            style={{
              opacity: canRedo(activeTab) ? 1 : 0.28,
              fontSize: 15, padding: "0 8px", height: 32, borderRadius: 7,
              display: "flex", alignItems: "center",
              transition: "opacity 0.15s, background 0.15s",
            }}
          >↪</button>
        </div>

        <div style={{ width: 1, height: 22, background: "var(--bdr)", flexShrink: 0 }} />

        {/* Search */}
        <button
          className="btn btn-ghost"
          onClick={() => setShowSearch(v => !v)}
          title="Search project (Ctrl+F)"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            height: 32, padding: "0 12px", borderRadius: 8, fontSize: 12,
            background: showSearch ? "color-mix(in srgb, var(--acc) 18%, transparent)" : "rgba(255,255,255,0.04)",
            color: showSearch ? "var(--acc2)" : "var(--dim)",
            border: `1px solid ${showSearch ? "color-mix(in srgb, var(--acc) 40%, transparent)" : "var(--bdr)"}`,
            transition: "all 0.12s",
          }}
        >
          <span style={{ fontSize: 13 }}>🔍</span> {t('editor.nav.search')}
        </button>

        {/* Quick Open */}
        <button
          className="btn btn-ghost"
          onClick={() => setShowQuickOpen(v => !v)}
          title="Quick-open scene (Ctrl+P)"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            height: 32, padding: "0 12px", borderRadius: 8, fontSize: 12,
            background: showQuickOpen ? "color-mix(in srgb, var(--acc) 18%, transparent)" : "rgba(255,255,255,0.04)",
            color: showQuickOpen ? "var(--acc2)" : "var(--dim)",
            border: `1px solid ${showQuickOpen ? "color-mix(in srgb, var(--acc) 40%, transparent)" : "var(--bdr)"}`,
            transition: "all 0.12s",
          }}
        >
          <span style={{ fontSize: 13 }}>⌕</span> {t('editor.nav.scenes')}
        </button>

        {/* Shortcuts */}
        <button
          className="btn btn-ghost"
          onClick={() => setShowShortcuts(v => !v)}
          title="Keyboard shortcuts (?)"
          style={{
            width: 32, height: 32, borderRadius: 8, fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.04)", border: "1px solid var(--bdr)",
            color: "var(--dim)",
          }}
        >?</button>

        {/* Save */}
        <button
          className="btn"
          onClick={handleSave}
          disabled={!unsaved}
          style={{
            height: 32, padding: "0 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 6,
            background: unsaved ? "var(--acc)" : "rgba(255,255,255,0.05)",
            color: unsaved ? "#fff" : "var(--dim)",
            border: unsaved ? "1px solid color-mix(in srgb, var(--acc) 70%, transparent)" : "1px solid var(--bdr)",
            boxShadow: unsaved ? "0 0 12px color-mix(in srgb, var(--acc) 25%, transparent)" : "none",
            transition: "all 0.2s",
            cursor: unsaved ? "pointer" : "default",
          }}
        >
          💾
          <span>{unsaved ? t('editor.nav.save') : t('editor.nav.saved')}</span>
        </button>
      </div>

      {/* ── Horizontal Nav Tab Bar ── */}
      <div style={{ position: "relative", flexShrink: 0, background: "var(--bg2)", borderBottom: "1px solid var(--bdr)" }}>
        {/* Left fade-out for overflow */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, background: "linear-gradient(to right, var(--bg2), transparent)", zIndex: 2, pointerEvents: "none" }} />
        {/* Right fade-out for overflow */}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 24, background: "linear-gradient(to left, var(--bg2), transparent)", zIndex: 2, pointerEvents: "none" }} />

        <div
          className="row"
          onWheel={e => { e.currentTarget.scrollLeft += e.deltaY; }}
          style={{ overflowX: "auto", overflowY: "hidden", padding: "0 6px", gap: 2, scrollbarWidth: "none" }}
        >
          {navs.map((n, idx) => {
            const active = activeTab === n.id;
            // Count badges for selected tabs
            const badge: number | null = (
              n.id === "scenes"  ? project.scenes.length :
              n.id === "chars"   ? project.characters.length :
              n.id === "assets"  ? null :
              n.id === "vars"    ? ((project as any).variables?.length ?? null) :
              n.id === "achievements" ? (project.achievements?.length ?? null) :
              null
            );
            return (
              <button key={n.id}
                onClick={() => setActiveTab(n.id)}
                title={`${n.label} (Ctrl+${idx + 1})`}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "0 12px", height: 36, borderRadius: "6px 6px 0 0",
                  border: "none", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
                  background: active
                    ? "color-mix(in srgb, var(--acc) 14%, var(--bg1))"
                    : "transparent",
                  color: active ? "var(--acc2)" : "var(--dim)",
                  fontWeight: active ? 700 : 400, fontSize: 12,
                  borderBottom: active ? "2px solid var(--acc2)" : "2px solid transparent",
                  boxShadow: active ? "inset 0 1px 0 color-mix(in srgb, var(--acc2) 30%, transparent)" : "none",
                  transition: "all 0.14s",
                }}
              >
                <span style={{ fontSize: 14 }}>{n.icon}</span>
                <span>{n.label}</span>
                {(badge !== null && badge > 0) && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8,
                    background: active ? "color-mix(in srgb, var(--acc2) 20%, transparent)" : "var(--bg3)",
                    color: active ? "var(--acc2)" : "var(--faint)",
                    border: `1px solid ${active ? "color-mix(in srgb, var(--acc2) 30%, transparent)" : "var(--bdr)"}`,
                    letterSpacing: "0.02em",
                  }}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>


        {/* ── Main Area ── */}
        <div className="col" style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {activeTab === "graph" && (
            <StoryCanvas
              project={project}
              onProjectChange={updateProject}
              rootPath={project._rootPath}
              initialPositions={project.layout}
              onNodePositionsChange={(layout) => {
                updateProject({ ...project, layout });
              }}
              onEditScene={(id) => { setTargetSceneId(id); setActiveTab("scenes"); }}
              onGoScene={(id)  => { setTargetSceneId(id); setActiveTab("scenes"); }}
              onEnterMainMenu={() => setActiveTab("gui")}
              onPlayScene={(id) => { setPlaytestSceneId(id); setActiveTab("play"); }}
              flyToSceneId={flyToSceneId}
              onFlyToComplete={() => setFlyToSceneId(null)}
            />
          )}
          {activeTab === "scenes" && (
            <SceneEditor 
              project={project} 
              onProjectChange={updateProject} 
              initialSceneId={targetSceneId}
              canUndo={canUndo("scenes")}
              canRedo={canRedo("scenes")}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          )}
          {activeTab === "chars" && (
            <CharacterEditor project={project} onProjectChange={updateProject} />
          )}
          {activeTab === "assets" && (
            <AssetBrowser rootPath={project._rootPath ?? ""} project={project} />
          )}
          {activeTab === "export" && <ExportPanel project={project} />}
          {activeTab === "stats"  && <StatsView project={project} />}
          {activeTab === "script" && <ScriptReader project={project} onEditScene={(id) => { setTargetSceneId(id); setActiveTab("scenes"); }} />}
          {activeTab === "vars"   && <VariableManager project={project} onProjectChange={updateProject} />}
          {activeTab === "bot"    && <BotAnalyzerPanel project={project} />}
          {activeTab === "diag"   && (
            <DiagnosticsPanel project={project}
              onNavigate={(sceneId) => { setTargetSceneId(sceneId); setActiveTab("scenes"); }} />
          )}
          {activeTab === "tl" && <TranslationDashboard project={project} rootPath={project._rootPath ?? ""} onProjectChange={updateProject} />}
          {activeTab === "voice" && <VoiceDirector project={project} onProjectChange={updateProject} rootPath={project._rootPath ?? ""} />}
          {activeTab === "achievements" && <AchievementManager project={project} onProjectChange={updateProject} rootPath={project._rootPath ?? ""} />}
          {activeTab === "gui" && (
            <GuiEditor project={project} onProjectChange={updateProject} />
          )}
          {activeTab === "play" && (
            <PlaytestEngine 
              project={project} 
              rootPath={project._rootPath ?? ""} 
              startSceneId={playtestSceneId ?? project.scenes[0]?.id} 
              onClose={() => setActiveTab("graph")} 
            />
          )}

          {/* Search Panel Overlay */}
          {showSearch && (
            <SearchPanel
              project={project}
              onProjectChange={updateProject}
              onEditScene={(id) => { setTargetSceneId(id); setActiveTab("scenes"); }}
              onClose={() => setShowSearch(false)}
            />
          )}

          {/* Quick-Open dialog (Ctrl+P) — rendered in main area so it's above canvas */}
          {showQuickOpen && (
            <QuickOpen
              project={project}
              onFlyTo={handleFlyToScene}
              onEditScene={(id) => { setTargetSceneId(id); setActiveTab("scenes"); setShowQuickOpen(false); }}
              onClose={() => setShowQuickOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {/* ── Status Bar ── */}
      <div style={{
        height: 28, flexShrink: 0, background: "var(--bg1)", borderTop: "1px solid var(--bdr)",
        display: "flex", alignItems: "center", gap: 16, padding: "0 14px",
        fontSize: 11, color: "var(--faint)", userSelect: "none",
        fontFamily: "var(--mono)",
      }}>
        {/* Active tab */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: "var(--teal)", fontWeight: 700 }}>
          {activeNav.icon} <span>{activeNav.label.toUpperCase()}</span>
        </div>
        {activeSceneTitle && <><span style={{ color: "var(--bdr)" }}>│</span><span>{t('editor.scene.scene')}: {activeSceneTitle}</span></>}
        <span style={{ flex: 1 }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, color: 'var(--dim)' }}>
            {project.scenes.length} {t('editor.nav.scenes').toLowerCase()}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, color: 'var(--dim)' }}>
            {totalEvents.toLocaleString()} {t('editor.nav.events')}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, color: 'var(--dim)' }}>
            ~{totalWords.toLocaleString()} {t('editor.nav.words')}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, color: 'var(--dim)' }}>
            {project.characters.length} {t('editor.nav.chars').toLowerCase()}
          </div>
        </div>

        {unsaved && (
          <>
            <span style={{ color: "var(--bdr)" }}>│</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: "var(--warn)", fontWeight: 600 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)' }} />
              {t('editor.nav.unsaved')} (Ctrl+S)
            </div>
          </>
        )}
      </div>
    </div>
  );
}
