/**
 * sceneGraphUtils.ts — Scene graph traversal helpers.
 * Shared by StoryCanvas (node thumbnails) and SceneEditor (preview inheritance).
 */
import type { VNProject, VNScene } from "./types";
import { walkStory } from "./storyRoute";
import { computeAutoLayout, LayoutNode, LayoutEdge } from "./graphLayout";
import { detectFormation, NarrativeFormation } from "./graphAnalysis";

/**
 * Walk the VN scene graph and compute background + music state for every scene.
 *
 * Follows the same routes through the story as the live preview (see
 * `walkStory`): from the start scene, then from scenes nothing leads to. Each
 * scene inherits what's showing and playing at the event that leads to it.
 * A scene's own background and music (`bg` / `music`) start with the scene,
 * before its first event, as in the compiled game.
 *
 * Returns:
 *  - effectiveBg:    bg to SHOW for the scene (its last bg, or the one on entry)
 *  - inheritedBg:    bg on screen when the scene's first event runs
 *  - effectiveMusic: music track at scene start (the first it plays, or inherited)
 *  - inheritedMusic: music playing when the scene's first event runs
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

  // Backgrounds that are images, not a Ren'Py color or an expression.
  const RENPY_COLORS = new Set(["black", "white", "transparent"]);
  const isImageBg = (bg: string | null | undefined): bg is string =>
    !!bg && !RENPY_COLORS.has(bg.toLowerCase()) && !bg.toLowerCase().startsWith("expression ");

  interface Stage { bg: string | null; sprite: string | null; music: string | null; sfx: string | null }
  const NOTHING: Stage = { bg: null, sprite: null, music: null, sfx: null };
  // For each scene: what's showing and playing when each of its events runs.
  const stages = new Map<string, Stage[]>();

  const visit = (sc: VNScene, entry: Stage) => {
    // The scene's own background and music start before its first event.
    let cur: Stage = { ...entry, bg: isImageBg(sc.bg) ? sc.bg : entry.bg, music: sc.music || entry.music };
    const at: Stage[] = [];
    let lastBg: string | null = null;
    let lastSprite: string | null = null;
    // undefined = the scene plays no music (it inherits); null = it stops the music
    let firstMusic: string | null | undefined = undefined;
    let firstSfx: string | null | undefined = undefined;
    for (const ev of sc.events) {
      at.push(cur);
      cur = { ...cur };
      if (ev.type === "bg" && isImageBg(ev.bg)) cur.bg = lastBg = ev.bg;
      if (ev.type === "image" && ev.image) cur.sprite = lastSprite = ev.image;
      if (ev.type === "music") {
        cur.music = ev.music ?? null;
        if (firstMusic === undefined) firstMusic = cur.music;
      }
      if (ev.type === "sfx") {
        cur.sfx = ev.sfx ?? null;
        if (firstSfx === undefined) firstSfx = cur.sfx;
      }
    }
    at.push(cur);
    stages.set(sc.id, at);

    inheritedBg[sc.id]     = at[0].bg;
    inheritedSprite[sc.id] = at[0].sprite;
    inheritedMusic[sc.id]  = at[0].music;
    inheritedSfx[sc.id]    = at[0].sfx;
    effectiveBg[sc.id]     = lastBg ?? at[0].bg;
    effectiveSprite[sc.id] = lastSprite ?? at[0].sprite;
    effectiveMusic[sc.id]  = sc.music || (firstMusic !== undefined ? firstMusic : entry.music);
    effectiveSfx[sc.id]    = firstSfx !== undefined ? firstSfx : entry.sfx;
  };

  for (const { scene, from } of walkStory(project)) {
    visit(scene, from ? stages.get(from.scene.id)![from.exit] : NOTHING);
  }
  // Scenes the story never reaches start with nothing showing.
  for (const sc of project.scenes) {
    if (!stages.has(sc.id)) visit(sc, NOTHING);
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
