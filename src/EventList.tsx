/**
 * EventList.tsx — Readable vertical event list for SceneEditor.
 * Each row: # | color bar | icon | type | char name | text preview.
 * Supports click-to-select, keyboard nav, drag-to-reorder,
 * drag-from-toolbar to insert, and click-to-insert (armed tool mode).
 */
import React, { useRef, useState } from "react";
import type { VNEvent, VNProject, EventType } from "./types";
import { useTranslation } from "./translationContext";

const COLORS: Record<string, string> = {
  dialogue:"#4b6cf7", narration:"#a78bfa", choice:"#f472b6",
  jump:"#00d4c8", wait:"#64748b", bg:"#22c55e",
  image:"#34d399", music:"#f59e0b", sfx:"#fb923c",
  effect:"#e879f9", setvar:"#60a5fa", if:"#fbbf24",
  animation:"#f43f5e", random:"#f97316", camera:"#a3e635",
  raw:"#475569", achievement:"#facc15",
};
const ICONS: Record<string, string> = {
  dialogue:"💬", narration:"📖", choice:"🔀", jump:"➡️",
  wait:"⏱", bg:"🖼", image:"🎨", music:"🎵",
  sfx:"🔊", effect:"✨", setvar:"📦", if:"🔂", animation:"🎬",
  random:"🎲", camera:"🎥", raw:"💻", achievement:"🏆", "":"○",
};

interface Props {
  events: VNEvent[];
  project: VNProject;
  selectedIdx: number | null;
  onSelect: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (i: number) => void;
  onDuplicate: (i: number) => void;
  /** Set when a tool-button is armed (clicked) in the toolbar */
  armedToolType?: EventType | null;
  /** Called when the user drops/places a toolbar button in the list */
  onToolDrop?: (type: EventType, insertAt: number) => void;
}

export function EventList({
  events, project, selectedIdx,
  onSelect, onMove, onDelete, onDuplicate,
  armedToolType, onToolDrop,
}: Props) {
  const { t } = useTranslation();
  const dragIdx = useRef<number | null>(null);

  // Index of the gap being hovered over (shared by both drag and armed-tool modes)
  const [hoverGap, setHoverGap] = useState<number | null>(null);

  // The active tool for insertion visuals
  const activeTool = armedToolType ?? null;
  const dropColor  = activeTool ? (COLORS[activeTool] ?? "#4b6cf7") : "#4b6cf7";

  function evSummary(ev: VNEvent): { char: string; text: string } {
    if (ev.type === "dialogue" || ev.type === "narration") {
      const char = project.characters.find(c => c.id === ev.char_id);
      return { char: char?.display ?? char?.name ?? "", text: ev.text ?? "" };
    }
    if (ev.type === "choice") return { char: "", text: ev.prompt ?? `${ev.opts?.length ?? 0} choices` };
    if (ev.type === "jump")   return { char: "", text: `→ ${ev.scene_id ?? "?"}` };
    if (ev.type === "bg")     return { char: "", text: ev.bg ?? "" };
    if (ev.type === "music")  return { char: "", text: ev.music ?? "" };
    if (ev.type === "sfx")    return { char: "", text: ev.sfx ?? "" };
    if (ev.type === "effect") return { char: "", text: ev.kind ?? "" };
    if (ev.type === "wait")   return { char: "", text: `${ev.dur ?? 1}s` };
    if (ev.type === "setvar") return { char: "", text: `${ev.var_name} = ${ev.var_val}` };
    if (ev.type === "if")     return { char: "", text: ev.condition ?? "" };
    if (ev.type === "image")  return { char: "", text: ev.image ?? "(no image)" };
    if (ev.type === "animation") return { char: "", text: ev.image ? `${ev.image} (${ev.animation_keyframes?.length || 0} frames)` : "(no image)" };
    return { char: "", text: "" };
  }

  function handleGapInsert(gapIdx: number) {
    if (activeTool && onToolDrop) {
      onToolDrop(activeTool, gapIdx);
      setHoverGap(null);
    }
  }

  // ── Insertion line component ──────────────────────────────────────────────
  function InsertionLine({ gapIdx }: { gapIdx: number }) {
    const isToolActive = activeTool != null && hoverGap === gapIdx;
    const isDragActive = activeTool == null && hoverGap === gapIdx && dragIdx.current !== null;
    const isActive = isToolActive || isDragActive;
    return (
      <div
        // Armed-tool click-to-insert
        onMouseEnter={() => { if (armedToolType) setHoverGap(gapIdx); }}
        onMouseLeave={() => { if (armedToolType) setHoverGap(null); }}
        onClick={e => {
          if (armedToolType) { e.stopPropagation(); handleGapInsert(gapIdx); }
        }}
        style={{
          width: isActive ? (isDragActive ? 24 : 76) : 6,
          height: "100%",
          flexShrink: 0,
          position: "relative",
          transition: "width 0.12s ease",
          zIndex: isActive ? 10 : 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: armedToolType ? "crosshair" : "default",
        }}
      >
        {isDragActive && (
          <div style={{ width: 4, height: 72, background: "var(--teal)", borderRadius: 2, boxShadow: "0 0 12px var(--teal)" }} />
        )}
        {isToolActive && (
          <div style={{
            width: 72, height: 72,
            border: `2px dashed ${dropColor}`,
            borderRadius: 8,
            background: `${dropColor}22`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 12px ${dropColor}44`,
            color: dropColor,
            animation: "pulse 1.5s infinite"
          }}>
            <span style={{ fontSize: 24, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
              {ICONS[activeTool!] ?? "+"}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "capitalize", marginTop: 4 }}>
              {activeTool}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (events.length === 0) {
    return (
      <div
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
          gap: 8, color: "var(--faint)", padding: 24, position: "relative",
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "78px 78px", backgroundPosition: "15px center",
          cursor: armedToolType ? "crosshair" : "default",
          outline: armedToolType ? `2px dashed ${dropColor}66` : "none",
          outlineOffset: -8,
        }}
        onClick={() => { if (armedToolType) handleGapInsert(0); }}
      >
        {activeTool ? (
          <>
            <div style={{
              position: "absolute", inset: 8, border: `2px dashed ${dropColor}`,
              borderRadius: 10, background: `${dropColor}11`,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 8,
              boxShadow: `0 0 24px ${dropColor}33`,
              animation: "pulse 2s infinite"
            }}>
              <span style={{ fontSize: 28 }}>{ICONS[activeTool] ?? "+"}</span>
              <span style={{ fontSize: 12, color: dropColor, fontWeight: 700, textTransform: "capitalize" }}>
                {armedToolType ? `${t('editor.scene.armed_click')} ${activeTool}` : `${t('editor.scene.armed_drop')} ${activeTool}`}
              </span>
            </div>
          </>
        ) : (
          <>
            <span style={{ fontSize: 32 }}>📭</span>
            <span style={{ fontSize: 12 }}>{t('editor.scene.no_events')}</span>
            <span style={{ fontSize: 11, color: "var(--bdr)" }}>{t('editor.scene.add_hint')}</span>
          </>
        )}
      </div>
    );
  }

  // ── Populated list ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", flexDirection: "row",
        padding: "8px 12px", alignItems: "center",
        backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "78px 78px",
        backgroundPosition: "15px center",
        cursor: armedToolType ? "crosshair" : "default",
      }}
      onMouseMove={e => {
        if (armedToolType && e.target === e.currentTarget) {
          setHoverGap(events.length);
        }
      }}
      onClick={e => {
        if (armedToolType && e.target === e.currentTarget) {
          handleGapInsert(events.length);
        }
      }}
    >
      {/* Gap BEFORE first item */}
      <InsertionLine gapIdx={0} />

      {events.map((ev, i) => {
        const isSel  = i === selectedIdx;
        const color  = COLORS[ev.type] ?? "#64748b";
        const icon   = ICONS[ev.type]  ?? "○";
        const { char } = evSummary(ev);
        const isEmpty = !ev.type;

        return (
          <React.Fragment key={ev.id ?? i}>
            <div
              draggable={!armedToolType}
              onDragStart={() => { dragIdx.current = i; }}
              onDragEnter={e => e.preventDefault()}
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (!armedToolType) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mid  = rect.left + rect.width / 2;
                  setHoverGap(e.clientX < mid ? i : i + 1);
                }
              }}
              onDragLeave={e => {
                if (!armedToolType) setHoverGap(null);
              }}
              onDrop={e => {
                e.stopPropagation();
                e.preventDefault();
                if (dragIdx.current !== null && dragIdx.current !== i) {
                  onMove(dragIdx.current, i);
                  dragIdx.current = null;
                }
              }}
              // Armed tool: hovering an event block previews the nearest gap
              onMouseEnter={e => {
                if (armedToolType) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mid  = rect.left + rect.width / 2;
                  setHoverGap(e.clientX < mid ? i : i + 1);
                }
              }}
              onMouseMove={e => {
                if (armedToolType) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mid  = rect.left + rect.width / 2;
                  setHoverGap(e.clientX < mid ? i : i + 1);
                }
              }}
              onMouseLeave={() => { if (armedToolType) setHoverGap(null); }}
              onClick={e => {
                if (armedToolType) {
                  // Insert at the side of the card the mouse is on
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos  = e.clientX < rect.left + rect.width / 2 ? i : i + 1;
                  e.stopPropagation();
                  handleGapInsert(pos);
                } else {
                  onSelect(i);
                }
              }}
              style={{
                width: 72, height: 72,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                cursor: armedToolType ? "crosshair" : "pointer",
                userSelect: "none",
                background: isSel ? "rgba(75,108,247,0.15)" : "var(--bg2)",
                border: isSel ? `1px solid ${color}` : "1px solid var(--bdr)",
                borderRadius: 8,
                transition: "all .1s",
                opacity: isEmpty ? 0.5 : 1,
                flexShrink: 0,
                position: "relative",
                overflow: "hidden",
              }}
              onPointerEnter={(e: React.PointerEvent<HTMLDivElement>) => {
                if (!isSel && !armedToolType) {
                  (e.currentTarget as HTMLElement).style.background = "var(--hover)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
                }
              }}
              onPointerLeave={(e: React.PointerEvent<HTMLDivElement>) => {
                if (!isSel && !armedToolType) {
                  (e.currentTarget as HTMLElement).style.background = "var(--bg2)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                }
              }}
            >
              {/* Color accent bar top */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: color, opacity: isSel ? 1 : 0.7 }} />

              {/* Line number */}
              <div style={{ position: "absolute", top: 6, left: 6, fontSize: 9, color: "var(--faint)", fontFamily: "var(--mono)" }}>
                {i + 1}
              </div>

              {/* Icon */}
              <div style={{ fontSize: 24, marginTop: 4 }}>
                {icon}
              </div>

              {/* Text / Char */}
              <div style={{ fontSize: 9, color: isSel ? "#fff" : "var(--dim)", width: "100%", textAlign: "center", padding: "0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 4, fontWeight: isSel ? 600 : 400 }}>
                {char || (ev.type ? t(`events.${ev.type}`) : "empty")}
              </div>

              {/* Actions (visible on select, hidden in armed mode) */}
              {isSel && !armedToolType && (
                <div style={{ position: "absolute", top: 4, right: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                  <button onClick={e => { e.stopPropagation(); onDelete(i); }}
                    title="Delete" style={{ background: "var(--bg1)", border: "none", color: "var(--err)", cursor: "pointer", fontSize: 10, width: 16, height: 16, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✕</button>
                </div>
              )}
            </div>

            {/* Gap AFTER this item */}
            <InsertionLine gapIdx={i + 1} />
          </React.Fragment>
        );
      })}
    </div>
  );
}
