/**
 * musicPlayerContext.tsx — Global singleton audio player.
 * Any component can call useMusicPlayer().play(path, rootPath, playlist) to
 * start playback and the MusicPlayerBar will appear at the bottom of the app.
 */
import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

export type PlayMode = "play_once" | "sequential" | "loop_one" | "shuffle";

export interface MusicPlayerState {
  /** relative path from project root, e.g. "audio/fight_boss.mp3" */
  track:    string | null;
  rootPath: string;
  playing:  boolean;
  duration: number;
  current:  number;
  volume:   number;
  muted:    boolean;
  playbackRate: number;
  playlist: string[];
  playMode: PlayMode;
}

interface MusicPlayerCtx extends MusicPlayerState {
  play:    (track: string, rootPath: string, playlist?: string[]) => void;
  pause:   () => void;
  resume:  () => void;
  stop:    () => void;
  seek:    (t: number) => void;
  setVol:  (v: number) => void;
  toggleMute: () => void;
  setSpeed: (rate: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  cyclePlayMode: () => void;
}

const Ctx = createContext<MusicPlayerCtx | null>(null);

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<MusicPlayerState>({
    track: null, rootPath: "", playing: false,
    duration: 0, current: 0, volume: 0.8,
    muted: false, playbackRate: 1.0,
    playlist: [], playMode: "sequential",
  });

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Tick: update current time every 100ms
  useEffect(() => {
    if (!state.playing) return;
    const id = setInterval(() => {
      if (audioRef.current) {
        setState(s => ({ ...s, current: audioRef.current!.currentTime }));
      }
    }, 100);
    return () => clearInterval(id);
  }, [state.playing]);

  const internalPlay = useCallback((track: string, rootPath: string, playlist: string[] = []) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    
    const clean = track.replace(/['"]/g, '');
    const paths = [clean];
    if (!clean.startsWith('game/')) {
      paths.push(`game/${clean}`);
      paths.push(`game/audio/${clean}`);
    }
    const urls = paths.map(p => convertFileSrc(`${rootPath}/${p}`));

    const a   = new Audio();
    const st = stateRef.current;
    a.volume  = st.volume;
    // We handle loop manually so we can advance playlists if needed
    a.loop    = false;
    a.muted   = st.muted;
    a.playbackRate = st.playbackRate;
    a.onloadedmetadata = () => setState(s => ({ ...s, duration: a.duration }));
    
    a.onended = () => {
      const currentSt = stateRef.current;
      if (currentSt.playMode === "loop_one") {
        a.currentTime = 0;
        a.play().catch(() => {});
      } else if (currentSt.playMode === "play_once") {
        setState(s => ({ ...s, playing: false, current: 0 }));
      } else {
        // sequential or shuffle
        handleTrackChange(1);
      }
    };

    const tryPlay = (index: number) => {
      if (index >= urls.length) {
        console.error("Audio playback failed for all candidate paths:", track);
        setState(s => ({ ...s, playing: false }));
        return;
      }
      a.src = urls[index];
      a.play().catch(() => {
        tryPlay(index + 1);
      });
    };

    tryPlay(0);
    audioRef.current = a;
    setState(s => ({ ...s, track, rootPath, playing: true, current: 0, duration: 0, playlist }));
  }, []);

  const handleTrackChange = useCallback((direction: 1 | -1) => {
    const s = stateRef.current;
    if (!s.playlist.length || !s.track) return;
    
    let nextIndex = 0;
    const currentIndex = s.playlist.indexOf(s.track);
    
    if (s.playMode === "shuffle") {
      nextIndex = Math.floor(Math.random() * s.playlist.length);
    } else {
      nextIndex = currentIndex + direction;
      if (nextIndex >= s.playlist.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = s.playlist.length - 1;
    }
    
    const nextTrack = s.playlist[nextIndex];
    if (nextTrack) {
      internalPlay(nextTrack, s.rootPath, s.playlist);
    }
  }, [internalPlay]);

  const play = useCallback((track: string, rootPath: string, playlist?: string[]) => {
    const newPlaylist = playlist || [track];
    internalPlay(track, rootPath, newPlaylist);
  }, [internalPlay]);

  const nextTrack = useCallback(() => handleTrackChange(1), [handleTrackChange]);
  const prevTrack = useCallback(() => handleTrackChange(-1), [handleTrackChange]);

  const pause  = useCallback(() => { audioRef.current?.pause(); setState(s => ({ ...s, playing: false })); }, []);
  const resume = useCallback(() => { audioRef.current?.play().catch(() => {}); setState(s => ({ ...s, playing: true })); }, []);
  const stop   = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setState(s => ({ ...s, track: null, playing: false, current: 0, duration: 0 }));
  }, []);
  const seek   = useCallback((t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t;
    setState(s => ({ ...s, current: t }));
  }, []);
  const setVol = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = v;
    setState(s => ({ ...s, volume: v }));
  }, []);
  const toggleMute = useCallback(() => {
    if (audioRef.current) audioRef.current.muted = !state.muted;
    setState(s => ({ ...s, muted: !s.muted }));
  }, [state.muted]);
  const setSpeed = useCallback((rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    setState(s => ({ ...s, playbackRate: rate }));
  }, []);

  const cyclePlayMode = useCallback(() => {
    setState(s => {
      let nextMode: PlayMode = "play_once";
      if (s.playMode === "play_once") nextMode = "sequential";
      else if (s.playMode === "sequential") nextMode = "loop_one";
      else if (s.playMode === "loop_one") nextMode = "shuffle";
      return { ...s, playMode: nextMode };
    });
  }, []);

  return (
    <Ctx.Provider value={{ 
      ...state, play, pause, resume, stop, seek, setVol, 
      toggleMute, setSpeed, nextTrack, prevTrack, cyclePlayMode 
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMusicPlayer(): MusicPlayerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMusicPlayer must be used inside MusicPlayerProvider");
  return ctx;
}
