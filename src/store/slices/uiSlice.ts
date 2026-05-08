import type { StateCreator } from 'zustand';
import type { CanvasState, ToolMode, LayoutMode } from '../canvasStore';

type Slice<T> = StateCreator<CanvasState, [['zustand/immer', never]], [], T>;

export type UiSlice = {
  tool: ToolMode;
  setTool: (tool: ToolMode) => void;

  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;

  recentSceneIds: string[];
  setRecentSceneIds: (ids: string[] | ((prev: string[]) => string[])) => void;

  showRecent: boolean;
  setShowRecent: (show: boolean | ((prev: boolean) => boolean)) => void;
};

export const createUiSlice: Slice<UiSlice> = (set) => ({
  tool: 'pointer',
  setTool: (tool) => set((s) => { s.tool = tool; }),

  layoutMode: 'vn',
  setLayoutMode: (mode) => set((s) => { s.layoutMode = mode; }),

  recentSceneIds: [],
  setRecentSceneIds: (update) => set((s) => {
    s.recentSceneIds = typeof update === 'function' ? update(s.recentSceneIds) : update;
  }),

  showRecent: false,
  setShowRecent: (update) => set((s) => {
    s.showRecent = typeof update === 'function' ? update(s.showRecent) : update;
  }),
});
