/**
 * useThumbnail.ts — Async scene card rich thumbnail generator.
 *
 * For each scene, calculates the busiest visual state (background + sprites + text),
 * and generates a 160×90 composite canvas thumbnail using requestIdleCallback.
 * Results are cached in a module-level Map so they survive React re-renders.
 */
import { useEffect, useState } from "react";
import type { VNScene, VNProject } from "./types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "./translationContext";

const cache = new Map<string, string>(); // sceneId → dataURL

// ── Image Resolution ────────────────────────────────────────────────────────
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

function loadImageFromCandidates(candidatesList: string[]): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (candidatesList.length === 0) return resolve(null);
    let idx = 0;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      idx++;
      if (idx < candidatesList.length) {
        img.src = candidatesList[idx];
      } else {
        resolve(null);
      }
    };
    img.src = candidatesList[idx];
  });
}

// ── Visual State Scoring ────────────────────────────────────────────────────
interface SceneState {
  bg: string | null;
  sprites: Map<string, string>;
  text: string | null;
  charName: string | null;
  charColor: string | null;
}

function getBusiestState(scene: VNScene, project: VNProject, gameTranslations?: Record<string, Record<string, string>>, envLang?: string): SceneState {
  let currentBg: string | null = null;
  const currentSprites = new Map<string, string>();
  
  let bestScore = -1;
  let bestState: SceneState = { bg: null, sprites: new Map(), text: null, charName: null, charColor: null };
  let manualState: SceneState | null = null;

  const RENPY_COLORS = new Set(["black", "white", "transparent"]);

  for (const ev of scene.events) {
    if (ev.type === "bg" && ev.bg && !RENPY_COLORS.has(ev.bg.toLowerCase()) && !ev.bg.toLowerCase().startsWith("expression ")) {
      currentBg = ev.bg;
      currentSprites.clear(); // Clear sprites on bg change
    }
    
    if ((ev.type === "image" || ev.type === "animation") && ev.image) {
      const name = ev.image.replace(/\\/g, "/").split("/").pop() || ev.image;
      const tag = name.split(/[\s_]/)[0].toLowerCase();
      currentSprites.set(tag, ev.image);
    }
    
    // Evaluate score at this event
    const hasText = ["dialogue", "narration", "choice"].includes(ev.type);
    const score = (currentSprites.size * 10) + (hasText ? 5 : 0) + (currentBg ? 1 : 0);
    
    if (score >= bestScore) {
      bestScore = score;
      let textStr = "";
      let charName: string | null = null;
      let charColor: string | null = null;
      
      if (hasText) {
        textStr = (ev.type === "choice" ? ev.prompt : ev.text) || "";
        let char = ev.char_id ? project.characters.find(c => c.id === ev.char_id) : null;
        
        if (!char && textStr) {
          const match = textStr.match(/^([\w\s]+):\s*(.*)$/) || textStr.match(/^([\w\s]+)\s+"(.*)"$/);
          if (match) {
            charName = match[1];
            textStr = match[2];
            char = project.characters.find(c => c.name.toLowerCase() === charName!.toLowerCase() || c.display.toLowerCase() === charName!.toLowerCase()) || null;
          }
        }

        // Translate textStr if we have game translations
        if (envLang && gameTranslations && gameTranslations[envLang]) {
          if (textStr && gameTranslations[envLang][textStr]) {
            textStr = gameTranslations[envLang][textStr];
          } else if (textStr) {
            // Fuzzy fallback: ignore punctuation/whitespace for slight mismatches
            const normalize = (s: string) => s.replace(/[\s"?!.,;'`’]/g, '').toLowerCase();
            const normText = normalize(textStr);
            for (const [k, v] of Object.entries(gameTranslations[envLang])) {
              if (normalize(k) === normText) {
                textStr = v;
                break;
              }
            }
          }
        }
        if (char) {
          charName = char.display ?? char.name;
          charColor = char.color ?? null;
        }
      }
      
      const currentState = {
        bg: currentBg,
        sprites: new Map(currentSprites),
        text: textStr,
        charName,
        charColor
      };

      if (scene.thumbnail_event_id === ev.id) {
        manualState = currentState;
      }

      bestState = currentState;
    } else if (scene.thumbnail_event_id === ev.id) {
      manualState = {
        bg: currentBg,
        sprites: new Map(currentSprites),
        text: null, charName: null, charColor: null
      };
    }
  }
  
  return manualState || bestState;
}

// ── Canvas Rendering ────────────────────────────────────────────────────────
function drawThumbnail(scene: VNScene, project: VNProject, rootPath: string | undefined, inheritedBg: string | undefined, scaleLevel: number, gameTranslations?: Record<string, Record<string, string>>, envLang?: string): Promise<string> {
  return new Promise(async resolve => {
    const W = 160, H = 90;
    const SCALE = scaleLevel; // dynamic supersampling based on zoom level
    const canvas = document.createElement("canvas");
    canvas.width  = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const bgColor = (scene as any).bgColor ?? (scene as any).color ?? "#1a2540";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    const state = getBusiestState(scene, project, gameTranslations, envLang);
    const effectiveBg = state.bg || inheritedBg;

    // 1. Draw Background
    if (effectiveBg && rootPath && !["black", "white", "transparent"].includes(effectiveBg.toLowerCase())) {
      const bgImg = await loadImageFromCandidates(candidates(rootPath, effectiveBg));
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, W, H);
      }
    }

    // 2. Draw Sprites (evenly spaced)
    if (rootPath && state.sprites.size > 0 && !scene.thumbnail_hide_sprites) {
      const spriteUrls = Array.from(state.sprites.values());
      const loadedSprites = (await Promise.all(
        spriteUrls.map(url => loadImageFromCandidates(candidates(rootPath, url)))
      )).filter(img => img !== null) as HTMLImageElement[];

      if (loadedSprites.length > 0) {
        const spacing = W / (loadedSprites.length + 1);
        loadedSprites.forEach((img, i) => {
          const cx = spacing * (i + 1);
          // Scale sprite to fit ~80% of height, maintaining aspect ratio
          const scale = (H * 0.8) / img.height;
          const sw = img.width * scale;
          const sh = img.height * scale;
          ctx.drawImage(img, cx - sw / 2, H - sh, sw, sh);
        });
      }
    }

    // Subtle gradient overlay to ensure text/labels are readable
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 3. Draw Textbox (if dialogue exists) or fallback label
    if (state.text || state.charName) {
      // Draw character name floating ABOVE the dialogue box
      if (state.charName) {
        ctx.font = "bold 9px Inter, system-ui, sans-serif";
        
        let displayName = state.charName;
        const maxNameWidth = 140;
        if (ctx.measureText(displayName).width > maxNameWidth) {
          let i = state.charName.length;
          while (i > 0 && ctx.measureText(state.charName.slice(0, i) + "…").width > maxNameWidth) {
            i--;
          }
          displayName = state.charName.slice(0, i) + "…";
        }
        
        // Add a black outline for readability against the background
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.strokeText(displayName, 10, H - 35);
        
        // Fill the name text
        ctx.fillStyle = state.charColor || "#ea8053";
        ctx.fillText(displayName, 10, H - 35);
      }

      // Dark main textbox bg
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(6, H - 32, W - 12, 28);
      
      // Draw dialogue text (raised slightly)
      if (state.text) {
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "8px Inter, system-ui, sans-serif";
        const cleanText = state.text.replace(/\{[^}]+\}/g, ""); // Strip renpy tags
        
        let displayText = cleanText;
        const maxWidth = 140; // Max width to ensure text stays inside the black box
        if (ctx.measureText(displayText).width > maxWidth) {
          let i = cleanText.length;
          while (i > 0 && ctx.measureText(cleanText.slice(0, i) + "…").width > maxWidth) {
            i--;
          }
          displayText = cleanText.slice(0, i) + "…";
        }
        
        ctx.fillText(displayText, 10, H - 21);
      }
    } else {
      // Scene label fallback
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, H - 22, W, 22);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 9px Inter, system-ui, sans-serif";
      ctx.fillText(((scene as any).title ?? (scene as any).name ?? scene.id).slice(0, 26), 6, H - 8);
    }

    resolve(canvas.toDataURL("image/webp", scaleLevel >= 8 ? 0.85 : 0.7));
  });
}

function sceneFingerprint(scene: VNScene, project: VNProject, inheritedBg?: string, scaleLevel?: number, envLang?: string, gameTranslations?: Record<string, Record<string, string>>): string {
  const events = scene.events ?? [];
  const lastEv = events[events.length - 1];
  const hash = lastEv ? `${lastEv.type}:${lastEv.text ?? lastEv.bg ?? lastEv.image ?? ""}` : "empty";
  const charHash = project.characters.map(c => `${c.id}:${c.name}:${c.display}:${c.color}`).join('|');
  const tlHash = envLang && gameTranslations && gameTranslations[envLang] ? Object.keys(gameTranslations[envLang]).length : 0;
  return `${scene.id}:${events.length}:${hash}:${scene.thumbnail_event_id ?? 'auto'}:${scene.thumbnail_hide_sprites ? '1' : '0'}:${inheritedBg ?? 'none'}:${scaleLevel ?? 4}:${envLang ?? ""}:${tlHash}:${charHash}`;
}

export function useThumbnail(scene: VNScene, project: VNProject, rootPath?: string, inheritedBg?: string, scaleLevel: number = 4): string | null {
  const { gameTranslations, language } = useTranslation();
  const RENPY_LANGS: Record<string, string> = {
    es: "spanish", fr: "french", de: "german", ja: "japanese", ko: "korean", ru: "russian", zh: "simplified_chinese", "zh-TW": "traditional_chinese"
  };
  const envLang = RENPY_LANGS[language] || "";

  const fp = sceneFingerprint(scene, project, inheritedBg, scaleLevel, envLang, gameTranslations);
  const [thumb, setThumb] = useState<string | null>(cache.get(scene.id) ?? null);

  useEffect(() => {
    if (cache.has(scene.id) && cache.get(`${scene.id}:fp`) === fp) {
      setThumb(cache.get(scene.id)!);
      return;
    }

    const cb = () => {
      drawThumbnail(scene, project, rootPath, inheritedBg, scaleLevel, gameTranslations, envLang).then(url => {
        cache.set(scene.id, url);
        cache.set(`${scene.id}:fp`, fp);
        setThumb(url);
      });
    };

    if ("requestIdleCallback" in window) {
      const id = (window as any).requestIdleCallback(cb, { timeout: 2000 });
      return () => (window as any).cancelIdleCallback(id);
    } else {
      const id = setTimeout(cb, 100);
      return () => clearTimeout(id);
    }
  }, [fp, project, rootPath, scene, gameTranslations, envLang]);

  return thumb;
}
