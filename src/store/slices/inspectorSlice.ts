import type { StateCreator } from 'zustand';
import type { CanvasState } from '../canvasStore';

type Slice<T> = StateCreator<CanvasState, [['zustand/immer', never]], [], T>;

export type InspectorSlice = {
  // Floating inspector panel position & side
  inspectorPos: { x: number; y: number };
  setInspectorPos: (pos: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;

  inspectorSide: 'left' | 'right';
  setInspectorSide: (side: 'left' | 'right') => void;

  displayedSide: 'left' | 'right';
  setDisplayedSide: (side: 'left' | 'right') => void;

  panelExiting: boolean;
  setPanelExiting: (exiting: boolean) => void;

  uiVisible: boolean;
  setUiVisible: (visible: boolean | ((prev: boolean) => boolean)) => void;

  // Context (right-click) menu
  ctxMenu: { x: number; y: number; nodeId: string } | null;
  setCtxMenu: (menu: { x: number; y: number; nodeId: string } | null) => void;

  // Which node's ending-type popover is open
  endingMenuNodeId: string | null;
  setEndingMenuNodeId: (id: string | null) => void;
};

export const createInspectorSlice: Slice<InspectorSlice> = (set) => ({
  inspectorPos: { x: -1, y: -1 },
  setInspectorPos: (update) => set((s) => {
    s.inspectorPos = typeof update === 'function' ? update(s.inspectorPos) : update;
  }),

  inspectorSide: 'left',
  setInspectorSide: (side) => set((s) => { s.inspectorSide = side; }),

  displayedSide: 'left',
  setDisplayedSide: (side) => set((s) => { s.displayedSide = side; }),

  panelExiting: false,
  setPanelExiting: (exiting) => set((s) => { s.panelExiting = exiting; }),

  uiVisible: true,
  setUiVisible: (update) => set((s) => {
    s.uiVisible = typeof update === 'function' ? update(s.uiVisible) : update;
  }),

  ctxMenu: null,
  setCtxMenu: (menu) => set((s) => { s.ctxMenu = menu; }),

  endingMenuNodeId: null,
  setEndingMenuNodeId: (id) => set((s) => { s.endingMenuNodeId = id; }),
});
