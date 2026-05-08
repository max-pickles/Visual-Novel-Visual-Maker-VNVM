import React from 'react';
import type { VNProject } from './types';

export const MAIN_MENU_ID = 'main_menu';

import { useCanvasStore, useShallow } from './store/canvasStore';
import { useTranslation } from './translationContext';

export interface CanvasContextMenuProps {
  displayNodes: any[];
  onEnterMainMenu?: () => void;
  onEditScene?: (id: string) => void;
  pushRecentScene: (id: string) => void;
  onGoScene?: (id: string) => void;
  project: any;
  onProjectChange?: (p: any) => void;
  handleDeleteSelected: () => void;
}

export function CanvasContextMenu(props: CanvasContextMenuProps) {
  const {
    displayNodes, onEnterMainMenu, onEditScene, pushRecentScene,
    onGoScene, project, onProjectChange, handleDeleteSelected
  } = props;

  const { ctxMenu, setCtxMenu, setRenamingId, setRenameVal, setIsConnectionMode, setTool } = useCanvasStore(useShallow(s => ({
    ctxMenu: s.ctxMenu, setCtxMenu: s.setCtxMenu,
    setRenamingId: s.setRenamingId, setRenameVal: s.setRenameVal,
    setIsConnectionMode: s.setIsConnectionMode, setTool: s.setTool,
  })));
  const closeCtxMenu = () => setCtxMenu(null);

  if (!ctxMenu) return null;

  const ctxNode = displayNodes.find(n => n.id === ctxMenu.nodeId);
  const isLocked = ctxNode?.isLocked ?? false;
  const isMainMenu = ctxMenu.nodeId === MAIN_MENU_ID;
  const isScene = ctxNode?.kind === 'vn_scene';
  const isStart = ctxNode?.isStart ?? false;
  const menuItems: Array<{ label: string; icon: string; action: () => void; disabled?: boolean; danger?: boolean }> = [];
  
  const { t } = useTranslation();

  if (isMainMenu) {
    menuItems.push({ icon: '🎨', label: t('canvas.enter_menu'), action: () => { onEnterMainMenu?.(); closeCtxMenu(); } });
  } else {
    if (onEditScene && isScene)
      menuItems.push({ icon: '✏️', label: t('canvas.ctx_open_scene'), action: () => { pushRecentScene(ctxMenu.nodeId); onEditScene(ctxMenu.nodeId); closeCtxMenu(); } });
    if (isScene)
      menuItems.push({ icon: '🔗', label: t('canvas.ctx_connect'), action: () => { setIsConnectionMode(true); setTool('pointer'); closeCtxMenu(); } });
    if (onGoScene)
      menuItems.push({ icon: '➡️', label: t('canvas.ctx_go_scene'), action: () => { onGoScene(ctxMenu.nodeId); closeCtxMenu(); } });
    if (isScene && onProjectChange)
      menuItems.push({ icon: '🚩', label: isStart ? t('canvas.ctx_already_start') : t('canvas.set_start'), action: () => { if (!isStart) { const p = project as VNProject; onProjectChange({ ...p, start: ctxMenu.nodeId }); } closeCtxMenu(); }, disabled: isStart });
    if (!isLocked)
      menuItems.push({ icon: '✏', label: t('canvas.ctx_rename'), action: () => { if (ctxNode) { setRenamingId(ctxMenu.nodeId); setRenameVal(ctxNode.label); } closeCtxMenu(); } });
    if (!isLocked)
      menuItems.push({ icon: '🗑️', label: t('canvas.ctx_delete'), action: () => { handleDeleteSelected(); closeCtxMenu(); }, danger: true });
  }
  
  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', left: ctxMenu.x, top: ctxMenu.y,
        zIndex: 50, minWidth: 190,
        background: 'var(--bg2)', border: '1px solid var(--bdr)',
        borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
        padding: '4px 0', overflow: 'hidden',
      }}
    >
      <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: '.08em', textTransform: 'uppercase', borderBottom: '1px solid var(--bdr)', marginBottom: 4 }}>
        {ctxNode?.label ?? t('editor.scene.scene')}
      </div>
      {menuItems.map((item, i) => (
        <button key={i}
          disabled={item.disabled}
          onClick={item.action}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', background: 'none', border: 'none',
            padding: '7px 14px', fontSize: 12, cursor: item.disabled ? 'default' : 'pointer',
            color: item.disabled ? 'var(--faint)' : item.danger ? 'var(--err)' : 'var(--text)',
            textAlign: 'left',
          }}
          onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
        >
          <span style={{ fontSize: 14 }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
