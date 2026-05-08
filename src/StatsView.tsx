/**
 * StatsView.tsx
 * Analytics dashboard for the VNProject: word count, playtime estimate,
 * event type breakdown, asset coverage, scene complexity, and branching paths.
 * Adapted from legacy IDE; uses recharts for charts.
 */
import React, { useMemo } from 'react';
import type { VNProject } from './types';
import { useTranslation } from './translationContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';



interface StatsViewProps {
  project: VNProject;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const WORDS_PER_MINUTE = 300; // VN click-through pace (VNDB community standard)
const EVENT_COLORS: Record<string, string> = {
  dialogue: '#4b6cfb',
  narration: '#00d4c8',
  choice: '#9c6bf7',
  jump: '#eab308',
  bg: '#22c55e',
  image: '#06b6d4',
  music: '#f97316',
  sfx: '#ec4899',
  setvar: '#94a3b8',
  if: '#f43f5e',
  wait: '#64748b',
  effect: '#a78bfa',
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const CHART_COLORS = ['#4b6cfb','#00d4c8','#9c6bf7','#eab308','#22c55e','#f97316','#ec4899','#f43f5e','#06b6d4'];

/**
 * makePieLabelRenderer — polished callout labels
 *
 *  - Lines EXIT from the slice edge at the slice's mid-angle (never cross the pie).
 *  - Largest slice  → LEFT column with a single horizontal callout.
 *  - All others     → RIGHT column: radial stub → elbow → horizontal to label.
 *  - Labels are evenly spread vertically so they never overlap.
 */
function makePieLabelRenderer(
  data: Array<{ name: string; value: number }>,
  colors: string[],
) {
  const RADIAN    = Math.PI / 180;
  const ROW_H     = 32;    // vertical gap between right/left column rows
  const STUB      = 32;    // length of the radial stub past the pie edge
  const COL_EXTRA = 54;    // how far past the pie edge the stacked label column sits

  const total = data.reduce((s, d) => s + d.value, 0);

  // We can assume tiny slices on the right side will be stacked, and left side stacked.
  let cum = 0;
  const posMap = new Map<string, { isTiny: boolean; dy: number; side: 'left'|'right' }>();
  
  const rightTiny: Array<{ name: string; y: number }> = [];
  const leftTiny: Array<{ name: string; y: number }> = [];

  data.forEach(d => {
    const sweep = (d.value / total) * 360;
    const mid = cum + sweep / 2;
    cum += sweep;
    
    const isTiny = (d.value / total) < 0.05;
    if (isTiny) {
      const rad = -mid * RADIAN;
      const y = Math.sin(rad); // physical vertical position relative to center
      const isRight = Math.cos(rad) >= 0;
      if (isRight) rightTiny.push({ name: d.name, y });
      else leftTiny.push({ name: d.name, y });
    }
  });

  // Sort top-to-bottom physically
  rightTiny.sort((a, b) => a.y - b.y);
  leftTiny.sort((a, b) => a.y - b.y);

  const rHalf = (rightTiny.length - 1) / 2;
  rightTiny.forEach((item, i) => posMap.set(item.name, { isTiny: true, dy: (i - rHalf) * ROW_H, side: 'right' }));

  const lHalf = (leftTiny.length - 1) / 2;
  leftTiny.forEach((item, i) => posMap.set(item.name, { isTiny: true, dy: (i - lHalf) * ROW_H, side: 'left' }));

  return function renderLabel(props: any) {
    const { cx, cy, outerRadius, name, fill, midAngle, value } = props;
    if (!name || typeof midAngle !== 'number') return null;

    // Recharts midAngle logic: 0=3 o'clock, 90=12 o'clock in standard math
    // Negative midAngle aligns with SVG coordinate space where Y is down
    const rad = -midAngle * RADIAN;
    const pct = value / total;
    const pos = posMap.get(name);
    const isTiny = pos?.isTiny ?? false;

    const color = fill ?? '#ccc';
    const p1x = cx + outerRadius * Math.cos(rad);
    const p1y = cy + outerRadius * Math.sin(rad);
    const p2x = cx + (outerRadius + STUB) * Math.cos(rad);
    const p2y = cy + (outerRadius + STUB) * Math.sin(rad);

    let lx: number, ly: number, textX: number;
    let anchor: "start" | "end" | "middle" | "inherit";

    if (isTiny && pos) {
      // Stacked vertically for slices < 5%
      const colDist = outerRadius + COL_EXTRA;
      ly = cy + pos.dy;
      if (pos.side === 'right') {
        lx = cx + colDist;
        textX = lx + 8;
        anchor = 'start';
      } else {
        lx = cx - colDist;
        textX = lx - 8;
        anchor = 'end';
      }
    } else {
      // Radial positioning directly near the slice for >= 5%
      const isRight = Math.cos(rad) >= 0;
      lx = p2x + (isRight ? 16 : -16);
      ly = p2y;
      textX = lx + (isRight ? 8 : -8);
      anchor = isRight ? 'start' : 'end';
    }

    const glowId = `glow-${name.replace(/\s/g, '')}`;

    return (
      <g key={name}>
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Connector */}
        <polyline
          points={`${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)}`}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeOpacity={0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Outer ring + filled dot */}
        <circle cx={lx} cy={ly} r={6} fill={color} fillOpacity={0.2} />
        <circle cx={lx} cy={ly} r={3.5} fill={color} />

        {/* Name */}
        <text
          x={textX} y={ly - 4}
          textAnchor={anchor}
          fontSize={15} fontWeight={700}
          fill="#f0f3fa"
          style={{ filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.6))` }}
        >{name}</text>

        {/* Percentage */}
        <text
          x={textX} y={ly + 12}
          textAnchor={anchor}
          fontSize={13} fontWeight={500}
          fill={color}
          fillOpacity={0.95}
        >{(pct * 100).toFixed(1)}%</text>
      </g>
    );
  };
}





// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string | number; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
  <div
    style={{
      background: 'var(--bg2)', border: '1px solid var(--bdr)',
      borderLeft: `3px solid ${color ?? 'var(--bdr)'}`,
      borderRadius: 8, padding: '20px 24px',
      display: 'flex', flexDirection: 'column', gap: 6,
      transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
      cursor: 'default',
      animation: 'vnv-fade-slide-in 0.18s ease both',
    }}
    onMouseEnter={e => {
      const el = e.currentTarget as HTMLDivElement;
      el.style.transform = 'translateY(-3px)';
      el.style.boxShadow = `0 8px 20px rgba(0,0,0,0.35), 0 0 0 1px color-mix(in srgb, ${color ?? 'var(--acc2)'} 20%, transparent)`;
    }}
    onMouseLeave={e => {
      const el = e.currentTarget as HTMLDivElement;
      el.style.transform = 'translateY(0)';
      el.style.boxShadow = 'none';
    }}
  >
    <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 32, fontWeight: 800, color: color ?? 'var(--text)', lineHeight: 1.1, fontFamily: 'var(--mono)' }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--faint)' }}>{sub}</div>}
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────

const StatsView: React.FC<StatsViewProps> = ({ project }) => {
  const { t } = useTranslation();
  const stats = useMemo(() => {
    let totalWords = 0;
    let totalEvents = 0;
    const eventTypeCounts: Record<string, number> = {};
    let branchCount = 0;
    let maxDepth = 0;

    const usedImages = new Map<string, number>();
    const usedAudio  = new Map<string, number>();

    const sceneStats = project.scenes.map(scene => {
      let sceneWords = 0;
      let sceneEvents = scene.events.length;
      let sceneBranchCount = 0;
      const typeCounts: Record<string, number> = {};

      scene.events.forEach(ev => {
        totalEvents++;
        const t = ev.type || 'unknown';
        eventTypeCounts[t] = (eventTypeCounts[t] ?? 0) + 1;
        typeCounts[t] = (typeCounts[t] ?? 0) + 1;

        if (ev.text) { const w = wordCount(ev.text); sceneWords += w; totalWords += w; }
        if (ev.prompt) { const w = wordCount(ev.prompt); sceneWords += w; totalWords += w; }
        if (ev.opts) ev.opts.forEach(o => { const w = wordCount(o.text); sceneWords += w; totalWords += w; });
        if (ev.type === 'choice' && ev.opts) {
          branchCount += ev.opts.length;
          sceneBranchCount += ev.opts.length;
        }

        if (ev.bg) usedImages.set(ev.bg, (usedImages.get(ev.bg) ?? 0) + 1);
        if (ev.image) usedImages.set(ev.image, (usedImages.get(ev.image) ?? 0) + 1);
        if (ev.music) usedAudio.set(ev.music, (usedAudio.get(ev.music) ?? 0) + 1);
        if (ev.sfx) usedAudio.set(ev.sfx, (usedAudio.get(ev.sfx) ?? 0) + 1);
      });
      return { 
        id: scene.id, 
        label: scene.label,
        shortLabel: scene.label.length > 12 ? scene.label.slice(0, 12) + '…' : scene.label,
        words: sceneWords, 
        events: sceneEvents,
        branchCount: sceneBranchCount,
        playtime: Math.round(sceneWords / WORDS_PER_MINUTE * 10) / 10,
        ...typeCounts 
      };
    });

    // BFS depth from start scene
    if (project.start) {
      const visited = new Map<string, number>();
      const queue: Array<[string, number]> = [[project.start, 0]];
      while (queue.length) {
        const [id, depth] = queue.shift()!;
        if (visited.has(id)) continue;
        visited.set(id, depth);
        maxDepth = Math.max(maxDepth, depth);
        const sc = project.scenes.find(s => s.id === id);
        if (!sc) continue;
        sc.events.forEach(ev => {
          if (ev.scene_id) queue.push([ev.scene_id, depth + 1]);
          if (ev.scene_true) queue.push([ev.scene_true, depth + 1]);
          if (ev.scene_false) queue.push([ev.scene_false, depth + 1]);
          ev.opts?.forEach(o => { if (o.scene) queue.push([o.scene, depth + 1]); });
        });
      }
    }

    const avgWordsPerScene = project.scenes.length > 0 ? Math.round(totalWords / project.scenes.length) : 0;
    const estimatedMinutes = Math.round(totalWords / WORDS_PER_MINUTE);

    const charUsage = new Map<string, number>();
    project.scenes.forEach(sc => sc.events.forEach(ev => {
      if (ev.char_id) charUsage.set(ev.char_id, (charUsage.get(ev.char_id) ?? 0) + 1);
    }));

    const eventTypePieData = Object.entries(eventTypeCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));

    const sceneBarData = [...sceneStats]
      .sort((a, b) => b.words - a.words)
      .slice(0, 15);

    const topImages = [...usedImages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const topAudio = [...usedAudio.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const branchingData = [...sceneStats]
      .filter(s => s.branchCount > 0)
      .sort((a, b) => b.branchCount - a.branchCount)
      .slice(0, 10);

    const activeEventTypes = Object.keys(eventTypeCounts);

    return {
      totalWords, totalEvents, avgWordsPerScene, estimatedMinutes,
      branchCount, maxDepth,
      usedImages: usedImages.size, usedAudio: usedAudio.size,
      charUsage, eventTypePieData, sceneBarData, sceneStats,
      topImages, topAudio, branchingData, activeEventTypes
    };
  }, [project]);

  const topChars = [...stats.charUsage.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id, count]) => {
      const char = project.characters.find(c => c.id === id);
      return { name: char?.name ?? id, count };
    });

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '16px 20px', background: 'var(--bg0)' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
        {t('stats.title')} — {project.title}
      </h2>

      {/* Key metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label={t('stats.total_words')} value={stats.totalWords.toLocaleString()} sub={t('stats.total_words_sub')} color="var(--acc2)" />
        <StatCard label={t('stats.playtime')} value={`~${stats.estimatedMinutes} min`} sub={t('stats.playtime_sub')} color="var(--teal)" />
        <StatCard label={t('stats.scenes')} value={project.scenes.length} sub={`avg ${stats.avgWordsPerScene} words`} />
        <StatCard label={t('stats.characters')} value={project.characters.length} />
        <StatCard label={t('stats.total_events')} value={stats.totalEvents} />
        <StatCard label={t('stats.branch_points')} value={stats.branchCount} sub={t('stats.branch_sub')} color="#9c6bf7" />
        <StatCard label={t('stats.max_depth')} value={stats.maxDepth} sub={t('stats.max_depth_sub')} />
        <StatCard label={t('stats.assets')} value={`${stats.usedImages}🖼 ${stats.usedAudio}🎵`} sub={t('stats.assets_sub')} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* Event type pie */}
        <div style={{
          background: 'linear-gradient(160deg, var(--bg2), color-mix(in srgb, var(--acc) 4%, var(--bg1)))',
          border: '1px solid var(--bdr)', borderRadius: 10,
          padding: '16px 16px', backdropFilter: 'blur(4px)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{t('stats.event_types')}</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12 }}>{t('stats.event_types_sub')}</div>
          {stats.eventTypePieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={520}>
              <PieChart margin={{ top: 24, right: 140, bottom: 24, left: 140 }}>

                <Pie
                  data={stats.eventTypePieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={150}
                  dataKey="value"
                  nameKey="name"
                  label={makePieLabelRenderer(stats.eventTypePieData, CHART_COLORS)}
                  labelLine={false}
                >
                  {stats.eventTypePieData.map((entry, i) => (
                    <Cell key={entry.name} fill={EVENT_COLORS[entry.name] ?? CHART_COLORS[i % CHART_COLORS.length]} style={{ outline: 'none' }} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 6, fontSize: 11 }}
                  formatter={(value, name) => [`${value} events`, String(name)]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--faint)', fontSize: 12 }}>{t('stats.no_events')}</div>
          )}
        </div>



        {/* Right Column: Scene bar chart + Top characters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Scene word count bar */}
          <div style={{
            background: 'linear-gradient(160deg, var(--bg2), color-mix(in srgb, var(--teal) 3%, var(--bg1)))',
            border: '1px solid var(--bdr)', borderRadius: 10,
            padding: '20px 24px', flex: 1,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{t('stats.words_per_scene')}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12 }}>{t('stats.words_per_scene_sub')}</div>
            {stats.sceneBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats.sceneBarData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--faint)' }} />
                  <YAxis type="category" dataKey="shortLabel" width={90} tick={{ fontSize: 11, fill: 'var(--dim)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="words" fill="var(--acc2)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--faint)', fontSize: 12 }}>{t('stats.no_scenes')}</div>
            )}
          </div>

          {/* Top characters */}
          {topChars.length > 0 && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '20px 24px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>{t('stats.top_chars')}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {topChars.map((ch, i) => {
                  const char = project.characters.find(c => c.name === ch.name);
                  return (
                    <div key={ch.name} style={{
                      padding: '8px 14px', borderRadius: 6, background: 'var(--bg3)',
                      border: '1px solid var(--bdr)', display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      {char?.color && <div style={{ width: 12, height: 12, borderRadius: '50%', background: char.color, flexShrink: 0 }} />}
                      <span style={{ fontSize: 14, color: 'var(--text)' }}>{ch.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--faint)' }}>{ch.count} lines</span>
                      {i === 0 && <span style={{ fontSize: 11, color: 'var(--amber)', marginLeft: 4 }}>★ Lead</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Character Analytics ─────────────────────────────────────────────── */}
      {topChars.length > 0 && (() => {
        // Per-character word + line counts
        const charDetails = project.characters.map(char => {
          let words = 0, lines = 0;
          project.scenes.forEach(sc => sc.events.forEach(ev => {
            if (ev.char_id === char.id && ev.type === 'dialogue') {
              lines++;
              words += wordCount(ev.text ?? '');
            }
          }));
          return { char, words, lines, avgWords: lines > 0 ? Math.round(words / lines) : 0 };
        }).filter(d => d.lines > 0).sort((a, b) => b.words - a.words);

        const totalDialogueWords = charDetails.reduce((s, d) => s + d.words, 0) || 1;

        return (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '20px 24px', marginBottom: 24, backdropFilter: 'blur(4px)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t('stats.char_breakdown')}</div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16 }}>{t('stats.char_breakdown_sub')}</div>

            {charDetails.length === 0 ? (
              <div style={{ color: 'var(--faint)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>{t('stats.no_dialogue')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {charDetails.map((d, i) => {
                  const pct = (d.words / totalDialogueWords) * 100;
                  return (
                    <div key={d.char.id} style={{ display: 'flex', alignItems: 'center', gap: 12, animation: 'vnv-fade-slide-in 0.15s ease both', animationDelay: `${i * 0.04}s` }}>
                      {/* Rank */}
                      <span style={{ fontSize: 10, color: 'var(--faint)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                      {/* Color dot */}
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.char.color || 'var(--dim)', flexShrink: 0 }} />
                      {/* Name */}
                      <span style={{ fontSize: 12, fontWeight: 600, color: d.char.color || 'var(--text)', width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.char.display || d.char.name}
                      </span>
                      {/* Bar */}
                      <div style={{ flex: 1, height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: d.char.color || 'var(--acc2)', borderRadius: 4,
                          transition: 'width 0.6s ease',
                          animation: `vnv-bar-grow 0.6s ease ${i * 0.05}s both`,
                        }} />
                      </div>
                      {/* Stats */}
                      <span style={{ fontSize: 11, color: 'var(--dim)', width: 44, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(1)}%</span>
                      <span style={{ fontSize: 11, color: 'var(--text)', width: 60, textAlign: 'right', flexShrink: 0 }}>{d.words.toLocaleString()} w</span>
                      <span style={{ fontSize: 10, color: 'var(--faint)', width: 54, textAlign: 'right', flexShrink: 0 }}>{d.lines} lines</span>
                      <span style={{ fontSize: 10, color: 'var(--faint)', width: 50, textAlign: 'right', flexShrink: 0 }}>~{d.avgWords}w/ln</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── NEW ANALYTICS ROWS ─────────────────────────────────────────────────── */}

      {/* 1. Pacing & Composition Stacked Bar Chart */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '20px 24px', marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{t('stats.pacing')}</div>
        <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16 }}>{t('stats.pacing_sub')}</div>
        {stats.sceneStats.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={stats.sceneStats} margin={{ left: 0, right: 20 }}>
              <XAxis dataKey="shortLabel" tick={{ fontSize: 11, fill: 'var(--dim)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--faint)' }} />
              <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
              {stats.activeEventTypes.map((type, i) => (
                <Bar key={type} dataKey={type} stackId="a" fill={EVENT_COLORS[type] ?? CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--faint)', fontSize: 12 }}>{t('stats.no_scenes')}</div>
        )}
      </div>

      {/* 2. Playtime Estimates & Branching Complexity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Playtime */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{t('stats.playtime_scene')}</div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16 }}>{t('stats.playtime_pace')}</div>
          {stats.sceneBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.sceneBarData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--faint)' }} />
                <YAxis type="category" dataKey="shortLabel" width={90} tick={{ fontSize: 11, fill: 'var(--dim)' }} />
                <Tooltip formatter={(val) => [`${val} minutes`, 'Playtime']} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="playtime" fill="var(--teal)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--faint)', fontSize: 12 }}>{t('stats.no_scenes')}</div>
          )}
        </div>

        {/* Branching Complexity */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{t('stats.branching')}</div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16 }}>{t('stats.branching_sub')}</div>
          {stats.branchingData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.branchingData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--faint)' }} />
                <YAxis type="category" dataKey="shortLabel" width={90} tick={{ fontSize: 11, fill: 'var(--dim)' }} />
                <Tooltip formatter={(val) => [`${val} options`, 'Choices']} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="branchCount" fill="#9c6bf7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--faint)', fontSize: 12 }}>{t('stats.no_choices')}</div>
          )}
        </div>
      </div>

      {/* 3. Asset Leaderboards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 40 }}>
        {/* Top Backgrounds */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>{t('stats.top_images')}</div>
          {stats.topImages.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.topImages.map((img, i) => (
                <div key={img.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--bdr)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {img.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--acc2)', fontWeight: 600 }}>{img.count}x</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--faint)', fontSize: 12 }}>{t('stats.no_images')}</div>
          )}
        </div>

        {/* Top Audio */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>{t('stats.top_audio')}</div>
          {stats.topAudio.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.topAudio.map((aud, i) => (
                <div key={aud.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--bdr)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i + 1}. {aud.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--warn)', fontWeight: 600 }}>{aud.count}x</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--faint)', fontSize: 12 }}>{t('stats.no_audio')}</div>
          )}
        </div>
      </div>

    </div>
  );
};

export default StatsView;
