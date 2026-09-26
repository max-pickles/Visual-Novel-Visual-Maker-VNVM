/**
 * GuiControls.tsx — Form controls used by the GUI editor.
 */
import React, { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, mkdir, readDir } from "@tauri-apps/plugin-fs";
import { rpyStr, type GuiConfig } from "./guiParser";
import { useTranslation } from "./translationContext";

export function CustomFontBrowser({ rootPath, guiCfg, applyGuiPatch }: { rootPath: string, guiCfg: GuiConfig | null, applyGuiPatch: (p: any) => void }) {
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


// ─── Small helper components ──────────────────────────────────────────────────
export function Section({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={{ fontSize: 11, color: 'var(--dim)', display: 'block', marginBottom: 6, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

/** Colors Ren'Py accepts: #rgb, #rgba, #rrggbb or #rrggbbaa. */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** The #rrggbb form an `<input type="color">` needs. */
function colorInputValue(color: string): string {
  if (!HEX_COLOR.test(color)) return '#000000';
  const hex = color.slice(1);
  return hex.length <= 4 ? '#' + [...hex.slice(0, 3)].map(c => c + c).join('') : '#' + hex.slice(0, 6);
}

/**
 * A swatch plus a hex field. Typing only reaches `onChange` once the text is a
 * valid color, so gui.rpy never holds a half-typed value.
 */
export function ColorRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="color" value={colorInputValue(value)} onChange={e => onChange(e.target.value)}
        style={{ width: 32, height: 32, border: '1px solid var(--bdr)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg0)', padding: 2, flexShrink: 0 }} />
      <input className="inspector-input" value={draft}
        onChange={e => {
          setDraft(e.target.value);
          const color = e.target.value.trim();
          if (HEX_COLOR.test(color)) onChange(color);
        }}
        style={{ flex: 1, ...(HEX_COLOR.test(draft.trim()) ? {} : { borderColor: 'var(--err)' }) }} />
    </div>
  );
}

export function SliderRow({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--teal)' }} />
      <span style={{ fontSize: 11, color: 'var(--dim)', width: 38, textAlign: 'right', fontFamily: 'var(--mono)' }}>{value}px</span>
    </div>
  );
}
