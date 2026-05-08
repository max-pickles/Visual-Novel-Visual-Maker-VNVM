/**
 * Minimap.tsx — Thumbnail-scale canvas overview with interactive viewport panning.
 * Ported from bmf-vangard-renpy-ide-main/components/Minimap.tsx
 * Re-styled with VNVMAKER CSS variables (no Tailwind).
 */
import React, { useRef, useMemo, useCallback } from "react";
import { useTranslation } from "./translationContext";

export interface MinimapItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "vn_scene" | "folder" | "start" | "end" | string;
}

interface MinimapProps {
  items: MinimapItem[];
  pan: { x: number; y: number };
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  onPanChange: (pan: { x: number; y: number }) => void;
}

const W = 220;
const H = 160;
const PAD = 16;

const ITEM_COLOR: Record<string, string> = {
  vn_scene: "rgba(74,222,128,0.65)",   // green
  folder:   "rgba(212,150,30,0.65)",   // amber
  start:    "rgba(34,211,238,0.8)",    // teal
  end:      "rgba(167,139,250,0.65)",  // purple
};
const DEFAULT_COLOR = "rgba(99,102,241,0.5)";

export function Minimap({ items, pan, zoom, canvasWidth, canvasHeight, onPanChange }: MinimapProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ active: boolean; startX: number; startY: number; initPanX: number; initPanY: number }>({
    active: false, startX: 0, startY: 0, initPanX: 0, initPanY: 0,
  });

  // ── Compute bounding box + scale ────────────────────────────────────────────
  const { bounds, mmScale } = useMemo(() => {
    if (items.length === 0) return { bounds: { minX: 0, minY: 0, w: 1, h: 1 }, mmScale: 1 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });
    const cw = maxX - minX || 1;
    const ch = maxY - minY || 1;
    const scale = Math.min((W - PAD * 2) / cw, (H - PAD * 2) / ch);
    return { bounds: { minX, minY, w: cw, h: ch }, mmScale: scale };
  }, [items]);

  const contentW = bounds.w * mmScale;
  const contentH = bounds.h * mmScale;
  const offsetX  = (W - contentW) / 2;
  const offsetY  = (H - contentH) / 2;

  // ── Viewport rectangle ──────────────────────────────────────────────────────
  const viewportStyle = useMemo<React.CSSProperties>(() => {
    if (!canvasWidth || !canvasHeight) return {};
    const vw = canvasWidth  / zoom;
    const vh = canvasHeight / zoom;
    const vx = -pan.x / zoom;
    const vy = -pan.y / zoom;
    return {
      position: "absolute",
      left:   (vx - bounds.minX) * mmScale + offsetX,
      top:    (vy - bounds.minY) * mmScale + offsetY,
      width:  vw * mmScale,
      height: vh * mmScale,
      border: "1.5px solid rgba(75,108,247,0.85)",
      background: "rgba(75,108,247,0.12)",
      cursor: "grab",
      transition: "all 0.1s ease-out",
    };
  }, [pan, zoom, canvasWidth, canvasHeight, bounds, mmScale, offsetX, offsetY]);

  // ── Click-to-jump pan ───────────────────────────────────────────────────────
  const handleClick = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = (mx - offsetX) / mmScale + bounds.minX;
    const worldY = (my - offsetY) / mmScale + bounds.minY;
    onPanChange({
      x: canvasWidth  / 2 - worldX * zoom,
      y: canvasHeight / 2 - worldY * zoom,
    });
  }, [bounds, mmScale, offsetX, offsetY, canvasWidth, canvasHeight, zoom, onPanChange]);

  // ── Viewport drag ───────────────────────────────────────────────────────────
  const handleViewportDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, initPanX: pan.x, initPanY: pan.y };
    el.style.cursor = "grabbing";

    const onMove = (me: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = me.clientX - drag.current.startX;
      const dy = me.clientY - drag.current.startY;
      onPanChange({
        x: drag.current.initPanX - (dx / mmScale) * zoom,
        y: drag.current.initPanY - (dy / mmScale) * zoom,
      });
    };
    const onUp = () => {
      drag.current.active = false;
      el.style.cursor = "grab";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [pan, mmScale, zoom, onPanChange]);

  return (
    <div
      ref={rootRef}
      onPointerDown={handleClick}
      title="Minimap — click or drag to navigate"
      style={{
        width: W, height: H,
        background: "rgba(13,18,32,0.88)",
        border: "1px solid var(--bdr, #2a3050)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        backdropFilter: "blur(10px)",
        overflow: "hidden",
        position: "relative",
        cursor: "crosshair",
        userSelect: "none",
      }}
    >
      {/* Header label */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        padding: "3px 8px",
        fontSize: 9, fontWeight: 700, letterSpacing: 1,
        color: 'var(--dim)', textTransform: 'uppercase', paddingLeft: 2,
        background: "rgba(0,0,0,0.3)",
      }}>{t('canvas.minimap')}</div>

      {/* Node dots */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {items.map((n) => (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left:   (n.x - bounds.minX) * mmScale + offsetX,
              top:    (n.y - bounds.minY) * mmScale + offsetY,
              width:  Math.max(3, n.w * mmScale),
              height: Math.max(3, n.h * mmScale),
              borderRadius: 2,
              background: ITEM_COLOR[n.kind] ?? DEFAULT_COLOR,
            }}
          />
        ))}

        {/* Viewport rectangle */}
        <div onPointerDown={handleViewportDown} style={viewportStyle} />
      </div>
    </div>
  );
}
