import React from 'react';
import type { VNProject, NodeKind } from './types';
import { MainMenuThumbnail } from "./MainMenuEditor";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useThumbnail } from "./useThumbnail";
import { useDebounce } from "./useDebounce";

export const MAIN_MENU_ID = 'main_menu';
const FOLDER_COLOR = '#d4961e'; 
const NODE_COLORS: Record<NodeKind | string, string> = {
  label: '#4b6cf7', menu: '#f472b6',
  init: '#facc15', screen: '#4b6cf7', unknown: '#9ca3af'
};

const EXTS = [".png", ".jpg", ".jpeg", ".webp"];
function bgCandidates(rootPath: string, name: string): string[] {
  if (!name || !rootPath) return [];
  const norm = name.replace(/\s+/g, "_");
  const urls: string[] = [];
  for (const base of [name, norm]) {
    if (/\.[a-zA-Z]{2,5}$/.test(base)) {
      urls.push(convertFileSrc(`${rootPath}/${base}`));
      if (!base.startsWith('game/')) urls.push(convertFileSrc(`${rootPath}/game/images/${base}`));
      if (!base.startsWith('images/')) urls.push(convertFileSrc(`${rootPath}/images/${base}`));
    } else {
      for (const ext of EXTS) {
        urls.push(convertFileSrc(`${rootPath}/game/images/${base}${ext}`));
        urls.push(convertFileSrc(`${rootPath}/images/${base}${ext}`));
        urls.push(convertFileSrc(`${rootPath}/${base}${ext}`));
      }
    }
  }
  return [...new Set(urls)];
}

function NodeBgThumb({ bgName, rootPath }: { bgName: string; rootPath: string }) {
  const list = React.useMemo(() => bgCandidates(rootPath, bgName), [rootPath, bgName]);
  const [idx, setIdx] = React.useState(0);
  const [dead, setDead] = React.useState(false);
  React.useEffect(() => { setIdx(0); setDead(false); }, [list]);
  if (dead || list.length === 0) return null;
  return (
    <img
      src={list[idx]}
      alt=""
      onError={() => { if (idx + 1 < list.length) setIdx(i => i + 1); else setDead(true); }}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', opacity: 0.55, borderRadius: 8,
        pointerEvents: 'none',
      }}
    />
  );
}

function SceneThumbnail({ scene, project, rootPath, inheritedBg }: { scene: any; project: any; rootPath?: string; inheritedBg?: string }) {
  const targetScale = useCanvasStore(s => {
    if (s.zoom >= 2.0) return 8; // High res for zoomed in
    if (s.zoom <= 0.4) return 2; // Low res for zoomed out
    return 4; // Standard res (640x360)
  });
  const scaleLevel = useDebounce(targetScale, 300);

  const thumb = useThumbnail(scene, project, rootPath, inheritedBg, scaleLevel);
  if (!thumb) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 0, borderRadius: 8,
      backgroundImage: `url(${thumb})`,
      backgroundSize: 'cover', backgroundPosition: 'center',
      opacity: 1.0,
      transition: 'opacity 0.4s',
    }} />
  );
}

import { useCanvasStore, useShallow } from './store/canvasStore';
import { useTranslation } from './translationContext';

function ConnectionPort({ showPort, tool, color = 'var(--acc)', onPointerDown }: { showPort: boolean; tool: string; color?: string; onPointerDown: (e: React.PointerEvent) => void }) {
  const [shouldRender, setShouldRender] = React.useState(showPort);
  const [exiting, setExiting] = React.useState(false);

  React.useEffect(() => {
    if (showPort) {
      setShouldRender(true);
      setExiting(false);
    } else if (shouldRender) {
      setExiting(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setExiting(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showPort, shouldRender]);

  if (!shouldRender) return null;

  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute', right: -12, top: '50%', transform: 'translateY(-50%)',
        width: 24, height: 24, borderRadius: '50%', background: color,
        border: '3px solid #0d0f1a', cursor: tool === 'pan' ? 'grab' : 'crosshair',
        boxShadow: `0 0 10px ${color}`, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: exiting ? 'popInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' : 'popOutRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        pointerEvents: tool === 'pan' || exiting ? 'none' : 'auto'
      }}
    >
       <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
    </div>
  );
}

export interface NodeLayerProps {
  displayNodes: any[];
  isVN: boolean;
  compactCards: boolean;
  visibleRect?: { x: number; y: number; w: number; h: number };
  zoom?: number;
  handleNodePointerDown: (e: React.PointerEvent, id: string) => void;
  handleNodePointerMove: (e: React.PointerEvent) => void;
  handleNodePointerUp: (e: React.PointerEvent) => void;
  handleNodeDoubleClick: (id: string, kind: string, label: string) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
  finishRename: () => void;
  project: any;
  rootPath?: string;
  handleConnectionDragStart?: (node: any) => (e: React.PointerEvent) => void;
  onProjectChange?: (p: any) => void;
}

export const NodeLayer = React.memo(function NodeLayer(props: NodeLayerProps) {
  const {
    displayNodes, isVN, compactCards, visibleRect, zoom = 1, handleNodePointerDown, handleNodePointerMove,
    handleNodePointerUp, handleNodeDoubleClick, canvasRef, finishRename, project, rootPath, handleConnectionDragStart,
    onProjectChange
  } = props;

  const {
    selection, search, charFilter, setSelection, setCtxMenu,
    renamingId, setRenamingId, renameVal, setRenameVal,
    hoverTargetId, isConnectionMode, connMenu, tool,
    endingMenuNodeId, setEndingMenuNodeId
  } = useCanvasStore(useShallow(s => ({
    selection: s.selection, search: s.search, charFilter: s.charFilter,
    setSelection: s.setSelection, setCtxMenu: s.setCtxMenu,
    renamingId: s.renamingId, setRenamingId: s.setRenamingId,
    renameVal: s.renameVal, setRenameVal: s.setRenameVal,
    hoverTargetId: s.hoverTargetId, isConnectionMode: s.isConnectionMode,
    connMenu: s.connMenu, tool: s.tool,
    endingMenuNodeId: s.endingMenuNodeId, setEndingMenuNodeId: s.setEndingMenuNodeId,
  })));

  const { t } = useTranslation();

  return (
    <>
      {displayNodes.map(node => {
        if (visibleRect) {
          const margin = 1000 / zoom; // Pre-render slightly off-screen to avoid pop-in
          const isVisible = (
            node.x + node.w >= visibleRect.x - margin &&
            node.x <= visibleRect.x + visibleRect.w + margin &&
            node.y + node.h >= visibleRect.y - margin &&
            node.y <= visibleRect.y + visibleRect.h + margin
          );
          if (!isVisible) return null;
        }

        const isSel = selection.has(node.id);
        const isMatch = search && node.label.toLowerCase().includes(search.toLowerCase());
        const charDim = !!charFilter && (() => {
          if (node.kind !== 'vn_scene') return false;
          const sc = (project as VNProject).scenes.find(s => s.id === node.id);
          return !sc?.events.some(ev => ev.char_id === charFilter);
        })();
        const dim   = (search && !isMatch) || charDim;
        const sc = node.kind === 'vn_scene' && isVN
          ? (project as VNProject).scenes.find(s => s.id === node.id)
          : null;
        const isScreenScene = sc?.scene_type === 'screen';
        const color = node.id === MAIN_MENU_ID ? 'var(--teal)'
          : node.kind === 'folder' ? 'var(--amber)'
          : node.kind === 'vn_scene'
            ? (isScreenScene ? 'var(--teal)' : 'var(--acc)')
            : (NODE_COLORS[node.kind as NodeKind] ?? 'var(--acc2)');
        
        const isIsolated   = (node.inDegree === 0) && (node.outDegree === 0) && !node.isStart && node.id !== MAIN_MENU_ID;
        const isHub        = node.kind === 'vn_scene' && (node.inDegree  ?? 0) >= 3;
        const isBranch     = node.kind === 'vn_scene' && (node.outDegree ?? 0) >= 3;
        const isUnreachable = node.kind === 'vn_scene' && !!node.isUnreachable && !node.isStart && !isIsolated;

        const isHoverTarget = (hoverTargetId === node.id && isConnectionMode);
        const isMenuTarget = connMenu?.targetNodeId === node.id;
        const isMenuSource = connMenu?.sourceNode?.id === node.id;
        const isGlow = isHoverTarget || isMenuTarget || isMenuSource;

        if (compactCards) {
          return (
            <div key={node.id} className="node-card"
              onPointerDown={e => {
                if (isConnectionMode && isVN && node.kind === 'vn_scene' && tool === 'pointer' && handleConnectionDragStart) {
                  handleConnectionDragStart(node)(e);
                } else {
                  handleNodePointerDown(e, node.id);
                }
              }}
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
              style={{
                position: 'absolute', left: node.x, top: node.y, width: node.w, height: node.h,
                zIndex: isSel ? 10 : 1,
                background: color, borderRadius: 4, opacity: dim ? 0.2 : (isSel ? 1 : 0.8),
                cursor: 'pointer',
                boxShadow: isGlow ? `0 0 0 2px #fff, 0 0 16px #fff` : undefined
              }}
            />
          );
        }

        return (
          <div key={node.id} className={`node-card ${isSel ? 'selected' : ''}`}
            onPointerDown={e => handleNodePointerDown(e, node.id)}
            onPointerMove={handleNodePointerMove}
            onPointerUp={handleNodePointerUp}
            onDoubleClick={() => handleNodeDoubleClick(node.id, node.kind, node.label)}
            onContextMenu={e => {
              e.preventDefault();
              e.stopPropagation();
              setSelection(new Set([node.id]));
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, nodeId: node.id });
            }}
            style={{
              '--node-color': color,
              position: 'absolute', left: node.x, top: node.y, width: node.w, height: node.h,
              zIndex: isSel ? 10 : 1,
              background: 'rgba(13,18,32,0.85)', borderRadius: 8,
              border: `${isSel ? 2 : 1}px solid ${isSel ? color : 'var(--bdr)'}`,
              opacity: dim ? 0.3 : 1, display: 'flex', flexDirection: 'column', overflow: 'visible',
              cursor: 'pointer',
              boxShadow: isSel ? `0 0 16px color-mix(in srgb, ${color} 40%, transparent), 0 8px 24px rgba(0,0,0,0.6)` : isGlow ? `0 0 0 3px ${color}, 0 0 18px ${color}` : (isMatch ? '0 0 0 2px #facc15' : '0 4px 12px rgba(0,0,0,0.4)'),
            } as React.CSSProperties}
          >
            {node.isStart && (
              <div style={{
                position: 'absolute', left: -18, top: '50%', transform: 'translateY(-50%)',
                width: 0, height: 0,
                borderTop: '9px solid transparent',
                borderBottom: '9px solid transparent',
                borderLeft: `14px solid #22d3ee`,
                filter: `drop-shadow(0 0 4px color-mix(in srgb, #22d3ee 80%, transparent))`,
                pointerEvents: 'none',
              }} />
            )}
            {isVN && node.kind === 'vn_scene' && handleConnectionDragStart && (
              <ConnectionPort
                showPort={isConnectionMode && (selection.size === 0 || selection.has(node.id))}
                tool={tool}
                color={color}
                onPointerDown={handleConnectionDragStart(node)}
              />
            )}
            <div className="row gap6" style={{ padding: '8px 12px', background: `linear-gradient(90deg,${color}33,transparent)`, borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
              {renamingId === node.id ? (
                <input autoFocus className="input flex1 mono" style={{ height: 20, fontSize: 10, padding: 0 }}
                  value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onBlur={finishRename} onKeyDown={e => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') setRenamingId(null); }} />
              ) : (
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.kind === 'folder' ? '📂 ' : isScreenScene ? '🖥 ' : ''}{node.label}
                </div>
              )}
              {node.isStart && <span className="badge badge-acc" style={{ marginLeft: 'auto', color: 'var(--bg0)' }}>{t('canvas.badge_start')}</span>}
              {node.isEnd && (() => {
                if (isIsolated) {
                  return (
                    <span style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--faint)', border: '1px dashed var(--bdr)', userSelect: 'none' }}>
                        {t('canvas.badge_unlinked')}
                      </span>
                    </span>
                  );
                }

                const et = node.endingType as ('good' | 'bad' | 'odd' | 'stuck' | 'true') | undefined;
                const bg = (et === 'good' || et === 'true') ? '#4ade80' : et === 'bad' ? '#fb923c' : et === 'stuck' ? '#eab308' : '#a78bfa';
                const label = et ? `${t(`inspector.${et}`).replace(/^[✓✗⭐🔍↺🎲🔁]\s*/, '').toUpperCase()} ${t('canvas.badge_end')}` : t('canvas.badge_end');
                const isOpen = endingMenuNodeId === node.id;
                return (
                  <span style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
                    <span
                      className="badge"
                      title="Click to change ending type"
                      style={{ background: bg, color: 'var(--bg0)', border: `1px solid ${bg}`, cursor: 'pointer', userSelect: 'none' }}
                      onPointerDown={e => { 
                        if (e.button === 1 || tool === 'pan') return;
                        e.stopPropagation(); e.preventDefault(); setEndingMenuNodeId(isOpen ? null : node.id); 
                      }}
                      onPointerUp={e => {
                        if (e.button === 1 || tool === 'pan') return;
                        e.stopPropagation();
                      }}
                    >{label}</span>
                  </span>
                );
              })()}
              {node.isLocked && (
                <span title={t('canvas.system_node')} style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(250,204,21,0.15)', color: '#facc15', border: '1px solid #facc1555', flexShrink: 0 }}>🔒 {t('canvas.badge_system')}</span>
              )}
              {isScreenScene && (
                <span title="Screen" style={{ marginLeft: 4, fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(34,211,238,0.18)', color: '#22d3ee', border: '1px solid #22d3ee55', flexShrink: 0 }}>{t('canvas.badge_screen')}</span>
              )}
              {isHub        && <span title="Hub"   style={{ marginLeft: 4, fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(14,165,233,0.25)',  color: '#38bdf8', border: '1px solid #38bdf8',  flexShrink: 0 }}>{t('canvas.badge_hub')} {node.inDegree}</span>}
              {isBranch     && <span title="Branch" style={{ marginLeft: 4, fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(167,139,250,0.25)', color: '#c084fc', border: '1px solid #c084fc', flexShrink: 0 }}>{t('canvas.badge_branch')} {node.outDegree}</span>}
              {isUnreachable && <span title="Unreachable" style={{ marginLeft: 4, fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(251,146,60,0.25)', color: '#fb923c', border: '1px solid #fb923c', flexShrink: 0 }}>!</span>}
            </div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
              {node.bgImage && rootPath && <NodeBgThumb bgName={node.bgImage} rootPath={rootPath} />}
              {node.id === MAIN_MENU_ID && isVN ? (
                <MainMenuThumbnail
                  menu={(project as VNProject).main_menu}
                  title={(project as VNProject).title}
                  rootPath={rootPath}
                  style={{ position: 'absolute', inset: 0, borderRadius: '0 0 8px 8px' }}
                />
              ) : node.kind === 'vn_scene' && isVN ? (() => {
                const sc = (project as VNProject).scenes.find(s => s.id === node.id);
                return sc ? <SceneThumbnail scene={sc} project={project} rootPath={rootPath} inheritedBg={node.bgImage} /> : null;
              })() : null}
              <div style={{ flex: 1, padding: '8px 10px', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
                {node.id !== MAIN_MENU_ID && node.contentLines.map((line: string, i: number) => (
                  <div key={i} style={{ fontSize: 10, color: 'var(--text)', textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 1px 8px rgba(0,0,0,0.9)', fontWeight: 500, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* ── Ending Type Popover — rendered in canvas coordinate space so it moves with pan/zoom ── */}
      {endingMenuNodeId && (() => {
        const node = displayNodes.find(n => n.id === endingMenuNodeId);
        const sc = isVN ? (project as VNProject).scenes?.find((s: any) => s.id === endingMenuNodeId) : null;
        if (!node || !sc) return null;
        const CYCLE: Array<'good' | 'bad' | 'odd' | 'stuck' | 'true'> = ['good', 'bad', 'odd', 'stuck', 'true'];
        return (
          <div
            style={{
              position: 'absolute',
              left: node.x + node.w - 110,
              top: node.y + 40,
              zIndex: 999,
              background: '#0d1220',
              border: '1px solid #2a3a55',
              borderRadius: 8,
              overflow: 'hidden',
              minWidth: 120,
              boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
            }}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '5px 10px', fontSize: 9, color: 'var(--dim)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', borderBottom: '1px solid #1e2d42' }}>{t('canvas.badge_ending_type')}</div>
            {CYCLE.map(type => {
              const optBg = (type === 'good' || type === 'true') ? '#4ade80' : type === 'bad' ? '#fb923c' : type === 'stuck' ? '#eab308' : '#a78bfa';
              const isActive = (sc.ending_type ?? 'odd') === type;
              const typeLabel = t(`inspector.${type}`).replace(/^[✓✗⭐🔍↺🎲🔁]\s*/, '').toUpperCase();
              return (
                <button key={type}
                  onClick={() => {
                    if (!onProjectChange || !isVN) return;
                    const p = project as VNProject;
                    onProjectChange({ ...p, scenes: p.scenes.map((s: any) => s.id === node.id ? { ...s, ending_type: type } : s) });
                    setEndingMenuNodeId(null);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 12px', background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                    border: 'none', borderBottom: '1px solid #1e2d42',
                    color: '#e2e8f0', fontSize: 11, cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = isActive ? 'rgba(255,255,255,0.07)' : 'transparent')}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: optBg, flexShrink: 0, display: 'inline-block' }} />
                  {typeLabel} {t('canvas.badge_end')}
                  {isActive && <span style={{ marginLeft: 'auto', color: optBg }}>✓</span>}
                </button>
              );
            })}
          </div>
        );
      })()}
    </>
  );
});
