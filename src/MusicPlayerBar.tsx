/**
 * MusicPlayerBar.tsx — Miniature persistent music player widget.
 * Follows the user's request for a compact, unobtrusive UI without
 * speed controls, scrubber, skipping, or dragging.
 */
import React from "react";
import { useMusicPlayer } from "./musicPlayerContext";
import { useTranslation } from "./translationContext";

export function MusicPlayerBar({ inline }: { inline?: boolean }) {
  const { track, playing, volume, pause, resume, stop, setVol, muted, toggleMute } = useMusicPlayer();
  const { t } = useTranslation();

  if (!track) return null;

  const name = track.split("/").pop() ?? track;

  return (
    <div style={{
      position: inline ? "static" : "absolute",
      bottom: inline ? undefined : 40,
      left: inline ? undefined : 16,
      height: inline ? 36 : 44,
      borderRadius: inline ? 18 : 22,
      background: inline ? "color-mix(in srgb, var(--teal) 8%, transparent)" : "var(--bg1)",
      border: inline ? "1px solid color-mix(in srgb, var(--teal) 20%, transparent)" : "1px solid var(--bdr)",
      boxShadow: inline ? "none" : "0 4px 12px rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      padding: "0 14px 0 6px",
      gap: 12,
      zIndex: 100,
      userSelect: "none",
    }}>
      {/* Play/Pause Button */}
      <button
        onClick={() => playing ? pause() : resume()}
        title={playing ? t('music_player.pause') : t('music_player.play')}
        style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "var(--teal)", color: "var(--bg0)",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, flexShrink: 0,
          boxShadow: "0 0 8px color-mix(in srgb, var(--teal) 40%, transparent)",
        }}
      >
        {playing ? "⏸" : "▶"}
      </button>

      {/* Stop Button */}
      <button
        onClick={stop}
        title={t('music_player.stop')}
        style={{
          background: "none", border: "none", color: "rgba(248,113,113,0.8)",
          cursor: "pointer", fontSize: 16, padding: 0, flexShrink: 0,
        }}
      >
        ⏹
      </button>

      <div style={{ width: 1, height: 20, background: "var(--bdr)" }} />

      {/* Track Info */}
      <div style={{
        fontSize: 12, fontWeight: 600, color: "var(--text)",
        maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
      }} title={name}>
        {name.replace(/\.[^.]+$/, "")}
      </div>

      <div style={{ width: 1, height: 20, background: "var(--bdr)" }} />

      {/* Volume */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span 
          onClick={toggleMute}
          style={{ fontSize: 14, color: muted ? "var(--warn)" : "var(--dim)", cursor: "pointer", width: 16, textAlign: "center" }}
          title={muted ? t('music_player.unmute') : t('music_player.mute')}
        >
          {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
        </span>
        <input
          type="range"
          style={{ width: 60, height: 4, accentColor: "var(--teal)", cursor: "pointer" }}
          min={0} max={1} step={0.01}
          value={volume}
          onChange={e => {
            if (muted && parseFloat(e.target.value) > 0) toggleMute();
            setVol(parseFloat(e.target.value));
          }}
          title={t('music_player.volume').replace('{vol}', String(Math.round(volume * 100)))}
        />
      </div>
    </div>
  );
}
