const fs = require('fs');

const oldContent = fs.readFileSync('src/ExportPanel.tsx.bak', 'utf8');

const newContent = `
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { VNProject } from "./types";
import { compileProject, getProjectStats } from "./compiler";
import { 
  exportToSdk, pickSavePath, writeTextFile, listAssetFiles, deleteFile, getRpyFiles, readRpyFile,
  distributeRenpyBuild, findRenpySdk 
} from "./tauriApi";
import { validateProject } from "./validator";
import { ToastManager } from "./toastContext";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Props {
  project: VNProject;
}

type Status = 
  | { type: "idle"; msg: string }
  | { type: "running"; msg: string }
  | { type: "ok"; msg: string }
  | { type: "err"; msg: string };

type BuildStatus = "idle" | "building" | "ok" | "err";

interface PlatformTarget {
  id: string;
  label: string;
  icon: string;
  package: string;
  description: string;
  note?: string;
  color: string;
}

const PLATFORMS: PlatformTarget[] = [
  { id: "pc", label: "Windows + Linux", icon: "🖥️", package: "pc", description: "Combined PC package. Creates a .zip for Windows and a .tar.bz2 for Linux.", color: "var(--acc)" },
  { id: "win", label: "Windows Only", icon: "🪟", package: "win", description: "Windows-only .zip with a .exe launcher.", color: "#60a5fa" },
  { id: "linux", label: "Linux Only", icon: "🐧", package: "linux", description: "Linux-only .tar.bz2 archive.", color: "#4ade80" },
  { id: "mac", label: "macOS", icon: "🍎", package: "mac", description: "macOS .app bundle zipped for distribution.", note: "Requires building on macOS or an Apple-signed Ren'Py SDK.", color: "#e2e8f0" },
  { id: "android", label: "Android APK", icon: "🤖", package: "android", description: "Android .apk — requires the Ren'Py Android SDK (RAPT) to be installed.", note: "Requires Android SDK, JDK, and RAPT setup via Ren'Py Launcher first.", color: "#86efac" },
  { id: "web", label: "Web / HTML5", icon: "🌐", package: "web", description: "Browser-playable HTML5 package. Requires the Ren'Py web build tool.", color: "#f97316" },
];

interface TargetBuildState {
  status: BuildStatus;
  log: string;
  outputPath?: string;
}

export function ExportPanel({ project }: Props) {
  const [exportName, setExportName] = useState(
    (project.title || "MyVN").replace(/[^a-zA-Z0-9_\\-]/g, "_")
  );
  const [previewScripts, setPreviewScripts] = useState<{ filename: string, content: string }[] | null>(null);
  const [selectedScript, setSelectedScript] = useState<string>("script.rpy");
  const [status, setStatus] = useState<Status>({ type: "idle", msg: "" });
  const [activeTab, setActiveTab] = useState<"options" | "preview" | "build_log">("options");
  const [unusedAssets, setUnusedAssets] = useState<string[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Distribute State
  const [sdkPath, setSdkPath]       = useState<string>(() => localStorage.getItem("vnv_sdk_path") ?? "");
  const [outputDir, setOutputDir]   = useState<string>(() => localStorage.getItem("vnv_dist_output") ?? "");
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [buildStates, setBuildStates] = useState<Record<string, TargetBuildState>>(() =>
    Object.fromEntries(PLATFORMS.map(p => [p.id, { status: "idle", log: "" }]))
  );
  const [activeLog, setActiveLog]   = useState<string>("pc");
  const logRef                      = useRef<HTMLPreElement>(null);

  const stats = useMemo(() => getProjectStats(project), [project]);
  const validation = useMemo(() => validateProject(project), [project]);
  const rootPath = project._rootPath ?? "";

  const setRun = (msg: string) => setStatus({ type: "running", msg });
  const setOk = (msg: string) => setStatus({ type: "ok", msg });
  const setErr = (msg: string) => setStatus({ type: "err", msg });

  const setBuildState = useCallback((id: string, patch: Partial<TargetBuildState>) => {
    setBuildStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  useEffect(() => {
    if (logRef.current && activeTab === "build_log") {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [buildStates[activeLog]?.log, activeTab]);

  const handleScanAssets = useCallback(async () => {
    if (!rootPath) { ToastManager.error("No project folder found to scan."); return; }
    try {
      const referenced = new Set<string>();
      if (project.cover) referenced.add(project.cover);
      project.characters.forEach(c => { if (c.avatar) referenced.add(c.avatar); });
      project.scenes.forEach(s => {
        if (s.bg) referenced.add(s.bg);
        s.events?.forEach(e => {
          if (e.charPose) referenced.add(e.charPose);
          if (e.voice) referenced.add(e.voice);
          if (e.bg) referenced.add(e.bg);
          if (e.audio) referenced.add(e.audio);
        });
      });
      const allFiles = await listAssetFiles(rootPath, "images");
      const allAudio = await listAssetFiles(rootPath, "audio");
      const unused: string[] = [];
      for (const f of [...allFiles, ...allAudio]) {
        if (!referenced.has(f) && !f.includes("gui/")) {
          unused.push(f);
        }
      }
      setUnusedAssets(unused);
      if (unused.length === 0) ToastManager.info("Project is perfectly clean! No unused assets found.");
    } catch (e) { console.error(e); ToastManager.error("Asset scan failed"); }
  }, [project, rootPath]);

  const handleClean = useCallback(async () => {
    let deleted = 0;
    for (const f of unusedAssets) {
      try {
        await deleteFile(\`\${rootPath}/game/\${f}\`);
        deleted++;
      } catch (e) { console.error(\`Failed to delete \${f}\`); }
    }
    setUnusedAssets([]);
    setShowConfirmModal(false);
    ToastManager.success(\`Cleaned \${deleted} unused assets\`);
  }, [unusedAssets, rootPath]);

  const handlePreview = useCallback(async () => {
    try {
      setRun("Compiling script...");
      const script = compileProject(project, { asExport: true });
      const scripts = [{ filename: "script.rpy", content: script }];

      if (rootPath) {
        try {
          const files = await getRpyFiles(rootPath);
          for (const file of files) {
            const filename = file.split('/').pop() || file;
            if (filename === "script.rpy" || filename === "vnv_preview.rpy") continue;
            const content = await readRpyFile(\`\${rootPath.replace(/\\\\/g, '/')}/\${file}\`);
            scripts.push({ filename, content });
          }
        } catch (e) {
          console.warn("Could not load other .rpy files", e);
        }
      }

      setPreviewScripts(scripts);
      setSelectedScript("script.rpy");
      setActiveTab("preview");
      setStatus({ type: "idle", msg: "" });
    } catch (e) { setErr(String(e)); }
  }, [project, rootPath]);

  const handleSaveRpy = useCallback(async () => {
    try {
      const script = compileProject(project, { asExport: true });
      const path = await pickSavePath("Save .rpy script", "script.rpy", ["rpy"]);
      if (path) {
        await writeTextFile(path, script);
        ToastManager.success("Saved script.rpy successfully");
      }
    } catch (e) { ToastManager.error(String(e)); }
  }, [project]);

  const handleExportSdk = useCallback(async () => {
    if (!validation.ok) { setErr("Cannot export project with errors."); return; }
    try {
      setRun("Creating standalone SDK export...");
      const script = compileProject(project, { asExport: true });
      const res = await exportToSdk(script, exportName, project.title || "MyVN", rootPath);
      setOk(\`Exported to \${res}\`);
      ToastManager.success(\`Project exported to SDK as \${exportName}\`);
    } catch (e) { setErr(String(e)); }
  }, [project, validation, exportName, rootPath]);

  const handleAutoDetect = useCallback(async () => {
    setAutoDetecting(true);
    try {
      const found = await findRenpySdk(sdkPath || null);
      if (found) {
        setSdkPath(found);
        localStorage.setItem("vnv_sdk_path", found);
        ToastManager.success("SDK found: " + (found.split("/").pop() || ""));
      } else { ToastManager.error("SDK not found"); }
    } catch (e) { ToastManager.error(String(e)); } finally { setAutoDetecting(false); }
  }, [sdkPath]);

  const handleBuild = useCallback(async (platform: PlatformTarget) => {
    if (!rootPath) { ToastManager.error("No project loaded"); return; }
    if (!validation.ok) { ToastManager.error("Fix validation errors first"); return; }

    setBuildState(platform.id, { status: "building", log: \`⟳ Starting \${platform.label} build...\\n\` });
    setActiveLog(platform.id);
    setActiveTab("build_log");
    localStorage.setItem("vnv_sdk_path", sdkPath);
    localStorage.setItem("vnv_dist_output", outputDir);

    try {
      const script = compileProject(project, { asExport: true });
      await writeTextFile(\`\${rootPath}/game/script.rpy\`, script);
      setBuildState(platform.id, {
        log: buildStates[platform.id].log + \`✓ Compiled script.rpy (\${script.split("\\n").length} lines)\\n\`,
      });
    } catch (e) {
      setBuildState(platform.id, { status: "err", log: \`✗ Compile failed: \${String(e)}\` });
      return;
    }

    try {
      const eventName = \`distribute-log-\${platform.package}\`;
      const unlisten = await listen<string>(eventName, (event) => {
        setBuildStates(prev => ({
          ...prev,
          [platform.id]: {
            ...prev[platform.id],
            log: prev[platform.id].log + event.payload,
          }
        }));
      });

      await distributeRenpyBuild(rootPath, platform.package, sdkPath || null, outputDir || null);
      unlisten();
      
      setBuildStates(prev => ({
        ...prev,
        [platform.id]: {
          status: "ok",
          log: prev[platform.id].log + \`\\n✓ \${platform.label} build complete!\\n\`,
          outputPath: outputDir || rootPath,
        }
      }));
      ToastManager.success(\`\${platform.label} build complete\`);
    } catch (err) {
      setBuildStates(prev => ({
        ...prev,
        [platform.id]: {
          status: "err",
          log: prev[platform.id].log + \`\\n✗ Build failed:\\n\\n\${String(err)}\`,
        }
      }));
      ToastManager.error(\`\${platform.label} build failed\`);
    }
  }, [rootPath, validation, project, sdkPath, outputDir, buildStates, setBuildState]);

  const currentLog = buildStates[activeLog];
  const activePlatform = PLATFORMS.find(p => p.id === activeLog)!;

  const statusIcon = (s: BuildStatus) => s === "building" ? "⟳" : s === "ok" ? "✓" : s === "err" ? "✗" : "";
  const statusColor = (s: BuildStatus) => s === "building" ? "var(--warn)" : s === "ok" ? "var(--ok)" : s === "err" ? "var(--err)" : "var(--dim)";

  return (
    <div className="col" style={{ height: "100%", overflow: "hidden", minHeight: 0 }}>
      <style>{\`
        @keyframes export-glow {
          0%, 100% { box-shadow: 0 0 10px color-mix(in srgb, var(--acc) 30%, transparent); }
          50%      { box-shadow: 0 0 25px color-mix(in srgb, var(--acc) 70%, transparent); }
        }
      \`}</style>
      <div className="sec-hdr">EXPORT & DISTRIBUTE</div>

      <div className="row" style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* ── Left panel (Scrollable) ── */}
        <div style={{ width: 420, flexShrink: 0, borderRight: "1px solid var(--bdr)", background: "var(--bg1)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="col vnv-scroll" style={{ padding: "32px", paddingBottom: "64px", gap: 32, overflowY: "auto", flex: 1, minHeight: 0 }}>

            {/* Project Stats card */}
            <div className="card col gap12" style={{
              background: "color-mix(in srgb, var(--bg2) 60%, transparent)",
              border: "1px solid color-mix(in srgb, var(--bdr) 50%, transparent)"
            }}>
              <div className="label">PROJECT SUMMARY</div>
              <div className="row gap24">
                <div className="col gap4">
                  <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 700, letterSpacing: "0.05em" }}>TOTAL EVENTS</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{stats.events}</span>
                </div>
                <div className="col gap4">
                  <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 700, letterSpacing: "0.05em" }}>DIALOGUE LINES</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{stats.dialogueLines}</span>
                </div>
              </div>
              <div className="row gap24">
                <div className="col gap4">
                  <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 700, letterSpacing: "0.05em" }}>CHOICE POINTS</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{stats.choicePoints}</span>
                </div>
                <div className="col gap4">
                  <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 700, letterSpacing: "0.05em" }}>MUSIC TRACKS</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{stats.musicTracks}</span>
                </div>
              </div>
            </div>

            {/* Asset Optimization */}
            <div className="col gap12">
              <div className="label">ASSET OPTIMIZATION</div>
              {unusedAssets.length > 0 ? (
                <div className="card col gap12" style={{ border: "1px solid var(--warn)", background: "rgba(245, 158, 11, 0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--warn)", fontSize: 13, fontWeight: 700 }}>
                    <span>🗑</span> Found {unusedAssets.length} unused assets
                  </div>
                  <button className="btn" style={{ background: "color-mix(in srgb, var(--err) 15%, transparent)", color: "var(--err)" }} onClick={() => setShowConfirmModal(true)}>
                    Clean {unusedAssets.length} Unused Files
                  </button>
                </div>
              ) : (
                <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ok)", fontSize: 12 }}>
                  <span style={{ fontSize: 18 }}>✨</span> No unused assets found. Clean!
                </div>
              )}
              <button className="btn btn-ghost" style={{ fontSize: 11, alignSelf: "flex-start" }} onClick={handleScanAssets}>
                Scan for unused assets
              </button>
            </div>

            {/* Compile to .RPY */}
            <div className="col gap12">
              <div className="label">COMPILE TO .RPY</div>
              <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
                Generate a standalone .rpy script you can paste into any Ren'Py project.
              </div>
              <div className="row gap12" style={{ alignItems: "center" }}>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={handlePreview}>
                  👁 Preview Script
                </button>
                <button className="btn" style={{ background: "var(--acc)", color: "#000", fontWeight: 700 }} onClick={handleSaveRpy}>
                  💾 Save .rpy
                </button>
              </div>
            </div>

            {/* Standalone Export */}
            <div className="col gap12" style={{ paddingTop: 20, borderTop: "1px dashed var(--bdr)" }}>
              <div className="label">STANDALONE EXPORT (SDK)</div>
              <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
                Creates a complete ready-to-play Ren'Py game folder inside your SDK.
              </div>
              <div className="col gap8">
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text)" }}>PROJECT FOLDER NAME</div>
                <input
                  className="input"
                  style={{ fontSize: 14, padding: "10px 14px", fontFamily: "var(--mono)" }}
                  value={exportName}
                  onChange={e => setExportName(e.target.value.replace(/[^a-zA-Z0-9_\\-]/g, "_"))}
                  placeholder="my_visual_novel"
                />
              </div>
              <button
                className="btn"
                disabled={!validation.ok || status.type === 'running' || !rootPath}
                onClick={handleExportSdk}
                style={{
                  height: 44, fontSize: 13, fontWeight: 700,
                  background: validation.ok && status.type !== 'running' ? 'var(--acc)' : 'rgba(255,255,255,0.05)',
                  color: validation.ok && status.type !== 'running' ? '#000' : 'var(--faint)',
                  border: validation.ok && status.type !== 'running' ? 'none' : '1px solid var(--bdr)',
                  boxShadow: validation.ok && status.type !== 'running' ? '0 0 20px color-mix(in srgb, var(--acc) 30%, transparent)' : 'none',
                  animation: validation.ok && status.type !== 'running' ? 'export-glow 2.5s ease-in-out infinite' : 'none',
                  cursor: validation.ok ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                }}
              >
                {status.type === 'running' ? 'Creating Export...' : '🚀 Export to SDK'}
              </button>
            </div>

            {/* Ren'Py SDK Config */}
            <div className="col gap12" style={{ paddingTop: 20, borderTop: "1px dashed var(--bdr)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="label">REN'PY SDK CONFIG</div>
                <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 8px" }} onClick={handleAutoDetect} disabled={autoDetecting}>
                  {autoDetecting ? "Detecting…" : "Auto-Detect"}
                </button>
              </div>
              <div className="col gap4">
                <div style={{ fontSize: 10, color: "var(--dim)" }}>SDK Executable (renpy.exe / renpy.sh)</div>
                <input className="input mono" style={{ fontSize: 11 }} value={sdkPath} onChange={e => setSdkPath(e.target.value)} placeholder="e.g. C:/renpy-8.5/renpy.exe" />
              </div>
              <div className="col gap4">
                <div style={{ fontSize: 10, color: "var(--dim)" }}>Build Output Directory (optional)</div>
                <input className="input mono" style={{ fontSize: 11 }} value={outputDir} onChange={e => setOutputDir(e.target.value)} placeholder="Leave blank to use Ren'Py default" />
              </div>
              {!sdkPath && (
                <div style={{ fontSize: 11, color: "var(--warn)", background: "rgba(245,158,11,0.08)", padding: "8px 10px", borderRadius: 6, lineHeight: 1.5 }}>
                  ⚠ No SDK path set. Click <strong>Auto-Detect</strong> or enter the path to <code>renpy.exe</code>.
                </div>
              )}
            </div>

            {/* Platform Distribution Targets */}
            <div className="col gap12" style={{ paddingBottom: 20 }}>
              <div className="label">PLATFORM TARGETS (DISTRIBUTE)</div>
              {PLATFORMS.map(platform => {
                const state = buildStates[platform.id];
                const isBuilding = state.status === "building";
                const isActive = activeLog === platform.id;
                return (
                  <div key={platform.id} onClick={() => { setActiveLog(platform.id); setActiveTab("build_log"); }}
                    style={{
                      background: isActive ? \`color-mix(in srgb, \${platform.color} 8%, var(--bg2))\` : "var(--bg2)",
                      border: \`1px solid \${isActive ? platform.color : "var(--bdr)"}\`,
                      borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "all 0.15s",
                    }}>
                    <div className="row gap10" style={{ alignItems: "flex-start" }}>
                      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{platform.icon}</span>
                      <div className="col flex1" style={{ gap: 3, minWidth: 0 }}>
                        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{platform.label}</span>
                          {state.status !== "idle" && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(state.status) }}>
                              {statusIcon(state.status)} {state.status.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.4 }}>{platform.description}</div>
                      </div>
                    </div>
                    <button className="btn"
                      style={{
                        marginTop: 10, width: "100%", justifyContent: "center",
                        background: validation.ok && sdkPath && !isBuilding ? \`color-mix(in srgb, \${platform.color} 90%, transparent)\` : "rgba(255,255,255,0.04)",
                        color: validation.ok && sdkPath && !isBuilding ? "#000" : "var(--dim)",
                        border: "none", fontWeight: 700, fontSize: 12, opacity: isBuilding ? 0.7 : 1,
                        cursor: !validation.ok || !sdkPath || isBuilding ? "not-allowed" : "pointer",
                      }}
                      disabled={!validation.ok || !sdkPath || isBuilding}
                      onClick={e => { e.stopPropagation(); handleBuild(platform); }}
                    >
                      {isBuilding ? \`⟳ Building \${platform.label}…\` : \`Build \${platform.label}\`}
                    </button>
                    {state.status === "ok" && state.outputPath && (
                      <button className="btn btn-ghost" style={{ marginTop: 4, width: "100%", justifyContent: "center", fontSize: 11 }}
                        onClick={e => { e.stopPropagation(); void invoke("show_in_explorer", { path: state.outputPath }); }}>
                        📂 Open Output Folder
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Validations / Status Messages */}
            {!validation.ok && (
              <div className="col gap4" style={{ marginTop: -16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--err)" }}>Fix the following errors:</div>
                {validation.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--err)", padding: "4px 8px", background: "rgba(239, 68, 68, 0.1)", borderRadius: 4 }}>
                    {e.location && <strong>[{e.location}]</strong>} {e.message}
                  </div>
                ))}
              </div>
            )}
            {status.msg && (
              <div style={{
                marginTop: -16, fontSize: 11, fontWeight: 700, padding: "8px 12px", borderRadius: 6,
                background: status.type === "err" ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                color: status.type === "err" ? "var(--err)" : "var(--ok)",
                border: \`1px solid \${status.type === "err" ? "var(--err)" : "var(--ok)"}\`
              }}>
                {status.msg}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel (Tabs: Options, Preview, Build Log) ── */}
        <div className="col flex1" style={{ overflow: "hidden", background: "var(--bg0)" }}>
          <div className="row" style={{ background: "var(--bg1)", borderBottom: "1px solid var(--bdr)", padding: "0 16px" }}>
            {(["options", "preview", "build_log"] as const).map(tab => (
              <button key={tab}
                onClick={() => { if (tab === "preview" && !previewScripts) handlePreview(); else setActiveTab(tab); }}
                style={{
                  padding: "10px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
                  background: "transparent", border: "none", cursor: "pointer",
                  color: activeTab === tab ? "var(--teal)" : "var(--dim)",
                  borderBottom: activeTab === tab ? "2px solid var(--teal)" : "2px solid transparent",
                  textTransform: "uppercase",
                }}>
                {tab === "options" ? "⚙ Info" : tab === "preview" ? "📄 Script Preview" : "🖥️ Build Log"}
              </button>
            ))}
            {activeTab === "preview" && previewScripts && selectedScript && (
              <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 10, color: "var(--dim)", fontFamily: "var(--mono)" }}>
                {previewScripts.find(s => s.filename === selectedScript)?.content.split("\\n").length} lines · {((previewScripts.find(s => s.filename === selectedScript)?.content.length || 0) / 1024).toFixed(1)} KB
              </span>
            )}
            {activeTab === "build_log" && currentLog.status !== "idle" && (
              <div style={{ marginLeft: "auto", alignSelf: "center", display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{activePlatform.label}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12,
                  background: \`color-mix(in srgb, \${statusColor(currentLog.status)} 15%, transparent)\`,
                  color: statusColor(currentLog.status),
                  border: \`1px solid color-mix(in srgb, \${statusColor(currentLog.status)} 40%, transparent)\`,
                }}>
                  {statusIcon(currentLog.status)} {currentLog.status.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {activeTab === "preview" ? (
            previewScripts ? (
              <div className="col flex1" style={{ overflow: "hidden" }}>
                <div 
                  className="row vnv-scroll" 
                  style={{ background: "var(--bg2)", borderBottom: "1px solid var(--bdr)", overflowX: "auto", overflowY: "hidden", whiteSpace: "nowrap" }}
                  onWheel={e => { e.currentTarget.scrollLeft += e.deltaY; }}
                >
                  {previewScripts.map(script => (
                    <button key={script.filename} onClick={() => setSelectedScript(script.filename)}
                      style={{
                        padding: "8px 16px", fontSize: 11, fontFamily: "var(--mono)",
                        background: selectedScript === script.filename ? "var(--bg1)" : "transparent",
                        color: selectedScript === script.filename ? "var(--text)" : "var(--dim)",
                        border: "none", borderRight: "1px solid var(--bdr)",
                        borderBottom: selectedScript === script.filename ? "2px solid var(--acc2)" : "2px solid transparent",
                        cursor: "pointer"
                      }}
                    >
                      {script.filename}
                    </button>
                  ))}
                </div>
                <pre style={{
                  flex: 1, overflowY: "auto", padding: "14px 20px", fontFamily: "var(--mono)", fontSize: 12.5,
                  color: "var(--text)", lineHeight: 1.7, background: "var(--bg0)", margin: 0,
                }}>
                  {renderSyntaxHighlight(previewScripts.find(s => s.filename === selectedScript)?.content || "")}
                </pre>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "var(--faint)" }}>
                <span style={{ fontSize: 36 }}>📄</span>
                <span style={{ fontSize: 12 }}>Click "Preview Script" to compile and preview</span>
              </div>
            )
          ) : activeTab === "build_log" ? (
            currentLog.log ? (
              <pre ref={logRef} style={{
                flex: 1, overflowY: "auto", overflowX: "auto", padding: "20px 24px",
                fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.8,
                color: currentLog.status === "err" ? "#fca5a5" : "#a3e635",
                background: "var(--bg0)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {currentLog.log}
              </pre>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 40, textAlign: "center" }}>
                <span style={{ fontSize: 48, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.2))" }}>{activePlatform.icon}</span>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{activePlatform.label} Distribution</div>
                <div style={{ fontSize: 12, color: "var(--dim)", maxWidth: 300, lineHeight: 1.5 }}>
                  Click <strong>Build {activePlatform.label}</strong> in the left panel to compile your visual novel and bundle it for distribution.
                </div>
              </div>
            )
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
              <div className="card col gap12" style={{ maxWidth: 500 }}>
                <div className="label">HOW IT WORKS</div>
                <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.8 }}>
                  <p>VNVMaker compiles your project into a valid <strong style={{ color: "var(--text)" }}>Ren'Py .rpy script</strong> that can be run directly by the Ren'Py engine.</p>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, background: "var(--bg1)", padding: "10px 14px", borderRadius: 6, lineHeight: 2 }}>
                    <div><span style={{ color: "var(--teal)" }}>dialogue</span> → <span style={{ color: "var(--acc2)" }}>Character "text"</span></div>
                    <div><span style={{ color: "var(--teal)" }}>bg</span> → <span style={{ color: "var(--acc2)" }}>scene expression Transform(...)</span></div>
                    <div><span style={{ color: "var(--teal)" }}>music</span> → <span style={{ color: "var(--acc2)" }}>play music "path"</span></div>
                    <div><span style={{ color: "var(--teal)" }}>choice</span> → <span style={{ color: "var(--acc2)" }}>menu: ...</span></div>
                    <div><span style={{ color: "var(--teal)" }}>jump</span> → <span style={{ color: "var(--acc2)" }}>jump vns_scene_id</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Are You Sure Modal for Clean Assets */}
      {showConfirmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", animation: 'vnv-fade-slide-in 0.15s ease both' }}>
          <div className="col" style={{ width: 520, background: "var(--bg1)", borderRadius: 14, border: "1px solid var(--bdr)", overflow: "hidden", boxShadow: "0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)" }}>
            <div style={{ padding: "16px 20px", background: "color-mix(in srgb, var(--err) 15%, var(--bg2))", borderBottom: "1px solid color-mix(in srgb, var(--err) 30%, var(--bdr))", display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--err)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🗑</div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>Delete Unused Assets</div>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>This action cannot be undone</div>
              </div>
            </div>
            <div style={{ padding: 20, color: "var(--text)", fontSize: 13, lineHeight: 1.6 }}>
              <p style={{ marginBottom: 12 }}>Permanently delete <strong style={{ color: 'var(--err)' }}>{unusedAssets.length}</strong> files not referenced by any scene, character, or event?</p>
              <div style={{ background: "var(--bg0)", border: "1px solid var(--bdr)", borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                {unusedAssets.map(f => {
                  const ext = f.split('.').pop()?.toLowerCase() ?? '';
                  const icon = ['png','jpg','jpeg','webp','gif'].includes(ext) ? '🖼️' : ['mp3','ogg','wav','flac'].includes(ext) ? '🎵' : ['mp4','webm'].includes(ext) ? '🎬' : '📄';
                  const name = f.split('/').pop() ?? f;
                  return (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                      <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <span style={{ color: 'var(--faint)', flexShrink: 0, fontSize: 10 }}>{ext.toUpperCase()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="row" style={{ padding: "14px 20px", borderTop: "1px solid var(--bdr)", justifyContent: "flex-end", gap: 10, background: "var(--bg2)" }}>
              <button className="btn btn-ghost" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="btn" style={{ background: "var(--err)", color: "#fff", border: "1px solid color-mix(in srgb, var(--err) 70%, transparent)", fontWeight: 700, padding: '0 18px', height: 34, borderRadius: 8 }} onClick={handleClean}>
                Delete {unusedAssets.length} Files
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderSyntaxHighlight(script: string): React.ReactNode {
  return script.split("\\n").map((line, i) => {
    let color = "var(--text)";
    const trimmed = line.trimStart();
    if (trimmed.startsWith("##") || trimmed.startsWith("#")) color = "var(--dim)";
    else if (trimmed.startsWith("label ")) color = "var(--teal)";
    else if (trimmed.startsWith("define ")) color = "#c084fc";
    else if (trimmed.startsWith("default ")) color = "#fb923c";
    else if (trimmed.startsWith("init ") || trimmed === "init python:") color = "#fb923c";
    else if (trimmed.startsWith("$")) color = "#60a5fa";
    else if (trimmed.startsWith("scene ") || trimmed.startsWith("show ") || trimmed.startsWith("hide ")) color = "#4ade80";
    else if (trimmed.startsWith("play ") || trimmed.startsWith("stop ")) color = "#facc15";
    else if (trimmed.startsWith("with ")) color = "#e879f9";
    else if (trimmed.startsWith("menu:") || trimmed.startsWith("if ") || trimmed.startsWith("else:")) color = "#f472b6";
    else if (trimmed.startsWith("jump ") || trimmed.startsWith("call ") || trimmed.startsWith("return")) color = "#22d3ee";
    else if (trimmed.startsWith("pause ")) color = "var(--dim)";
    else if (trimmed.startsWith('"')) color = "#fbbf24";
    else if (/^\\s+[a-z_]+ "/.test(line)) color = "#93c5fd";
    return <span key={i} style={{ display: "block", color, minHeight: "1.2em" }}>{line || " "}</span>;
  });
}
\`;

fs.writeFileSync('src/ExportPanel.tsx', newContent);
console.log('Done rewriting ExportPanel.tsx');
