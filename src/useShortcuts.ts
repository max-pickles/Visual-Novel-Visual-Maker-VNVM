/**
 * useShortcuts.ts — Global keyboard shortcut manager.
 *
 * Usage:
 *   useShortcuts({ onSave, onUndo, onRedo, onSearch, onDelete, onFit, onTab });
 *
 * Bindings are configurable and stored in localStorage under "vnv_shortcuts".
 */
import { useEffect, useRef } from "react";

export type ShortcutAction =
  | "save" | "undo" | "redo" | "search" | "quickOpen"
  | "fit" | "delete" | "pan" | "escape"
  | "tab1" | "tab2" | "tab3" | "tab4" | "tab5"
  | "tab6" | "tab7" | "tab8" | "tab9";

export interface ShortcutBinding {
  key: string;         // e.g. "s", "z", "F1", "Delete"
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, ShortcutBinding> = {
  save:      { key: "s",      ctrl: true },
  undo:      { key: "z",      ctrl: true },
  redo:      { key: "Z",      ctrl: true, shift: true },
  search:    { key: "f",      ctrl: true, shift: true },
  quickOpen: { key: "p",      ctrl: true },
  fit:     { key: "f" },
  delete:  { key: "Delete" },
  pan:     { key: " " },          // Space
  escape:  { key: "Escape" },
  tab1:    { key: "1",      ctrl: true },
  tab2:    { key: "2",      ctrl: true },
  tab3:    { key: "3",      ctrl: true },
  tab4:    { key: "4",      ctrl: true },
  tab5:    { key: "5",      ctrl: true },
  tab6:    { key: "6",      ctrl: true },
  tab7:    { key: "7",      ctrl: true },
  tab8:    { key: "8",      ctrl: true },
  tab9:    { key: "9",      ctrl: true },
};

function matches(e: KeyboardEvent, b: ShortcutBinding): boolean {
  return (
    e.key.toLowerCase() === b.key.toLowerCase() &&
    !!(e.ctrlKey || e.metaKey) === !!(b.ctrl || b.meta) &&
    !!e.shiftKey === !!b.shift &&
    !!e.altKey   === !!b.alt
  );
}

export function getShortcuts(): Record<ShortcutAction, ShortcutBinding> {
  try {
    const raw = localStorage.getItem("vnv_shortcuts");
    if (raw) return { ...DEFAULT_SHORTCUTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SHORTCUTS };
}

export function saveShortcuts(map: Record<ShortcutAction, ShortcutBinding>) {
  localStorage.setItem("vnv_shortcuts", JSON.stringify(map));
}

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

export function useShortcuts(handlers: ShortcutHandlers) {
  // Keep handlers ref fresh so we don't need to re-register on every render
  const handlersRef = useRef<ShortcutHandlers>(handlers);
  useEffect(() => { handlersRef.current = handlers; });

  useEffect(() => {
    const bindings = getShortcuts();

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't fire shortcuts when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.isContentEditable;
      if ((tag === "INPUT" || tag === "TEXTAREA" || editable) &&
          e.key !== "Escape" && e.key !== "F5") return;

      for (const [action, binding] of Object.entries(bindings) as [ShortcutAction, ShortcutBinding][]) {
        if (matches(e, binding)) {
          const handler = handlersRef.current[action];
          if (handler) {
            e.preventDefault();
            handler();
            return;
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []); // register once, handlers stay fresh via ref
}
