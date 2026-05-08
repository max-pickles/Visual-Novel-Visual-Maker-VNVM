const fs = require('fs');

const viteConfigPath = 'C:/Users/maxcm/OneDrive/Desktop/MEME KING/renpy-8.5.2-sdk/bmf-vangard-renpy-ide-main/vite.config.ts';
const tauriApiPath = 'C:/Users/maxcm/OneDrive/Desktop/MEME KING/renpy-8.5.2-sdk/bmf-vangard-renpy-ide-main/lib/tauriAPI.ts';

// 1. Fix Vite Alias Error
let viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
if (!viteConfig.includes('resolve: {')) {
    viteConfig = viteConfig.replace(
        'plugins: [react()],',
        'plugins: [react()],\n    resolve: {\n      alias: {\n        "@": resolve(__dirname, "./")\n      }\n    },'
    );
    // Also disable Tauri strictPort requirement just in case
    viteConfig = viteConfig.replace(
        'base: \'./\',',
        'base: \'./\',\n    server: {\n      strictPort: true,\n      port: 5173,\n    },'
    );
    fs.writeFileSync(viteConfigPath, viteConfig);
    console.log('Successfully patched vite.config.ts');
}

// 2. Create the tauriAPI.ts compatibility layer
const tauriApiCode = `import { readTextFile, writeTextFile, mkdir, exists, remove, copyFile, rename, readDir } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Command, open as openShell } from '@tauri-apps/plugin-shell';
import { appDataDir, join } from '@tauri-apps/api/path';
import { listen } from '@tauri-apps/api/event';

export const tauriAPI = {
  // File System
  readFile: async (path: string) => await readTextFile(path),
  writeFile: async (path: string, content: string) => await writeTextFile(path, content),
  fileExists: async (path: string) => await exists(path),
  createDirectory: async (path: string) => await mkdir(path, { recursive: true }),
  removeEntry: async (path: string) => await remove(path, { recursive: true }),
  moveFile: async (oldPath: string, newPath: string) => await rename(oldPath, newPath),
  copyEntry: async (src: string, dest: string) => await copyFile(src, dest),
  scanDirectory: async (path: string) => {
     // A simple shim to match the existing electron format
     const entries = await readDir(path);
     return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory }));
  },
  
  // Dialogs
  openDirectory: async () => await open({ directory: true }),
  showSaveDialog: async (options: any) => await save(options),

  // Shell
  openExternal: async (url: string) => await openShell(url),

  // Games and Specific IDE commands
  runGame: async (renpyPath: string, projectPath: string, warpTarget: any) => {
      const args = [projectPath];
      if (warpTarget) args.push('--warp', warpTarget);
      const cmd = Command.create('exec-renpy', args);
      await cmd.execute();
  },

  // Path Utils
  path: {
      join: async (...args: string[]) => await join(...args)
  },

  // Fallback mocks for UI stuff (these will need true Rust backend implementations later)
  getAppSettings: async () => ({}),
  saveAppSettings: async () => {},
  getStartupArgs: async () => [],
  loadApiKeys: async () => ({}),
  getUserDataPath: async () => await appDataDir(),
  
  // Events
  onMenuCommand: () => () => {},
  onFileChangedExternally: () => () => {},
  onGameStarted: () => () => {},
  onGameStopped: () => () => {},
  onGameError: () => () => {},
};

// Polyfill window.electronAPI for backward compatibility during the switch
(window as any).electronAPI = tauriAPI;
`;

if (!fs.existsSync('C:/Users/maxcm/OneDrive/Desktop/MEME KING/renpy-8.5.2-sdk/bmf-vangard-renpy-ide-main/lib')) {
    fs.mkdirSync('C:/Users/maxcm/OneDrive/Desktop/MEME KING/renpy-8.5.2-sdk/bmf-vangard-renpy-ide-main/lib');
}
fs.writeFileSync(tauriApiPath, tauriApiCode);
console.log('Successfully created lib/tauriAPI.ts');
