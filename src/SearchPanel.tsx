/**
 * SearchPanel.tsx — Project-wide in-memory search across all scene events.
 * Searches scene labels and all event text fields in the loaded VNProject.
 * No file I/O — instant results from the already-loaded data.
 * Result click fires onEditScene(sceneId) to jump to that scene.
 */
import React, { useState, useMemo, useCallback } from "react";
import type { VNProject, VNScene } from "./types";

interface Match {
  sceneId: string;
  sceneLabel: string;
  field: string;
  snippet: string;
  matchStart: number;
  matchEnd: number;
  eventIndex?: number;
  optIndex?: number;
  fieldType: 'label' | 'text' | 'prompt' | 'var_name' | 'opt_text';
  pattern: RegExp;
}

interface SearchPanelProps {
  project: VNProject;
  onProjectChange?: (project: VNProject) => void;
  onEditScene: (id: string) => void;
  onClose: () => void;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchProject(project: VNProject, query: string, caseSensitive: boolean, isRegex: boolean, wholeWord: boolean): Match[] {
  if (!query.trim()) return [];
  const matches: Match[] = [];

  let pattern: RegExp;
  try {
    const flags = caseSensitive ? "g" : "gi";
    const raw = isRegex ? query : escapeRe(query);
    const bounded = wholeWord ? `\\b${raw}\\b` : raw;
    pattern = new RegExp(bounded, flags);
  } catch {
    return [];
  }

  const search = (
    sceneId: string, sceneLabel: string, field: string, text: string,
    fieldType: Match['fieldType'], eventIndex?: number, optIndex?: number
  ) => {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(text)) !== null) {
      const start = Math.max(0, m.index - 30);
      const end   = Math.min(text.length, m.index + m[0].length + 30);
      matches.push({
        sceneId, sceneLabel, field,
        snippet: (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : ""),
        matchStart: m.index - start + (start > 0 ? 1 : 0),
        matchEnd:   m.index - start + m[0].length + (start > 0 ? 1 : 0),
        fieldType, eventIndex, optIndex, pattern
      });
      if (m[0].length === 0) pattern.lastIndex++; // prevent infinite loop
    }
  };

  project.scenes.forEach((sc: VNScene) => {
    search(sc.id, sc.label, "label", sc.label, 'label');
    sc.events.forEach((ev, i) => {
      const tag = `event ${i + 1} (${ev.type})`;
      if (ev.text)     search(sc.id, sc.label, `${tag} · text`,   ev.text, 'text', i);
      if (ev.prompt)   search(sc.id, sc.label, `${tag} · prompt`, ev.prompt, 'prompt', i);
      if (ev.var_name) search(sc.id, sc.label, `${tag} · var`,    ev.var_name, 'var_name', i);
      ev.opts?.forEach((opt, j) => {
        if (opt.text) search(sc.id, sc.label, `${tag} · option ${j + 1}`, opt.text, 'opt_text', i, j);
      });
    });
  });

  return matches;
}

// ── Highlighted snippet ───────────────────────────────────────────────────────

function Highlighted({ text, start, end }: { text: string; start: number; end: number }) {
  return (
    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--dim)" }}>
      {text.slice(0, start)}
      <mark style={{ background: "rgba(250,204,21,0.3)", color: "#facc15", borderRadius: 2, padding: "0 1px" }}>
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SearchPanel({ project, onProjectChange, onEditScene, onClose }: SearchPanelProps) {
  const [query, setQuery]       = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [caseSens, setCaseSens] = useState(false);
  const [regex, setRegex]       = useState(false);
  const [whole, setWhole]       = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const matches = useMemo(() => searchProject(project, query, caseSens, regex, whole), [project, query, caseSens, regex, whole]);

  // Group by scene
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; matches: Match[] }>();
    matches.forEach((m) => {
      if (!map.has(m.sceneId)) map.set(m.sceneId, { label: m.sceneLabel, matches: [] });
      map.get(m.sceneId)!.matches.push(m);
    });
    return map;
  }, [matches]);

  const toggleScene = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Auto-expand all when query changes
  React.useEffect(() => {
    setExpanded(new Set(grouped.keys()));
  }, [grouped]);

  // Keyboard shortcut — Escape closes
  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const optBtn = (active: boolean, title: string, label: string, toggle: () => void) => (
    <button
      title={title}
      onClick={toggle}
      style={{
        padding: "3px 7px", borderRadius: 4, border: "1px solid var(--bdr)",
        background: active ? "rgba(75,108,247,0.2)" : "var(--bg3)",
        color: active ? "var(--acc2, #4b6cf7)" : "var(--dim)",
        fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, cursor: "pointer",
        transition: "all 0.15s",
      }}
    >{label}</button>
  );

  // ── Replace Logic ─────────────────────────────────────────────────────────

  const doReplace = useCallback((ms: Match[], textVal: string) => {
    if (!onProjectChange) return;
    const clone = JSON.parse(JSON.stringify(project)) as VNProject;
    
    // Group matches to avoid double-replacing the same field
    const seen = new Set<string>();

    for (const m of ms) {
      const key = `${m.sceneId}-${m.eventIndex}-${m.optIndex}-${m.fieldType}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const sc = clone.scenes.find(s => s.id === m.sceneId);
      if (!sc) continue;

      const replacer = (orig: string) => orig.replace(m.pattern, textVal);

      if (m.fieldType === 'label') {
        sc.label = replacer(sc.label);
      } else if (m.eventIndex !== undefined) {
        const ev = sc.events[m.eventIndex];
        if (m.fieldType === 'text' && ev.text) {
          ev.text = replacer(ev.text);
        } else if (m.fieldType === 'prompt' && ev.prompt) {
          ev.prompt = replacer(ev.prompt);
        } else if (m.fieldType === 'var_name' && ev.var_name) {
          ev.var_name = replacer(ev.var_name);
        } else if (m.fieldType === 'opt_text' && m.optIndex !== undefined && ev.opts) {
          const opt = ev.opts[m.optIndex];
          if (opt.text) opt.text = replacer(opt.text);
        }
      }
    }
    
    onProjectChange(clone);
    setShowReplaceConfirm(false);
  }, [project, onProjectChange]);

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 500,
      background: "rgba(7,10,20,0.75)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: 60,
    }}>
      <div style={{
        width: 560, maxHeight: "70vh",
        background: "var(--bg1, #0f1626)",
        border: "1px solid var(--bdr)",
        borderRadius: 14,
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid var(--bdr)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", flex: 1 }}>
            {replaceMode ? "Find & Replace" : "Search Project"}
          </span>
          <button onClick={() => {
            if (replaceMode && showReplaceConfirm) setShowReplaceConfirm(false);
            else setReplaceMode(!replaceMode);
          }} style={{
            background: replaceMode ? "rgba(75,108,247,0.15)" : "transparent",
            color: replaceMode ? "var(--acc2)" : "var(--dim)",
            border: "1px solid", borderColor: replaceMode ? "rgba(75,108,247,0.3)" : "var(--bdr)",
            padding: "4px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer"
          }}>
            {replaceMode ? "Cancel Replace" : "Toggle Replace"}
          </button>
          <button onClick={onClose} style={{
            background: "transparent", border: "none",
            color: "var(--dim)", fontSize: 18, cursor: "pointer", padding: "0 4px",
          }}>×</button>
        </div>

        <div style={{ padding: "12px 20px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            autoFocus
            placeholder="Search scenes and events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px",
              borderRadius: 8, border: "1px solid var(--bdr)",
              background: "var(--bg3)", color: "var(--text)",
              fontSize: 13, outline: "none",
              boxSizing: "border-box",
            }}
          />
          {replaceMode && (
            <div className="row gap8">
              <input
                placeholder="Replace with…"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                style={{
                  flex: 1, padding: "8px 12px",
                  borderRadius: 8, border: "1px solid var(--bdr)",
                  background: "var(--bg3)", color: "var(--ok)",
                  fontSize: 13, outline: "none",
                }}
              />
              <button 
                className="btn btn-accent" 
                disabled={matches.length === 0}
                onClick={() => setShowReplaceConfirm(true)}
                style={{ fontSize: 12, padding: "0 16px" }}
              >
                Replace All ({matches.length})
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {optBtn(caseSens, "Case sensitive", "Aa", () => setCaseSens((v) => !v))}
            {optBtn(whole,    "Whole word",     "ab|", () => setWhole((v) => !v))}
            {optBtn(regex,    "Use regex",      ".*",  () => setRegex((v) => !v))}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--faint)" }}>
              {matches.length > 0 ? `${matches.length} result${matches.length !== 1 ? "s" : ""} in ${grouped.size} scene${grouped.size !== 1 ? "s" : ""}` : query ? "No results" : ""}
            </span>
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 16px" }}>
          {[...grouped.entries()].map(([sceneId, { label, matches: sm }]) => (
            <div key={sceneId}>
              {/* Scene header */}
              <button
                onClick={() => toggleScene(sceneId)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 8px 4px", background: "transparent", border: "none",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 10, color: "var(--dim)", transition: "transform 0.15s", display: "inline-block", transform: expanded.has(sceneId) ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{label}</span>
                <span style={{
                  marginLeft: "auto", fontSize: 10, padding: "1px 6px",
                  borderRadius: 10, background: "rgba(75,108,247,0.15)", color: "var(--acc2, #4b6cf7)",
                }}>{sm.length}</span>
              </button>

              {/* Matches */}
              {expanded.has(sceneId) && sm.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 8px 4px 28px",
                    borderRadius: 6, marginBottom: 2,
                  }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = "rgba(75,108,247,0.08)"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                >
                  <div className="col" style={{ flex: 1, gap: 2, minWidth: 0, cursor: "pointer" }} onClick={() => { onEditScene(sceneId); onClose(); }}>
                    <span style={{ fontSize: 10, color: "var(--faint)" }}>{m.field}</span>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <Highlighted text={m.snippet} start={m.matchStart} end={m.matchEnd} />
                    </div>
                  </div>
                  {replaceMode && (
                    <button 
                      className="btn" 
                      onClick={() => doReplace([m], replaceText)}
                      style={{ fontSize: 10, padding: "2px 8px", background: "var(--bg3)", color: "var(--ok)", border: "1px solid var(--bdr)" }}
                    >
                      Replace
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}

          {query && matches.length === 0 && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
              No results found for "{query}"
            </div>
          )}
          {!query && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
              Start typing to search across all scenes and events
            </div>
          )}
        </div>
      </div>

      {/* Replace All Confirmation */}
      {showReplaceConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="col" style={{ width: 400, background: "var(--bg1)", borderRadius: 12, border: "1px solid var(--bdr)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", background: "var(--warn)", color: "#000", fontWeight: 700 }}>
              ⚠ Replace All
            </div>
            <div style={{ padding: 20, color: "var(--text)", fontSize: 13, lineHeight: 1.6 }}>
              <p>You are about to modify <strong>{matches.length}</strong> location(s).</p>
              <p style={{ marginTop: 8 }}>
                Replace: <code style={{ color: "var(--warn)" }}>{query}</code><br/>
                With: <code style={{ color: "var(--ok)" }}>{replaceText}</code>
              </p>
              <p style={{ marginTop: 12, color: "var(--dim)", fontSize: 11 }}>You can undo this action by pressing Ctrl+Z.</p>
            </div>
            <div className="row" style={{ padding: 16, borderTop: "1px solid var(--bdr)", justifyContent: "flex-end", gap: 12, background: "var(--bg2)" }}>
              <button className="btn btn-ghost" onClick={() => setShowReplaceConfirm(false)}>Cancel</button>
              <button className="btn" style={{ background: "var(--warn)", color: "#000", border: "none" }} onClick={() => doReplace(matches, replaceText)}>
                Confirm Replace All
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
