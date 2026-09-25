/**
 * exportScripts.ts — Which `.rpy` files a project-folder export replaces.
 *
 * Export copies the whole project folder, then writes the compiled story
 * (`game/script.rpy` + `game/scene_<id>.rpy`). Scripts that would clash with the
 * compiled story are removed from the copy; everything else is kept.
 */

/** Kept in every export: Ren'Py config/UI definitions and the Translation Dashboard's output. */
const KEEP_ON_EXPORT = new Set(["gui.rpy", "options.rpy", "screens.rpy", "vnv_translations.rpy"]);

/**
 * True for scripts VNVMaker writes itself: the compiled story, its per-scene
 * files and the live-preview script.
 * @param path - Path relative to the project folder, e.g. `game/scene_ab12.rpy`.
 */
export function isGeneratedScript(path: string): boolean {
  return /^game\/(script|vnv_preview|scene_[^/]+)\.rpy$/.test(normalize(path));
}

/**
 * Should `path` be removed from an exported copy of the project?
 *
 * @param path     - Script path relative to the project folder.
 * @param imported - `VNProject.imported_scripts`: scripts copied in from the
 *                   Ren'Py game the project was imported from. `undefined` for
 *                   projects saved before this was tracked — for those every
 *                   script except the kept ones is replaced, as before.
 */
export function isReplacedByExport(path: string, imported: string[] | undefined): boolean {
  const p = normalize(path);
  const name = p.split("/").pop() ?? p;
  if (KEEP_ON_EXPORT.has(name)) return false;
  if (isGeneratedScript(p)) return true;
  if (imported) return imported.some(i => normalize(i) === p);
  return true;
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}
