/**
 * GuiPreviews.tsx — Previews of the game's main menu, game-menu screens and
 * textbox, drawn from gui.rpy, options.rpy and screens.rpy.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { GuiConfig } from "./guiParser";
import type { OptionsConfig } from "./optionsParser";
import type { ScreenConfig } from "./screenParser";
import { RenpyFonts } from "./ScenePreview";
import type { VNProject, VNMainMenu, VNMainMenuButton } from "./types";

// ─── Preview ──────────────────────────────────────────────────────────────────
export function RenpyPreview({ menu, cfg, optCfg, scrCfg, rootPath, selectedId, onSelectBtn, onGuiPatch, onScrPatch, imgTick, isThumbnail }: {
  menu: VNMainMenu;
  cfg: GuiConfig | null;
  optCfg: OptionsConfig | null;
  scrCfg: ScreenConfig | null;
  rootPath: string;
  selectedId?: string | null;
  onSelectBtn?: (id: string | null) => void;
  onGuiPatch?: (patches: Record<string, string>) => void;
  onScrPatch?: (patches: Partial<ScreenConfig>) => void;
  imgTick?: number;
  isThumbnail?: boolean;
}) {
  const [bgOk,      setBgOk]      = useState(true);
  const [overlayOk, setOverlayOk] = useState(true);

  // Use tick to break cache when uploading new images
  const tickStr = imgTick ? `?t=${imgTick}` : '';
  const bgSrc      = rootPath ? convertFileSrc(`${rootPath}/game/gui/main_menu.png`) + tickStr         : '';
  const overlaySrc = rootPath ? convertFileSrc(`${rootPath}/game/gui/overlay/main_menu.png`) + tickStr : '';

  const [W, H] = [cfg?.init_width ?? 1280, cfg?.init_height ?? 720];
  
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const containerRef = useRef<HTMLDivElement>(null);
  
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

  let fitScale = 1;
  if (containerSize.w > 0 && containerSize.h > 0) {
    // Thumbnail mode: cover (fill card edge-to-edge, crop excess)
    // Full preview mode: contain (letterbox, show whole canvas)
    fitScale = isThumbnail
      ? Math.max(containerSize.w / W, containerSize.h / H)
      : Math.min(containerSize.w / W, containerSize.h / H);
  }

  // Exact Ren'Py pixel dimensions - Scaled based on 1280x720 baseline defaults
  const frameXsize = scrCfg?.main_menu_frame_xsize ?? Math.round(W * 0.21875); // 280 for 1280
  const navXpos = cfg?.navigation_xpos ?? Math.round(W * 0.03125); // 40 for 1280
  
  const titleXalign = scrCfg?.main_menu_vbox_xalign ?? 1.0;
  const titleYalign = scrCfg?.main_menu_vbox_yalign ?? 1.0;
  const titleXoffset = scrCfg?.main_menu_vbox_xoffset ?? Math.round(W * -0.015625); // -20 for 1280
  const titleYoffset = scrCfg?.main_menu_vbox_yoffset ?? Math.round(H * -0.02777); // -20 for 720
  const titleXsize = scrCfg?.main_menu_vbox_xsize ?? Math.round(W * 0.75); // 960 for 1280
  
  const textXalign = cfg?.main_menu_text_xalign ?? 0.0;
  const textAlignStr = textXalign === 0.0 ? 'left' : textXalign === 0.5 ? 'center' : 'right';

  const titleColor  = cfg?.main_menu_text_color ?? menu.style?.titleColor  ?? '#ffaa22';
  const titleSize   = cfg?.title_text_size       ?? Math.round(H * (50/720));
  const interfaceTextSize = cfg?.interface_text_size ?? Math.round(H * (24/720));
  const idleColor   = cfg?.idle_color   ?? '#888888';
  const hoverColor  = cfg?.hover_color  ?? '#a3e066';
  const navSpacing  = cfg?.navigation_spacing ?? Math.round(H * (4/720));

  const innerRef = useRef<HTMLDivElement>(null);
  
  // Drag State holds block ID ('nav' or 'title')
  const [dragState, setDragState] = useState<{ id: 'nav' | 'title'; startX: number; startY: number; initX: number; initY: number } | null>(null);

  const getPos = useCallback((e: React.MouseEvent) => {
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / fitScale,
      y: (e.clientY - rect.top) / fitScale,
    };
  }, [fitScale]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState || isThumbnail) return;
    const pos = getPos(e);
    const dx = pos.x - dragState.startX;
    const dy = pos.y - dragState.startY;
    
    if (dragState.id === 'nav' && onGuiPatch) {
      const newXpos = Math.round(dragState.initX + dx);
      onGuiPatch({ navigation_xpos: String(newXpos) });
    } else if (dragState.id === 'title' && onScrPatch) {
      const newXoffset = Math.round(dragState.initX + dx);
      const newYoffset = Math.round(dragState.initY + dy);
      onScrPatch({ main_menu_vbox_xoffset: newXoffset, main_menu_vbox_yoffset: newYoffset });
    }
  }, [dragState, getPos, onGuiPatch, onScrPatch, isThumbnail]);

  const onMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{
        flex: 1, position: 'relative', width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', overflow: 'hidden',
        pointerEvents: isThumbnail ? 'none' : 'auto'
      }}
      onClick={() => onSelectBtn && onSelectBtn(null)}
    >
      <div
        ref={innerRef}
        style={{
          position: 'relative',
          width: W, height: H,
          transform: `scale(${fitScale})`,
          transformOrigin: 'center center',
          background: '#000', overflow: 'hidden',
          boxShadow: isThumbnail ? 'none' : '0 0 0 2px var(--bdr), 0 24px 64px rgba(0,0,0,0.7)',
          flexShrink: 0,
        }}
      >
        {/* Full-screen background */}
        {bgSrc && bgOk ? (
          <img src={bgSrc} alt="" onError={() => setBgOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1a2a1a 0%,#2a3a2a 50%,#3a4a1a 100%)', pointerEvents: 'none' }} />
        )}

        {/* Left sidebar overlay */}
        {overlaySrc && overlayOk ? (
          <img src={overlaySrc} alt="" onError={() => setOverlayOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }} />
        ) : (
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: frameXsize, background: 'linear-gradient(to right,rgba(0,0,0,0.88) 80%,rgba(0,0,0,0))', pointerEvents: 'none' }} />
        )}
        
        {/* Mathematical vertical accent bar */}
        <div style={{ position: 'absolute', left: frameXsize, top: 0, bottom: 0, width: 2, background: cfg?.accent_color ?? '#cc6600', opacity: 0.7 }} />

        {/* Navigation buttons block */}
        <div 
          onMouseDown={(e) => {
            if (isThumbnail) return;
            e.stopPropagation();
            const pos = getPos(e);
            setDragState({ id: 'nav', startX: pos.x, startY: pos.y, initX: navXpos, initY: 0 });
          }}
          style={{
            position: 'absolute', left: navXpos, top: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            gap: navSpacing,
            cursor: dragState?.id === 'nav' ? 'grabbing' : 'grab',
            width: frameXsize - navXpos,
            border: dragState?.id === 'nav' ? '1px dashed rgba(255,255,255,0.5)' : '1px dashed transparent',
          }}
        >
          {menu.buttons.filter(b => b.visible).map(btn => (
            <NavBtn
              key={btn.id}
              btn={btn}
              fontSize={interfaceTextSize}
              idleColor={idleColor}
              hoverColor={hoverColor}
              selected={selectedId === btn.id}
              onClick={(e) => { e.stopPropagation(); onSelectBtn && onSelectBtn(btn.id); }}
            />
          ))}
        </div>

        {/* Title VBox block */}
        <div 
          onMouseDown={(e) => {
            if (isThumbnail) return;
            e.stopPropagation();
            const pos = getPos(e);
            setDragState({ id: 'title', startX: pos.x, startY: pos.y, initX: titleXoffset, initY: titleYoffset });
          }}
          style={{
            position: 'absolute',
            left: titleXalign * W,
            top: titleYalign * H,
            marginLeft: titleXoffset,
            marginTop: titleYoffset,
            transform: `translate(-${titleXalign * 100}%, -${titleYalign * 100}%)`,
            width: titleXsize,
            lineHeight: 1.15,
            textAlign: textAlignStr,
            cursor: dragState?.id === 'title' ? 'grabbing' : 'grab',
            border: dragState?.id === 'title' ? '1px dashed rgba(255,255,255,0.5)' : '1px dashed transparent',
          }}
        >
          <div style={{
            fontSize: titleSize,
            fontWeight: 700, color: titleColor,
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
            fontFamily: 'var(--font)',
          }}>
            {optCfg?.name ?? menu.title}
          </div>
          <div style={{ fontSize: 24, color: titleColor, opacity: 0.7 }}>
            {optCfg?.version ?? "Ren'Py 7+ Edition"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Nav button with hover ────────────────────────────────────────────────────
function NavBtn({ btn, fontSize, idleColor, hoverColor, selected, onClick }: {
  btn: VNMainMenuButton;
  fontSize: number;
  idleColor: string;
  hoverColor: string;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = hovered ? hoverColor : idleColor;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: fontSize, color, cursor: 'pointer', userSelect: 'none',
        fontFamily: 'DejaVu Sans, var(--font)', fontWeight: 400,
        outline: selected ? '1.5px dashed color-mix(in srgb, var(--acc) 80%, transparent)' : hovered ? '1px dashed rgba(255,255,255,0.4)' : 'none',
        outlineOffset: 2, borderRadius: 2, padding: '1px 6px',
        background: selected ? 'color-mix(in srgb, var(--acc) 15%, transparent)' : 'transparent',
        transform: hovered ? 'scale(1.02)' : 'scale(1)',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        width: 'fit-content',
      }}
    >
      {btn.label}
    </div>
  );
}

// ─── Shared game-menu bg wrapper ─────────────────────────────────────────────
function GameMenuShell({ cfg, scrCfg, rootPath, children }: {
  cfg: GuiConfig | null; scrCfg?: ScreenConfig | null; rootPath: string; children: React.ReactNode;
}) {
  const [bgOk, setBgOk] = useState(true);
  const [overlayOk, setOverlayOk] = useState(true);
  const [W, H] = [cfg?.init_width ?? 1280, cfg?.init_height ?? 720];
  
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const containerRef = useRef<HTMLDivElement>(null);
  
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

  let fitScale = 1;
  if (containerSize.w > 0 && containerSize.h > 0) {
    fitScale = Math.min(containerSize.w / W, containerSize.h / H);
  }

  const frameXsize = scrCfg?.game_menu_navigation_frame_xsize ?? Math.round(W * 0.21875);
  const navXpos = cfg?.navigation_xpos ?? Math.round(W * 0.03125);
  const interfaceTextSize = cfg?.interface_text_size ?? Math.round(H * 0.0305);
  const navSpacing = cfg?.navigation_spacing ?? Math.round(H * 0.0055);
  
  const idleColor   = cfg?.idle_color   ?? '#555555';
  const interfaceFont = cfg?.interface_text_font && cfg.interface_text_font !== "DejaVuSans.ttf" ? '"RenpyInterfaceFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif';
  const bgSrc      = rootPath ? convertFileSrc(`${rootPath}/game/gui/game_menu.png`)          : '';
  const overlaySrc = rootPath ? convertFileSrc(`${rootPath}/game/gui/overlay/game_menu.png`)  : '';
  const navItems = ['Start', 'Load', 'Preferences', 'About', 'Help', 'Quit'];
  
  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, position: 'relative', width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', overflow: 'hidden'
      }}
    >
      <RenpyFonts guiCfg={cfg} rootPath={rootPath} />
      <div style={{
        position: 'relative',
        width: W, height: H,
        transform: `scale(${fitScale})`,
        transformOrigin: 'center center',
        background: '#000', borderRadius: 0, overflow: 'hidden',
        boxShadow: '0 0 0 2px var(--bdr), 0 24px 64px rgba(0,0,0,0.7)',
        flexShrink: 0,
      }}>
        {bgSrc && bgOk ? (
          <img src={bgSrc} alt="" onError={() => setBgOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#0a120a 0%,#1a2a1a 50%,#1a1a2a 100%)' }} />
        )}
        {overlaySrc && overlayOk ? (
          <img src={overlaySrc} alt="" onError={() => setOverlayOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
        ) : (
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: frameXsize, background: 'linear-gradient(to right,rgba(0,0,0,0.88) 80%,rgba(0,0,0,0))' }} />
        )}
        {/* Left nav sidebar */}
        <div style={{ position: 'absolute', left: navXpos, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: navSpacing, width: frameXsize - navXpos }}>
          {navItems.map(item => (
            <div key={item} style={{ fontSize: interfaceTextSize, color: idleColor, fontFamily: interfaceFont, whiteSpace: 'nowrap' }}>{item}</div>
          ))}
          <div style={{ fontSize: interfaceTextSize, color: idleColor, fontFamily: interfaceFont, marginTop: 40, opacity: 0.6 }}>Return</div>
        </div>
        {/* Vertical accent bar */}
        <div style={{ position: 'absolute', left: frameXsize, top: 0, bottom: 0, width: 2, background: cfg?.accent_color ?? '#cc6600', opacity: 0.7 }} />
        {/* Content area */}
        <div style={{ position: 'absolute', left: frameXsize + Math.round(W * 0.03125), top: Math.round(H * 0.069), right: 0, bottom: 0, paddingRight: Math.round(W * 0.03125), overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Load screen preview ──────────────────────────────────────────────────────
export function LoadScreenPreview({ cfg, scrCfg, rootPath }: { cfg: GuiConfig | null; scrCfg: ScreenConfig | null; rootPath: string }) {
  const [W, H] = [cfg?.init_width ?? 1280, cfg?.init_height ?? 720];
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  const titleSize   = cfg?.title_text_size ?? Math.round(H * (50/720));
  const labelSize   = cfg?.label_text_size ?? Math.round(H * (24/720));
  const interfaceTextSize = cfg?.interface_text_size ?? Math.round(H * (22/720));
  const interfaceFont = cfg?.interface_text_font && cfg.interface_text_font !== "DejaVuSans.ttf" ? '"RenpyInterfaceFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif';
  return (
    <GameMenuShell cfg={cfg} scrCfg={scrCfg} rootPath={rootPath}>
      <div style={{ color: accentColor, fontSize: titleSize, fontWeight: 700, marginBottom: Math.round(H * 0.016), fontFamily: interfaceFont }}>Load</div>
      <div style={{ color: textColor, fontSize: labelSize, marginBottom: Math.round(H * 0.028), opacity: 0.8, fontFamily: interfaceFont }}>Page 1</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: Math.round(W * 0.0125) }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            aspectRatio: '4/3', background: cfg?.accent_color ?? '#cc6600', borderRadius: Math.round(W * 0.003), opacity: 0.7,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: `${Math.round(H * 0.014)}px`,
          }}>
            <span style={{ fontSize: interfaceTextSize - Math.round(H * 0.008), color: textColor, opacity: 0.8, fontFamily: interfaceFont }}>empty slot</span>
          </div>
        ))}
      </div>
    </GameMenuShell>
  );
}

// ─── Preferences screen preview ───────────────────────────────────────────────
export function PreferencesScreenPreview({ cfg, scrCfg, rootPath }: { cfg: GuiConfig | null; scrCfg: ScreenConfig | null; rootPath: string }) {
  const [W, H] = [cfg?.init_width ?? 1280, cfg?.init_height ?? 720];
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  const idleColor   = cfg?.idle_color ?? '#555555';
  const titleSize   = cfg?.title_text_size ?? Math.round(H * (50/720));
  const labelSize   = cfg?.label_text_size ?? Math.round(H * (24/720));
  const interfaceTextSize = cfg?.interface_text_size ?? Math.round(H * (22/720));
  const interfaceFont = cfg?.interface_text_font && cfg.interface_text_font !== "DejaVuSans.ttf" ? '"RenpyInterfaceFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif';
  
  const sections = [
    { title: 'Display',  items: ['Window', 'Fullscreen'] },
    { title: 'Skip',     items: ['Unseen Text', 'After Choices', 'Transitions'] },
    { title: 'Language', items: ['English', 'Español', 'Français'] },
  ];
  
  const leftSliders = ['Text Speed', 'Auto-Forward Time'];
  const rightSliders = ['Music Volume', 'Sound Volume'];

  return (
    <GameMenuShell cfg={cfg} scrCfg={scrCfg} rootPath={rootPath}>
      <div style={{ color: accentColor, fontSize: titleSize, fontWeight: 700, marginBottom: Math.round(H * 0.028), fontFamily: interfaceFont }}>Preferences</div>
      
      {/* Top half: Radio buttons */}
      <div style={{ display: 'flex', gap: Math.round(W * 0.06), marginBottom: Math.round(H * 0.04) }}>
        {sections.map(s => (
          <div key={s.title} style={{ display: 'flex', flexDirection: 'column', gap: Math.round(H * 0.01) }}>
            <div style={{ color: accentColor, fontSize: labelSize, fontWeight: 700, marginBottom: Math.round(H * 0.005), fontFamily: interfaceFont }}>{s.title}</div>
            {s.items.map(item => (
              <div key={item} style={{ color: textColor, fontSize: interfaceTextSize, opacity: 0.8, fontFamily: interfaceFont }}>{item}</div>
            ))}
          </div>
        ))}
      </div>

      {/* Bottom half: Sliders */}
      <div style={{ display: 'flex', gap: Math.round(W * 0.06) }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, maxWidth: Math.round(W * 0.3), gap: Math.round(H * 0.03) }}>
          {leftSliders.map(s => (
            <div key={s}>
              <div style={{ color: textColor, fontSize: interfaceTextSize, marginBottom: Math.round(H * 0.005), fontFamily: interfaceFont, opacity: 0.9 }}>{s}</div>
              <div style={{ height: Math.round(H * (25/720)), background: idleColor, borderRadius: Math.round(H * (4/720)), position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '70%', background: cfg?.accent_color ?? '#cc6600', borderRadius: Math.round(H * (4/720)) }} />
              </div>
            </div>
          ))}
        </div>
        
        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, maxWidth: Math.round(W * 0.3), gap: Math.round(H * 0.03) }}>
          {rightSliders.map(s => (
            <div key={s}>
              <div style={{ color: textColor, fontSize: interfaceTextSize, marginBottom: Math.round(H * 0.005), fontFamily: interfaceFont, opacity: 0.9 }}>{s}</div>
              <div style={{ height: Math.round(H * (25/720)), background: idleColor, borderRadius: Math.round(H * (4/720)), position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '70%', background: cfg?.accent_color ?? '#cc6600', borderRadius: Math.round(H * (4/720)) }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </GameMenuShell>
  );
}

// ─── About screen preview ─────────────────────────────────────────────────────
export function AboutScreenPreview({ cfg, scrCfg, rootPath, project }: { cfg: GuiConfig | null; scrCfg: ScreenConfig | null; rootPath: string; project: VNProject }) {
  const H = cfg?.init_height ?? 720;
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  const titleSize   = cfg?.title_text_size ?? Math.round(H * (50/720));
  const labelSize   = cfg?.label_text_size ?? Math.round(H * (24/720));
  const interfaceTextSize = cfg?.interface_text_size ?? Math.round(H * (22/720));
  const interfaceFont = cfg?.interface_text_font && cfg.interface_text_font !== "DejaVuSans.ttf" ? '"RenpyInterfaceFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif';
  return (
    <GameMenuShell cfg={cfg} scrCfg={scrCfg} rootPath={rootPath}>
      <div style={{ color: accentColor, fontSize: titleSize, fontWeight: 700, marginBottom: 10, fontFamily: interfaceFont }}>About</div>
      <div style={{ color: accentColor, fontSize: labelSize + 4, marginBottom: 16, opacity: 0.85, fontFamily: interfaceFont }}>{project.title}</div>
      <div style={{ color: textColor, fontSize: interfaceTextSize, opacity: 0.7, lineHeight: 1.8, fontFamily: interfaceFont }}>
        <div>Author  <strong style={{ color: textColor }}>{project.author}</strong></div>
        <div style={{ marginTop: 16, opacity: 0.5 }}>Made with Ren'Py</div>
      </div>
    </GameMenuShell>
  );
}

// ─── Help screen preview ──────────────────────────────────────────────────────
export function HelpScreenPreview({ cfg, scrCfg, rootPath }: { cfg: GuiConfig | null; scrCfg: ScreenConfig | null; rootPath: string }) {
  const H = cfg?.init_height ?? 720;
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  const titleSize   = cfg?.title_text_size ?? Math.round(H * (50/720));
  const labelSize   = cfg?.label_text_size ?? Math.round(H * (24/720));
  const interfaceTextSize = cfg?.interface_text_size ?? Math.round(H * (22/720));
  const labelWidth = scrCfg?.help_label_xsize ?? 250;
  const shortcuts = [['Enter, Space', 'Advance'], ['Ctrl', 'Skip'], ['Tab', 'Auto-forward'], ['Page Up', 'Roll back'], ['H', 'Hide interface'], ['S', 'Screenshot'], ['V', 'Accessibility']];
  return (
    <GameMenuShell cfg={cfg} scrCfg={scrCfg} rootPath={rootPath}>
      <div style={{ color: accentColor, fontSize: titleSize, fontWeight: 700, marginBottom: 20 }}>Help</div>
      <div style={{ color: accentColor, fontSize: labelSize, fontWeight: 700, marginBottom: 14 }}>Keyboard Shortcuts</div>
      {shortcuts.map(([key, action]) => (
        <div key={key} style={{ display: 'flex', gap: 20, fontSize: interfaceTextSize - 2, marginBottom: 8 }}>
          <span style={{ color: accentColor, minWidth: labelWidth }}>{key}</span>
          <span style={{ color: textColor, opacity: 0.8 }}>{action}</span>
        </div>
      ))}
    </GameMenuShell>
  );
}

// ─── Textbox preview ──────────────────────────────────────────────────────────
export function TextboxPreview({ cfg, rootPath, imgTick }: { cfg: GuiConfig | null; rootPath: string; imgTick?: number }) {
  const [W, H] = [cfg?.init_width ?? 1280, cfg?.init_height ?? 720];
  const [boxOk, setBoxOk] = useState(true);
  const [nameOk, setNameOk] = useState(true);
  const tickStr = imgTick ? `?t=${imgTick}` : '';
  const boxSrc = rootPath ? convertFileSrc(`${rootPath}/game/gui/textbox.png`) + tickStr : '';
  const nameboxSrc = rootPath ? convertFileSrc(`${rootPath}/game/gui/namebox.png`) + tickStr : '';

  const textboxHeight = cfg?.textbox_height ?? Math.round(H * 0.25);
  const nameXpos = cfg?.name_xpos ?? Math.round(W * 0.1875);
  const nameYpos = cfg?.name_ypos ?? 0;
  const dialXpos = cfg?.dialogue_xpos ?? Math.round(W * 0.209);
  const dialYpos = cfg?.dialogue_ypos ?? Math.round(H * 0.069);
  const dialWidth = cfg?.dialogue_width ?? Math.round(W * 0.581);
  const nameSize = cfg?.name_text_size ?? Math.round(H * 0.0416);
  const dialSize = cfg?.text_size ?? Math.round(H * 0.0305);
  const textColor = cfg?.text_color ?? '#ffffff';
  const nameColor = cfg?.accent_color ?? '#cc6600'; 

  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) setContainerSize({ w: rect.width, h: rect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  let fitScale = 1;
  if (containerSize.w > 0 && containerSize.h > 0) fitScale = Math.min(containerSize.w / W, containerSize.h / H);

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: W, height: H, transform: `scale(${fitScale})`, transformOrigin: 'center center', background: 'linear-gradient(135deg, #101825, #080d14)', overflow: 'hidden', boxShadow: '0 0 0 2px #1e2d42', flexShrink: 0 }}>
        {/* Mock background character sprite */}
        <div style={{ position: 'absolute', left: '50%', top: '20%', transform: 'translateX(-50%)', width: 300, height: 600, background: 'rgba(255,255,255,0.05)', borderRadius: '150px 150px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 40 }}>Sprite</div>
        
        {/* Textbox container */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: W, height: textboxHeight }}>
          {boxSrc && boxOk ? (
            <img src={boxSrc} alt="" onError={() => setBoxOk(false)} style={{ width: '100%', height: '100%', objectFit: 'fill' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)' }} />
          )}

          {/* Namebox */}
          <div style={{ position: 'absolute', left: nameXpos, top: nameYpos, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {nameboxSrc && nameOk && (
              <img src={nameboxSrc} alt="" onError={() => setNameOk(false)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: -1 }} />
            )}
            <span style={{ 
              fontSize: nameSize, 
              fontWeight: 700, 
              color: nameColor, 
              fontFamily: 'var(--font)', 
              whiteSpace: 'nowrap', 
              padding: nameboxSrc && nameOk ? `${Math.round(H * 0.03)}px ${Math.round(W * 0.06)}px` : '4px 14px',
              WebkitTextStroke: "1px rgba(0,0,0,0.8)",
              letterSpacing: "0.05em",
            }}>Eileen</span>
          </div>

          {/* Dialogue Text */}
          <div style={{ position: 'absolute', left: dialXpos, top: dialYpos, width: dialWidth, fontSize: dialSize, color: textColor, fontFamily: 'var(--font)', lineHeight: 1.5, textShadow: 'none' }}>
            "This is what the dialogue will look like in-game. You can use this preview to adjust the text size, color, and textbox height so everything fits perfectly!"
          </div>
        </div>
      </div>
    </div>
  );
}
