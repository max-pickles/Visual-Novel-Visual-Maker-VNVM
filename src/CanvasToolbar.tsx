import React, { useState, useRef, useEffect } from 'react';
import type { VNProject } from './types';
import { useCanvasStore, useShallow } from './store/canvasStore';
import { useTranslation } from './translationContext';

export const MAIN_MENU_ID = 'main_menu';

export interface CanvasToolbarProps {
  canvasRef: React.RefObject<HTMLDivElement>;
  displayNodes: any[];
  isVN: boolean;
  project: any;
  handleFitToScreen: () => void;
  handleAddScene: () => void;
  handleAddScreen: () => void;
  handleAddFolder: () => void;
  addStickyNote: () => void;
  handleAutoLayout: (mode?: 'vn' | 'sugiyama' | 'rpg' | 'auto') => 'vn' | 'sugiyama' | 'rpg' | void;
  onEditScene?: (id: string) => void;
  pushRecentScene: (id: string) => void;
  handleNodeDoubleClick: (id: string, kind: string, label: string) => void;
  handleDeleteSelected: () => void;
  handleSetStart: () => void;
  onGoScene?: (id: string) => void;
}

export function CanvasToolbar(props: CanvasToolbarProps) {
  const {
    canvasRef, displayNodes, isVN, project, handleFitToScreen,
    handleAddScene, handleAddScreen, handleAddFolder, addStickyNote,
    handleAutoLayout, onEditScene, pushRecentScene, handleNodeDoubleClick,
    handleDeleteSelected, handleSetStart, onGoScene
  } = props;

  const {
    folderStack, setFolderStack, setSelection, zoom, setZoom, setPan,
    search, setSearch, charFilter, setCharFilter, tool, setTool, selection,
    isConnectionMode, setIsConnectionMode, setCompositorKick, uiVisible, setUiVisible,
  } = useCanvasStore(useShallow(s => ({
    folderStack: s.folderStack, setFolderStack: s.setFolderStack,
    setSelection: s.setSelection, zoom: s.zoom, setZoom: s.setZoom, setPan: s.setPan,
    search: s.search, setSearch: s.setSearch, charFilter: s.charFilter, setCharFilter: s.setCharFilter,
    tool: s.tool, setTool: s.setTool, selection: s.selection,
    isConnectionMode: s.isConnectionMode, setIsConnectionMode: s.setIsConnectionMode,
    setCompositorKick: s.setCompositorKick, uiVisible: s.uiVisible, setUiVisible: s.setUiVisible,
  })));

  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [minZoomLimit, setMinZoomLimit] = useState(0.1);
  const [maxZoomLimit, setMaxZoomLimit] = useState(3.0);
  const [layoutMode, setLayoutMode] = useState<'vn' | 'sugiyama' | 'rpg'>('vn');
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // Close zoom menu when clicking outside
  useEffect(() => {
    if (!zoomMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setZoomMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [zoomMenuOpen]);

  return (
    <div style={{ flexShrink: 0, background: 'var(--bg2)', borderBottom: '1px solid var(--bdr)', zIndex: 10, overflow: 'visible', display: 'flex' }}>

      {/* ── Left fixed area: Back button & Zoom menu ── */}
      <div className="row gap8" style={{ padding: '6px 14px', flexWrap: 'nowrap', alignItems: 'center', flexShrink: 0, borderRight: '1px solid var(--bdr)' }}>
        {folderStack.length > 0 && (
          <button className="btn" onClick={() => { setFolderStack(folderStack.slice(0, -1)); setSelection(new Set()); }}>
            {t('canvas.back')}
          </button>
        )}

        {/* Zoom % → opens dropdown */}
        <div ref={zoomMenuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--mono)', flexShrink: 0, whiteSpace: 'nowrap', padding: '4px 8px' }}
            onClick={() => setZoomMenuOpen(v => !v)}
          >
            {t('canvas.zoom')}: {Math.round(zoom * 100)}% ▼
          </button>
          {zoomMenuOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 200,
              background: 'var(--bg2)', border: '1px solid var(--bdr)', borderRadius: 8,
              padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.65)', width: 230,
              display: 'flex', flexDirection: 'column', gap: 14
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--dim)', marginBottom: 6 }}>
                  <span>{t('canvas.zoom').toUpperCase()}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{Math.round(zoom * 100)}%</span>
                </div>
                <input type="range" min={minZoomLimit} max={maxZoomLimit} step={0.05} value={zoom}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    const rect = canvasRef.current?.getBoundingClientRect();
                    if (rect) {
                      const cx = rect.width / 2;
                      const cy = rect.height / 2;
                      setPan(p => ({ x: cx - (cx - p.x) * (v / zoom), y: cy - (cy - p.y) * (v / zoom) }));
                    }
                    setZoom(v);
                  }}
                  style={{ width: '100%', accentColor: 'var(--acc)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--dim)', marginBottom: 6 }}>
                  <span>{t('canvas.min_zoom')}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{Math.round(minZoomLimit * 100)}%</span>
                </div>
                <input type="range" min={0.05} max={1.0} step={0.05} value={minZoomLimit}
                  onChange={e => setMinZoomLimit(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--acc)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--dim)', marginBottom: 6 }}>
                  <span>{t('canvas.max_zoom')}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{Math.round(maxZoomLimit * 100)}%</span>
                </div>
                <input type="range" min={1.0} max={10.0} step={0.1} value={maxZoomLimit}
                  onChange={e => setMaxZoomLimit(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--acc)' }} />
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setZoomMenuOpen(false); }}>{t('canvas.reset_view')}</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right scrolling area: all tool buttons ── */}
      <div
        className="row gap8 hide-scrollbar"
        onWheel={e => { if (e.currentTarget) e.currentTarget.scrollLeft += e.deltaY; }}
        style={{ padding: '6px 14px', flexWrap: 'nowrap', alignItems: 'center', flex: 1, overflowX: 'auto', overflowY: 'hidden' }}
      >
        {/* GROUP 1: View */}
        <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={() => { handleFitToScreen(); setUiVisible(false); }}>{t('canvas.fit_all')}</button>

        {isVN && (
          <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={() => {
            const node = displayNodes.find(n => n.id === MAIN_MENU_ID);
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect || !node) return;
            const targetZoom = 3.0;
            setZoom(targetZoom);
            setPan({
              x: rect.width  / 2 - (node.x + node.w / 2) * targetZoom,
              y: rect.height / 2 - (node.y + node.h / 2) * targetZoom,
            });
            setSelection(new Set([MAIN_MENU_ID]));
          }}>{t('canvas.main_menu')}</button>
        )}

        {isVN && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--bdr)', flexShrink: 0, marginLeft: 4, marginRight: 4 }} />

            {/* GROUP 2: Interaction Tools */}
            <button
              className={`btn ${tool === 'pointer' ? 'active' : 'btn-ghost'}`}
              style={{ flexShrink: 0, ...(tool === 'pointer' ? { background: 'var(--acc2)', color: '#fff', borderColor: 'var(--acc2)' } : {}) }}
              onClick={() => setTool('pointer')}
            >{t('canvas.select')}</button>

            <button
              className={`btn ${tool === 'pan' ? 'active' : 'btn-ghost'}`}
              style={{ flexShrink: 0, ...(tool === 'pan' ? { background: 'var(--acc2)', color: '#fff', borderColor: 'var(--acc2)' } : {}) }}
              onClick={() => setTool('pan')}
            >{t('canvas.pan')}</button>

            {/* 🔗 Connector Mode — animated toggle slider */}
            <button
              className={`btn ${isConnectionMode ? 'active' : 'btn-ghost'}`}
              style={{
                flexShrink: 0,
                ...(isConnectionMode
                  ? { background: 'color-mix(in srgb, var(--acc) 10%, var(--bg2))', color: '#fff', borderColor: 'var(--acc)' }
                  : {})
              }}
              onClick={() => {
                setIsConnectionMode(prev => {
                  if (!prev && tool === 'pan') setTool('pointer');
                  return !prev;
                });
                setCompositorKick(prev => prev + 1);
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{t('canvas.connector_mode')}</span>
                <div style={{
                  width: 32, height: 18, borderRadius: 18,
                  background: isConnectionMode ? 'var(--acc)' : 'var(--bg0)',
                  border: `1px solid ${isConnectionMode ? 'var(--acc)' : 'var(--bdr)'}`,
                  position: 'relative', transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  display: 'flex', alignItems: 'center',
                  boxShadow: isConnectionMode ? 'inset 0 1px 3px rgba(0,0,0,0.2)' : 'none',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: '#fff', position: 'absolute',
                    left: isConnectionMode ? 15 : 1,
                    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }} />
                </div>
              </div>
            </button>

            <div style={{ width: 1, height: 20, background: 'var(--bdr)', flexShrink: 0, marginLeft: 4, marginRight: 4 }} />

            {/* GROUP 3: Creation */}
            <button className="btn btn-accent" style={{ flexShrink: 0 }} title="Create a new narrative scene" onClick={handleAddScene}>{t('canvas.add_scene')}</button>
            <button className="btn btn-ghost" style={{ flexShrink: 0, borderColor: '#22d3ee44', color: '#22d3ee' }} title="Create a new UI screen" onClick={handleAddScreen}>{t('canvas.add_screen')}</button>
            {folderStack.length === 0 && <button className="btn btn-ghost" style={{ flexShrink: 0 }} title="Create a new organizational folder" onClick={handleAddFolder}>{t('canvas.add_folder')}</button>}
            <button className="btn btn-ghost" style={{ flexShrink: 0 }} title="Add a sticky note to the canvas" onClick={addStickyNote}>{t('canvas.add_note')}</button>

            <div style={{ width: 1, height: 20, background: 'var(--bdr)', flexShrink: 0, marginLeft: 4, marginRight: 4 }} />



            {/* GROUP 5: Layout — button + mode selector */}
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <button
                className="btn btn-ghost"
                title="Automatically organize the canvas layout"
                style={{ flexShrink: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }}
                onClick={() => {
                  const determinedMode = handleAutoLayout('auto');
                  if (determinedMode) setLayoutMode(determinedMode);
                }}
              >{t('canvas.auto_layout')}</button>
              <select
                className="btn btn-ghost"
                title="Select a specific layout algorithm"
                style={{ flexShrink: 0, paddingRight: 8, cursor: 'pointer', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                value={layoutMode}
                onChange={e => {
                  const mode = e.target.value as typeof layoutMode;
                  setLayoutMode(mode);
                  handleAutoLayout(mode);
                }}
              >
                <option value="vn">{t('canvas.layout_vn')}</option>
                <option value="sugiyama">{t('canvas.layout_sugiyama')}</option>
                <option value="rpg">{t('canvas.layout_rpg')}</option>
              </select>
            </div>

            {/* Character filter */}
            {(() => {
              const p = project as VNProject;
              const chars = p.characters ?? [];
              if (chars.length === 0) return null;
              return (
                <select value={charFilter} onChange={e => setCharFilter(e.target.value)}
                  style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--bg2)', border: '1px solid var(--bdr)', color: 'var(--dim)', flexShrink: 0, cursor: 'pointer' }}>
                  <option value="">{t('canvas.all_chars')}</option>
                  {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              );
            })()}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Search — right-aligned */}
        <input className="input" placeholder={t('canvas.search_nodes')} value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            const lower = search.toLowerCase();
            const matches = displayNodes.filter(n => n.label.toLowerCase().includes(lower));
            if (matches.length === 1) {
              const n = matches[0];
              const rect = canvasRef.current?.getBoundingClientRect();
              if (!rect) return;
              setZoom(1);
              setPan({ x: rect.width / 2 - (n.x + n.w / 2), y: rect.height / 2 - (n.y + n.h / 2) });
              setSelection(new Set([n.id]));
            }
          }}
          style={{ width: 200, flexShrink: 0 }} />
      </div>
    </div>
  );
}
