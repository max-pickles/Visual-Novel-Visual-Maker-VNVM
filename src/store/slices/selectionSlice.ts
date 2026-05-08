import type { StateCreator } from 'zustand';
import type { CanvasState } from '../canvasStore';

type Slice<T> = StateCreator<CanvasState, [['zustand/immer', never]], [], T>;

export type SelectionSlice = {
  selection: Set<string>;
  setSelection: (sel: Set<string> | ((prev: Set<string>) => Set<string>)) => void;

  folderStack: string[];
  setFolderStack: (stack: string[] | ((prev: string[]) => string[])) => void;

  search: string;
  setSearch: (search: string) => void;

  charFilter: string;
  setCharFilter: (filter: string) => void;

  renamingId: string | null;
  setRenamingId: (id: string | null) => void;

  renameVal: string;
  setRenameVal: (val: string) => void;
};

export const createSelectionSlice: Slice<SelectionSlice> = (set) => ({
  selection: new Set<string>(),
  setSelection: (update) => set((s) => { s.selection = typeof update === 'function' ? update(s.selection) : update; }),

  folderStack: [],
  setFolderStack: (update) => set((s) => { s.folderStack = typeof update === 'function' ? update(s.folderStack) : update; }),

  search: '',
  setSearch: (search) => set((s) => { s.search = search; }),

  charFilter: '',
  setCharFilter: (filter) => set((s) => { s.charFilter = filter; }),

  renamingId: null,
  setRenamingId: (id) => set((s) => { s.renamingId = id; }),

  renameVal: '',
  setRenameVal: (val) => set((s) => { s.renameVal = val; }),
});
