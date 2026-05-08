/**
 * AudioEditorView.tsx
 * Audio file previewer with live Web Audio canvas equalizer and metadata display.
 * Ported from legacy IDE — all Tailwind replaced with VNV Maker CSS variables.
 * Integrates with the AssetBrowser for in-place audio inspection.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

interface AudioEditorViewProps {
  filePath: string;    // absolute path to audio file
  rootPath: string;    // project root for relative display
  fileName: string;    // display name
}

// ── Waveform canvas ──────────────────────────────────────────────────────────

function drawEqualizer(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  playing: boolean,
  raf: { id: number },
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const bufLen = analyser.frequencyBinCount;
  const data = new Uint8Array(bufLen);

  const draw = () => {
    raf.id = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const barW = Math.max(1, (W / bufLen) * 2.5);
    const gap = barW * 0.2;
    const count = Math.floor(W / (barW + gap));

    for (let i = 0; i < count; i++) {
      const sample = data[Math.floor(i * bufLen / count)] / 255;
      const barH = sample * H;

      // Gradient bar
      const grad = ctx.createLinearGradient(0, H, 0, H - barH);
      grad.addColorStop(0, 'rgba(0,212,200,0.9)');
      grad.addColorStop(0.6, 'rgba(75,108,247,0.7)');
      grad.addColorStop(1, 'rgba(156,107,247,0.4)');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.roundRect(i * (barW + gap), H - barH, barW, barH, 2);
      ctx.fill();

      // Reflection
      ctx.fillStyle = 'rgba(0,212,200,0.08)';
      ctx.beginPath();
      ctx.roundRect(i * (barW + gap), H, barW, barH * 0.3, 2);
      ctx.fill();
    }

    if (!playing) { cancelAnimationFrame(raf.id); }
  };
  draw();
}

// ── Component ────────────────────────────────────────────────────────────────

const AudioEditorView: React.FC<AudioEditorViewProps> = ({ filePath, rootPath, fileName }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<{ id: number }>({ id: 0 });

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const url = convertFileSrc(filePath);

  // Setup Web Audio chain
  const setupAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
      analyserRef.current = ctxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
    }
    if (!sourceRef.current && analyserRef.current) {
      sourceRef.current = ctxRef.current.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctxRef.current.destination);
    }
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setupAudio();
    await ctxRef.current?.resume();
    await audio.play();
    setIsPlaying(true);
    if (canvasRef.current && analyserRef.current) {
      cancelAnimationFrame(rafRef.current.id);
      drawEqualizer(canvasRef.current, analyserRef.current, true, rafRef.current);
    }
  }, [setupAudio]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current.id);
  }, []);

  const seek = useCallback((t: number) => {
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  }, []);

  const changeVolume = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.volume = v;
    setVolume(v);
  }, []);

  // Cleanup on unmount / file change
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current.id);
      audioRef.current?.pause();
      setIsPlaying(false);
    };
  }, [filePath]);

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const relPath = filePath.startsWith(rootPath) ? filePath.slice(rootPath.length + 1).replace(/\\/g, '/') : fileName;

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg0)', overflow: 'hidden' }}>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={url}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => { setIsPlaying(false); cancelAnimationFrame(rafRef.current.id); }}
        preload="metadata"
        crossOrigin="anonymous"
      />

      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 8, background: 'linear-gradient(135deg,rgba(0,212,200,0.3),rgba(75,108,247,0.3))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0,
          }}>🎵</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
            <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)', marginTop: 2 }}>{relPath}</div>
          </div>
          <div style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(0,212,200,0.12)', border: '1px solid rgba(0,212,200,0.3)', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
            .{ext.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Equalizer canvas */}
      <div style={{ flexShrink: 0, padding: '0 16px', paddingTop: 12 }}>
        <canvas
          ref={canvasRef}
          width={440} height={80}
          style={{ width: '100%', height: 80, borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--bdr)' }}
        />
      </div>

      {/* Playback controls */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        {/* Seek bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)', width: 32, textAlign: 'right' }}>{fmtTime(currentTime)}</span>
          <input type="range" min={0} max={duration || 1} step={0.01} value={currentTime}
            onChange={e => seek(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--teal)', height: 4 }} />
          <span style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)', width: 32 }}>{fmtTime(duration)}</span>
        </div>

        {/* Play/pause + volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => seek(0)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', color: 'var(--dim)', fontSize: 14 }}
            title="Rewind"
          >⏮</button>

          <button
            onClick={isPlaying ? pause : play}
            style={{
              background: 'linear-gradient(135deg,var(--teal),var(--acc2))',
              border: 'none', borderRadius: 8, width: 44, height: 44, cursor: 'pointer',
              color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isPlaying ? '0 0 12px rgba(0,212,200,0.4)' : 'none', transition: 'box-shadow 0.2s',
            }}
          >{isPlaying ? '⏸' : '▶'}</button>

          <button
            onClick={pause}
            style={{ background: 'var(--bg3)', border: '1px solid var(--bdr)', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', color: 'var(--dim)', fontSize: 14 }}
            title="Stop"
          >⏹</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <span style={{ fontSize: 14 }}>🔊</span>
            <input type="range" min={0} max={1} step={0.01} value={volume}
              onChange={e => changeVolume(parseFloat(e.target.value))}
              style={{ width: 70, accentColor: 'var(--acc2)', height: 3 }} />
          </div>
        </div>
      </div>

      {/* Metadata section */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>FILE INFO</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['Filename', fileName],
            ['Path', relPath],
            ['Duration', duration > 0 ? fmtTime(duration) : '—'],
            ['Format', ext.toUpperCase()],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg2)', borderRadius: 5, border: '1px solid var(--bdr)' }}>
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: label === 'Path' ? 'var(--mono)' : 'inherit', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: label === 'Path' ? 'rtl' : 'ltr' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AudioEditorView;
