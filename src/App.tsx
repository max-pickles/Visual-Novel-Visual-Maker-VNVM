import React, { useState, useEffect, useRef, memo } from "react";
import { StartScreen } from "./StartScreen";
import { VNEditor } from "./VNEditor";
import { setWindowSize, saveVnvProject, updateAppIcon } from "./tauriApi";
import type { VNProject, RpyProject } from "./types";
import { rpyToVnProject } from "./types";
import { ToastProvider, ToastManager } from "./toastContext";
import { ToastStack } from "./Toast";
import { MusicPlayerProvider } from "./musicPlayerContext";
import { TranslationProvider } from "./translationContext";

// We no longer need a hacky repeating progress bar.
// The root cause of Webview2 dropping input events when idle is focus state.
// If the document body has focus, Chromium treats the app as "Reading Mode"
// and throttles the OS message pump. By giving StoryCanvas tabIndex={0} and
// auto-focusing it, Chromium treats it as "Typing/Input Mode" and never drops keys.
const WebviewKeepalive = memo(function WebviewKeepalive() {
  return null;
});

type Route = "start" | "vnEditor" | "rpyViewer";
type BgLevel = 'darker' | 'default' | 'lighter';

const bgMap: Record<BgLevel, string> = {
  darker:  'var(--bg0)',
  default: 'var(--bg2)',
  lighter: 'var(--bg3)',
};

export interface AppPrefs {
  bgLevel: BgLevel;
  setBgLevel: (v: BgLevel) => void;
  glowEnabled: boolean;
  setGlowEnabled: (fn: (v: boolean) => boolean) => void;
  scanlinesEnabled: boolean;
  setScanlinesEnabled: (fn: (v: boolean) => boolean) => void;
  uiScale: string;
  setUiScale: (v: string) => void;
  autoSave: boolean;
  setAutoSave: (fn: (v: boolean) => boolean) => void;
  theme: string;
  setTheme: (v: string) => void;
  language: string;
  setLanguage: (v: string) => void;
  gamesDir: string;
  setGamesDir: (v: string) => void;
  renpySdkPath: string;
  setRenpySdkPath: (v: string) => void;
}

export default function App() {
  const [route, setRoute] = useState<Route>("start");
  const [vnvProject, setVnvProject] = useState<VNProject | null>(null);

  // ── Global Preferences ──
  const [bgLevel, setBgLevel]               = useState<BgLevel>(() => (localStorage.getItem('pref_bg') as BgLevel) || 'default');
  const [glowEnabled, setGlowEnabled]       = useState(() => localStorage.getItem('pref_glow') !== 'false');
  const [scanlinesEnabled, setScanlinesEnabled] = useState(() => localStorage.getItem('pref_scanlines') !== 'false');
  const [uiScale, setUiScale]               = useState(() => localStorage.getItem('pref_scale') || '100%');
  const [autoSave, setAutoSave]             = useState(() => localStorage.getItem('pref_autosave') !== 'false');
  const [theme, setTheme]                   = useState(() => {
    const t = localStorage.getItem('pref_theme') || 'vnv-dark';
    return t === 'crimson' ? 'cherry' : t;
  });
  const [language, setLanguage]             = useState(() => localStorage.getItem('pref_language') || 'en');
  const [gamesDir, setGamesDir]             = useState(() => localStorage.getItem('pref_games_dir') || 'C:/Users/maxcm/OneDrive/Desktop/VNVMAKER/games');
  const [renpySdkPath, setRenpySdkPath]     = useState(() => localStorage.getItem('vnv_renpy_sdk_path') || '');

  useEffect(() => { 
    localStorage.setItem('pref_bg', bgLevel); 
    document.documentElement.setAttribute('data-bg-level', bgLevel);
  }, [bgLevel]);
  useEffect(() => { localStorage.setItem('pref_glow', String(glowEnabled)); }, [glowEnabled]);
  useEffect(() => { localStorage.setItem('pref_scanlines', String(scanlinesEnabled)); }, [scanlinesEnabled]);
  useEffect(() => { 
    localStorage.setItem('pref_scale', uiScale);
    const scaleMap: Record<string, string> = { '100%': '1', '125%': '1.25', '150%': '1.5' };
    document.documentElement.style.zoom = scaleMap[uiScale] || '1';
  }, [uiScale]);
  useEffect(() => { localStorage.setItem('pref_autosave', String(autoSave)); }, [autoSave]);
  useEffect(() => { localStorage.setItem('pref_language', language); }, [language]);
  useEffect(() => { localStorage.setItem('pref_games_dir', gamesDir); }, [gamesDir]);
  useEffect(() => { localStorage.setItem('vnv_renpy_sdk_path', renpySdkPath); }, [renpySdkPath]);
  useEffect(() => {
    localStorage.setItem('pref_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    
    setTimeout(() => {
      const styles = getComputedStyle(document.documentElement);
      const teal = styles.getPropertyValue('--teal').trim();
      const acc = styles.getPropertyValue('--acc').trim();
      if (teal && acc) {
        updateAppIcon(teal, acc).catch(e => console.warn("Could not update icon:", e));
      }
    }, 50);
  }, [theme]);

  const prefs: AppPrefs = { bgLevel, setBgLevel, glowEnabled, setGlowEnabled, scanlinesEnabled, setScanlinesEnabled, uiScale, setUiScale, autoSave, setAutoSave, theme, setTheme, language, setLanguage, gamesDir, setGamesDir, renpySdkPath, setRenpySdkPath };

  const bg = bgMap[bgLevel];

  useEffect(() => {
    setWindowSize(1280, 800).catch(() => { /* non-critical */ });
  }, []);

  const inner = (() => {
    if (route === "start") {
      return (
        <StartScreen
          prefs={prefs}
          onLoadVnv={(p) => {
            // Auto-save immediately on any first load (new / open / import / recent)
            // so the .vnvmaker file always exists on disk before we enter the editor.
            if (p._filePath) {
              saveVnvProject(p._filePath, p).catch((e) =>
                ToastManager.error("Auto-save failed: " + String(e))
              );
            }
            setVnvProject(p);
            setRoute("vnEditor");
          }}
          onLoadRpy={(p: RpyProject) => {
            setVnvProject(rpyToVnProject(p));
            setRoute("vnEditor");
          }}
        />
      );
    }
    if (route === "vnEditor" && vnvProject) {
      return (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {scanlinesEnabled && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,200,0.012) 2px, rgba(0,212,200,0.012) 4px)', pointerEvents: 'none', opacity: 0.4, zIndex: 9999 }} />}
          <VNEditor
            project={vnvProject}
            onClose={() => setRoute("start")}
          />
        </div>
      );
    }
    return null;
  })();

  return (
    <TranslationProvider language={language}>
      <ToastProvider>
        <MusicPlayerProvider>
          <WebviewKeepalive />
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: bg }}>
            {inner}
          </div>
          {/* Global toast overlay — always on top regardless of route */}
          <ToastStack />
        </MusicPlayerProvider>
      </ToastProvider>
    </TranslationProvider>
  );
}
