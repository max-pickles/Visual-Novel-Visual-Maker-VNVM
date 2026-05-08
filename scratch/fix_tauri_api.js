const fs = require('fs');

const tauriApiPath = 'C:/Users/maxcm/OneDrive/Desktop/MEME KING/renpy-8.5.2-sdk/bmf-vangard-renpy-ide-main/lib/tauriAPI.ts';

const tauriApiCode = `// Tauri API Compatibility Layer
// This file maps window.electronAPI to Tauri's plugin APIs so the React
// frontend works without changes during the Electron -> Tauri migration.

import { readTextFile, writeTextFile, mkdir, exists, remove, copyFile, rename, readDir } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Command, open as openShell } from '@tauri-apps/plugin-shell';
import { appDataDir, join } from '@tauri-apps/api/path';

// A no-op event listener stub for Electron events that don't exist in Tauri yet.
// Returns a cleanup function (like the Electron version does).
const noopListener = (_callback: (...args: any[]) => void) => () => {};

const tauriAPI = {
  // --- File System ---
  readFile: async (path: string) => await readTextFile(path),
  writeFile: async (path: string, content: string, _encoding?: string) => await writeTextFile(path, content),
  fileExists: async (path: string) => await exists(path),
  createDirectory: async (path: string) => await mkdir(path, { recursive: true }),
  removeEntry: async (path: string) => await remove(path, { recursive: true }),
  moveFile: async (oldPath: string, newPath: string) => await rename(oldPath, newPath),
  copyEntry: async (src: string, dest: string) => await copyFile(src, dest),
  scanDirectory: async (path: string) => {
    const entries = await readDir(path);
    return entries.map((e: any) => ({ name: e.name, isDirectory: e.isDirectory, path: path + '/' + e.name }));
  },

  // --- Dialogs ---
  openDirectory: async () => {
    const result = await open({ directory: true, multiple: false });
    return result as string | null;
  },
  createProject: async () => {
    const result = await open({ directory: true, multiple: false });
    return result as string | null;
  },
  createProjectFromTemplate: async (_options: any) => {
    const result = await open({ directory: true, multiple: false });
    return result as string | null;
  },
  showSaveDialog: async (options: any) => await save(options),
  checkRenpyProject: async (_rootPath: string) => true,

  // --- Shell ---
  openExternal: async (url: string) => await openShell(url),

  // --- Game Execution ---
  selectRenpy: async () => {
    const result = await open({ multiple: false, filters: [{ name: 'Executable', extensions: ['exe', ''] }] });
    return result as string | null;
  },
  runGame: async (renpyPath: string, projectPath: string, warpTarget?: string) => {
    const args = [projectPath, 'run'];
    if (warpTarget) args.push('--warp', warpTarget);
    const cmd = Command.create('renpy', [renpyPath, ...args]);
    await cmd.spawn();
  },
  stopGame: async () => {},
  checkRenpyPath: async (_path: string) => true,
  generateTranslations: async (_sdkDir: string, _projectPath: string, _language: string) => {},

  // --- Project ---
  loadProject: async (_rootPath: string) => ({ files: [], assets: [] }),
  refreshProjectTree: async (_rootPath: string) => [],
  refreshProject: async (_rootPath: string) => {},
  cancelProjectLoad: () => {},
  onLoadProgress: noopListener,
  searchInProject: async (_options: any) => [],

  // --- App Settings ---
  getStartupArgs: async () => [],
  getAppSettings: async () => ({}),
  saveAppSettings: async (_settings: any) => {},
  getUserDataPath: async () => await appDataDir(),

  // --- API Keys ---
  loadApiKeys: async () => ({}),
  saveApiKey: async (_provider: string, _key: string) => {},
  getApiKey: async (_provider: string) => null,

  // --- Path Utils ---
  path: {
    join: async (...args: string[]) => await join(...args),
  },

  // --- Exit Confirmation Flow ---
  // These are Electron-specific IPC events; stubbed out as no-ops for Tauri.
  onCheckUnsavedChangesBeforeExit: noopListener,
  replyUnsavedChangesBeforeExit: (_hasUnsaved: boolean) => {},
  onShowExitModal: noopListener,
  onSaveIdeStateBeforeQuit: noopListener,
  ideStateSavedForQuit: () => {},
  forceQuit: () => {},

  // --- Menu Commands ---
  onMenuCommand: noopListener,
  updateExplorerMenuState: (_state: any) => {},

  // --- Auto-updater (stubbed for Tauri — use Tauri's own updater plugin later) ---
  onUpdateAvailable: noopListener,
  onUpdateNotAvailable: noopListener,
  onUpdateError: noopListener,
  onUpdateDownloaded: noopListener,
  installUpdate: () => {},

  // --- External File Change Notifications ---
  onFileChangedExternally: noopListener,

  // --- Game Events ---
  onGameStarted: noopListener,
  onGameStopped: noopListener,
  onGameError: noopListener,
};

// Polyfill window.electronAPI so the existing React code works unchanged.
(window as any).electronAPI = tauriAPI;

export { tauriAPI };
`;

fs.writeFileSync(tauriApiPath, tauriApiCode);
console.log('Successfully updated lib/tauriAPI.ts with all missing API stubs.');
