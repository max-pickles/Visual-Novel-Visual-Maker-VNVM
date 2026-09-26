/**
 * rpyDeclarations.ts — Find the variables a set of Ren'Py scripts already
 * declares with `default` or `define`, and the labels they define.
 *
 * The compiler emits a `default` for every story variable it discovers. Ren'Py
 * refuses to start if a variable gets a `default` twice ("store.x is being
 * given a default a second time"), so when the generated script sits next to
 * other scripts — an imported game's originals, or scripts the author added —
 * the compiler skips the names those scripts already declare.
 */

// `default name = …`, `define name = …`, `define -1 name = …`, `default store.name = …`
const DECLARATION = /^[ \t]*(?:default|define)(?:[ \t]+-?\d+)?[ \t]+(?:store\.)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/gm;

/** Names declared at store level by `default`/`define` statements in `scripts`. */
export function declaredVarNames(scripts: string[]): Set<string> {
  const names = new Set<string>();
  for (const script of scripts) {
    for (const m of script.matchAll(DECLARATION)) names.add(m[1]);
  }
  return names;
}

// `label name:`, `label name(args):` (local labels, `label .name:`, can't clash)
const LABEL = /^[ \t]*label[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?=[ \t(:])/gm;

/**
 * Labels defined in `scripts`. An export that keeps an imported game's label
 * names avoids these: Ren'Py refuses to start if a label is defined twice.
 */
export function declaredLabelNames(scripts: string[]): Set<string> {
  const names = new Set<string>();
  for (const script of scripts) {
    for (const m of script.matchAll(LABEL)) names.add(m[1]);
  }
  return names;
}
