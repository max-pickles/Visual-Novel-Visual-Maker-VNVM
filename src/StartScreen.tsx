/**
 * StartScreen.tsx — App launch screen.
 * Handles opening and creating projects, and recent files list.
 */
import React, { useState, useEffect } from "react";
import { loadVnvProject, saveVnvProject, scaffoldNewProject, applyProjectTheme, createProjectInGamesDir, readRpyFolder, showInExplorer, deleteProjectFolder, copyDirRecursive, getGamesDir, validateRenpyProject, listAssetFiles, listDirEntries, findRenpySdk } from "./tauriApi";
import { newProject, newDemoProject, migrateProject } from "./types";
import { importFromRpyFiles } from "./rpyImporter";
import type { VNProject, RpyProject } from "./types";

import type { AppPrefs } from "./App";
import { useTranslation } from "./translationContext";
import { ToastManager } from "./toastContext";

interface Props {
  onLoadRpy: (project: RpyProject) => void;
  onLoadVnv: (project: VNProject) => void;
  prefs: AppPrefs;
}

export function StartScreen({ onLoadRpy, onLoadVnv, prefs }: Props) {
  const { t } = useTranslation();
  const { bgLevel, setBgLevel, glowEnabled, setGlowEnabled, scanlinesEnabled, setScanlinesEnabled, uiScale, setUiScale, autoSave, setAutoSave, theme, setTheme, language, setLanguage } = prefs;
  type BgLevel = 'darker' | 'default' | 'lighter';
  // Theme-relative: each theme's --bg0/2/3 defines the base background
  const bgMap: Record<BgLevel, string> = { darker: 'var(--bg0)', default: 'var(--bg2)', lighter: 'var(--bg3)' };
  const [windowMode, setWindowMode] = useState<string>(() => localStorage.getItem('pref_windowmode') || 'windowed');
  useEffect(() => { localStorage.setItem('pref_windowmode', windowMode); }, [windowMode]);
  const [projects, setProjects] = useState<{ path: string; title: string }[]>([]);
  const [activeTab, setActiveTab] = useState<"open" | "create" | "preferences" | "language">("open");
  const [visible, setVisible] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<number | null>(null);

  const LANGUAGES = [
    { code: 'en', englishName: 'English', nativeName: 'English' },
    { code: 'es', englishName: 'Spanish', nativeName: 'Español' },
    { code: 'ja', englishName: 'Japanese', nativeName: '日本語' }
  ];
  
  const CREDITS = [
    {
      name: "Ren'Py",
      description: t("credits.renpy_desc"),
      author: "Tom \"PyTom\" Rothamel",
      link: "https://www.patreon.com/renpy",
      website: "https://www.renpy.org/",
      icon: "🎀",
      extendedDescription: t("credits.renpy_ext")
    },
    {
      name: "React",
      description: t("credits.react_desc"),
      author: "Meta Open Source",
      link: "https://opensource.fb.com/",
      website: "https://react.dev/",
      icon: "⚛️",
      extendedDescription: t("credits.react_ext")
    },
    {
      name: "Tauri",
      description: t("credits.tauri_desc"),
      author: "Tauri Programme",
      link: "https://opencollective.com/tauri",
      website: "https://tauri.app/",
      icon: "🦀",
      extendedDescription: t("credits.tauri_ext")
    },
    {
      name: "Vite",
      description: t("credits.vite_desc"),
      author: "Evan You",
      link: "https://github.com/sponsors/yyx990803",
      website: "https://vitejs.dev/",
      icon: "⚡",
      extendedDescription: t("credits.vite_ext")
    },
    {
      name: "Zustand",
      description: t("credits.zustand_desc"),
      author: "Poimandres",
      link: "https://github.com/sponsors/dndc",
      website: "https://zustand-demo.pmnd.rs/",
      icon: "🐻",
      extendedDescription: t("credits.zustand_ext")
    },
    {
      name: "Graphology",
      description: t("credits.graphology_desc"),
      author: "Guillaume Plique",
      link: "https://github.com/sponsors/Yomguithereal",
      website: "https://graphology.github.io/",
      icon: "🕸️",
      extendedDescription: t("credits.graphology_ext")
    },
    {
      name: "Twine",
      description: t("credits.twine_desc"),
      author: "Chris Klimas",
      link: "https://github.com/sponsors/klembot",
      website: "https://twinery.org/",
      icon: "🧵",
      extendedDescription: t("credits.twine_ext")
    },
    {
      name: "Godot Engine",
      description: t("credits.godot_desc"),
      author: "Godot Engine Contributors",
      link: "https://fund.godotengine.org/",
      website: "https://godotengine.org/",
      icon: "🤖",
      extendedDescription: t("credits.godot_ext")
    },
    {
      name: "RenIDE (Vangard)",
      description: t("credits.renide_desc"),
      author: "Blue Moon Foundry Software",
      link: "https://github.com/bluemoonfoundry/vangard-renpy-ide",
      website: "https://github.com/bluemoonfoundry/vangard-renpy-ide",
      icon: "🌙",
      extendedDescription: t("credits.renide_ext")
    },
    {
      name: "Tailwind CSS",
      description: t("credits.tailwind_desc"),
      author: "Adam Wathan & Tailwind Labs",
      link: "https://github.com/sponsors/adamwathan",
      website: "https://tailwindcss.com/",
      icon: "🌊",
      extendedDescription: t("credits.tailwind_ext")
    },
    {
      name: "ActionEditor3",
      description: t("credits.actioneditor_desc"),
      author: "kyouryuukunn",
      link: "https://github.com/kyouryuukunn/renpy-ActionEditor3",
      website: "https://github.com/kyouryuukunn/renpy-ActionEditor3",
      icon: "🎬",
      extendedDescription: t("credits.actioneditor_ext")
    },
    {
      name: "Visual Novel Design",
      description: t("credits.vimi_desc"),
      author: "Vimi",
      link: "https://www.youtube.com/@vimi",
      website: "https://www.youtube.com/@vimi",
      icon: "🎥",
      extendedDescription: t("credits.vimi_ext")
    },
    {
      name: "Aseprite",
      description: t("credits.aseprite_desc"),
      author: "David Capello",
      link: "https://www.aseprite.org/",
      website: "https://www.aseprite.org/",
      icon: "🎨",
      extendedDescription: t("credits.aseprite_ext")
    }
  ];

  const [newTitle, setNewTitle] = useState("My Visual Novel");
  const [newAuthor, setNewAuthor] = useState("Me");
  const [newRes, setNewRes] = useState("1920x1080");
  const [newAccent, setNewAccent] = useState("#0099cc");
  const [newBg, setNewBg] = useState("#1a1a2e");
  const [wizardStep, setWizardStep] = useState<0|1|2|3|4>(0); // 0=name,1=template,2=res,3=colors,4=processing
  const [newTemplate, setNewTemplate] = useState<"blank" | "demo">("blank");
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ warnings: string[]; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ path: string; title: string; folder: string } | null>(null);

  const pickFolder = async (initialPath?: string): Promise<string | null> => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: initialPath ?? prefs.gamesDir
    });
    if (typeof selected === 'string') {
      return selected.replace(/\\/g, '/');
    }
    return null;
  };

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (activeTab === 'open') {
      listDirEntries(getGamesDir()).then(entries => {
        const vnvProjects = entries
          .filter(e => e.is_vnv_project)
          .map(e => ({ path: `${e.path}/project.vnvmaker`, title: e.name }));
        setProjects(vnvProjects);
      }).catch(e => console.warn("Could not list projects:", e));
    }
  }, [activeTab, prefs.gamesDir]);

  /**
   * Import Ren'Py Project — picks ANY folder anywhere on disk,
   * copies it into GAMES_DIR/<folder-name>/, creates project.vnvmaker, loads it.
   */
  const handleImportRenpy = async () => {
    try {
      const src = await pickFolder();
      if (!src) return;
      setLoading(true);

      const srcNorm = src.replace(/\\/g, "/");
      const folderName = srcNorm.split("/").pop() || "imported-project";

      // Step 1 — Validate: must have game/ subfolder AND .rpy files inside it.
      // The validator returns the resolved game/ path so we don't need to guess.
      let gameDirPath: string;
      try {
        gameDirPath = await validateRenpyProject(srcNorm);
      } catch (validationErr) {
        alert(`❌ Cannot import — ${String(validationErr)}`);
        setLoading(false);
        return;
      }

      // Step 2 — Copy entire source folder into GAMES_DIR
      const destRoot = `${getGamesDir()}/${folderName}`;
      const vnvPath  = `${destRoot}/project.vnvmaker`;
      await copyDirRecursive(srcNorm, destRoot);

      // Step 3 — Build VNVMaker project from the copied scripts.
      // Translate gameDirPath (points at src) -> equivalent path under destRoot.
      const rpyRoot = gameDirPath.startsWith(srcNorm)
        ? destRoot + gameDirPath.slice(srcNorm.length)
        : `${destRoot}/game`;
      const files = await readRpyFolder(rpyRoot);
      const images = await listAssetFiles(rpyRoot, "images");
      const { project, warnings } = importFromRpyFiles(files, rpyRoot, folderName, "Author", images);
      project._rootPath = destRoot;
      project._filePath = vnvPath;

      // Step 4 — Save .vnvmaker and update recent list
      if (warnings.length) setImportResult({ warnings, title: project.title });
      setLoading(false);
      onLoadVnv(project);
    } catch (e) {
      alert("Import failed: " + String(e));
      setLoading(false);
    }
  };

  const handleProjectClick = async (p: { path: string; title: string }) => {
    try {
      setLoading(true);
      try {
        const proj = await loadVnvProject(p.path);
        onLoadVnv(proj);
      } catch (_) {
        // Fallback: it's a Ren'Py project that hasn't been imported yet
        const folder = p.path.replace(/\/[^/]+$/, ""); // parent dir
        const files = await readRpyFolder(folder);
        const images = await listAssetFiles(folder, "images");
        const { project } = importFromRpyFiles(files, folder, p.title, "Author", images);
        project._rootPath = folder;
        project._filePath = p.path;
        setLoading(false);
        onLoadVnv(project);
      }
    } catch (e) {
      alert(`Could not open "${p.title}": ${String(e)}`);
      setLoading(false);
    }
  };



  const handleCreateNew = async () => {
    // Step 4 → Processing: actually create the project
    setWizardStep(4);
    try {
      const [w, h] = newRes.split("x").map(Number);
      const proj = newTemplate === "demo" 
        ? newDemoProject(newTitle, newAuthor, [w, h]) 
        : newProject(newTitle, newAuthor, [w, h]);
        
      const rootPath = await createProjectInGamesDir(newTitle);
      proj._rootPath = rootPath;
      proj._filePath = rootPath + "/project.vnvmaker";

      // Scaffold blank Ren'Py structure from Templet
      await scaffoldNewProject(proj._rootPath, newTitle);

      // Patch gui.rpy with chosen resolution + accent color
      try {
        await applyProjectTheme(proj._rootPath, w, h, newAccent, newBg);
      } catch (e) { console.warn("Theme patch failed:", e); }

      // Save .vnvmaker to disk immediately so Recent Projects can open it next session
      await saveVnvProject(proj._filePath, proj);

      // Brief pause so user sees the "Creating..." screen
      await new Promise(r => setTimeout(r, 800));
      onLoadVnv(proj);
    } catch (e) {
      alert("Error creating project: " + String(e));
      setWizardStep(3);
    }
  };

  const handleQuit = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().close();
  };



  const MenuButton = ({ title, subtitle, isActive, subtitleColor, onClick, delay = 0 }: any) => (
    <button
      className={`start-menu-btn ${isActive ? 'active' : ''} ${visible ? 'visible' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <div className="line" style={{ background: isActive ? 'var(--pink)' : subtitleColor }} />
      <span className="title">{title}</span>
      <span className="subtitle" style={{ color: isActive ? 'var(--pink)' : subtitleColor }}>{subtitle}</span>
    </button>
  );

  return (
    <>
    <div style={{ display: 'flex', height: '100%', background: bgMap[bgLevel], fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: uiScale === '125%' ? '112.5%' : uiScale === '150%' ? '125%' : '100%' }}>
      {/* Subtle scanline overlay */}
      {scanlinesEnabled && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,200,0.012) 2px, rgba(0,212,200,0.012) 4px)', pointerEvents: 'none', opacity: 0.6, zIndex: 0 }} />}
      {/* Left Sidebar Menu */}
      <div style={{ 
        width: 240, borderRight: '1px solid rgba(var(--teal-rgb,0,212,200),0.12)', 
        display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative', 
        background: 'var(--bg1)', overflow: 'hidden', zIndex: 1,
        transform: showCredits ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Sidebar glow */}
        <div style={{ position: 'absolute', bottom: -80, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,200,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 0 16px' }}>

          {/* Credits — pinned to very top */}
          <MenuButton 
            title={t("menu.credits")} 
            subtitle={t("menu.credits_sub")} 
            isActive={showCredits} 
            subtitleColor="#eab308"
            onClick={() => { setShowCredits(true); setSelectedCredit(0); }}
            delay={40}
          />

          {/* Top spacer — equal to bottom spacer, centers the 4 buttons */}
          <div style={{ flex: 1 }} />

          {/* The 4 main nav buttons — vertically centered */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <MenuButton 
              title={t("menu.create_project")} 
              subtitle={t("menu.create_project_sub")} 
              isActive={activeTab === 'create'} 
              subtitleColor="#2dd4bf"
              onClick={() => { setWizardStep(0); setActiveTab('create'); }}
              delay={80}
            />
            
            <MenuButton 
              title={t("menu.open_project")} 
              subtitle={t("menu.open_project_sub")} 
              isActive={activeTab === 'open'} 
              subtitleColor="#2dd4bf"
              onClick={() => setActiveTab('open')}
              delay={160}
            />
            
            <MenuButton 
              title={t("menu.import_renpy")} 
              subtitle={t("menu.import_renpy_sub")} 
              isActive={false} 
              subtitleColor="#fb923c"
              onClick={() => handleImportRenpy()}
              delay={200}
            />
            
            <MenuButton 
              title={t("menu.preferences")} 
              subtitle={t("menu.preferences_sub")} 
              isActive={activeTab === 'preferences' || activeTab === 'language'} 
              subtitleColor="#60a5fa"
              onClick={() => setActiveTab('preferences')}
              delay={280}
            />
          </div>

          {/* Bottom spacer — equal to top spacer */}
          <div style={{ flex: 1 }} />

          {/* Leave Maker — pinned to very bottom */}
          <MenuButton 
            title={t("menu.leave_maker")} 
            subtitle={t("menu.leave_maker_sub")} 
            isActive={false} 
            subtitleColor="#fb7185"
            onClick={handleQuit}
            delay={400}
          />

        </div>

      </div>

      {/* Right Content Area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* Atmospheric gradient glows — on top of solid bg */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: bgMap[bgLevel], zIndex: 0 }}>
          {glowEnabled && <>
            <div style={{ position: 'absolute', top: '5%', left: '10%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(75,108,247,0.18) 0%, transparent 65%)', filter: 'blur(30px)' }} />
            <div style={{ position: 'absolute', bottom: '5%', right: '5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,212,200,0.14) 0%, transparent 65%)', filter: 'blur(30px)' }} />
            <div style={{ position: 'absolute', top: '35%', left: '35%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,114,182,0.08) 0%, transparent 65%)', filter: 'blur(50px)' }} />
          </>}
        </div>
        
        {/* Main Menu UI Wrapper */}
        <div style={{ 
          position: 'relative', zIndex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: showCredits ? 'translateX(10vw)' : 'translateX(0)',
          opacity: showCredits ? 0 : 1,
          pointerEvents: showCredits ? 'none' : 'auto',
          transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div className="spin" style={{ fontSize: 32, color: "var(--acc)" }}>⟳</div>
            <div style={{ color: "var(--faint)", fontSize: 12, letterSpacing: '.05em' }}>{t("loading")}</div>
          </div>
        ) : activeTab === 'open' ? (
          <div style={{ width: '100%', maxWidth: 540 }}>
            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'var(--bg1)', padding: '24px 32px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', letterSpacing: '.12em', marginBottom: 20, textTransform: 'uppercase' }}>{t("menu.open_project")}</div>
              
              {projects.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projects.map((p, i) => (
                    <div key={i} className="project-card" onClick={() => handleProjectClick(p)}>
                      <div className="accent" />
                      <div className="icon-box">📁</div>
                      <div className="flex1" style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{p.title || t("recent.untitled")}</div>
                        <div className="row gap8" style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>
                          <span>{t("recent.vnv_project")}</span>
                          <span>·</span>
                          <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
                        </div>
                      </div>
                      <div className="actions">
                        <button
                          className="btn btn-ghost"
                          title={t("recent.show_in_explorer")}
                          onClick={e => {
                            e.stopPropagation();
                            const folder = p.path.replace(/\/[^/]+$/, '');
                            showInExplorer(folder);
                          }}
                          style={{ padding: '5px 9px', opacity: 0.75, display: 'flex', alignItems: 'center' }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            <line x1="12" y1="11" x2="12" y2="17"/>
                            <polyline points="9 14 12 17 15 14"/>
                          </svg>
                        </button>
                        <button className="btn btn-ghost" onClick={e => { e.stopPropagation(); handleProjectClick(p); }}>{t("recent.open")}</button>
                        <button
                          className="btn btn-ghost"
                          title={t("modals.btn_delete")}
                          onClick={e => {
                            e.stopPropagation();
                            const folder = p.path.replace(/\/[^/]+$/, '');
                            setConfirmDelete({ path: p.path, title: p.title || p.path, folder });
                          }}
                          style={{ padding: '5px 9px', opacity: 0.5, display: 'flex', alignItems: 'center', color: 'var(--err)' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--faint)' }}>{t("recent.no_recent")}</div>
              )}
            </div>
          </div>
        ) : activeTab === 'preferences' ? (
          <div style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'var(--bg1)', padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', letterSpacing: '.12em', textTransform: 'uppercase' }}>{t("prefs.title")}</div>

              {/* ── Window Mode (top) ── */}
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { val: 'windowed',   label: `⬜  ${t("prefs.windowed")}` },
                  { val: 'fullscreen', label: `⛶  ${t("prefs.fullscreen")}` },
                ].map(m => {
                  const sel = windowMode === m.val;
                  return (
                    <div key={m.val} onClick={async () => {
                      setWindowMode(m.val);
                      const { getCurrentWindow } = await import('@tauri-apps/api/window');
                      const win = getCurrentWindow();
                      if (m.val === 'fullscreen') {
                        // True fullscreen — covers taskbar entirely
                        await win.setFullscreen(true);
                      } else {
                        // Windowed — exit fullscreen AND un-maximize so taskbar returns
                        await win.setFullscreen(false);
                        await win.unmaximize();
                      }
                    }}
                      style={{ flex: 1, padding: '12px 16px', borderRadius: 6, cursor: 'pointer', border: sel ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.08)', background: sel ? 'rgba(0,212,200,0.1)' : 'rgba(0,0,0,0.2)', color: sel ? 'var(--teal)' : 'var(--dim)', fontWeight: 600, textAlign: 'center', transition: 'all 0.15s ease', fontSize: 13 }}>
                      {m.label}
                    </div>
                  );
                })}
              </div>

              {/* ── Graphics ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--acc)', letterSpacing: '.15em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>{t("prefs.graphics")}</div>

                {/* Theme Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.color_theme")}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      { val: 'vnv-dark',       labelKey: 'themes.vnv_dark',      teal: '#00d4c8', acc: '#4b6cf7', bg: '#05080f' },
                      { val: 'frappe',         labelKey: 'themes.frappe',        teal: '#81c8be', acc: '#8caaee', bg: '#232634' },
                      { val: 'nord',           labelKey: 'themes.nord',          teal: '#8fbcbb', acc: '#88c0d0', bg: '#2e3440' },
                      { val: 'tokyo-night',    labelKey: 'themes.tokyo_night',   teal: '#7dcfff', acc: '#bb9af7', bg: '#1a1b26' },
                      { val: 'solarized-dark', labelKey: 'themes.solarized_dark',teal: '#2aa198', acc: '#268bd2', bg: '#002b36' },
                      { val: 'aura',           labelKey: 'themes.aura',          teal: '#61ffca', acc: '#a277ff', bg: '#15141b' },
                      { val: 'amber',          labelKey: 'themes.amber',         teal: '#ffb000', acc: '#ff8800', bg: '#0f0a00' },
                      { val: 'light',          labelKey: 'themes.light',         teal: '#0ea5e9', acc: '#3b82f6', bg: '#f8fafc' },
                      { val: 'cherry',         labelKey: 'themes.cherry',        teal: '#d96262', acc: '#bf4a4a', bg: '#140d0d' },
                      { val: 'forest',         labelKey: 'themes.forest',        teal: '#34d399', acc: '#10b981', bg: '#050f0a' },
                      { val: 'sunset',         labelKey: 'themes.sunset',        teal: '#fbbf24', acc: '#f59e0b', bg: '#1a0b12' },
                      { val: 'royal',          labelKey: 'themes.royal',         teal: '#d8b4fe', acc: '#c084fc', bg: '#0d0514' },
                      { val: 'gruvbox',        labelKey: 'themes.gruvbox',       teal: '#8ec07c', acc: '#fabd2f', bg: '#282828' },
                      { val: 'oceanic',        labelKey: 'themes.oceanic',       teal: '#5fb3b3', acc: '#6699cc', bg: '#1b2b34' },
                      { val: 'rose-pine',      labelKey: 'themes.rose_pine',     teal: '#9ccfd8', acc: '#31748f', bg: '#191724' },
                      { val: 'midnight',       labelKey: 'themes.midnight',      teal: '#38bdf8', acc: '#818cf8', bg: '#000000' },
                    ].map(th => {
                      const sel = theme === th.val;
                      return (
                        <div key={th.val} onClick={() => setTheme(th.val)}
                          style={{ padding: '10px 8px', borderRadius: 8, cursor: 'pointer', border: sel ? `1px solid ${th.teal}` : '1px solid rgba(255,255,255,0.08)', background: th.bg, textAlign: 'center', transition: 'all 0.15s ease', boxShadow: sel ? `0 0 10px ${th.teal}44` : 'none' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: th.teal }} />
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: th.acc }} />
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: sel ? th.teal : '#7e95ab', letterSpacing: '.05em' }}>{t(th.labelKey)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Background Level */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.bg_darkness")}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { label: t("prefs.bg_darker"), val: 'darker', bg: '#05080f' },
                      { label: t("prefs.bg_default"), val: 'default', bg: '#0d1117' },
                      { label: t("prefs.bg_lighter"), val: 'lighter', bg: '#141b26' },
                    ].map(opt => {
                      const sel = bgLevel === opt.val;
                      return (
                        <div key={opt.val} onClick={() => setBgLevel(opt.val as any)}
                          style={{ flex: 1, padding: '10px 12px', borderRadius: 6, cursor: 'pointer', border: sel ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.08)', background: sel ? 'rgba(0,212,200,0.1)' : opt.bg, transition: 'all 0.15s ease', textAlign: 'center' }}>
                          <div style={{ width: 24, height: 24, borderRadius: 4, background: opt.bg, border: '1px solid rgba(255,255,255,0.15)', margin: '0 auto 6px' }} />
                          <div style={{ fontSize: 11, fontWeight: 600, color: sel ? 'var(--teal)' : '#7e95ab' }}>{opt.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Glow Effects */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.glow_effects")}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{t("prefs.glow_effects_desc")}</div>
                  </div>
                  <div onClick={() => setGlowEnabled(v => !v)}
                    style={{ width: 40, height: 20, borderRadius: 10, background: glowEnabled ? 'var(--teal)' : '#2d3748', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: glowEnabled ? 22 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                </div>

                {/* Scanlines */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.scanlines")}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{t("prefs.scanlines_desc")}</div>
                  </div>
                  <div onClick={() => setScanlinesEnabled(v => !v)}
                    style={{ width: 40, height: 20, borderRadius: 10, background: scanlinesEnabled ? 'var(--teal)' : '#2d3748', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: scanlinesEnabled ? 22 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                </div>
              </div>

              {/* ── General ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--acc)', letterSpacing: '.15em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>{t("prefs.general")}</div>

                {/* Games Directory */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.games_dir")}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.4 }}>{t("prefs.games_dir_desc")}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" style={{ flex: 1, fontSize: 12, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--dim)' }} readOnly value={prefs.gamesDir} />
                    <button className="btn btn-ghost" onClick={async () => {
                      const { open } = await import('@tauri-apps/plugin-dialog');
                      const dir = await open({ directory: true, defaultPath: prefs.gamesDir });
                      if (dir && typeof dir === 'string') prefs.setGamesDir(dir.replace(/\\/g, '/'));
                    }} style={{ fontSize: 12, padding: '0 16px', border: '1px solid var(--bdr)', borderRadius: 6 }}>{t("prefs.change_btn")}</button>
                  </div>
                </div>

                {/* Ren'Py SDK Directory */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.renpy_sdk_dir") || "Ren'Py SDK Directory"}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.4 }}>{t("prefs.renpy_sdk_dir_desc") || "Directory containing the Ren'Py executable (renpy.exe / renpy.sh)."}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" style={{ flex: 1, fontSize: 12, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--dim)' }} readOnly value={prefs.renpySdkPath} />

                    <button className="btn btn-ghost" onClick={async () => {
                      const { open } = await import('@tauri-apps/plugin-dialog');
                      const dir = await open({ directory: true, defaultPath: prefs.renpySdkPath });
                      if (dir && typeof dir === 'string') prefs.setRenpySdkPath(dir.replace(/\\/g, '/'));
                    }} style={{ fontSize: 12, padding: '0 16px', border: '1px solid var(--bdr)', borderRadius: 6 }}>{t("prefs.change_btn")}</button>
                  </div>
                </div>

                {/* UI Scaling */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.ui_scaling")}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['100%', '125%', '150%'].map(s => {
                      const sel = uiScale === s;
                      return (
                        <div key={s} onClick={() => setUiScale(s)}
                          style={{ flex: 1, padding: '10px 16px', borderRadius: 6, cursor: 'pointer', border: sel ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.08)', background: sel ? 'rgba(0, 212, 200, 0.1)' : 'rgba(0,0,0,0.2)', color: sel ? 'var(--teal)' : 'var(--dim)', fontWeight: 600, textAlign: 'center', transition: 'all 0.15s ease' }}>{s}</div>
                      );
                    })}
                  </div>
                </div>

                {/* Auto-Save */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.auto_save")}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{t("prefs.auto_save_desc")}</div>
                  </div>
                  <div onClick={() => setAutoSave(v => !v)}
                    style={{ width: 40, height: 20, borderRadius: 10, background: autoSave ? 'var(--teal)' : '#2d3748', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: autoSave ? 22 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                </div>

                {/* Language */}
                <div 
                  onClick={() => setActiveTab('language')} 
                  style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    padding: '18px 24px', borderRadius: 8, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                    transition: 'all 0.15s', marginTop: 8
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 16, color: '#a8bccf', fontWeight: 700 }}>{t("prefs.language")}</div>
                    <div style={{ fontSize: 14, color: 'var(--dim)' }}>
                      {t("prefs.language_current")} <span style={{ color: 'var(--teal)' }}>{LANGUAGES.find(l => l.code === language)?.englishName || language}</span>
                    </div>
                  </div>
                  <div style={{ 
                    fontSize: 15, fontWeight: 600, 
                    padding: '10px 20px', background: 'var(--teal)', color: '#000', borderRadius: 6,
                    boxShadow: '0 4px 12px rgba(0,212,200,0.3)'
                  }}>
                    {t("prefs.change_language")}
                  </div>
                </div>

              </div>

            </div>
          </div>
        ) : activeTab === 'language' ? (
          <div style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'var(--bg1)', padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 16 }}>
                <button className="btn btn-ghost" onClick={() => setActiveTab('preferences')} style={{ padding: '8px 12px', color: 'var(--dim)', background: 'rgba(0,0,0,0.2)' }}>← {t("prefs.back")}</button>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal)', letterSpacing: '.05em', textTransform: 'uppercase' }}>{t("prefs.select_language")}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {LANGUAGES.map(l => {
                  const sel = language === l.code;
                  return (
                    <button key={l.code} className={`btn ${sel ? 'btn-accent' : 'btn-ghost'}`}
                      onClick={() => { setLanguage(l.code); setActiveTab('preferences'); }}
                      style={{ 
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                        padding: '16px 20px', borderRadius: 8, textAlign: 'left',
                        border: sel ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.05)',
                        background: sel ? 'rgba(0, 212, 200, 0.1)' : 'rgba(0,0,0,0.2)',
                        transition: 'all 0.15s'
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: sel ? 'var(--teal)' : 'var(--text)' }}>{l.englishName}</span>
                      <span style={{ fontSize: 14, color: 'var(--dim)' }}>{l.nativeName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          // ── Create Project Wizard ──────────────────────────────────────────
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(12px)', zIndex: 120,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 560, background: 'linear-gradient(145deg,#0d1220,#111827)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
              boxShadow: '0 32px 80px rgba(0,0,0,.9)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>

              {/* Step indicator */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '24px 0 0' }}>
                {([t("wizard.step_name"), t("wizard.step_template"), t("wizard.step_res"), t("wizard.step_color"), t("wizard.step_create")].map((label, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: i <= wizardStep ? 28 : 20,
                      height: i <= wizardStep ? 28 : 20,
                      borderRadius: '50%',
                      background: i < wizardStep ? 'var(--teal)' : i === wizardStep ? 'var(--acc)' : 'rgba(255,255,255,0.07)',
                      border: `2px solid ${i === wizardStep ? 'var(--acc)' : i < wizardStep ? 'var(--teal)' : 'rgba(255,255,255,0.12)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: i <= wizardStep ? '#fff' : 'var(--dim)',
                      transition: 'all 0.25s',
                    }}>{i < wizardStep ? '✓' : i + 1}</div>
                    <div style={{ fontSize: 9, color: i === wizardStep ? 'var(--acc)' : 'var(--dim)', letterSpacing: '.08em', fontWeight: i === wizardStep ? 700 : 400 }}>{label}</div>
                  </div>
                )))}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '20px 32px 0' }} />

              {/* Step content */}
              <div style={{ padding: '28px 40px 24px', minHeight: 240 }}>

                {/* Step 0: Project Name */}
                {wizardStep === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.01em', marginBottom: 6 }}>{t("wizard.name_title")}</div>
                      <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.6 }}>
                        {t("wizard.name_desc")} <code style={{ color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: 11 }}>VNVMAKER/games/</code>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 10, letterSpacing: '.10em', color: 'var(--dim)', fontWeight: 700 }}>{t("wizard.project_title")}</div>
                      <input autoFocus className="input" style={{ fontSize: 15, padding: '10px 14px' }}
                        value={newTitle} onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && newTitle.trim() && setWizardStep(1)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 10, letterSpacing: '.10em', color: 'var(--dim)', fontWeight: 700 }}>{t("wizard.author")}</div>
                      <input className="input" style={{ fontSize: 14, padding: '10px 14px' }}
                        value={newAuthor} onChange={e => setNewAuthor(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Step 1: Template */}
                {wizardStep === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{t("wizard.template_title")}</div>
                      <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.6 }}>
                        {t("wizard.template_desc")}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {/* Blank Option */}
                      <div onClick={() => setNewTemplate('blank')} style={{
                        flex: 1, padding: '20px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${newTemplate === 'blank' ? 'var(--acc)' : 'rgba(255,255,255,0.07)'}`,
                        background: newTemplate === 'blank' ? 'rgba(75,108,247,0.12)' : 'rgba(255,255,255,0.025)',
                        transition: 'all 0.15s',
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: newTemplate === 'blank' ? '#fff' : '#aaa', marginBottom: 8 }}>{t("wizard.blank_title")}</div>
                        <div style={{ fontSize: 11, color: newTemplate === 'blank' ? 'var(--acc)' : 'var(--dim)' }}>{t("wizard.blank_desc")}</div>
                      </div>
                      
                      {/* Demo Option */}
                      <div onClick={() => setNewTemplate('demo')} style={{
                        flex: 1, padding: '20px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${newTemplate === 'demo' ? 'var(--acc)' : 'rgba(255,255,255,0.07)'}`,
                        background: newTemplate === 'demo' ? 'rgba(75,108,247,0.12)' : 'rgba(255,255,255,0.025)',
                        transition: 'all 0.15s',
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: newTemplate === 'demo' ? '#fff' : '#aaa', marginBottom: 8 }}>{t("wizard.demo_title")}</div>
                        <div style={{ fontSize: 11, color: newTemplate === 'demo' ? 'var(--acc)' : 'var(--dim)' }}>{t("wizard.demo_desc")}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Resolution */}
                {wizardStep === 2 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{t("wizard.res_title")}</div>
                      <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.6 }}>
                        {t("wizard.res_desc")}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { val: '1280x720',  label: '1280 × 720',  note: 'HD' },
                        { val: '1920x1080', label: '1920 × 1080', note: 'Full HD — recommended' },
                        { val: '2560x1440', label: '2560 × 1440', note: '2K' },
                        { val: '3840x2160', label: '3840 × 2160', note: '4K' },
                      ].map(r => {
                        const sel = newRes === r.val;
                        return (
                          <div key={r.val} onClick={() => setNewRes(r.val)} style={{
                            padding: '13px 18px', borderRadius: 8, cursor: 'pointer',
                            border: `1px solid ${sel ? 'var(--acc)' : 'rgba(255,255,255,0.07)'}`,
                            background: sel ? 'rgba(75,108,247,0.12)' : 'rgba(255,255,255,0.025)',
                            display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.15s',
                          }}>
                            <div style={{
                              width: 16, height: 16, borderRadius: '50%',
                              border: `2px solid ${sel ? 'var(--acc)' : 'rgba(255,255,255,0.2)'}`,
                              background: sel ? 'var(--acc)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                              {sel && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                            </div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: sel ? '#fff' : '#aaa', fontWeight: sel ? 700 : 400, flex: 1 }}>{r.label}</div>
                            <div style={{ fontSize: 11, color: sel ? 'var(--acc)' : 'var(--dim)' }}>{r.note}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Step 3: Colors */}
                {wizardStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{t("wizard.color_title")}</div>
                      <div style={{ fontSize: 12, color: 'var(--dim)' }}>{t("wizard.color_desc")}</div>
                    </div>
                    {/* Accent swatches */}
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: '.10em', color: 'var(--dim)', fontWeight: 700, marginBottom: 10 }}>{t("wizard.accent_color")}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                        {[
                          '#00b8c3','#6eb5ff','#00cc88','#e6c84a','#e67c00',
                          '#4b6cf7','#9b59b6','#00d4c8','#e91e8c','#e74c3c',
                          '#ffffff','#0099cc',
                        ].map(c => (
                          <div key={c} onClick={() => setNewAccent(c)}
                            title={c}
                            style={{
                              height: 34, borderRadius: 7, background: c, cursor: 'pointer',
                              border: newAccent === c ? '3px solid #fff' : '2px solid transparent',
                              boxShadow: newAccent === c ? `0 0 12px ${c}88` : 'none',
                              transform: newAccent === c ? 'scale(1.12)' : 'scale(1)',
                              transition: 'all 0.15s',
                            }} />
                        ))}
                      </div>
                    </div>
                    {/* Background swatches */}
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: '.10em', color: 'var(--dim)', fontWeight: 700, marginBottom: 10 }}>{t("wizard.bg_color")}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                        {[
                          '#0d0d1a','#0d1b2a','#0d1a0d','#1a1a00','#1a0d00',
                          '#000820','#0d001a','#001a1a','#1a0011','#1a0000',
                          '#111111','#1a1a2e',
                        ].map(c => (
                          <div key={c} onClick={() => setNewBg(c)}
                            title={c}
                            style={{
                              height: 34, borderRadius: 7, background: c, cursor: 'pointer',
                              border: newBg === c ? `3px solid ${newAccent}` : '2px solid rgba(255,255,255,0.10)',
                              boxShadow: newBg === c ? `0 0 10px ${newAccent}66` : 'none',
                              transform: newBg === c ? 'scale(1.12)' : 'scale(1)',
                              transition: 'all 0.15s',
                            }} />
                        ))}
                      </div>
                    </div>
                    {/* Preview bar */}
                    <div style={{ borderRadius: 8, padding: '12px 16px', background: newBg, border: `1px solid ${newAccent}44`, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: newAccent }} />
                      <div style={{ fontSize: 13, color: newAccent, fontWeight: 700 }}>{newTitle}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>{t("wizard.preview")}</div>
                    </div>
                  </div>
                )}

                {/* Step 4: Creating */}
                {wizardStep === 4 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, height: 200 }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%',
                      border: '3px solid rgba(255,255,255,0.08)',
                      borderTop: `3px solid ${newAccent}`,
                      animation: 'spin 0.9s linear infinite',
                    }} />
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>{t("wizard.creating_title")}</div>
                      <div style={{ fontSize: 12, color: 'var(--dim)', textAlign: 'center', marginTop: 6 }}>{newTitle}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer buttons */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 32px' }} />
              <div style={{ padding: '18px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {wizardStep < 4 ? (
                  <>
                    <button className="btn btn-ghost" onClick={() => {
                      if (wizardStep === 0) setActiveTab('open');
                      else setWizardStep(s => (s - 1) as 0|1|2|3|4);
                    }} style={{ fontSize: 13, color: 'var(--dim)' }}>
                      {wizardStep === 0 ? t("wizard.btn_cancel") : `← ${t("wizard.btn_back")}`}
                    </button>
                    <button
                      className="btn"
                      disabled={wizardStep === 0 && !newTitle.trim()}
                      onClick={() => {
                        if (wizardStep < 3) setWizardStep(s => (s + 1) as 0|1|2|3|4);
                        else handleCreateNew();
                      }}
                      style={{ background: 'var(--acc)', color: '#fff', border: 'none', padding: '10px 28px', fontSize: 14, fontWeight: 700, borderRadius: 8, letterSpacing: '.04em', cursor: wizardStep === 0 && !newTitle.trim() ? 'not-allowed' : 'pointer', opacity: wizardStep === 0 && !newTitle.trim() ? 0.4 : 1 }}
                    >
                      {wizardStep === 3 ? `✨ ${t("wizard.btn_create")}` : `${t("wizard.btn_continue")} →`}
                    </button>
                  </>
                ) : (
                  <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--dim)' }}>{t("wizard.btn_wait")}</div>
                )}
              </div>
            </div>
          </div>
        )}


        </div>{/* end zIndex:1 content wrapper */}

        {/* Credits UI Screen */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '60px 40px 0', overflowY: 'auto', overflowX: 'hidden',
          transform: showCredits ? 'translateY(0)' : 'translateY(15vh)',
          opacity: showCredits ? 1 : 0,
          pointerEvents: showCredits ? 'auto' : 'none',
          transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{ 
            display: 'flex', gap: selectedCredit !== null ? 40 : 0, 
            width: '100%', maxWidth: selectedCredit !== null ? 1000 : 760, 
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)', 
            paddingBottom: 100 
          }}>
            
            {/* Left Panel (Detail) */}
            <div style={{
              width: selectedCredit !== null ? 360 : 0,
              opacity: selectedCredit !== null ? 1 : 0,
              transform: selectedCredit !== null ? 'translateX(0)' : 'translateX(-40px)',
              pointerEvents: selectedCredit !== null ? 'auto' : 'none',
              transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              overflow: 'hidden',
              flexShrink: 0,
              position: 'sticky',
              top: 80,
              alignSelf: 'flex-start'
            }}>
              <div style={{ width: 360, paddingTop: 10, paddingBottom: 40 }}>
                {selectedCredit !== null && (
                  <div style={{ 
                    background: 'rgba(0,0,0,0.3)', border: '1px solid var(--teal)', borderRadius: 16, 
                    padding: 32, backdropFilter: 'blur(10px)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                    position: 'relative'
                  }}>
                    <button className="btn btn-ghost" onClick={() => setSelectedCredit(null)} style={{ position: 'absolute', top: 12, right: 12, fontSize: 16, padding: '4px 8px', color: 'var(--dim)' }}>
                      ✕
                    </button>
                    <div style={{ fontSize: 72, marginBottom: 24, textAlign: 'center', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }}>
                      {CREDITS[selectedCredit].icon}
                    </div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal)', margin: 0, textAlign: 'center' }}>{CREDITS[selectedCredit].name}</h2>
                    <div style={{ fontSize: 13, color: 'var(--acc)', fontWeight: 600, marginTop: 6, marginBottom: 24, textAlign: 'center' }}>by {CREDITS[selectedCredit].author}</div>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }} />
                    <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, margin: 0, opacity: 0.9 }}>
                      {CREDITS[selectedCredit].extendedDescription}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel (List) */}
            <div style={{ flex: 1, minWidth: 0, transition: 'all 0.4s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
                <button className="btn btn-ghost" onClick={() => { setShowCredits(false); setSelectedCredit(null); }} style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.3)', color: 'var(--dim)', borderRadius: 8 }}>
                  ← {t("prefs.back")}
                </button>
                <div>
                  <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--teal)', margin: 0, letterSpacing: '-.02em' }}>{t("modals.credits_title") || "Credits & Open Source"}</h1>
                  <p style={{ fontSize: 14, color: 'var(--dim)', margin: '6px 0 0' }}>{t("modals.credits_text") || "VNV Maker is built with love and relies on these incredible open-source projects. Please consider supporting them!"}</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {CREDITS.map((credit, i) => (
                  <div key={i} onClick={() => setSelectedCredit(selectedCredit === i ? null : i)} style={{ 
                    background: selectedCredit === i ? 'rgba(var(--teal-rgb,0,212,200),0.08)' : 'rgba(0,0,0,0.3)', 
                    border: selectedCredit === i ? '1px solid rgba(var(--teal-rgb,0,212,200),0.4)' : '1px solid rgba(255,255,255,0.06)', 
                    borderRadius: 12, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12,
                    backdropFilter: 'blur(10px)', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)', cursor: 'pointer',
                    boxShadow: selectedCredit === i ? '0 0 20px rgba(var(--teal-rgb,0,212,200),0.1)' : 'none',
                    transform: selectedCredit === i ? 'scale(1.02)' : 'scale(1)'
                  }}
                  onMouseEnter={e => {
                    if (selectedCredit !== i) {
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
                      e.currentTarget.style.background = 'rgba(0,0,0,0.45)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedCredit !== i) {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.background = 'rgba(0,0,0,0.3)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                    }
                  }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h2 style={{ fontSize: 20, fontWeight: 700, color: selectedCredit === i ? 'var(--teal)' : 'var(--text)', margin: 0, transition: 'color 0.2s' }}>{credit.name}</h2>
                        <div style={{ fontSize: 13, color: 'var(--acc)', fontWeight: 600, marginTop: 4 }}>by {credit.author}</div>
                      </div>
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--dim)', lineHeight: 1.6, margin: 0 }}>
                      {credit.description}
                    </p>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 60, textAlign: 'center', fontSize: 14, color: 'var(--dim)', letterSpacing: '.02em', opacity: 0.8 }}>
                Vibe coded by Maximiliano Cameron Mcmickle<br/>
                AI model used: Google's Antigravity
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Right Logo */}
        <div style={{ position: 'absolute', bottom: 40, right: 40, textAlign: 'right', pointerEvents: 'none', opacity: showCredits ? 0 : 0.9, transition: 'opacity 0.4s', zIndex: 2 }}>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginBottom: 4 }}>
             <div style={{ width: 14, height: 14, background: 'var(--teal)' }} />
             <div style={{ width: 14, height: 14, background: 'var(--acc)' }} />
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.02em', lineHeight: 1 }}>VNVMaker</div>
          <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700, letterSpacing: '.12em', marginTop: 4 }}>1.0</div>
        </div>

        {/* Bottom Center Credits */}
        <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: 'var(--dim)', pointerEvents: 'none', letterSpacing: '.02em', zIndex: 2, opacity: showCredits ? 0 : 1, transition: 'opacity 0.4s' }}>
          Vibe coded by Maximiliano Cameron Mcmickle. AI model used: Google's Antigravity
        </div>

      </div>
    </div>



    {/* ── Import Result Modal ── */}
    {importResult && (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          background: "var(--bg1)", border: "1px solid var(--bdr)", borderRadius: 12,
          width: 560, maxHeight: "70vh", display: "flex", flexDirection: "column",
          overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.8)",
        }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--bdr)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#4ade80" }}>✅ {t("modals.import_complete")}</div>
              <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{importResult.title}</div>
            </div>
            <button onClick={() => setImportResult(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ overflowY: "auto", padding: "16px 22px", flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 10 }}>
              {t("modals.import_log")} — {importResult.warnings.length} messages
            </div>
            {importResult.warnings.map((w, i) => (
              <div key={i} style={{
                fontSize: 11, lineHeight: 1.6, padding: "4px 0",
                color: i === 0 ? "#4ade80" : w.startsWith("Jump") || w.startsWith("Choice") || w.startsWith("Variable") ? "var(--warn)" : "var(--dim)",
                borderBottom: i === 0 ? "1px solid var(--bdr)" : "none",
                fontWeight: i === 0 ? 600 : 400,
                fontFamily: i === 0 ? "inherit" : "var(--mono)",
              }}>
                {w}
              </div>
            ))}
          </div>
          <div style={{ padding: "14px 22px", borderTop: "1px solid var(--bdr)", display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-accent" onClick={() => setImportResult(null)}>
              {t("modals.open_in_editor")} →
            </button>
          </div>
        </div>
      </div>
    )}



    {/* ── Final Delete Warning Modal ── */}
    {confirmDelete && (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)", zIndex: 400,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          background: "#0d0505", border: "1px solid rgba(239,68,68,0.5)",
          borderRadius: 14, width: 460, boxShadow: "0 0 60px rgba(239,68,68,0.2), 0 24px 80px rgba(0,0,0,.95)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid rgba(239,68,68,0.2)", display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#ef4444" }}>⚠ {t("modals.delete_confirm_title")}?</div>
              <div style={{ fontSize: 12, color: "rgba(239,68,68,0.7)", marginTop: 2 }}>{confirmDelete.title}</div>
            </div>
          </div>
          {/* Body */}
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#f1f5f9", lineHeight: 1.7 }}>
              {t("modals.delete_confirm_text")}
            </div>
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, letterSpacing: ".10em", color: "rgba(239,68,68,0.6)", fontWeight: 700, marginBottom: 6 }}>FOLDER TO BE DELETED</div>
              <div
                style={{ fontSize: 12, color: "#ef4444", fontFamily: "var(--mono)", overflowX: "auto", whiteSpace: "nowrap", cursor: "grab", userSelect: "none" }}
                onMouseDown={e => {
                  const el = e.currentTarget; let startX = e.pageX; let scrollLeft = el.scrollLeft;
                  const onMove = (ev: MouseEvent) => { el.scrollLeft = scrollLeft - (ev.pageX - startX); };
                  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); el.style.cursor = 'grab'; };
                  el.style.cursor = 'grabbing';
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              >
                {confirmDelete.folder}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "rgba(239,68,68,0.7)", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0 }}>⚠</span>
              <span>{t("modals.delete_confirm_warning")}</span>
            </div>
          </div>
          {/* Footer */}
          <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(239,68,68,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)} style={{ fontSize: 13 }}>← {t("wizard.btn_back")}</button>
            <button
              onClick={async () => {
                try {
                  await deleteProjectFolder(confirmDelete.folder);
                  setProjects(projects.filter(p => p.path !== confirmDelete.path));
                } catch (e) {
                  alert("Delete failed: " + String(e));
                } finally {
                  setConfirmDelete(null);
                }
              }}
              style={{ background: "#ef4444", color: "#fff", padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
            >
              {t("modals.btn_delete")}
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
}
