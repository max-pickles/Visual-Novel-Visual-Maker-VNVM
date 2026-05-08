/**
 * QuickOpen.tsx — Godot EditorQuickOpenDialog-inspired Ctrl+P scene finder.
 *
 * Features ported from Godot:
 *  ✓ Fuzzy + substring match with configurable mode
 *  ✓ Matched characters highlighted in the result row (HighlightedLabel)
 *  ✓ History-ranked results — recently visited scenes float to top
 *  ✓ Keyboard navigation: ↑↓ to move, Enter to confirm, Esc to close
 *  ✓ On confirm → "fly-to-node": canvas pans+zooms to the selected scene
 *  ✓ Scene info: event count, character list, end badge
 *  ✓ File path / scene path shown at the bottom
 *  ✓ Blur backdrop to keep context
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { VNProject } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SceneCandidate {
  id: string;
  label: string;
  eventCount: number;
  isEnd: boolean;
  isStart: boolean;
  charNames: string[];
  /** Match score: higher = better. undefined = no match. */
  score: number | null;
  /** Character indices in label that matched the query */
  matchedIndices: number[];
  /** Is in recent history */
  isRecent: boolean;
  recentRank: number; // 0 = most recent
  /** First matching content line if the match came from event text */
  contentMatch?: string;
  /** Scene description for display */
  description?: string;
}

interface Props {
  project: VNProject;
  onFlyTo: (sceneId: string) => void;
  onEditScene: (sceneId: string) => void;
  onClose: () => void;
}

// ─── Fuzzy search ─────────────────────────────────────────────────────────────
// Port of Godot's FuzzySearch: subsequence match with bonus for consecutive chars.

function fuzzyMatch(
  query: string,
  target: string
): { score: number; indices: number[] } | null {
  if (!query) return { score: 0, indices: [] };

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring fast path
  const exactIdx = t.indexOf(q);
  if (exactIdx !== -1) {
    return {
      score: 1000 + (target.length - q.length) * -1, // longer match penalty
      indices: Array.from({ length: q.length }, (_, i) => exactIdx + i),
    };
  }

  // Subsequence match
  const indices: number[] = [];
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let lastTi = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      consecutive = ti === lastTi + 1 ? consecutive + 1 : 0;
      score += 10 + consecutive * 5;
      if (t[ti] === target[ti]) score += 2; // case match bonus
      lastTi = ti;
      qi++;
    }
  }

  if (qi < q.length) return null; // no match

  // Penalise for gaps
  score -= target.length * 0.5;
  return { score, indices };
}

// ─── Highlighted label ────────────────────────────────────────────────────────
// Port of Godot's HighlightedLabel: renders text with matched chars highlighted.

function HighlightedLabel({
  text,
  indices,
  style,
}: {
  text: string;
  indices: number[];
  style?: React.CSSProperties;
}) {
  const indexSet = new Set(indices);
  return (
    <span style={{ fontFamily: "inherit", ...style }}>
      {Array.from(text).map((ch, i) =>
        indexSet.has(i) ? (
          <mark
            key={i}
            style={{
              background: "rgba(75,108,247,0.35)",
              color: "#c7d4ff",
              borderRadius: 2,
              padding: "0 1px",
              fontWeight: 700,
            }}
          >
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </span>
  );
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({
  cand,
  active,
  onSelect,
  onConfirm,
}: {
  cand: SceneCandidate;
  active: boolean;
  onSelect: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      ref={ref}
      onMouseEnter={onSelect}
      onMouseDown={e => { e.preventDefault(); onConfirm(); }}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 14px",
        background: active ? "rgba(75,108,247,0.16)" : "transparent",
        borderLeft: active ? "2px solid #4b6cf7" : "2px solid transparent",
        cursor: "pointer",
        transition: "background 0.08s",
        userSelect: "none",
      }}
    >
      {/* Scene dot */}
      <div style={{
        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
        background: cand.isStart ? "#4ade80" : cand.isEnd ? "#f472b6" : "#4b6cf7",
        boxShadow: `0 0 6px ${cand.isStart ? "#4ade8080" : cand.isEnd ? "#f472b680" : "#4b6cf780"}`,
      }} />

      {/* Name */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <HighlightedLabel
          text={cand.label}
          indices={cand.matchedIndices}
          style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}
        />
        {cand.charNames.length > 0 && (
          <div style={{
            fontSize: 10.5, color: "var(--faint)", marginTop: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {cand.charNames.slice(0, 4).join(", ")}
            {cand.charNames.length > 4 && ` +${cand.charNames.length - 4}`}
          </div>
        )}
        {cand.contentMatch && (
          <div style={{
            fontSize: 10, color: "rgba(34,211,238,0.7)", marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontStyle: "italic",
          }}>
            "{cand.contentMatch}"
          </div>
        )}
      </div>

      {/* Right-side badges */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        {cand.contentMatch && !cand.isRecent && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#22d3ee",
            background: "rgba(34,211,238,0.12)", padding: "1px 5px",
            borderRadius: 3, letterSpacing: "0.05em",
          }}>
            CONTENT
          </span>
        )}
        {cand.isRecent && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#a78bfa",
            background: "rgba(167,139,250,0.12)", padding: "1px 5px",
            borderRadius: 3, letterSpacing: "0.05em",
          }}>
            RECENT
          </span>
        )}
        {cand.isStart && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#4ade80",
            background: "rgba(74,222,128,0.12)", padding: "1px 5px",
            borderRadius: 3,
          }}>
            START
          </span>
        )}
        {cand.isEnd && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#f472b6",
            background: "rgba(244,114,182,0.12)", padding: "1px 5px",
            borderRadius: 3,
          }}>
            END
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--dim)", minWidth: 28, textAlign: "right" }}>
          {cand.eventCount} ev
        </span>
      </div>
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

const HISTORY_KEY = "vnv_quickopen_history";
const MAX_HISTORY = 20;
const MAX_RESULTS = 30;

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
}

function pushHistory(id: string) {
  const h = [id, ...loadHistory().filter(x => x !== id)].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

export function QuickOpen({ project, onFlyTo, onEditScene, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [fuzzyMode, setFuzzyMode] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useMemo(loadHistory, []);

  // Build all scene candidates (memoised on project scenes only)
  const allCandidates = useMemo<Omit<SceneCandidate, "score" | "matchedIndices">[]>(() => {
    const charById: Record<string, string> = {};
    project.characters.forEach(c => { charById[c.id] = c.name; });

    return project.scenes.map(sc => {
      const charSet = new Set<string>();
      (sc.events ?? []).forEach(ev => {
        if ((ev as any).char_id) charSet.add((ev as any).char_id);
      });

      const hasJump = (sc.events ?? []).some(ev => ev.type === "jump" || ev.type === "choice");
      const isEnd = !hasJump;

      // Build a searchable content index: collect dialogue/narration snippets
      const contentLines: string[] = [];
      (sc.events ?? []).forEach(ev => {
        if ((ev.type === "dialogue" || ev.type === "narration") && (ev as any).text) {
          contentLines.push((ev as any).text as string);
        }
      });

      const historyIdx = history.indexOf(sc.id);
      return {
        id: sc.id,
        label: sc.label,
        description: (sc as any).description as string | undefined,
        eventCount: (sc.events ?? []).length,
        isEnd,
        isStart: project.start === sc.id,
        charNames: [...charSet].map(cid => charById[cid] ?? cid).filter(Boolean),
        isRecent: historyIdx !== -1,
        recentRank: historyIdx === -1 ? 999 : historyIdx,
        contentLines,
        contentMatch: undefined as string | undefined,
      };
    });
  }, [project.scenes, project.characters, project.start]);

  // Score + filter + sort on every query change
  const results = useMemo<SceneCandidate[]>(() => {
    const scored: SceneCandidate[] = (allCandidates as any[]).map((c: any) => {
      if (!query) {
        return { ...c, score: null, matchedIndices: [], contentMatch: undefined };
      }
      const m = fuzzyMode
        ? fuzzyMatch(query, c.label)
        : (c.label.toLowerCase().includes(query.toLowerCase())
            ? { score: 500, indices: (() => {
                const idx = c.label.toLowerCase().indexOf(query.toLowerCase());
                return Array.from({ length: query.length }, (_, i) => idx + i);
              })() }
            : null);

      // Content search: look inside dialogue/narration text
      let contentMatch: string | undefined;
      let contentScore = 0;
      if (c.contentLines) {
        const ql = query.toLowerCase();
        for (const line of c.contentLines as string[]) {
          if (line.toLowerCase().includes(ql)) {
            contentMatch = line.length > 80 ? line.slice(0, 80) + "…" : line;
            contentScore = 200; // content match bonus
            break;
          }
        }
      }

      const totalScore = (m?.score ?? 0) + contentScore;
      const hasMatch = m !== null || contentMatch !== undefined;

      return {
        ...c,
        score: hasMatch ? totalScore : null,
        matchedIndices: m?.indices ?? [],
        contentMatch,
      };
    });

    // Filter out non-matches when querying
    const filtered = query ? scored.filter(c => c.score !== null) : scored;

    // Sort: recent first (when no query), then by score desc, then alpha
    filtered.sort((a, b) => {
      if (!query) {
        // History-ranked first
        if (a.recentRank !== b.recentRank) return a.recentRank - b.recentRank;
        return a.label.localeCompare(b.label);
      }
      if (a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);
      return a.label.localeCompare(b.label);
    });

    return filtered.slice(0, MAX_RESULTS);
  }, [allCandidates, query, fuzzyMode]);

  // Clamp active index
  useEffect(() => {
    setActiveIdx(prev => Math.min(prev, Math.max(0, results.length - 1)));
  }, [results]);

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  const confirm = useCallback((id: string) => {
    pushHistory(id);
    onFlyTo(id);
    onClose();
  }, [onFlyTo, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results[activeIdx]) { confirm(results[activeIdx].id); }
    // Tab: edit scene instead of fly-to
    if (e.key === "Tab" && results[activeIdx]) {
      e.preventDefault();
      pushHistory(results[activeIdx].id);
      onEditScene(results[activeIdx].id);
      onClose();
    }
  }, [results, activeIdx, confirm, onEditScene, onClose]);

  const active = results[activeIdx];

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onMouseDown={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 99000,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* ── Dialog ── */}
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "18%", left: "50%",
          transform: "translateX(-50%)",
          width: "min(640px, 90vw)",
          zIndex: 99001,
          borderRadius: 12,
          background: "var(--bg1, #141824)",
          border: "1px solid var(--bdr, #2a3050)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          maxHeight: "64vh",
          animation: "qo-in 0.14s cubic-bezier(.22,1,.36,1)",
        }}
      >
        <style>{`
          @keyframes qo-in {
            from { opacity:0; transform:translateX(-50%) translateY(-8px) scale(0.97); }
            to   { opacity:1; transform:translateX(-50%) translateY(0)     scale(1);    }
          }
        `}</style>

        {/* ── Search bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px",
          borderBottom: "1px solid var(--bdr)",
          flexShrink: 0,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="var(--dim)" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search scenes…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: 14, color: "var(--text)", caretColor: "#4b6cf7",
            }}
          />
          {/* Mode toggle */}
          <button
            onClick={() => setFuzzyMode(v => !v)}
            title={fuzzyMode ? "Fuzzy matching ON" : "Exact matching"}
            style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px",
              borderRadius: 4, border: "1px solid var(--bdr)",
              background: fuzzyMode ? "rgba(75,108,247,0.18)" : "transparent",
              color: fuzzyMode ? "#93b4ff" : "var(--dim)",
              cursor: "pointer", flexShrink: 0,
              transition: "all 0.12s",
            }}
          >
            {fuzzyMode ? "FUZZY" : "EXACT"}
          </button>
          <span style={{ fontSize: 10, color: "var(--faint)", flexShrink: 0 }}>
            {results.length}/{project.scenes.length}
          </span>
        </div>

        {/* ── Result list ── */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {results.length === 0 ? (
            <div style={{
              padding: "32px 0", textAlign: "center",
              color: "var(--faint)", fontSize: 13,
            }}>
              No scenes match "{query}"
            </div>
          ) : (
            results.map((c, i) => (
              <ResultRow
                key={c.id}
                cand={c}
                active={i === activeIdx}
                onSelect={() => setActiveIdx(i)}
                onConfirm={() => confirm(c.id)}
              />
            ))
          )}
        </div>

        {/* ── Footer: path + hints ── */}
        <div style={{
          padding: "8px 14px",
          borderTop: "1px solid var(--bdr)",
          display: "flex", alignItems: "center", gap: 12,
          flexShrink: 0, flexWrap: "wrap",
        }}>
          {/* Scene path */}
          <span style={{
            fontSize: 10.5, color: "var(--faint)", flex: 1, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {active
              ? active.description
                ? `📝 ${active.description}`
                : `scenes / ${active.label}  ·  ${active.eventCount} events`
              : `${project.scenes.length} scenes total`}
          </span>

          {/* Keyboard hints */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Hint keys={["↑↓"]} label="navigate" />
            <Hint keys={["↵"]} label="fly-to" />
            <Hint keys={["Tab"]} label="edit" />
            <Hint keys={["Esc"]} label="close" />
          </div>
        </div>
      </div>
    </>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {keys.map(k => (
        <kbd key={k} style={{
          fontSize: 9, padding: "1px 4px", borderRadius: 3,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid var(--bdr)",
          color: "var(--dim)", fontFamily: "inherit",
        }}>{k}</kbd>
      ))}
      <span style={{ fontSize: 10, color: "var(--faint)" }}>{label}</span>
    </span>
  );
}
