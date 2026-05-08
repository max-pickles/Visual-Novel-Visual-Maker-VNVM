/**
 * DiagnosticsPanel.tsx
 * Rich issues panel fed by validator.ts results. Shows errors/warnings grouped
 * by scene with severity filters, click-to-navigate, and ignore capability.
 * Wired to VNV Maker's validateProject() function.
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import type { VNProject } from './types';
import { validateProject, type Diagnostic } from './validator';
import { useDebounce } from './useDebounce';
import { listAssetFiles, readRpyFolder } from './tauriApi';

interface DiagnosticsPanelProps {
  project: VNProject;
  onNavigate?: (sceneId: string) => void;
}

type SortFilter = 'all' | 'error' | 'warning' | 'info';
type GroupMode = 'severity' | 'flat';

interface RichDiagnostic extends Diagnostic {
  _id: string;
}

function severityIcon(s: string): string {
  if (s === 'error')   return '🔴';
  if (s === 'warning') return '🟡';
  return 'ℹ️';
}
function severityColor(s: string): string {
  if (s === 'error')   return '#ef4444';
  if (s === 'warning') return '#eab308';
  return '#60a5fa';
}
function severityBg(s: string): string {
  if (s === 'error')   return 'rgba(239,68,68,0.06)';
  if (s === 'warning') return 'rgba(234,179,8,0.04)';
  return 'rgba(96,165,250,0.04)';
}

const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({ project, onNavigate }) => {
  const [severityFilter, setSeverityFilter] = useState<SortFilter>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('severity');
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [copyLabel, setCopyLabel] = useState('📋 Copy All');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const debouncedProject = useDebounce(project, 500);

  const [missingAssets, setMissingAssets] = useState<RichDiagnostic[]>([]);

  React.useEffect(() => {
    let active = true;
    if (!debouncedProject._rootPath) {
      if (active) setMissingAssets([]);
      return;
    }

    async function checkAssets() {
      try {
        const rootPath = debouncedProject._rootPath as string;
        const diskImagesList = await listAssetFiles(rootPath, "images");
        const diskAudioList = await listAssetFiles(rootPath, "audio");
        const diskFontsList = await listAssetFiles(rootPath, "fonts");
        
        // Build lookup indexes that support full paths, paths without 'game/', and raw filenames
        const buildIndex = (list: string[]) => {
          const index = new Set<string>();
          for (const p of list) {
            let cleanP = p.replace(/\\/g, "/");
            index.add(cleanP);
            if (cleanP.startsWith("game/")) {
              cleanP = cleanP.slice(5);
              index.add(cleanP);
            }
            const parts = cleanP.split('/');
            if (parts.length > 0) {
              const fileBase = parts[parts.length - 1];
              index.add(fileBase);
              // Add extension-less version for implicit Ren'Py lookups
              index.add(fileBase.replace(/\.[^/.]+$/, ""));
            }
          }
          return index;
        };

        const diskImages = buildIndex(diskImagesList);
        const diskAudio = buildIndex(diskAudioList);
        const diskFonts = buildIndex(diskFontsList);
        
        // Extract programmatic image and screen definitions from .rpy scripts
        const rpyFiles = await readRpyFolder(rootPath).catch(() => []);
        const definedImages = new Set<string>(["black", "white", "solid", "none", "trueblack", "bg black", "bg white"]);
        
        const imageDefRe = /^\s*image\s+([^=:]+)(?:=|:)/gm;
        const screenDefRe = /^\s*screen\s+([a-zA-Z0-9_]+)/gm;
        
        for (const file of rpyFiles) {
          let match;
          while ((match = imageDefRe.exec(file.content)) !== null) {
            definedImages.add(match[1].trim());
          }
          while ((match = screenDefRe.exec(file.content)) !== null) {
            definedImages.add(`screen ${match[1].trim()}`);
          }
        }
        
        const missing: RichDiagnostic[] = [];
        let i = 0;

        // Check project.cover
        if (debouncedProject.cover) {
          const coverPath = debouncedProject.cover.replace(/\\/g, "/");
          if (!diskImages.has(coverPath)) {
            missing.push({ _id: `m-${i++}`, severity: "error", message: `Project Cover file is missing on disk: ${debouncedProject.cover}`, location: "Project" });
          }
        }

        // Check character sprites and custom fonts
        for (const char of debouncedProject.characters) {
          for (const [expr, sprite] of Object.entries(char.sprites)) {
            const spritePath = sprite.replace(/\\/g, "/");
            if (spritePath && !diskImages.has(spritePath)) {
              missing.push({ _id: `m-${i++}`, severity: "error", message: `Missing sprite for character "${char.name}" (${expr}): ${sprite}`, location: "Project" });
            }
          }
          if (char.custom_font) {
            const fontPath = char.custom_font.replace(/\\/g, "/");
            if (!diskFonts.has(fontPath)) {
              missing.push({ _id: `m-${i++}`, severity: "error", message: `Missing custom font for character "${char.name}": ${char.custom_font}`, location: "Project" });
            }
          }
          if (char.textbox_bg) {
            const bgPath = char.textbox_bg.replace(/\\/g, "/");
            if (!diskImages.has(bgPath)) {
              missing.push({ _id: `m-${i++}`, severity: "warning", message: `Missing custom textbox for character "${char.name}": ${char.textbox_bg}`, location: "Project" });
            }
          }
        }

        // Check text templates for custom fonts
        for (const tpl of debouncedProject.text_tpls || []) {
          if (tpl.font) {
            const fontPath = tpl.font.replace(/\\/g, "/");
            // Standard Ren'Py default fonts are often built-in or assumed to exist,
            // but we'll flag any font not found. You could optionally skip "DejaVuSans.ttf" etc.
            if (!diskFonts.has(fontPath) && !['DejaVuSans.ttf', 'NotoSans-Regular.ttf'].includes(tpl.font)) {
              missing.push({ _id: `m-${i++}`, severity: "warning", message: `Missing font file in Text Style "${tpl.name}": ${tpl.font}`, location: "Project" });
            }
          }
        }

        // Check main menu
        if (debouncedProject.main_menu?.background) {
          const bgPath = debouncedProject.main_menu.background.replace(/\\/g, "/");
          if (!diskImages.has(bgPath)) {
            missing.push({ _id: `m-${i++}`, severity: "warning", message: `Missing main menu background image: ${debouncedProject.main_menu.background}`, location: "Project" });
          }
        }
        if (debouncedProject.main_menu?.titleImage) {
          const titlePath = debouncedProject.main_menu.titleImage.replace(/\\/g, "/");
          if (!diskImages.has(titlePath)) {
            missing.push({ _id: `m-${i++}`, severity: "warning", message: `Missing main menu title logo: ${debouncedProject.main_menu.titleImage}`, location: "Project" });
          }
        }

        // Check scenes and events
        for (const sc of debouncedProject.scenes) {
          if (sc.bg) {
            const bgPath = sc.bg.replace(/\\/g, "/").split(/\b(at|behind|with|as|zorder)\b/)[0].trim();
            if (!diskImages.has(bgPath) && !definedImages.has(bgPath)) {
              missing.push({ _id: `m-${i++}`, severity: "error", message: `Missing background image: ${sc.bg}`, location: sc.label });
            }
          }
          if (sc.music) {
            const musicPath = sc.music.replace(/\\/g, "/");
            if (!diskAudio.has(musicPath)) {
              missing.push({ _id: `m-${i++}`, severity: "warning", message: `Missing background music: ${sc.music}`, location: sc.label });
            }
          }

          for (let evIdx = 0; evIdx < sc.events.length; evIdx++) {
            const ev = sc.events[evIdx];
            const eventName = `Event ${evIdx + 1}`;
            
            if (ev.bg) {
              const bgPath = ev.bg.replace(/\\/g, "/").split(/\b(at|behind|with|as|zorder)\b/)[0].trim();
              if (!diskImages.has(bgPath) && !definedImages.has(bgPath)) {
                missing.push({ _id: `m-${i++}`, severity: "error", message: `${eventName}: Missing background image: ${ev.bg}`, location: sc.label });
              }
            }
            if (ev.image) {
              const imagePath = ev.image.replace(/\\/g, "/").split(/\b(at|behind|with|as|zorder)\b/)[0].trim();
              if (!diskImages.has(imagePath) && !definedImages.has(imagePath)) {
                missing.push({ _id: `m-${i++}`, severity: "error", message: `${eventName}: Missing image: ${ev.image}`, location: sc.label });
              }
            }
            if (ev.music) {
              const musicPath = ev.music.replace(/\\/g, "/");
              if (!diskAudio.has(musicPath)) {
                missing.push({ _id: `m-${i++}`, severity: "warning", message: `${eventName}: Missing music track: ${ev.music}`, location: sc.label });
              }
            }
            if (ev.sfx) {
              const sfxPath = ev.sfx.replace(/\\/g, "/");
              if (!diskAudio.has(sfxPath)) {
                missing.push({ _id: `m-${i++}`, severity: "warning", message: `${eventName}: Missing sound effect: ${ev.sfx}`, location: sc.label });
              }
            }
          }
        }
        
        if (active) setMissingAssets(missing);
      } catch (e) {
        console.warn("Asset check failed", e);
      }
    }
    
    checkAssets();
    return () => { active = false; };
  }, [debouncedProject]);

  const syncDiagnostics = useMemo<RichDiagnostic[]>(() => {
    const { errors, warnings, infos } = validateProject(debouncedProject);
    return [
      ...errors.map((d, i)   => ({ ...d, _id: `e-${i}` })),
      ...warnings.map((d, i) => ({ ...d, _id: `w-${i}` })),
      ...infos.map((d, i)    => ({ ...d, _id: `i-${i}` })),
    ];
  }, [debouncedProject]);

  const allDiagnostics = useMemo(() => {
    return [...syncDiagnostics, ...missingAssets];
  }, [syncDiagnostics, missingAssets]);

  const visible = useMemo(() => {
    return allDiagnostics.filter(d => {
      if (ignored.has(d._id)) return false;
      if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
      if (search && !d.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allDiagnostics, ignored, severityFilter, search]);

  const errorCount   = allDiagnostics.filter(d => d.severity === 'error'   && !ignored.has(d._id)).length;
  const warningCount = allDiagnostics.filter(d => d.severity === 'warning' && !ignored.has(d._id)).length;
  const infoCount    = allDiagnostics.filter(d => d.severity === 'info'    && !ignored.has(d._id)).length;

  const copyAll = useCallback(() => {
    if (allDiagnostics.length === 0) return;
    const lines: string[] = [
      `VNVMaker Diagnostics Report`,
      `Project: ${project.title}`,
      `Date: ${new Date().toLocaleString()}`,
      `─`.repeat(60),
    ];
    const severityLabel: Record<string, string> = { error: 'ERROR', warning: 'WARNING', info: 'INFO' };
    ['error', 'warning', 'info'].forEach(sev => {
      const items = allDiagnostics.filter(d => d.severity === sev && !ignored.has(d._id));
      if (!items.length) return;
      lines.push(``);
      lines.push(`${severityLabel[sev]}S (${items.length})`);
      lines.push(`─`.repeat(40));
      items.forEach(d => {
        lines.push(`[${severityLabel[sev]}] ${d.message}`);
        if (d.location) lines.push(`  → Scene: ${d.location}`);
      });
    });
    lines.push(``);
    lines.push(`─`.repeat(60));
    lines.push(`Total: ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info(s)`);
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopyLabel('✓ Copied!');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyLabel('📋 Copy All'), 1500);
    }).catch(() => setCopyLabel('✕ Failed'));
  }, [allDiagnostics, ignored, project.title, errorCount, warningCount, infoCount]);

  const grouped = useMemo(() => {
    if (groupMode === 'flat') return [{ key: 'all', label: 'All Issues', items: visible }];
    const errors   = visible.filter(d => d.severity === 'error');
    const warnings = visible.filter(d => d.severity === 'warning');
    const infos    = visible.filter(d => d.severity === 'info');
    const result = [];
    if (errors.length)   result.push({ key: 'error',   label: '🔴 Errors',   items: errors });
    if (warnings.length) result.push({ key: 'warning', label: '🟡 Warnings', items: warnings });
    if (infos.length)    result.push({ key: 'info',    label: 'ℹ️ Info',      items: infos });
    return result;
  }, [visible, groupMode]);

  // Derived Health Data
  const healthStats = useMemo(() => {
    let score = 100;
    score -= errorCount * 5;
    score -= warningCount * 2;
    score = Math.max(0, Math.min(100, score));

    let grade = 'F';
    let gradeColor = '#ef4444';
    if (score === 100) { grade = 'S'; gradeColor = '#8b5cf6'; } // S-Rank!
    else if (score >= 95) { grade = 'A'; gradeColor = '#22c55e'; }
    else if (score >= 85) { grade = 'B'; gradeColor = '#eab308'; }
    else if (score >= 70) { grade = 'C'; gradeColor = '#f97316'; }

    // Categories
    const cats = {
      connectivity: { label: 'Scene Reachability & Flow', count: 0 },
      navigation: { label: 'Jumps & Choice Targets', count: 0 },
      scenes: { label: 'Scene Labels & Config', count: 0 },
      script: { label: 'Variables & Logic', count: 0 },
      content: { label: 'Dialogue & Characters', count: 0 },
    };

    const hotspots = new Map<string, { errors: number, warnings: number }>();

    allDiagnostics.forEach(d => {
      if (ignored.has(d._id)) return;
      
      const msg = d.message.toLowerCase();
      if (msg.includes('unreachable') || msg.includes('dead end') || msg.includes('start scene')) cats.connectivity.count++;
      else if (msg.includes('target') || msg.includes('jump') || msg.includes('if-') || msg.includes('choice option')) cats.navigation.count++;
      else if (msg.includes('label')) cats.scenes.count++;
      else if (msg.includes('variable') || msg.includes('setvar') || msg.includes('wait') || msg.includes('condition')) cats.script.count++;
      else cats.content.count++; // Fallback is usually dialogue/characters/media

      if (d.location && d.location !== 'Project') {
        const sc = hotspots.get(d.location) || { errors: 0, warnings: 0 };
        if (d.severity === 'error') sc.errors++;
        if (d.severity === 'warning') sc.warnings++;
        hotspots.set(d.location, sc);
      }
    });

    const topHotspots = [...hotspots.entries()]
      .map(([name, counts]) => ({ name, total: counts.errors + counts.warnings, ...counts }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    return { score, grade, gradeColor, categories: Object.values(cats), hotspots: topHotspots };
  }, [allDiagnostics, ignored, errorCount, warningCount]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg0)' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em' }}>DIAGNOSTICS</span>
          {allDiagnostics.length === 0 ? (
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', fontWeight: 600 }}>✓ No issues</span>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              {errorCount   > 0 && <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, background: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', fontWeight: 600 }}>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
              {warningCount > 0 && <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', fontWeight: 600 }}>{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>}
              {infoCount    > 0 && <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)', fontWeight: 600 }}>{infoCount} info</span>}
            </div>
          )}

          <select className="input" value={groupMode} onChange={e => setGroupMode(e.target.value as GroupMode)}
            style={{ fontSize: 11, padding: '4px 10px', marginLeft: 'auto', borderRadius: 6 }}>
            <option value="severity">Group: Severity</option>
            <option value="flat">No Grouping</option>
          </select>

          {/* Copy All — Ren'Py style */}
          <button
            onClick={copyAll}
            disabled={allDiagnostics.length === 0}
            title="Copy all diagnostics as plain text"
            style={{
              fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: allDiagnostics.length === 0 ? 'default' : 'pointer',
              border: `1px solid ${copyLabel.startsWith('✓') ? '#22c55e' : 'var(--bdr)'}`,
              background: copyLabel.startsWith('✓') ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
              color: copyLabel.startsWith('✓') ? '#22c55e' : 'var(--text)',
              opacity: allDiagnostics.length === 0 ? 0.4 : 1,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
              fontWeight: 600,
            }}
          >
            {copyLabel}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input className="input" placeholder="🔍 Filter diagnostics…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ flex: 1, padding: '8px 12px', fontSize: 12 }} />
          {(['all', 'error', 'warning', 'info'] as SortFilter[]).map(f => (
            <button key={f} onClick={() => setSeverityFilter(f)}
              style={{
                fontSize: 11, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                border: `1px solid ${severityFilter === f ? 'var(--acc2)' : 'var(--bdr)'}`,
                background: severityFilter === f ? 'rgba(107,138,251,0.12)' : 'rgba(255,255,255,0.02)',
                color: severityFilter === f ? 'var(--acc2)' : 'var(--dim)',
                fontWeight: severityFilter === f ? 600 : 400,
                transition: 'all 0.15s'
              }}>
              {f === 'all' ? 'All' : severityIcon(f) + ' ' + f}
            </button>
          ))}
        </div>
      </div>

      {/* Issue list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {visible.length === 0 && allDiagnostics.length > 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--faint)', fontSize: 13 }}>
            No issues match the current filter.
          </div>
        )}

        {grouped.map(group => (
          <div key={group.key} style={{ marginBottom: 16 }}>
            {groupMode !== 'flat' && group.items.length > 0 && (
              <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 8 }}>
                {group.label} ({group.items.length})
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.items.map(d => (
                <div key={d._id}
                  style={{
                    padding: '12px 16px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderLeft: `3px solid ${severityColor(d.severity)}`,
                    background: severityBg(d.severity),
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    animation: 'vnv-fade-slide-in 0.15s ease both',
                    transition: 'box-shadow 0.15s',
                  }}>
                  <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>{severityIcon(d.severity)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, fontWeight: 500 }}>{d.message}</div>
                    {d.location && (
                      <button
                        onClick={() => {
                          const scene = project.scenes.find(s => s.label === d.location || s.id === d.location);
                          if (scene && onNavigate) onNavigate(scene.id);
                        }}
                        style={{ marginTop: 6, fontSize: 11, color: 'var(--acc2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 600 }}>
                        → Scene: {d.location}
                      </button>
                    )}
                  </div>
                  <button onClick={() => setIgnored(prev => new Set([...prev, d._id]))}
                    title="Ignore" style={{ fontSize: 12, color: 'var(--dim)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--err)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--dim)'}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ── PROJECT HEALTH DASHBOARD ──────────────────────────────────────── */}
        <div style={{ marginTop: grouped.length > 0 ? 32 : 0, paddingTop: grouped.length > 0 ? 32 : 0, borderTop: grouped.length > 0 ? '1px dashed var(--bdr)' : 'none', paddingBottom: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 20 }}>
            Project Health Overview
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            
            {/* Health Score */}
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '24px', display: 'flex', alignItems: 'center', gap: 24, animation: 'vnv-fade-slide-in 0.2s ease both' }}>
              <div style={{ 
                width: 80, height: 80, borderRadius: '50%', background: `color-mix(in srgb, ${healthStats.gradeColor} 15%, transparent)`, 
                border: `3px solid ${healthStats.gradeColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, fontWeight: 900, color: healthStats.gradeColor, flexShrink: 0,
                boxShadow: `0 0 20px color-mix(in srgb, ${healthStats.gradeColor} 30%, transparent)`
              }}>
                {healthStats.grade}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>System Health: {healthStats.score}%</div>
                <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.4 }}>
                  {healthStats.score === 100 ? 'Flawless logic and connectivity. Ready for export!' 
                    : 'Some issues detected. Clean up warnings and errors to improve stability.'}
                </div>
              </div>
            </div>

            {/* Hotspots Leaderboard */}
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>🔥 Diagnostics Hotspots</div>
              {healthStats.hotspots.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {healthStats.hotspots.map(h => (
                    <div key={h.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6, border: '1px solid var(--bdr)' }}>
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                      <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
                        {h.errors > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>{h.errors} E</span>}
                        {h.warnings > 0 && <span style={{ color: '#eab308', fontWeight: 600 }}>{h.warnings} W</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--faint)', fontStyle: 'italic', padding: '10px 0' }}>No problematic scenes found.</div>
              )}
            </div>

            {/* Validation Checklist */}
            <div style={{ background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '20px 24px', gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Validation Scanner</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {healthStats.categories.map(cat => (
                  <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 6, border: `1px solid ${cat.count === 0 ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: cat.count === 0 ? '#22c55e' : '#f59e0b', color: '#fff', flexShrink: 0 }}>
                      {cat.count === 0 ? '✓' : '!'}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{cat.label}</div>
                    {cat.count > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>{cat.count}</div>}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>

      {ignored.size > 0 && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bdr)', background: 'var(--bg1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--faint)', fontWeight: 500 }}>{ignored.size} issue{ignored.size !== 1 ? 's' : ''} ignored</span>
          <button onClick={() => setIgnored(new Set())}
            style={{ fontSize: 11, color: 'var(--acc2)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
            Restore Ignored
          </button>
        </div>
      )}
    </div>
  );
};

export default DiagnosticsPanel;
