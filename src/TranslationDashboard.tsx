/**
 * TranslationDashboard.tsx
 * Multi-language coverage tracker for VNV Maker projects.
 * Auto-detects existing Ren'Py tl/ translations and imports them.
 * Translations are persisted to VNProject.translations for cross-session use.
 * Export generates a proper Ren'Py tl/<lang>/script.rpy file.
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { VNProject } from './types';
import { useVirtualList } from './useVirtualList';
import { invoke } from '@tauri-apps/api/core';
import { ToastManager } from './toastContext';
import { writeTextFile } from './tauriApi';
import { useTranslation } from './translationContext';

interface TranslationDashboardProps {
  project: VNProject;
  rootPath: string;
  onProjectChange?: (p: VNProject) => void;
}

interface ExtractedString {
  id: string;
  sceneId: string;
  sceneName: string;
  type: 'dialogue' | 'narration' | 'choice' | 'prompt';
  original: string;
  charName?: string;
}

interface LangEntry {
  lang: string;
  translations: Record<string, string>;
  imported?: boolean;
}

const LANG_LABELS: Record<string, string> = {
  ukrainian: 'Ukrainian', russian: 'Russian', french: 'French',
  spanish: 'Spanish', italian: 'Italian', japanese: 'Japanese',
  korean: 'Korean', danish: 'Danish', czech: 'Czech',
  malay: 'Malay', schinese: 'Simplified Chinese', tchinese: 'Traditional Chinese',
};

function extractStrings(project: VNProject): ExtractedString[] {
  const results: ExtractedString[] = [];
  project.scenes.forEach(scene => {
    const sceneName = scene.label || scene.id;
    scene.events.forEach((ev, evIdx) => {
      if ((ev.type === 'dialogue' || ev.type === 'narration') && ev.text) {
        const char = project.characters.find(c => c.id === ev.char_id);
        results.push({
          id: `${scene.id}_ev${evIdx}_text`,
          sceneId: scene.id, sceneName,
          type: ev.type,
          original: ev.text,
          charName: char?.name,
        });
      }
      if (ev.type === 'choice') {
        if (ev.prompt) results.push({ id: `${scene.id}_ev${evIdx}_prompt`, sceneId: scene.id, sceneName, type: 'prompt', original: ev.prompt });
        ev.opts?.forEach((opt, optIdx) => {
          results.push({ id: `${scene.id}_ev${evIdx}_opt${optIdx}`, sceneId: scene.id, sceneName, type: 'choice', original: opt.text });
        });
      }
    });
  });
  return results;
}

const ITEM_H = 120;

// Reading speed: words-per-minute for Latin scripts, chars-per-minute for CJK
const WPM_LATIN = 180;
const CPM_CJK   = 400;
const CJK_LANGS = ['Simplified Chinese', 'Traditional Chinese', 'Japanese', 'Korean'];

function countTokens(text: string): number {
  // CJK characters count individually; Latin splits on whitespace
  const cjk = text.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g);
  return cjk ? cjk.length : text.split(/\s+/).filter(Boolean).length;
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

const TranslationDashboard: React.FC<TranslationDashboardProps> = ({ project, rootPath, onProjectChange }) => {
  const { t, language } = useTranslation();
  const [langs, setLangs] = useState<LangEntry[]>([]);
  const [activeLang, setActiveLang] = useState('');
  const [newLang, setNewLang] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing' | 'done'>('all');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [scanning, setScanning] = useState(false);
  // Raw map from the tl/ scan: langKey → { originalText → translatedText }
  const [rawTlMap, setRawTlMap] = useState<Record<string, Record<string, string>>>({});
  // Track if we've seeded from project (avoid overwriting with scan results)
  const [seededFromProject, setSeededFromProject] = useState(false);

  const strings = useMemo(() => extractStrings(project), [project]);
  const currentLang = langs.find(l => l.lang === activeLang);

  const PREF_MAP: Record<string, string> = { 'en': 'English', 'es': 'Spanish', 'ja': 'Japanese' };
  const prefLang = PREF_MAP[language] || 'English';
  const originalLang = project.originalLanguage || 'English';

  // Step 0 — seed from project.translations on first mount
  useEffect(() => {
    const saved = project.translations;
    const seeded: LangEntry[] = saved ? Object.entries(saved).map(([lang, translations]) => ({
      lang, translations, imported: false,
    })) : [];

    if (prefLang !== originalLang && !seeded.some(l => l.lang === prefLang)) {
      seeded.push({ lang: prefLang, translations: {} });
    }

    setLangs(seeded);
    setActiveLang(seeded.length > 0 ? seeded[0].lang : '__main__');
    setSeededFromProject(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once only

  // Step 1 — fetch the raw tl/ map from disk whenever rootPath changes
  useEffect(() => {
    if (!rootPath) return;
    setScanning(true);
    invoke<Record<string, Record<string, string>>>('scan_tl_translations', { rootPath })
      .then(raw => {
        setRawTlMap(raw);
      })
      .catch(() => {
        setRawTlMap({});
        // Fallback: empty placeholder languages so the UI isn't blank
        if (!seededFromProject) {
          const fallbackLangs: LangEntry[] = [];
          if (prefLang !== originalLang) fallbackLangs.push({ lang: prefLang, translations: {} });
          else fallbackLangs.push({ lang: 'Spanish', translations: {} });
          setLangs(fallbackLangs);
          setActiveLang(fallbackLangs[0].lang);
        }
      })
      .finally(() => setScanning(false));
  }, [rootPath, seededFromProject, prefLang, originalLang]);

  // Step 2 — re-map raw tl/ data into id-keyed translations
  useEffect(() => {
    if (Object.keys(rawTlMap).length === 0 || strings.length === 0) return;
    const discovered: LangEntry[] = Object.entries(rawTlMap).map(([langKey, origMap]) => {
      const translations: Record<string, string> = {};
      strings.forEach(s => {
        const tr = origMap[s.original];
        if (tr) translations[s.id] = tr;
      });
      return {
        lang: LANG_LABELS[langKey] ?? (langKey.charAt(0).toUpperCase() + langKey.slice(1)),
        translations,
        imported: true,
      };
    });
    // Sort: highest coverage first
    discovered.sort((a, b) => {
      const aCov = strings.length ? Object.keys(a.translations).length / strings.length : 0;
      const bCov = strings.length ? Object.keys(b.translations).length / strings.length : 0;
      return bCov - aCov;
    });
    setLangs(prev => {
      // Merge: keep manually-added languages only if they weren't discovered
      const manual = prev.filter(l => !l.imported && !discovered.some(d => d.lang === l.lang));
      return [...discovered, ...manual];
    });
    setActiveLang(prev => prev || (discovered.length > 0 ? discovered[0].lang : '__main__'));
  }, [rawTlMap, strings]);

  // Step 3 — persist langs back to project whenever they change
  useEffect(() => {
    if (!onProjectChange || langs.length === 0) return;
    const saved: Record<string, Record<string, string>> = {};
    for (const l of langs) {
      if (Object.keys(l.translations).length > 0) {
        saved[l.lang] = l.translations;
      }
    }
    if (JSON.stringify(saved) !== JSON.stringify(project.translations ?? {})) {
      onProjectChange({ ...project, translations: saved });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langs]); // only watch langs changes

  const filteredStrings = useMemo(() => strings.filter(s => {
    const translated = !!currentLang?.translations[s.id];
    if (filter === 'missing' && translated) return false;
    if (filter === 'done' && !translated) return false;
    if (search && !s.original.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [strings, currentLang, filter, search]);

  const coverage = useMemo(() => {
    if (!currentLang || strings.length === 0) return 0;
    return Math.round((Object.keys(currentLang.translations).length / strings.length) * 100);
  }, [strings, currentLang]);

  // Reading time based on the ACTIVE language's text
  const readingTime = useMemo(() => {
    const isCJK = CJK_LANGS.includes(activeLang);
    const speed = isCJK ? CPM_CJK : WPM_LATIN;
    if (activeLang === '__main__' || !currentLang) {
      // Use source text
      const total = strings.reduce((sum, s) => sum + countTokens(s.original), 0);
      return { total, mins: Math.max(1, Math.round(total / WPM_LATIN)), label: 'words' };
    }
    // Use translated text (only the strings that exist)
    const translatedTexts = Object.values(currentLang.translations);
    const total = translatedTexts.reduce((sum, t) => sum + countTokens(t), 0);
    return { total, mins: Math.max(1, Math.round(total / speed)), label: isCJK ? 'chars' : 'words' };
  }, [activeLang, strings, currentLang]);

  const addLang = () => {
    const trimmed = newLang.trim();
    if (!trimmed || langs.some(l => l.lang === trimmed) || trimmed === originalLang) return;
    setLangs(prev => [...prev, { lang: trimmed, translations: {} }]);
    setActiveLang(trimmed);
    setNewLang('');
  };

  const saveTranslation = (id: string, text: string) => {
    setLangs(prev => prev.map(l =>
      l.lang === activeLang ? { ...l, translations: { ...l.translations, [id]: text } } : l
    ));
    setEditId(null);
  };

  // ── Export to Ren'Py .rpy ─────────────────────────────────────────────────
  // Generates a valid tl/<lang>/script.rpy file and writes it directly to the game folder
  const exportRpy = useCallback(async () => {
    if (!currentLang || !rootPath) {
      ToastManager.error(t('toasts.sync_no_root'));
      return;
    }
    const langSlug = activeLang.toLowerCase().replace(/\s+/g, '_');
    const lines: string[] = [
      `# Translation generated by VNV Maker`,
      `# Language: ${activeLang}`,
      `# Project:  ${project.title}`,
      `# Coverage: ${coverage}%`,
      ``,
      `translate ${langSlug} strings:`,
      ``,
    ];

    for (const s of strings) {
      const translated = currentLang.translations[s.id];
      if (!translated) continue; // only export completed strings
      const charPrefix = s.charName ? `${s.charName} ` : '';
      lines.push(
        `    # ${s.sceneName} — ${s.type}`,
        `    old "${s.original.replace(/"/g, '\\"')}"`,
        `    new "${translated.replace(/"/g, '\\"')}"`,
        ``,
      );
    }

    const content = lines.join('\n');
    const destPath = `${rootPath}/game/tl/${langSlug}/vnv_translations.rpy`.replace(/\\/g, '/');
    
    try {
      await writeTextFile(destPath, content);
      ToastManager.success(t('toasts.sync_success').replace('{lang}', langSlug));
    } catch (err: any) {
      ToastManager.error(t('toasts.sync_failed').replace('{err}', String(err)));
    }
  }, [activeLang, currentLang, strings, coverage, project.title, rootPath, t]);

  const coverageColor = coverage >= 80 ? 'var(--ok)' : coverage >= 40 ? 'var(--amber)' : 'var(--err)';

  if (scanning) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 16, color: 'var(--dim)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'color-mix(in srgb, var(--acc2) 10%, var(--bg2))',
          border: '1px solid color-mix(in srgb, var(--acc2) 20%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
          animation: 'vnv-pulse 1.5s ease-in-out infinite',
        }}>🌐</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Scanning translations…</div>
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>Reading tl/ folder from disk</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg0)' }}>

      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Translation Dashboard</span>
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>{strings.length} strings · {project.scenes.length} scenes</span>
          {/* Reading time based on active language */}
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'color-mix(in srgb, var(--acc2) 10%, transparent)', color: 'var(--acc2)' }}>
            🕐 {formatMinutes(readingTime.mins)} to read · {readingTime.total.toLocaleString()} {readingTime.label}
          </span>
          {langs.some(l => l.imported) && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'var(--bg1)', color: 'var(--ok)' }}>
              ✓ {langs.filter(l => l.imported).length} languages imported from tl/
            </span>
          )}
          {/* Export button */}
          {activeLang !== '__main__' && currentLang && coverage > 0 && (
            <button onClick={exportRpy}
              style={{
                marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid var(--teal)', background: 'color-mix(in srgb, var(--teal) 10%, transparent)', color: 'var(--teal)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
              title={`Sync ${activeLang} translations directly to game folder`}
            >
              🔄 Sync to Ren'Py ({coverage}%)
            </button>
          )}
        </div>

        {/* Language tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Main Language — fixed source language, clickable */}
          <button onClick={() => setActiveLang('__main__')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${activeLang === '__main__' ? 'var(--amber)' : 'var(--amber)'}`,
              background: activeLang === '__main__' ? 'var(--sel)' : 'var(--bg1)',
              color: 'var(--amber)',
            }}>
            🌐 {originalLang}
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--bg1)', color: 'var(--amber)', fontWeight: 700, letterSpacing: '0.04em' }}>
              MAIN
            </span>
          </button>
          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'var(--bdr)', flexShrink: 0 }} />
          {(() => {
            const prefL = langs.find(l => l.lang === prefLang);
            const activeL = (activeLang !== prefLang && activeLang !== '__main__') ? langs.find(l => l.lang === activeLang) : null;
            const otherL = langs.filter(l => l.lang !== prefLang && l.lang !== activeLang && l.lang !== originalLang);
            
            const sortedLangs = [];
            if (prefL && prefLang !== originalLang) sortedLangs.push(prefL);
            if (activeL && activeL.lang !== originalLang) sortedLangs.push(activeL);
            sortedLangs.push(...otherL);

            return sortedLangs.map(l => {
              const done = Object.keys(l.translations).length;
              const pct = strings.length > 0 ? Math.round((done / strings.length) * 100) : 0;
              const pctColor = pct >= 80 ? 'var(--ok)' : pct >= 40 ? 'var(--amber)' : 'var(--err)';
              const r = 7;
              const circ = 2 * Math.PI * r;
              const dash = (pct / 100) * circ;
              return (
                <button key={l.lang} onClick={() => setActiveLang(l.lang)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                    border: `1px solid ${activeLang === l.lang ? 'var(--teal)' : 'var(--bdr)'}`,
                    background: activeLang === l.lang ? 'color-mix(in srgb, var(--teal) 12%, transparent)' : 'transparent',
                    color: activeLang === l.lang ? 'var(--teal)' : 'var(--dim)',
                  }}
                >
                  {l.lang}
                  {l.lang === prefLang && (
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--faint)', fontWeight: 700, letterSpacing: '0.04em' }}>
                      PREF
                    </span>
                  )}
                  {/* Tiny SVG ring */}
                  <svg width={18} height={18} style={{ flexShrink: 0 }}>
                    <circle cx={9} cy={9} r={r} fill="none" stroke="var(--bg3)" strokeWidth={2.5} />
                    <circle
                      cx={9} cy={9} r={r} fill="none"
                      stroke={pctColor} strokeWidth={2.5}
                      strokeDasharray={`${dash} ${circ}`}
                      strokeLinecap="round"
                      transform="rotate(-90 9 9)"
                      style={{ transition: 'stroke-dasharray 0.4s ease' }}
                    />
                  </svg>
                </button>
              );
            });
          })()}

          {/* Add language */}
          <div style={{ display: 'flex', gap: 4 }}>
            <input className="input" placeholder="Add language…" value={newLang}
              onChange={e => setNewLang(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addLang(); }}
              style={{ width: 130, fontSize: 11 }} />
            <button onClick={addLang} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--bdr)', color: 'var(--dim)' }}>+</button>
          </div>
        </div>
      </div>

      {/* Coverage bar — hidden in Main language mode */}
      {activeLang === '__main__' ? (
        <div style={{ padding: '8px 14px', background: 'var(--bg1)', borderBottom: '1px solid rgba(251,191,36,0.2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--amber)' }}>🌐 Main Language — {originalLang}</span>
          <span style={{ fontSize: 10, color: 'var(--faint)', marginLeft: 'auto' }}>{strings.length} strings</span>
        </div>
      ) : (
        <div style={{ padding: '8px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--dim)', flexShrink: 0 }}>{activeLang} Coverage</span>
          <div style={{ flex: 1, height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${coverage}%`, height: '100%', background: coverageColor, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: coverageColor, flexShrink: 0 }}>{coverage}%</span>
          <span style={{ fontSize: 10, color: 'var(--faint)', flexShrink: 0 }}>
            {currentLang ? Object.keys(currentLang.translations).length : 0}/{strings.length} strings
          </span>
        </div>
      )}

      {/* Filter toolbar — only shown for translation targets, not Main language */}
      {activeLang !== '__main__' && (
        <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg1)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <input className="input" placeholder="🔍 Search strings…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
          {(['all', 'missing', 'done'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
                border: `1px solid ${filter === f ? 'var(--acc2)' : 'var(--bdr)'}`,
                background: filter === f ? 'color-mix(in srgb, var(--acc2) 12%, transparent)' : 'transparent',
                color: filter === f ? 'var(--acc2)' : 'var(--dim)',
              }}>
              {f === 'all' ? `All (${strings.length})` : f === 'missing'
                ? `Missing (${strings.filter(s => !currentLang?.translations[s.id]).length})`
                : `Done (${currentLang ? Object.keys(currentLang.translations).length : 0})`}
            </button>
          ))}
        </div>
      )}
      {activeLang === '__main__' && (
        <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg1)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <input className="input" placeholder="🔍 Search strings…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--faint)' }}>Read-only main language</span>
        </div>
      )}

      {/* Standard string list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {filteredStrings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--faint)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🌐</div>
            <div style={{ fontSize: 13 }}>
              {strings.length === 0
                ? 'No translatable strings found. Add dialogue events to your project.'
                : 'No strings match the current filter.'}
            </div>
          </div>
        ) : (
          filteredStrings.map((s) => {
            const isMainMode = activeLang === '__main__';
            const translated = currentLang?.translations[s.id] ?? '';
            const isDone = !!translated;
            const isEditing = editId === s.id;

            return (
              <div key={s.id}
                style={{
                  height: ITEM_H, flexShrink: 0,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderLeft: isMainMode ? '3px solid var(--amber)' : `3px solid ${isDone ? 'var(--ok)' : 'var(--err)'}`,
                  padding: '6px 10px 6px 12px',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
                }}>

                {/* Badges row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg3)', color: 'var(--faint)', flexShrink: 0 }}>
                    {s.sceneName.length > 12 ? s.sceneName.slice(0, 12) + '…' : s.sceneName}
                  </span>
                  {s.charName && (
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'color-mix(in srgb, var(--acc2) 12%, transparent)', color: 'var(--acc2)', flexShrink: 0 }}>
                      {s.charName}
                    </span>
                  )}
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.05)', color: 'var(--faint)', flexShrink: 0 }}>
                    {s.type}
                  </span>
                  {!isMainMode && (
                    <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => saveTranslation(s.id, editText)}
                            style={{ fontSize: 10, padding: '1px 8px', background: 'var(--teal)', border: 'none', borderRadius: 4, color: '#000', cursor: 'pointer', fontWeight: 600 }}>✓</button>
                          <button onClick={() => setEditId(null)}
                            style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 4, color: 'var(--dim)', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditId(s.id); setEditText(translated); }}
                          style={{ fontSize: 10, padding: '1px 8px', background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 4, color: 'var(--dim)', cursor: 'pointer' }}>
                          {isDone ? 'Edit' : 'Translate'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Two-box text row */}
                <div style={{ display: 'flex', gap: 6, minWidth: 0, flex: 1, alignItems: 'stretch' }}>
                  {/* English source box */}
                  <div style={{
                    flex: 1, minWidth: 0,
                    background: 'var(--bg1)',
                    border: '1px solid rgba(251,191,36,0.2)',
                    borderRadius: 4, padding: '3px 8px',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 8, color: 'var(--amber)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 1 }}>🌐 {originalLang.slice(0, 2).toUpperCase()}</span>
                    <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text)', whiteSpace: 'pre-wrap', flex: 1, overflowY: 'auto' }} className="vnv-scroll">
                      {s.original}
                    </div>
                  </div>

                  {/* Translation box — hidden in Main-only mode */}
                  {!isMainMode && (
                    <div style={{
                      flex: 1, minWidth: 0,
                      background: isDone ? 'rgba(34,197,94,0.05)' : 'var(--bg2)',
                      border: `1px solid ${isDone ? 'rgba(34,197,94,0.25)' : 'var(--bdr)'}`,
                      borderRadius: 4, padding: '3px 8px',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 8, color: isDone ? 'var(--ok)' : 'var(--faint)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 1 }}>
                        {activeLang.slice(0, 2).toUpperCase()}
                      </span>
                      {isEditing ? (
                        <textarea className="input vnv-scroll" autoFocus value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && e.ctrlKey) saveTranslation(s.id, editText);
                            if (e.key === 'Escape') setEditId(null);
                          }}
                          style={{ fontSize: 14, lineHeight: 1.5, padding: '4px', flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: '1px solid var(--teal)', borderRadius: 2 }}
                          placeholder={`${activeLang} translation… (Ctrl+Enter to save)`} />
                      ) : (
                        <div style={{ fontSize: 14, lineHeight: 1.5, color: isDone ? 'var(--ok)' : 'var(--faint)', fontStyle: isDone ? 'normal' : 'italic', whiteSpace: 'pre-wrap', flex: 1, overflowY: 'auto' }} className="vnv-scroll">
                          {translated || 'Not translated'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TranslationDashboard;
