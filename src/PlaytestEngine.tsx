/**
 * PlaytestEngine.tsx — Web-Based Playtest Engine for VNVMaker.
 * Allows playing through the visual novel graph directly in the IDE.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { VNEvent, VNProject, VNScene } from "./types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "./translationContext";
import { useMusicPlayer } from "./musicPlayerContext";
import { MusicPlayerBar } from "./MusicPlayerBar";

const EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

function candidates(rootPath: string, name: string): string[] {
  if (!name || !rootPath) return [];
  const norm = name.replace(/\s+/g, "_");
  const urls: string[] = [];
  for (const base of [name, norm]) {
    if (/\.[a-zA-Z]{2,5}$/.test(base)) {
      urls.push(convertFileSrc(`${rootPath}/${base}`));
      if (!base.startsWith("game/")) {
        urls.push(convertFileSrc(`${rootPath}/game/${base}`));
        urls.push(convertFileSrc(`${rootPath}/game/images/${base}`));
      }
      if (!base.startsWith("images/")) urls.push(convertFileSrc(`${rootPath}/images/${base}`));
    } else {
      for (const ext of EXTS) {
        urls.push(convertFileSrc(`${rootPath}/game/images/${base}${ext}`));
        urls.push(convertFileSrc(`${rootPath}/images/${base}${ext}`));
        urls.push(convertFileSrc(`${rootPath}/${base}${ext}`));
      }
    }
  }
  return [...new Set(urls)];
}

function useResolvedImage(rootPath: string, name: string | null) {
  const list = useMemo(() => (name ? candidates(rootPath, name) : []), [rootPath, name]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setIdx(0); setFailed(false); }, [list.join("|")]);

  const url = (!failed && list.length > 0) ? list[idx] ?? null : null;
  const onErr = useCallback(() => {
    if (idx + 1 < list.length) setIdx(i => i + 1);
    else setFailed(true);
  }, [idx, list.length]);

  return { url, onErr };
}

const RENPY_COLORS = new Set(["black", "white", "transparent"]);

function parseRenpyRichText(text: string) {
  if (!text) return "";
  let html = text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "<br/>")
    .replace(/\{b\}/g, "<b>")
    .replace(/\{\/b\}/g, "</b>")
    .replace(/\{i\}/g, "<i>")
    .replace(/\{\/i\}/g, "</i>")
    .replace(/\{s\}/g, "<s>")
    .replace(/\{\/s\}/g, "</s>")
    .replace(/\{color=([^}]+)\}/g, "<span style='color:$1'>")
    .replace(/\{\/color\}/g, "</span>")
    .replace(/\{size=([^}]+)\}/g, "<span style='font-size:$1px'>")
    .replace(/\{\/size\}/g, "</span>")
    .replace(/\{cps=[^}]+\}/g, "")
    .replace(/\{\/cps\}/g, "");
  return html;
}

function evaluateCondition(cond: string, vars: Record<string, any>): boolean {
  if (!cond) return true;
  try {
    let jsCond = cond
      .replace(/\band\b/g, '&&')
      .replace(/\bor\b/g, '||')
      .replace(/\bnot\b/g, '!')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false');
    const keys = Object.keys(vars);
    const values = Object.values(vars);
    const func = new Function(...keys, `return !!(${jsCond});`);
    return func(...values);
  } catch (e) {
    console.warn("Playtest: Failed to evaluate condition:", cond, e);
    return false;
  }
}

function evaluateAssignment(expr: string, vars: Record<string, any>): Record<string, any> {
  const match = expr.match(/^\s*([a-zA-Z_]\w*)\s*(={1,2}|\+=|-=)\s*(.+)$/);
  if (!match) return vars;

  const [_, name, op, valExpr] = match;
  let val: any;
  try {
    let jsExpr = valExpr.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
    const keys = Object.keys(vars);
    const values = Object.values(vars);
    const func = new Function(...keys, `return (${jsExpr});`);
    val = func(...values);
  } catch (e) {
    try {
      val = JSON.parse(valExpr.replace(/'/g, '"'));
    } catch {
      val = valExpr;
    }
  }

  const newVars = { ...vars };
  if (op === '=' || op === '==') newVars[name] = val;
  else if (op === '+=') newVars[name] = (newVars[name] || 0) + val;
  else if (op === '-=') newVars[name] = (newVars[name] || 0) - val;

  return newVars;
}

function SpriteRenderer({ spEv, rootPath, logW, logH, fitScale }: any) {
  const spriteImg = useResolvedImage(rootPath, spEv.image);
  if (!spriteImg.url) return null;

  let base_xalign = spEv.side === 'left' ? 0.15 : spEv.side === 'right' ? 0.85 : 0.5;
  let base_yalign = 1.0;
  let atlZoom = 1.0;
  let atlAlpha = 1.0;
  let atlRotate = 0;
  let atlXOffset = 0;
  let atlYOffset = 0;

  if (spEv.atl_code) {
    const xa = spEv.atl_code.match(/xalign\s+([0-9.-]+)/);
    if (xa) base_xalign = parseFloat(xa[1]);
    const ya = spEv.atl_code.match(/yalign\s+([0-9.-]+)/);
    if (ya) base_yalign = parseFloat(ya[1]);
    const za = spEv.atl_code.match(/zoom\s+([0-9.-]+)/);
    if (za) atlZoom = parseFloat(za[1]);
    const al = spEv.atl_code.match(/alpha\s+([0-9.-]+)/);
    if (al) atlAlpha = parseFloat(al[1]);
    const ro = spEv.atl_code.match(/rotate\s+([0-9.-]+)/);
    if (ro) atlRotate = parseFloat(ro[1]);
    const xo = spEv.atl_code.match(/xoffset\s+([0-9.-]+)/);
    if (xo) atlXOffset = parseFloat(xo[1]);
    const yo = spEv.atl_code.match(/yoffset\s+([0-9.-]+)/);
    if (yo) atlYOffset = parseFloat(yo[1]);
  }

  if (spEv.type === "animation" && spEv.animation_keyframes?.length) {
    const kfs = spEv.animation_keyframes;
    const last = kfs[kfs.length - 1].props;
    if (last.xalign !== undefined) base_xalign = last.xalign;
    if (last.yalign !== undefined) base_yalign = last.yalign;
    if (last.zoom !== undefined) atlZoom = last.zoom;
    if (last.alpha !== undefined) atlAlpha = last.alpha;
    if (last.rotate !== undefined) atlRotate = last.rotate;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: `${base_xalign * 100}%`, top: `${base_yalign * 100}%`,
        transform: `translate(-${base_xalign * 100}%, -${base_yalign * 100}%)`,
        height: "95%",
        display: "flex", alignItems: "flex-end",
        zIndex: Math.round(base_yalign * 10),
        pointerEvents: "none",
        transition: "transform 0.2s, left 0.2s, opacity 0.2s"
      }}
    >
      <img src={spriteImg.url} alt="sprite" onError={spriteImg.onErr} draggable={false}
        style={{
          height: "100%",
          objectFit: "contain",
          transform: `translate(${atlXOffset}px, ${atlYOffset}px) scale(${atlZoom}) rotate(${atlRotate}deg)`,
          transformOrigin: `center ${base_yalign * 100}%`,
          opacity: atlAlpha,
        }}
      />
    </div>
  );
}

interface Props {
  project: VNProject;
  rootPath: string;
  startSceneId: string;
  onClose: () => void;
}

export function PlaytestEngine({ project, rootPath, startSceneId, onClose }: Props) {
  const [sceneId, setSceneId] = useState(startSceneId);
  const [eventIdx, setEventIdx] = useState(0);
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsBooting(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const [variables, setVariables] = useState<Record<string, any>>({});
  const [bg, setBg] = useState<string | null>(null);
  const [sprites, setSprites] = useState<Map<string, VNEvent>>(new Map());
  const [showDebug, setShowDebug] = useState(false);
  const [history, setHistory] = useState<{ sceneId: string; label: string }[]>([]);
  const [grantedAchievements, setGrantedAchievements] = useState<string[]>([]);
  const [achievementToast, setAchievementToast] = useState<string | null>(null);

  // Audio elements
  const sfxRef = useRef<HTMLAudioElement | null>(null);

  const { t } = useTranslation();
  const player = useMusicPlayer();

  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const containerRef = useRef<HTMLDivElement>(null);

  const currentScene = useMemo(() => project.scenes.find(s => s.id === sceneId), [project, sceneId]);
  const events = currentScene?.events ?? [];
  const currentEvent = eventIdx < events.length ? events[eventIdx] : null;

  // Track the actual pixel dimensions of the outer container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ w: rect.width, h: rect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const [logW, logH] = project.resolution || [1280, 720];
  let fitScale = 1;
  if (containerSize.w > 0 && containerSize.h > 0) {
    fitScale = Math.min(containerSize.w / logW, containerSize.h / logH);
  }

  // Typewriter effect state
  const [typewriterLen, setTypewriterLen] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  const char = currentEvent?.char_id ? project.characters.find(c => c.id === currentEvent.char_id) : null;
  let fallbackName = "";
  let rawText = (currentEvent?.type === "choice" ? currentEvent.prompt : currentEvent?.text) || "";

  if (!char && rawText) {
    const match = rawText.match(/^([\w\s]+):\s*(.*)$/) || rawText.match(/^([\w\s]+)\s+"(.*)"$/);
    if (match) {
      fallbackName = match[1];
      rawText = match[2];
    }
  }

  // Effect to process the current event on load/advance
  useEffect(() => {
    if (!currentEvent) return;

    // Fast-forward processing of non-blocking events
    const processEvent = () => {
      let ev = currentEvent;

      if (ev.type === "bg") {
        setBg(ev.bg || null);
        if (ev.bg && !RENPY_COLORS.has(ev.bg.toLowerCase())) {
          setSprites(new Map()); // clear sprites
        }
      }
      else if (ev.type === "image" || ev.type === "animation") {
        if (ev.image) {
          const name = ev.image.replace(/\\/g, "/").split("/").pop() || ev.image;
          const tag = name.split(/[\s_]/)[0].toLowerCase();
          setSprites(prev => {
            const next = new Map(prev);
            if (ev.kind === "hide") next.delete(tag);
            else next.set(tag, ev);
            return next;
          });
        }
      }
      else if (ev.type === "music") {
        if (ev.music) {
          const clean = ev.music.replace(/['"]/g, '');
          let src = clean;
          if (!clean.startsWith('game/')) {
            src = clean.startsWith('audio/') ? `game/${clean}` : clean;
          }
          player.play(src, rootPath, []);
        } else {
          player.stop();
        }
      }
      else if (ev.type === "sfx") {
        if (ev.sfx) {
          const clean = ev.sfx.replace(/['"]/g, '');
          const paths = [clean];
          if (!clean.startsWith('game/')) {
            paths.push(`game/${clean}`);
            paths.push(`game/audio/${clean}`);
          }
          const urls = paths.map(p => convertFileSrc(`${rootPath}/${p}`));

          sfxRef.current = new Audio();
          sfxRef.current.volume = player.volume;

          const tryPlaySfx = (idx: number) => {
            if (idx >= urls.length) return;
            if (sfxRef.current) {
              sfxRef.current.src = urls[idx];
              sfxRef.current.play().catch(() => tryPlaySfx(idx + 1));
            }
          };
          tryPlaySfx(0);
        }
      }
      else if (ev.type === "setvar") {
        if (ev.condition) setVariables(v => evaluateAssignment(ev.condition!, v));
      }

      else if (ev.type === "achievement") {
        const name = ev.achievement_id ?? ev.condition ?? "";
        if (name && !grantedAchievements.includes(name)) {
          setGrantedAchievements(prev => [...prev, name]);
          setAchievementToast(name);
          setTimeout(() => setAchievementToast(null), 3000);
        }
      }

      // Handle Auto-advancing events
      if (["bg", "image", "animation", "camera", "music", "sfx", "setvar", "achievement", "raw", "wait"].includes(ev.type)) {
        setEventIdx(i => i + 1);
      }

      // Handle conditional block skipping
      if (ev.type === "if") {
        const isTrue = evaluateCondition(ev.condition || "", variables);
        if (isTrue) {
          setEventIdx(i => i + 1); // Enter the block
        } else {
          // Find the end of this block
          let depth = 1;
          let i = eventIdx + 1;
          while (i < events.length && depth > 0) {
            if (events[i].type === "if") depth++;
            // Basic approximation: we assume block ends when indentation drops.
            // But we don't have block boundaries in VNEvent array easily right now.
            // For now, if we can't reliably skip, we just advance one by one and skip content?
            // Actually, VNProject doesn't explicitly store 'end if'.
            // To be safe for V1, we'll just not evaluate 'if' block depths perfectly 
            // unless we add a specific skip logic. We'll just advance 1.
            i++;
            break; // Temporary fallback: 'if' just acts as a pass-through in V1 playtest
          }
          setEventIdx(i => i + 1);
        }
      }

      // Handle text
      if (["dialogue", "narration", "choice"].includes(ev.type)) {
        if (char?.slow) {
          setTypewriterLen(0);
          setIsTyping(true);
        } else {
          setTypewriterLen(rawText.length);
          setIsTyping(false);
        }
      }

      else if (ev.type === "random") {
        const ids = (ev.random_scenes ?? []).filter(Boolean);
        const weights = ev.random_weights;
        if (ids.length > 0) {
          let picked = ids[0];
          if (weights && weights.length === ids.length) {
            // Weighted pick via cumulative distribution
            const total = weights.reduce((a, b) => a + b, 0);
            let r = Math.random() * total;
            for (let i = 0; i < ids.length; i++) {
              r -= weights[i];
              if (r <= 0) { picked = ids[i]; break; }
            }
          } else {
            picked = ids[Math.floor(Math.random() * ids.length)];
          }
          setSceneId(picked);
          setEventIdx(0);
        } else {
          setEventIdx(i => i + 1);
        }
      }

      if (ev.type === "jump") {
        if (ev.scene_id) {
          setSceneId(ev.scene_id);
          setEventIdx(0);
        } else {
          setEventIdx(i => i + 1);
        }
      }
    };

    processEvent();
  }, [currentEvent, rootPath, grantedAchievements]);

  // Track scene history
  useEffect(() => {
    if (currentScene) {
      setHistory(prev => {
        if (prev[prev.length - 1]?.sceneId === currentScene.id) return prev;
        return [...prev.slice(-19), { sceneId: currentScene.id, label: currentScene.label }];
      });
    }
  }, [sceneId, currentScene]);

  // Keyboard shortcuts
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleAdvance(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping, currentEvent, eventIdx, events.length]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      player.stop();
      if (sfxRef.current) { sfxRef.current.pause(); sfxRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync volume when changed
  useEffect(() => {
    if (sfxRef.current) sfxRef.current.volume = player.volume;
  }, [player.volume]);

  // Typewriter effect interval
  useEffect(() => {
    if (!isTyping || !rawText) return;
    const speed = char?.slow_speed ? (1000 / char.slow_speed) : 30;
    const timer = setInterval(() => {
      setTypewriterLen(l => {
        if (l >= rawText.length) {
          setIsTyping(false);
          clearInterval(timer);
          return rawText.length;
        }
        return l + 1;
      });
    }, speed);
    return () => clearInterval(timer);
  }, [isTyping, rawText, char]);

  // Sync volume when changed
  useEffect(() => {
    if (sfxRef.current) sfxRef.current.volume = player.volume;
  }, [player.volume]);

  const handleAdvance = () => {
    if (isTyping) {
      // Skip typing
      setTypewriterLen(rawText.length);
      setIsTyping(false);
      return;
    }
    if (currentEvent?.type === "choice") {
      // Must click a choice button to advance
      return;
    }

    // Advance to next event, or next scene if at end
    if (eventIdx + 1 < events.length) {
      setEventIdx(eventIdx + 1);
      // End of scene — the overlay handles UX feedback, nothing to log
    }
  };

  const wheelTimeout = useRef<number | null>(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (wheelTimeout.current) return;
    wheelTimeout.current = setTimeout(() => { wheelTimeout.current = null; }, 100);

    if (e.deltaY > 0) {
      // scroll down -> advance
      handleAdvance();
    } else if (e.deltaY < 0) {
      // scroll up -> rollback
      let prev = eventIdx - 1;
      // Skip over non-blocking events to find the previous text/dialogue
      while (prev >= 0 && ["bg", "image", "animation", "camera", "music", "sfx", "setvar", "achievement", "raw", "wait", "if", "jump", "random"].includes(events[prev].type)) {
        prev--;
      }
      if (prev >= 0) {
        setEventIdx(prev);
        if (char?.slow) {
          setTypewriterLen(0);
          setIsTyping(true);
        } else {
          setIsTyping(false);
        }
      }
    }
  };

  const bgImg = useResolvedImage(rootPath, bg);
  const textboxImg = useResolvedImage(rootPath, char?.textbox_bg || "gui/textbox.png");
  const nameboxImg = useResolvedImage(rootPath, "gui/namebox.png");
  const choiceBgImg = useResolvedImage(rootPath, "gui/button/choice_idle_background.png");

  const canvasStyle: React.CSSProperties = {
    position: "relative",
    width: logW,
    height: logH,
    overflow: "hidden",
    background: "#000",
    transform: `scale(${fitScale})`,
    transformOrigin: "center center",
    flexShrink: 0,
    boxShadow: "0 0 40px rgba(0,0,0,0.8)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 4,
  };

  const displayedText = rawText.substring(0, typewriterLen);

  return (
    <div className="col" style={{ flex: 1, height: "100%", background: "#0f0f0f", position: "relative" }}>
      <style>{`
        @keyframes playtest-pulse { 0% { transform: scale(0.95); opacity: 0.5; } 50% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.5; } }
        @keyframes vnv-toast-slide-in { 0% { transform: translateX(100%); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
      `}</style>
      {isBooting && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1000,
          background: "#0f0f0f", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", color: "var(--teal)",
          animation: "vnv-fade-out 0.8s ease-in forwards",
        }}>
          <div style={{ fontSize: 48, animation: "playtest-pulse 1s infinite" }}>▶️</div>
          <div style={{ marginTop: 16, fontSize: 14, letterSpacing: "0.2em", fontWeight: 700 }}>{t('playtest.booting')}</div>
        </div>
      )}
      {/* Top Bar */}
      <div className="row" style={{ position: "relative", height: 48, padding: "0 16px", background: "var(--bg1)", borderBottom: "1px solid var(--bdr)", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div className="row gap10" style={{ alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>▶️</span>
          <span style={{ fontWeight: 700, color: "var(--text)", fontSize: 13 }}>{t('playtest.engine')}</span>
          {/* Scene pill */}
          {currentScene && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 20,
              background: 'color-mix(in srgb, var(--teal) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)',
              fontSize: 11, color: 'var(--teal)', fontWeight: 600,
            }}>
              🎬 {currentScene.label || currentScene.id}
              {events.length > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                  background: 'color-mix(in srgb, var(--teal) 15%, transparent)',
                  color: 'var(--teal)',
                }}>
                  {Math.min(eventIdx + 1, events.length)}/{events.length}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Absolutely centered Music Player so it never jiggles */}
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", justifyContent: "center" }}>
          <MusicPlayerBar inline />
        </div>

        <div className="row gap8">
          <button
            className="btn btn-ghost"
            onClick={() => setShowDebug(v => !v)}
            style={{
              fontSize: 11, height: 30,
              color: showDebug ? "var(--teal)" : "var(--dim)",
              background: showDebug ? 'color-mix(in srgb, var(--teal) 10%, transparent)' : 'transparent',
              border: showDebug ? "1px solid color-mix(in srgb, var(--teal) 30%, transparent)" : "1px solid transparent",
              borderRadius: 8, transition: 'all 0.15s',
            }}
            title="Toggle variable debug HUD"
          >
            🐛 {showDebug ? t('playtest.debug_on') : t('playtest.debug_off')}
          </button>
          <button className="btn btn-ghost" onClick={() => { setSceneId(startSceneId); setEventIdx(0); setVariables({}); setSprites(new Map()); setBg(null); }} style={{ fontSize: 11, height: 30 }} title="Restart from beginning">
            {t('playtest.restart')}
          </button>
          <button className="btn btn-ghost" onClick={onClose} style={{ color: "var(--err)", fontSize: 11, height: 30 }}>{t('playtest.exit')}</button>
        </div>
      </div>

      <div className="row" style={{ flex: 1, overflow: "hidden" }}>
        {/* Debug Sidebar */}
        {showDebug && (
          <div className="col" style={{ width: 240, borderRight: "1px solid var(--bdr)", background: "var(--bg1)", overflowY: "auto", flexShrink: 0 }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--bdr)", fontSize: 11, fontWeight: 700, color: "var(--teal)" }}>{t('playtest.debug_title')}</div>
            {Object.keys(variables).length === 0 ? (
              <div style={{ padding: 16, fontSize: 11, color: "var(--faint)" }}>{t('playtest.no_vars')}</div>
            ) : (
              <div className="col" style={{ padding: 8, gap: 4 }}>
                {Object.entries(variables).map(([k, v]) => (
                  <div key={k} className="row" style={{ justifyContent: "space-between", padding: "4px 8px", borderRadius: 4, background: "var(--bg2)", gap: 8 }}>
                    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--acc2)" }}>{k}</span>
                    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: typeof v === 'boolean' ? (v ? "var(--teal)" : "var(--err)") : "var(--warn)" }}>
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: "10px 12px", borderTop: "1px solid var(--bdr)", borderBottom: "1px solid var(--bdr)", fontSize: 11, fontWeight: 700, color: "var(--dim)", marginTop: 8 }}>{t('playtest.history')}</div>
            <div className="col" style={{ padding: 8, gap: 2 }}>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: 10, fontFamily: "var(--mono)", color: i === history.length - 1 ? "var(--teal)" : "var(--faint)", padding: "2px 6px" }}>
                  {i === history.length - 1 ? "▶ " : "  "}{h.label}
                </div>
              ))}
            </div>
            {grantedAchievements.length > 0 && (
              <>
                <div style={{ padding: "10px 12px", borderTop: "1px solid var(--bdr)", borderBottom: "1px solid var(--bdr)", fontSize: 11, fontWeight: 700, color: "#fbbf24", marginTop: 8 }}>{t('playtest.achievements')}</div>
                <div className="col" style={{ padding: 8, gap: 2 }}>
                  {grantedAchievements.map((a, i) => (
                    <div key={i} style={{ fontSize: 10, color: "#fbbf24", padding: "2px 6px" }}>✓ {a}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div
          ref={containerRef}
          style={{
            flex: 1, position: "relative",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}
          onClick={handleAdvance}
          onWheel={handleWheel}
        >
          {/* 16:9 Canvas */}
          <div style={canvasStyle}>
            {/* Background image */}
            {bgImg.url && (
              <img src={bgImg.url} alt="bg" onError={bgImg.onErr}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "opacity 0.4s" }}
              />
            )}

            {/* Sprites */}
            {Array.from(sprites.values()).map((sp) => (
              <SpriteRenderer
                key={sp.id}
                spEv={sp}
                rootPath={rootPath}
                logW={logW}
                logH={logH}
                fitScale={fitScale}
              />
            ))}

            {/* Dialogue box */}
            {currentEvent && ["dialogue", "narration", "choice"].includes(currentEvent.type) && (
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: textboxImg.url ? (logH * 0.25) : "auto", zIndex: 100 }}>
                {textboxImg.url && (
                  <img src={textboxImg.url} alt="textbox" onError={textboxImg.onErr} style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "100%", objectFit: "fill" }} />
                )}

                <div style={{
                  position: "relative",
                  padding: textboxImg.url ? `${logH * 0.05}px ${logW * 0.15}px ${logH * 0.02}px` : "20px 28px",
                  background: textboxImg.url ? "transparent" : "rgba(0,0,0,0.82)",
                  backdropFilter: textboxImg.url ? "none" : "blur(8px)",
                  borderTop: textboxImg.url ? "none" : "1px solid rgba(255,255,255,0.1)",
                  minHeight: textboxImg.url ? 0 : 180,
                  height: "100%",
                  display: "flex", flexDirection: "column",
                  fontFamily: char?.custom_font ? `"${char?.custom_font.split('/').pop()?.split('.')[0]}"` : '"DejaVu Sans", "Open Sans", sans-serif'
                }}>
                  {char?.custom_font && (
                    <style>{`
                    @font-face {
                      font-family: "${char.custom_font.split('/').pop()?.split('.')[0]}";
                      src: url(${convertFileSrc(rootPath + "/" + char.custom_font)});
                    }
                  `}</style>
                  )}
                  {(char || fallbackName) && (
                    <div style={{
                      position: textboxImg.url ? "absolute" : "static",
                      top: textboxImg.url ? 0 : "auto",
                      transform: textboxImg.url ? "translateY(-50%)" : "none",
                      left: textboxImg.url ? (logW * 0.15) : "auto",
                      zIndex: 10,
                      marginBottom: 6,
                      padding: nameboxImg.url ? `${logH * 0.03}px ${logW * 0.06}px` : "4px 14px",
                      background: (!nameboxImg.url && textboxImg.url) ? "rgba(0,0,0,0.5)" : "transparent",
                      borderRadius: (!nameboxImg.url && textboxImg.url) ? 6 : 0,
                    }}>
                      {nameboxImg.url && textboxImg.url && (
                        <img src={nameboxImg.url} alt="namebox" onError={nameboxImg.onErr} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: -1 }} />
                      )}
                      <span style={{
                        display: "inline-block",
                        fontSize: textboxImg.url ? (logH * 0.045) : 24,
                        fontWeight: 700,
                        color: char?.color ?? (textboxImg.url ? "#ea8053" : "#fff"),
                        WebkitTextStroke: "1px rgba(0,0,0,0.8)",
                        textShadow: "none",
                        fontFamily: char?.custom_font ? `"${char?.custom_font.split('/').pop()?.split('.')[0]}"` : '"DejaVu Sans", "Open Sans", sans-serif',
                        letterSpacing: textboxImg.url ? "0.05em" : "normal",
                      }}>
                        {char?.display ?? char?.name ?? fallbackName}
                      </span>
                    </div>
                  )}

                  <p
                    dangerouslySetInnerHTML={{ __html: parseRenpyRichText(displayedText) }}
                    style={{
                      fontSize: textboxImg.url ? (logH * 0.035) : 22,
                      lineHeight: 1.5, color: "#fff", fontFamily: "inherit", margin: 0,
                      textShadow: "none",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Center Screen Choice Buttons */}
            {currentEvent?.type === "choice" && !isTyping && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: logH * 0.02, zIndex: 10, pointerEvents: "none"
              }}>
                {(currentEvent.opts ?? []).map((o, i) => (
                  <div key={i} style={{
                    position: "relative",
                    width: choiceBgImg.url ? "auto" : logW * 0.6,
                    minWidth: choiceBgImg.url ? 0 : 400,
                    background: choiceBgImg.url ? "transparent" : "rgba(15,15,20,0.65)",
                    backdropFilter: choiceBgImg.url ? "none" : "blur(12px)",
                    border: choiceBgImg.url ? "none" : "1px solid rgba(255,255,255,0.15)",
                    borderRadius: choiceBgImg.url ? 0 : 8,
                    padding: choiceBgImg.url ? 0 : `${logH * 0.015}px ${logW * 0.02}px`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    pointerEvents: "auto", cursor: o.scene ? "pointer" : "default",
                    transition: "transform 0.1s, background 0.1s"
                  }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (o.scene) {
                        setSceneId(o.scene);
                        setEventIdx(0);
                      }
                    }}
                    onMouseEnter={(e) => { if (o.scene) e.currentTarget.style.transform = "scale(1.02)"; }}
                    onMouseLeave={(e) => { if (o.scene) e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    {choiceBgImg.url && (
                      <img src={choiceBgImg.url} alt="btn" onError={choiceBgImg.onErr} style={{ width: "100%", height: "100%", position: "absolute", inset: 0, zIndex: -1 }} />
                    )}
                    <div style={{
                      padding: choiceBgImg.url ? `${logH * 0.015}px ${logW * 0.04}px` : 0,
                      fontSize: logH * 0.035, color: "#ccc",
                      fontFamily: '"DejaVu Sans", "Open Sans", sans-serif',
                      textAlign: "center",
                      textShadow: choiceBgImg.url ? "1px 1px 2px rgba(0,0,0,0.8)" : "none",
                    }}>
                      {o.text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* End-of-scene panel */}
            {!currentEvent && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 200 }}
                onClick={e => e.stopPropagation()}>
                <div className="col" style={{ width: 420, background: "rgba(15, 15, 20, 0.8)", backdropFilter: "blur(24px)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
                  <div style={{ padding: "20px 24px", background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{t('playtest.end_scene')}</div>
                    <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 4 }}>{currentScene?.label}</div>
                  </div>

                  {/* Jump targets from this scene */}
                  {(() => {
                    const jumps = (currentScene?.events ?? [])
                      .filter(ev => ev.type === "jump" && ev.scene_id)
                      .map(ev => project.scenes.find(s => s.id === ev.scene_id))
                      .filter((s): s is NonNullable<typeof s> => !!s);
                    const unique = [...new Map(jumps.map(s => [s.id, s])).values()];
                    return unique.length > 0 ? (
                      <div className="col" style={{ padding: "16px 24px", gap: 8 }}>
                        <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 700, marginBottom: 4 }}>{t('playtest.continue_to')}</div>
                        {unique.map(sc => (
                          <button key={sc.id}
                            onClick={() => { setSceneId(sc.id); setEventIdx(0); }}
                            style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer", textAlign: "left", fontSize: 13, transition: "border-color 0.15s, background 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--teal)"; e.currentTarget.style.background = "rgba(0,212,200,0.1)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                          >
                            → {sc.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: "20px 24px", color: "var(--faint)", fontSize: 13 }}>{t('playtest.terminal')}</div>
                    )
                  })()}

                  <div className="row gap8" style={{ padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.3)" }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }}
                      onClick={() => { setSceneId(startSceneId); setEventIdx(0); setVariables({}); setSprites(new Map()); setBg(null); }}>
                      {t('playtest.restart')}
                    </button>
                    <button className="btn" style={{ flex: 1, background: "var(--err)", border: "none", color: "#fff" }} onClick={onClose}>
                      {t('playtest.exit_playtest')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {achievementToast && (
              <div style={{
                position: "absolute", top: 20, right: 20, zIndex: 300,
                background: "rgba(251,191,36,0.8)", backdropFilter: "blur(12px)", color: "#000",
                border: "1px solid rgba(255,255,255,0.4)",
                padding: "12px 20px", borderRadius: 12, fontWeight: 700, fontSize: 13,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(251,191,36,0.5)",
                display: "flex", alignItems: "center", gap: 10,
                animation: "vnv-toast-slide-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
              }}>
                <span style={{ fontSize: 20 }}>🏆</span>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', marginBottom: 2 }}>{t('playtest.unlocked')}</div>
                  <div style={{ fontSize: 14 }}>{achievementToast}</div>
                </div>
              </div>
            )}

          </div>{/* close canvasStyle */}

        </div>{/* close containerRef */}
      </div>{/* close debug row */}

    </div>
  );
}
