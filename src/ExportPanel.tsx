import React, { useState, useCallback, useMemo } from "react";
import type { VNProject } from "./types";
import { compileProjectToFiles, getProjectStats } from "./compiler";
import { 
  pickSavePath, writeTextFile, listAssetFiles, deleteFile, getRpyFiles, readRpyFile,
  launchRenpyLauncher, pickNewProjectFolder, copyDirRecursive,
  dirHasFiles, isSameOrInside, declaredNamesInGame, SDK_PATH_KEY, RENPY_LAUNCHER, EXAMPLE_SDK_DIR,
} from "./tauriApi";
import { isGeneratedScript, isReplacedByExport } from "./exportScripts";
import { collectAssetRefs, findUnusedAssets } from "./assetRefs";
import { validateProject } from "./validator";
import { ToastManager } from "./toastContext";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";

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
  /** Unused files from the last scan, relative to the project folder; null before scanning. */
  const [unusedAssets, setUnusedAssets] = useState<string[] | null>(null);
  const [assetTask, setAssetTask] = useState<"scan" | "clean" | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Distribute State
  // The same SDK setting Preferences and the scene editor use. Older versions kept a
  // separate one for this panel, so fall back to it.
  const [sdkPath, setSdkPath]       = useState<string>(() => localStorage.getItem(SDK_PATH_KEY) || localStorage.getItem("vnv_sdk_path") || "");
  
  const stats = useMemo(() => getProjectStats(project), [project]);
  const validation = useMemo(() => validateProject(project), [project]);
  const rootPath = project._rootPath ?? "";

  const setRun = (msg: string) => setStatus({ type: "running", msg });
  const setOk = (msg: string) => setStatus({ type: "ok", msg });
  const setErr = (msg: string) => setStatus({ type: "err", msg });

  /**
   * The files in game/images and game/audio that neither the project nor the
   * game's scripts use, relative to the project folder.
   */
  const scanUnusedAssets = useCallback(async (): Promise<string[]> => {
    const root = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const [images, audio, scriptPaths] = await Promise.all([
      listAssetFiles(root, "images"),
      listAssetFiles(root, "audio"),
      getRpyFiles(root),
    ]);
    // A script that can't be read could use any of the files, so it fails the scan.
    const scripts = await Promise.all(
      scriptPaths.map(async name => ({ name, content: await readRpyFile(`${root}/${name}`) })),
    );
    return findUnusedAssets([...images, ...audio], collectAssetRefs(project, scripts));
  }, [project, rootPath]);

  const handleScanAssets = useCallback(async () => {
    if (!rootPath) { ToastManager.error("No project folder found to scan."); return; }
    setAssetTask("scan");
    try {
      const unused = await scanUnusedAssets();
      setUnusedAssets(unused);
      if (unused.length === 0) ToastManager.info("Project is perfectly clean! No unused assets found.");
    } catch (e) {
      console.error(e);
      setUnusedAssets(null);
      ToastManager.error("Asset scan failed", String(e));
    } finally {
      setAssetTask(null);
    }
  }, [rootPath, scanUnusedAssets]);

  const handleClean = useCallback(async () => {
    if (!unusedAssets?.length) return;
    setAssetTask("clean");
    try {
      // Check again first: the project or its scripts may have started using
      // a file since the scan.
      const stillUnused = new Set(await scanUnusedAssets());
      const root = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
      let deleted = 0, nowUsed = 0;
      const failed: string[] = [];
      for (const f of unusedAssets) {
        if (!stillUnused.has(f)) { nowUsed++; continue; }
        try {
          await deleteFile(`${root}/${f}`);
          deleted++;
        } catch (e) {
          console.error(`Failed to delete ${f}`, e);
          failed.push(f);
        }
      }
      setUnusedAssets(failed);
      if (deleted > 0) ToastManager.success(`Deleted ${deleted} unused asset${deleted === 1 ? "" : "s"}`);
      if (nowUsed > 0) ToastManager.info(`Kept ${nowUsed} file${nowUsed === 1 ? "" : "s"} the project started using since the scan`);
      if (failed.length > 0) ToastManager.error(`Couldn't delete ${failed.length} file${failed.length === 1 ? "" : "s"}`, failed.join("\n"));
    } catch (e) {
      console.error(e);
      ToastManager.error("Asset scan failed, so nothing was deleted", String(e));
    } finally {
      setAssetTask(null);
      setShowConfirmModal(false);
    }
  }, [unusedAssets, rootPath, scanUnusedAssets]);

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
      const picked = await pickSavePath(scriptFile.filename);
      if (picked) {
        const path = /\.rpy$/i.test(picked) ? picked : `${picked}.rpy`;
        await writeTextFile(path, scriptFile.content);
        ToastManager.success(`Saved ${scriptFile.filename} successfully`);
      }
    } catch (e) { ToastManager.error(String(e)); }
  }, [generatedScripts, saveTarget]);

  const handleExportProjectFolder = useCallback(async () => {
    if (!validation.ok) { setErr("Cannot export project with errors."); return; }
    if (!exportParentDir) { ToastManager.error("Please set an export destination folder."); return; }
    const targetDir = `${exportParentDir.replace(/\\/g, "/").replace(/\/+$/, "")}/${exportName}`;

    // The export clears VNVMaker's files and old scripts out of the copy, so it
    // must never run on the project itself or on a folder that contains it.
    if (!rootPath || isSameOrInside(targetDir, rootPath) || isSameOrInside(rootPath, targetDir)) {
      setErr("Choose an export folder outside the project folder.");
      return;
    }
    try {
      const targetExists = await dirHasFiles(targetDir);
      if (targetExists) {
        const overwrite = await ask(
          `${targetDir} already exists. Replace the exported game in it?`,
          { title: "Export project", kind: "warning" },
        );
        if (!overwrite) return;
      }
      setRun("Exporting project folder...");
      const sourceScripts = await getRpyFiles(rootPath);

      // 1. Copy the entire project folder
      await copyDirRecursive(rootPath, targetDir);

      // 2. Clean up VNVMaker specific files in the copied folder
      try { await deleteFile(`${targetDir}/project.vnvmaker`); } catch (e) { /* ignore */ }
      try { await deleteFile(`${targetDir}/game/vnv_preview.rpy`); } catch (e) { /* ignore */ }

      // 3. Remove the scripts the compiled story replaces: generated ones, scripts
      //    that came with an imported game, and scene files left by an earlier export.
      const replaced = sourceScripts.filter(f => isReplacedByExport(f, project.imported_scripts));
      const staleScenes = targetExists
        ? (await getRpyFiles(targetDir)).filter(f => isGeneratedScript(f) && !replaced.includes(f))
        : [];
      for (const file of [...replaced, ...staleScenes]) {
        try {
          await deleteFile(`${targetDir}/${file}`);
        } catch (e) {
          console.warn(`Failed to remove ${file} from the export`, e);
        }
      }

      // 4. Generate and write out the separate multi-file scripts, leaving out
      //    defaults, and avoiding labels, that the scripts kept in the export
      //    already declare
      const declared = await declaredNamesInGame(targetDir);
      const newScripts = compileProjectToFiles(project, { declaredElsewhere: declared.vars, labelsElsewhere: declared.labels });
      for (const script of newScripts) {
        await writeTextFile(`${targetDir}/game/${script.filename}`, script.content);
      }

      const dropped = replaced.filter(f => !isGeneratedScript(f));
      setOk(dropped.length
        ? `Exported to ${targetDir}. Replaced by the compiled story: ${dropped.join(", ")}`
        : `Exported to ${targetDir}`);
      ToastManager.success(`Project exported to ${exportName}`);
      
      // Give them the option to open the exported folder
      setTimeout(() => {
        void invoke("show_in_explorer", { path: targetDir });
      }, 500);

    } catch (e) { setErr(String(e)); }
  }, [project, validation, exportName, exportParentDir, rootPath]);

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
              {unusedAssets === null ? (
                <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
                  Find images and audio in game/images and game/audio that nothing in the project or its scripts uses.
                </div>
              ) : unusedAssets.length > 0 ? (
                <div className="card col gap12" style={{ border: "1px solid var(--warn)", background: "color-mix(in srgb, var(--warn) 5%, transparent)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--warn)", fontSize: 13, fontWeight: 700 }}>
                    <span>🗑</span> Found {unusedAssets.length} unused assets
                  </div>
                  <button className="btn" style={{ background: "color-mix(in srgb, var(--err) 15%, transparent)", color: "var(--err)" }}
                    disabled={assetTask !== null} onClick={() => setShowConfirmModal(true)}>
                    Clean {unusedAssets.length} Unused Files
                  </button>
                </div>
              ) : (
                <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ok)", fontSize: 12 }}>
                  <span style={{ fontSize: 18 }}>✨</span> No unused assets found. Clean!
                </div>
              )}
              <button className="btn btn-ghost" style={{ fontSize: 11, alignSelf: "flex-start" }} disabled={assetTask !== null} onClick={handleScanAssets}>
                {assetTask === "scan" ? "Scanning…" : "Scan for unused assets"}
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
                  <button className="btn" style={{ background: "var(--acc)", color: "var(--bg0)", fontWeight: 700, padding: "6px 12px", flexShrink: 0 }} onClick={handleSaveRpy}>
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
                  <input className="input" style={{ flex: 1, fontSize: 12, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 6, color: 'var(--dim)' }} readOnly value={exportParentDir} />
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
                  background: validation.ok && status.type !== 'running' ? 'var(--acc)' : 'color-mix(in srgb, var(--text) 5%, transparent)',
                  color: validation.ok && status.type !== 'running' ? 'var(--bg0)' : 'var(--faint)',
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
                <div style={{ fontSize: 10, color: "var(--dim)" }}>SDK folder, or renpy.exe / renpy.sh</div>
                <div className="row gap8">
                  <input className="input mono" style={{ flex: 1, fontSize: 11, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 6, color: 'var(--dim)' }} value={sdkPath} onChange={e => {
                    const p = e.target.value;
                    setSdkPath(p);
                    localStorage.setItem(SDK_PATH_KEY, p);
                  }} placeholder={`e.g. ${EXAMPLE_SDK_DIR}`} />
                  <button className="btn btn-ghost" onClick={async () => {
                    const { open } = await import('@tauri-apps/plugin-dialog');
                    const file = await open({ filters: [{ name: "Executable", extensions: ["exe", "sh", "py", "app"] }] });
                    if (file && typeof file === 'string') {
                      const p = file.replace(/\\/g, '/');
                      setSdkPath(p);
                      localStorage.setItem(SDK_PATH_KEY, p);
                    }
                  }} style={{ fontSize: 12, padding: '0 16px', border: '1px solid var(--bdr)', borderRadius: 6 }}>Find</button>
                </div>
              </div>
              {!sdkPath && (
                <div style={{ fontSize: 11, color: "var(--warn)", background: "color-mix(in srgb, var(--warn) 8%, transparent)", padding: "8px 10px", borderRadius: 6, lineHeight: 1.5 }}>
                  ⚠ No SDK path set. Enter the SDK folder or the path to <code>{RENPY_LAUNCHER}</code>.
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
                    background: sdkPath ? "color-mix(in srgb, var(--acc2) 20%, transparent)" : "color-mix(in srgb, var(--text) 4%, transparent)",
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
                  <div key={i} style={{ fontSize: 11, color: "var(--err)", padding: "4px 8px", background: "color-mix(in srgb, var(--err) 10%, transparent)", borderRadius: 4 }}>
                    {e.location && <strong>[{e.location}]</strong>} {e.message}
                  </div>
                ))}
              </div>
            )}
            {status.msg && (
              <div style={{
                marginTop: -16, fontSize: 11, fontWeight: 700, padding: "8px 12px", borderRadius: 6,
                background: status.type === "err" ? "color-mix(in srgb, var(--err) 10%, transparent)" : "color-mix(in srgb, var(--ok) 10%, transparent)",
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
      {showConfirmModal && unusedAssets && (
        <div style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg0) 85%, transparent)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", animation: 'vnv-fade-slide-in 0.15s ease both' }}>
          <div className="col" style={{ width: 520, background: "var(--bg1)", borderRadius: 14, border: "1px solid var(--bdr)", overflow: "hidden", boxShadow: "0 24px 48px color-mix(in srgb, var(--bg0) 60%, transparent), 0 0 0 1px color-mix(in srgb, var(--text) 4%, transparent)" }}>
            <div style={{ padding: "16px 20px", background: "color-mix(in srgb, var(--err) 15%, var(--bg2))", borderBottom: "1px solid color-mix(in srgb, var(--err) 30%, var(--bdr))", display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--err)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🗑</div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>Delete Unused Assets</div>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>This action cannot be undone</div>
              </div>
            </div>
            <div style={{ padding: 20, color: "var(--text)", fontSize: 13, lineHeight: 1.6 }}>
              <p style={{ marginBottom: 12 }}>Permanently delete <strong style={{ color: 'var(--err)' }}>{unusedAssets.length}</strong> files from game/images and game/audio that no scene, character, event, setting or script refers to?</p>
              <div style={{ background: "var(--bg0)", border: "1px solid var(--bdr)", borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                {unusedAssets.map(f => {
                  const ext = f.split('.').pop()?.toLowerCase() ?? '';
                  const icon = ['png','jpg','jpeg','webp','gif','bmp'].includes(ext) ? '🖼️' : ['ogg','mp3','wav','opus','flac'].includes(ext) ? '🎵' : '📄';
                  // Relative to game/, so files with the same name in different folders can be told apart.
                  const path = f.replace(/^game\//, '');
                  return (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid color-mix(in srgb, var(--bdr) 50%, transparent)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                      <span title={path} style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
                      <span style={{ color: 'var(--faint)', flexShrink: 0, fontSize: 10 }}>{ext.toUpperCase()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="row" style={{ padding: "14px 20px", borderTop: "1px solid var(--bdr)", justifyContent: "flex-end", gap: 10, background: "var(--bg2)" }}>
              <button className="btn btn-ghost" disabled={assetTask === "clean"} onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="btn" disabled={assetTask === "clean"} style={{ background: "var(--err)", color: "var(--bg0)", border: "1px solid color-mix(in srgb, var(--err) 70%, transparent)", fontWeight: 700, padding: '0 18px', height: 34, borderRadius: 8 }} onClick={handleClean}>
                {assetTask === "clean" ? "Deleting…" : `Delete ${unusedAssets.length} Files`}
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
    else if (trimmed.startsWith("define ")) color = "var(--acc2)";
    else if (trimmed.startsWith("default ")) color = "var(--amber)";
    else if (trimmed.startsWith("init ") || trimmed === "init python:") color = "var(--amber)";
    else if (trimmed.startsWith("$")) color = "var(--acc)";
    else if (trimmed.startsWith("scene ") || trimmed.startsWith("show ") || trimmed.startsWith("hide ")) color = "var(--ok)";
    else if (trimmed.startsWith("play ") || trimmed.startsWith("stop ")) color = "var(--warn)";
    else if (trimmed.startsWith("with ")) color = "var(--pink)";
    else if (trimmed.startsWith("menu:") || trimmed.startsWith("if ") || trimmed.startsWith("else:")) color = "color-mix(in srgb, var(--pink) 60%, var(--acc2))";
    else if (trimmed.startsWith("jump ") || trimmed.startsWith("call ") || trimmed.startsWith("return")) color = "var(--teal)";
    else if (trimmed.startsWith("pause ")) color = "var(--dim)";
    else if (trimmed.startsWith('"')) color = "color-mix(in srgb, var(--warn) 60%, var(--text))";
    else if (/^\s+[a-z_]+ "/.test(line)) color = "color-mix(in srgb, var(--acc2) 60%, var(--text))";
    return <span key={i} style={{ display: "block", color, minHeight: "1.2em" }}>{line || " "}</span>;
  });
}
