/**
 * StoryCanvas.tsx — Visual node graph viewer + folder support.
 * Renders both VNProject (new) and RpyProject (legacy).
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { RpyProject, VNProject, NodeKind, LinkType, VNStickyNote } from './types';
import { newScene } from './types';
import { convertFileSrc } from "@tauri-apps/api/core";
import { GraphInspector } from "./GraphInspector";
import { Minimap } from "./Minimap";
import { CanvasNavControls } from "./CanvasNavControls";
import { StickyNote } from "./StickyNote";
import { useThumbnail } from "./useThumbnail";
import { computeSceneBgs } from "./sceneGraphUtils";
import { MainMenuThumbnail } from "./MainMenuEditor";
import { CanvasToolbar } from "./CanvasToolbar";
import { NodeLayer } from "./NodeLayer";
import { ConnectionLayer, CanvasLink, VNLinkKind } from "./ConnectionLayer";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { useCanvasStore, useShallow } from "./store/canvasStore";
import { useTranslation } from './translationContext';
import { useCanvasData } from "./hooks/useCanvasData";
import { useAutoLayout } from "./hooks/useAutoLayout";

export const MAIN_MENU_ID = "main_menu";


// ── Fuzzy BG thumbnail resolver ───────────────────────────────────────────────
const EXTS = [".png", ".jpg", ".jpeg", ".webp"];
function bgCandidates(rootPath: string, name: string): string[] {
  if (!name || !rootPath) return [];
  const norm = name.replace(/\s+/g, "_");
  const urls: string[] = [];
  for (const base of [name, norm]) {
    if (/\.[a-zA-Z]{2,5}$/.test(base)) {
      // Already has extension — try direct, game/images/, and images/ prefixes
      urls.push(convertFileSrc(`${rootPath}/${base}`));
      if (!base.startsWith('game/')) urls.push(convertFileSrc(`${rootPath}/game/images/${base}`));
      if (!base.startsWith('images/')) urls.push(convertFileSrc(`${rootPath}/images/${base}`));
    } else {
      // No extension — try all combos of prefix + extension
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
  React.useEffect(() => { setIdx(0); setDead(false); }, [list.join("|")]); // eslint-disable-line
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


// ─── Colors & Constants ───────────────────────────────────────────────────────

const NODE_COLORS: Record<NodeKind, string> = {
  label: '#4b6cf7', menu: '#f472b6',
  init: '#facc15', screen: '#4b6cf7', unknown: '#9ca3af'
};

const ZOOM_MIN = 0.1, ZOOM_MAX = 5.0, LOD_THRESHOLD = 0.3;
const TILE_SIZE = 100;
const FOLDER_COLOR = '#d4961e'; // Amber for folders

// Ending type cycle order — used by the badge popover
const ENDING_CYCLE: Array<'good' | 'bad' | 'odd' | 'stuck'> = ['good', 'bad', 'odd', 'stuck'];



// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  project: RpyProject | VNProject;
  /** Only available for VNProject */
  onProjectChange?: (p: VNProject) => void;
  rootPath?: string;
  onNodePositionsChange: (positions: Record<string, [number, number]>) => void;
  initialPositions?: Record<string, [number, number]>;
  onEditScene?: (id: string) => void;
  onGoScene?: (id: string) => void;
  /** Set by QuickOpen to fly the canvas to a specific scene */
  flyToSceneId?: string | null;
  onFlyToComplete?: () => void;
  /** Called when user clicks 'Enter Editor' on the main_menu node */
  onEnterMainMenu?: () => void;
  onPlayScene?: (id: string) => void;
}

// ─── Unified Node/Link Types ─────────────────────────────────────────────────

interface CanvasNode {
  id: string; label: string; kind: NodeKind | 'folder' | 'vn_scene';
  x: number; y: number; w: number; h: number;
  contentLines: string[]; bgImage?: string; isStart?: boolean; isEnd?: boolean;
  /** Structural role badges from in/out degree analysis */
  inDegree?: number; outDegree?: number; isUnreachable?: boolean;
  /** Cannot be deleted or renamed — reserved system nodes like main_menu */
  isLocked?: boolean;
  /** Ending classification for terminal scenes */
  endingType?: 'good' | 'bad' | 'odd' | 'stuck';
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StoryCanvas({ project, onProjectChange, rootPath, onNodePositionsChange, initialPositions = {}, onEditScene, onGoScene, flyToSceneId, onFlyToComplete, onEnterMainMenu }: Props) {
  // State from global store
  const {
    charFilter, pan, setPan, zoom, setZoom,
    positions, setPositions,
    selection, setSelection,
    folderStack, setFolderStack,
    search, setSearch,
    renamingId, setRenamingId,
    renameVal, setRenameVal,
    tool, setTool,
    recentSceneIds, setRecentSceneIds,
    showRecent, setShowRecent,
    ctxMenu, setCtxMenu,
    inspectorPos, setInspectorPos,
    inspectorSide, setInspectorSide,
    displayedSide, setDisplayedSide,
    panelExiting, setPanelExiting,
    isConnectionMode, setIsConnectionMode,
    armedConnectionNode, setArmedConnectionNode,
    connMenu, setConnMenu,
    hoverTargetId, setHoverTargetId,
    compositorKick, setCompositorKick,
    endingMenuNodeId, setEndingMenuNodeId,
    uiVisible, setUiVisible,
    triggerFitAll,
  } = useCanvasStore(useShallow((s) => ({
    charFilter: s.charFilter, pan: s.pan, setPan: s.setPan, zoom: s.zoom, setZoom: s.setZoom,
    positions: s.positions, setPositions: s.setPositions,
    selection: s.selection, setSelection: s.setSelection,
    folderStack: s.folderStack, setFolderStack: s.setFolderStack,
    search: s.search, setSearch: s.setSearch,
    renamingId: s.renamingId, setRenamingId: s.setRenamingId,
    renameVal: s.renameVal, setRenameVal: s.setRenameVal,
    tool: s.tool, setTool: s.setTool,
    recentSceneIds: s.recentSceneIds, setRecentSceneIds: s.setRecentSceneIds,
    showRecent: s.showRecent, setShowRecent: s.setShowRecent,
    ctxMenu: s.ctxMenu, setCtxMenu: s.setCtxMenu,
    inspectorPos: s.inspectorPos, setInspectorPos: s.setInspectorPos,
    inspectorSide: s.inspectorSide, setInspectorSide: s.setInspectorSide,
    displayedSide: s.displayedSide, setDisplayedSide: s.setDisplayedSide,
    panelExiting: s.panelExiting, setPanelExiting: s.setPanelExiting,
    isConnectionMode: s.isConnectionMode, setIsConnectionMode: s.setIsConnectionMode,
    armedConnectionNode: s.armedConnectionNode, setArmedConnectionNode: s.setArmedConnectionNode,
    connMenu: s.connMenu, setConnMenu: s.setConnMenu,
    hoverTargetId: s.hoverTargetId, setHoverTargetId: s.setHoverTargetId,
    compositorKick: s.compositorKick, setCompositorKick: s.setCompositorKick,
    endingMenuNodeId: s.endingMenuNodeId, setEndingMenuNodeId: s.setEndingMenuNodeId,
    uiVisible: s.uiVisible, setUiVisible: s.setUiVisible,
    triggerFitAll: s.triggerFitAll,
  })));

  const { t } = useTranslation();

  const closeCtxMenu = useCallback(() => setCtxMenu(null), [setCtxMenu]);

  // ─── Delayed unmount state for inspector ──────────────────────────────────────────
  const prevSelectionRef = useRef<Set<string>>(selection);
  const [isExitingSelection, setIsExitingSelection] = useState(false);

  useEffect(() => {
    if (selection.size > 0) {
      prevSelectionRef.current = selection;
      setIsExitingSelection(false);
    } else if (prevSelectionRef.current.size > 0) {
      setIsExitingSelection(true);
      const timer = setTimeout(() => {
        setIsExitingSelection(false);
        prevSelectionRef.current = new Set();
      }, 440);
      return () => clearTimeout(timer);
    }
  }, [selection]);

  const activeSelection = selection.size > 0 ? selection : prevSelectionRef.current;

  // Removed redundant initialPositions effect — displayNodes correctly falls back to p.layout
  const inspectorDragRef = useRef<{ startX: number; startY: number; startPX: number; startPY: number } | null>(null);
  const panelTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushRecentScene = useCallback((id: string) => {
    setRecentSceneIds(prev => {
      const next = [id, ...prev.filter(x => x !== id)].slice(0, 5);
      localStorage.setItem("vnv_recent_scenes", JSON.stringify(next));
      return next;
    });
  }, []);

  const handleInspectorDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>, posX: number, posY: number) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    // Use the computed display position (not raw inspectorPos which may be -1)
    inspectorDragRef.current = { startX: posX, startY: posY, startPX: e.clientX, startPY: e.clientY };
  }, []);

  const handleInspectorDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!inspectorDragRef.current) return;
    const { startX, startY, startPX, startPY } = inspectorDragRef.current;
    setInspectorPos({ x: startX + e.clientX - startPX, y: startY + e.clientY - startPY });
  }, []);

  const handleInspectorDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    inspectorDragRef.current = null;
  }, []);

  // Sequence exit → enter when the target side changes
  useEffect(() => {
    if (displayedSide === inspectorSide) return;
    setPanelExiting(true);
    if (panelTransitionRef.current) clearTimeout(panelTransitionRef.current);
    panelTransitionRef.current = setTimeout(() => {
      setDisplayedSide(inspectorSide);
      setInspectorPos({ x: -1, y: -1 }); // reset drag pos for new side
      setPanelExiting(false);
    }, 440);
    return () => { if (panelTransitionRef.current) clearTimeout(panelTransitionRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorSide]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef = useRef(pan);
  useEffect(() => { panRef.current = pan; }, [pan]);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const hoverTargetIdRef = useRef<string | null>(null);
  const setConnMenuRef = useRef(setConnMenu);
  useEffect(() => { setConnMenuRef.current = setConnMenu; }, [setConnMenu]);
  const displayNodesRef = useRef<any[]>([]);
  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; }, [project]);
  const onProjectChangeRef = useRef(onProjectChange);
  useEffect(() => { onProjectChangeRef.current = onProjectChange; }, [onProjectChange]);
  const isVNRef = useRef('scenes' in project);
  useEffect(() => { isVNRef.current = 'scenes' in project; }, [project]);
  const setIsConnectionModeRef = useRef(setIsConnectionMode);
  useEffect(() => { setIsConnectionModeRef.current = setIsConnectionMode; }, [setIsConnectionMode]);

  const isDraggingNode = useRef(false);
  const isDraggingSticky = useRef<string | null>(null);
  const stickyDragStart = useRef<{ px: number; py: number; ox: number; oy: number }>({ px: 0, py: 0, ox: 0, oy: 0 });
  const isPanning = useRef(false);
  const isLasso        = useRef(false);
  const lassoStart     = useRef<{ x: number; y: number } | null>(null);
  // GPU-only marquee — rect tracked in ref, DOM updated directly (Twine: no React state per pixel)
  const lassoRectRef   = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const lassoElemRef   = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  // RAF-throttled drag — capped at 60fps, edges stay live (no CSS-var cascade lag)
  const dragStartPos     = useRef<Record<string, [number, number]>>({});
  const selectionRef     = useRef<Set<string>>(selection);
  const rafRef           = useRef<number | null>(null);
  const pendingDrag      = useRef({ dx: 0, dy: 0 });
  const dragMouseStart   = useRef<{ x: number; y: number } | null>(null);
  const panStart         = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null);
  // Suppress spurious selection event right after drag ends (Twine: recentlyDragging)
  const recentlyDragging = useRef(false);
  // Compact card mode — only toggle LOD at end of zoom transition, not mid-zoom
  const [compactCards,  setCompactCards] = useState(zoom <= LOD_THRESHOLD);
  const prevZoomRef      = useRef(zoom);

  // Track canvas container size for minimap
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setCanvasSize({ width, height });
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  // Keep selectionRef in sync so RAF closure always has fresh selection
  useEffect(() => { selectionRef.current = selection; }, [selection]);

  // Compact card mode: only switch LOD when zoom is stable (not mid-animation)
  useEffect(() => {
    if (zoom !== prevZoomRef.current) {
      prevZoomRef.current = zoom;
      setCompactCards(zoom <= LOD_THRESHOLD);
    }
  }, [zoom]);



  const dragLineRef = useRef<SVGPathElement>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const placingGhostRef = useRef<HTMLDivElement>(null);
  const [placingNodeType, setPlacingNodeType] = useState<'scene' | 'screen' | null>(null);
  
  const [suppressAnim, setSuppressAnim] = useState(true);
  
  const [choiceBuilder, setChoiceBuilder] = useState<{
    sourceNodeId: string;
    screenX: number;
    screenY: number;
    canvasX: number;
    canvasY: number;
    prompt: string;
    options: { id: string; text: string; sceneId: string | null }[];
  } | null>(null);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      
      // Ignore if user is typing in an input field
      if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        setIsConnectionMode(prev => !prev);
        setCompositorKick(prev => prev + 1);
      }

      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setUiVisible(!uiVisible);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setIsConnectionMode, setCompositorKick, setUiVisible, uiVisible]);


  // ─── Unified Data Model (via hook) ──────────────────────────────────────────
  const { nodes, links, displayNodes: rawDisplayNodes, isVN } = useCanvasData({ project, rootPath });

  // Merge external position overrides into nodes
  const displayNodes = useMemo(() => {
    return rawDisplayNodes.map(n => {
      const pos = positions[n.id];
      if (pos) return { ...n, x: pos[0], y: pos[1] };
      return n;
    });
  }, [rawDisplayNodes, positions]);

  useEffect(() => { displayNodesRef.current = displayNodes; }, [displayNodes]);

  const applyConnection = useCallback((type: 'jump' | 'choice' | 'call') => {
    if (!connMenu) return;
    const { sourceNode, targetNodeId, cx, cy } = connMenu;
    const p = projectRef.current as any;
    const newLayout: Record<string, [number, number]> = { ...(p.layout ?? {}) };
    let newSc: ReturnType<typeof newScene> | null = null;
    let finalTargetId = targetNodeId;
    if (type === 'choice') {
       setChoiceBuilder({
          sourceNodeId: sourceNode.id,
          screenX: connMenu.x,
          screenY: connMenu.y,
          canvasX: cx,
          canvasY: cy,
          prompt: 'Select an option...',
          options: [{ 
            id: crypto.randomUUID().slice(0, 8), 
            text: 'Option 1', 
            sceneId: targetNodeId || '__NEW__' 
          }]
       });
       if (dragLineRef.current) dragLineRef.current.style.display = 'none';
       if (dragGhostRef.current) dragGhostRef.current.style.display = 'none';
       setConnMenu(null);
       return;
    }

    if (!finalTargetId) {
       newSc = newScene(`Scene ${p.scenes.length + 1}`);
       if (type === 'call') newSc.scene_type = 'screen';
       finalTargetId = newSc.id;
       newLayout[newSc.id] = [cx, cy - 55];
    }
    
    let eventToAdd: any = null;
    if (type === 'jump') {
       eventToAdd = { id: crypto.randomUUID().slice(0, 8), type: 'jump', scene_id: finalTargetId };
    } else if (type === 'call') {
       const targetLabel = targetNodeId ? (p.scenes.find((s: any) => s.id === targetNodeId)?.label || 'screen_name') : (newSc?.label || 'screen_name');
       eventToAdd = { id: crypto.randomUUID().slice(0, 8), type: 'raw', raw_code: `call screen ${targetLabel}` };
    }
    
    const updatedScenes = p.scenes.map((s: any) => {
       if (s.id === sourceNode.id) {
         return { ...s, events: [...s.events, eventToAdd] };
       }
       return s;
    });
    
    if (newSc) {
       updatedScenes.push(newSc);
    }
    
    onProjectChangeRef.current?.({ ...p, scenes: updatedScenes, layout: newLayout });
    
    if (newSc) {
       setPositions(newLayout);
       setSelection(new Set([newSc.id]));
       setRenamingId(newSc.id);
       setRenameVal(newSc.label);
    }
    
    if (dragLineRef.current) dragLineRef.current.style.display = 'none';
    if (dragGhostRef.current) dragGhostRef.current.style.display = 'none';
    setConnMenu(null);
    setIsConnectionMode(false);
  }, [connMenu, setPositions, setSelection, setRenamingId, setRenameVal, setIsConnectionMode, setConnMenu]);

  const handleConnectionDragStart = useCallback((node: any) => (e: React.PointerEvent) => {
    if (e.button === 1 || tool === 'pan') return;
    e.stopPropagation();
    e.preventDefault();

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    
    const startX = node.x + node.w;
    const startY = node.y + node.h / 2;

    const ac = new AbortController();
    const onMove = (me: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || !dragLineRef.current) return;
      const cx = (me.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const cy = (me.clientY - rect.top - panRef.current.y) / zoomRef.current;
      
      const cp = Math.max(60, Math.abs(cx - startX) * 0.5);
      dragLineRef.current.setAttribute('d', `M${startX},${startY} C${startX + cp},${startY} ${cx - cp},${cy} ${cx},${cy}`);
      dragLineRef.current.style.display = 'block';

      if (dragGhostRef.current) {
        const dist = Math.sqrt(Math.pow(cx - startX, 2) + Math.pow(cy - startY, 2));
        const currentNodes = displayNodesRef.current;
        let hoveringNode = false;
        let newHoverTargetId: string | null = null;
        for (let i = currentNodes.length - 1; i >= 0; i--) {
          const n = currentNodes[i];
          if (n.id !== node.id && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h) {
            hoveringNode = true;
            newHoverTargetId = n.id;
            break;
          }
        }
        if (hoverTargetIdRef.current !== newHoverTargetId) {
          hoverTargetIdRef.current = newHoverTargetId;
          setHoverTargetId(newHoverTargetId);
        }
        if (dist > 100 && !hoveringNode) {
          dragGhostRef.current.style.display = 'flex';
          dragGhostRef.current.style.transform = `translate(${cx}px, ${cy - 55}px)`;
        } else {
          dragGhostRef.current.style.display = 'none';
        }
      }
    };

    const onUp = (me: PointerEvent) => {
      ac.abort();
      if (hoverTargetIdRef.current !== null) {
        hoverTargetIdRef.current = null;
        setHoverTargetId(null);
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = (me.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const cy = (me.clientY - rect.top - panRef.current.y) / zoomRef.current;

      const currentNodes = displayNodesRef.current;
      let targetNodeId: string | null = null;
      for (let i = currentNodes.length - 1; i >= 0; i--) {
        const n = currentNodes[i];
        if (n.id !== node.id && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h) {
          targetNodeId = n.id;
          break;
        }
      }

      if (!onProjectChangeRef.current || !isVNRef.current) return;

      const menuX = me.clientX - rect.left;
      const menuY = me.clientY - rect.top;

      if (cx >= node.x && cx <= node.x + node.w && cy >= node.y && cy <= node.y + node.h) {
          setIsConnectionModeRef.current(false);
          if (dragLineRef.current) dragLineRef.current.style.display = 'none';
          if (dragGhostRef.current) dragGhostRef.current.style.display = 'none';
          return;
      }

      if (targetNodeId) {
        if (dragGhostRef.current) dragGhostRef.current.style.display = 'none';
        setConnMenuRef.current({ x: menuX, y: menuY, sourceNode: node, targetNodeId, cx, cy });
      } else {
        const dist = Math.sqrt(Math.pow(cx - startX, 2) + Math.pow(cy - startY, 2));
        if (dist > 100) {
          setConnMenuRef.current({ x: menuX, y: menuY, sourceNode: node, targetNodeId: null, cx, cy });
        } else {
          setArmedConnectionNode(node);
        }
      }
    };

    window.addEventListener('pointermove', onMove, { signal: ac.signal });
    window.addEventListener('pointerup',   onUp,   { signal: ac.signal });
  }, [tool, setHoverTargetId, setArmedConnectionNode]);

  useEffect(() => {
    if (!armedConnectionNode) return;
    const ac = new AbortController();
    const node = armedConnectionNode;
    const startX = node.x + node.w;
    const startY = node.y + node.h / 2;

    const onMove = (me: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || !dragLineRef.current) return;
      const cx = (me.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const cy = (me.clientY - rect.top - panRef.current.y) / zoomRef.current;
      
      const cp = Math.max(60, Math.abs(cx - startX) * 0.5);
      dragLineRef.current.setAttribute('d', `M${startX},${startY} C${startX + cp},${startY} ${cx - cp},${cy} ${cx},${cy}`);
      dragLineRef.current.style.display = 'block';

      if (dragGhostRef.current) {
        const dist = Math.sqrt(Math.pow(cx - startX, 2) + Math.pow(cy - startY, 2));
        const currentNodes = displayNodesRef.current;
        let hoveringNode = false;
        let newHoverTargetId: string | null = null;
        for (let i = currentNodes.length - 1; i >= 0; i--) {
          const n = currentNodes[i];
          if (n.id !== node.id && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h) {
            hoveringNode = true;
            newHoverTargetId = n.id;
            break;
          }
        }
        if (hoverTargetIdRef.current !== newHoverTargetId) {
          hoverTargetIdRef.current = newHoverTargetId;
          setHoverTargetId(newHoverTargetId);
        }
        if (dist > 100 && !hoveringNode) {
          dragGhostRef.current.style.display = 'flex';
          dragGhostRef.current.style.transform = `translate(${cx}px, ${cy - 55}px)`;
        } else {
          dragGhostRef.current.style.display = 'none';
        }
      }
    };

    const onClick = (me: MouseEvent) => {
      me.stopPropagation();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = (me.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const cy = (me.clientY - rect.top - panRef.current.y) / zoomRef.current;

      const currentNodes = displayNodesRef.current;
      let targetNodeId: string | null = null;
      for (let i = currentNodes.length - 1; i >= 0; i--) {
        const n = currentNodes[i];
        if (n.id !== node.id && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h) {
          targetNodeId = n.id;
          break;
        }
      }
      
      const menuX = me.clientX - rect.left;
      const menuY = me.clientY - rect.top;

      if (cx >= node.x && cx <= node.x + node.w && cy >= node.y && cy <= node.y + node.h) {
        setArmedConnectionNode(null);
        if (dragLineRef.current) dragLineRef.current.style.display = 'none';
        if (dragGhostRef.current) dragGhostRef.current.style.display = 'none';
        if (hoverTargetIdRef.current !== null) setHoverTargetId(null);
        return;
      }

      setArmedConnectionNode(null);
      if (hoverTargetIdRef.current !== null) setHoverTargetId(null);

      if (targetNodeId) {
        if (dragGhostRef.current) dragGhostRef.current.style.display = 'none';
        setConnMenuRef.current({ x: menuX, y: menuY, sourceNode: node, targetNodeId, cx, cy });
      } else {
        const dist = Math.sqrt(Math.pow(cx - startX, 2) + Math.pow(cy - startY, 2));
        if (dist > 100) {
          setConnMenuRef.current({ x: menuX, y: menuY, sourceNode: node, targetNodeId: null, cx, cy });
        } else {
          if (dragLineRef.current) dragLineRef.current.style.display = 'none';
          if (dragGhostRef.current) dragGhostRef.current.style.display = 'none';
        }
      }
    };

    window.addEventListener('pointermove', onMove, { signal: ac.signal });
    window.addEventListener('click', onClick, { signal: ac.signal, capture: true });

    return () => ac.abort();
  }, [armedConnectionNode, setHoverTargetId, setArmedConnectionNode]);

  const handleStickyDragStart = useCallback((note: any) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    if (tool === 'pan') return;
    e.stopPropagation();
    isDraggingSticky.current = note.id;
    stickyDragStart.current = { px: e.clientX, py: e.clientY, ox: note.x, oy: note.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const ac = new AbortController();
    const onMove = (me: PointerEvent) => {
      if (isDraggingSticky.current !== note.id) return;
      const dx = (me.clientX - stickyDragStart.current.px) / zoomRef.current;
      const dy = (me.clientY - stickyDragStart.current.py) / zoomRef.current;
      if (!onProjectChangeRef.current || !isVNRef.current) return;
      const p = projectRef.current as any;
      onProjectChangeRef.current({
        ...p,
        sticky_notes: (p.sticky_notes ?? []).map((n: any) =>
          n.id === note.id ? { ...n, x: stickyDragStart.current.ox + dx, y: stickyDragStart.current.oy + dy } : n
        ),
      });
    };
    const onUp = () => {
      isDraggingSticky.current = null;
      ac.abort();
    };
    window.addEventListener('pointermove', onMove, { signal: ac.signal });
    window.addEventListener('pointerup',   onUp,   { signal: ac.signal });
  }, [tool]);

  // ─── Interaction Handlers ───────────────────────────────────────────────────

  const handleWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Smooth zoom based on deltaY
    const zoomDelta = Math.exp(-e.deltaY * 0.005);
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * zoomDelta));
    
    setPan({
      x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
      y: mouseY - (mouseY - pan.y) * (newZoom / zoom)
    });
    setZoom(newZoom);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (placingNodeType) {
      if (e.button === 2) {
        // Right click to cancel
        setPlacingNodeType(null);
        if (placingGhostRef.current) placingGhostRef.current.style.display = 'none';
        return;
      }
      if (e.button === 0) {
        // Place the node
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = (e.clientX - rect.left - pan.x) / zoom;
        const cy = (e.clientY - rect.top - pan.y) / zoom;
        
        const p = project as VNProject;
        let sc;
        if (placingNodeType === 'scene') {
          sc = newScene(`Scene ${p.scenes.length + 1}`);
        } else {
          const screenCount = p.scenes.filter(s => s.scene_type === 'screen').length;
          sc = { ...newScene(`Screen ${screenCount + 1}`), scene_type: 'screen' as const };
        }
        
        const updated = {
          ...p,
          scenes: [...p.scenes, sc],
          layout: { ...p.layout, [sc.id]: [cx, cy] as [number, number] }
        };
        if (onProjectChange) onProjectChange(updated);
        setPositions(updated.layout);
        setSelection(new Set([sc.id]));
        
        setPlacingNodeType(null);
        if (placingGhostRef.current) placingGhostRef.current.style.display = 'none';
        return;
      }
    }

    const isPanAction = e.button === 1 || tool === 'pan' || (!e.shiftKey && e.button === 0 && tool !== 'pointer');
    if (!isPanAction && (e.target as HTMLElement).closest('.node-card')) return;
    
    if (isPanAction) {
      isPanning.current = true;
      panStart.current = { cx: e.clientX, cy: e.clientY, px: pan.x, py: pan.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (e.button === 0 && tool === 'pointer') {
      isLasso.current = true;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = (e.clientX - rect.left - pan.x) / zoom;
      const cy = (e.clientY - rect.top - pan.y) / zoom;
      lassoStart.current = { x: cx, y: cy };
      lassoRectRef.current = { x: cx, y: cy, w: 0, h: 0 };
      // GPU marquee: reset to invisible (Twine: scale 0 so layout isn't affected)
      if (lassoElemRef.current) lassoElemRef.current.style.transform = 'translate(-10000px,-10000px) scale(0,0)';
      e.currentTarget.setPointerCapture(e.pointerId);
      if (!e.shiftKey && !e.ctrlKey) setSelection(new Set());
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (placingNodeType && placingGhostRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = (e.clientX - rect.left - pan.x) / zoom;
      const cy = (e.clientY - rect.top - pan.y) / zoom;
      placingGhostRef.current.style.display = 'flex';
      placingGhostRef.current.style.transform = `translate(${cx}px, ${cy}px)`;
      // Continue allowing pan if holding middle mouse, otherwise return
      if (!isPanning.current) return;
    }

    if (isPanning.current && panStart.current) {
      const dx = e.clientX - panStart.current.cx;
      const dy = e.clientY - panStart.current.cy;
      setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
    } else if (isLasso.current && lassoStart.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = (e.clientX - rect.left - pan.x) / zoom;
      const cy = (e.clientY - rect.top - pan.y) / zoom;
      const sx = lassoStart.current.x;
      const sy = lassoStart.current.y;
      const x = Math.min(cx, sx); const y = Math.min(cy, sy);
      const w = Math.abs(cx - sx); const h = Math.abs(cy - sy);
      lassoRectRef.current = { x, y, w, h };
      // Direct pixel dimensions — border stays exactly 2px at any size (no scale distortion)
      if (lassoElemRef.current) {
        const el = lassoElemRef.current;
        el.style.display  = 'block';
        el.style.left     = `${x}px`;
        el.style.top      = `${y}px`;
        el.style.width    = `${Math.max(w, 1)}px`;
        el.style.height   = `${Math.max(h, 1)}px`;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false;
      panStart.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    } else if (isLasso.current) {
      isLasso.current = false;
      const lr = lassoRectRef.current;
      if (lr && lr.w > 2 && lr.h > 2) {
        const sel = new Set<string>();
        displayNodes.forEach(n => {
          if (n.x < lr.x + lr.w && n.x + n.w > lr.x && n.y < lr.y + lr.h && n.y + n.h > lr.y)
            sel.add(n.id);
        });
        if (!e.shiftKey && !e.ctrlKey) setSelection(sel);
        else setSelection(prev => new Set([...prev, ...sel]));
      }
      lassoRectRef.current = null;
      if (lassoElemRef.current) lassoElemRef.current.style.display = 'none';
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button === 1 || tool === 'pan') return;
    e.stopPropagation();

    if (placingNodeType) {
      setPlacingNodeType(null);
      if (placingGhostRef.current) placingGhostRef.current.style.display = 'none';
    }

    // Auto-reveal UI if a node is clicked with the select tool
    if (!uiVisible && tool === 'pointer') {
      setUiVisible(true);
    }
    
    let nextSelection = selection;
    // Twine: recentlyDragging guard — suppress the spurious select that fires after a drag
    if (!recentlyDragging.current) {
      if (!selection.has(id)) {
        if (e.shiftKey || e.ctrlKey) {
          nextSelection = new Set([...selection, id]);
          setSelection(nextSelection);
        } else {
          nextSelection = new Set([id]);
          setSelection(nextSelection);
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            const clickedRight = e.clientX - rect.left > rect.width / 2;
            setInspectorSide(clickedRight ? 'left' : 'right');
          }
        }
      }
    }
    
    // Record start positions for CSS-var drag (Twine: no re-render per pixel)
    dragStartPos.current = {};
    nextSelection.forEach(selId => {
      const pos = positions[selId];
      if (pos) {
        dragStartPos.current[selId] = [pos[0], pos[1]];
      } else {
        const n = displayNodes.find(dn => dn.id === selId);
        if (n) dragStartPos.current[selId] = [n.x, n.y];
      }
    });
    pendingDrag.current = { dx: 0, dy: 0 };
    dragMouseStart.current = { x: e.clientX, y: e.clientY };
    isDraggingNode.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleNodePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingNode.current || !dragMouseStart.current) return;
    
    // Absolute delta tracking completely immune to the e.movementX pointerCapture bug
    const dx = (e.clientX - dragMouseStart.current.x) / zoom;
    const dy = (e.clientY - dragMouseStart.current.y) / zoom;
    
    pendingDrag.current.dx = dx;
    pendingDrag.current.dy = dy;

    // RAF-throttle: batch all pointer events in one frame into a single setState
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      const { dx, dy } = pendingDrag.current;
      setPositions(prev => {
        const next = { ...prev };
        Object.keys(dragStartPos.current).forEach(id => {
          const base = dragStartPos.current[id];
          next[id] = [base[0] + dx, base[1] + dy];
        });
        return next;
      });
      rafRef.current = null;
    });
  };

  const handleNodePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingNode.current) return;
    isDraggingNode.current = false;
    dragMouseStart.current = null;
    // Cancel any pending RAF
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    e.currentTarget.releasePointerCapture(e.pointerId);
    const { dx, dy } = pendingDrag.current;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      const next: Record<string, [number, number]> = {};
      Object.keys(dragStartPos.current).forEach(id => {
        const base = dragStartPos.current[id];
        next[id] = [base[0] + dx, base[1] + dy];
      });
      setPositions(prev => ({ ...prev, ...next }));
      
      const p = projectRef.current as any;
      if (p && p.layout) {
        onNodePositionsChange({ ...p.layout, ...next });
      } else {
        onNodePositionsChange(next);
      }
    }
    // Twine: briefly suppress the onSelect that fires right after a drag ends
    recentlyDragging.current = true;
    window.setTimeout(() => { recentlyDragging.current = false; }, 0);
  };

  const handleNodeDoubleClick = (id: string, kind: string, label: string) => {
    if (kind === 'folder') {
      setFolderStack([...folderStack, id]);
      setSelection(new Set());
    } else if (isVN) {
      setRenamingId(id);
      setRenameVal(label);
    }
  };

  const finishRename = () => {
    if (!renamingId || !onProjectChange || !isVN) return;
    const p = project as VNProject;
    const updated = {
      ...p,
      scenes: p.scenes.map(s => s.id === renamingId ? { ...s, label: renameVal || s.label } : s),
      folders: p.folders.map(f => f.id === renamingId ? { ...f, label: renameVal || f.label } : f),
    };
    onProjectChange(updated);
    setRenamingId(null);
  };

  // ─── New Toolbar Actions ────────────────────────────────────────────────────
  
  const handleAddScene = () => setPlacingNodeType('scene');
  const handleAddScreen = () => setPlacingNodeType('screen');

  const handleAddFolder = () => {
    if (!onProjectChange || !isVN) return;
    const p = project as VNProject;
    const cx = Math.max(0, -pan.x / zoom) + 100;
    const cy = Math.max(0, -pan.y / zoom) + 100;
    const fldId = Math.random().toString(36).slice(2, 10);
    const updated = {
      ...p,
      folders: [...p.folders, { id: fldId, label: `Folder ${p.folders.length + 1}`, x: cx, y: cy, scene_ids: [] }]
    };
    onProjectChange(updated);
  };

  const handleDeleteSelected = () => {
    if (!onProjectChange || !isVN || selection.size === 0) return;
    // Main menu node is locked — exclude it from deletion silently
    const deletable = new Set([...selection].filter(id => id !== MAIN_MENU_ID));
    if (deletable.size === 0) return;
    const p = project as VNProject;
    const updatedScenes = p.scenes.filter(s => !deletable.has(s.id));
    const updatedFolders = p.folders.filter(f => !deletable.has(f.id)).map(f => ({
      ...f,
      scene_ids: f.scene_ids.filter(sid => !deletable.has(sid))
    }));
    const newLayout = { ...p.layout };
    deletable.forEach(id => delete newLayout[id]);

    onProjectChange({ ...p, scenes: updatedScenes, folders: updatedFolders, layout: newLayout });
    setSelection(new Set());
    setPositions(newLayout);
  };

  const handleSetStart = () => {
    if (!onProjectChange || !isVN || selection.size !== 1) return;
    const p = project as VNProject;
    const id = Array.from(selection)[0];
    const node = displayNodes.find(n => n.id === id);
    if (node?.kind === 'vn_scene') {
      onProjectChange({ ...p, start: id });
    }
  };

  // ─── Fit to Screen ────────────────────────────────────────────────────────────
  const handleFitToScreen = useCallback(() => {
    if (!displayNodes.length || !canvasSize.width || !canvasSize.height) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    displayNodes.forEach((n) => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    });
    const cw = maxX - minX || 1;
    const ch = maxY - minY || 1;
    const pad = 80;
    const newZoom = Math.min(
      Math.min(3, (canvasSize.width - pad * 2) / cw),
      Math.min(3, (canvasSize.height - pad * 2) / ch)
    );
    setPan({
      x: (canvasSize.width  - cw * newZoom) / 2 - minX * newZoom,
      y: (canvasSize.height - ch * newZoom) / 2 - minY * newZoom,
    });
    setZoom(newZoom);
  }, [displayNodes, canvasSize]);

  // ── Auto-fit and Hide UI on Project Load ──────────────────────────────────
  const hasInitializedFit = useRef(false);
  const lastProjectIdRef = useRef<string>("");

  // Reset fit flag when project changes — in useEffect, never during render
  useEffect(() => {
    const pid = isVN ? (project as VNProject).id : '';
    if (pid && pid !== lastProjectIdRef.current) {
      lastProjectIdRef.current = pid;
      hasInitializedFit.current = false;
    }
  }, [project, isVN]);

  // Stable ref so the auto-fit effect never re-arms from handleFitToScreen identity changes
  const handleFitToScreenRef = useRef(handleFitToScreen);
  useEffect(() => { handleFitToScreenRef.current = handleFitToScreen; }, [handleFitToScreen]);

  useEffect(() => {
    if (!hasInitializedFit.current && canvasSize.width > 0 && canvasSize.height > 0) {
      hasInitializedFit.current = true;
      if (displayNodes.length > 0) {
        handleFitToScreenRef.current();
      }
      setUiVisible(false);

      // Select main menu by default instead of being empty
      if (isVNRef.current) {
        setSelection(new Set([MAIN_MENU_ID]));
      }

      // Clear suppression after a tiny delay so the initial hidden state applies instantly
      setTimeout(() => setSuppressAnim(false), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize.width, canvasSize.height, displayNodes.length]);

  // If user toggles manually, ensure animations play
  useEffect(() => {
    if (uiVisible) setSuppressAnim(false);
  }, [uiVisible]);

  // ── Sync Layout and Global Fit All Trigger ─────────────
  const prevLayoutRef = useRef(isVN ? (project as VNProject).layout : {});
  useEffect(() => {
    if (!isVN) return;
    const currLayout = (project as VNProject).layout;
    const prevLayout = prevLayoutRef.current;
    if (currLayout === prevLayout) return;

    // Always clear temporary drag positions when the true layout updates
    // This prevents nodes from getting "stuck" at Auto Layout coordinates during an Undo
    setPositions({});
    
    prevLayoutRef.current = currLayout;
  }, [project, isVN, setPositions]);

  // Execute Fit All when requested globally (e.g. from Undo/Redo)
  const prevTriggerFitAllRef = useRef(triggerFitAll);
  useEffect(() => {
    if (triggerFitAll > prevTriggerFitAllRef.current && displayNodes.length > 0) {
      prevTriggerFitAllRef.current = triggerFitAll;
      // Small timeout ensures DOM layout transitions don't fight the zoom
      const timer = setTimeout(() => {
        handleFitToScreen();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [triggerFitAll, displayNodes, handleFitToScreen]);

  const handleGoToStart = useCallback(() => {
    if (!isVN || !canvasSize.width || !canvasSize.height) return;
    const startNode = displayNodes.find((n) => n.isStart);
    if (!startNode) return;
    setPan({
      x: canvasSize.width  / 2 - (startNode.x + startNode.w / 2) * zoom,
      y: canvasSize.height / 2 - (startNode.y + startNode.h / 2) * zoom,
    });
  }, [displayNodes, canvasSize, isVN, zoom]);

  // ── Fly-to-scene (triggered by QuickOpen Ctrl+P) ──────────────────────────
  // Animates pan+zoom so the target node is centred and at a comfortable zoom.
  useEffect(() => {
    if (!flyToSceneId || !canvasSize.width || !canvasSize.height) return;
    const node = displayNodes.find(n => n.id === flyToSceneId);
    if (!node) return;

    const TARGET_ZOOM = Math.min(1.2, Math.max(0.6, zoom)); // keep current zoom if reasonable
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const targetPan = {
      x: canvasSize.width  / 2 - cx * TARGET_ZOOM,
      y: canvasSize.height / 2 - cy * TARGET_ZOOM,
    };

    // Smooth animation via RAF lerp (Godot: quadOut easing)
    const startPan  = { ...pan };
    const startZoom = zoom;
    const duration  = 320; // ms
    const startTime = performance.now();

    let rafId: number;
    const animate = (now: number) => {
      const t  = Math.min(1, (now - startTime) / duration);
      const et = 1 - (1 - t) * (1 - t); // quadOut easing
      setPan({
        x: startPan.x + (targetPan.x - startPan.x) * et,
        y: startPan.y + (targetPan.y - startPan.y) * et,
      });
      setZoom(startZoom + (TARGET_ZOOM - startZoom) * et);
      if (t < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        // Select the node and notify parent the fly-to is done
        setSelection(new Set([flyToSceneId]));
        onFlyToComplete?.();
      }
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToSceneId]);

  // ─── Sticky Note Handlers ────────────────────────────────────────────────────
  const stickyNotes: VNStickyNote[] = isVN ? ((project as VNProject).sticky_notes ?? []) : [];

  const addStickyNote = () => {
    if (!onProjectChange || !isVN) return;
    const p = project as VNProject;
    const id = Math.random().toString(36).slice(2, 10);
    const note: VNStickyNote = {
      id, text: '', color: 'yellow',
      x: Math.max(0, -pan.x / zoom) + 80,
      y: Math.max(0, -pan.y / zoom) + 80,
      width: 200, height: 140,
    };
    onProjectChange({ ...p, sticky_notes: [...stickyNotes, note] });
  };

  const updateStickyNote = (id: string, data: Partial<VNStickyNote>) => {
    if (!onProjectChange || !isVN) return;
    const p = project as VNProject;
    onProjectChange({ ...p, sticky_notes: stickyNotes.map((n) => n.id === id ? { ...n, ...data } : n) });
  };

  const deleteStickyNote = (id: string) => {
    if (!onProjectChange || !isVN) return;
    const p = project as VNProject;
    onProjectChange({ ...p, sticky_notes: stickyNotes.filter((n) => n.id !== id) });
  };

  const guessBestLayout = (p: VNProject): 'vn' | 'sugiyama' | 'rpg' => {
    if (!p.scenes || p.scenes.length === 0) return 'sugiyama';
    let totalChoices = 0;
    let maxOutDegree = 0;
    const inDeg: Record<string, number> = {};
    p.scenes.forEach(s => inDeg[s.id] = 0);
    
    p.scenes.forEach(s => {
      let outCount = 0;
      s.events.forEach(ev => {
        if (ev.type === 'jump' && ev.scene_id) {
          outCount++;
          inDeg[ev.scene_id] = (inDeg[ev.scene_id] || 0) + 1;
        } else if (ev.type === 'choice') {
          ev.opts?.forEach(opt => {
            if (opt.scene) {
              totalChoices++;
              outCount++;
              inDeg[opt.scene] = (inDeg[opt.scene] || 0) + 1;
            }
          });
        }
      });
      if (outCount > maxOutDegree) maxOutDegree = outCount;
    });

    const branchingRatio = totalChoices / Math.max(1, p.scenes.length);
    const convergenceCount = Object.values(inDeg).filter(d => d > 1).length;

    if (maxOutDegree >= 4 && branchingRatio > 1.0) return 'rpg';
    
    // Default to Sugiyama as the standard layout
    return 'sugiyama';
  };

  const handleAutoLayout = (mode: 'vn' | 'sugiyama' | 'rpg' | 'auto' = 'auto') => {
    if (!onProjectChange || !isVN) return;
    const p = project as VNProject;
    const actualMode = mode === 'auto' ? guessBestLayout(p) : mode;
    const newLayout = { ...p.layout };
    
    const adj: Record<string, string[]> = {};
    const inDegrees: Record<string, number> = {};
    const childOrder: Record<string, number> = {};
    const childScore: Record<string, number> = {};

    p.scenes.forEach(s => { adj[s.id] = []; inDegrees[s.id] = 0; });
    
    p.scenes.forEach(s => {
      let orderCounter = 0;
      const addTarget = (targetId: string, score: number) => {
        if (!targetId) return;
        adj[s.id].push(targetId);
        inDegrees[targetId] = (inDegrees[targetId] || 0) + 1;
        if (childOrder[targetId] === undefined) childOrder[targetId] = orderCounter++;
        if (childScore[targetId] === undefined || score < childScore[targetId]) {
          childScore[targetId] = score;
        }
      };

      s.events.forEach(ev => {
        if (ev.type === 'jump' && ev.scene_id) {
          addTarget(ev.scene_id, 2);
        } else if (ev.type === 'choice') {
          ev.opts?.forEach(opt => {
            const score = opt.is_correct ? 1 : (opt.is_incorrect ? 3 : 2);
            if (opt.scene) addTarget(opt.scene, score);
          });
        } else if (ev.type === 'if') {
          if (ev.scene_true) addTarget(ev.scene_true, 1);
          if (ev.scene_false) addTarget(ev.scene_false, 3);
        }
      });
    });

    p.scenes.forEach(s => {
      const et = s.ending_type;
      if (et === 'good' || et === 'true') childScore[s.id] = 1;
      else if (et === 'bad' || et === 'stuck') childScore[s.id] = 3;
    });
    
    const roots = p.scenes.filter(s => inDegrees[s.id] === 0);
    if (roots.length === 0 && p.scenes.length > 0) roots.push(p.scenes[0]);

    const sceneIndex = Object.fromEntries(p.scenes.map(s => [s.id, s]));

    if (actualMode === 'vn') {
      const spacingX = 350;
      const spacingY = 180;
      const visited = new Set<string>();
      
      const layoutNode = (scId: string, level: number, yOffset: number): number => {
        if (visited.has(scId)) return yOffset;
        visited.add(scId);
        newLayout[scId] = [100 + level * spacingX, yOffset];
        const sc = sceneIndex[scId];
        if (!sc) return yOffset;
        
        let nextY = yOffset;
        sc.events.forEach(ev => {
          if (ev.type === 'jump' && ev.scene_id) {
            nextY = layoutNode(ev.scene_id, level + 1, nextY);
          } else if (ev.type === 'choice') {
            ev.opts?.forEach(opt => {
              if (opt.scene) nextY = layoutNode(opt.scene, level + 1, nextY);
            });
          }
        });
        return Math.max(yOffset + spacingY, nextY);
      };
      
      let rootY = 100;
      roots.forEach(r => { rootY = layoutNode(r.id, 0, rootY); });
      p.scenes.forEach(s => { if (!visited.has(s.id)) rootY = layoutNode(s.id, 0, rootY); });

    } else if (actualMode === 'sugiyama') {
      const maxDepth: Record<string, number> = {};
      const isBackEdge = new Set<string>();
      const state: Record<string, 'visiting' | 'visited'> = {};
      
      // DFS cycle detection to prevent infinite depth loops
      const detectCycleDfs = (u: string) => {
        state[u] = 'visiting';
        (adj[u] || []).forEach(v => {
          if (state[v] === 'visiting') {
            isBackEdge.add(`${u}->${v}`);
          } else if (state[v] !== 'visited') {
            detectCycleDfs(v);
          }
        });
        state[u] = 'visited';
      };
      
      p.scenes.forEach(s => {
        if (state[s.id] !== 'visited') detectCycleDfs(s.id);
      });
      
      // Calculate in-degrees ignoring back-edges to form a clean DAG
      const dagInDegree: Record<string, number> = {};
      p.scenes.forEach(s => dagInDegree[s.id] = 0);
      p.scenes.forEach(u => {
        (adj[u.id] || []).forEach(v => {
          if (!isBackEdge.has(`${u.id}->${v}`)) {
            dagInDegree[v]++;
          }
        });
      });
      
      p.scenes.forEach(s => maxDepth[s.id] = 0);
      const longestPathParent: Record<string, string> = {};
      const q: string[] = [];
      p.scenes.forEach(s => {
        if (dagInDegree[s.id] === 0) q.push(s.id);
      });
      
      // Calculate max depth for layered layout safely
      while (q.length > 0) {
        const u = q.shift()!;
        (adj[u] || []).forEach(v => {
          if (isBackEdge.has(`${u}->${v}`)) return;
          
          const depthIncrement = 1;
          
          if (maxDepth[u] + depthIncrement > maxDepth[v]) {
            maxDepth[v] = maxDepth[u] + depthIncrement;
            longestPathParent[v] = u;
          }
          dagInDegree[v]--;
          if (dagInDegree[v] === 0) {
            q.push(v);
          }
        });
      }
      
      const layers: string[][] = [];
      Object.entries(maxDepth).forEach(([id, depth]) => {
        if (!layers[depth]) layers[depth] = [];
        layers[depth].push(id);
      });
      p.scenes.forEach(s => {
        if (maxDepth[s.id] === undefined) {
          if (!layers[0]) layers[0] = [];
          layers[0].push(s.id);
        }
      });
      
      // Identify the Main Trunk
      let deepestNode = p.scenes[0]?.id;
      let maxD = -1;
      Object.entries(maxDepth).forEach(([id, d]) => {
        if (d > maxD) {
          maxD = d;
          deepestNode = id;
        }
      });
      const isTrunk = new Set<string>();
      let curr: string | undefined = deepestNode;
      while (curr) {
        isTrunk.add(curr);
        curr = longestPathParent[curr];
      }
      
      const spacingX = 400;
      const spacingY = 250;
      
      layers.forEach((layerNodes, depth) => {
        // Perfectly center all layers vertically around Y=1000
        const totalHeight = layerNodes.length * spacingY;
        const startY = 1000 - (totalHeight / 2) + (spacingY / 2);
        layerNodes.forEach((id, i) => {
          newLayout[id] = [100 + depth * spacingX, startY + i * spacingY];
        });
      });

    } else if (actualMode === 'rpg') {
      const spacingX = 350;
      const spacingY = 250;
      const visited = new Set<string>();
      
      const layoutNode = (scId: string, xOffset: number, level: number): number => {
        if (visited.has(scId)) return xOffset;
        visited.add(scId);
        newLayout[scId] = [xOffset, 100 + level * spacingY];
        
        let nextX = xOffset;
        const children = adj[scId] || [];
        children.forEach((childId, idx) => {
          nextX = layoutNode(childId, nextX + (idx > 0 ? spacingX : 0), level + 1);
        });
        return Math.max(xOffset, nextX);
      };
      
      let rootX = 100;
      roots.forEach(r => { rootX = layoutNode(r.id, rootX, 0) + spacingX; });
      p.scenes.forEach(s => { if (!visited.has(s.id)) rootX = layoutNode(s.id, rootX, 0) + spacingX; });
    }

    let maxLayoutY = 100;
    Object.values(newLayout).forEach(pos => { if (pos[1] > maxLayoutY) maxLayoutY = pos[1]; });

    let folderX = 100;
    let folderY = maxLayoutY + 300;
    p.folders.forEach(f => {
      newLayout[f.id] = [folderX, folderY];
      folderX += 400;
    });
    
    if (p.start && newLayout[p.start]) {
      if (actualMode === 'rpg') {
        newLayout[MAIN_MENU_ID] = [newLayout[p.start][0], newLayout[p.start][1] - 250];
      } else {
        const spacingX = actualMode === 'sugiyama' ? 400 : 350;
        newLayout[MAIN_MENU_ID] = [newLayout[p.start][0] - spacingX, newLayout[p.start][1]];
      }
    }
    
    onProjectChange({ ...p, layout: newLayout });
    
    // Fit to screen synchronously using newLayout to prevent stale closure bugs
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    displayNodes.forEach((n) => {
      const nx = newLayout[n.id]?.[0] ?? n.x;
      const ny = newLayout[n.id]?.[1] ?? n.y;
      minX = Math.min(minX, nx); minY = Math.min(minY, ny);
      maxX = Math.max(maxX, nx + n.w); maxY = Math.max(maxY, ny + n.h);
    });
    if (minX !== Infinity && canvasSize.width && canvasSize.height) {
      const cw = maxX - minX || 1;
      const ch = maxY - minY || 1;
      const pad = 80;
      const newZoom = Math.min(
        Math.min(3, (canvasSize.width - pad * 2) / cw),
        Math.min(3, (canvasSize.height - pad * 2) / ch)
      );
      setPan({
        x: (canvasSize.width  - cw * newZoom) / 2 - minX * newZoom,
        y: (canvasSize.height - ch * newZoom) / 2 - minY * newZoom,
      });
      setZoom(newZoom);
    }
    return actualMode;
  };

  // ─── Rendering Helpers ──────────────────────────────────────────────────────

  // compactCards replaces isLowLOD — only toggled at zoom-transition end (not mid-zoom)
  // const isLowLOD = zoom < LOD_THRESHOLD;  // kept for reference

  const renderBackgroundLines = () => {
    // Dynamically scale the grid to keep spacing comfortable
    let scaledTile = TILE_SIZE * zoom;
    while (scaledTile < 40) scaledTile *= 2;
    while (scaledTile > 120) scaledTile /= 2;

    return (
      <svg width="100%" height="100%" style={{ position: 'absolute', pointerEvents: 'none', opacity: 'var(--grid-dot-opacity)' }}>
        <defs>
          <pattern id="grid" width={scaledTile} height={scaledTile} patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x},${pan.y})`}>
            <circle cx="2" cy="2" r="1.5" fill="var(--grid-dot-color)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    );
  };

  // Legend items — used in the minimap container below
  const presentTypes = new Set(links.map(l => l.vnType));
  const ALL_LEGEND_ITEMS: { type: string; label: string; stroke: string; dash?: string }[] = [
    { type: 'jump',      label: t('canvas.edges.jump'), stroke: '#00d4c8' },
    { type: 'choice',    label: t('canvas.edges.choice'),    stroke: '#f472b6' },
    { type: 'good_path', label: t('canvas.edges.good_path'),        stroke: '#4ade80' },
    { type: 'odd_path',  label: t('canvas.edges.odd_path'),         stroke: '#a78bfa' },
    { type: 'bad_path',  label: t('canvas.edges.bad_path'),       stroke: '#fb923c', dash: '6 4' },
    { type: 'screen',    label: t('canvas.edges.screen'),      stroke: '#22d3ee', dash: '2 6' },
  ];
  const legendItems = ALL_LEGEND_ITEMS.filter(item => presentTypes.has(item.type as any));
  const hasTypedLinks = legendItems.length > 0;

  // ─── Floating Inspector Panel ─────────────────────────────────────────────
  const canvasW = canvasSize.width || 900;
  const canvasH = canvasSize.height || 500;
  const PANEL_W = 300;
  const PANEL_MARGIN = 20;   // gap above and below the panel
  const PANEL_H = Math.max(300, canvasH - PANEL_MARGIN * 2);
  // Use displayedSide (not inspectorSide) so position matches the exit animation direction
  const inspDefaultX = displayedSide === 'left' ? PANEL_MARGIN : canvasW - PANEL_W - PANEL_MARGIN;
  const inspDefaultY = PANEL_MARGIN;
  const inspPosX = inspectorPos.x < 0 ? inspDefaultX : inspectorPos.x;
  const inspPosY = inspectorPos.y < 0 ? inspDefaultY : inspectorPos.y;

  const floatingInspector = isVN && activeSelection.size > 0 ? (
    <div
      key="floating-inspector"
      onPointerDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: inspPosX,
        top: inspPosY,
        width: PANEL_W,
        height: PANEL_H,
        zIndex: 30,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        border: '1px solid var(--bdr)',
        background: 'var(--bg1)',
        pointerEvents: uiVisible ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
        animation: suppressAnim ? 'none' : (
          (!uiVisible || panelExiting || isExitingSelection)
            ? (displayedSide === 'left' ? 'vnv-slide-out-left 0.44s forwards cubic-bezier(0.4,0,0.2,1)' : 'vnv-slide-out-right 0.44s forwards cubic-bezier(0.4,0,0.2,1)')
            : (displayedSide === 'left' ? 'vnv-slide-in-left 0.44s forwards cubic-bezier(0.4,0,0.2,1)' : 'vnv-slide-in-right 0.44s forwards cubic-bezier(0.4,0,0.2,1)')
        ),
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={e => handleInspectorDragStart(e, inspPosX, inspPosY)}
        onPointerMove={handleInspectorDragMove}
        onPointerUp={handleInspectorDragEnd}
        style={{
          background: 'var(--bg3)',
          borderBottom: '1px solid var(--bdr)',
          padding: '7px 12px',
          cursor: 'grab',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--dim)' }}>⠿</span>
        <span style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 600, letterSpacing: 0.5, flex: 1 }}>{t('canvas.inspector')}</span>
      </div>
      {/* Content */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <GraphInspector
          project={project as VNProject}
          rootPath={rootPath || ""}
          selection={activeSelection}
          onEditScene={onEditScene}
          onGoScene={onGoScene}
          onDeleteSelected={handleDeleteSelected}
          onRenameNode={(id, label) => {
            if (!onProjectChange) return;
            const p = project as VNProject;
            onProjectChange({
              ...p,
              scenes: p.scenes.map(s => s.id === id ? { ...s, label } : s),
              folders: p.folders.map(f => f.id === id ? { ...f, label } : f),
            });
          }}
          onSetStart={(id) => {
            if (!onProjectChange) return;
            const p = project as VNProject;
            onProjectChange({ ...p, start: id });
          }}
          onEnterMainMenu={onEnterMainMenu}
        />
      </div>
    </div>
  ) : null;


  const visibleRect = {
    x: -pan.x / zoom,
    y: -pan.y / zoom,
    w: canvasSize.width / zoom,
    h: canvasSize.height / zoom
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <CanvasToolbar 
        canvasRef={canvasRef} displayNodes={displayNodes} isVN={isVN} project={project}
        handleFitToScreen={handleFitToScreen} handleAddScene={handleAddScene}
        handleAddScreen={handleAddScreen} handleAddFolder={handleAddFolder}
        addStickyNote={addStickyNote} handleAutoLayout={handleAutoLayout}
        onEditScene={onEditScene} pushRecentScene={pushRecentScene}
        handleNodeDoubleClick={handleNodeDoubleClick} handleDeleteSelected={handleDeleteSelected}
        handleSetStart={handleSetStart} onGoScene={onGoScene}
      />
      {/* ── Canvas Area ── */}
      <div ref={canvasRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: isPanning.current ? 'grabbing' : 'grab', outline: 'none' }}
        onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
      >
        {renderBackgroundLines()}
        <ConnectionLayer links={links as any} displayNodes={displayNodes} compactCards={compactCards} dragLineRef={dragLineRef} />
        {/* Dismiss context menu on canvas click */}
        {ctxMenu && <div style={{ position: 'absolute', inset: 0, zIndex: 48 }} onPointerDown={closeCtxMenu} />}

        <div style={{ position: 'absolute', transformOrigin: '0 0', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {/* Sticky Notes (rendered below scene nodes) */}
          {stickyNotes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              zoom={zoom}
              onUpdate={(data) => updateStickyNote(note.id, data)}
              onDelete={() => deleteStickyNote(note.id)}
              onDragStart={handleStickyDragStart(note)}
            />
          ))}

          <NodeLayer 
            displayNodes={displayNodes} isVN={isVN} compactCards={compactCards}
            visibleRect={visibleRect} zoom={zoom}
            handleNodePointerDown={handleNodePointerDown} handleNodePointerMove={handleNodePointerMove}
            handleNodePointerUp={handleNodePointerUp} handleNodeDoubleClick={handleNodeDoubleClick}
            canvasRef={canvasRef} finishRename={finishRename} project={project} rootPath={rootPath}
            handleConnectionDragStart={handleConnectionDragStart}
            onProjectChange={onProjectChange}
          />
          {/* RubberBand lasso — real pixel dimensions, border never scales */}
          <div
            ref={lassoElemRef}
            style={{
              position: 'absolute', pointerEvents: 'none',
              display: 'none',           // shown imperatively on drag start
              left: 0, top: 0,           // overwritten each frame
              width: 0, height: 0,       // overwritten each frame
              border: '1.5px solid #6366f1',
              background: 'rgba(99,102,241,0.15)',
              borderRadius: 3,
              boxSizing: 'border-box',
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* New Scene Ghost Node — rendered in canvas coordinate space */}
          <div ref={dragGhostRef} style={{
            position: 'absolute', display: 'none', flexDirection: 'column',
            width: 220, height: 110, background: 'rgba(74,222,128,0.1)',
            border: '2px dashed #4ade80', borderRadius: 8,
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            zIndex: 90, color: '#4ade80', fontFamily: 'var(--mono)', fontSize: 12,
            boxShadow: '0 0 20px rgba(74,222,128,0.2)'
          }}>
            <span style={{ fontSize: 24, marginBottom: 4 }}>✨</span>
            New Scene
          </div>

          {/* Placing Ghost Node */}
          {placingNodeType && (
            <div ref={placingGhostRef} style={{
              position: 'absolute', display: 'none', flexDirection: 'column',
              width: 220, height: 110, background: placingNodeType === 'scene' ? 'rgba(74,222,128,0.1)' : 'rgba(34,211,238,0.1)',
              border: `2px dashed ${placingNodeType === 'scene' ? '#4ade80' : '#22d3ee'}`, borderRadius: 8,
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
              zIndex: 90, color: placingNodeType === 'scene' ? '#4ade80' : '#22d3ee', fontFamily: 'var(--mono)', fontSize: 12,
              boxShadow: `0 0 20px ${placingNodeType === 'scene' ? 'rgba(74,222,128,0.2)' : 'rgba(34,211,238,0.2)'}`
            }}>
              <span style={{ fontSize: 24, marginBottom: 4 }}>{placingNodeType === 'scene' ? '✨' : '🖥'}</span>
              New {placingNodeType === 'scene' ? 'Scene' : 'Screen'}
            </div>
          )}
        </div>

        <CanvasContextMenu 
          displayNodes={displayNodes} onEnterMainMenu={onEnterMainMenu}
          onEditScene={onEditScene} pushRecentScene={pushRecentScene}
          onGoScene={onGoScene} project={project} onProjectChange={onProjectChange}
          handleDeleteSelected={handleDeleteSelected}
        />

        {/* Floating Connection Menu — rendered in screen coordinate space */}
        {connMenu && (
          <div 
            onPointerDown={e => e.stopPropagation()}
            style={{
              position: 'absolute', left: connMenu.x + 20, top: connMenu.y,
              background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              padding: 8, width: 160, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 1000,
              animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
            }}>
            <div style={{ padding: '0 4px 4px 4px', fontSize: 11, fontWeight: 600, color: 'var(--dim)', marginBottom: 2 }}>
              {connMenu.targetNodeId ? 'Connect to Scene' : 'Create New Scene'}
            </div>
            <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 12, padding: '4px 8px', minHeight: 28 }} onClick={() => applyConnection('jump')}>
              Jump to Scene
            </button>
            <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 12, padding: '4px 8px', minHeight: 28 }} onClick={() => applyConnection('choice')}>
              Choice Option
            </button>
            <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 12, padding: '4px 8px', minHeight: 28 }} onClick={() => applyConnection('call')}>
              Screen Call
            </button>
            <div style={{ height: 1, background: 'var(--bdr)', margin: '4px 0' }} />
            <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 12, padding: '4px 8px', minHeight: 28, color: '#ef4444' }} onClick={() => { 
              if (dragLineRef.current) dragLineRef.current.style.display = 'none';
              if (dragGhostRef.current) dragGhostRef.current.style.display = 'none';
              setConnMenu(null); 
              setIsConnectionMode(false); 
            }}>
              Cancel
            </button>
          </div>
        )}

        {/* Choice Builder Menu */}
        {choiceBuilder && (
          <div 
            onPointerDown={e => e.stopPropagation()}
            style={{
              position: 'absolute', left: choiceBuilder.screenX + 20, top: choiceBuilder.screenY, zIndex: 1000,
              background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.8)', padding: 12, width: 340,
              display: 'flex', flexDirection: 'column', gap: 8,
              animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
            }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dim)', marginBottom: 4 }}>Create Choice Block</div>
            
            <label style={{ fontSize: 10, color: 'var(--faint)' }}>Question / Prompt</label>
            <input autoFocus className="input" style={{ width: '100%', fontSize: 12, padding: '6px 8px', background: 'var(--bg0)' }} value={choiceBuilder.prompt} onChange={e => setChoiceBuilder({...choiceBuilder, prompt: e.target.value})} />
            
            <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 8 }}>Answers / Routes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {choiceBuilder.options.map((opt, i) => (
                <div key={opt.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="input" style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px', background: 'var(--bg0)' }} value={opt.text} placeholder="Answer text..." onChange={e => {
                     const newOpts = [...choiceBuilder.options];
                     newOpts[i].text = e.target.value;
                     setChoiceBuilder({...choiceBuilder, options: newOpts});
                  }} />
                  <span style={{ color: 'var(--faint)', fontSize: 10 }}>→</span>
                  <select className="input" style={{ width: 120, fontSize: 10, padding: '4px 6px', background: 'var(--bg0)' }} value={opt.sceneId || ''} onChange={e => {
                     const newOpts = [...choiceBuilder.options];
                     newOpts[i].sceneId = e.target.value;
                     setChoiceBuilder({...choiceBuilder, options: newOpts});
                  }}>
                     <option value="__NEW__">✨ New Scene</option>
                     <option value="">(Unlinked)</option>
                     {displayNodes.filter(s => s.kind === 'vn_scene' && s.id !== choiceBuilder.sourceNodeId).map(s => (
                       <option key={s.id} value={s.id}>{s.label}</option>
                     ))}
                  </select>
                  <button className="btn btn-ghost" style={{ padding: '2px 6px', color: 'var(--err)', minHeight: 0, height: 24 }} onClick={() => {
                     const newOpts = choiceBuilder.options.filter((_, idx) => idx !== i);
                     setChoiceBuilder({...choiceBuilder, options: newOpts});
                  }}>×</button>
                </div>
              ))}
            </div>
            
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', alignSelf: 'flex-start', color: 'var(--acc2)' }} onClick={() => {
               setChoiceBuilder({...choiceBuilder, options: [...choiceBuilder.options, { id: crypto.randomUUID().slice(0, 8), text: `Option ${choiceBuilder.options.length + 1}`, sceneId: '__NEW__' }]});
            }}>+ Add Answer</button>

            <div style={{ height: 1, background: 'var(--bdr)', margin: '4px 0' }} />

            <div style={{ display: 'flex', gap: 8 }}>
               <button className="btn" style={{ flex: 1, background: 'var(--acc)', color: '#fff', fontSize: 12, padding: '6px' }} onClick={() => {
                  const p = project as VNProject;
                  const newLayout = { ...p.layout };
                  const newScenes = [...p.scenes];
                  
                  let newSceneCount = 0;
                  
                  const finalOpts = choiceBuilder.options.map((opt, i) => {
                     let finalTarget = opt.sceneId;
                     if (opt.sceneId === '__NEW__') {
                        const baseSceneCount = p.scenes.length + newSceneCount;
                        const sc = newScene(`Scene ${baseSceneCount + 1}`);
                        newScenes.push(sc);
                        newLayout[sc.id] = [choiceBuilder.canvasX + (i * 20), choiceBuilder.canvasY - 55 + (newSceneCount * 140)] as [number, number];
                        finalTarget = sc.id;
                        newSceneCount++;
                     }
                     return { id: opt.id, text: opt.text, scene: finalTarget ?? null };
                  });

                  const eventToAdd = {
                    id: crypto.randomUUID().slice(0, 8),
                    type: 'choice' as const,
                    prompt: choiceBuilder.prompt,
                    opts: finalOpts
                  };

                  const updatedScenes = newScenes.map(s => {
                     if (s.id === choiceBuilder.sourceNodeId) {
                        return { ...s, events: [...s.events, eventToAdd] };
                     }
                     return s;
                  });

                  if (onProjectChange) onProjectChange({ ...p, scenes: updatedScenes, layout: newLayout });
                  setPositions(newLayout);
                  setChoiceBuilder(null);
                  setIsConnectionMode(false);
               }}>Create Choice</button>
               <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '6px' }} onClick={() => {
                  setChoiceBuilder(null);
                  setIsConnectionMode(false);
               }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Slide animation keyframes */}
        <style>{`
          @keyframes vnv-slide-in-left   { from { transform: translateX(-120%); opacity: 0; } to { transform: translateX(0);    opacity: 1; } }
          @keyframes vnv-slide-in-right  { from { transform: translateX( 120%); opacity: 0; } to { transform: translateX(0);    opacity: 1; } }
          @keyframes vnv-slide-out-left  { from { transform: translateX(0);     opacity: 1; } to { transform: translateX(-120%); opacity: 0; } }
          @keyframes vnv-slide-out-right { from { transform: translateX(0);     opacity: 1; } to { transform: translateX( 120%); opacity: 0; } }
        `}</style>

        {/* Minimap — opposite side of inspector, same exit/enter animation system */}
        <div
          key="minimap"
          style={{
            position: 'absolute', bottom: 16,
            left: displayedSide === 'left' ? canvasW - 220 - 16 : 16,
            pointerEvents: uiVisible ? 'auto' : 'none',
            zIndex: 20,
            display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch',
            animation: suppressAnim ? 'none' : (
              (!uiVisible || panelExiting)
                ? (displayedSide === 'left' ? 'vnv-slide-out-right 0.44s forwards cubic-bezier(0.4,0,0.2,1)' : 'vnv-slide-out-left 0.44s forwards cubic-bezier(0.4,0,0.2,1)')
                : (displayedSide === 'left' ? 'vnv-slide-in-right 0.44s forwards cubic-bezier(0.4,0,0.2,1)' : 'vnv-slide-in-left 0.44s forwards cubic-bezier(0.4,0,0.2,1)')
            ),
          }}
        >
          {/* Legend — sits above the minimap, same animation container */}
          {hasTypedLinks && (
            <div style={{
              background: 'rgba(8,13,26,0.88)', backdropFilter: 'blur(8px)',
              border: '1px solid #1e2d42', borderRadius: 8,
              padding: '10px 14px', pointerEvents: 'none',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#4a5568', textTransform: 'uppercase', marginBottom: 2 }}>{t('canvas.edge_types')}</span>
              {legendItems.map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width={42} height={10} style={{ flexShrink: 0, overflow: 'visible' }}>
                      <path d="M 4 2 A 3 3 0 0 1 4 8" fill="none" stroke={item.stroke} strokeWidth={2} strokeLinecap="round" />
                      <line x1={7} y1={5} x2={34} y2={5}
                        stroke={item.stroke} strokeWidth={2}
                        strokeDasharray={item.dash}
                        strokeLinecap="round" />
                      <path d="M 30 2 L 38 5 L 30 8 Z" fill={item.stroke} />
                    </svg>
                  <span style={{ fontSize: 10, color: '#8892a4', whiteSpace: 'nowrap' }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}

          <Minimap
            items={displayNodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, kind: n.isStart ? 'start' : n.isEnd ? 'end' : n.kind }))}
            pan={pan}
            zoom={zoom}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            onPanChange={setPan}
          />
        </div>

        {/* Floating inspector panel — anchored to canvas area */}
        {floatingInspector}

        {/* Hide UI Button — outside minimap, moves based on visibility */}
        {isVN && (() => {
          const btnWidth = 100;
          const gap = 12;
          const mmWidth = 220;

          return (
            <div
              key="hide-ui-btn-wrapper"
              style={{
                position: 'absolute', bottom: 16, zIndex: 40,
                left: displayedSide === 'right' ? 16 : 'auto',
                right: displayedSide === 'left' ? 16 : 'auto',
                pointerEvents: 'none',
                animation: suppressAnim ? 'none' : (
                  panelExiting
                    ? (displayedSide === 'left' ? 'vnv-slide-out-right 0.44s forwards cubic-bezier(0.4,0,0.2,1)' : 'vnv-slide-out-left 0.44s forwards cubic-bezier(0.4,0,0.2,1)')
                    : (displayedSide === 'left' ? 'vnv-slide-in-right 0.44s forwards cubic-bezier(0.4,0,0.2,1)' : 'vnv-slide-in-left 0.44s forwards cubic-bezier(0.4,0,0.2,1)')
                ),
              }}
            >
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setUiVisible(!uiVisible)}
                style={{
                  width: btnWidth,
                  transform: uiVisible ? (displayedSide === 'left' ? `translateX(-${mmWidth + gap}px)` : `translateX(${mmWidth + gap}px)`) : 'translateX(0)',
                  transition: suppressAnim ? 'none' : 'transform 0.44s cubic-bezier(0.4,0,0.2,1)',
                  background: 'rgba(13,18,32,0.85)', border: '1px solid var(--bdr)',
                  borderRadius: 8, color: 'var(--dim)', fontSize: 13, fontWeight: 700,
                  padding: '12px 0', cursor: 'pointer', backdropFilter: 'blur(4px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, pointerEvents: 'auto',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                {uiVisible ? `🙈 ${t('canvas.hide_ui') || 'Hide UI'}` : `👀 ${t('canvas.show_ui') || 'Show UI'}`}
              </button>
            </div>
          );
        })()}
      </div>

      {/* Recent Scenes HUD — top-right */}
        {isVN && recentSceneIds.length > 0 && (
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 30, pointerEvents: 'auto' }}>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setShowRecent(v => !v)}
              style={{
                background: 'rgba(13,18,32,0.85)', border: '1px solid var(--bdr)',
                borderRadius: 6, color: 'var(--dim)', fontSize: 11, fontWeight: 600,
                padding: '4px 10px', cursor: 'pointer', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              🕐 Recent {showRecent ? '▲' : '▼'}
            </button>
            {showRecent && (
              <div style={{
                marginTop: 4, background: 'rgba(13,18,32,0.92)',
                border: '1px solid var(--bdr)', borderRadius: 8,
                overflow: 'hidden', backdropFilter: 'blur(6px)',
                minWidth: 180,
              }}>
                {recentSceneIds.map(id => {
                  const sc = (project as VNProject).scenes.find(s => s.id === id);
                  if (!sc) return null;
                  return (
                    <button key={id}
                      onClick={() => { setShowRecent(false); onEditScene?.(id); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '7px 12px', background: 'transparent',
                        border: 'none', borderBottom: '1px solid var(--bdr)',
                        color: 'var(--text)', fontSize: 11, cursor: 'pointer',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(75,108,247,0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      🎬 {sc.label || id}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

    </div>
  );
}
