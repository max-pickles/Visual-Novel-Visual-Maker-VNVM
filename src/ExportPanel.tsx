import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { VNProject } from "./types";
import { compileProject, compileProjectToFiles, getProjectStats } from "./compiler";
import { 
  pickSavePath, writeTextFile, listAssetFiles, deleteFile, getRpyFiles, readRpyFile,
  findRenpySdk, launchRenpyLauncher, pickNewProjectFolder, copyDirRecursive
} from "./tauriApi";
import { validateProject } from "./validator";
import { ToastManager } from "./toastContext";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  project: VNProject;
}

type Status = 
  | { type: "idle"; msg: string }
  | { type: "running"; msg: string }
  | { type: "ok"; msg: string }
  | { type: "err"; msg: string };


export function ExportPanel({ project }: Props) {
  const [exportName, setExportName] = useState(
    (project.title || "MyVN").replace(/[^a-zA-Z0-9_\-]/g, "_")
  );
  const [previewScripts, setPreviewScripts] = useState<{ filename: string, content: string }[] | null>(null);
  const [selectedScript, setSelectedScript] = useState<string>("script.rpy");
  const [exportParentDir, setExportParentDir] = useState<string>(() => {
    return localStorage.getItem("vnv_export_parent_dir") || localStorage.getItem("pref_games_dir") || "";
  });
  const generatedScripts = useMemo(() => compileProjectToFiles(project), [project]);
  const [saveTarget, setSaveTarget] = useState("script.rpy");
  const [status, setStatus] = useState<Status>({ type: "idle", msg: "" });
  const [activeTab, setActiveTab] = useState<"options" | "preview">("options");
  const [unusedAssets, setUnusedAssets] = useState<string[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Distribute State
  const [sdkPath, setSdkPath]       = useState<string>(() => localStorage.getItem("vnv_sdk_path") ?? "");
  const [autoDetecting, setAutoDetecting] = useState(false);
  
  const stats = useMemo(() => getProjectStats(project), [project]);
  const validation = useMemo(() => validateProject(project), [project]);
  const rootPath = project._rootPath ?? "";

  const setRun = (msg: string) => setStatus({ type: "running", msg });
  const setOk = (msg: string) => setStatus({ type: "ok", msg });
  const setErr = (msg: string) => setStatus({ type: "err", msg });

  const handleScanAssets = useCallback(async () => {
    if (!rootPath) { ToastManager.error("No project folder found to scan."); return; }
    try {
      const referenced = new Set<string>();
      if (project.cover) referenced.add(project.cover);
      project.characters.forEach(c => { 
        Object.values(c.sprites).forEach(sprite => referenced.add(sprite));
      });
      project.scenes.forEach(s => {
        if (s.bg) referenced.add(s.bg);
        s.events?.forEach(e => {
          if ((e as any).charPose) referenced.add((e as any).charPose);
          if ((e as any).voice) referenced.add((e as any).voice);
          if ((e as any).bg) referenced.add((e as any).bg);
          if ((e as any).audio) referenced.add((e as any).audio);
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
        await deleteFile(`${rootPath}/game/${f}`);
        deleted++;
      } catch (e) { console.error(`Failed to delete ${f}`); }
    }
    setUnusedAssets([]);
    setShowConfirmModal(false);
    ToastManager.success(`Cleaned ${deleted} unused assets`);
  }, [unusedAssets, rootPath]);

  const handlePreview = useCallback(async (targetFilename?: string | React.MouseEvent) => {
    try {
      setRun("Compiling scripts...");
      const files = compileProjectToFiles(project);
      
      const scripts = files.map(f => ({ filename: f.filename, content: f.content }));

      if (rootPath) {
        try {
          const diskFiles = await getRpyFiles(rootPath);
          for (const file of diskFiles) {
            const filename = file.split('/').pop() || file;
            if (filename === "vnv_preview.rpy") continue;
            // Skip any generated script files that we already have in our list
            if (scripts.some(s => s.filename === filename)) continue;
            
            const content = await readRpyFile(`${rootPath.replace(/\\/g, '/')}/${file}`);
            scripts.push({ filename, content });
          }
        } catch (e) {
          console.warn("Could not load other .rpy files", e);
        }
      }

      setPreviewScripts(scripts);
      setSelectedScript(typeof targetFilename === "string" ? targetFilename : "script.rpy");
      setActiveTab("preview");
      setStatus({ type: "idle", msg: "" });
    } catch (e) { setErr(String(e)); }
  }, [project, rootPath]);

  const handleSaveRpy = useCallback(async () => {
    try {
      const scriptFile = generatedScripts.find(s => s.filename === saveTarget);
      if (!scriptFile) return;
      const path = await pickSavePath(scriptFile.filename);
      if (path) {
        await writeTextFile(path, scriptFile.content);
        ToastManager.success(`Saved ${scriptFile.filename} successfully`);
      }
    } catch (e) { ToastManager.error(String(e)); }
  }, [generatedScripts, saveTarget]);

  const handleExportProjectFolder = useCallback(async () => {
    if (!validation.ok) { setErr("Cannot export project with errors."); return; }
    if (!exportParentDir) { ToastManager.error("Please set an export destination folder."); return; }
    try {
      setRun("Exporting project folder...");
      const targetDir = `${exportParentDir.replace(/\\/g, "/")}/${exportName}`;
      
      // 1. Copy the entire project folder
      await copyDirRecursive(rootPath, targetDir);

      // 2. Clean up VNVMaker specific files in the copied folder
      try { await deleteFile(`${targetDir}/project.vnvmaker`); } catch (e) { /* ignore */ }
      try { await deleteFile(`${targetDir}/game/vnv_preview.rpy`); } catch (e) { /* ignore */ }

      // 3. Clean up old .rpy scripts in the game/ folder EXCEPT core gui/options
      try {
        const copiedRpyFiles = await getRpyFiles(targetDir);
        for (const file of copiedRpyFiles) {
          const filename = file.split("/").pop() || file;
          // Keep the core Ren'Py configuration and UI definitions
          if (filename !== "gui.rpy" && filename !== "options.rpy" && filename !== "screens.rpy") {
            await deleteFile(`${targetDir.replace(/\\/g, '/')}/${file}`);
          }
        }
      } catch (e) {
        console.warn("Failed to clean up old .rpy files in export", e);
      }

      // 4. Generate and write out the separate multi-file scripts
      const newScripts = compileProjectToFiles(project);
      for (const script of newScripts) {
        await writeTextFile(`${targetDir}/game/${script.filename}`, script.content);
      }

      setOk(`Exported to ${targetDir}`);
      ToastManager.success(`Project exported to ${exportName}`);
      
      // Give them the option to open the exported folder
      setTimeout(() => {
        void invoke("show_in_explorer", { path: targetDir });
      }, 500);

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

  const handleLaunchRenpy = useCallback(async () => {
    if (!rootPath) { ToastManager.error("No project loaded"); return; }
    if (!sdkPath) { ToastManager.error("Set SDK path first"); return; }
    try {
      await launchRenpyLauncher(rootPath, sdkPath);
      ToastManager.success("Ren'Py Launcher opened");
    } catch (e) {
      ToastManager.error(String(e));
    }
  }, [rootPath, sdkPath]);
  return (
    <div className="col" style={{ height: "100%", overflow: "hidden", minHeight: 0 }}>
      <style>{`
        @keyframes export-glow {
          0%, 100% { box-shadow: 0 0 10px color-mix(in srgb, var(--acc) 30%, transparent); }
          50%      { box-shadow: 0 0 25px color-mix(in srgb, var(--acc) 70%, transparent); }
        }
      `}</style>
      <div className="sec-hdr">EXPORT & DISTRIBUTE</div>

      <div className="row" style={{ flex: 1, overflow: "hidden", minHeight: 0, alignItems: "stretch" }}>
        {/* ── Left panel (Scrollable) ── */}
        <div style={{ width: 420, flexShrink: 0, borderRight: "1px solid var(--bdr)", background: "var(--bg1)", display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
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
                  <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{stats.choices}</span>
                </div>
                <div className="col gap4">
                  <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 700, letterSpacing: "0.05em" }}>MUSIC TRACKS</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>{stats.music}</span>
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
              <div className="row gap12" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }} onClick={handlePreview}>
                  👁 Preview Script
                </button>
                <div className="row gap4" style={{ flex: 1, minWidth: 0 }}>
                  <select 
                    className="input mono" 
                    style={{ fontSize: 11, padding: "6px 10px", flex: 1, minWidth: 0 }}
                    value={saveTarget}
                    onChange={e => {
                      const val = e.target.value;
                      setSaveTarget(val);
                      if (!previewScripts) {
                        handlePreview(val);
                      } else {
                        setSelectedScript(val);
                        setActiveTab("preview");
                      }
                    }}
                  >
                    {generatedScripts.map(f => (
                      <option key={f.filename} value={f.filename}>{f.filename}</option>
                    ))}
                  </select>
                  <button className="btn" style={{ background: "var(--acc)", color: "#000", fontWeight: 700, padding: "6px 12px", flexShrink: 0 }} onClick={handleSaveRpy}>
                    💾 Save
                  </button>
                </div>
              </div>
            </div>

            {/* Standalone Export */}
            <div className="col gap12" style={{ paddingTop: 20, borderTop: "1px dashed var(--bdr)" }}>
              <div className="label">EXPORT REN'PY PROJECT FOLDER</div>
              <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
                Generates a complete, standard Ren'Py game folder that works seamlessly with the official Ren'Py launcher. Your game code will be beautifully organized into separate <code>.rpy</code> files.
              </div>
              <div className="col gap8">
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text)" }}>EXPORT DESTINATION</div>
                <div className="row gap8">
                  <input className="input" style={{ flex: 1, fontSize: 12, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--dim)' }} readOnly value={exportParentDir} />
                  <button className="btn btn-ghost" onClick={async () => {
                    const dir = await pickNewProjectFolder();
                    if (dir && typeof dir === 'string') {
                      const p = dir.replace(/\\/g, '/');
                      setExportParentDir(p);
                      localStorage.setItem("vnv_export_parent_dir", p);
                    }
                  }} style={{ fontSize: 12, padding: '0 16px', border: '1px solid var(--bdr)', borderRadius: 6 }}>Change</button>
                </div>
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
                onClick={handleExportProjectFolder}
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
                {status.type === 'running' ? 'Exporting...' : '🚀 Export Project Folder'}
              </button>
            </div>

            {/* Ren'Py SDK Config */}
            <div className="col gap12" style={{ paddingTop: 20, borderTop: "1px dashed var(--bdr)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="label">REN'PY SDK CONFIG</div>
              </div>
              <div className="col gap4">
                <div style={{ fontSize: 10, color: "var(--dim)" }}>SDK Executable (renpy.exe / renpy.sh)</div>
                <div className="row gap8">
                  <input className="input mono" style={{ flex: 1, fontSize: 11, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--dim)' }} value={sdkPath} onChange={e => {
                    const p = e.target.value;
                    setSdkPath(p);
                    localStorage.setItem("vnv_sdk_path", p);
                  }} placeholder="e.g. C:/renpy-8.5/renpy.exe" />
                  <button className="btn btn-ghost" onClick={async () => {
                    const { open } = await import('@tauri-apps/plugin-dialog');
                    const file = await open({ filters: [{ name: "Executable", extensions: ["exe", "sh", "py", "app"] }] });
                    if (file && typeof file === 'string') {
                      const p = file.replace(/\\/g, '/');
                      setSdkPath(p);
                      localStorage.setItem("vnv_sdk_path", p);
                    }
                  }} style={{ fontSize: 12, padding: '0 16px', border: '1px solid var(--bdr)', borderRadius: 6 }}>Find</button>
                </div>
              </div>
              {!sdkPath && (
                <div style={{ fontSize: 11, color: "var(--warn)", background: "rgba(245,158,11,0.08)", padding: "8px 10px", borderRadius: 6, lineHeight: 1.5 }}>
                  ⚠ No SDK path set. Enter the path to <code>renpy.exe</code>.
                </div>
              )}
            </div>

            {/* Official Ren'Py Launcher */}
            <div className="col gap12" style={{ paddingBottom: 10 }}>
              <div className="label">EXTERNAL EXPORT</div>
              <div className="card col gap12" style={{ background: "color-mix(in srgb, var(--bg2) 60%, transparent)", border: "1px solid color-mix(in srgb, var(--bdr) 50%, transparent)" }}>
                <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
                  Open your project directly in the official Ren'Py Launcher to use its native export and distribution tools.
                </div>
                <button className="btn"
                  style={{
                    height: 38, justifyContent: "center", fontWeight: 700, fontSize: 12,
                    background: sdkPath ? "color-mix(in srgb, var(--acc2) 20%, transparent)" : "rgba(255,255,255,0.04)",
                    color: sdkPath ? "var(--acc2)" : "var(--dim)",
                    border: `1px solid ${sdkPath ? "color-mix(in srgb, var(--acc2) 40%, transparent)" : "var(--bdr)"}`,
                    cursor: sdkPath ? "pointer" : "not-allowed",
                  }}
                  disabled={!sdkPath}
                  onClick={handleLaunchRenpy}
                >
                  🚀 Launch Ren'Py GUI
                </button>
              </div>
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
                border: `1px solid ${status.type === "err" ? "var(--err)" : "var(--ok)"}`
              }}>
                {status.msg}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel (Tabs: Options, Preview, Build Log) ── */}
        <div className="col flex1" style={{ overflow: "hidden", background: "var(--bg0)", height: "100%" }}>
          <div className="row" style={{ background: "var(--bg1)", borderBottom: "1px solid var(--bdr)", padding: "0 16px" }}>
            {(["options", "preview"] as const).map(tab => (
              <button key={tab}
                onClick={() => { if (tab === "preview" && !previewScripts) handlePreview(); else setActiveTab(tab); }}
                style={{
                  padding: "10px 16px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
                  background: "transparent", border: "none", cursor: "pointer",
                  color: activeTab === tab ? "var(--teal)" : "var(--dim)",
                  borderBottom: activeTab === tab ? "2px solid var(--teal)" : "2px solid transparent",
                  textTransform: "uppercase",
                }}>
                {tab === "options" ? "⚙ Info" : "📄 Script Preview"}
              </button>
            ))}
            {activeTab === "preview" && previewScripts && selectedScript && (
              <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 10, color: "var(--dim)", fontFamily: "var(--mono)" }}>
                {previewScripts.find(s => s.filename === selectedScript)?.content.split("\n").length} lines · {((previewScripts.find(s => s.filename === selectedScript)?.content.length || 0) / 1024).toFixed(1)} KB
              </span>
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
  return script.split("\n").map((line, i) => {
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
    else if (/^\s+[a-z_]+ "/.test(line)) color = "#93c5fd";
    return <span key={i} style={{ display: "block", color, minHeight: "1.2em" }}>{line || " "}</span>;
  });
}
