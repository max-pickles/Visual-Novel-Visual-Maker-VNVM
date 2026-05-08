/**
 * ScenePreview.tsx — Full VN-style canvas preview for SceneEditor.
 * Resolves Ren'Py image tag names to files via fuzzy candidate matching.
 * Supports zoom (Ctrl+wheel or buttons) and always shows a 16:9 canvas.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { VNEvent, VNProject } from "./types";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { GuiConfig } from "./guiParser";
import { useTranslation } from "./translationContext";

interface Props {
  events: VNEvent[];
  selectedIdx: number | null;
  project: VNProject;
  rootPath: string;
  inheritedBg?:     string | null;
  inheritedSprite?: string | null;
  guiCfg?: GuiConfig | null;
  showGuides?: boolean;
  /** CSS filter string from color grade (e.g. 'saturate(0.3) brightness(0.6)') */
  colorGradeFilter?: string;
  /** Called when the user clicks a bg or sprite image while that event type is selected. */
  onImageClick?: (field: "bg" | "image") => void;
  /** Called when the user clicks a choice button to navigate to another scene. */
  onNavigateToScene?: (sceneId: string) => void;
  /** Called to manually set the current event as the scene thumbnail snapshot */
  onSetThumbnail?: (eventId: string) => void;
  /** Whether the currently selected event is the manual thumbnail */
  isCurrentThumbnail?: boolean;
}

// ── Image resolution ──────────────────────────────────────────────────────────

const EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

/** Generate candidate file URLs for a Ren'Py image name or partial path. */
function candidates(rootPath: string, name: string): string[] {
  if (!name || !rootPath) return [];
  const norm = name.replace(/\s+/g, "_");
  const urls: string[] = [];
  for (const base of [name, norm]) {
    if (/\.[a-zA-Z]{2,5}$/.test(base)) {
      // Has extension — try direct, game/, game/images/, and images/ paths
      urls.push(convertFileSrc(`${rootPath}/${base}`));
      if (!base.startsWith("game/")) {
        urls.push(convertFileSrc(`${rootPath}/game/${base}`));
        urls.push(convertFileSrc(`${rootPath}/game/images/${base}`));
      }
      if (!base.startsWith("images/")) urls.push(convertFileSrc(`${rootPath}/images/${base}`));
    } else {
      // No extension — try game/images/ first (most common for Ren'Py projects)
      for (const ext of EXTS) {
        urls.push(convertFileSrc(`${rootPath}/game/images/${base}${ext}`));
        urls.push(convertFileSrc(`${rootPath}/images/${base}${ext}`));
        urls.push(convertFileSrc(`${rootPath}/${base}${ext}`));
      }
    }
  }
  return [...new Set(urls)];
}

/** Hook that resolves an image name to a working URL by trying candidates. */
function useResolvedImage(rootPath: string, name: string | null) {
  const list = useMemo(() => (name ? candidates(rootPath, name) : []), [rootPath, name]);
  const [idx, setIdx]     = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setIdx(0); setFailed(false); }, [list.join("|")]);

  const url    = (!failed && list.length > 0) ? list[idx] ?? null : null;
  const onErr  = useCallback(() => {
    if (idx + 1 < list.length) setIdx(i => i + 1);
    else setFailed(true);
  }, [idx, list.length]);

  return { url, onErr };
}

// ── State tracker ─────────────────────────────────────────────────────────────

const RENPY_COLORS = new Set(["black", "white", "transparent"]);

function parseRenpyRichText(text: string) {
  if (!text) return "";
  let html = text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "<br/>")
    .replace(/\{b\}/g, "<b>")
    .replace(/\{\/b\}/g, "</b>")
    .replace(/\{i\}/g, "<i>")
    .replace(/\{\/i\}/g, "</i>")
    .replace(/\{u\}/g, "<u>")
    .replace(/\{\/u\}/g, "</u>")
    .replace(/\{s\}/g, "<s>")
    .replace(/\{\/s\}/g, "</s>")
    .replace(/\{color=([^}]+)\}/g, "<span style='color:$1'>")
    .replace(/\{\/color\}/g, "</span>")
    .replace(/\{alpha=([^}]+)\}/g, "<span style='opacity:$1'>")
    .replace(/\{\/alpha\}/g, "</span>")
    .replace(/\{size=([^}]+)\}/g, "<span style='font-size:$1px'>")
    .replace(/\{\/size\}/g, "</span>")
    // Strip non-visual tags
    .replace(/\{cps=[^}]+\}/g, "")
    .replace(/\{\/cps\}/g, "")
    .replace(/\{w(=\d*\.?\d+)?\}/g, "")
    .replace(/\{p(=\d*\.?\d+)?\}/g, "")
    .replace(/\{nw\}/g, "")
    .replace(/\{fast\}/g, "");
  return html;
}

// ── Font Injector ─────────────────────────────────────────────────────────────

export function RenpyFonts({ guiCfg, rootPath }: { guiCfg?: GuiConfig | null, rootPath: string }) {
  if (!guiCfg || !rootPath) return null;

  // Helper to generate multiple src fallback URLs for a font
  const makeSrc = (fontName: string) => {
    if (!fontName) return "";
    const clean = fontName.replace(/['"]/g, '');
    if (clean === "DejaVuSans.ttf") return ""; // Skip default built-in
    
    // Likely paths
    const paths = [
      `${rootPath}/game/gui/fonts/${clean}`,
      `${rootPath}/game/fonts/${clean}`,
      `${rootPath}/game/${clean}`,
      `${rootPath}/${clean}`
    ];
    
    return paths.map(p => `url("${convertFileSrc(p)}") format("truetype")`).join(",\n      ");
  };

  const textFontSrc = makeSrc(guiCfg.text_font);
  const nameFontSrc = makeSrc(guiCfg.name_text_font);
  const interfaceFontSrc = makeSrc(guiCfg.interface_text_font);

  return (
    <style>{`
      ${textFontSrc ? `
      @font-face {
        font-family: "RenpyTextFont";
        src: ${textFontSrc};
      }` : ''}
      ${nameFontSrc ? `
      @font-face {
        font-family: "RenpyNameFont";
        src: ${nameFontSrc};
      }` : ''}
      ${interfaceFontSrc ? `
      @font-face {
        font-family: "RenpyInterfaceFont";
        src: ${interfaceFontSrc};
      }` : ''}
    `}</style>
  );
}

function stateAt(
  events: VNEvent[],
  idx: number,
  startBg: string | null,
  startSprite: string | null,
) {
  let bg:     string | null = startBg;
  const sprites = new Map<string, VNEvent>();

  if (startSprite) {
    const tag = startSprite.replace(/\\/g, "/").split("/").pop()?.split(/[\s_]/)[0].toLowerCase() || "sprite";
    sprites.set(tag, { id: 'inherited', type: 'image', image: startSprite, side: 'center' } as VNEvent);
  }

  const safeIdx = Math.min(idx, events.length - 1);
  for (let i = 0; i <= safeIdx; i++) {
    const ev = events[i];
    if (!ev) continue;
    // Scene transition clears sprites
    if (ev.type === "bg" && ev.bg && !RENPY_COLORS.has(ev.bg.toLowerCase())) {
      bg = ev.bg;
      sprites.clear();
    }
    // Track images by their first word (character tag)
    if ((ev.type === "image" || ev.type === "animation") && ev.image) {
      const name = ev.image.replace(/\\/g, "/").split("/").pop() || ev.image;
      const tag = name.split(/[\s_]/)[0].toLowerCase();
      sprites.set(tag, ev);
    }
  }
  return { bg, sprites: Array.from(sprites.values()) };
}

// ── Sprite Renderer ───────────────────────────────────────────────────────────

function SpriteRenderer({ spEv, rootPath, isSelected, onImageClick, hovSpId, setHovSpId, logW, logH, fitScale, zoom, onUpdateEventById }: any) {
  const spriteImg = useResolvedImage(rootPath, spEv.image);
  const [dragMode, setDragMode] = useState<"move" | "zoom" | "rotate" | null>(null);
  const dragStartRef = useRef({ cx: 0, cy: 0 });
  const innerRef = useRef<HTMLDivElement>(null);

  if (!spriteImg.url) return null;

  let base_xalign = spEv.side === 'left' ? 0.15 : spEv.side === 'right' ? 0.85 : 0.5;
  let base_yalign = 1.0;
  let atlZoom = 1.0;
  let atlAlpha = 1.0;
  let atlRotate = 0;
  let atlXOffset = 0;
  let atlYOffset = 0;

  if (spEv.atl_code) {
    const xa = spEv.atl_code.match(/xalign\s+([0-9.-]+)/);
    if (xa) base_xalign = parseFloat(xa[1]);
    const ya = spEv.atl_code.match(/yalign\s+([0-9.-]+)/);
    if (ya) base_yalign = parseFloat(ya[1]);
    const za = spEv.atl_code.match(/zoom\s+([0-9.-]+)/);
    if (za) atlZoom = parseFloat(za[1]);
    const al = spEv.atl_code.match(/alpha\s+([0-9.-]+)/);
    if (al) atlAlpha = parseFloat(al[1]);
    const ro = spEv.atl_code.match(/rotate\s+([0-9.-]+)/);
    if (ro) atlRotate = parseFloat(ro[1]);
    const xo = spEv.atl_code.match(/xoffset\s+([0-9.-]+)/);
    if (xo) atlXOffset = parseFloat(xo[1]);
    const yo = spEv.atl_code.match(/yoffset\s+([0-9.-]+)/);
    if (yo) atlYOffset = parseFloat(yo[1]);
  }

  // If this is an animation event with keyframes, we override the base properties
  // with the last keyframe's properties so it reflects the final state statically.
  if (spEv.type === "animation" && spEv.animation_keyframes?.length) {
    const kfs = spEv.animation_keyframes;
    // Actually, it might be better to show the selected frame if we're editing it,
    // but without an easy way to know the selected frame here, we show the last frame.
    const last = kfs[kfs.length - 1].props;
    if (last.xalign !== undefined) base_xalign = last.xalign;
    if (last.yalign !== undefined) base_yalign = last.yalign;
    if (last.zoom !== undefined) atlZoom = last.zoom;
    if (last.alpha !== undefined) atlAlpha = last.alpha;
    if (last.rotate !== undefined) atlRotate = last.rotate;
  }

  const handlePointerDown = (e: React.PointerEvent, mode: "move" | "zoom" | "rotate" = "move") => {
    if (!isSelected) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragMode(mode);
    dragStartRef.current = { cx: e.clientX, cy: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragMode || !innerRef.current) return;
    e.stopPropagation();
    const scale = fitScale * zoom;
    const dx = e.clientX - dragStartRef.current.cx;
    const dy = e.clientY - dragStartRef.current.cy;
    
    if (dragMode === "move") {
      const offX = dx / scale;
      const offY = dy / scale;
      innerRef.current.style.transform = `translate(${atlXOffset + offX}px, ${atlYOffset + offY}px) scale(${Math.max(0.1, atlZoom)}) rotate(${atlRotate}deg)`;
    } else if (dragMode === "zoom") {
      const zOff = -(dy + dx) * 0.002;
      const newZoom = Math.max(0.1, atlZoom + zOff);
      innerRef.current.style.transform = `translate(${atlXOffset}px, ${atlYOffset}px) scale(${newZoom}) rotate(${atlRotate}deg)`;
    } else if (dragMode === "rotate") {
      const rOff = dx * 0.5;
      const newRot = atlRotate + rOff;
      innerRef.current.style.transform = `translate(${atlXOffset}px, ${atlYOffset}px) scale(${Math.max(0.1, atlZoom)}) rotate(${newRot}deg)`;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragMode) return;
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    const wasMoving = dragMode === "move";
    setDragMode(null);

    const scale = fitScale * zoom;
    const dx = e.clientX - dragStartRef.current.cx;
    const dy = e.clientY - dragStartRef.current.cy;

    let code = spEv.atl_code || "";
    let changed = false;

    if (dragMode === "move" && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
      const newXOff = Math.round(atlXOffset + dx / scale);
      const newYOff = Math.round(atlYOffset + dy / scale);

      if (/xoffset\s+[0-9.-]+/.test(code)) code = code.replace(/xoffset\s+[0-9.-]+/, `xoffset ${newXOff}`);
      else code += (code ? "\n" : "") + `xoffset ${newXOff}`;

      if (/yoffset\s+[0-9.-]+/.test(code)) code = code.replace(/yoffset\s+[0-9.-]+/, `yoffset ${newYOff}`);
      else code += `\nyoffset ${newYOff}`;
      changed = true;
    } else if (dragMode === "zoom" && Math.abs(dx + dy) > 2) {
      const zOff = -(dy + dx) * 0.002;
      const newZoom = Math.max(0.1, Math.round((atlZoom + zOff) * 100) / 100);
      if (/zoom\s+[0-9.-]+/.test(code)) code = code.replace(/zoom\s+[0-9.-]+/, `zoom ${newZoom}`);
      else code += (code ? "\n" : "") + `zoom ${newZoom}`;
      changed = true;
    } else if (dragMode === "rotate" && Math.abs(dx) > 2) {
      const rOff = dx * 0.5;
      const newRot = Math.round(atlRotate + rOff);
      if (/rotate\s+[0-9.-]+/.test(code)) code = code.replace(/rotate\s+[0-9.-]+/, `rotate ${newRot}`);
      else code += (code ? "\n" : "") + `rotate ${newRot}`;
      changed = true;
    }

    if (changed) {
      onUpdateEventById?.(spEv.id, { atl_code: code });
    } else if (wasMoving) {
      onImageClick?.("image");
    }
  };

  const isHov = hovSpId === spEv.id;
  const imgRef = useRef<HTMLImageElement>(null);

  // Play animation using Web Animations API
  useEffect(() => {
    const handlePlay = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail.eventId === spEv.id && spEv.type === "animation" && spEv.animation_keyframes?.length > 1 && imgRef.current) {
        const kfs = spEv.animation_keyframes;
        // Total duration is sum of all keyframe durations (skipping the first one since it's initial)
        let totalDur = 0;
        for (let i = 1; i < kfs.length; i++) totalDur += (kfs[i].duration || 1) * 1000;
        if (totalDur <= 0) return;

        const webKeyframes: Keyframe[] = [];
        let acc = 0;

        for (let i = 0; i < kfs.length; i++) {
          const kf = kfs[i];
          const dur = i === 0 ? 0 : (kf.duration || 1) * 1000;
          acc += dur;
          const offset = acc / totalDur;
          
          const p = kf.props;
          const xa = p.xalign ?? 0.5;
          const ya = p.yalign ?? 1.0;
          const z = p.zoom ?? 1.0;
          const ro = p.rotate ?? 0;
          const a = p.alpha ?? 1.0;
          
          // Container is positioned at base_xalign/base_yalign (which is the last frame).
          // We apply translation relative to the container's size to simulate xalign/yalign changes.
          // 1.0 xalign = 100% of container width.
          const dx = (xa - base_xalign) * logW * fitScale;
          const dy = (ya - base_yalign) * logH * fitScale;

          let cssEasing = 'linear';
          if (kf.easing === 'ease') cssEasing = 'ease';
          else if (kf.easing === 'easein') cssEasing = 'ease-in';
          else if (kf.easing === 'easeout') cssEasing = 'ease-out';

          webKeyframes.push({
            offset,
            easing: cssEasing,
            opacity: a,
            transform: `translate(${dx}px, ${dy}px) scale(${z}) rotate(${ro}deg)`,
            transformOrigin: `center ${ya * 100}%`
          });
        }

        imgRef.current.animate(webKeyframes, {
          duration: totalDur,
          fill: 'forwards'
        });
      }
    };
    window.addEventListener("vnv_play_animation", handlePlay);
    return () => window.removeEventListener("vnv_play_animation", handlePlay);
  }, [spEv, base_xalign, base_yalign, logW, logH, fitScale]);

  return (
    <div
      style={{
        position: "absolute", 
        left: `${base_xalign * 100}%`, top: `${base_yalign * 100}%`,
        transform: `translate(-${base_xalign * 100}%, -${base_yalign * 100}%)`,
        height: "95%",
        display: "flex", alignItems: "flex-end",
        cursor: dragMode === "move" ? "grabbing" : (isSelected ? "grab" : "default"),
        zIndex: isSelected ? 10 : Math.round(base_yalign * 10), // fake y-sort
        touchAction: "none", // prevent scrolling while dragging
      }}
      onMouseEnter={() => isSelected && setHovSpId(spEv.id)}
      onMouseLeave={() => setHovSpId(null)}
      onPointerDown={(e) => handlePointerDown(e, "move")}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div ref={innerRef} style={{
        position: 'relative', height: '100%',
        transform: `translate(${atlXOffset}px, ${atlYOffset}px) scale(${Math.max(0.1, atlZoom)}) rotate(${atlRotate}deg)`,
        transformOrigin: `center ${base_yalign * 100}%`,
        transition: dragMode ? "none" : "transform 0.1s",
        opacity: atlAlpha,
        outline: isSelected ? "2px solid var(--teal)" : isHov ? "2px solid rgba(255,255,255,0.4)" : "none",
      }}>
        <img ref={imgRef} src={spriteImg.url} alt="sprite" onError={spriteImg.onErr} draggable={false}
          style={{ height: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }}
        />
        
        {/* Handles */}
        {isSelected && (
          <>
            <div style={{ position: "absolute", top: -6, right: -6, width: 12, height: 12, background: "var(--teal)", border: "2px solid #000", borderRadius: "50%", cursor: "nesw-resize", pointerEvents: "auto" }} onPointerDown={(e) => handlePointerDown(e, "zoom")} />
            <div style={{ position: "absolute", top: -6, left: -6, width: 12, height: 12, background: "var(--teal)", border: "2px solid #000", borderRadius: "50%", cursor: "nwse-resize", pointerEvents: "auto" }} onPointerDown={(e) => handlePointerDown(e, "zoom")} />
            <div style={{ position: "absolute", bottom: -6, right: -6, width: 12, height: 12, background: "var(--teal)", border: "2px solid #000", borderRadius: "50%", cursor: "nwse-resize", pointerEvents: "auto" }} onPointerDown={(e) => handlePointerDown(e, "zoom")} />
            <div style={{ position: "absolute", bottom: -6, left: -6, width: 12, height: 12, background: "var(--teal)", border: "2px solid #000", borderRadius: "50%", cursor: "nesw-resize", pointerEvents: "auto" }} onPointerDown={(e) => handlePointerDown(e, "zoom")} />
            
            {/* Rotation Handle */}
            <div style={{ position: "absolute", top: -30, left: "50%", transform: "translateX(-50%)", width: 12, height: 12, background: "var(--acc)", border: "2px solid #000", borderRadius: "50%", cursor: "ew-resize", pointerEvents: "auto" }} onPointerDown={(e) => handlePointerDown(e, "rotate")} />
            <div style={{ position: "absolute", top: -24, left: "50%", transform: "translateX(-50%)", width: 2, height: 24, background: "var(--acc)", pointerEvents: "none" }} />
          </>
        )}

        {isHov && isSelected && !dragMode && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none"
          }}>
            <span style={{
              background: "rgba(0,0,0,0.75)", color: "#fff", fontSize: 12,
              padding: "6px 14px", borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.25)",
              backdropFilter: "blur(6px)",
            }}>🖱 Drag to move</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScenePreview({ events, selectedIdx, project, rootPath, inheritedBg = null, inheritedSprite = null, colorGradeFilter, guiCfg = null, showGuides = false, onImageClick, onNavigateToScene, zoom, setZoom, onUpdateEventById, onSetThumbnail, isCurrentThumbnail }: Props & { zoom: number, setZoom: React.Dispatch<React.SetStateAction<number>>, onUpdateEventById?: (id: string, partial: Partial<VNEvent>) => void }) {
  const [hovBg, setHovBg] = useState(false);
  const [hovSpId, setHovSpId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const containerRef      = useRef<HTMLDivElement>(null);

  const safeIdx = selectedIdx !== null ? Math.min(selectedIdx, events.length - 1) : null;
  const ev = safeIdx !== null && safeIdx >= 0 ? events[safeIdx] : null;
  const { bg, sprites } = safeIdx !== null && safeIdx >= 0
    ? stateAt(events, safeIdx, inheritedBg, inheritedSprite)
    : { bg: inheritedBg, sprites: [] };

  let char = ev?.char_id ? project.characters.find(c => c.id === ev.char_id) : null;
  let fallbackName = "";
  let rawText = (ev?.type === "choice" ? ev.prompt : ev?.text) || "";

  // If character isn't explicitly linked, check if text has "Name: text" or "Name \"text\""
  if (!char && rawText) {
    const match = rawText.match(/^([\w\s]+):\s*(.*)$/) || rawText.match(/^([\w\s]+)\s+"(.*)"$/);
    if (match) {
      fallbackName = match[1];
      rawText = match[2];
      // Try to find the character by name
      char = project.characters.find(c => c.name.toLowerCase() === fallbackName.toLowerCase() || c.display.toLowerCase() === fallbackName.toLowerCase()) || null;
    }
  }

  // Apply in-editor game translation
  const { gameTranslations, language } = useTranslation();
  const RENPY_LANGS: Record<string, string> = {
    es: "spanish", fr: "french", de: "german", ja: "japanese", ko: "korean", ru: "russian", zh: "simplified_chinese", "zh-TW": "traditional_chinese"
  };
  const envLang = RENPY_LANGS[language] || "";
  if (envLang && gameTranslations && gameTranslations[envLang]) {
    if (rawText && gameTranslations[envLang][rawText]) {
      rawText = gameTranslations[envLang][rawText];
    } else if (rawText) {
      // Fuzzy fallback: ignore punctuation/whitespace for slight mismatches
      const normalize = (s: string) => s.replace(/[\s"?!.,;'`’]/g, '').toLowerCase();
      const normText = normalize(rawText);
      for (const [k, v] of Object.entries(gameTranslations[envLang])) {
        if (normalize(k) === normText) {
          rawText = v;
          break;
        }
      }
    }
  }

  const bgImg     = useResolvedImage(rootPath, bg);
  const textboxImg = useResolvedImage(rootPath, char?.textbox_bg || "gui/textbox.png");
  const nameboxImg = useResolvedImage(rootPath, "gui/namebox.png");
  const choiceBgImg = useResolvedImage(rootPath, "gui/button/choice_idle_background.png");

  // Track the actual pixel dimensions of the outer container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ w: rect.width, h: rect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(z => Math.min(3, Math.max(0.25, z - e.deltaY * 0.001)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [setZoom]);

  // Compute exact canvas bounds to fit within the container
  const logW = guiCfg?.init_width ?? project.resolution?.[0] ?? 1280;
  const logH = guiCfg?.init_height ?? project.resolution?.[1] ?? 720;
  
  const textboxHeight = guiCfg?.textbox_height ?? Math.round(logH * 0.25);
  const nameXpos = guiCfg?.name_xpos ?? Math.round(logW * 0.1875);
  const nameYpos = guiCfg?.name_ypos ?? 0;
  const nameSize = guiCfg?.name_text_size ?? Math.round(logH * 0.0416);
  const dialXpos = guiCfg?.dialogue_xpos ?? Math.round(logW * 0.209);
  const dialYpos = guiCfg?.dialogue_ypos ?? Math.round(logH * 0.069);
  const dialWidth = guiCfg?.dialogue_width ?? Math.round(logW * 0.581);
  const dialSize = guiCfg?.text_size ?? Math.round(logH * 0.0305);
  const textColor = guiCfg?.text_color ?? '#ffffff';

  let fitScale = 1;
  if (containerSize.w > 0 && containerSize.h > 0) {
    fitScale = Math.min(containerSize.w / logW, containerSize.h / logH);
  }

  const canvasStyle: React.CSSProperties = {
    position: "relative",
    width: logW,
    height: logH,
    overflow: "visible",
    background: "#000",
    transform: `scale(${fitScale * zoom})`,
    transformOrigin: "center center",
    transition: "transform 0.1s",
    flexShrink: 0,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.2)",
  };

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, position: "relative", background: "#111",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <RenpyFonts guiCfg={guiCfg} rootPath={rootPath} />
      {/* 16:9 Canvas */}
      <div style={canvasStyle}>

        {/* Background image — clickable when a 'bg' event is selected */}
        {bgImg.url && (
          <div
            style={{ position: "absolute", inset: 0, cursor: ev?.type === "bg" ? "pointer" : "default" }}
            onMouseEnter={() => ev?.type === "bg" && setHovBg(true)}
            onMouseLeave={() => setHovBg(false)}
            onClick={() => ev?.type === "bg" && onImageClick?.("bg")}
          >
            <img src={bgImg.url} alt="bg" onError={bgImg.onErr}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: colorGradeFilter || undefined, transition: "filter 0.4s" }}
            />
            {/* Hover badge */}
            {hovBg && ev?.type === "bg" && (
              <div style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{
                  background: "rgba(0,0,0,0.75)", color: "#fff", fontSize: 12,
                  padding: "6px 14px", borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.25)",
                  backdropFilter: "blur(6px)",
                }}>🖼 Click to change background</span>
              </div>
            )}
          </div>
        )}

        {/* No-event placeholder */}
        {!ev && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "rgba(255,255,255,0.15)" }}>
            <span style={{ fontSize: 40 }}>🎬</span>
            <span style={{ fontSize: 12 }}>Select an event to preview</span>
          </div>
        )}

        {/* Sprites */}
        {sprites.map((sp) => (
          <SpriteRenderer
            key={sp.id}
            spEv={sp}
            rootPath={rootPath}
            isSelected={selectedIdx !== null && events[selectedIdx]?.id === sp.id}
            onImageClick={onImageClick}
            hovSpId={hovSpId}
            setHovSpId={setHovSpId}
            logW={logW}
            logH={logH}
            fitScale={fitScale}
            zoom={zoom}
            onUpdateEventById={onUpdateEventById}
          />
        ))}

        {/* Non-text event badge */}
        {ev && !["dialogue","narration","choice"].includes(ev.type) && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "rgba(255,255,255,0.5)", pointerEvents: "none" }}>
            {!bgImg.url && (
              <>
                <span style={{ fontSize: 32 }}>
                  {({bg:"🖼",music:"🎵",sfx:"🔊",effect:"✨",jump:"➡️",wait:"⏱",setvar:"📦",if:"🔂",image:"🎨"} as Record<string,string>)[ev.type] ?? "●"}
                </span>
                <span style={{ fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", opacity: 0.6 }}>{ev.type}</span>
                <span style={{ fontSize: 12 }}>{ev.bg ?? ev.music ?? ev.sfx ?? ev.kind ?? ev.scene_id ?? ev.condition ?? ""}</span>
              </>
            )}
          </div>
        )}

        {/* Dialogue / narration / choice box */}
        {ev && ["dialogue","narration","choice"].includes(ev.type) && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: textboxImg.url ? textboxHeight : "auto", zIndex: 100 }}>
            {textboxImg.url ? (
              <img src={textboxImg.url} alt="textbox" onError={textboxImg.onErr} style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "100%", objectFit: "fill" }} />
            ) : null}
            
            <div style={{
              position: "absolute",
              left: dialXpos,
              top: dialYpos,
              width: dialWidth,
              padding: textboxImg.url ? 0 : "20px 28px",
              background: textboxImg.url ? "transparent" : "rgba(0,0,0,0.82)",
              backdropFilter: textboxImg.url ? "none" : "blur(8px)",
              borderTop: textboxImg.url ? "none" : "1px solid rgba(255,255,255,0.1)",
              minHeight: textboxImg.url ? 0 : 180,
              height: "100%",
              display: "flex", flexDirection: "column",
              fontFamily: char?.custom_font 
                ? `"${char.custom_font.split('/').pop()?.split('.')[0]}"` 
                : (guiCfg?.text_font && guiCfg.text_font !== "DejaVuSans.ttf" ? '"RenpyTextFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif')
            }}>
              {char?.custom_font && (
                <style>{`
                  @font-face {
                    font-family: "${char.custom_font.split('/').pop()?.split('.')[0]}";
                    src: url(${convertFileSrc(rootPath + "/" + char.custom_font)});
                  }
                `}</style>
              )}
              {(char || fallbackName) && (
                <div style={{
                  position: textboxImg.url ? "absolute" : "static",
                  top: textboxImg.url ? (nameYpos - dialYpos) : "auto",
                  transform: textboxImg.url ? "none" : "none",
                  left: textboxImg.url ? (nameXpos - dialXpos) : "auto",
                  zIndex: 10,
                  marginBottom: 6,
                  padding: nameboxImg.url ? `${Math.round(logH * 0.03)}px ${Math.round(logW * 0.06)}px` : "4px 14px",
                  background: (!nameboxImg.url && textboxImg.url) ? "rgba(0,0,0,0.5)" : "transparent",
                  borderRadius: (!nameboxImg.url && textboxImg.url) ? 6 : 0,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {nameboxImg.url && textboxImg.url && (
                    <img src={nameboxImg.url} alt="namebox" onError={nameboxImg.onErr} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: -1, objectFit: "fill" }} />
                  )}
                  <span style={{
                    display: "inline-block", 
                    fontSize: textboxImg.url ? nameSize : 24, 
                    fontWeight: 700,
                    color: char?.color ?? (textboxImg.url ? (guiCfg?.accent_color ?? "#ea8053") : "#fff"),
                    WebkitTextStroke: "1px rgba(0,0,0,0.8)",
                    textShadow: "none",
                    fontFamily: char?.custom_font 
                      ? `"${char.custom_font.split('/').pop()?.split('.')[0]}"` 
                      : (guiCfg?.name_text_font && guiCfg.name_text_font !== "DejaVuSans.ttf" ? '"RenpyNameFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif'),
                    letterSpacing: textboxImg.url ? "0.05em" : "normal",
                  }}>
                    {char?.display ?? char?.name ?? fallbackName}
                  </span>
                </div>
              )}
              {/* Normal Dialogue / Narration / Choice Prompt */}
              {rawText ? (
                <p 
                  dangerouslySetInnerHTML={{ __html: parseRenpyRichText(rawText) }}
                  style={{
                    fontSize: textboxImg.url ? dialSize : 22,
                    lineHeight: 1.5, color: textColor, fontFamily: "inherit", margin: 0,
                    textShadow: "none",
                  }} 
                />
              ) : (
                <p style={{
                  fontSize: textboxImg.url ? dialSize : 22,
                  lineHeight: 1.5, color: textColor, fontFamily: "inherit", margin: 0,
                  textShadow: "none",
                }}>
                  <span style={{ opacity: 0.3, fontStyle: "italic" }}>No text written yet…</span>
                </p>
              )}
              {/* Quick Menu */}
              <div style={{
                position: "absolute",
                bottom: textboxImg.url ? Math.round(logH * 0.02) : 10,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                gap: Math.round(logW * 0.015),
                zIndex: 20
              }}>
                {["Back", "History", "Skip", "Auto", "Save", "Q.Save", "Q.Load", "Prefs"].map(btn => (
                  <span key={btn} style={{
                    fontSize: Math.max(10, Math.round(logH * 0.02)),
                    color: guiCfg?.idle_color ?? "#888",
                    fontFamily: guiCfg?.interface_text_font && guiCfg.interface_text_font !== "DejaVuSans.ttf" ? '"RenpyInterfaceFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif',
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: "pointer",
                    textShadow: "1px 1px 0 rgba(0,0,0,0.8)"
                  }}>
                    {btn}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Center Screen Choice Buttons */}
        {ev && ev.type === "choice" && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: logH * 0.02, zIndex: 10, pointerEvents: "none"
          }}>
            {(ev.opts ?? []).map((o, i) => {
              let optText = o.text;
              if (envLang && gameTranslations && gameTranslations[envLang] && gameTranslations[envLang][optText]) {
                optText = gameTranslations[envLang][optText];
              }
              return (
              <div key={i} style={{
                position: "relative",
                width: choiceBgImg.url ? "auto" : logW * 0.6,
                minWidth: choiceBgImg.url ? 0 : 400,
                background: choiceBgImg.url ? "transparent" : "rgba(0,0,0,0.6)",
                padding: choiceBgImg.url ? 0 : `${logH * 0.015}px ${logW * 0.02}px`,
                display: "flex", alignItems: "center", justifyContent: "center",
                pointerEvents: "auto", cursor: o.scene ? "pointer" : "default",
                transition: "transform 0.1s"
              }}
              onClick={() => o.scene && onNavigateToScene?.(o.scene)}
              onMouseEnter={(e) => { if (o.scene) e.currentTarget.style.transform = "scale(1.02)"; }}
              onMouseLeave={(e) => { if (o.scene) e.currentTarget.style.transform = "scale(1)"; }}
              >
                {choiceBgImg.url && (
                  <img src={choiceBgImg.url} alt="btn" onError={choiceBgImg.onErr} style={{ width: "100%", height: "100%", position: "absolute", inset: 0, zIndex: -1 }} />
                )}
                <div style={{
                  padding: choiceBgImg.url ? `${logH * 0.015}px ${logW * 0.04}px` : 0,
                  fontSize: logH * 0.035, color: "#ccc",
                  fontFamily: guiCfg?.interface_text_font && guiCfg.interface_text_font !== "DejaVuSans.ttf" ? '"RenpyInterfaceFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif',
                  textAlign: "center",
                  textShadow: choiceBgImg.url ? "1px 1px 2px rgba(0,0,0,0.8)" : "none",
                }}>
                  {optText}
                </div>
              </div>
            )})}
          </div>
        )}

        {/* Composition Guides */}
        {showGuides && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
            {/* Title Safe (90%) */}
            <div style={{ position: "absolute", left: "5%", top: "5%", right: "5%", bottom: "5%", border: "1px dashed rgba(255,255,255,0.4)" }} />
            {/* Action Safe (80%) */}
            <div style={{ position: "absolute", left: "10%", top: "10%", right: "10%", bottom: "10%", border: "1px dashed rgba(255,255,255,0.2)" }} />
            {/* Rule of Thirds Grid */}
            <div style={{ position: "absolute", left: "33.33%", top: 0, bottom: 0, borderLeft: "1px solid rgba(255,255,255,0.15)" }} />
            <div style={{ position: "absolute", left: "66.66%", top: 0, bottom: 0, borderLeft: "1px solid rgba(255,255,255,0.15)" }} />
            <div style={{ position: "absolute", top: "33.33%", left: 0, right: 0, borderTop: "1px solid rgba(255,255,255,0.15)" }} />
            <div style={{ position: "absolute", top: "66.66%", left: 0, right: 0, borderTop: "1px solid rgba(255,255,255,0.15)" }} />
          </div>
        )}

        {/* Thumbnail Override Button */}
        {ev && onSetThumbnail && (
          <button
            onClick={() => onSetThumbnail(ev.id)}
            style={{
              position: "absolute", top: 16, right: 16, zIndex: 10000,
              background: isCurrentThumbnail ? "var(--teal)" : "rgba(0,0,0,0.6)",
              color: isCurrentThumbnail ? "#000" : "#fff",
              border: isCurrentThumbnail ? "1px solid var(--teal)" : "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600,
              cursor: "pointer", backdropFilter: "blur(4px)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              transition: "all 0.15s",
              pointerEvents: "auto",
            }}
            onMouseEnter={e => { if (!isCurrentThumbnail) e.currentTarget.style.background = "rgba(0,0,0,0.8)" }}
            onMouseLeave={e => { if (!isCurrentThumbnail) e.currentTarget.style.background = "rgba(0,0,0,0.6)" }}
          >
            {isCurrentThumbnail ? "★ Scene Thumbnail" : "☆ Set as Thumbnail"}
          </button>
        )}
      </div>
    </div>
  );
}
