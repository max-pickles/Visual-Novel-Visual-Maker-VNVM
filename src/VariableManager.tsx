/**
 * VariableManager.tsx
 * Dashboard for VNProject variables derived from setvar/if events.
 * Virtualized for performance. Ported from legacy IDE with VNProject adapter.
 */
import React, { useMemo, useState } from 'react';
import type { VNProject, VNVariable } from './types';
import { useVirtualList } from './useVirtualList';
import { useTranslation } from './translationContext';

interface VariableManagerProps {
  project: VNProject;
  onProjectChange?: (p: VNProject) => void;
}

type SortMode = 'name' | 'type' | 'usage';
type FilterMode = 'all' | 'bool' | 'number' | 'string';

interface DerivedVar extends VNVariable {
  usageCount: number;
  inferredType: 'boolean' | 'number' | 'string';
  usages: Array<{ sceneId: string; sceneName: string; eventIdx: number; mode: 'read' | 'write' }>;
}

function inferType(val: string): 'boolean' | 'number' | 'string' {
  const v = val.trim().toLowerCase();
  if (v === 'true' || v === 'false') return 'boolean';
  if (!isNaN(Number(v)) && v !== '') return 'number';
  return 'string';
}

function buildDerivedVars(project: VNProject): DerivedVar[] {
  const varMap = new Map<string, DerivedVar>();

  // Seed from VNVariable array if the project shape includes it
  const existingVars: VNVariable[] = (project as any).variables ?? [];
  for (const v of existingVars) {
      varMap.set(v.name, {
        ...v,
        usageCount: 0,
        inferredType: inferType(v.default_val),
        usages: [],
      });
  }

  // Scan events for setvar/if
  for (const scene of project.scenes) {
    scene.events.forEach((ev, idx) => {
      const vars: Array<{ name: string; mode: 'read' | 'write' }> = [];
      if (ev.type === 'setvar' && ev.var_name) {
        vars.push({ name: ev.var_name, mode: 'write' });
      }
      if (ev.type === 'if' && ev.condition) {
        const matches = ev.condition.match(/\b([a-zA-Z_]\w*)\b/g);
        if (matches) {
          for (const m of matches) {
            if (!['True','False','None','and','or','not','is','in'].includes(m) && isNaN(Number(m))) {
              vars.push({ name: m, mode: 'read' });
            }
          }
        }
      }

      for (const { name, mode } of vars) {
        if (!varMap.has(name)) {
          varMap.set(name, {
            name,
            default_val: ev.var_val ?? 'False',
            usageCount: 0,
            inferredType: inferType(ev.var_val ?? 'False'),
            usages: [],
          });
        }
        const dv = varMap.get(name)!;
        dv.usageCount++;
        dv.usages.push({ sceneId: scene.id, sceneName: scene.label || scene.id, eventIdx: idx, mode });
      }
    });
  }

  return Array.from(varMap.values());
}

const TYPE_COLORS: Record<string, string> = {
  boolean: 'color-mix(in srgb, var(--teal) 15%, transparent)',
  number:  'color-mix(in srgb, var(--acc2) 15%, transparent)',
  string:  'color-mix(in srgb, var(--pink) 15%, transparent)',
};
const TYPE_BORDERS: Record<string, string> = {
  boolean: 'var(--teal)',
  number:  'var(--acc2)',
  string:  'color-mix(in srgb, var(--pink) 80%, transparent)',
};

const ITEM_H = 68;

const VariableManager: React.FC<VariableManagerProps> = ({ project }) => {
  const [sort, setSort] = useState<SortMode>('name');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('list');
  const { t } = useTranslation();

  const allVars = useMemo(() => buildDerivedVars(project), [project]);

  const visible = useMemo(() => {
    let list = allVars.filter(v => {
      if (filter !== 'all' && v.inferredType !== filter) return false;
      if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'type') list = [...list].sort((a, b) => a.inferredType.localeCompare(b.inferredType));
    if (sort === 'usage') list = [...list].sort((a, b) => b.usageCount - a.usageCount);
    return list;
  }, [allVars, sort, filter, search]);

  const { containerRef, handleScroll, virtualItems, totalHeight } = useVirtualList(visible, ITEM_H);

  const selectedVar = selected ? allVars.find(v => v.name === selected) : null;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg0)' }}>

      {/* Left pane — list */}
      <div style={{ display: 'flex', flexDirection: 'column', width: 320, borderRight: '1px solid var(--bdr)', flexShrink: 0, overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="input" placeholder={t('vars.search_ph')} value={search}
            onChange={e => setSearch(e.target.value)} />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['all', 'bool', 'number', 'string'] as FilterMode[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${filter === f ? 'var(--teal)' : 'var(--bdr)'}`,
                  background: filter === f ? 'color-mix(in srgb, var(--teal) 12%, transparent)' : 'transparent',
                  color: filter === f ? 'var(--teal)' : 'var(--dim)',
                }}>
                {f === 'all' ? `All (${allVars.length})` : f}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <select className="input" value={sort} onChange={e => setSort(e.target.value as SortMode)}
                style={{ fontSize: 10, padding: '2px 6px' }}>
                <option value="name">{t('vars.sort_name')}</option>
                <option value="type">{t('vars.sort_type')}</option>
                <option value="usage">{t('vars.sort_usage')}</option>
              </select>
              <button onClick={() => setViewMode(v => v === 'list' ? 'matrix' : 'list')}
                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: 'var(--bg2)', border: '1px solid var(--bdr)', color: 'var(--text)' }}>
                {viewMode === 'list' ? t('vars.matrix_view') : t('vars.list_view')}
              </button>
            </div>
          </div>
        </div>

        {/* Virtualized list */}
        {viewMode === 'list' && (
          <div ref={containerRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
            <div style={{ height: totalHeight, position: 'relative' }}>
              {virtualItems.map(({ item: v, offsetTop }) => {
                const isSelected = selected === v.name;
                return (
                  <div key={v.name}
                    onClick={() => setSelected(isSelected ? null : v.name)}
                    style={{
                      position: 'absolute', top: offsetTop, left: 0, right: 0, height: ITEM_H,
                      padding: '0 12px', display: 'flex', alignItems: 'center', gap: 10,
                      cursor: 'pointer', borderBottom: '1px solid var(--bdr)',
                      background: isSelected ? 'color-mix(in srgb, var(--teal) 6%, transparent)' : 'transparent',
                      borderLeft: isSelected ? '2px solid var(--teal)' : '2px solid transparent',
                      transition: 'background 0.12s, border-color 0.12s',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'color-mix(in srgb, var(--teal) 3%, transparent)'; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                      background: TYPE_COLORS[v.inferredType],
                      border: `1px solid ${TYPE_BORDERS[v.inferredType]}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14,
                    }}>
                      {v.inferredType === 'boolean' ? '☑' : v.inferredType === 'number' ? '#' : '"'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 2 }}>
                        Default: <code style={{ fontFamily: 'var(--mono)' }}>{v.default_val || '—'}</code>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 1 }}>
                        {v.inferredType} · {v.usageCount} usage{v.usageCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {visible.length === 0 && (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                {search ? `${t('vars.no_match')} "${search}"` : t('vars.no_vars')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right pane — detail or matrix */}
      {viewMode === 'list' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {selectedVar ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)', marginBottom: 4 }}>{selectedVar.name}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: TYPE_COLORS[selectedVar.inferredType], border: `1px solid ${TYPE_BORDERS[selectedVar.inferredType]}`, color: 'var(--text)' }}>
                    {selectedVar.inferredType}
                  </span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg2)', border: '1px solid var(--bdr)', color: 'var(--dim)' }}>
                    {selectedVar.usageCount} usage{selectedVar.usageCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('vars.default_value')}</div>
                <code style={{ display: 'block', padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--teal)' }}>
                  {selectedVar.default_val || 'False'}
                </code>
              </div>

              <div>
                <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('vars.usages_in_project')}</div>
                {selectedVar.usages.length === 0 ? (
                  <div style={{ color: 'var(--faint)', fontSize: 12, fontStyle: 'italic' }}>{t('vars.no_usages')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedVar.usages.map((u, i) => (
                      <div key={i} style={{ padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--text)' }}>{u.sceneName}</div>
                          <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>Event #{u.eventIdx + 1}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: u.mode === 'read' ? 'color-mix(in srgb, var(--teal) 10%, transparent)' : 'color-mix(in srgb, var(--acc2) 10%, transparent)', color: u.mode === 'read' ? 'var(--teal)' : 'var(--acc2)' }}>
                          {u.mode === 'read' ? 'READ' : 'WRITE'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--faint)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 13 }}>{t('vars.select_hint')}</div>
              <div style={{ fontSize: 11, marginTop: 8, color: 'var(--faint)' }}>
                {t('vars.auto_detect')}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
          {(() => {
            const sceneIds = new Set<string>();
            visible.forEach(v => v.usages.forEach(u => sceneIds.add(u.sceneId)));
            const cols = project.scenes.filter(s => sceneIds.has(s.id));

            return (
              <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 11, tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, top: 0, background: 'var(--bg1)', zIndex: 10, padding: '12px 16px', borderBottom: '1px solid var(--bdr)', borderRight: '1px solid var(--bdr)', textAlign: 'left', width: 200 }}>{t('vars.variable_col')}</th>
                    {cols.map(sc => (
                      <th key={sc.id} style={{ position: 'sticky', top: 0, background: 'var(--bg1)', padding: '12px 6px', borderBottom: '1px solid var(--bdr)', borderRight: '1px solid var(--bdr)', whiteSpace: 'nowrap', width: 40 }}>
                        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 120, margin: '0 auto', color: 'var(--dim)', fontWeight: 600 }}>{sc.label}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(v => {
                    const readScenes = new Set(v.usages.filter(u => u.mode === 'read').map(u => u.sceneId));
                    const writeScenes = new Set(v.usages.filter(u => u.mode === 'write').map(u => u.sceneId));
                    const isError = readScenes.size > 0 && writeScenes.size === 0;

                    return (
                      <tr key={v.name} style={{ background: isError ? 'rgba(248,113,113,0.1)' : 'transparent' }}>
                        <td style={{ position: 'sticky', left: 0, background: isError ? 'color-mix(in srgb, var(--err) 15%, var(--bg0))' : 'var(--bg0)', padding: '6px 16px', fontWeight: 600, color: isError ? 'var(--err)' : 'var(--text)', borderBottom: '1px solid var(--bdr)', borderRight: '1px solid var(--bdr)', fontFamily: 'var(--mono)' }}>
                          {v.name}
                          {isError && <span title="Logic Warning: Variable is read but never written/set anywhere!" style={{marginLeft: 6, cursor: 'help'}}>⚠️</span>}
                        </td>
                        {cols.map(sc => {
                          const r = readScenes.has(sc.id);
                          const w = writeScenes.has(sc.id);
                          return (
                            <td key={sc.id} style={{ textAlign: 'center', padding: 0, borderBottom: '1px solid var(--bdr)', borderRight: '1px solid var(--bdr)' }}>
                              <div style={{ display: 'flex', width: '100%', height: '100%', minHeight: 28 }}>
                                <div style={{ flex: 1, background: w ? 'color-mix(in srgb, var(--acc2) 20%, transparent)' : 'transparent', color: w ? 'var(--acc2)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>W</div>
                                <div style={{ flex: 1, background: r ? 'color-mix(in srgb, var(--teal) 20%, transparent)' : 'transparent', color: r ? 'var(--teal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>R</div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default VariableManager;
