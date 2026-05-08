/**
 * useAutoLayout.ts
 * Extracts all auto-layout algorithms from StoryCanvas.
 * Provides handleAutoLayout() action and guessBestLayout() heuristic.
 */
import { useCallback } from 'react';
import type { VNProject } from '../types';
import { useCanvasStore, useShallow } from '../store/canvasStore';

export const MAIN_MENU_ID = 'main_menu';

interface UseAutoLayoutProps {
  project: VNProject;
  onProjectChange?: (p: VNProject) => void;
  displayNodes: any[];
  canvasSize: { width: number; height: number };
  isVN: boolean;
}

export function useAutoLayout({ project, onProjectChange, displayNodes, canvasSize, isVN }: UseAutoLayoutProps) {
  const { setPan, setZoom } = useCanvasStore(useShallow(s => ({ setPan: s.setPan, setZoom: s.setZoom })));

  const guessBestLayout = useCallback((p: VNProject): 'vn' | 'sugiyama' | 'rpg' => {
    if (!p.scenes || p.scenes.length === 0) return 'sugiyama';
    let totalChoices = 0;
    let maxOutDegree = 0;
    const inDeg: Record<string, number> = {};
    p.scenes.forEach(s => (inDeg[s.id] = 0));

    p.scenes.forEach(s => {
      let outCount = 0;
      s.events.forEach(ev => {
        if (ev.type === 'jump' && ev.scene_id) {
          outCount++;
          inDeg[ev.scene_id] = (inDeg[ev.scene_id] || 0) + 1;
        } else if (ev.type === 'choice') {
          ev.opts?.forEach(opt => {
            if (opt.scene) {
              totalChoices++;
              outCount++;
              inDeg[opt.scene] = (inDeg[opt.scene] || 0) + 1;
            }
          });
        }
      });
      if (outCount > maxOutDegree) maxOutDegree = outCount;
    });

    const branchingRatio = totalChoices / Math.max(1, p.scenes.length);
    if (maxOutDegree >= 4 && branchingRatio > 1.0) return 'rpg';
    return 'sugiyama';
  }, []);

  const handleAutoLayout = useCallback((mode: 'vn' | 'sugiyama' | 'rpg' | 'auto' = 'auto') => {
    if (!onProjectChange || !isVN) return;
    const p = project;
    const actualMode = mode === 'auto' ? guessBestLayout(p) : mode;
    const newLayout = { ...p.layout };

    const adj: Record<string, string[]> = {};
    const inDegrees: Record<string, number> = {};
    const childScore: Record<string, number> = {};
    const childOrder: Record<string, number> = {};

    p.scenes.forEach(s => { adj[s.id] = []; inDegrees[s.id] = 0; });

    p.scenes.forEach(s => {
      let orderCounter = 0;
      const addTarget = (targetId: string, score: number) => {
        if (!targetId) return;
        adj[s.id].push(targetId);
        inDegrees[targetId] = (inDegrees[targetId] || 0) + 1;
        if (childOrder[targetId] === undefined) childOrder[targetId] = orderCounter++;
        if (childScore[targetId] === undefined || score < childScore[targetId]) {
          childScore[targetId] = score;
        }
      };

      s.events.forEach(ev => {
        if (ev.type === 'jump' && ev.scene_id) {
          addTarget(ev.scene_id, 2);
        } else if (ev.type === 'choice') {
          ev.opts?.forEach(opt => {
            const score = opt.is_correct ? 1 : (opt.is_incorrect ? 3 : 2);
            if (opt.scene) addTarget(opt.scene, score);
          });
        } else if (ev.type === 'if') {
          if (ev.scene_true) addTarget(ev.scene_true, 1);
          if (ev.scene_false) addTarget(ev.scene_false, 3);
        }
      });
    });

    p.scenes.forEach(s => {
      const et = s.ending_type;
      if (et === 'good' || et === 'true') childScore[s.id] = 1;
      else if (et === 'bad' || et === 'stuck') childScore[s.id] = 3;
    });

    const roots = p.scenes.filter(s => inDegrees[s.id] === 0);
    if (roots.length === 0 && p.scenes.length > 0) roots.push(p.scenes[0]);

    const sceneIndex = Object.fromEntries(p.scenes.map(s => [s.id, s]));

    if (actualMode === 'vn') {
      const spacingX = 350;
      const spacingY = 180;
      const visited = new Set<string>();

      const layoutNode = (scId: string, level: number, yOffset: number): number => {
        if (visited.has(scId)) return yOffset;
        visited.add(scId);
        newLayout[scId] = [100 + level * spacingX, yOffset];
        const sc = sceneIndex[scId];
        if (!sc) return yOffset;

        let nextY = yOffset;
        sc.events.forEach(ev => {
          if (ev.type === 'jump' && ev.scene_id) {
            nextY = layoutNode(ev.scene_id, level + 1, nextY);
          } else if (ev.type === 'choice') {
            ev.opts?.forEach(opt => {
              if (opt.scene) nextY = layoutNode(opt.scene, level + 1, nextY);
            });
          }
        });
        return Math.max(yOffset + spacingY, nextY);
      };

      let rootY = 100;
      roots.forEach(r => { rootY = layoutNode(r.id, 0, rootY); });
      p.scenes.forEach(s => { if (!visited.has(s.id)) rootY = layoutNode(s.id, 0, rootY); });

    } else if (actualMode === 'sugiyama') {
      const maxDepth: Record<string, number> = {};
      const isBackEdge = new Set<string>();
      const state: Record<string, 'visiting' | 'visited'> = {};

      const detectCycleDfs = (u: string) => {
        state[u] = 'visiting';
        (adj[u] || []).forEach(v => {
          if (state[v] === 'visiting') {
            isBackEdge.add(`${u}->${v}`);
          } else if (state[v] !== 'visited') {
            detectCycleDfs(v);
          }
        });
        state[u] = 'visited';
      };

      p.scenes.forEach(s => { if (state[s.id] !== 'visited') detectCycleDfs(s.id); });

      const dagInDegree: Record<string, number> = {};
      p.scenes.forEach(s => (dagInDegree[s.id] = 0));
      p.scenes.forEach(u => {
        (adj[u.id] || []).forEach(v => {
          if (!isBackEdge.has(`${u.id}->${v}`)) dagInDegree[v]++;
        });
      });

      p.scenes.forEach(s => (maxDepth[s.id] = 0));
      const longestPathParent: Record<string, string> = {};
      const q: string[] = [];
      p.scenes.forEach(s => { if (dagInDegree[s.id] === 0) q.push(s.id); });

      while (q.length > 0) {
        const u = q.shift()!;
        (adj[u] || []).forEach(v => {
          if (isBackEdge.has(`${u}->${v}`)) return;
          if (maxDepth[u] + 1 > maxDepth[v]) {
            maxDepth[v] = maxDepth[u] + 1;
            longestPathParent[v] = u;
          }
          dagInDegree[v]--;
          if (dagInDegree[v] === 0) q.push(v);
        });
      }

      const layers: string[][] = [];
      Object.entries(maxDepth).forEach(([id, depth]) => {
        if (!layers[depth]) layers[depth] = [];
        layers[depth].push(id);
      });
      p.scenes.forEach(s => {
        if (maxDepth[s.id] === undefined) {
          if (!layers[0]) layers[0] = [];
          layers[0].push(s.id);
        }
      });

      let deepestNode = p.scenes[0]?.id;
      let maxD = -1;
      Object.entries(maxDepth).forEach(([id, d]) => {
        if (d > maxD) { maxD = d; deepestNode = id; }
      });

      const isTrunk = new Set<string>();
      let curr: string | undefined = deepestNode;
      while (curr) { isTrunk.add(curr); curr = longestPathParent[curr]; }

      const spacingX = 400;
      const spacingY = 250;

      layers.forEach((layerNodes, depth) => {
        const totalHeight = layerNodes.length * spacingY;
        const startY = 1000 - totalHeight / 2 + spacingY / 2;
        layerNodes.forEach((id, i) => {
          newLayout[id] = [100 + depth * spacingX, startY + i * spacingY];
        });
      });

    } else if (actualMode === 'rpg') {
      const spacingX = 350;
      const spacingY = 250;
      const visited = new Set<string>();

      const layoutNode = (scId: string, xOffset: number, level: number): number => {
        if (visited.has(scId)) return xOffset;
        visited.add(scId);
        newLayout[scId] = [xOffset, 100 + level * spacingY];

        let nextX = xOffset;
        const children = adj[scId] || [];
        children.forEach((childId, idx) => {
          nextX = layoutNode(childId, nextX + (idx > 0 ? spacingX : 0), level + 1);
        });
        return Math.max(xOffset, nextX);
      };

      let rootX = 100;
      roots.forEach(r => { rootX = layoutNode(r.id, rootX, 0) + spacingX; });
      p.scenes.forEach(s => { if (!visited.has(s.id)) rootX = layoutNode(s.id, rootX, 0) + spacingX; });
    }

    let maxLayoutY = 100;
    Object.values(newLayout).forEach(pos => { if (pos[1] > maxLayoutY) maxLayoutY = pos[1]; });

    let folderX = 100;
    let folderY = maxLayoutY + 300;
    p.folders.forEach(f => {
      newLayout[f.id] = [folderX, folderY];
      folderX += 400;
    });

    if (p.start && newLayout[p.start]) {
      if (actualMode === 'rpg') {
        newLayout[MAIN_MENU_ID] = [newLayout[p.start][0], newLayout[p.start][1] - 250];
      } else {
        const spacingX = actualMode === 'sugiyama' ? 400 : 350;
        newLayout[MAIN_MENU_ID] = [newLayout[p.start][0] - spacingX, newLayout[p.start][1]];
      }
    }

    onProjectChange({ ...p, layout: newLayout });

    // Fit to screen after layout
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    displayNodes.forEach(n => {
      const nx = newLayout[n.id]?.[0] ?? n.x;
      const ny = newLayout[n.id]?.[1] ?? n.y;
      minX = Math.min(minX, nx); minY = Math.min(minY, ny);
      maxX = Math.max(maxX, nx + n.w); maxY = Math.max(maxY, ny + n.h);
    });
    if (minX !== Infinity && canvasSize.width && canvasSize.height) {
      const cw = maxX - minX || 1;
      const ch = maxY - minY || 1;
      const pad = 80;
      const newZoom = Math.min(
        Math.min(3, (canvasSize.width - pad * 2) / cw),
        Math.min(3, (canvasSize.height - pad * 2) / ch)
      );
      setPan({
        x: (canvasSize.width  - cw * newZoom) / 2 - minX * newZoom,
        y: (canvasSize.height - ch * newZoom) / 2 - minY * newZoom,
      });
      setZoom(newZoom);
    }

    return actualMode;
  }, [project, onProjectChange, isVN, displayNodes, canvasSize, guessBestLayout, setPan, setZoom]);

  return { handleAutoLayout, guessBestLayout };
}
