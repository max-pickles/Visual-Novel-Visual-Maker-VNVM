import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { mkdir } from "@tauri-apps/plugin-fs";
import type { VNProject, RpyProject, LayoutPositions } from "./types";
import { migrateProject } from "./types";

// ─── Monitor / Window ─────────────────────────────────────────────────────────

export interface MonitorInfo {
  width: number;
  height: number;
  scale_factor: number;
  logical_width: number;
  logical_height: number;
  name: string;
}

export async function getMonitorInfo(): Promise<MonitorInfo> {
  return invoke<MonitorInfo>("get_monitor_info");
}

export async function setWindowSize(width: number, height: number): Promise<void> {
  return invoke("set_window_size", { width, height });
}

export async function updateAppIcon(tealHex: string, accHex: string): Promise<void> {
  return invoke("update_app_icon", { tealHex, accHex });
}

export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

// ─── Shell / OS ───────────────────────────────────────────────────────────────

/** Open Windows Explorer inside the given folder, showing its contents. */
export async function showInExplorer(path: string): Promise<void> {
  return invoke("show_in_explorer", { path });
}

/** Permanently delete a project folder and ALL its contents from disk. */
export async function deleteProjectFolder(folderPath: string): Promise<void> {
  return invoke("delete_project_folder", { folderPath });
}

/** Permanently delete a single file. */
export async function deleteFile(path: string): Promise<void> {
  return invoke("delete_file", { path });
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────


export async function pickProjectFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title: "Open Ren'Py Project" });
  return result as string | null;
}

export async function pickVnvFile(): Promise<string | null> {
  const result = await open({
    directory: false, multiple: false,
    title: "Open VNV Project",
    filters: [{ name: "VNV Maker Project", extensions: ["vnvmaker"] }],
  });
  return result as string | null;
}

export async function pickNewProjectFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title: "Choose Project Folder" });
  return result as string | null;
}

// ─── Games Directory ──────────────────────────────────────────────────────────

export function getGamesDir(): string {
  return localStorage.getItem("pref_games_dir") || "C:/Users/maxcm/OneDrive/Desktop/VNVMAKER/games";
}

/** Sanitize a project title into a safe folder name. */
function safeFolderName(title: string): string {
  return title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") // illegal chars → _
    .replace(/\s+/g, "_")                    // spaces → _
    .replace(/_+/g, "_")                     // collapse runs
    .replace(/^_|_$/g, "")                   // trim leading/trailing _
    || "MyProject";
}

/**
 * Creates GAMES_DIR/<SafeTitle>/ and all standard Ren'Py subfolders.
 * Returns the new project root path (forward slashes).
 * Throws if the folder already exists.
 */
export async function createProjectInGamesDir(title: string): Promise<string> {
  const name = safeFolderName(title);
  const root = `${getGamesDir()}/${name}`;

  // Create all required subdirs
  const dirs = [
    root,
    `${root}/game`,
    `${root}/game/images`,
    `${root}/game/audio`,
    `${root}/game/gui`,
    `${root}/game/saves`,
    `${root}/game/cache`,
    `${root}/game/tl`,
  ];
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  return root;
}


export async function pickSavePath(defaultName: string): Promise<string | null> {
  const result = await save({
    defaultPath: defaultName,
    filters: [{ name: "Ren'Py Script", extensions: ["rpy"] }],
  });
  return result as string | null;
}

// ─── Legacy .rpy Graph Commands ───────────────────────────────────────────────

export async function openRpyProject(path: string): Promise<RpyProject> {
  return invoke<RpyProject>("open_project", { path });
}

export async function saveNodePositions(rootPath: string, positions: LayoutPositions): Promise<void> {
  return invoke("save_node_positions", { rootPath, positions });
}

export async function readRpyFile(path: string): Promise<string> {
  return invoke<string>("read_rpy_file", { path });
}

export async function writeRpyFile(path: string, content: string): Promise<void> {
  return invoke("write_rpy_file", { path, content });
}

export async function getRpyFiles(rootPath: string): Promise<string[]> {
  return invoke<string[]>("get_rpy_files", { rootPath });
}

/** Read a project's gui.rpy file and return its raw text. */
export async function readGuiRpy(rootPath: string): Promise<string> {
  return readRpyFile(`${rootPath.replace(/\\/g, '/')}/game/gui.rpy`);
}

/** Write updated content back to the project's gui.rpy file. */
export async function writeGuiRpy(rootPath: string, content: string): Promise<void> {
  return writeRpyFile(`${rootPath.replace(/\\/g, '/')}/game/gui.rpy`, content);
}

export async function readOptionsRpy(rootPath: string): Promise<string> {
  return readRpyFile(`${rootPath.replace(/\\/g, '/')}/game/options.rpy`);
}

export async function writeOptionsRpy(rootPath: string, content: string): Promise<void> {
  return writeRpyFile(`${rootPath.replace(/\\/g, '/')}/game/options.rpy`, content);
}

export async function readScreensRpy(rootPath: string): Promise<string> {
  return readRpyFile(`${rootPath.replace(/\\/g, '/')}/game/screens.rpy`);
}

export async function writeScreensRpy(rootPath: string, content: string): Promise<void> {
  return writeRpyFile(`${rootPath.replace(/\\/g, '/')}/game/screens.rpy`, content);
}

// ─── VNV Project I/O ──────────────────────────────────────────────────────────

export async function saveVnvProject(path: string, project: VNProject): Promise<void> {
  const { _rootPath, _filePath, ...clean } = project;
  const json = JSON.stringify({ ...clean, updated: Date.now() }, null, 2);
  return invoke("save_vnv_project", { path, content: json });
}

export async function loadVnvProject(path: string): Promise<VNProject> {
  const json = await invoke<string>("load_vnv_project", { path });
  const raw = JSON.parse(json) as Record<string, unknown>;
  // migrateProject fills in any missing fields from old/partial saves
  const proj = migrateProject(raw, path);
  const parts = path.replace(/\\/g, "/").split("/");
  proj._filePath = path;
  proj._rootPath = parts.slice(0, -1).join("/");
  return proj;
}

// ─── Asset Browser ────────────────────────────────────────────────────────────

export async function listAssetFiles(rootPath: string, assetType: "images" | "audio" | "video" | string): Promise<string[]> {
  return invoke<string[]>("list_asset_files", { rootPath, assetType });
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

// ─── Custom Folder Picker ─────────────────────────────────────────────────────

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_vnv_project: boolean;
}

export async function listDirEntries(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_dir_entries", { path });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke("write_text_file", { path, content });
}

export async function copyDirRecursive(src: string, dst: string): Promise<void> {
  return invoke("copy_dir_recursive", { src, dst });
}

export async function scaffoldRenpyFolders(rootPath: string): Promise<void> {
  const folders = [
    "game",
    "game/audio",
    "game/cache",
    "game/gui",
    "game/images",
    "game/libs",
    "game/saves",
    "game/tl",
    ".vscode"
  ];
  
  for (const folder of folders) {
    try {
      await mkdir(`${rootPath}/${folder}`, { recursive: true });
    } catch (e) {
      console.warn(`Failed to create folder ${folder}:`, e);
    }
  }
}

/** Scaffold a blank new project from the Templet into project_root/game/.
 *  Copies gui/, screens.rpy, options.rpy etc. — NO story images or audio. */
export async function scaffoldNewProject(projectRoot: string, projectTitle: string): Promise<string> {
  return invoke<string>("scaffold_new_project", { projectRoot, projectTitle });
}

/** Patch gui.rpy and options.rpy with wizard-chosen resolution and accent color. */
export async function applyProjectTheme(
  projectRoot: string,
  width: number,
  height: number,
  accentHex: string,
  bgHex: string,
): Promise<void> {
  return invoke("apply_project_theme", { projectRoot, width, height, accentHex, bgHex });
}

// ─── Standalone Export ────────────────────────────────────────────────────────

export async function exportToSdk(
  compiledRpy: string,
  projectName: string,
  projectTitle: string,
  assetRoot: string,
): Promise<string> {
  return invoke<string>("export_to_sdk", { compiledRpy, projectName, projectTitle, assetRoot });
}


// ─── Ren'Py Live Preview ──────────────────────────────────────────────────────

/**
 * Write `game/vnv_preview.rpy` and spawn the Ren'Py SDK with the project.
 *
 * @param projectRoot  - Absolute path to the project root (contains game/).
 * @param previewRpy   - Compiled Ren'Py script string from `compilePreview()`.
 * @param sdkExePath   - Optional: saved path to the renpy.exe / renpy.sh binary.
 * @returns The Ren'Py executable path that was used (for caching in settings).
 */
export async function launchRenpyPreview(
  projectRoot: string,
  previewRpy: string,
  sdkExePath?: string | null,
  renpyLanguage?: string | null,
): Promise<string> {
  return invoke<string>("launch_renpy_preview", {
    projectRoot: projectRoot.replace(/\\/g, "/"),
    previewRpy,
    sdkExePath: sdkExePath ?? null,
    renpyLanguage: renpyLanguage ?? null,
  });
}

/**
 * Open the project directly in the official Ren'Py Launcher.
 * Sets RENPY_PROJECTS_DIR so the project appears in the native launcher list.
 */
export async function launchRenpyLauncher(
  projectRoot: string,
  sdkExePath?: string | null,
): Promise<void> {
  return invoke("launch_renpy_launcher", {
    projectRoot: projectRoot.replace(/\\/g, "/"),
    sdkExePath: sdkExePath ?? null,
  });
}

/**
 * Ask the backend to search common locations for the Ren'Py SDK executable.
 * Returns the path string if found, or `null` if not found.
 */
export async function findRenpySdk(hint?: string | null): Promise<string | null> {
  return invoke<string | null>("find_renpy_sdk", { hint: hint ?? null });
}

/** Delete `game/vnv_preview.rpy` to clean up after a preview session. */
export async function deletePreviewRpy(projectRoot: string): Promise<void> {
  return invoke("delete_preview_rpy", { projectRoot: projectRoot.replace(/\\/g, "/") });
}

/** Default Ren'Py SDK path — bundled alongside VNVMaker. */
export const DEFAULT_RENPY_SDK = "C:/Users/maxcm/OneDrive/Desktop/VNVMAKER/renpy-8.5.2/renpy.exe";

/**
 * Compile the project, write vnv_preview.rpy starting from `sceneId`, and
 * spawn the Ren'Py SDK detached. Returns the sdk exe path used.
 */
export async function playFromScene(
  projectRoot: string,
  sceneId: string,
  previewRpy: string,
  sdkExePath?: string | null,
  renpyLanguage?: string | null,
): Promise<string> {
  return launchRenpyPreview(projectRoot, previewRpy, sdkExePath || DEFAULT_RENPY_SDK, renpyLanguage);
}

// ─── Import from .rpy ─────────────────────────────────────────────────────────

/**
 * Validate that a folder is a Ren'Py game.
 *
 * Detection rules (two required):
 *   1. A `game/` subdirectory must exist inside the picked folder.
 *   2. That `game/` directory must contain at least one `.rpy` script file.
 *
 * Resolves with the absolute path of the `game/` subdirectory on success
 * (so the caller already knows where to read scripts from).
 * Rejects with a user-readable error message on failure.
 */
export async function validateRenpyProject(folderPath: string): Promise<string> {
  return invoke<string>("validate_renpy_project", { folderPath });
}

// ─── .rpy Importer (client-side) ─────────────────────────────────────────────
// Reads all .rpy files from a folder using existing Tauri commands,
// then passes file contents to the pure-TS importer in rpyImporter.ts.

export async function readRpyFolder(
  folderPath: string,
): Promise<{ name: string; content: string }[]> {
  const files = await getRpyFiles(folderPath);
  const results: { name: string; content: string }[] = [];
  for (const filePath of files) {
    try {
      // list_rpy_files returns relative paths (e.g. "game/script.rpy")
      // readRpyFile needs the full absolute path
      const absPath = `${folderPath.replace(/\\/g, "/")}/${filePath.replace(/\\/g, "/")}`;
      const content = await readRpyFile(absPath);
      // Preserve the full relative path so the importer can skip tl/, gui/, etc.
      const name = filePath.replace(/\\/g, "/");
      results.push({ name, content });
    } catch (e) {
      console.warn(`Could not read ${filePath}:`, e);
    }
  }
  return results;
}

// ─── Distribution Builds ─────────────────────────────────────────────────────

/**
 * Run `renpy.exe <projectRoot> distribute --package <package>` to build a
 * platform distributable. Blocking — waits for Ren'Py to finish and returns
 * the combined stdout+stderr log.
 *
 * @param projectRoot  - Absolute path to the Ren'Py project root.
 * @param pkg          - Package target: "pc", "win", "linux", "mac", "android".
 * @param sdkExePath   - Optional override path to the renpy.exe binary.
 * @param outputDir    - Optional destination directory for build output.
 */
export async function distributeRenpyBuild(
  projectRoot: string,
  pkg: string,
  sdkExePath?: string | null,
  outputDir?: string | null,
): Promise<string> {
  return invoke<string>("distribute_renpy_build", {
    project_root: projectRoot.replace(/\\/g, "/"),
    package: pkg,
    sdkExePath: sdkExePath ?? null,
    outputDir: outputDir ?? null,
  });
}


// ─── Backward compat alias ────────────────────────────────────────────────────
// The old tauriApi used openProject; keep it pointing to the right place.
export const openProject = openRpyProject;

