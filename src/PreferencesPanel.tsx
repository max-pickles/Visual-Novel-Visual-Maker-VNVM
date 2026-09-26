/**
 * PreferencesPanel.tsx — The start screen's Preferences and Language pages.
 */
import type { AppPrefs } from "./App";
import { useTranslation } from "./translationContext";

const LANGUAGES = [
  { code: 'en', englishName: 'English', nativeName: 'English' },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español' },
  { code: 'ja', englishName: 'Japanese', nativeName: '日本語' }
];

interface Props {
  prefs: AppPrefs;
  windowMode: string;
  setWindowMode: (mode: string) => void;
  onOpenLanguage: () => void;
}

export function PreferencesPanel({ prefs, windowMode, setWindowMode, onOpenLanguage }: Props) {
  const { t } = useTranslation();
  const { bgLevel, setBgLevel, glowEnabled, setGlowEnabled, scanlinesEnabled, setScanlinesEnabled, uiScale, setUiScale, autoSave, setAutoSave, theme, setTheme, language } = prefs;
  return (
    <div style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto' }}>
      <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'var(--bg1)', padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)', letterSpacing: '.12em', textTransform: 'uppercase' }}>{t("prefs.title")}</div>

        {/* ── Window Mode (top) ── */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { val: 'windowed',   label: `⬜  ${t("prefs.windowed")}` },
            { val: 'fullscreen', label: `⛶  ${t("prefs.fullscreen")}` },
          ].map(m => {
            const sel = windowMode === m.val;
            return (
              <div key={m.val} onClick={async () => {
                setWindowMode(m.val);
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const win = getCurrentWindow();
                if (m.val === 'fullscreen') {
                  // True fullscreen — covers taskbar entirely
                  await win.setFullscreen(true);
                } else {
                  // Windowed — exit fullscreen AND un-maximize so taskbar returns
                  await win.setFullscreen(false);
                  await win.unmaximize();
                }
              }}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 6, cursor: 'pointer', border: sel ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.08)', background: sel ? 'color-mix(in srgb, var(--teal) 10%, transparent)' : 'rgba(0,0,0,0.2)', color: sel ? 'var(--teal)' : 'var(--dim)', fontWeight: 600, textAlign: 'center', transition: 'all 0.15s ease', fontSize: 13 }}>
                {m.label}
              </div>
            );
          })}
        </div>

        {/* ── Graphics ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--acc)', letterSpacing: '.15em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>{t("prefs.graphics")}</div>

          {/* Theme Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.color_theme")}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { val: 'vnv-dark',       labelKey: 'themes.vnv_dark',      teal: '#00d4c8', acc: '#4b6cf7', bg: '#05080f' },
                { val: 'frappe',         labelKey: 'themes.frappe',        teal: '#81c8be', acc: '#8caaee', bg: '#232634' },
                { val: 'nord',           labelKey: 'themes.nord',          teal: '#8fbcbb', acc: '#88c0d0', bg: '#2e3440' },
                { val: 'tokyo-night',    labelKey: 'themes.tokyo_night',   teal: '#7dcfff', acc: '#bb9af7', bg: '#1a1b26' },
                { val: 'solarized-dark', labelKey: 'themes.solarized_dark',teal: '#2aa198', acc: '#268bd2', bg: '#002b36' },
                { val: 'aura',           labelKey: 'themes.aura',          teal: '#61ffca', acc: '#a277ff', bg: '#15141b' },
                { val: 'amber',          labelKey: 'themes.amber',         teal: '#ffb000', acc: '#ff8800', bg: '#0f0a00' },
                { val: 'light',          labelKey: 'themes.light',         teal: '#0ea5e9', acc: '#3b82f6', bg: '#f8fafc' },
                { val: 'cherry',         labelKey: 'themes.cherry',        teal: '#d96262', acc: '#bf4a4a', bg: '#140d0d' },
                { val: 'forest',         labelKey: 'themes.forest',        teal: '#34d399', acc: '#10b981', bg: '#050f0a' },
                { val: 'sunset',         labelKey: 'themes.sunset',        teal: '#fbbf24', acc: '#f59e0b', bg: '#1a0b12' },
                { val: 'royal',          labelKey: 'themes.royal',         teal: '#d8b4fe', acc: '#c084fc', bg: '#0d0514' },
                { val: 'gruvbox',        labelKey: 'themes.gruvbox',       teal: '#8ec07c', acc: '#fabd2f', bg: '#282828' },
                { val: 'oceanic',        labelKey: 'themes.oceanic',       teal: '#5fb3b3', acc: '#6699cc', bg: '#1b2b34' },
                { val: 'rose-pine',      labelKey: 'themes.rose_pine',     teal: '#9ccfd8', acc: '#31748f', bg: '#191724' },
                { val: 'midnight',       labelKey: 'themes.midnight',      teal: '#38bdf8', acc: '#818cf8', bg: '#000000' },
              ].map(th => {
                const sel = theme === th.val;
                return (
                  <div key={th.val} onClick={() => setTheme(th.val)}
                    style={{ padding: '10px 8px', borderRadius: 8, cursor: 'pointer', border: sel ? `1px solid ${th.teal}` : '1px solid rgba(255,255,255,0.08)', background: th.bg, textAlign: 'center', transition: 'all 0.15s ease', boxShadow: sel ? `0 0 10px ${th.teal}44` : 'none' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: th.teal }} />
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: th.acc }} />
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: sel ? th.teal : '#7e95ab', letterSpacing: '.05em' }}>{t(th.labelKey)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Background Level */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.bg_darkness")}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: t("prefs.bg_darker"), val: 'darker', bg: '#05080f' },
                { label: t("prefs.bg_default"), val: 'default', bg: '#0d1117' },
                { label: t("prefs.bg_lighter"), val: 'lighter', bg: '#141b26' },
              ].map(opt => {
                const sel = bgLevel === opt.val;
                return (
                  <div key={opt.val} onClick={() => setBgLevel(opt.val as any)}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 6, cursor: 'pointer', border: sel ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.08)', background: sel ? 'color-mix(in srgb, var(--teal) 10%, transparent)' : opt.bg, transition: 'all 0.15s ease', textAlign: 'center' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 4, background: opt.bg, border: '1px solid rgba(255,255,255,0.15)', margin: '0 auto 6px' }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: sel ? 'var(--teal)' : '#7e95ab' }}>{opt.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Glow Effects */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.glow_effects")}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{t("prefs.glow_effects_desc")}</div>
            </div>
            <div onClick={() => setGlowEnabled(v => !v)}
              style={{ width: 40, height: 20, borderRadius: 10, background: glowEnabled ? 'var(--teal)' : 'var(--faint)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: glowEnabled ? 22 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
          </div>

          {/* Scanlines */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.scanlines")}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{t("prefs.scanlines_desc")}</div>
            </div>
            <div onClick={() => setScanlinesEnabled(v => !v)}
              style={{ width: 40, height: 20, borderRadius: 10, background: scanlinesEnabled ? 'var(--teal)' : 'var(--faint)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: scanlinesEnabled ? 22 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
          </div>
        </div>

        {/* ── General ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--acc)', letterSpacing: '.15em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>{t("prefs.general")}</div>

          {/* Games Directory */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.games_dir")}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.4 }}>{t("prefs.games_dir_desc")}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1, fontSize: 12, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--dim)' }} readOnly value={prefs.gamesDir} />
              <button className="btn btn-ghost" onClick={async () => {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const dir = await open({ directory: true, defaultPath: prefs.gamesDir });
                if (dir && typeof dir === 'string') prefs.setGamesDir(dir.replace(/\\/g, '/'));
              }} style={{ fontSize: 12, padding: '0 16px', border: '1px solid var(--bdr)', borderRadius: 6 }}>{t("prefs.change_btn")}</button>
            </div>
          </div>

          {/* Ren'Py SDK Directory */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.renpy_sdk_dir") || "Ren'Py SDK Directory"}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.4 }}>{t("prefs.renpy_sdk_dir_desc") || "Directory containing the Ren'Py executable (renpy.exe / renpy.sh)."}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1, fontSize: 12, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--dim)' }} readOnly value={prefs.renpySdkPath} />

              <button className="btn btn-ghost" onClick={async () => {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const dir = await open({ directory: true, defaultPath: prefs.renpySdkPath });
                if (dir && typeof dir === 'string') prefs.setRenpySdkPath(dir.replace(/\\/g, '/'));
              }} style={{ fontSize: 12, padding: '0 16px', border: '1px solid var(--bdr)', borderRadius: 6 }}>{t("prefs.change_btn")}</button>
            </div>
          </div>

          {/* UI Scaling */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.ui_scaling")}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['100%', '125%', '150%'].map(s => {
                const sel = uiScale === s;
                return (
                  <div key={s} onClick={() => setUiScale(s)}
                    style={{ flex: 1, padding: '10px 16px', borderRadius: 6, cursor: 'pointer', border: sel ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.08)', background: sel ? 'color-mix(in srgb, var(--teal) 10%, transparent)' : 'rgba(0,0,0,0.2)', color: sel ? 'var(--teal)' : 'var(--dim)', fontWeight: 600, textAlign: 'center', transition: 'all 0.15s ease' }}>{s}</div>
                );
              })}
            </div>
          </div>

          {/* Auto-Save */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: '#a8bccf', fontWeight: 600 }}>{t("prefs.auto_save")}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>{t("prefs.auto_save_desc")}</div>
            </div>
            <div onClick={() => setAutoSave(v => !v)}
              style={{ width: 40, height: 20, borderRadius: 10, background: autoSave ? 'var(--teal)' : 'var(--faint)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: autoSave ? 22 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
          </div>

          {/* Language */}
          <div 
            onClick={onOpenLanguage} 
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              padding: '18px 24px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
              transition: 'all 0.15s', marginTop: 8
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 16, color: '#a8bccf', fontWeight: 700 }}>{t("prefs.language")}</div>
              <div style={{ fontSize: 14, color: 'var(--dim)' }}>
                {t("prefs.language_current")} <span style={{ color: 'var(--teal)' }}>{LANGUAGES.find(l => l.code === language)?.englishName || language}</span>
              </div>
            </div>
            <div style={{ 
              fontSize: 15, fontWeight: 600, 
              padding: '10px 20px', background: 'var(--teal)', color: '#000', borderRadius: 6,
              boxShadow: '0 4px 12px color-mix(in srgb, var(--teal) 30%, transparent)'
            }}>
              {t("prefs.change_language")}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

/** The language list opened from the Preferences page. */
export function LanguagePanel({ language, setLanguage, onBack }: {
  language: string;
  setLanguage: (code: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto' }}>
      <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'var(--bg1)', padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 16 }}>
          <button className="btn btn-ghost" onClick={onBack} style={{ padding: '8px 12px', color: 'var(--dim)', background: 'rgba(0,0,0,0.2)' }}>← {t("prefs.back")}</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal)', letterSpacing: '.05em', textTransform: 'uppercase' }}>{t("prefs.select_language")}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LANGUAGES.map(l => {
            const sel = language === l.code;
            return (
              <button key={l.code} className={`btn ${sel ? 'btn-accent' : 'btn-ghost'}`}
                onClick={() => { setLanguage(l.code); onBack(); }}
                style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                  padding: '16px 20px', borderRadius: 8, textAlign: 'left',
                  border: sel ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,0.05)',
                  background: sel ? 'color-mix(in srgb, var(--teal) 10%, transparent)' : 'rgba(0,0,0,0.2)',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: sel ? 'var(--teal)' : 'var(--text)' }}>{l.englishName}</span>
                <span style={{ fontSize: 14, color: 'var(--dim)' }}>{l.nativeName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
