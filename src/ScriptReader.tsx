/**
 * ScriptReader.tsx — Full-project screenplay-style proofreader.
 *
 * Walks the scene graph from the start scene (following jumps) and renders
 * all dialogue, narration, and choice events in a clean, readable format.
 * Designed for proofreading, pacing review, and script export.
 *
 * Features:
 *  - Linear walk following jump events (BFS to avoid cycles)
 *  - Character filter to focus on one speaker at a time
 *  - Scene description notes shown as sidebars
 *  - Export to plain .txt  |  Copy to clipboard
 *  - Click scene header to jump back to the Scene Editor
 */
import React, { useMemo, useState, useCallback, useRef } from "react";
import type { VNProject, VNScene, VNEvent } from "./types";

interface ScriptReaderProps {
  project: VNProject;
  onEditScene: (id: string) => void;
}

// ── Walk the graph linearly ───────────────────────────────────────────────────

function walkScenes(project: VNProject): VNScene[] {
  const startId = project.start ?? project.scenes[0]?.id;
  if (!startId) return [...project.scenes];

  const visited = new Set<string>();
  const ordered: VNScene[] = [];
  const queue: string[] = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const sc = project.scenes.find(s => s.id === id);
    if (!sc) continue;
    ordered.push(sc);

    // Follow jump events in order
    for (const ev of sc.events) {
      if (ev.type === "jump" && ev.scene_id && !visited.has(ev.scene_id)) {
        queue.push(ev.scene_id);
      }
      if (ev.type === "choice") {
        for (const opt of ev.opts ?? []) {
          if (opt.scene && !visited.has(opt.scene)) {
            queue.push(opt.scene);
          }
        }
      }
      if (ev.type === "random") {
        for (const sid of ev.random_scenes ?? []) {
          if (sid && !visited.has(sid)) queue.push(sid);
        }
      }
    }
  }

  // Append any unreachable scenes at the end
  for (const sc of project.scenes) {
    if (!visited.has(sc.id)) ordered.push(sc);
  }

  return ordered;
}

// ── Render helpers ────────────────────────────────────────────────────────────

function charName(project: VNProject, ev: VNEvent): string {
  if (ev.char_id) {
    const c = project.characters.find(c => c.id === ev.char_id);
    if (c) return c.display || c.name;
  }
  return "";
}

function scriptText(project: VNProject, scenes: VNScene[], charFilter: string): string {
  const lines: string[] = [`${project.title}\n`, `Written with VNV Maker\n`, "=".repeat(60), ""];

  for (const sc of scenes) {
    lines.push(`\n[${sc.label.toUpperCase()}]`);
    if (sc.description) lines.push(`  // ${sc.description}`);
    lines.push("");

    for (const ev of sc.events) {
      const name = charName(project, ev);
      if (charFilter && name !== charFilter && ev.type !== "narration") continue;

      if (ev.type === "dialogue" && ev.text) {
        lines.push(name ? `${name.toUpperCase()}` : "");
        lines.push(`  "${ev.text}"`);
        lines.push("");
      } else if (ev.type === "narration" && ev.text) {
        if (!charFilter) {
          lines.push(`  [${ev.text}]`);
          lines.push("");
        }
      } else if (ev.type === "choice") {
        if (!charFilter) {
          if (ev.prompt) lines.push(`  >> ${ev.prompt}`);
          for (const opt of ev.opts ?? []) {
            const target = project.scenes.find(s => s.id === opt.scene);
            lines.push(`     • ${opt.text}${target ? ` → ${target.label}` : ""}`);
          }
          lines.push("");
        }
      }
    }
  }

  return lines.join("\n");
}

// ── Line counter ──────────────────────────────────────────────────────────────

function countLines(scenes: VNScene[], project: VNProject) {
  let dialogue = 0, narration = 0, choices = 0, words = 0;
  for (const sc of scenes) {
    for (const ev of sc.events) {
      if (ev.type === "dialogue") { dialogue++; words += (ev.text ?? "").split(/\s+/).filter(Boolean).length; }
      if (ev.type === "narration") { narration++; words += (ev.text ?? "").split(/\s+/).filter(Boolean).length; }
      if (ev.type === "choice") choices++;
    }
  }
  return { dialogue, narration, choices, words };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ScriptReader({ project, onEditScene }: ScriptReaderProps) {
  const [charFilter, setCharFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotes, setShowNotes] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const scenes = useMemo(() => walkScenes(project), [project]);
  const stats = useMemo(() => countLines(scenes, project), [scenes, project]);
  const wpm = 300;
  const readMins = Math.max(1, Math.round(stats.words / wpm));

  // Per-scene word counts for sidebar
  const sceneWordCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const sc of scenes) {
      let w = 0;
      for (const ev of sc.events) {
        if (ev.type === "dialogue" || ev.type === "narration") {
          w += (ev.text ?? "").split(/\s+/).filter(Boolean).length;
        }
      }
      map.set(sc.id, w);
    }
    return map;
  }, [scenes]);

  // IntersectionObserver to track which scene header is in view
  React.useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveSceneId((visible[0].target as HTMLElement).dataset.sceneId ?? "");
        }
      },
      { root: contentRef.current, threshold: 0.1, rootMargin: "-10% 0px -80% 0px" }
    );
    sceneRefs.current.forEach(el => observerRef.current!.observe(el));
    return () => observerRef.current?.disconnect();
  }, [scenes]);

  // Scroll to scene
  const scrollToScene = (id: string) => {
    const el = sceneRefs.current.get(id);
    if (el && contentRef.current) {
      contentRef.current.scrollTo({ top: el.offsetTop - 80, behavior: "smooth" });
    }
  };

  // All speakers
  const speakers = useMemo(() => {
    const names = new Set<string>();
    for (const sc of scenes) {
      for (const ev of sc.events) {
        const n = charName(project, ev);
        if (n) names.add(n);
      }
    }
    return [...names].sort();
  }, [scenes, project]);

  // Export
  const handleExport = useCallback(() => {
    const text = scriptText(project, scenes, charFilter);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.replace(/\s+/g, "_")}_script.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [project, scenes, charFilter]);

  const handleCopy = useCallback(async () => {
    const text = scriptText(project, scenes, charFilter);
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [project, scenes, charFilter]);

  const searchLower = searchQuery.toLowerCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg0)", overflow: "hidden" }}>

      {/* ── Toolbar ── */}
      <div style={{
        flexShrink: 0, padding: "8px 16px", borderBottom: "1px solid var(--bdr)",
        background: "var(--bg1)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        {/* Sidebar toggle */}
        <button className="btn btn-ghost btn-icon" style={{ fontSize: 13 }}
          onClick={() => setShowSidebar(v => !v)} title="Toggle scene navigator">☰</button>

        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>📜 Script Reader</span>

        {/* Stats */}
        <div style={{ display: "flex", gap: 10, marginLeft: 8 }}>
          {[
            { v: stats.dialogue, label: "dialogue", color: "var(--acc2)" },
            { v: stats.narration, label: "narration", color: "var(--teal)" },
            { v: stats.choices, label: "choices", color: "#f472b6" },
            { v: stats.words.toLocaleString(), label: "words", color: "var(--dim)" },
            { v: `~${readMins}m`, label: "read", color: "var(--faint)" },
          ].map(({ v, label, color }) => (
            <span key={label} style={{ fontSize: 11, color: "var(--faint)" }}>
              <span style={{ color, fontWeight: 700 }}>{v}</span> {label}
            </span>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <input
          className="input"
          placeholder="🔍 Search script…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: 180, fontSize: 11 }}
        />

        {/* Character filter */}
        <select className="input" value={charFilter} onChange={e => setCharFilter(e.target.value)} style={{ fontSize: 11 }}>
          <option value="">All characters</option>
          {speakers.map(sp => <option key={sp} value={sp}>{sp}</option>)}
        </select>

        {/* Notes toggle */}
        <button className="btn btn-ghost" style={{ fontSize: 11, color: showNotes ? "var(--teal)" : "var(--dim)" }}
          onClick={() => setShowNotes(v => !v)} title="Show/hide scene notes">
          📝 Notes
        </button>

        {/* Export */}
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={handleExport} title="Export as .txt">
          💾 .txt
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 11, color: copied ? "var(--teal)" : undefined }}
          onClick={handleCopy} title="Copy entire script to clipboard">
          {copied ? "✓ Copied!" : "⎘ Copy"}
        </button>
      </div>

      {/* ── Body: sidebar + script ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Scene nav sidebar */}
        {showSidebar && (
          <div style={{
            width: 220, flexShrink: 0,
            borderRight: "1px solid var(--bdr)",
            background: "var(--bg1)", overflowY: "auto",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: ".1em", textTransform: "uppercase", borderBottom: "1px solid var(--bdr)", background: "var(--bg2)" }}>
              {scenes.length} SCENES
            </div>
            {scenes.map((sc, i) => {
              const words = sceneWordCounts.get(sc.id) ?? 0;
              const isActive = sc.id === activeSceneId;
              return (
                <button
                  key={sc.id}
                  onClick={() => scrollToScene(sc.id)}
                  style={{
                    textAlign: "left", padding: "8px 12px", border: "none",
                    background: isActive ? "rgba(0,212,200,0.1)" : "transparent",
                    borderLeft: isActive ? "2px solid var(--teal)" : "2px solid transparent",
                    cursor: "pointer", transition: "all 0.1s",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? "var(--teal)" : "var(--text)", lineHeight: 1.3 }}>
                    <span style={{ fontSize: 9, color: "var(--faint)", marginRight: 6 }}>{i + 1}.</span>
                    {sc.label}
                  </div>
                  {words > 0 && (
                    <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 2, paddingLeft: 18 }}>
                      {words} words
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}


        {/* Scrollable script area */}
        <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "32px 0" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px" }}>

          {/* Title block */}
          <div style={{ textAlign: "center", marginBottom: 48, paddingBottom: 32, borderBottom: "2px solid var(--bdr)" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>
              {project.title}
            </div>
            {project.author && (
              <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 8 }}>by {project.author}</div>
            )}
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 16, display: "flex", justifyContent: "center", gap: 20 }}>
              <span>{scenes.length} scenes</span>
              <span>{project.characters.length} characters</span>
              <span>{stats.words.toLocaleString()} words</span>
              <span>~{readMins} min read</span>
            </div>
          </div>

          {/* Scenes */}
          {scenes.map((sc, scIdx) => {
            // Filter events to render
            const eventsToRender = sc.events.filter(ev => {
              if (!["dialogue", "narration", "choice"].includes(ev.type)) return false;
              if (charFilter) {
                const name = charName(project, ev);
                if (ev.type === "narration") return false;
                if (name !== charFilter) return false;
              }
              return true;
            });

            // Search filter: scene must have at least one match or contain the query in its label/description
            if (searchLower) {
              const sceneTextHit =
                sc.label.toLowerCase().includes(searchLower) ||
                (sc.description ?? "").toLowerCase().includes(searchLower) ||
                eventsToRender.some(ev => {
                  const name = charName(project, ev);
                  return (
                    (ev.text ?? "").toLowerCase().includes(searchLower) ||
                    (ev.prompt ?? "").toLowerCase().includes(searchLower) ||
                    name.toLowerCase().includes(searchLower) ||
                    (ev.opts ?? []).some(o => o.text.toLowerCase().includes(searchLower))
                  );
                });
              if (!sceneTextHit) return null;
            }

            if (eventsToRender.length === 0 && !sc.description) return null;

            return (
              <div key={sc.id} style={{ marginBottom: 48 }}
                ref={el => {
                  if (el) sceneRefs.current.set(sc.id, el);
                  else sceneRefs.current.delete(sc.id);
                }}
                data-scene-id={sc.id}
              >

                {/* Scene header */}
                <div
                  onClick={() => onEditScene(sc.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    marginBottom: 20, cursor: "pointer",
                    borderBottom: "1px solid var(--bdr)", paddingBottom: 10,
                  }}
                  title={`Edit scene: ${sc.label}`}
                >
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: ".12em",
                    color: "var(--faint)", textTransform: "uppercase",
                    background: "var(--bg2)", border: "1px solid var(--bdr)",
                    padding: "2px 8px", borderRadius: 4, flexShrink: 0,
                  }}>
                    {scIdx + 1}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1 }}>
                    {sc.label}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--faint)", opacity: 0 }}
                    className="edit-hint">✎ edit</span>
                  <style>{`.edit-hint { opacity: 0; transition: opacity 0.15s; } div:hover > .edit-hint { opacity: 1 !important; }`}</style>
                </div>

                {/* Scene description note */}
                {showNotes && sc.description && (
                  <div style={{
                    marginBottom: 20, padding: "10px 16px",
                    background: "rgba(251,191,36,0.05)",
                    border: "1px solid rgba(251,191,36,0.2)",
                    borderLeft: "3px solid rgba(251,191,36,0.5)",
                    borderRadius: 6, fontSize: 12, color: "var(--dim)",
                    fontStyle: "italic", lineHeight: 1.7,
                  }}>
                    {sc.description}
                  </div>
                )}

                {/* Events */}
                {eventsToRender.map((ev, evIdx) => {
                  const name = charName(project, ev);
                  const char = project.characters.find(c => charName(project, ev) === (c.display || c.name));

                  const highlight = (text: string) => {
                    if (!searchLower || !text.toLowerCase().includes(searchLower)) return text;
                    const i = text.toLowerCase().indexOf(searchLower);
                    return (
                      <>
                        {text.slice(0, i)}
                        <mark style={{ background: "rgba(250,204,21,0.35)", color: "#facc15", borderRadius: 2, padding: "0 1px" }}>
                          {text.slice(i, i + searchLower.length)}
                        </mark>
                        {text.slice(i + searchLower.length)}
                      </>
                    );
                  };

                  if (ev.type === "dialogue") {
                    return (
                      <div key={ev.id ?? evIdx} style={{ marginBottom: 20 }}>
                        {name && (
                          <div style={{
                            fontSize: 11, fontWeight: 800, letterSpacing: ".1em",
                            textTransform: "uppercase", marginBottom: 4,
                            color: char?.color ?? "var(--acc2)",
                          }}>
                            {highlight(name)}
                          </div>
                        )}
                        <div style={{
                          fontSize: 14, lineHeight: 1.8, color: "var(--text)",
                          paddingLeft: 16, borderLeft: `3px solid ${char?.color ?? "rgba(107,138,251,0.4)"}`,
                        }}>
                          {highlight(ev.text ?? "")}
                          {ev.voice && (
                            <span style={{ fontSize: 10, color: "var(--teal)", marginLeft: 10 }}>
                              🎙 {ev.voice.split("/").pop()}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (ev.type === "narration") {
                    return (
                      <div key={ev.id ?? evIdx} style={{
                        marginBottom: 20, fontSize: 13, lineHeight: 1.8,
                        color: "var(--dim)", fontStyle: "italic",
                        padding: "8px 16px",
                        background: "rgba(255,255,255,0.02)",
                        borderRadius: 4,
                      }}>
                        {highlight(ev.text ?? "")}
                      </div>
                    );
                  }

                  if (ev.type === "choice") {
                    return (
                      <div key={ev.id ?? evIdx} style={{ marginBottom: 24 }}>
                        {ev.prompt && (
                          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 10, fontStyle: "italic" }}>
                            {highlight(ev.prompt)}
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 16 }}>
                          {(ev.opts ?? []).map((opt, oi) => {
                            const target = project.scenes.find(s => s.id === opt.scene);
                            return (
                              <div key={oi} style={{
                                display: "flex", alignItems: "center", gap: 10,
                                padding: "6px 12px", borderRadius: 6,
                                background: "var(--bg2)", border: "1px solid var(--bdr)",
                              }}>
                                <span style={{ fontSize: 12, color: "#f472b6", flexShrink: 0 }}>◆</span>
                                <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>
                                  {highlight(opt.text)}
                                </span>
                                {target && (
                                  <span style={{ fontSize: 10, color: "var(--faint)", flexShrink: 0 }}>
                                    → {target.label}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            );
          })}

          {scenes.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--faint)", padding: 60, fontSize: 14 }}>
              No scenes found. Add scenes in the Graph tab to get started.
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
