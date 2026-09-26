/**
 * GuiEditor.tsx — The GUI tab: main menu and game menu screens.
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

import { useState, useEffect, useCallback, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { copyFile } from "@tauri-apps/plugin-fs";
import { readGuiRpy, writeGuiRpy, readOptionsRpy, writeOptionsRpy, readScreensRpy, writeScreensRpy } from "./tauriApi";
import { parseGuiRpy, patchGuiRpy, rpyColor, rpyNum, type GuiConfig } from "./guiParser";
import { paletteFromPixels } from "./imagePalette";
import { parseOptionsRpy, patchOptionsRpy, type OptionsConfig } from "./optionsParser";
import { parseScreensRpy, patchScreensRpy, type ScreenConfig } from "./screenParser";
import type { VNProject, VNMainMenu, VNMainMenuButton } from "./types";
import { useTranslation } from "./translationContext";
import { RenpyPreview, LoadScreenPreview, PreferencesScreenPreview, AboutScreenPreview, HelpScreenPreview, TextboxPreview } from "./GuiPreviews";
import { CustomFontBrowser, Section, Field, ColorRow, SliderRow } from "./GuiControls";

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

  const handleMagicPalette = () => {
    if (!rootPath) return;
    const imgUrl = convertFileSrc(`${rootPath}/game/gui/main_menu.png`) + `?t=${imgTick}`;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const palette = paletteFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      applyGuiPatch({
        accent_color: rpyColor(palette.accent),
        idle_color: rpyColor(palette.idle),
        hover_color: rpyColor(palette.hover),
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
                      background: selectedId === btn.id ? 'color-mix(in srgb, var(--acc) 10%, transparent)' : 'var(--bg2)',
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

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg0)', padding: 24, overflow: 'hidden' }}>
            {activeTab === 'main_menu' && (
              <RenpyPreview menu={menu} cfg={guiCfg} optCfg={optCfg} scrCfg={scrCfg} rootPath={rootPath}
                selectedId={selectedId} onSelectBtn={setSelectedId} 
                onGuiPatch={applyGuiPatch} onScrPatch={applyScrPatch}
                imgTick={imgTick} />
            )}
            {activeTab === 'textbox' && (
              <TextboxPreview cfg={guiCfg} rootPath={rootPath} imgTick={imgTick} />
            )}
            {activeTab === 'load' && (
              <LoadScreenPreview cfg={guiCfg} scrCfg={scrCfg} rootPath={rootPath} />
            )}
            {activeTab === 'preferences' && (
              <PreferencesScreenPreview cfg={guiCfg} scrCfg={scrCfg} rootPath={rootPath} />
            )}
            {activeTab === 'about' && (
              <AboutScreenPreview cfg={guiCfg} scrCfg={scrCfg} rootPath={rootPath} project={project} />
            )}
            {activeTab === 'help' && (
              <HelpScreenPreview cfg={guiCfg} scrCfg={scrCfg} rootPath={rootPath} />
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
