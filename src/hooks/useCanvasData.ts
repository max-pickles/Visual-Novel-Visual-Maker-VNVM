/**
 * useCanvasData.ts
 * Extracts the unified node/link data model from StoryCanvas.
 * Returns memoized { nodes, links, displayNodes } — pure data, no UI.
 */
import { useMemo } from 'react';
import { useTranslation } from '../translationContext';
import type { RpyProject, VNProject } from '../types';
import { computeSceneBgs } from '../sceneGraphUtils';
import { useCanvasStore, useShallow } from '../store/canvasStore';
import type { CanvasLink, VNLinkKind } from '../ConnectionLayer';

export const MAIN_MENU_ID = 'main_menu';

export interface CanvasNode {
  id: string; label: string; kind: string;
  x: number; y: number; w: number; h: number;
  contentLines: string[]; bgImage?: string; isStart?: boolean; isEnd?: boolean;
  inDegree?: number; outDegree?: number; isUnreachable?: boolean;
  isLocked?: boolean;
  endingType?: 'good' | 'bad' | 'odd' | 'stuck';
}

interface UseCanvasDataProps {
  project: RpyProject | VNProject;
  rootPath?: string;
}

export function useCanvasData({ project, rootPath }: UseCanvasDataProps) {
  const { folderStack, positions } = useCanvasStore(useShallow(s => ({
    folderStack: s.folderStack,
    positions: s.positions,
  })));
  const { t } = useTranslation();

  const isVN = 'scenes' in project;

  const { nodes, links } = useMemo(() => {
    let cNodes: CanvasNode[] = [];
    let cLinks: CanvasLink[] = [];

    const activeFolder = folderStack[folderStack.length - 1] ?? null;

    if (!isVN) {
      const p = project as RpyProject;
      cNodes = p.nodes.map(n => ({
        id: n.id, label: n.label, kind: n.kind,
        x: n.x, y: n.y, w: n.width, h: n.height,
        contentLines: n.content.slice(0, 5)
      }));
      p.nodes.forEach(n => {
        n.links.forEach(l => {
          const target = p.nodes.find(tn => tn.label === l.target_label);
          if (target) cLinks.push({ from: n.id, to: target.id, type: l.link_type });
        });
      });
    } else {
      const p = project as VNProject;
      const scenesInFolders = new Set<string>();
      p.folders.forEach(f => f.scene_ids.forEach(id => scenesInFolders.add(id)));

      const { effectiveBg: effectiveBgs } = computeSceneBgs(p);

      if (!activeFolder) {
        p.folders.forEach(f => {
          cNodes.push({
            id: f.id, label: f.label, kind: 'folder',
            x: f.x, y: f.y, w: 220, h: 80, contentLines: [`${f.scene_ids.length} ${t('editor.nav.scenes').toLowerCase()}`]
          });
        });
      }

      const targetScenes = p.scenes.filter(s =>
        activeFolder
          ? p.folders.find(f => f.id === activeFolder)?.scene_ids.includes(s.id)
          : !scenesInFolders.has(s.id)
      );

      const labelToId: Record<string, string> = {};
      p.scenes.forEach(s => (labelToId[s.label] = s.id));

      const inDeg: Record<string, number> = {};
      const outDeg: Record<string, number> = {};
      p.scenes.forEach(s => { inDeg[s.id] = 0; outDeg[s.id] = 0; });
      targetScenes.forEach(s => {
        s.events.forEach(ev => {
          if (ev.type === 'jump' && ev.scene_id) { inDeg[ev.scene_id] = (inDeg[ev.scene_id] || 0) + 1; outDeg[s.id] = (outDeg[s.id] || 0) + 1; }
          if (ev.type === 'choice') ev.opts?.forEach(o => { if (o.scene) { inDeg[o.scene] = (inDeg[o.scene] || 0) + 1; outDeg[s.id] = (outDeg[s.id] || 0) + 1; } });
          if (ev.type === 'if') {
            if (ev.scene_true)  { inDeg[ev.scene_true]  = (inDeg[ev.scene_true]  || 0) + 1; outDeg[s.id] = (outDeg[s.id] || 0) + 1; }
            if (ev.scene_false) { inDeg[ev.scene_false] = (inDeg[ev.scene_false] || 0) + 1; outDeg[s.id] = (outDeg[s.id] || 0) + 1; }
          }
        });
      });

      const localSceneMap = new Map<string, VNProject['scenes'][number]>();
      p.scenes.forEach(s => localSceneMap.set(s.id, s));

      const getVnType = (targetId: string, baseType: VNLinkKind, opt?: any): VNLinkKind => {
        if (baseType === 'screen') return 'screen';
        let res = baseType;
        if (opt?.is_correct) res = 'good_path';
        else if (opt?.is_incorrect) res = 'bad_path';
        const targetSc = localSceneMap.get(targetId);
        if (targetSc && targetSc.ending_type && (targetSc.ending_type as string) !== 'none') {
          if (targetSc.ending_type === 'bad' || targetSc.ending_type === 'stuck') res = 'bad_path';
          else if (targetSc.ending_type === 'good' || targetSc.ending_type === 'true') res = 'good_path';
          else if (targetSc.ending_type === 'odd') res = 'odd_path';
        }
        return res;
      };

      targetScenes.forEach(s => {
        let isEnd = true;
        const kind = s.label.toLowerCase().startsWith('screen_') ? 'screen' : 'scene';
        s.events.forEach(ev => {
          if (ev.type === 'jump' && ev.scene_id) {
            const vnType = getVnType(ev.scene_id, kind === 'screen' ? 'screen' : 'jump');
            cLinks.push({ from: s.id, to: ev.scene_id, type: 'jump', vnType });
            isEnd = false;
          }
          if (ev.type === 'choice') {
            ev.opts?.forEach(opt => {
              if (opt.scene) {
                const vnType = getVnType(opt.scene, 'choice', opt);
                cLinks.push({ from: s.id, to: opt.scene, type: 'jump', vnType });
                isEnd = false;
              }
            });
          }
          if (ev.type === 'if') {
            if (ev.scene_true)  { cLinks.push({ from: s.id, to: ev.scene_true,  type: 'jump', vnType: 'good_path' }); isEnd = false; }
            if (ev.scene_false) { cLinks.push({ from: s.id, to: ev.scene_false, type: 'jump', vnType: 'bad_path'  }); isEnd = false; }
          }
        });

        const iIn = inDeg[s.id] ?? 0;
        const iOut = outDeg[s.id] ?? 0;
        cNodes.push({
          id: s.id, label: s.label, kind: 'vn_scene',
          x: p.layout[s.id]?.[0] ?? 0, y: p.layout[s.id]?.[1] ?? 0,
          w: 220, h: 110, contentLines: [`${s.events.length} ${t('editor.nav.events').toLowerCase()}`],
          bgImage: effectiveBgs[s.id] ?? undefined,
          isStart: p.start === s.id, isEnd,
          inDegree: iIn, outDegree: iOut,
          isUnreachable: iIn === 0 && p.start !== s.id && s.label.toLowerCase() !== 'start',
          endingType: s.ending_type as CanvasNode['endingType'],
        });
      });

      if (p.start && !activeFolder) {
        cNodes.push({
          id: MAIN_MENU_ID, label: t('canvas.main_menu').replace('🎯 ', ''), kind: 'vn_scene',
          x: p.layout[MAIN_MENU_ID]?.[0] ?? ((p.layout[p.start]?.[0] ?? 200) - 300),
          y: p.layout[MAIN_MENU_ID]?.[1] ?? (p.layout[p.start]?.[1] ?? 200),
          w: 220, h: 110, contentLines: ['Main Menu Editor'],
          isLocked: true,
        });
        cLinks.push({ from: MAIN_MENU_ID, to: p.start, type: 'jump', vnType: 'screen' });
      }
    }

    return { nodes: cNodes, links: cLinks };
  }, [project, isVN, folderStack, rootPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayNodes = useMemo(() => {
    return nodes.map(n => {
      const pos = positions[n.id];
      if (pos) return { ...n, x: pos[0], y: pos[1] };
      return n;
    });
  }, [nodes, positions]);

  return { nodes, links, displayNodes, isVN };
}
