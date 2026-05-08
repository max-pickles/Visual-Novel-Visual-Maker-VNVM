/**
 * VoiceDirector.tsx — Voice Acting Pipeline
 *
 * Provides:
 *  - Per-character voice coverage dashboard
 *  - Per-line voice file assignment (with live audio preview)
 *  - Script export: plain text (.txt) or CSV (.csv) for voice actors
 *  - Auto-Assigner: scans a folder of audio files and links them by naming convention
 *    e.g. "eileen_001.ogg" → linked to Eileen's 1st unvoiced line
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { VNProject, VNScene, VNEvent, VNCharacter } from "./types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { readDir, writeFile, mkdir, exists, remove } from "@tauri-apps/plugin-fs";
import { useTranslation } from "./translationContext";

interface Props {
  project: VNProject;
  onProjectChange: (p: VNProject) => void;
  rootPath: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a flat ordered list of all dialogue events across all scenes */
function buildLineList(project: VNProject) {
  const lines: { sceneId: string; sceneName: string; event: VNEvent; char: VNCharacter | null; lineIdx: number }[] = [];
  const charLineCount: Record<string, number> = {};
  for (const sc of project.scenes) {
    for (const ev of sc.events) {
      if (ev.type === "dialogue" || (ev.type === "narration" && ev.text)) {
        const charId = ev.char_id ?? "narrator";
        charLineCount[charId] = (charLineCount[charId] ?? 0) + 1;
        const char = ev.char_id ? (project.characters.find(c => c.id === ev.char_id) ?? null) : null;
        lines.push({ sceneId: sc.id, sceneName: sc.label, event: ev, char, lineIdx: charLineCount[charId] });
      }
    }
  }
  return lines;
}

/** Try to match an audio filename to a character by prefix */
function matchFileToChar(filename: string, characters: VNCharacter[]): VNCharacter | null {
  const base = filename.toLowerCase().replace(/\.[^/.]+$/, ""); // strip extension
  // Try longest-name-first to avoid partial matches (e.g. "tom" matching "tommy")
  const sorted = [...characters].sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    const names = [c.name.toLowerCase(), c.display.toLowerCase()];
    for (const n of names) {
      if (base.startsWith(n + "_") || base.startsWith(n + "-") || base === n) {
        return c;
      }
    }
  }
  return null;
}

// ─── LineRecorder ─────────────────────────────────────────────────────────────
// Record mic audio for a specific line, save to project voice folder, auto-assign

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function LineRecorder({
  rootPath, charName, lineIdx, color, onSaved, compact = false, assignedPath,
}: {
  rootPath: string; charName: string; lineIdx: number;
  color?: string; onSaved: (path: string) => void; compact?: boolean;
  assignedPath?: string;
}) {
  const { t } = useTranslation();
  type RecState = 'idle' | 'recording' | 'reviewing' | 'saving';
  const [state, setState] = useState<RecState>('idle');
  const [elapsed, setElapsed]   = useState(0);
  const [blobUrl, setBlobUrl]   = useState<string | null>(null);
  const [blob, setBlob]         = useState<Blob | null>(null);
  const [recErr, setRecErr]     = useState<string | null>(null);
  const [filename, setFilename] = useState(`${charName.toLowerCase().replace(/\s+/g, "_")}_${String(lineIdx).padStart(3, "0")}`);
  const mrRef    = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<number>(0);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    if (blobUrl) { URL.revokeObjectURL(blobUrl); setBlobUrl(null); }
    setBlob(null); setElapsed(0); setRecErr(null);
  }, [blobUrl]);

  const startRec = useCallback(async () => {
    setRecErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const b = new Blob(chunksRef.current, { type: mimeType });
        setBlobUrl(URL.createObjectURL(b));
        setBlob(b);
        setState('reviewing');
      };
      mr.start(100);
      mrRef.current = mr;
      setElapsed(0);
      setState('recording');
      timerRef.current = window.setInterval(() => setElapsed(s => s + 1), 1000);
    } catch (e) {
      setRecErr(`Microphone unavailable: ${String(e)}`);
    }
  }, []);

  const stopRec = useCallback(() => {
    clearInterval(timerRef.current);
    mrRef.current?.stop();
  }, []);

  const accept = useCallback(async () => {
    if (!blob || !rootPath) return;
    setState('saving');
    const ext = 'ogg'; // Force .ogg format for the save dialog
    
    let baseName = "";
    if (assignedPath) {
      baseName = assignedPath.split(/[/\\]/).pop() || "";
      baseName = baseName.replace(/\.[^/.]+$/, ""); // Strip extension
    }
    if (!baseName.trim()) {
      baseName = `${charName.toLowerCase().replace(/\s+/g, "_")}_${String(lineIdx).padStart(3, "0")}`;
    }
    
    // Replace invalid characters, but KEEP spaces
    const safeBase = baseName.replace(/[^a-zA-Z0-9_\- \(\)]/g, "_").trim() || "recording";
    
    try {
      await mkdir(`${rootPath}/game/voice`, { recursive: true });
      
      const defaultPath = `${rootPath}/game/voice/${safeBase}.${ext}`;
      const filePath = await save({
        title: "Save Voice Recording",
        defaultPath,
        filters: [{ name: "Audio", extensions: ["ogg", "webm"] }]
      });

      if (!filePath) {
        // User cancelled the dialog
        setState('reviewing');
        return;
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      await writeFile(filePath, bytes);
      
      // Calculate relative path for the game
      const normRoot = `${rootPath}/game`.replace(/\\/g, "/");
      const normPath = filePath.replace(/\\/g, "/");
      let relPath = normPath.startsWith(normRoot) ? normPath.slice(normRoot.length + 1) : normPath;

      onSaved(relPath);
      cleanup();
      setState('idle');
    } catch (e) {
      setRecErr(`Save failed: ${String(e)}`);
      setState('reviewing');
    }
  }, [blob, rootPath, charName, lineIdx, assignedPath, onSaved, cleanup]);

  const retry = useCallback(() => { cleanup(); setState('idle'); }, [cleanup]);

  const acc = color ?? 'var(--err)';

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (state === 'idle') {
    if (compact) {
      return (
        <button className="btn btn-ghost btn-icon" style={{ fontSize: 12, color: 'var(--dim)', flexShrink: 0 }}
          onClick={startRec} title="Re-record this line">🎙️</button>
      );
    }
    return (
      <div className="col gap4">
        <button className="vnv-rec-btn" onClick={startRec}>{t("voice_director.record")}</button>
        {recErr && <div style={{ fontSize: 10, color: 'var(--err)' }}>{recErr}</div>}
      </div>
    );
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  if (state === 'recording') {
    return (
      <div className="vnv-recording-strip">
        <div className="vnv-rec-indicator" />
        <span className="vnv-rec-timer">{fmtTime(elapsed)}</span>
        <div className="vnv-rec-waves">
          {[...Array(8)].map((_, i) => <span key={i} />)}
        </div>
        <button className="vnv-stop-btn" onClick={stopRec}>{t("voice_director.stop")}</button>
      </div>
    );
  }

  // ── Reviewing ─────────────────────────────────────────────────────────────
  if (state === 'reviewing') {
    return (
      <div className="col gap6" style={{ background: "var(--bg1)", padding: 8, borderRadius: 6, border: "1px solid var(--bdr)" }}>
        <div className="row gap12" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, color: 'var(--warn)', fontWeight: 600 }}>{t("voice_director.review")}</div>
        </div>
        {blobUrl && <WaveformPlayer src={blobUrl} color={acc} />}
        {recErr && <div style={{ fontSize: 10, color: 'var(--err)' }}>{recErr}</div>}
        
        <div className="row gap6" style={{ marginTop: 2 }}>
          <button onClick={accept} style={{
            flex: 1, background: 'var(--teal)', color: '#000', border: 'none',
            borderRadius: 5, padding: '5px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>{t("voice_director.save")}</button>
          <button onClick={retry} className="btn btn-ghost" style={{ fontSize: 11 }}>{t("voice_director.retry")}</button>
          <button onClick={() => { cleanup(); setState('idle'); }} className="btn btn-ghost" style={{ fontSize: 11 }}>Cancel</button>
        </div>
      </div>
    );
  }

  // ── Saving ────────────────────────────────────────────────────────────────
  return <div style={{ fontSize: 11, color: 'var(--dim)', padding: '6px 0' }}>💾 Saving…</div>;
}

// ─── WaveformPlayer ──────────────────────────────────────────────────────────
// Inspired by Audacity WaveformView.cpp + MixerBoard MeterPanel

const BAR_COUNT = 80;

function WaveformPlayer({ src, color }: { src: string; color?: string }) {
  const audioRef    = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef   = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef      = useRef<number>(0);
  const vuBarRef    = useRef<HTMLDivElement>(null);
  const scrubRef    = useRef<HTMLDivElement>(null);
  const headRef     = useRef<HTMLDivElement>(null);

  const [loading, setLoading]     = useState(true);
  const [peaks, setPeaks]         = useState<{ max: number; rms: number }[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clipping, setClipping]   = useState(false);

  // ── Decode waveform peaks ──────────────────────────────────────────────────
  useEffect(() => {
    if (!src) return;
    let dead = false;
    setLoading(true); setPeaks([]); setClipping(false); setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);

    (async () => {
      try {
        const buf  = await (await fetch(src)).arrayBuffer();
        if (dead) return;
        const dCtx = new AudioContext();
        const decoded = await dCtx.decodeAudioData(buf);
        await dCtx.close();
        if (dead) return;
        const data = decoded.getChannelData(0);
        const spb  = Math.floor(data.length / BAR_COUNT);
        const out: { max: number; rms: number }[] = [];
        let clip = false;
        for (let i = 0; i < BAR_COUNT; i++) {
          const s = i * spb, e = Math.min(s + spb, data.length);
          let mx = 0, sq = 0;
          for (let j = s; j < e; j++) {
            const a = Math.abs(data[j]);
            if (a > mx) mx = a;
            if (a > 0.95) clip = true;
            sq += data[j] * data[j];
          }
          out.push({ max: mx, rms: Math.sqrt(sq / (e - s)) });
        }
        if (!dead) { setPeaks(out); setClipping(clip); }
      } catch { /* fetch or decode failed — silent */ }
      finally   { if (!dead) setLoading(false); }
    })();

    return () => { dead = true; };
  }, [src]);

  // ── Cleanup AudioContext on src change / unmount ───────────────────────────
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    sourceRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, [src]);

  // ── RAF loop: scrubber + VU meter ─────────────────────────────────────────
  const startRaf = useCallback(() => {
    const tick = () => {
      const au = audioRef.current, an = analyserRef.current;
      if (!au || !an) return;
      const pct = au.duration > 0 ? au.currentTime / au.duration : 0;
      if (scrubRef.current) scrubRef.current.style.width = `${pct * 100}%`;
      if (headRef.current)  headRef.current.style.left  = `${pct * 100}%`;
      const td = new Uint8Array(an.frequencyBinCount);
      an.getByteTimeDomainData(td);
      let s = 0;
      for (let i = 0; i < td.length; i++) { const v = (td[i] - 128) / 128; s += v * v; }
      if (vuBarRef.current) vuBarRef.current.style.height = `${Math.min(100, Math.sqrt(s / td.length) * 300)}%`;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Play / Pause ───────────────────────────────────────────────────────────
  const togglePlay = useCallback(async () => {
    const au = audioRef.current;
    if (!au) return;
    if (isPlaying) {
      au.pause();
      cancelAnimationFrame(rafRef.current);
      if (vuBarRef.current) vuBarRef.current.style.height = '0%';
      setIsPlaying(false);
      return;
    }
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
    if (!sourceRef.current) {
      sourceRef.current = audioCtxRef.current.createMediaElementSource(au);
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
    }
    try { await au.play(); setIsPlaying(true); startRaf(); }
    catch { setIsPlaying(false); }
  }, [isPlaying, startRaf]);

  const onEnded = useCallback(() => {
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
    if (vuBarRef.current) vuBarRef.current.style.height = '0%';
    if (scrubRef.current) scrubRef.current.style.width  = '0%';
    if (headRef.current)  headRef.current.style.left    = '0%';
  }, []);

  const acc = color ?? 'var(--teal)';
  const H = 28;

  return (
    <div className="vnv-audio-strip">
      {loading && <div className="vnv-wave-loading" />}

      {/* Play / Pause — Audacity transport style */}
      <button className="vnv-play-btn" style={{ background: acc }} onClick={togglePlay}
        title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Waveform SVG area — WaveformView.cpp analog */}
      <div className="vnv-waveform-svg">
        <div className="vnv-scrubber-fill" ref={scrubRef} />
        {peaks.length > 0 && (
          <svg width="100%" height={H} preserveAspectRatio="none"
            viewBox={`0 0 ${BAR_COUNT * 2} ${H}`} style={{ display: 'block' }}>
            {peaks.map((p, i) => {
              const cx = i * 2, hh = H / 2;
              const mh = p.max * hh, rh = p.rms * hh;
              return (
                <g key={i}>
                  <rect className="vnv-wave-bar-rms"    x={cx}      y={hh - rh} width={1.5} height={Math.max(rh * 2, 1)} />
                  <rect className="vnv-wave-bar-sample" x={cx + 0.25} y={hh - mh} width={1}   height={Math.max(mh * 2, 1)} />
                </g>
              );
            })}
          </svg>
        )}
        <div className="playhead" ref={headRef} style={{ left: '0%' }} />
      </div>

      {/* VU Peak Meter — MixerBoard MeterPanel analog */}
      <div className="vnv-vu-meter">
        <div className="vnv-vu-bar" ref={vuBarRef} style={{ height: '0%' }} />
        <div className={`vnv-clip-indicator${clipping ? ' clipping' : ''}`} />
      </div>

      <audio ref={audioRef} src={src} crossOrigin="anonymous" onEnded={onEnded} style={{ display: 'none' }} />
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────


export default function VoiceDirector({ project, onProjectChange, rootPath }: Props) {
  const { t } = useTranslation();
  const [selCharId, setSelCharId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [exportFmt, setExportFmt] = useState<"txt" | "csv">("txt");
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoAssignLog, setAutoAssignLog] = useState<string[]>([]);
  const [showAutoLog, setShowAutoLog] = useState(false);
  const [studioMode, setStudioMode] = useState(false);

  const allLines = useMemo(() => buildLineList(project), [project]);

  // Stats per character
  const charStats = useMemo(() => {
    const stats: Record<string, { total: number; voiced: number }> = {};
    for (const line of allLines) {
      const cid = line.event.char_id ?? "narrator";
      if (!stats[cid]) stats[cid] = { total: 0, voiced: 0 };
      stats[cid].total++;
      if (line.event.voice) stats[cid].voiced++;
    }
    return stats;
  }, [allLines]);

  const activeLines = useMemo(() => {
    const targetCid = selCharId ?? "narrator";
    return allLines.filter(l => (l.event.char_id ?? "narrator") === targetCid);
  }, [allLines, selCharId]);

  const filteredLines = useMemo(() => {
    if (!search) return activeLines;
    const q = search.toLowerCase();
    return activeLines.filter(l => (l.event.text || "").toLowerCase().includes(q));
  }, [activeLines, search]);

  const activeChar = selCharId ? project.characters.find(c => c.id === selCharId) : null;
  const activeStats = charStats[selCharId ?? "narrator"] ?? { total: 0, voiced: 0 };
  const coverage = activeStats.total > 0 ? Math.round((activeStats.voiced / activeStats.total) * 100) : 0;

  // ── Voice assignment ────────────────────────────────────────────────────────
  const updateVoice = (sceneId: string, eventId: string, voicePath: string) => {
    const newScenes = project.scenes.map(sc => {
      if (sc.id !== sceneId) return sc;
      return { ...sc, events: sc.events.map(ev => ev.id === eventId ? { ...ev, voice: voicePath } : ev) };
    });
    onProjectChange({ ...project, scenes: newScenes });
  };

  const assignExistingVoice = async (sceneId: string, eventId: string) => {
    try {
      const selected = await open({
        title: "Assign Voice File",
        defaultPath: rootPath ? `${rootPath}/game/voice` : undefined,
        filters: [{ name: "Audio", extensions: ["ogg", "mp3", "wav", "flac"] }],
        multiple: false,
        directory: false,
      });
      if (typeof selected === 'string') {
        const normRoot = `${rootPath}/game`.replace(/\\/g, "/");
        const normPath = selected.replace(/\\/g, "/");
        let relPath = normPath.startsWith(normRoot) ? normPath.slice(normRoot.length + 1) : normPath;
        updateVoice(sceneId, eventId, relPath);
      }
    } catch (err) {
      console.error("Failed to select file", err);
    }
  };

  const clearVoice = (sceneId: string, eventId: string) => updateVoice(sceneId, eventId, "");

  const deleteVoice = async (sceneId: string, eventId: string, voicePath: string) => {
    const confirmed = await ask("Are you sure you want to delete this file?", { title: "Delete Voice File", kind: "warning" });
    if (confirmed) {
      try {
        await remove(`${rootPath}/game/${voicePath}`);
      } catch (err) {
        console.error("Failed to delete file:", err);
      }
      clearVoice(sceneId, eventId);
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportScript = () => {
    const charName = activeChar?.name ?? "Narrator";
    const charDisplay = activeChar?.display ?? "Narrator";

    let content = "";
    let filename = "";

    if (exportFmt === "csv") {
      // CSV for spreadsheet VA management
      const rows = [
        ["Line #", "Scene", "Character", "Dialogue", "Voice File", "Status"],
        ...activeLines.map((l, i) => [
          String(i + 1).padStart(3, "0"),
          l.sceneName,
          charDisplay,
          `"${(l.event.text ?? "").replace(/"/g, '""')}"`,
          l.event.voice ?? "",
          l.event.voice ? "✓ Assigned" : "⚠ Unvoiced",
        ]),
      ];
      content = rows.map(r => r.join(",")).join("\n");
      filename = `${charName}_VoiceScript.csv`;
    } else {
      // Plain text script for VA recording
      const header = [
        `═══════════════════════════════════════`,
        `  VNV MAKER — VOICE ACTING SCRIPT`,
        `  Character: ${charDisplay}`,
        `  Project:   ${project.title}`,
        `  Lines:     ${activeLines.length} (${activeStats.voiced} ${t("voice_director.voiced")}, ${activeStats.total - activeStats.voiced} ${t("voice_director.unvoiced")})`,
        `═══════════════════════════════════════`,
        "",
      ].join("\n");

      const body = activeLines.map((l, i) => [
        `[${String(i + 1).padStart(3, "0")}] Scene: ${l.sceneName}`,
        `  File:    ${l.event.voice || "(unassigned)"}`,
        `  Line:    ${charDisplay}: "${l.event.text ?? ""}"`,
        "",
      ].join("\n")).join("\n");

      content = header + body;
      filename = `${charName}_VoiceScript.txt`;
    }

    const blob = new Blob([content], { type: exportFmt === "csv" ? "text/csv" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export ALL characters ──────────────────────────────────────────────────
  const exportAll = () => {
    const allChars = [
      { id: "narrator", display: "Narrator", name: "Narrator" },
      ...project.characters.map(c => ({ id: c.id, display: c.display, name: c.name })),
    ];

    const rows = [
      ["Line #", "Scene", "Character", "Dialogue", "Voice File", "Status"],
    ];
    let globalIdx = 0;
    for (const { id, display } of allChars) {
      const lines = allLines.filter(l => (l.event.char_id ?? "narrator") === id);
      for (const l of lines) {
        globalIdx++;
        rows.push([
          String(globalIdx).padStart(4, "0"),
          l.sceneName,
          display,
          `"${(l.event.text ?? "").replace(/"/g, '""')}"`,
          l.event.voice ?? "",
          l.event.voice ? "✓" : "⚠",
        ]);
      }
    }

    const content = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.replace(/\s+/g, "_")}_FullVoiceScript.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Auto-Assigner ───────────────────────────────────────────────────────────
  const runAutoAssign = async () => {
    setAutoAssigning(true);
    setAutoAssignLog([]);
    setShowAutoLog(true);

    try {
      // Let user pick the audio folder, or scan the project's audio directory
      const folderPath = await open({
        directory: true,
        title: "Select Voice Audio Folder",
        defaultPath: rootPath ? `${rootPath}/game/voice` : undefined,
      }) as string | null;

      if (!folderPath) { setAutoAssigning(false); return; }

      // List all audio files in the folder
      const audioExts = [".ogg", ".wav", ".mp3", ".opus", ".flac"];
      const dirEntries = await readDir(folderPath);
      const audioFiles = dirEntries
        .filter(e => !e.isDirectory && audioExts.some(ext => (e.name ?? "").toLowerCase().endsWith(ext)))
        .map(e => `${folderPath}/${e.name}`);

      if (audioFiles.length === 0) {
        setAutoAssignLog(["⚠ No audio files found in the selected folder."]);
        setAutoAssigning(false);
        return;
      }

      const log: string[] = [`📁 Found ${audioFiles.length} audio files. Matching...`, ""];

      // Build a mutable scene map
      const newScenes = project.scenes.map(sc => ({ ...sc, events: sc.events.map(ev => ({ ...ev })) }));
      const sceneMap: Record<string, typeof newScenes[number]> = {};
      for (const sc of newScenes) sceneMap[sc.id] = sc;

      // Build per-character ordered unvoiced line lists
      const unvoicedByChar: Record<string, { sceneId: string; event: VNEvent }[]> = { narrator: [] };
      for (const c of project.characters) unvoicedByChar[c.id] = [];
      for (const sc of newScenes) {
        for (const ev of sc.events) {
          if (ev.type === "dialogue" || ev.type === "narration") {
            if (!ev.voice) {
              const cid = ev.char_id ?? "narrator";
              if (!unvoicedByChar[cid]) unvoicedByChar[cid] = [];
              unvoicedByChar[cid].push({ sceneId: sc.id, event: ev });
            }
          }
        }
      }

      let assigned = 0;
      let skipped = 0;

      for (const filepath of audioFiles) {
        const filename = filepath.split(/[/\\]/).pop() ?? filepath;
        const relPath = filepath.startsWith(rootPath)
          ? filepath.slice(rootPath.length).replace(/^[/\\]/, "").replace(/\\/g, "/")
          : filename;

        // Try to match by character name prefix
        const matchedChar = matchFileToChar(filename, project.characters);
        const charId = matchedChar?.id ?? "narrator";
        const queue = unvoicedByChar[charId];

        if (queue && queue.length > 0) {
          const { sceneId, event } = queue.shift()!;
          const sc = sceneMap[sceneId];
          if (sc) {
            const evIdx = sc.events.findIndex(e => e.id === event.id);
            if (evIdx !== -1) {
              sc.events[evIdx] = { ...sc.events[evIdx], voice: relPath };
              const charName = matchedChar?.display ?? "Narrator";
              log.push(`✓ [${charName}] "${filename}" → "${(event.text ?? "").slice(0, 50)}…"`);
              assigned++;
            }
          }
        } else {
          log.push(`  ⏭ Skipped "${filename}" (no unvoiced lines for matched character)`);
          skipped++;
        }
      }

      log.push("", `─── Summary ───────────────────────────`);
      log.push(`✅ ${assigned} line${assigned !== 1 ? "s" : ""} auto-assigned`);
      if (skipped > 0) log.push(`⏭ ${skipped} file${skipped !== 1 ? "s" : ""} skipped (no match)`);

      setAutoAssignLog(log);
      if (assigned > 0) {
        onProjectChange({ ...project, scenes: newScenes });
      }
    } catch (e) {
      setAutoAssignLog([`❌ Error: ${String(e)}`]);
    } finally {
      setAutoAssigning(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className={`flex1 ${studioMode ? "vnv-studio-mode" : ""}`} style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg0)" }}>

      {/* ── Left Sidebar: Characters ── */}
      {!studioMode && (
        <div className="col" style={{ width: 260, borderRight: "1px solid var(--bdr)", background: "var(--bg1)" }}>
        <div className="row sec-hdr" style={{ padding: "12px 16px", borderBottom: "1px solid var(--bdr)", justifyContent: "space-between", alignItems: "center" }}>
          <span>{t("voice_director.title")}</span>
        </div>

        {/* Overall project coverage donut */}
        <div style={{ padding: "16px", borderBottom: "1px solid var(--bdr)", display: "flex", alignItems: "center", gap: 16 }}>
          {(() => {
            const tot = allLines.length;
            const voiced = allLines.filter(l => l.event.voice).length;
            const pct = tot > 0 ? Math.round((voiced / tot) * 100) : 0;
            const r = 22;
            const circ = 2 * Math.PI * r;
            const dash = (pct / 100) * circ;
            const color = pct === 100 ? "var(--teal)" : pct > 50 ? "var(--warn)" : "var(--err)";
            return (
              <>
                {/* SVG Donut */}
                <svg width={56} height={56} style={{ flexShrink: 0 }}>
                  <circle cx={28} cy={28} r={r} fill="none" stroke="var(--bg3)" strokeWidth={5} />
                  <circle
                    cx={28} cy={28} r={r} fill="none"
                    stroke={color} strokeWidth={5}
                    strokeDasharray={`${dash} ${circ}`}
                    strokeLinecap="round"
                    transform="rotate(-90 28 28)"
                    style={{ transition: "stroke-dasharray 0.5s ease" }}
                  />
                  <text x={28} y={32} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>{pct}%</text>
                </svg>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{t("voice_director.project_coverage")}</div>
                  <div style={{ fontSize: 10, color: "var(--dim)" }}>{voiced}/{tot} {t("voice_director.voiced")}</div>
                </div>
              </>
            );
          })()}
        </div>

        <div className="col" style={{ flex: 1, overflowY: "auto", padding: 8, gap: 4 }}>
          {/* Narrator */}
          <div className={`nav-item ${selCharId === null ? "active" : ""}`} onClick={() => setSelCharId(null)} style={{ padding: "10px 12px", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 15, background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📖</div>
            <div className="col flex1" style={{ gap: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t("voice_director.narrator")}</div>
              <div style={{ fontSize: 10, color: "var(--dim)" }}>{charStats["narrator"]?.total ?? 0} {t("voice_director.lines")}</div>
            </div>
            {(charStats["narrator"]?.total ?? 0) > 0 && (
              <VoiceCoverageChip stats={charStats["narrator"]} />
            )}
          </div>

          {project.characters.map(c => {
            const stats = charStats[c.id] ?? { total: 0, voiced: 0 };
            const cPct = stats.total > 0 ? Math.round((stats.voiced / stats.total) * 100) : 0;
            return (
              <div key={c.id} className={`nav-item ${selCharId === c.id ? "active" : ""}`} onClick={() => setSelCharId(c.id)} style={{ padding: "10px 12px", gap: 10 }}>
                {/* Color-ring avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: `color-mix(in srgb, ${c.color} 15%, var(--bg3))`,
                  border: `2.5px solid ${c.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: c.color, fontWeight: 800, fontSize: 14,
                  boxShadow: selCharId === c.id ? `0 0 10px color-mix(in srgb, ${c.color} 40%, transparent)` : "none",
                  flexShrink: 0, transition: "box-shadow 0.2s",
                }}>
                  {c.display.charAt(0).toUpperCase()}
                </div>
                <div className="col flex1" style={{ gap: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.color }}>{c.display}</div>
                  <div style={{ fontSize: 10, color: "var(--dim)" }}>{stats.total} {t("voice_director.lines")} · {cPct}% {t("voice_director.voiced")}</div>
                </div>
                {stats.total > 0 && <VoiceCoverageChip stats={stats} />}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ── Right Area: Lines + Controls ── */}
      <div className="col flex1" style={{ overflow: "hidden" }}>

        {/* Header */}
        <div className="row" style={{ padding: "16px 24px", borderBottom: "1px solid var(--bdr)", background: "var(--bg1)", gap: 16, alignItems: "center" }}>
          <div className="col gap4 flex1">
            <div style={{ fontSize: 18, fontWeight: 700, color: activeChar?.color ?? "var(--text)" }}>
              {activeChar?.display ?? t("voice_director.narrator")} Voice Lines
            </div>
            <div className="row gap12" style={{ fontSize: 11, color: "var(--dim)" }}>
              <span>{activeStats.total} {t("voice_director.lines")}</span>
              <span>•</span>
              <span style={{ color: coverage === 100 ? "var(--teal)" : coverage > 0 ? "var(--warn)" : "var(--faint)" }}>
                {activeStats.voiced} {t("voice_director.voiced")} ({coverage}%)
              </span>
            </div>
          </div>
        </div>

        {/* VoiceToolbar */}
        <div className="row" style={{ background: "var(--bg2)", borderBottom: "1px solid var(--bdr)", padding: "6px 14px", gap: 12, alignItems: "center", flexShrink: 0 }}>
          {/* Studio Mode Toggle */}
          <button className={`btn ${studioMode ? 'btn-teal' : 'btn-ghost'}`} onClick={() => setStudioMode(!studioMode)} title="Toggle Studio Mode for recording">
            {t("voice_director.studio_mode")}
          </button>
          
          <div style={{ width: 1, height: 20, background: "var(--bdr)", margin: "0 4px" }} />

          {/* Search */}
          <input className="input" style={{ width: 200, padding: "4px 8px", fontSize: 12 }}
            placeholder={t("voice_director.search_ph")} value={search} onChange={e => setSearch(e.target.value)} />
            
          <div className="flex1" />

          {/* Tools */}
          <button
            className="btn btn-ghost"
            onClick={runAutoAssign}
            disabled={autoAssigning}
            style={{ color: "var(--acc2)", fontSize: 11 }}
            title="Scan a folder of audio files and auto-link them to unvoiced lines by character name prefix"
          >
            {autoAssigning ? t("voice_director.scanning") : t("voice_director.auto_assign")}
          </button>
          
          <div style={{ width: 1, height: 20, background: "var(--bdr)", margin: "0 4px" }} />
          
          <div className="row gap6" style={{ alignItems: "center" }}>
            <select className="input" style={{ fontSize: 11, padding: "3px 6px", width: 60 }}
              value={exportFmt} onChange={e => setExportFmt(e.target.value as "txt" | "csv")}>
              <option value="txt">.txt</option>
              <option value="csv">.csv</option>
            </select>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={exportScript} disabled={activeStats.total === 0}>
              {t("voice_director.export_char")}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={exportAll} disabled={allLines.length === 0} title="Export all characters to a single CSV">
              {t("voice_director.export_all")}
            </button>
          </div>
        </div>

        {/* Auto-assign log panel */}
        {showAutoLog && autoAssignLog.length > 0 && (
          <div style={{ margin: "12px 24px 0", background: "var(--bg1)", borderRadius: 8, border: "1px solid var(--bdr)", maxHeight: 160, overflow: "hidden", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div className="row" style={{ padding: "8px 12px", background: "var(--bg2)", borderBottom: "1px solid var(--bdr)", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--teal)" }}>{t("voice_director.auto_assign_results")}</span>
              <button className="btn btn-ghost btn-icon" style={{ fontSize: 11 }} onClick={() => setShowAutoLog(false)}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)", lineHeight: 1.7 }}>
              {autoAssignLog.map((line, i) => (
                <div key={i} style={{ color: line.startsWith("✓") ? "var(--teal)" : line.startsWith("❌") ? "var(--err)" : line.startsWith("⚠") ? "var(--warn)" : "var(--dim)" }}>
                  {line || "\u00a0"}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lines List */}
        <div className="col" style={{ flex: 1, overflowY: "auto", padding: "16px 24px", gap: 10 }}>
          {filteredLines.map((l, i) => {
            const voiced = !!l.event.voice;
            const charColor = l.char?.color;
            const safePath = `${rootPath}/game/${l.event.voice}`.replace(/\\/g, "/");
            const audioSrc = voiced ? convertFileSrc(safePath) : '';
            const filename  = l.event.voice?.split('/').pop() ?? '';
            return (
              <div key={l.event.id} className={`col ${voiced ? 'vnv-line-card-voiced' : 'vnv-line-card-unvoiced'}`} style={{
                borderRadius: 8, border: '1px solid var(--bdr)',
                overflow: 'hidden', transition: 'border-color 0.2s',
                animation: 'vnv-fade-slide-in 0.15s ease both',
                animationDelay: `${i * 0.03}s`,
                flexShrink: 0,
              }}>

                {/* Clip affordance header (TrackArt::DrawClipAffordance) — voiced only */}
                {voiced && (
                  <div className="vnv-clip-affordance">
                    <div className="clip-dot" />
                    {filename}
                  </div>
                )}

                {/* Main card row */}
                <div className="row gap16" style={{ padding: '14px 16px' }}>

                  {/* Index + voiced dot */}
                  <div className="col" style={{ alignItems: 'center', gap: 4, width: 32, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
                      {(i + 1).toString().padStart(3, '0')}
                    </div>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: voiced ? 'var(--teal)' : 'var(--bg3)',
                      border: `1px solid ${voiced ? 'var(--teal)' : 'var(--bdr)'}`,
                      boxShadow: voiced ? '0 0 6px var(--teal)' : 'none',
                      animation: voiced ? 'vnv-pulse 2.5s ease-in-out infinite' : 'none',
                      transition: 'all 0.3s',
                    }} title={voiced ? 'Voiced' : 'Unvoiced'} />
                  </div>

                  {/* Dialogue text */}
                  <div className="col gap6 flex1" style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--teal)', letterSpacing: '.05em', textTransform: 'uppercase' }}>{l.sceneName}</div>
                    <div className="vnv-dialogue-text" style={{ lineHeight: 1.6, color: 'var(--text)' }}>"{l.event.text}"</div>
                  </div>

                  {/* Channel strip (MixerBoard cluster style) */}
                  <div className="col gap6 vnv-channel-strip" style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: '.07em' }}>VOICE FILE</div>
                    {voiced ? (
                      <div style={{ fontSize: 12, color: 'var(--teal)', fontFamily: 'var(--mono)', padding: '6px 0', wordBreak: 'break-all', display: 'flex', alignItems: 'center', height: 28 }}>
                        {l.event.voice}
                      </div>
                    ) : (
                      <div
                        onClick={() => assignExistingVoice(l.sceneId, l.event.id)}
                        style={{ fontSize: 11, color: 'var(--faint)', fontStyle: 'italic', padding: '6px 0', display: 'flex', alignItems: 'center', height: 28, cursor: 'pointer', textDecoration: 'underline' }}
                        title="Click to assign an existing audio file"
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--faint)'}
                      >
                        (Not assigned)
                      </div>
                    )}
                    {/* Waveform player OR recorder */}
                    {voiced ? (
                      <div className="row gap6" style={{ alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <WaveformPlayer src={audioSrc} color={charColor} />
                        </div>
                        <LineRecorder
                          rootPath={rootPath}
                          charName={l.char?.name ?? 'narrator'}
                          lineIdx={l.lineIdx}
                          color={charColor}
                          assignedPath={l.event.voice}
                          onSaved={(path) => updateVoice(l.sceneId, l.event.id, path)}
                          compact
                        />
                        <button className="btn btn-ghost"
                          style={{ fontSize: 11, color: 'var(--dim)', flexShrink: 0, padding: '4px 8px' }}
                          onClick={() => clearVoice(l.sceneId, l.event.id)}
                          title="Unassign voice without deleting the file">Unassign</button>
                        <button className="btn btn-ghost btn-icon"
                          style={{ fontSize: 14, color: 'var(--err)', flexShrink: 0 }}
                          onClick={() => deleteVoice(l.sceneId, l.event.id, l.event.voice!)}
                          title="Delete file permanently">🗑️</button>
                      </div>
                    ) : (
                      <LineRecorder
                        rootPath={rootPath}
                        charName={l.char?.name ?? 'narrator'}
                        lineIdx={l.lineIdx}
                        color={charColor}
                        assignedPath={l.event.voice}
                        onSaved={(path) => updateVoice(l.sceneId, l.event.id, path)}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}


          {filteredLines.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--faint)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎙️</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No lines found</div>
              <div style={{ fontSize: 12 }}>
                {allLines.length === 0 ? "Add dialogue events to your scenes first." : "Try a different search or select another character."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VoiceCoverageChip({ stats }: { stats: { total: number; voiced: number } }) {
  const pct = stats.total > 0 ? Math.round((stats.voiced / stats.total) * 100) : 0;
  const color = pct === 100 ? "var(--teal)" : pct > 0 ? "var(--warn)" : "var(--faint)";
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color, background: pct === 100 ? "color-mix(in srgb, var(--teal) 10%, transparent)" : "transparent", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>
      {pct}%
    </div>
  );
}
