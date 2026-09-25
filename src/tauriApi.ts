import { invoke } from "@tauri-apps/api/core";
import { documentDir, homeDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { VNProject } from "./types";
import { migrateProject } from "./types";
import { declaredVarNames } from "./rpyDeclarations";

// ─── Monitor / Window ─────────────────────────────────────────────────────────

export async function setWindowSize(width: number, height: number): Promise<void> {
  return invoke("set_window_size", { width, height });
}

export async function updateAppIcon(tealHex: string, accHex: string): Promise<void> {
  return invoke("update_app_icon", { tealHex, accHex });
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


export async function pickNewProjectFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title: "Choose Project Folder" });
  return result as string | null;
}

// ─── Paths ────────────────────────────────────────────────────────────────────

/** Whether a file or folder exists. */
export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

/**
 * Let the editor load a project's images, audio and fonts through the asset
 * protocol, whose scope starts empty. Call before showing the project.
 */
export async function allowProjectAssets(rootPath: string): Promise<void> {
  return invoke("allow_project_assets", { projectRoot: rootPath });
}

/** Whether `path` is a folder that already has something in it. */
export async function dirHasFiles(path: string): Promise<boolean> {
  return invoke<boolean>("dir_has_files", { path });
}

/** Paths compared the way Windows treats them: separators and letter case don't matter. */
function comparablePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return comparablePath(a) === comparablePath(b);
}

/** True if `path` is `folder` itself or somewhere inside it. */
export function isSameOrInside(path: string, folder: string): boolean {
  const p = comparablePath(path);
  const f = comparablePath(folder);
  return p === f || p.startsWith(`${f}/`);
}

// ─── Games Directory ──────────────────────────────────────────────────────────

/** Where new projects go when the user hasn't picked a folder: Documents/VNVMaker/games. */
export async function defaultGamesDir(): Promise<string> {
  let docs: string;
  try {
    docs = await documentDir();
  } catch {
    // Linux without XDG user directories has no known Documents folder.
    docs = `${(await homeDir()).replace(/\\/g, "/").replace(/\/+$/, "")}/Documents`;
  }
  return `${docs.replace(/\\/g, "/").replace(/\/+$/, "")}/VNVMaker/games`;
}

/** The games folder from Preferences, or {@link defaultGamesDir}. */
export async function getGamesDir(): Promise<string> {
  return localStorage.getItem("pref_games_dir") || defaultGamesDir();
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
 * Path of the folder a new project called `title` gets inside the games folder.
 * Nothing is created here — `scaffoldNewProject` creates the folder and refuses
 * to reuse one that already has files in it.
 */
export async function projectRootInGamesDir(title: string): Promise<string> {
  return `${await getGamesDir()}/${safeFolderName(title)}`;
}


export async function pickSavePath(defaultName: string): Promise<string | null> {
  const result = await save({
    defaultPath: defaultName,
    filters: [{ name: "Ren'Py Script", extensions: ["rpy"] }],
  });
  return result as string | null;
}

// ─── .rpy Files ───────────────────────────────────────────────────────────────

export async function readRpyFile(path: string): Promise<string> {
  return invoke<string>("read_rpy_file", { path });
}

export async function writeRpyFile(path: string, content: string): Promise<void> {
  return writeTextFile(path, content);
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

/** Thrown by {@link loadVnvProject} when there is no project file at the path. */
export class ProjectFileMissingError extends Error {}

export async function loadVnvProject(path: string): Promise<VNProject> {
  let json: string;
  try {
    json = await invoke<string>("load_vnv_project", { path });
  } catch (e) {
    if (!(await pathExists(path))) throw new ProjectFileMissingError(String(e));
    throw e;
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`The project file is damaged and couldn't be opened (${String(e)}). It hasn't been changed.`);
  }
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
  return launchRenpyPreview(projectRoot, previewRpy, sdkExePath || null, renpyLanguage);
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

/**
 * Variables the scripts in a game folder already declare with `default` or
 * `define`, so a script generated next to them can leave those out (Ren'Py
 * won't start if a variable gets a `default` twice). The live-preview script
 * is skipped, since it's the file being regenerated.
 */
export async function declaredVarsInGame(rootPath: string): Promise<Set<string>> {
  const scripts = await readRpyFolder(rootPath);
  return declaredVarNames(scripts.filter(s => !s.name.endsWith("vnv_preview.rpy")).map(s => s.content));
}

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
