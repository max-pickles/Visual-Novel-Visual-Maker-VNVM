import type { StateCreator } from 'zustand';
import type { CanvasState } from '../canvasStore';

// Slice creator type — immer is the innermost middleware each slice sees
type Slice<T> = StateCreator<CanvasState, [['zustand/immer', never]], [], T>;

export type ViewportSlice = {
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;

  zoom: number;
  setZoom: (zoom: number | ((prev: number) => number)) => void;

  zoomMenuOpen: boolean;
  setZoomMenuOpen: (open: boolean) => void;

  minZoomLimit: number;
  setMinZoomLimit: (limit: number) => void;

  maxZoomLimit: number;
  setMaxZoomLimit: (limit: number) => void;

  compositorKick: number;
  setCompositorKick: (kick: number | ((prev: number) => number)) => void;

  triggerFitAll: number;
  setTriggerFitAll: (trigger: number) => void;
};

export const createViewportSlice: Slice<ViewportSlice> = (set) => ({
  pan: { x: 0, y: 0 },
  setPan: (update) => set((s) => { s.pan = typeof update === 'function' ? update(s.pan) : update; }),

  zoom: 1,
  setZoom: (update) => set((s) => { s.zoom = typeof update === 'function' ? update(s.zoom) : update; }),

  zoomMenuOpen: false,
  setZoomMenuOpen: (open) => set((s) => { s.zoomMenuOpen = open; }),

  minZoomLimit: 0.1,
  setMinZoomLimit: (limit) => set((s) => { s.minZoomLimit = limit; }),

  maxZoomLimit: 3.0,
  setMaxZoomLimit: (limit) => set((s) => { s.maxZoomLimit = limit; }),

  compositorKick: 0,
  setCompositorKick: (update) => set((s) => { s.compositorKick = typeof update === 'function' ? update(s.compositorKick) : update; }),

  triggerFitAll: 0,
  setTriggerFitAll: (trigger) => set((s) => { s.triggerFitAll = trigger; }),
});
