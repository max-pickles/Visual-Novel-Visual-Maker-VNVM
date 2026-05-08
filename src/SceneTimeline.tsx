/**
 * SceneTimeline.tsx — Horizontal event strip for the SceneEditor.
 *
 * Shows all events in the current scene as colour-coded cards
 * with a scrubbing playhead. Clicking a card jumps to that event.
 * A Play button auto-advances the playhead every 1.5 s.
 */
import React, { useRef, useState, useEffect, useCallback } from "react";
import type { VNScene, VNEvent } from "./types";

// Colour map matching StatsView's EVENT_COLORS
const EV_COLORS: Record<string, string> = {
  dialogue:  "#00d4c8",
  narration: "#00d4c8",
  choice:    "#9c6bf7",
  jump:      "#4b6cfb",
  bg:        "#22c55e",
  image:     "#06b6d4",
  effect:    "#ec4899",
  music:     "#f97316",
  sound:     "#eab308",
  wait:      "#64748b",
  variable:  "#f43f5e",
  animation: "#f43f5e",
};

const EV_ICONS: Record<string, string> = {
  dialogue:  "💬",
  narration: "📖",
  choice:    "🔀",
  jump:      "➡️",
  bg:        "🖼",
  image:     "🎨",
  effect:    "✨",
  music:     "🎵",
  sound:     "🔊",
  wait:      "⏱",
  variable:  "📦",
  animation: "🎬",
};

function evType(ev: VNEvent): string {
  return (ev as any).type ?? "dialogue";
}
function evLabel(ev: VNEvent): string {
  return (ev as any).text?.slice(0, 24)
    ?? (ev as any).character?.slice(0, 18)
    ?? (ev as any).image?.slice(0, 18)
    ?? (ev as any).file?.slice(0, 18)
    ?? evType(ev);
}

interface Props {
  scene: VNScene;
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function SceneTimeline({ scene, activeIndex, onSelect }: Props) {
  const events     = (scene as any).events as VNEvent[] ?? [];
  const [playing, setPlaying] = useState(false);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Auto-scroll to keep active card visible
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.children[activeIndex] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeIndex]);

  // Playback
  const activeRef = useRef(activeIndex);
  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        const next = (activeRef.current + 1) % events.length;
        if (next === 0) setPlaying(false);
        onSelect(next);
      }, 1500);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, events.length, onSelect]);


  if (events.length < 2) return null;

  return (
    <div style={{
      height: 90, flexShrink: 0, background: "var(--bg0)",
      borderBottom: "1px solid var(--bdr)", display: "flex",
      alignItems: "center", overflow: "hidden",
    }}>
      {/* Play / Pause */}
      <button
        onClick={() => setPlaying(v => !v)}
        style={{
          width: 44, height: "100%", flexShrink: 0, border: "none",
          borderRight: "1px solid var(--bdr)", background: "transparent",
          color: playing ? "var(--acc2)" : "var(--dim)", fontSize: 20,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "color .15s",
        }}
        title={playing ? "Pause (auto-advance)" : "Play (auto-advance events)"}
      >
        {playing ? "⏸" : "▶"}
      </button>

      {/* Event strip */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, height: "100%", overflowX: "auto", overflowY: "hidden",
          display: "flex", alignItems: "center", gap: 4, padding: "0 8px",
          scrollbarWidth: "thin",
        }}
      >
        {events.map((ev, i) => {
          const type   = evType(ev);
          const color  = EV_COLORS[type] ?? "#64748b";
          const icon   = EV_ICONS[type]  ?? "●";
          const label  = evLabel(ev);
          const active = i === activeIndex;

          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              title={`${type}: ${label}`}
              style={{
                flexShrink: 0,
                minWidth: 56,
                maxWidth: 100,
                height: 70,
                borderRadius: 6,
                border: active ? `2px solid ${color}` : "1px solid var(--bdr)",
                background: active ? `${color}22` : "var(--bg2)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                padding: "4px 6px",
                transition: "all .15s",
                boxShadow: active ? `0 0 8px ${color}55` : "none",
                position: "relative",
              }}
            >
              {/* Colour strip at top */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: "5px 5px 0 0", opacity: 0.9 }} />
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: active ? color : "var(--dim)", letterSpacing: ".04em", textTransform: "uppercase" }}>{type}</span>
              <span style={{ fontSize: 8, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", textAlign: "center" }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Event count badge */}
      <div style={{
        width: 48, height: "100%", flexShrink: 0, borderLeft: "1px solid var(--bdr)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        color: "var(--faint)", fontSize: 10, gap: 2,
      }}>
        <span style={{ fontSize: 16, color: "var(--dim)" }}>{activeIndex + 1}</span>
        <span>of {events.length}</span>
      </div>
    </div>
  );
}
