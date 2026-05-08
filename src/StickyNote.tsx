/**
 * StickyNote.tsx — Draggable, resizable author note for StoryCanvas.
 * Ported from bmf-vangard-renpy-ide-main/components/StickyNote.tsx
 * Re-styled with VNVMAKER inline CSS (no Tailwind).
 */
import React, { useState, useRef } from "react";
import type { VNStickyNote, NoteColor } from "./types";

interface StickyNoteProps {
  note: VNStickyNote;
  zoom: number;
  onUpdate: (data: Partial<VNStickyNote>) => void;
  onDelete: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}

const COLOR_MAP: Record<NoteColor, { bg: string; header: string; border: string; text: string }> = {
  yellow: { bg: "rgba(254,243,199,0.92)", header: "rgba(253,230,138,0.95)", border: "#fbbf24", text: "#78350f" },
  blue:   { bg: "rgba(219,234,254,0.92)", header: "rgba(191,219,254,0.95)", border: "#60a5fa", text: "#1e3a5f" },
  green:  { bg: "rgba(220,252,231,0.92)", header: "rgba(187,247,208,0.95)", border: "#4ade80", text: "#14532d" },
  pink:   { bg: "rgba(252,231,243,0.92)", header: "rgba(249,207,232,0.95)", border: "#f472b6", text: "#831843" },
  purple: { bg: "rgba(243,232,255,0.92)", header: "rgba(233,213,255,0.95)", border: "#c084fc", text: "#581c87" },
  red:    { bg: "rgba(254,226,226,0.92)", header: "rgba(254,202,202,0.95)", border: "#f87171", text: "#7f1d1d" },
};
const NOTE_COLORS: NoteColor[] = ["yellow", "blue", "green", "pink", "purple", "red"];

export function StickyNote({ note, zoom, onUpdate, onDelete, onDragStart }: StickyNoteProps) {
  const c = COLOR_MAP[note.color] ?? COLOR_MAP.yellow;
  const [colorOpen, setColorOpen] = useState(false);
  const resizeRef = useRef<{ active: boolean; startX: number; startY: number; initW: number; initH: number }>({
    active: false, startX: 0, startY: 0, initW: note.width, initH: note.height,
  });

  const handleResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);
    resizeRef.current = { active: true, startX: e.clientX, startY: e.clientY, initW: note.width, initH: note.height };

    const onMove = (me: PointerEvent) => {
      if (!resizeRef.current.active) return;
      const dx = (me.clientX - resizeRef.current.startX) / zoom;
      const dy = (me.clientY - resizeRef.current.startY) / zoom;
      onUpdate({
        width:  Math.max(140, resizeRef.current.initW + dx),
        height: Math.max(100, resizeRef.current.initH + dy),
      });
    };
    const onUp = () => {
      resizeRef.current.active = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      data-sticky-id={note.id}
      style={{
        position: "absolute",
        left: note.x, top: note.y,
        width: note.width, height: note.height,
        background: c.bg,
        border: `2px solid ${c.border}`,
        borderRadius: 10,
        display: "flex", flexDirection: "column",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Drag handle / header */}
      <div
        className="sticky-drag-handle"
        onPointerDown={onDragStart}
        style={{
          height: 28, background: c.header,
          borderBottom: `1px solid ${c.border}`,
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px", cursor: "grab", flexShrink: 0,
        }}
      >
        {/* Color dot */}
        <div style={{ position: "relative" }}>
          <button
            title="Change color"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setColorOpen((o) => !o)}
            style={{
              width: 12, height: 12, borderRadius: "50%",
              background: c.border, border: "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer", padding: 0,
            }}
          />
          {colorOpen && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute", top: 18, left: 0,
                background: "#1a2036", border: "1px solid var(--bdr)",
                borderRadius: 8, padding: "6px", display: "flex", gap: 4,
                zIndex: 9999, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}>
              {NOTE_COLORS.map((nc) => (
                <button
                  key={nc}
                  title={nc}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onUpdate({ color: nc }); setColorOpen(false); }}
                  style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: COLOR_MAP[nc].border,
                    border: nc === note.color ? "2px solid #fff" : "1px solid rgba(0,0,0,0.2)",
                    cursor: "pointer", padding: 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          title="Delete note"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: "transparent", border: "none",
            color: `${c.text}60`, cursor: "pointer",
            fontSize: 14, lineHeight: 1, padding: 0,
            display: "flex", alignItems: "center",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
          onMouseLeave={(e) => (e.currentTarget.style.color = `${c.text}60`)}
        >×</button>
      </div>

      {/* Text area */}
      <textarea
        value={note.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        placeholder="Type a note…"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          flex: 1, background: "transparent", border: "none",
          resize: "none", padding: "8px 10px",
          fontSize: 12, lineHeight: 1.5,
          color: c.text, outline: "none",
          fontFamily: "inherit",
        }}
      />

      {/* Resize handle */}
      <div
        onPointerDown={handleResizeDown}
        style={{
          position: "absolute", bottom: 0, right: 0,
          width: 14, height: 14, cursor: "nwse-resize",
          background: `linear-gradient(135deg, transparent 50%, ${c.border} 50%)`,
          borderBottomRightRadius: 8,
        }}
      />
    </div>
  );
}
