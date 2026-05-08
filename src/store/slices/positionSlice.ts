import type { StateCreator } from 'zustand';
import type { CanvasState } from '../canvasStore';

type Slice<T> = StateCreator<CanvasState, [['zustand/immer', never]], [], T>;

export type PositionSlice = {
  positions: Record<string, [number, number]>;
  setPositions: (update: Record<string, [number, number]> | ((prev: Record<string, [number, number]>) => Record<string, [number, number]>)) => void;
};

export const createPositionSlice: Slice<PositionSlice> = (set, get) => ({
  positions: {},
  setPositions: (update) => set((s) => {
    s.positions = typeof update === 'function' ? update(s.positions) : update;
  }),
});
