import { create } from 'zustand';
import { persist, devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
export { useShallow } from 'zustand/react/shallow';

// ─── Slice types & creators ───────────────────────────────────────────────────
import { type ViewportSlice,    createViewportSlice   } from './slices/viewportSlice';
import { type SelectionSlice,   createSelectionSlice  } from './slices/selectionSlice';
import { type PositionSlice,    createPositionSlice   } from './slices/positionSlice';
import { type ConnectionSlice,  createConnectionSlice } from './slices/connectionSlice';
import { type InspectorSlice,   createInspectorSlice  } from './slices/inspectorSlice';
import { type UiSlice,          createUiSlice         } from './slices/uiSlice';

// ─── Public type enums (re-exported so components don't need to dig into slices)
export type ToolMode   = 'pointer' | 'pan';
export type LayoutMode = 'vn' | 'sugiyama' | 'rpg' | 'auto';

// ─── Combined store type ──────────────────────────────────────────────────────
export type CanvasState =
  & ViewportSlice
  & SelectionSlice
  & PositionSlice
  & ConnectionSlice
  & InspectorSlice
  & UiSlice;

// ─── Persisted keys — only stable user preferences ───────────────────────────
type PersistedKeys = Pick<CanvasState,
  | 'tool' | 'minZoomLimit' | 'maxZoomLimit'
  | 'inspectorSide' | 'displayedSide' | 'layoutMode'
>;

// ─── Middleware stack: devtools → subscribeWithSelector → persist → immer ─────
export const useCanvasStore = create<CanvasState>()(
  devtools(
    subscribeWithSelector(
      persist(
        immer<CanvasState>((...args) => ({
          ...createViewportSlice(...args),
          ...createSelectionSlice(...args),
          ...createPositionSlice(...args),
          ...createConnectionSlice(...args),
          ...createInspectorSlice(...args),
          ...createUiSlice(...args),
        })),
        {
          name: 'vnvmaker-canvas-prefs',
          partialize: (state): PersistedKeys => ({
            tool:          state.tool,
            minZoomLimit:  state.minZoomLimit,
            maxZoomLimit:  state.maxZoomLimit,
            inspectorSide: state.inspectorSide,
            displayedSide: state.displayedSide,
            layoutMode:    state.layoutMode,
          }),
        }
      )
    ),
    { name: 'VNVMaker Canvas Store', enabled: true }
  )
);
