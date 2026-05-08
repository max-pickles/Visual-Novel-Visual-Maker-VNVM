/**
 * MainMenuEditor.tsx
 * Reads gui.rpy on mount, mirrors every UI change back to disk, and renders a
 * pixel-accurate WYSIWYG preview that matches the in-game main_menu screen.
 *
 * Layout reference (screens.rpy):
 *   • Full-screen bg    — gui/main_menu.png
 *   • Left dark panel   — gui/overlay/main_menu.png  (280 px wide, full height)
 *   • Nav buttons       — xpos gui.navigation_xpos, yalign 0.5
 *   • Title vbox        — xalign 1.0, xoffset -20, xsize 960, yalign 1.0, yoffset -20
 *                         → left edge = screenW - 960 - 20 = 300 px (for 1280)
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, mkdir, readDir } from "@tauri-apps/plugin-fs";
import { readGuiRpy, writeGuiRpy, readOptionsRpy, writeOptionsRpy, readScreensRpy, writeScreensRpy } from "./tauriApi";
import { parseGuiRpy, patchGuiRpy, rpyColor, rpyNum, rpyStr, type GuiConfig } from "./guiParser";
import { parseOptionsRpy, patchOptionsRpy, type OptionsConfig } from "./optionsParser";
import { parseScreensRpy, patchScreensRpy, type ScreenConfig } from "./screenParser";
import { RenpyFonts } from "./ScenePreview";
import type { VNProject, VNMainMenu, VNMainMenuButton } from "./types";
import { useTranslation } from "./translationContext";

// ─── Defaults (Ren'Py standard values) ────────────────────────────────────────
const D_IDLE    = '#555555';
const D_HOVER   = '#e0a366';

function defaultButtons(): VNMainMenuButton[] {
  const rows: [string, VNMainMenuButton['action']][] = [
    ['Start', 'start'], ['Load', 'load'], ['Preferences', 'preferences'],
    ['About', 'about'], ['Help', 'help'], ['Quit', 'quit'],
  ];
  return rows.map(([label, action], i) => ({
    id: `def_${i}`, label, action, x: 80, y: 300 + (i * 45), visible: true,
    style: { color: D_IDLE, hoverColor: D_HOVER, fontSize: 24 },
  }));
}

function defaultMenu(title: string): VNMainMenu {
  return { title, buttons: defaultButtons(), style: { bgColor: '#000', titleColor: '#ffaa22', titleFontSize: 50 } };
}

const ACTION_LABELS: Record<VNMainMenuButton['action'], string> = {
  start: '▶ Start', load: '📂 Load', preferences: '⚙ Preferences',
  help: '❓ Help', about: 'ℹ About', quit: '✕ Quit', custom: '⚡ Custom',
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props { project: VNProject; onProjectChange: (p: VNProject) => void; }

type ScreenTab = 'main_menu' | 'load' | 'preferences' | 'about' | 'help' | 'textbox';
const TABS: { id: ScreenTab; icon: string; label: string; labelKey: string }[] = [
  { id: 'main_menu',   icon: '\uD83C\uDFAE', label: 'Main Menu',        labelKey: 'gui.tab_main_menu' },
  { id: 'textbox',     icon: '\uD83D\uDCAC', label: 'Textbox / In-Game', labelKey: 'gui.tab_textbox' },
  { id: 'load',        icon: '\uD83D\uDCC2', label: 'Load',             labelKey: 'gui.tab_load' },
  { id: 'preferences', icon: '\u2699\uFE0F', label: 'Preferences',      labelKey: 'gui.tab_preferences' },
  { id: 'about',       icon: '\u2139\uFE0F', label: 'About',            labelKey: 'gui.tab_about' },
  { id: 'help',        icon: '\u2753',        label: 'Help',             labelKey: 'gui.tab_help' },
];

// ─── Magic Palette Helpers ────────────────────────────────────────────────────────
function hexToHsl(hex: string) {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16); g = parseInt(hex.substring(3, 5), 16); b = parseInt(hex.substring(5, 7), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generatePalette(baseHex: string) {
  const [h, s, l] = hexToHsl(baseHex);
  return {
    accent_color: baseHex,
    idle_color: hslToHex(h, Math.max(0, s - 30), Math.max(20, l - 20)),
    hover_color: hslToHex(h, Math.min(100, s + 10), Math.min(90, l + 20)),
    selected_color: hslToHex(h, Math.min(100, s + 10), Math.min(90, l + 20)),
    text_color: hslToHex(h, Math.max(0, s - 60), 95),
    muted_color: hslToHex(h, Math.max(0, s - 40), 40)
  };
}

function CustomFontBrowser({ rootPath, guiCfg, applyGuiPatch }: { rootPath: string, guiCfg: GuiConfig | null, applyGuiPatch: (p: any) => void }) {
  const [fonts, setFonts] = useState<string[]>([]);
  const [selectedFont, setSelectedFont] = useState<string | null>(null);
  const { t } = useTranslation();

  const loadFonts = async () => {
    if (!rootPath) return;
    try {
      const entries = await readDir(`${rootPath}/game/gui/fonts`);
      const fontFiles = entries.filter(e => !e.isDirectory && /\.(ttf|otf|woff2?)$/i.test(e.name ?? '')).map(e => e.name as string);
      setFonts(fontFiles);
    } catch(e) {}
  };

  useEffect(() => { loadFonts(); }, [rootPath]);

  const handleUpload = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff2'] }]
      });
      if (typeof selected === 'string') {
        const ext = selected.split('.').pop();
        const filename = `custom_${Date.now()}.${ext}`;
        const destDir = `${rootPath}/game/gui/fonts`;
        try { await mkdir(destDir, { recursive: true }); } catch(e) {}
        await copyFile(selected, `${destDir}/${filename}`);
        await loadFonts();
      }
    } catch(e) {}
  };

  return (
    <div className="col gap8">
      <style>{fonts.map(f => `
        @font-face {
          font-family: "Preview_${f.replace(/\W/g, '_')}";
          src: url("${convertFileSrc(`${rootPath}/game/gui/fonts/${f}`)}") format("truetype");
        }
      `).join('\n')}</style>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 6, padding: 8, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--bdr)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', marginBottom: 8, letterSpacing: '0.05em' }}>{t('gui.available_fonts')}</div>
          {fonts.length === 0 && <div style={{ fontSize: 11, color: 'var(--faint)' }}>{t('gui.no_fonts')}</div>}
          <div className="col gap4">
            {fonts.map(f => (
              <div key={f} onClick={() => setSelectedFont(f)}
                style={{
                  padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
                  background: selectedFont === f ? 'var(--teal)' : 'transparent',
                  color: selectedFont === f ? '#000' : 'var(--text)',
                }}>
                <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>{f}</div>
                <div style={{ fontFamily: `"Preview_${f.replace(/\W/g, '_')}"`, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t('gui.font_preview')}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: 140, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={handleUpload}>{t('gui.upload_font')}</button>
          <div style={{ height: 1, background: 'var(--bdr)', margin: '4px 0' }} />
          <button className="btn btn-ghost" style={{ fontSize: 10, justifyContent: 'flex-start' }} disabled={!selectedFont}
            onClick={() => selectedFont && applyGuiPatch({ text_font: rpyStr(`gui/fonts/${selectedFont}`) })}>
            {t('gui.set_dialogue')}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 10, justifyContent: 'flex-start' }} disabled={!selectedFont}
            onClick={() => selectedFont && applyGuiPatch({ name_text_font: rpyStr(`gui/fonts/${selectedFont}`) })}>
            {t('gui.set_name')}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 10, justifyContent: 'flex-start' }} disabled={!selectedFont}
            onClick={() => selectedFont && applyGuiPatch({ interface_text_font: rpyStr(`gui/fonts/${selectedFont}`) })}>
            {t('gui.set_ui')}
          </button>
        </div>
      </div>
      
      <div style={{ marginTop: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div>{t('gui.font_dialogue')}: <span style={{ color: "var(--teal)" }}>{guiCfg?.text_font?.replace(/"/g, '') || t('gui.font_default')}</span></div>
        <div>{t('gui.font_name')}: <span style={{ color: "var(--teal)" }}>{guiCfg?.name_text_font?.replace(/"/g, '') || t('gui.font_default')}</span></div>
        <div>{t('gui.font_ui')}: <span style={{ color: "var(--teal)" }}>{guiCfg?.interface_text_font?.replace(/"/g, '') || t('gui.font_default')}</span></div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function GuiEditor({ project, onProjectChange }: Props) {
  const menu: VNMainMenu = project.main_menu ?? defaultMenu(project.title);
  const rootPath = project._rootPath ?? '';
  const { t } = useTranslation();

  // gui.rpy state
  const [guiRaw, setGuiRaw]       = useState<string | null>(null);
  const [guiCfg, setGuiCfg]       = useState<GuiConfig | null>(null);
  const [guiLoading, setGuiLoading] = useState(true);
  const [guiError,   setGuiError]   = useState<string | null>(null);
  const writeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // options.rpy state
  const [optRaw, setOptRaw] = useState<string | null>(null);
  const [optCfg, setOptCfg] = useState<OptionsConfig | null>(null);
  const optTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // screens.rpy state
  const [scrRaw, setScrRaw] = useState<string | null>(null);
  const [scrCfg, setScrCfg] = useState<ScreenConfig | null>(null);
  const scrTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ScreenTab>('main_menu');
  const [W, H] = project.resolution;
  const selectedBtn = menu.buttons.find(b => b.id === selectedId) ?? null;
  const [imgTick, setImgTick] = useState(Date.now());

  const handleImageUpload = async (targetPath: string) => {
    if (!rootPath) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      });
      if (typeof selected === 'string') {
        const dest = `${rootPath}/${targetPath}`;
        await copyFile(selected, dest);
        setImgTick(Date.now()); // force image reload
      }
    } catch (e) {
      console.error('Failed to upload image:', e);
    }
  };

  const handleFontUpload = async (fontKey: 'text_font' | 'name_text_font' | 'interface_text_font') => {
    if (!rootPath) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff2'] }]
      });
      if (typeof selected === 'string') {
        const ext = selected.split('.').pop();
        const filename = `${fontKey}_${Date.now()}.${ext}`;
        const destDir = `${rootPath}/game/gui/fonts`;
        try { await mkdir(destDir, { recursive: true }); } catch(e) {}
        const dest = `${destDir}/${filename}`;
        await copyFile(selected, dest);
        
        // Apply patch
        applyGuiPatch({ [fontKey]: `"gui/fonts/${filename}"` });
      }
    } catch (e) {
      console.error('Failed to upload font:', e);
    }
  };

  const handleMagicPalette = () => {
    if (!rootPath) return;
    const imgUrl = convertFileSrc(`${rootPath}/game/gui/main_menu.png`) + `?t=\${imgTick}`;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      
      let maxSaturation = 0;
      let accent = [204, 102, 0];
      
      let rSum = 0, gSum = 0, bSum = 0, count = 0;

      for (let i = 0; i < data.length; i += 400) {
        const r = data[i], g = data[i+1], b = data[i+2];
        rSum += r; gSum += g; bSum += b; count++;

        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let s = 0;
        if (max !== min) {
          s = l > 127 ? (max - min) / (510 - max - min) : (max - min) / (max + min);
        }
        if (s > maxSaturation && l > 50 && l < 200) {
          maxSaturation = s;
          accent = [r, g, b];
        }
      }

      const avg = [Math.floor(rSum / count), Math.floor(gSum / count), Math.floor(bSum / count)];
      const toHex = (c: number) => Math.min(255, Math.max(0, c)).toString(16).padStart(2, '0');
      
      const accentHex = `#\${toHex(accent[0])}\${toHex(accent[1])}\${toHex(accent[2])}`;
      const idleHex = `#\${toHex(avg[0])}\${toHex(avg[1])}\${toHex(avg[2])}`;
      const hoverHex = `#\${toHex(accent[0] + 50)}\${toHex(accent[1] + 50)}\${toHex(accent[2] + 50)}`;

      applyGuiPatch({
        accent_color: `"\${accentHex}"`,
        idle_color: `"\${idleHex}"`,
        hover_color: `"\${hoverHex}"`,
      });
    };
    img.src = imgUrl;
  };

  // Load gui.rpy once
  useEffect(() => {
    if (!rootPath) return;
    setGuiLoading(true);
    readGuiRpy(rootPath)
      .then(raw => {
        setGuiRaw(raw);
        setGuiCfg(parseGuiRpy(raw));
        setGuiError(null);
      })
      .catch(err => setGuiError(String(err)))
      .finally(() => setGuiLoading(false));

    readOptionsRpy(rootPath)
      .then(raw => {
        setOptRaw(raw);
        setOptCfg(parseOptionsRpy(raw));
      })
      .catch(e => console.error('Failed to load options.rpy', e));

    readScreensRpy(rootPath)
      .then(raw => {
        setScrRaw(raw);
        setScrCfg(parseScreensRpy(raw));
      })
      .catch(e => console.error('Failed to load screens.rpy', e));
  }, [rootPath]);

  // Debounced write to disk
  const flushGui = useCallback((newRaw: string) => {
    if (!rootPath) return;
    if (writeTimeout.current) clearTimeout(writeTimeout.current);
    writeTimeout.current = setTimeout(() => {
      writeGuiRpy(rootPath, newRaw).catch(e => console.error('gui.rpy write failed:', e));
    }, 600);
  }, [rootPath]);

  // Apply a set of gui.rpy patches, update state and schedule write
  const applyGuiPatch = useCallback((patches: Record<string, string>) => {
    if (!guiRaw) return;
    const newRaw = patchGuiRpy(guiRaw, patches);
    const newCfg = parseGuiRpy(newRaw);
    setGuiRaw(newRaw);
    setGuiCfg(newCfg);
    flushGui(newRaw);
  }, [guiRaw, flushGui]);

  const applyOptPatch = useCallback((patches: Record<string, string>) => {
    if (!optRaw) return;
    const newRaw = patchOptionsRpy(optRaw, patches);
    const newCfg = parseOptionsRpy(newRaw);
    setOptRaw(newRaw);
    setOptCfg(newCfg);
    if (!rootPath) return;
    if (optTimeout.current) clearTimeout(optTimeout.current);
    optTimeout.current = setTimeout(() => {
      writeOptionsRpy(rootPath, newRaw).catch(e => console.error('options.rpy write failed:', e));
    }, 600);
  }, [optRaw, rootPath]);

  const applyScrPatch = useCallback((patches: Partial<ScreenConfig>) => {
    if (!scrRaw) return;
    const newRaw = patchScreensRpy(scrRaw, patches);
    const newCfg = parseScreensRpy(newRaw);
    setScrRaw(newRaw);
    setScrCfg(newCfg);
    if (!rootPath) return;
    if (scrTimeout.current) clearTimeout(scrTimeout.current);
    scrTimeout.current = setTimeout(() => {
      writeScreensRpy(rootPath, newRaw).catch(e => console.error('screens.rpy write failed:', e));
    }, 600);
  }, [scrRaw, rootPath]);

  // project.main_menu mutations
  const updateMenu = useCallback((patch: Partial<VNMainMenu>) => {
    onProjectChange({ ...project, main_menu: { ...menu, ...patch } });
  }, [project, menu, onProjectChange]);

  const updateBtn = useCallback((id: string, patch: Partial<VNMainMenuButton>) => {
    updateMenu({ buttons: menu.buttons.map(b => b.id === id ? { ...b, ...patch } : b) });
  }, [menu, updateMenu]);

  const addButton = () => {
    const btn: VNMainMenuButton = {
      id: Math.random().toString(36).slice(2, 10),
      label: 'New Button', action: 'custom', x: 100, y: 100, visible: true,
      style: { color: D_IDLE, hoverColor: D_HOVER, fontSize: 24 },
    };
    updateMenu({ buttons: [...menu.buttons, btn] });
  };

  // Derived values — prefer parsed gui.rpy, fall back to project.main_menu style
  const titleColor = guiCfg?.main_menu_text_color ?? menu.style?.titleColor  ?? '#ffaa22';
  const titleSize  = guiCfg?.title_text_size       ?? menu.style?.titleFontSize ?? 50;
  const idleColor  = guiCfg?.idle_color   ?? D_IDLE;
  const hoverColor = guiCfg?.hover_color  ?? D_HOVER;
  const accentColor = guiCfg?.accent_color ?? '#cc6600';
  const navXpos    = guiCfg?.navigation_xpos ?? 40;

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg0)', flexDirection: 'column' }}>

      {/* ── Screen Tabs ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600, border: 'none',
              background: activeTab === tab.id ? 'var(--bg0)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text)' : 'var(--dim)',
              borderBottom: activeTab === tab.id ? '2px solid var(--acc)' : '2px solid transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.15s',
            }}
          >
            <span>{tab.icon}</span>{t(tab.labelKey as any)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left settings panel ─────────────────────────────────────────────── */}
        <div style={{ width: 268, flexShrink: 0, overflowY: 'auto', background: 'var(--bg1)', borderRight: '1px solid var(--bdr)', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17 }}>{TABS.find(t => t.id === activeTab)?.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{t(TABS.find(t2 => t2.id === activeTab)?.labelKey as any)} {t('gui.editor_suffix')}</span>
            </div>
            {guiLoading && <p style={{ fontSize: 11, color: 'var(--acc)', margin: '6px 0 0' }}>{t('gui.loading_gui')}</p>}
            {guiError  && <p style={{ fontSize: 11, color: 'var(--err)', margin: '6px 0 0' }}>⚠ {guiError}</p>}
            {!guiLoading && !guiError && guiCfg && (
              <p style={{ fontSize: 11, color: 'var(--dim)', margin: '5px 0 0', lineHeight: 1.4 }}>
                {t('gui.edits_note')} <code style={{ fontSize: 10 }}>gui.rpy</code>.
              </p>
            )}
          </div>

          {/* ── Main Menu tab ── */}
          {activeTab === 'main_menu' && (<>
            <Section label={t('gui.sec_bg_images')}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11, padding: '4px 8px' }} onClick={() => handleImageUpload('game/gui/main_menu.png')}>
                  {t('gui.upload_bg')}
                </button>
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11, padding: '4px 8px' }} onClick={() => handleImageUpload('game/gui/overlay/main_menu.png')}>
                  {t('gui.upload_overlay')}
                </button>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', fontSize: 11, padding: '4px 8px', background: 'linear-gradient(135deg, var(--teal), #3b82f6)' }} onClick={handleMagicPalette}>
                {t('gui.magic_palette')}
              </button>
            </Section>

            <Section label={t('gui.sec_nav_buttons')} action={
              <button className="btn btn-accent" style={{ fontSize: 11, padding: '3px 10px' }} onClick={addButton}>+ Add</button>
            }>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {menu.buttons.map(btn => (
                  <div key={btn.id}
                    onClick={() => setSelectedId(btn.id === selectedId ? null : btn.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px',
                      borderRadius: 5, cursor: 'pointer', border: '1px solid',
                      borderColor: selectedId === btn.id ? 'var(--acc)' : 'var(--bdr)',
                      background: selectedId === btn.id ? 'rgba(75,108,247,0.1)' : 'var(--bg2)',
                    }}>
                    <span style={{ flex: 1, fontSize: 12, color: btn.visible ? 'var(--text)' : 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {btn.label}
                    </span>
                    <button onClick={e => { e.stopPropagation(); updateBtn(btn.id, { visible: !btn.visible }); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, opacity: btn.visible ? 0.9 : 0.3, padding: 0 }}>👁</button>
                    <button onClick={e => { e.stopPropagation(); updateMenu({ buttons: menu.buttons.filter(b => b.id !== btn.id) }); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--err)', padding: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            </Section>

            <div style={{ padding: '0 14px 14px', display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1, color: 'var(--err)', justifyContent: 'center' }}
                onClick={() => { if (window.confirm(t('gui.reset_confirm'))) updateMenu({ buttons: defaultButtons() }); }}>
                {t('gui.reset')}
              </button>
            </div>
          </>
            )}

        </div>

        {/* ── Middle: Preview ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '6px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim)' }}>{t('gui.live_preview')}</span>
            <span style={{ fontSize: 11, color: 'var(--faint)' }}>— {t(TABS.find(tab2 => tab2.id === activeTab)?.labelKey as any)} {t('gui.screen_suffix')}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
              {project.resolution[0]} × {project.resolution[1]}
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05080f', padding: 24, overflow: 'hidden' }}>
            {activeTab === 'main_menu' && (
              <RenpyPreview menu={menu} cfg={guiCfg} optCfg={optCfg} scrCfg={scrCfg} rootPath={rootPath} resolution={project.resolution}
                selectedId={selectedId} onSelectBtn={setSelectedId} 
                onGuiPatch={applyGuiPatch} onScrPatch={applyScrPatch}
                imgTick={imgTick} />
            )}
            {activeTab === 'textbox' && (
              <TextboxPreview cfg={guiCfg} rootPath={rootPath} resolution={project.resolution} imgTick={imgTick} />
            )}
            {activeTab === 'load' && (
              <LoadScreenPreview cfg={guiCfg} scrCfg={scrCfg} rootPath={rootPath} resolution={project.resolution} />
            )}
            {activeTab === 'preferences' && (
              <PreferencesScreenPreview cfg={guiCfg} scrCfg={scrCfg} rootPath={rootPath} resolution={project.resolution} />
            )}
            {activeTab === 'about' && (
              <AboutScreenPreview cfg={guiCfg} scrCfg={scrCfg} rootPath={rootPath} resolution={project.resolution} project={project} />
            )}
            {activeTab === 'help' && (
              <HelpScreenPreview cfg={guiCfg} scrCfg={scrCfg} rootPath={rootPath} resolution={project.resolution} />
            )}
          </div>
        </div>

        {/* ── Right settings panel (Inspector) ───────────────────────────────── */}
        <div style={{ width: 280, flexShrink: 0, overflowY: 'auto', background: 'var(--bg1)', borderLeft: '1px solid var(--bdr)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17 }}>⚙️</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{t('gui.properties')}</span>
            </div>
          </div>

          {activeTab === 'main_menu' && (<>
            {selectedBtn && (
              <Section label={t('gui.sec_edit_btn')}>
                <Field label={t('gui.field_label')}>
                  <input className="inspector-input" value={selectedBtn.label}
                    onChange={e => updateBtn(selectedBtn.id, { label: e.target.value })} />
                </Field>
                <Field label={t('gui.field_action')}>
                  <select className="inspector-input" value={selectedBtn.action}
                    onChange={e => updateBtn(selectedBtn.id, { action: e.target.value as VNMainMenuButton['action'] })}>
                    {(Object.keys(ACTION_LABELS) as VNMainMenuButton['action'][]).map(a => (
                      <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                    ))}
                  </select>
                </Field>
                {selectedBtn.action === 'custom' && (
                  <Field label={t('gui.field_renpy_action')}>
                    <input className="inspector-input" placeholder={t('gui.field_renpy_action_ph')}
                      value={selectedBtn.customAction ?? ''}
                      onChange={e => updateBtn(selectedBtn.id, { customAction: e.target.value })} />
                  </Field>
                )}
              </Section>
            )}

            <Section label={t('gui.sec_game_text')}>
              <Field label={t('gui.field_game_title')}>
                <input className="inspector-input" value={optCfg?.name ?? menu.title} onChange={e => {
                  updateMenu({ title: e.target.value });
                  applyOptPatch({ name: e.target.value });
                }} />
              </Field>
              <Field label={t('gui.field_version')}>
                <input className="inspector-input" value={optCfg?.version ?? "1.0"} onChange={e => applyOptPatch({ version: e.target.value })} />
              </Field>
            </Section>

            <Section label={t('gui.sec_gui_settings')}>
              <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--teal) 10%, transparent)', border: '1px solid var(--teal)', borderRadius: 6, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 700 }}>{t('gui.magic_palette_label')}</div>
                <button className="btn btn-accent" style={{ fontSize: 11, padding: '4px 10px' }} 
                  onClick={() => {
                    const palette = generatePalette(accentColor);
                    applyGuiPatch({
                      accent_color: rpyColor(palette.accent_color),
                      idle_color: rpyColor(palette.idle_color),
                      hover_color: rpyColor(palette.hover_color),
                      selected_color: rpyColor(palette.selected_color),
                      muted_color: rpyColor(palette.muted_color),
                      interface_text_color: rpyColor(palette.text_color),
                      text_color: rpyColor(palette.text_color),
                    });
                  }}>{t('gui.auto_theme')}</button>
              </div>
              <Field label={t('gui.field_sidebar_width')}>
                <SliderRow value={scrCfg?.main_menu_frame_xsize ?? Math.round(W * 0.21875)} min={100} max={Math.max(1920, W)} onChange={v => applyScrPatch({ main_menu_frame_xsize: v })} />
              </Field>
              <Field label={t('gui.field_opt_btn_size')}>
                <SliderRow value={guiCfg?.interface_text_size ?? Math.round(H * (24/720))} min={14} max={60} onChange={v => applyGuiPatch({ interface_text_size: String(v) })} />
              </Field>
              <Field label={t('gui.field_title_color')}>
                <ColorRow value={titleColor} onChange={v => applyGuiPatch({ main_menu_text_color: rpyColor(v) })} />
              </Field>
              <Field label={t('gui.field_title_font_size')}>
                <SliderRow value={titleSize} min={20} max={100} onChange={v => applyGuiPatch({ title_text_size: rpyNum(v) })} />
              </Field>
              <Field label={t('gui.field_accent_color')}>
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label={t('gui.field_idle_color')}>
                <ColorRow value={idleColor} onChange={v => applyGuiPatch({ idle_color: rpyColor(v) })} />
              </Field>
              <Field label={t('gui.field_hover_color')}>
                <ColorRow value={hoverColor} onChange={v => applyGuiPatch({ hover_color: rpyColor(v) })} />
              </Field>
            </Section>
          </>
            )}

          {/* ── Textbox tab ── */}
          {activeTab === 'textbox' && (<>
            <Section label={t('gui.sec_bg_images')}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11, padding: '4px 8px' }} onClick={() => handleImageUpload('game/gui/textbox.png')}>
                  {t('gui.upload_textbox')}
                </button>
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11, padding: '4px 8px' }} onClick={() => handleImageUpload('game/gui/namebox.png')}>
                  {t('gui.upload_namebox')}
                </button>
              </div>
            </Section>
            
            <Section label={t('gui.sec_textbox_settings')}>
              <Field label={t('gui.field_textbox_height')}>
                <SliderRow value={guiCfg?.textbox_height ?? Math.round(H * 0.25)} min={50} max={Math.round(H * 0.5)} onChange={v => applyGuiPatch({ textbox_height: String(v) })} />
              </Field>
              <Field label={t('gui.field_name_x')}>
                <SliderRow value={guiCfg?.name_xpos ?? Math.round(W * 0.1875)} min={0} max={W} onChange={v => applyGuiPatch({ name_xpos: String(v) })} />
              </Field>
              <Field label={t('gui.field_name_y')}>
                <SliderRow value={guiCfg?.name_ypos ?? 0} min={-100} max={200} onChange={v => applyGuiPatch({ name_ypos: String(v) })} />
              </Field>
              <Field label={t('gui.field_dlg_x')}>
                <SliderRow value={guiCfg?.dialogue_xpos ?? Math.round(W * 0.209)} min={0} max={W} onChange={v => applyGuiPatch({ dialogue_xpos: String(v) })} />
              </Field>
              <Field label={t('gui.field_dlg_y')}>
                <SliderRow value={guiCfg?.dialogue_ypos ?? Math.round(H * 0.069)} min={0} max={200} onChange={v => applyGuiPatch({ dialogue_ypos: String(v) })} />
              </Field>
              <Field label={t('gui.field_dlg_width')}>
                <SliderRow value={guiCfg?.dialogue_width ?? Math.round(W * 0.581)} min={200} max={W} onChange={v => applyGuiPatch({ dialogue_width: String(v) })} />
              </Field>
              <Field label={t('gui.field_name_size')}>
                <SliderRow value={guiCfg?.name_text_size ?? Math.round(H * 0.0416)} min={12} max={120} onChange={v => applyGuiPatch({ name_text_size: String(v) })} />
              </Field>
              <Field label={t('gui.field_dlg_size')}>
                <SliderRow value={guiCfg?.text_size ?? Math.round(H * 0.0305)} min={12} max={120} onChange={v => applyGuiPatch({ text_size: String(v) })} />
              </Field>
              <Field label={t('gui.field_dlg_color')}>
                <ColorRow value={guiCfg?.text_color ?? '#ffffff'} onChange={v => applyGuiPatch({ text_color: rpyColor(v) })} />
              </Field>
            </Section>

            <Section label={t('gui.sec_typography')}>
              <CustomFontBrowser rootPath={rootPath} guiCfg={guiCfg} applyGuiPatch={applyGuiPatch} />
            </Section>
          </>
            )}

          {/* ── Load screen tab ── */}
          {activeTab === 'load' && (<>
            <Section label={t('gui.sec_game_menu')}>
              <Field label={t('gui.field_nav_sidebar')}>
                <SliderRow value={scrCfg?.game_menu_navigation_frame_xsize ?? Math.round(W * 0.21875)} min={100} max={Math.max(1920, W)} onChange={v => applyScrPatch({ game_menu_navigation_frame_xsize: v })} />
              </Field>
              <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.6, marginTop: 8 }}>
                {t('gui.info_sidebar')}
              </div>
            </Section>
            <Section label={t('gui.sec_save_load')}>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.6 }}>
                {t('gui.info_save_load')}
              </div>
              <Field label={t('gui.field_accent_slot')}>
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label={t('gui.field_iface_size')}>
                <SliderRow value={guiCfg?.interface_text_size ?? 24} min={14} max={40}
                  onChange={v => applyGuiPatch({ interface_text_size: rpyNum(v) })} />
              </Field>
              <Field label={t('gui.field_iface_color')}>
                <ColorRow value={guiCfg?.interface_text_color ?? '#ffffff'}
                  onChange={v => applyGuiPatch({ interface_text_color: rpyColor(v) })} />
              </Field>
              <div style={{ marginTop: 8, padding: 10, background: 'rgba(250,204,21,0.07)', border: '1px solid #facc1533', borderRadius: 6 }}>
                <p style={{ fontSize: 11, color: '#facc15', margin: 0, lineHeight: 1.6 }}>
                  {t('gui.info_slot_grid')}
                </p>
              </div>
            </Section>
          </>
          )}

          {/* ── Preferences screen tab ── */}
          {activeTab === 'preferences' && (
            <Section label={t('gui.sec_preferences')}>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.6 }}>
                {t('gui.info_prefs')}
              </div>
              <Field label={t('gui.field_accent_headings')}>
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label={t('gui.field_iface_color')}>
                <ColorRow value={guiCfg?.interface_text_color ?? '#ffffff'}
                  onChange={v => applyGuiPatch({ interface_text_color: rpyColor(v) })} />
              </Field>
              <Field label={t('gui.field_iface_size')}>
                <SliderRow value={guiCfg?.interface_text_size ?? 24} min={14} max={40}
                  onChange={v => applyGuiPatch({ interface_text_size: rpyNum(v) })} />
              </Field>
              <Field label={t('gui.field_idle_color')}>
                <ColorRow value={idleColor} onChange={v => applyGuiPatch({ idle_color: rpyColor(v) })} />
              </Field>
              <Field label={t('gui.field_hover_color')}>
                <ColorRow value={hoverColor} onChange={v => applyGuiPatch({ hover_color: rpyColor(v) })} />
              </Field>
            </Section>
          )}

          {/* ── About screen tab ── */}
          {activeTab === 'about' && (
            <Section label={t('gui.sec_about')}>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.6 }}>
                {t('gui.info_about')}
              </div>
              <Field label={t('gui.field_accent_title')}>
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label="Interface Text Color">
                <ColorRow value={guiCfg?.interface_text_color ?? '#ffffff'}
                  onChange={v => applyGuiPatch({ interface_text_color: rpyColor(v) })} />
              </Field>
              <div style={{ marginTop: 8, padding: 10, background: 'rgba(250,204,21,0.07)', border: '1px solid #facc1533', borderRadius: 6 }}>
                <p style={{ fontSize: 11, color: '#facc15', margin: 0, lineHeight: 1.6 }}>
                  {t('gui.info_about_note')}
                </p>
              </div>
            </Section>
          )}

          {/* ── Help screen tab ── */}
          {activeTab === 'help' && (
            <Section label={t('gui.sec_help')}>
              <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.6 }}>
                {t('gui.info_help')}
              </div>
              <Field label={t('gui.field_accent_color')}>
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label="Interface Text Color">
                <ColorRow value={guiCfg?.interface_text_color ?? '#ffffff'}
                  onChange={v => applyGuiPatch({ interface_text_color: rpyColor(v) })} />
              </Field>
              <Field label={t('gui.field_help_label_width')}>
                <SliderRow value={scrCfg?.help_label_xsize ?? 250} min={100} max={600} onChange={v => applyScrPatch({ help_label_xsize: v })} />
              </Field>
              <div style={{ marginTop: 8, padding: 10, background: 'rgba(250,204,21,0.07)', border: '1px solid #facc1533', borderRadius: 6 }}>
                <p style={{ fontSize: 11, color: '#facc15', margin: 0, lineHeight: 1.6 }}>
                  {t('gui.info_help_note')}
                </p>
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Preview ──────────────────────────────────────────────────────────────────
export function RenpyPreview({ menu, cfg, optCfg, scrCfg, rootPath, resolution, selectedId, onSelectBtn, onGuiPatch, onScrPatch, imgTick, isThumbnail }: {
  menu: VNMainMenu;
  cfg: GuiConfig | null;
  optCfg: OptionsConfig | null;
  scrCfg: ScreenConfig | null;
  rootPath: string;
  resolution: [number, number];
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
          boxShadow: isThumbnail ? 'none' : '0 0 0 2px #1e2d42, 0 24px 64px rgba(0,0,0,0.7)',
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
        outline: selected ? '1.5px dashed rgba(75,108,247,0.8)' : hovered ? '1px dashed rgba(255,255,255,0.4)' : 'none',
        outlineOffset: 2, borderRadius: 2, padding: '1px 6px',
        background: selected ? 'rgba(75,108,247,0.15)' : 'transparent',
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
function GameMenuShell({ cfg, scrCfg, rootPath, resolution, children }: {
  cfg: GuiConfig | null; scrCfg?: ScreenConfig | null; rootPath: string; resolution: [number, number]; children: React.ReactNode;
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
  
  const accentColor = cfg?.accent_color ?? '#cc6600';
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
        boxShadow: '0 0 0 2px #1e2d42, 0 24px 64px rgba(0,0,0,0.7)',
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
function LoadScreenPreview({ cfg, scrCfg, rootPath, resolution }: { cfg: GuiConfig | null; scrCfg: ScreenConfig | null; rootPath: string; resolution: [number, number] }) {
  const [W, H] = [cfg?.init_width ?? 1280, cfg?.init_height ?? 720];
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  const titleSize   = cfg?.title_text_size ?? Math.round(H * (50/720));
  const labelSize   = cfg?.label_text_size ?? Math.round(H * (24/720));
  const interfaceTextSize = cfg?.interface_text_size ?? Math.round(H * (22/720));
  const interfaceFont = cfg?.interface_text_font && cfg.interface_text_font !== "DejaVuSans.ttf" ? '"RenpyInterfaceFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif';
  return (
    <GameMenuShell cfg={cfg} scrCfg={scrCfg} rootPath={rootPath} resolution={resolution}>
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
function PreferencesScreenPreview({ cfg, scrCfg, rootPath, resolution }: { cfg: GuiConfig | null; scrCfg: ScreenConfig | null; rootPath: string; resolution: [number, number] }) {
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
    <GameMenuShell cfg={cfg} scrCfg={scrCfg} rootPath={rootPath} resolution={resolution}>
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
function AboutScreenPreview({ cfg, scrCfg, rootPath, resolution, project }: { cfg: GuiConfig | null; scrCfg: ScreenConfig | null; rootPath: string; resolution: [number, number]; project: VNProject }) {
  const [W, H] = [cfg?.init_width ?? 1280, cfg?.init_height ?? 720];
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  const titleSize   = cfg?.title_text_size ?? Math.round(H * (50/720));
  const labelSize   = cfg?.label_text_size ?? Math.round(H * (24/720));
  const interfaceTextSize = cfg?.interface_text_size ?? Math.round(H * (22/720));
  const interfaceFont = cfg?.interface_text_font && cfg.interface_text_font !== "DejaVuSans.ttf" ? '"RenpyInterfaceFont", sans-serif' : '"DejaVu Sans", "Open Sans", sans-serif';
  return (
    <GameMenuShell cfg={cfg} scrCfg={scrCfg} rootPath={rootPath} resolution={resolution}>
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
function HelpScreenPreview({ cfg, scrCfg, rootPath, resolution }: { cfg: GuiConfig | null; scrCfg: ScreenConfig | null; rootPath: string; resolution: [number, number] }) {
  const [W, H] = [cfg?.init_width ?? 1280, cfg?.init_height ?? 720];
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  const titleSize   = cfg?.title_text_size ?? Math.round(H * (50/720));
  const labelSize   = cfg?.label_text_size ?? Math.round(H * (24/720));
  const interfaceTextSize = cfg?.interface_text_size ?? Math.round(H * (22/720));
  const labelWidth = scrCfg?.help_label_xsize ?? 250;
  const shortcuts = [['Enter, Space', 'Advance'], ['Ctrl', 'Skip'], ['Tab', 'Auto-forward'], ['Page Up', 'Roll back'], ['H', 'Hide interface'], ['S', 'Screenshot'], ['V', 'Accessibility']];
  return (
    <GameMenuShell cfg={cfg} scrCfg={scrCfg} rootPath={rootPath} resolution={resolution}>
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
function TextboxPreview({ cfg, rootPath, resolution, imgTick }: { cfg: GuiConfig | null; rootPath: string; resolution: [number, number]; imgTick?: number }) {
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

// ─── Small helper components ──────────────────────────────────────────────────
function Section({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bdr)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1 }}>{label}</span>
        {action}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--dim)', display: 'block', marginBottom: 6, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function ColorRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 32, height: 32, border: '1px solid var(--bdr)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg0)', padding: 2, flexShrink: 0 }} />
      <input className="inspector-input" value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1 }} />
    </div>
  );
}

function SliderRow({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--teal)' }} />
      <span style={{ fontSize: 11, color: 'var(--dim)', width: 38, textAlign: 'right', fontFamily: 'var(--mono)' }}>{value}px</span>
    </div>
  );
}

// ─── Thumbnail for graph node card ────────────────────────────────────────────
export function MainMenuThumbnail({ menu, title, rootPath, style }: {
  menu?: VNMainMenu; title: string; rootPath?: string; style?: React.CSSProperties;
}) {
  const [cfg, setCfg] = useState<GuiConfig | null>(null);
  const [optCfg, setOptCfg] = useState<OptionsConfig | null>(null);
  const [scrCfg, setScrCfg] = useState<ScreenConfig | null>(null);

  useEffect(() => {
    if (!rootPath) return;
    readGuiRpy(rootPath).then(t => t && setCfg(parseGuiRpy(t))).catch(() => {});
    readOptionsRpy(rootPath).then(t => t && setOptCfg(parseOptionsRpy(t))).catch(() => {});
    readScreensRpy(rootPath).then(t => t && setScrCfg(parseScreensRpy(t))).catch(() => {});
  }, [rootPath]);

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 4, background: '#000', ...style }}>
      <RenpyPreview
        menu={menu || { title: title, buttons: [], style: {} }}
        cfg={cfg}
        optCfg={optCfg}
        scrCfg={scrCfg}
        rootPath={rootPath || ""}
        resolution={[1280, 720]}
        isThumbnail={true}
      />
    </div>
  );
}
