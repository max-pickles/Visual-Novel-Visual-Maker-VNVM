/**
 * StartScreen.tsx — App launch screen.
 * Handles opening and creating projects, and recent files list.
 */
import { useState, useEffect } from "react";
import { loadVnvProject, saveVnvProject, scaffoldNewProject, applyProjectTheme, projectRootInGamesDir, readRpyFolder, showInExplorer, deleteProjectFolder, copyDirRecursive, getGamesDir, validateRenpyProject, listAssetFiles, listDirEntries, ProjectFileMissingError, pathExists, dirHasFiles, samePath } from "./tauriApi";
import { newProject, newDemoProject } from "./types";
import { importFromRpyFiles } from "./rpyImporter";
import type { VNProject } from "./types";

import type { AppPrefs } from "./App";
import { useTranslation } from "./translationContext";
import { PreferencesPanel, LanguagePanel } from "./PreferencesPanel";
import { NewProjectWizard, useNewProjectWizard } from "./NewProjectWizard";

interface Props {
  onLoadVnv: (project: VNProject) => void;
  prefs: AppPrefs;
}

export function StartScreen({ onLoadVnv, prefs }: Props) {
  const { t } = useTranslation();
  const { bgLevel, glowEnabled, scanlinesEnabled, uiScale, language, setLanguage } = prefs;
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

  // Kept here rather than in the wizard so its fields survive leaving and reopening it
  const wizard = useNewProjectWizard();
  const { newTitle, newAuthor, newRes, newAccent, newBg, newTemplate, setWizardStep } = wizard;
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
      getGamesDir().then(listDirEntries).then(entries => {
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

      // Step 2 — Copy entire source folder into GAMES_DIR (unless it's already there).
      // Never copy over a different folder that happens to have the same name.
      const destRoot = `${await getGamesDir()}/${folderName}`;
      const vnvPath  = `${destRoot}/project.vnvmaker`;
      if (!samePath(srcNorm, destRoot)) {
        if (await dirHasFiles(destRoot)) {
          alert(`❌ Cannot import — your games folder already has a folder named "${folderName}". Rename or move it first.`);
          setLoading(false);
          return;
        }
        await copyDirRecursive(srcNorm, destRoot);
      }

      // Already a VNVMaker project: open it rather than re-importing over it.
      if (await pathExists(vnvPath)) {
        const existing = await loadVnvProject(vnvPath);
        setLoading(false);
        onLoadVnv(existing);
        return;
      }

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
      // Remember which scripts came from the original game, so export can replace
      // them with the compiled story while keeping scripts added later.
      const rpyRel = rpyRoot.slice(destRoot.length).replace(/^\/+/, "");
      project.imported_scripts = files.map(f => (rpyRel ? `${rpyRel}/${f.name}` : f.name));

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
      } catch (loadErr) {
        // Only a missing project file means "Ren'Py game that hasn't been imported
        // yet". A damaged one must never be replaced by a fresh import.
        if (!(loadErr instanceof ProjectFileMissingError)) throw loadErr;
        const folder = p.path.replace(/\/[^/]+$/, ""); // parent dir
        const files = await readRpyFolder(folder);
        const images = await listAssetFiles(folder, "images");
        const { project } = importFromRpyFiles(files, folder, p.title, "Author", images);
        project._rootPath = folder;
        project._filePath = p.path;
        project.imported_scripts = files.map(f => f.name);
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
        
      const rootPath = await projectRootInGamesDir(newTitle);
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
      {scanlinesEnabled && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, color-mix(in srgb, var(--teal) 1.2%, transparent) 2px, color-mix(in srgb, var(--teal) 1.2%, transparent) 4px)', pointerEvents: 'none', opacity: 0.6, zIndex: 0 }} />}
      {/* Left Sidebar Menu */}
      <div style={{ 
        width: 240, borderRight: '1px solid rgba(var(--teal-rgb,0,212,200),0.12)', 
        display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative', 
        background: 'var(--bg1)', overflow: 'hidden', zIndex: 1,
        transform: showCredits ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Sidebar glow */}
        <div style={{ position: 'absolute', bottom: -80, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--teal) 6%, transparent) 0%, transparent 70%)', pointerEvents: 'none' }} />
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
            <div style={{ position: 'absolute', top: '5%', left: '10%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--acc) 18%, transparent) 0%, transparent 65%)', filter: 'blur(30px)' }} />
            <div style={{ position: 'absolute', bottom: '5%', right: '5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--teal) 14%, transparent) 0%, transparent 65%)', filter: 'blur(30px)' }} />
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
          <PreferencesPanel prefs={prefs} windowMode={windowMode} setWindowMode={setWindowMode} onOpenLanguage={() => setActiveTab('language')} />
        ) : activeTab === 'language' ? (
          <LanguagePanel language={language} setLanguage={setLanguage} onBack={() => setActiveTab('preferences')} />
        ) : (
          <NewProjectWizard wizard={wizard} onCreate={handleCreateNew} onCancel={() => setActiveTab('open')} />
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
