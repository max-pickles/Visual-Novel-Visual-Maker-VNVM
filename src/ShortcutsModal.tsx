/**
 * ShortcutsModal.tsx — Keyboard shortcuts reference overlay.
 * Triggered by the ? button in VNEditor's top bar (or Ctrl+/).
 */
import React from "react";
import { useTranslation } from "./translationContext";

interface ShortcutEntry { keys: string[]; labelKey: string; contextKey: string; }

const SHORTCUTS: ShortcutEntry[] = [
  // Global
  { keys: ["Ctrl+S"],          labelKey: "shortcuts.labels.save",          contextKey: "shortcuts.contexts.global" },
  { keys: ["Ctrl+Z"],          labelKey: "shortcuts.labels.undo",                  contextKey: "shortcuts.contexts.global" },
  { keys: ["Ctrl+Y"],          labelKey: "shortcuts.labels.redo",                  contextKey: "shortcuts.contexts.global" },
  { keys: ["Ctrl+Shift+F"],    labelKey: "shortcuts.labels.search",         contextKey: "shortcuts.contexts.global" },
  { keys: ["Ctrl+P"],          labelKey: "shortcuts.labels.quick_open",      contextKey: "shortcuts.contexts.global" },
  { keys: ["Escape"],          labelKey: "shortcuts.labels.close_dialog",contextKey: "shortcuts.contexts.global" },
  { keys: ["Ctrl+1…9"],        labelKey: "shortcuts.labels.switch_tab",     contextKey: "shortcuts.contexts.global" },
  // Graph canvas
  { keys: ["F"],               labelKey: "shortcuts.labels.fit_nodes", contextKey: "shortcuts.contexts.graph" },
  { keys: ["Delete"],          labelKey: "shortcuts.labels.delete_nodes", contextKey: "shortcuts.contexts.graph" },
  { keys: ["Space"],           labelKey: "shortcuts.labels.pan_tool",        contextKey: "shortcuts.contexts.graph" },
  { keys: ["Scroll"],          labelKey: "shortcuts.labels.zoom",          contextKey: "shortcuts.contexts.graph" },
  { keys: ["Double-click"],    labelKey: "shortcuts.labels.rename_node",            contextKey: "shortcuts.contexts.graph" },
  { keys: ["Right-click"],     labelKey: "shortcuts.labels.node_context",      contextKey: "shortcuts.contexts.graph" },
  // Scene editor
  { keys: ["Ctrl+C"],          labelKey: "shortcuts.labels.copy_event",    contextKey: "shortcuts.contexts.scene" },
  { keys: ["Ctrl+X"],          labelKey: "shortcuts.labels.cut_event",     contextKey: "shortcuts.contexts.scene" },
  { keys: ["Ctrl+V"],          labelKey: "shortcuts.labels.paste_event", contextKey: "shortcuts.contexts.scene" },
  { keys: ["Ctrl+D"],          labelKey: "shortcuts.labels.duplicate_event",   contextKey: "shortcuts.contexts.scene" },
  { keys: ["Delete"],          labelKey: "shortcuts.labels.delete_event",      contextKey: "shortcuts.contexts.scene" },
  { keys: ["↑ / ↓"],          labelKey: "shortcuts.labels.nav_events",             contextKey: "shortcuts.contexts.scene" },
  { keys: ["Escape"],          labelKey: "shortcuts.labels.deselect",      contextKey: "shortcuts.contexts.scene" },
  // Flow canvas
  { keys: ["Scroll"],          labelKey: "shortcuts.labels.zoom",          contextKey: "shortcuts.contexts.flow" },
  { keys: ["Double-click"],    labelKey: "shortcuts.labels.open_scene",   contextKey: "shortcuts.contexts.flow" },
];

const CONTEXT_KEYS = [...new Set(SHORTCUTS.map(s => s.contextKey))];

interface Props { onClose: () => void; }

export function ShortcutsModal({ onClose }: Props) {
  const { t } = useTranslation();
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 900 }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        zIndex: 901, width: 560, maxHeight: "80vh",
        background: "var(--bg1)", border: "1px solid var(--bdr)",
        borderRadius: 12, display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", padding: "16px 20px",
          borderBottom: "1px solid var(--bdr)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{t("shortcuts.title")}</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 18, cursor: "pointer",
            color: "var(--faint)", lineHeight: 1, padding: "0 4px",
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "12px 20px 20px" }}>
          {CONTEXT_KEYS.map(ctxKey => (
            <div key={ctxKey} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: "var(--dim)",
                letterSpacing: ".1em", textTransform: "uppercase",
                marginBottom: 8, paddingBottom: 4,
                borderBottom: "1px solid var(--bdr)",
              }}>
                {t(ctxKey)}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {SHORTCUTS.filter(s => s.contextKey === ctxKey).map((s, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "7px 0", verticalAlign: "middle", width: 200 }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {s.keys.map((k, ki) => (
                            <kbd key={ki} style={{
                              display: "inline-block",
                              padding: "2px 7px", borderRadius: 5,
                              background: "var(--bg3)",
                              border: "1px solid var(--bdr)",
                              fontSize: 11, fontFamily: "var(--mono)",
                              color: "var(--text)",
                              boxShadow: "0 1px 0 var(--bdr)",
                              whiteSpace: "nowrap",
                            }}>{k}</kbd>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "7px 0 7px 12px", fontSize: 12, color: "var(--dim)", verticalAlign: "middle" }}>
                        {t(s.labelKey)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 20px", borderTop: "1px solid var(--bdr)",
          flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
          fontSize: 11, color: "var(--faint)",
        }}>
          <span>{t("shortcuts.footer_press")}</span>
          <kbd style={{ padding: "1px 6px", borderRadius: 4, background: "var(--bg3)", border: "1px solid var(--bdr)", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>?</kbd>
          <span>{t("shortcuts.footer_or")}</span>
          <kbd style={{ padding: "1px 6px", borderRadius: 4, background: "var(--bg3)", border: "1px solid var(--bdr)", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>Ctrl+/</kbd>
          <span>{t("shortcuts.footer_open")}</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: 11 }}>{t("shortcuts.close")}</button>
        </div>
      </div>
    </>
  );
}
