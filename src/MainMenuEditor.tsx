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
import { readGuiRpy, writeGuiRpy } from "./tauriApi";
import { parseGuiRpy, patchGuiRpy, rpyColor, rpyNum, type GuiConfig } from "./guiParser";
import type { VNProject, VNMainMenu, VNMainMenuButton } from "./types";

// ─── Defaults (Ren'Py standard values) ────────────────────────────────────────
const D_IDLE    = '#555555';
const D_HOVER   = '#e0a366';

function defaultButtons(): VNMainMenuButton[] {
  const rows: [string, VNMainMenuButton['action']][] = [
    ['Start', 'start'], ['Load', 'load'], ['Preferences', 'preferences'],
    ['About', 'about'], ['Help', 'help'], ['Quit', 'quit'],
  ];
  return rows.map(([label, action], i) => ({
    id: `def_${i}`, label, action, x: 0, y: 0, visible: true,
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

type ScreenTab = 'main_menu' | 'load' | 'preferences' | 'about' | 'help';
const TABS: { id: ScreenTab; icon: string; label: string }[] = [
  { id: 'main_menu',   icon: '🎮', label: 'Main Menu' },
  { id: 'load',        icon: '📂', label: 'Load' },
  { id: 'preferences', icon: '⚙️', label: 'Preferences' },
  { id: 'about',       icon: 'ℹ️', label: 'About' },
  { id: 'help',        icon: '❓', label: 'Help' },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function MainMenuEditor({ project, onProjectChange }: Props) {
  const menu: VNMainMenu = project.main_menu ?? defaultMenu(project.title);
  const rootPath = project._rootPath ?? '';

  // gui.rpy state
  const [guiRaw, setGuiRaw]       = useState<string | null>(null);
  const [guiCfg, setGuiCfg]       = useState<GuiConfig | null>(null);
  const [guiLoading, setGuiLoading] = useState(true);
  const [guiError,   setGuiError]   = useState<string | null>(null);
  const writeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ScreenTab>('main_menu');
  const selectedBtn = menu.buttons.find(b => b.id === selectedId) ?? null;

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
      label: 'New Button', action: 'custom', x: 0, y: 0, visible: true,
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
            <span>{tab.icon}</span>{tab.label}
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
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{TABS.find(t => t.id === activeTab)?.label} Editor</span>
            </div>
            {guiLoading && <p style={{ fontSize: 11, color: 'var(--acc)', margin: '6px 0 0' }}>Loading gui.rpy…</p>}
            {guiError  && <p style={{ fontSize: 11, color: 'var(--err)', margin: '6px 0 0' }}>⚠ {guiError}</p>}
            {!guiLoading && !guiError && guiCfg && (
              <p style={{ fontSize: 11, color: 'var(--dim)', margin: '5px 0 0', lineHeight: 1.4 }}>
                Edits write directly to <code style={{ fontSize: 10 }}>gui.rpy</code>.
              </p>
            )}
          </div>

          {/* ── Main Menu tab ── */}
          {activeTab === 'main_menu' && (<>
            <Section label="GUI SETTINGS (gui.rpy)">
              <Field label="Title Color">
                <ColorRow value={titleColor} onChange={v => applyGuiPatch({ main_menu_text_color: rpyColor(v) })} />
              </Field>
              <Field label="Title Font Size">
                <SliderRow value={titleSize} min={20} max={100} onChange={v => applyGuiPatch({ title_text_size: rpyNum(v) })} />
              </Field>
              <Field label="Accent Color">
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label="Button Idle Color">
                <ColorRow value={idleColor} onChange={v => applyGuiPatch({ idle_color: rpyColor(v) })} />
              </Field>
              <Field label="Button Hover Color">
                <ColorRow value={hoverColor} onChange={v => applyGuiPatch({ hover_color: rpyColor(v) })} />
              </Field>
              <Field label="Nav Button X Position">
                <SliderRow value={navXpos} min={0} max={300} onChange={v => applyGuiPatch({ navigation_xpos: rpyNum(v) })} />
              </Field>
            </Section>

            <Section label="NAV BUTTONS" action={
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

              {selectedBtn && (
                <div style={{ marginTop: 10, padding: 10, background: 'var(--bg2)', borderRadius: 7, border: '1px solid var(--bdr)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>EDIT BUTTON</div>
                  <Field label="Label">
                    <input className="input" value={selectedBtn.label}
                      onChange={e => updateBtn(selectedBtn.id, { label: e.target.value })} />
                  </Field>
                  <Field label="Action">
                    <select className="input" value={selectedBtn.action}
                      onChange={e => updateBtn(selectedBtn.id, { action: e.target.value as VNMainMenuButton['action'] })}>
                      {(Object.keys(ACTION_LABELS) as VNMainMenuButton['action'][]).map(a => (
                        <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                      ))}
                    </select>
                  </Field>
                  {selectedBtn.action === 'custom' && (
                    <Field label="Ren'Py Action">
                      <input className="input" placeholder="e.g. ShowMenu('my_screen')"
                        value={selectedBtn.customAction ?? ''}
                        onChange={e => updateBtn(selectedBtn.id, { customAction: e.target.value })} />
                    </Field>
                  )}
                </div>
              )}
            </Section>

            <div style={{ padding: '0 14px 14px' }}>
              <button className="btn btn-ghost" style={{ color: 'var(--err)', width: '100%', justifyContent: 'center' }}
                onClick={() => { if (window.confirm('Reset buttons to defaults?')) updateMenu({ buttons: defaultButtons() }); }}>
                ↺ Reset Buttons to Defaults
              </button>
            </div>
          </>)}

          {/* ── Load screen tab ── */}
          {activeTab === 'load' && (
            <Section label="SAVE / LOAD SCREEN">
              <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.6 }}>
                These settings control the appearance of the Load and Save screens.
              </div>
              <Field label="Accent Color (slot borders)">
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label="Interface Text Size">
                <SliderRow value={guiCfg?.interface_text_size ?? 24} min={14} max={40}
                  onChange={v => applyGuiPatch({ interface_text_size: rpyNum(v) })} />
              </Field>
              <Field label="Interface Text Color">
                <ColorRow value={guiCfg?.interface_text_color ?? '#ffffff'}
                  onChange={v => applyGuiPatch({ interface_text_color: rpyColor(v) })} />
              </Field>
              <div style={{ marginTop: 8, padding: 10, background: 'rgba(250,204,21,0.07)', border: '1px solid #facc1533', borderRadius: 6 }}>
                <p style={{ fontSize: 11, color: '#facc15', margin: 0, lineHeight: 1.6 }}>
                  Slot grid layout (columns, dimensions) is defined in <code>screens.rpy</code> and requires direct editing.
                </p>
              </div>
            </Section>
          )}

          {/* ── Preferences screen tab ── */}
          {activeTab === 'preferences' && (
            <Section label="PREFERENCES SCREEN">
              <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.6 }}>
                These settings control the Preferences screen appearance.
              </div>
              <Field label="Accent Color (headings & sliders)">
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label="Interface Text Color">
                <ColorRow value={guiCfg?.interface_text_color ?? '#ffffff'}
                  onChange={v => applyGuiPatch({ interface_text_color: rpyColor(v) })} />
              </Field>
              <Field label="Interface Text Size">
                <SliderRow value={guiCfg?.interface_text_size ?? 24} min={14} max={40}
                  onChange={v => applyGuiPatch({ interface_text_size: rpyNum(v) })} />
              </Field>
              <Field label="Button Idle Color">
                <ColorRow value={idleColor} onChange={v => applyGuiPatch({ idle_color: rpyColor(v) })} />
              </Field>
              <Field label="Button Hover Color">
                <ColorRow value={hoverColor} onChange={v => applyGuiPatch({ hover_color: rpyColor(v) })} />
              </Field>
            </Section>
          )}

          {/* ── About screen tab ── */}
          {activeTab === 'about' && (
            <Section label="ABOUT SCREEN">
              <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.6 }}>
                The About screen displays credits and version info.
              </div>
              <Field label="Accent Color (title text)">
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label="Interface Text Color">
                <ColorRow value={guiCfg?.interface_text_color ?? '#ffffff'}
                  onChange={v => applyGuiPatch({ interface_text_color: rpyColor(v) })} />
              </Field>
              <div style={{ marginTop: 8, padding: 10, background: 'rgba(250,204,21,0.07)', border: '1px solid #facc1533', borderRadius: 6 }}>
                <p style={{ fontSize: 11, color: '#facc15', margin: 0, lineHeight: 1.6 }}>
                  Credit text content is defined in <code>options.rpy</code> under <code>config.version</code>, <code>gui.about</code>, etc.
                </p>
              </div>
            </Section>
          )}

          {/* ── Help screen tab ── */}
          {activeTab === 'help' && (
            <Section label="HELP SCREEN">
              <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.6 }}>
                The Help screen is a standard Ren'Py system screen showing keyboard shortcuts.
              </div>
              <Field label="Accent Color">
                <ColorRow value={accentColor} onChange={v => applyGuiPatch({ accent_color: rpyColor(v) })} />
              </Field>
              <Field label="Interface Text Color">
                <ColorRow value={guiCfg?.interface_text_color ?? '#ffffff'}
                  onChange={v => applyGuiPatch({ interface_text_color: rpyColor(v) })} />
              </Field>
              <div style={{ marginTop: 8, padding: 10, background: 'rgba(250,204,21,0.07)', border: '1px solid #facc1533', borderRadius: 6 }}>
                <p style={{ fontSize: 11, color: '#facc15', margin: 0, lineHeight: 1.6 }}>
                  Help screen layout and content is defined in <code>screens.rpy</code>.
                </p>
              </div>
            </Section>
          )}

        </div>

        {/* ── Right: Preview ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '6px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim)' }}>LIVE PREVIEW</span>
            <span style={{ fontSize: 11, color: 'var(--faint)' }}>— {TABS.find(t => t.id === activeTab)?.label} screen</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
              {project.resolution[0]} × {project.resolution[1]}
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05080f', padding: 24, overflow: 'hidden' }}>
            {activeTab === 'main_menu' && (
              <RenpyPreview menu={menu} cfg={guiCfg} rootPath={rootPath} resolution={project.resolution}
                selectedId={selectedId} onSelectBtn={setSelectedId} />
            )}
            {activeTab === 'load' && (
              <LoadScreenPreview cfg={guiCfg} rootPath={rootPath} resolution={project.resolution} />
            )}
            {activeTab === 'preferences' && (
              <PreferencesScreenPreview cfg={guiCfg} rootPath={rootPath} resolution={project.resolution} />
            )}
            {activeTab === 'about' && (
              <AboutScreenPreview cfg={guiCfg} rootPath={rootPath} resolution={project.resolution} project={project} />
            )}
            {activeTab === 'help' && (
              <HelpScreenPreview cfg={guiCfg} rootPath={rootPath} resolution={project.resolution} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Preview ──────────────────────────────────────────────────────────────────
function RenpyPreview({ menu, cfg, rootPath, resolution, selectedId, onSelectBtn }: {
  menu: VNMainMenu;
  cfg: GuiConfig | null;
  rootPath: string;
  resolution: [number, number];
  selectedId: string | null;
  onSelectBtn: (id: string | null) => void;
}) {
  const [bgOk,      setBgOk]      = useState(true);
  const [overlayOk, setOverlayOk] = useState(true);

  const bgSrc      = rootPath ? convertFileSrc(`${rootPath}/game/gui/main_menu.png`)          : '';
  const overlaySrc = rootPath ? convertFileSrc(`${rootPath}/game/gui/overlay/main_menu.png`)  : '';

  const [W, H] = resolution;
  // Ren'Py math: xalign 1.0, xanchor 1.0, xsize 960, xoffset -20
  // left edge = W - 960 + (-20) = W - 980
  const titleLeftPx  = W - 980;
  const titleLeftPct = (titleLeftPx / W) * 100; // ~23.4% for 1280
  const sidebarPct   = ((cfg?.sidebar_width ?? 280) / W) * 100;
  const navLeftPct   = ((cfg?.navigation_xpos ?? 40) / W) * 100;

  const titleColor  = cfg?.main_menu_text_color ?? menu.style?.titleColor  ?? '#ffaa22';
  const titleSize   = cfg?.title_text_size       ?? 50; // raw px, will be scaled
  const idleColor   = cfg?.idle_color   ?? D_IDLE;
  const hoverColor  = cfg?.hover_color  ?? D_HOVER;
  const navSpacing  = (cfg?.navigation_spacing ?? 4);

  return (
    <div
      style={{
        position: 'relative', width: '100%', maxWidth: 900,
        aspectRatio: `${W} / ${H}`,
        background: '#000', borderRadius: 8, overflow: 'hidden',
        boxShadow: '0 0 0 2px #1e2d42, 0 24px 64px rgba(0,0,0,0.7)',
      }}
      onClick={() => onSelectBtn(null)}
    >
      {/* Full-screen background */}
      {bgSrc && bgOk ? (
        <img src={bgSrc} alt="" onError={() => setBgOk(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1a2a1a 0%,#2a3a2a 50%,#3a4a1a 100%)' }} />
      )}

      {/* Left sidebar overlay — the real gui/overlay/main_menu.png */}
      {overlaySrc && overlayOk ? (
        <img src={overlaySrc} alt="" onError={() => setOverlayOk(false)}
          style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${sidebarPct}%`, objectFit: 'fill', objectPosition: 'left' }} />
      ) : (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${sidebarPct}%`, background: 'linear-gradient(to right,rgba(0,0,0,0.88) 80%,rgba(0,0,0,0))' }} />
      )}

      {/* Navigation buttons — vertically centered in sidebar */}
      <div style={{
        position: 'absolute', left: `${navLeftPct}%`, top: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        gap: `${navSpacing * 0.07}em`,
        width: `${sidebarPct}%`,
      }}>
        {menu.buttons.filter(b => b.visible).map(btn => (
          <NavBtn
            key={btn.id}
            btn={btn}
            idleColor={idleColor}
            hoverColor={hoverColor}
            selected={selectedId === btn.id}
            onClick={e => { e.stopPropagation(); onSelectBtn(btn.id === selectedId ? null : btn.id); }}
          />
        ))}
      </div>

      {/* Title + "Ren'Py 7+ Edition" — bottom, left-aligned at vbox position */}
      <div style={{
        position: 'absolute',
        left: `${titleLeftPct}%`,
        bottom: `${(20 / H) * 100}%`, // yoffset -20 → bottom padding
        lineHeight: 1.15,
      }}>
        <div style={{
          fontSize: `${(titleSize / H) * 100 * 0.75}em`,
          fontWeight: 700, color: titleColor,
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          fontFamily: 'var(--font)',
        }}>
          {menu.title}
        </div>
        <div style={{ fontSize: `${(24 / H) * 100 * 0.75}em`, color: titleColor, opacity: 0.7 }}>
          Ren'Py 7+ Edition
        </div>
      </div>
    </div>
  );
}

// ─── Nav button with hover ────────────────────────────────────────────────────
function NavBtn({ btn, idleColor, hoverColor, selected, onClick }: {
  btn: VNMainMenuButton;
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
        fontSize: '1.35em', color, cursor: 'pointer', userSelect: 'none',
        fontFamily: 'DejaVu Sans, var(--font)', fontWeight: 400,
        outline: selected ? '1.5px dashed rgba(75,108,247,0.8)' : 'none',
        outlineOffset: 2, borderRadius: 2, padding: '1px 6px',
        background: selected ? 'rgba(75,108,247,0.15)' : 'transparent',
        transition: 'color 0.12s',
        whiteSpace: 'nowrap',
      }}
    >
      {btn.label}
    </div>
  );
}

// ─── Shared game-menu bg wrapper ─────────────────────────────────────────────
function GameMenuShell({ cfg, rootPath, resolution, children }: {
  cfg: GuiConfig | null; rootPath: string; resolution: [number, number]; children: React.ReactNode;
}) {
  const [bgOk, setBgOk] = useState(true);
  const [overlayOk, setOverlayOk] = useState(true);
  const [W, H] = resolution;
  const sidebarPct = ((cfg?.sidebar_width ?? 280) / W) * 100;
  const navLeftPct = ((cfg?.navigation_xpos ?? 40) / W) * 100;
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const idleColor   = cfg?.idle_color   ?? '#555555';
  const bgSrc      = rootPath ? convertFileSrc(`${rootPath}/game/gui/game_menu.png`)          : '';
  const overlaySrc = rootPath ? convertFileSrc(`${rootPath}/game/gui/overlay/game_menu.png`)  : '';
  const navItems = ['Start', 'Load', 'Preferences', 'About', 'Help', 'Quit'];
  return (
    <div style={{
      position: 'relative', width: '100%', maxWidth: 900, aspectRatio: `${W} / ${H}`,
      background: '#000', borderRadius: 8, overflow: 'hidden',
      boxShadow: '0 0 0 2px #1e2d42, 0 24px 64px rgba(0,0,0,0.7)',
    }}>
      {bgSrc && bgOk ? (
        <img src={bgSrc} alt="" onError={() => setBgOk(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#0a120a 0%,#1a2a1a 50%,#1a1a2a 100%)' }} />
      )}
      {overlaySrc && overlayOk ? (
        <img src={overlaySrc} alt="" onError={() => setOverlayOk(false)}
          style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${sidebarPct}%`, objectFit: 'fill' }} />
      ) : (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${sidebarPct}%`, background: 'linear-gradient(to right,rgba(0,0,0,0.88) 80%,rgba(0,0,0,0))' }} />
      )}
      {/* Left nav sidebar */}
      <div style={{ position: 'absolute', left: `${navLeftPct}%`, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.4em', width: `${sidebarPct}%` }}>
        {navItems.map(item => (
          <div key={item} style={{ fontSize: '0.9em', color: idleColor, fontFamily: 'DejaVu Sans, var(--font)', whiteSpace: 'nowrap' }}>{item}</div>
        ))}
        <div style={{ fontSize: '0.9em', color: idleColor, marginTop: '2em', opacity: 0.6 }}>Return</div>
      </div>
      {/* Vertical accent bar */}
      <div style={{ position: 'absolute', left: `${sidebarPct}%`, top: 0, bottom: 0, width: 2, background: accentColor, opacity: 0.7 }} />
      {/* Content area */}
      <div style={{ position: 'absolute', left: `${sidebarPct + 2}%`, top: 0, right: 0, bottom: 0, padding: '4% 5%', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Load screen preview ──────────────────────────────────────────────────────
function LoadScreenPreview({ cfg, rootPath, resolution }: { cfg: GuiConfig | null; rootPath: string; resolution: [number, number] }) {
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  return (
    <GameMenuShell cfg={cfg} rootPath={rootPath} resolution={resolution}>
      <div style={{ color: accentColor, fontSize: '2.2em', fontWeight: 700, marginBottom: '0.4em' }}>Load</div>
      <div style={{ color: textColor, fontSize: '0.85em', marginBottom: '0.8em', opacity: 0.8 }}>Page 1</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2%' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            aspectRatio: '4/3', background: accentColor, borderRadius: 4, opacity: 0.7,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '4px',
          }}>
            <span style={{ fontSize: '0.6em', color: textColor, opacity: 0.8 }}>empty slot</span>
          </div>
        ))}
      </div>
    </GameMenuShell>
  );
}

// ─── Preferences screen preview ───────────────────────────────────────────────
function PreferencesScreenPreview({ cfg, rootPath, resolution }: { cfg: GuiConfig | null; rootPath: string; resolution: [number, number] }) {
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  const idleColor   = cfg?.idle_color ?? '#555555';
  const sections = [
    { title: 'Display',  items: ['Window', 'Fullscreen'] },
    { title: 'Skip',     items: ['Unseen Text', 'After Choices', 'Transitions'] },
    { title: 'Language', items: ['English', 'Español', 'Français'] },
  ];
  const sliders = ['Text Speed', 'Auto-Forward Time', 'Music Volume', 'Sound Volume'];
  return (
    <GameMenuShell cfg={cfg} rootPath={rootPath} resolution={resolution}>
      <div style={{ color: accentColor, fontSize: '2.2em', fontWeight: 700, marginBottom: '0.6em' }}>Preferences</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5%', marginBottom: '0.8em' }}>
        {sections.map(s => (
          <div key={s.title}>
            <div style={{ color: accentColor, fontSize: '0.8em', fontWeight: 700, marginBottom: '0.3em' }}>{s.title}</div>
            {s.items.map(item => (
              <div key={item} style={{ color: textColor, fontSize: '0.7em', opacity: 0.8, marginBottom: '0.2em' }}>{item}</div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4% 8%' }}>
        {sliders.map(s => (
          <div key={s}>
            <div style={{ color: accentColor, fontSize: '0.7em', marginBottom: '0.25em' }}>{s}</div>
            <div style={{ height: 4, background: `linear-gradient(to right, ${accentColor} 70%, ${idleColor} 70%)`, borderRadius: 2 }} />
          </div>
        ))}
      </div>
    </GameMenuShell>
  );
}

// ─── About screen preview ─────────────────────────────────────────────────────
function AboutScreenPreview({ cfg, rootPath, resolution, project }: { cfg: GuiConfig | null; rootPath: string; resolution: [number, number]; project: VNProject }) {
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  return (
    <GameMenuShell cfg={cfg} rootPath={rootPath} resolution={resolution}>
      <div style={{ color: accentColor, fontSize: '2.2em', fontWeight: 700, marginBottom: '0.2em' }}>About</div>
      <div style={{ color: accentColor, fontSize: '1em', marginBottom: '0.6em', opacity: 0.85 }}>{project.title}</div>
      <div style={{ color: textColor, fontSize: '0.7em', opacity: 0.7, lineHeight: 1.8 }}>
        <div>Author  <strong style={{ color: textColor }}>{project.author}</strong></div>
        <div style={{ marginTop: '0.5em', opacity: 0.5 }}>Made with Ren'Py</div>
      </div>
    </GameMenuShell>
  );
}

// ─── Help screen preview ──────────────────────────────────────────────────────
function HelpScreenPreview({ cfg, rootPath, resolution }: { cfg: GuiConfig | null; rootPath: string; resolution: [number, number] }) {
  const accentColor = cfg?.accent_color ?? '#cc6600';
  const textColor   = cfg?.interface_text_color ?? '#ffffff';
  const shortcuts = [['Enter, Space', 'Advance'], ['Ctrl', 'Skip'], ['Tab', 'Auto-forward'], ['Page Up', 'Roll back'], ['H', 'Hide interface'], ['S', 'Screenshot'], ['V', 'Accessibility']];
  return (
    <GameMenuShell cfg={cfg} rootPath={rootPath} resolution={resolution}>
      <div style={{ color: accentColor, fontSize: '2.2em', fontWeight: 700, marginBottom: '0.6em' }}>Help</div>
      <div style={{ color: accentColor, fontSize: '0.85em', fontWeight: 700, marginBottom: '0.4em' }}>Keyboard Shortcuts</div>
      {shortcuts.map(([key, action]) => (
        <div key={key} style={{ display: 'flex', gap: '1em', fontSize: '0.7em', marginBottom: '0.25em' }}>
          <span style={{ color: accentColor, minWidth: '8em' }}>{key}</span>
          <span style={{ color: textColor, opacity: 0.8 }}>{action}</span>
        </div>
      ))}
    </GameMenuShell>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────
function Section({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bdr)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1 }}>{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: 'var(--dim)', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

function ColorRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 34, height: 28, border: '1px solid var(--bdr)', borderRadius: 4, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
      <input className="input" value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1 }} />
    </div>
  );
}

function SliderRow({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: 'var(--dim)', width: 38, textAlign: 'right' }}>{value}px</span>
    </div>
  );
}

// ─── Thumbnail for graph node card ────────────────────────────────────────────
export function MainMenuThumbnail({ menu, title, rootPath, style }: {
  menu?: VNMainMenu; title: string; rootPath?: string; style?: React.CSSProperties;
}) {
  const [bgOk, setBgOk]           = useState(true);
  const [overlayOk, setOverlayOk] = useState(true);

  const bgSrc      = rootPath ? convertFileSrc(`${rootPath}/game/gui/main_menu.png`)         : '';
  const overlaySrc = rootPath ? convertFileSrc(`${rootPath}/game/gui/overlay/main_menu.png`) : '';

  const titleColor = menu?.style?.titleColor ?? '#ffaa22';
  const buttons    = menu?.buttons.filter(b => b.visible) ?? defaultButtons();

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 4, background: '#0a1a0a', ...style }}>
      {/* bg */}
      {bgSrc && bgOk ? (
        <img src={bgSrc} alt="" onError={() => setBgOk(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1a2a1a,#2a3a2a 50%,#3a4a1a)' }} />
      )}
      {/* sidebar overlay */}
      {overlaySrc && overlayOk ? (
        <img src={overlaySrc} alt="" onError={() => setOverlayOk(false)}
          style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '22%', objectFit: 'fill' }} />
      ) : (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '22%', background: 'linear-gradient(to right,rgba(0,0,0,0.88) 80%,rgba(0,0,0,0))' }} />
      )}
      {/* buttons */}
      <div style={{ position: 'absolute', left: '4%', top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
        {buttons.slice(0, 6).map(b => (
          <div key={b.id} style={{ fontSize: '0.37em', color: b.style?.color ?? D_IDLE, whiteSpace: 'nowrap', lineHeight: 1.55 }}>{b.label}</div>
        ))}
      </div>
      {/* title */}
      <div style={{ position: 'absolute', left: '23.5%', bottom: '5%' }}>
        <div style={{ fontSize: '0.48em', fontWeight: 700, color: titleColor, lineHeight: 1.1 }}>{menu?.title ?? title}</div>
        <div style={{ fontSize: '0.33em', color: titleColor, opacity: 0.65 }}>Ren'Py 7+ Edition</div>
      </div>
    </div>
  );
}
