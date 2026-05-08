/**
 * sceneGraphUtils.ts — Scene graph traversal helpers.
 * Shared by StoryCanvas (node thumbnails) and SceneEditor (preview inheritance).
 */
import type { VNProject } from "./types";
import { computeAutoLayout, LayoutNode, LayoutEdge } from "./graphLayout";
import { detectFormation, NarrativeFormation } from "./graphAnalysis";

/**
 * Walk the VN scene graph and compute background + music state for every scene.
 *
 * Starts BFS from ALL entry-point scenes (scenes no other scene jumps to)
 * plus project.start, so branching / multi-root graphs are fully covered.
 *
 * Returns:
 *  - effectiveBg:    bg to SHOW for the scene (own bg || inherited on entry)
 *  - inheritedBg:    bg active BEFORE the scene's first event
 *  - effectiveMusic: music track at scene start (own first || inherited)
 *  - inheritedMusic: music track active BEFORE the scene's first event
 */
export function computeSceneBgs(project: VNProject): {
  effectiveBg:     Record<string, string | null>;
  inheritedBg:     Record<string, string | null>;
  effectiveSprite: Record<string, string | null>;
  inheritedSprite: Record<string, string | null>;
  effectiveMusic:  Record<string, string | null>;
  inheritedMusic:  Record<string, string | null>;
  effectiveSfx:    Record<string, string | null>;
  inheritedSfx:    Record<string, string | null>;
} {
  const effectiveBg:     Record<string, string | null> = {};
  const inheritedBg:     Record<string, string | null> = {};
  const effectiveSprite: Record<string, string | null> = {};
  const inheritedSprite: Record<string, string | null> = {};
  const effectiveMusic:  Record<string, string | null> = {};
  const inheritedMusic:  Record<string, string | null> = {};
  const effectiveSfx:    Record<string, string | null> = {};
  const inheritedSfx:    Record<string, string | null> = {};

  // ── 1. Last REAL bg image within each scene ──────────────────────────────────
  const RENPY_COLORS = new Set(["black", "white", "transparent"]);
  const ownBg: Record<string, string | null> = {};
  for (const sc of project.scenes) {
    let last: string | null = null;
    for (const ev of sc.events) {
      if (ev.type === "bg" && ev.bg && !RENPY_COLORS.has(ev.bg.toLowerCase()) && !ev.bg.toLowerCase().startsWith("expression ")) {
        last = ev.bg;
      }
    }
    ownBg[sc.id] = last;
  }

  // ── 1b. Last sprite within each scene ───────────────────────────────────────
  const ownSprite: Record<string, string | null> = {};
  for (const sc of project.scenes) {
    let last: string | null = null;
    for (const ev of sc.events) {
      if (ev.type === "image" && ev.image) last = ev.image;
    }
    ownSprite[sc.id] = last;
  }

  // ── 1c. Music & SFX: first event (what starts playing) + last (what exits with) ────
  // undefined = scene has NO music events (inherit); null = scene stops music
  const ownMusicFirst: Record<string, string | null | undefined> = {};
  const ownMusicLast:  Record<string, string | null | undefined> = {};
  const ownSfxFirst: Record<string, string | null | undefined> = {};
  const ownSfxLast:  Record<string, string | null | undefined> = {};
  for (const sc of project.scenes) {
    let firstM: string | null | undefined = undefined;
    let lastM:  string | null | undefined = undefined;
    let firstS: string | null | undefined = undefined;
    let lastS:  string | null | undefined = undefined;
    for (const ev of sc.events) {
      if (ev.type === "music") {
        if (firstM === undefined) firstM = ev.music ?? null;
        lastM = ev.music ?? null;
      }
      if (ev.type === "sfx") {
        if (firstS === undefined) firstS = ev.sfx ?? null;
        lastS = ev.sfx ?? null;
      }
    }
    ownMusicFirst[sc.id] = firstM;
    ownMusicLast[sc.id]  = lastM;
    ownSfxFirst[sc.id] = firstS;
    ownSfxLast[sc.id]  = lastS;
  }

  // ── 2. Build set of scenes that are TARGETS of jumps ────────────────────────
  const reachableFromJump = new Set<string>();
  for (const sc of project.scenes) {
    for (const ev of sc.events) {
      if (ev.type === "jump" && ev.scene_id) reachableFromJump.add(ev.scene_id);
      if (ev.type === "choice" && ev.opts) {
        ev.opts.forEach(o => { if (o.scene) reachableFromJump.add(o.scene); });
      }
      if (ev.type === "if") {
        if (ev.scene_true)  reachableFromJump.add(ev.scene_true);
        if (ev.scene_false) reachableFromJump.add(ev.scene_false);
      }
    }
  }

  // ── 3. Entry points = scenes nobody jumps to ─────────────────────────────────
  const entryIds = project.scenes
    .filter(s => !reachableFromJump.has(s.id))
    .map(s => s.id);

  if (project.start && !entryIds.includes(project.start)) {
    entryIds.unshift(project.start);
  }

  // ── 4. BFS from all entry points ─────────────────────────────────────────────
  const visited = new Set<string>();
  const queue: Array<{ id: string; bg: string | null; sprite: string | null; music: string | null; sfx: string | null }> =
    entryIds.map(id => ({ id, bg: null, sprite: null, music: null, sfx: null }));

  while (queue.length > 0) {
    const { id, bg, sprite, music, sfx } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const sc = project.scenes.find(s => s.id === id);
    if (!sc) continue;

    inheritedBg[id]     = bg;
    inheritedSprite[id] = sprite;
    inheritedMusic[id]  = music;
    inheritedSfx[id]    = sfx;
    effectiveBg[id]     = ownBg[id]     ?? bg;
    effectiveSprite[id] = ownSprite[id] ?? sprite;
    // effectiveMusic: the first music started in this scene, else what was inherited
    effectiveMusic[id]  = ownMusicFirst[sc.id] !== undefined
      ? (ownMusicFirst[sc.id] as string | null)
      : music;
    effectiveSfx[id]    = ownSfxFirst[sc.id] !== undefined
      ? (ownSfxFirst[sc.id] as string | null)
      : sfx;

    // Exit state
    let exitBg     = bg;
    let exitSprite = sprite;
    const exitMusic: string | null = ownMusicLast[sc.id] !== undefined
      ? (ownMusicLast[sc.id] as string | null)
      : music;
    const exitSfx: string | null = ownSfxLast[sc.id] !== undefined
      ? (ownSfxLast[sc.id] as string | null)
      : sfx;
    for (const ev of sc.events) {
      if (ev.type === "bg"    && ev.bg    && !RENPY_COLORS.has(ev.bg.toLowerCase()) && !ev.bg.toLowerCase().startsWith("expression ")) exitBg = ev.bg;
      if (ev.type === "image" && ev.image) exitSprite = ev.image;
    }

    const enqueue = (nextId: string) => {
      if (!visited.has(nextId)) queue.push({ id: nextId, bg: exitBg, sprite: exitSprite, music: exitMusic, sfx: exitSfx });
    };
    for (const ev of sc.events) {
      if (ev.type === "jump"   && ev.scene_id)  enqueue(ev.scene_id);
      if (ev.type === "choice" && ev.opts) ev.opts.forEach(o => { if (o.scene) enqueue(o.scene); });
      if (ev.type === "if") {
        if (ev.scene_true)  enqueue(ev.scene_true);
        if (ev.scene_false) enqueue(ev.scene_false);
      }
    }
  }

  // ── 5. Any still-unvisited scene ──────────────────────────────────────────
  for (const sc of project.scenes) {
    if (!(sc.id in effectiveBg)) {
      inheritedBg[sc.id]     = null;
      inheritedSprite[sc.id] = null;
      inheritedMusic[sc.id]  = null;
      inheritedSfx[sc.id]    = null;
      effectiveBg[sc.id]     = ownBg[sc.id]     ?? null;
      effectiveSprite[sc.id] = ownSprite[sc.id] ?? null;
      effectiveMusic[sc.id]  = ownMusicFirst[sc.id] !== undefined
        ? (ownMusicFirst[sc.id] as string | null)
        : null;
      effectiveSfx[sc.id]    = ownSfxFirst[sc.id] !== undefined
        ? (ownSfxFirst[sc.id] as string | null)
        : null;
    }
  }

  return { effectiveBg, inheritedBg, effectiveSprite, inheritedSprite, effectiveMusic, inheritedMusic, effectiveSfx, inheritedSfx };
}

/**
 * Compute a topology-aware layout for a VNProject.
 * Calculates positions for all scenes and folders, updating the layout object.
 */
export function autoLayoutProject(p: VNProject, forceMode: 'auto' | NarrativeFormation = 'auto'): { layout: Record<string, [number, number]>, spokes: Set<string>, formation: NarrativeFormation } {
  const nodes: LayoutNode[] = p.scenes.map(s => ({
    id: s.id,
    width: 220,
    height: 110,
    position: { x: 0, y: 0 }
  }));
  
  const edges: LayoutEdge[] = [];
  p.scenes.forEach(s => {
    s.events.forEach(ev => {
      if (ev.type === 'jump' && ev.scene_id) {
        edges.push({ sourceId: s.id, targetId: ev.scene_id });
      } else if (ev.type === 'choice') {
        ev.opts?.forEach(opt => {
          if (opt.scene) edges.push({ sourceId: s.id, targetId: opt.scene });
        });
      } else if (ev.type === 'if') {
        if (ev.scene_true) edges.push({ sourceId: s.id, targetId: ev.scene_true });
        if (ev.scene_false) edges.push({ sourceId: s.id, targetId: ev.scene_false });
      }
    });
  });

  const formation = forceMode === 'auto' ? detectFormation(nodes, edges) : forceMode;

  const laidOutNodes = computeAutoLayout(nodes, edges, formation, {
    paddingX: 130, // Distance between layers horizontally
    paddingY: 70,  // Distance between nodes vertically
    componentSpacing: 200,
    clusterSpacingX: 220,
    clusterSpacingY: 180,
    defaultWidth: 220,
    defaultHeight: 110,
    crossAxisBase: 100,
  });

  const newLayout = { ...p.layout };
  const spokes = new Set<string>();
  let maxY = 100;
  
  laidOutNodes.forEach(n => {
    newLayout[n.id] = [n.position.x, n.position.y];
    if (n.position.y > maxY) maxY = n.position.y;
    if (n.isSpoke) spokes.add(n.id);
  });

  // Place synthetic main menu relative to start scene
  if (p.start && newLayout[p.start]) {
    newLayout['main_menu'] = [newLayout[p.start][0] - 300, newLayout[p.start][1]];
  }

  // Place folders at the bottom
  let folderX = 100;
  p.folders.forEach(f => {
    newLayout[f.id] = [folderX, maxY + 200];
    folderX += 300;
  });

  return { layout: newLayout, spokes, formation };
}
