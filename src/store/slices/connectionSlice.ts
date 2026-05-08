import type { StateCreator } from 'zustand';
import type { CanvasState } from '../canvasStore';

type Slice<T> = StateCreator<CanvasState, [['zustand/immer', never]], [], T>;

export type ConnMenu = {
  x: number; y: number;
  sourceNode: any;
  targetNodeId: string | null;
  cx: number; cy: number;
};

export type ConnectionSlice = {
  isConnectionMode: boolean;
  setIsConnectionMode: (mode: boolean | ((prev: boolean) => boolean)) => void;

  hoverTargetId: string | null;
  setHoverTargetId: (id: string | null) => void;

  armedConnectionNode: any | null;
  setArmedConnectionNode: (node: any | null) => void;

  connMenu: ConnMenu | null;
  setConnMenu: (menu: ConnMenu | null) => void;
};

export const createConnectionSlice: Slice<ConnectionSlice> = (set) => ({
  isConnectionMode: false,
  setIsConnectionMode: (update) => set((s) => {
    s.isConnectionMode = typeof update === 'function' ? update(s.isConnectionMode) : update;
  }),

  hoverTargetId: null,
  setHoverTargetId: (id) => set((s) => { s.hoverTargetId = id; }),

  armedConnectionNode: null,
  setArmedConnectionNode: (node) => set((s) => { s.armedConnectionNode = node; }),

  connMenu: null,
  setConnMenu: (menu) => set((s) => { s.connMenu = menu; }),
});
