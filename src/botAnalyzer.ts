import { VNProject } from './types';

export function runBotAnalysis(project: VNProject): string {
  let log = `🤖 VNV Maker Bot Analysis Report\n`;
  log += `Project: ${project.title}\n`;
  log += `====================================================\n\n`;

  // 1. Find all endings (scenes with no outgoing jumps)
  const outgoingCounts = new Map<string, number>();
  project.scenes.forEach(s => outgoingCounts.set(s.id, 0));

  project.scenes.forEach(s => {
    s.events.forEach(ev => {
      if (ev.type === 'jump' && ev.scene_id) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
      if (ev.type === 'choice') {
        ev.opts?.forEach(o => {
          if (o.scene) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
        });
      }
      if (ev.type === 'if') {
        if (ev.scene_true) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
        if (ev.scene_false) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
      }
    });
  });

  const endings = project.scenes.filter(s => outgoingCounts.get(s.id) === 0 && s.id !== 'main_menu');
  log += `### 🎯 Endings Detected (${endings.length})\n`;
  
  const trueKeywords = ['true end', 'credits', 'finale', 'the end'];
  const badKeywords = ['bad', 'die', 'dead', 'death', 'game over', 'fail', 'stuck', 'end_bad', 'gameover'];
  const goodKeywords = ['good', 'happy', 'survive', 'win', 'best', 'end_good'];

  const endingTypes = new Map<string, 'True' | 'Good' | 'Bad' | 'Normal' | 'Unknown'>();

  endings.forEach(end => {
    const textStr = end.events.map(e => e.text || '').join(' ').toLowerCase();
    const labelLower = end.label.toLowerCase();
    
    let isTrue = trueKeywords.some(kw => labelLower.includes(kw));
    let isBad = badKeywords.some(kw => labelLower.includes(kw));
    let isGood = goodKeywords.some(kw => labelLower.includes(kw));
    
    if (!isTrue && !isBad && !isGood) {
      isTrue = trueKeywords.some(kw => textStr.includes(kw));
      isBad = badKeywords.some(kw => textStr.includes(kw));
      isGood = goodKeywords.some(kw => textStr.includes(kw));
    }
    
    // Explicit override if project data has ending_type
    if (end.ending_type === 'true') isTrue = true;
    if (end.ending_type === 'bad') isBad = true;
    if (end.ending_type === 'good') isGood = true;

    let type: 'True' | 'Good' | 'Bad' | 'Normal' | 'Unknown' = 'Normal';
    if (isTrue) type = 'True';
    else if (isBad && !isGood) type = 'Bad';
    else if (isGood && !isBad) type = 'Good';
    else if (isBad && isGood) type = 'Unknown';

    endingTypes.set(end.id, type);
    log += `- Scene "${end.label}": Looks like a ${type} ending.\n`;
  });
  if (endings.length === 0) log += `- No endings found! Every path might be an infinite loop.\n`;
  log += `\n`;

  // 2. Trace Choices
  log += `### 🔀 Choice Path Analysis\n`;

  // Helper to find shortest path to any ending from a scene
  // Returns { type, distance, targetLabel }
  function findEndingPath(startId: string, visited = new Set<string>()): { type: string, distance: number, targetLabel: string } | null {
    if (visited.has(startId)) return null; // Loop
    
    const type = endingTypes.get(startId);
    if (type) {
      const sc = project.scenes.find(s => s.id === startId);
      return { type, distance: 0, targetLabel: sc?.label || 'Unknown' };
    }

    visited.add(startId);
    const scene = project.scenes.find(s => s.id === startId);
    if (!scene) return null;

    let bestPath: { type: string, distance: number, targetLabel: string } | null = null;

    const evaluateTarget = (targetId: string) => {
      const p = findEndingPath(targetId, new Set(visited));
      if (p) {
        if (!bestPath) {
          bestPath = { type: p.type, distance: p.distance + 1, targetLabel: p.targetLabel };
        } else {
          // Prioritize reaching a True/Good end if possible, or shortest path
          if (p.type === 'True' && bestPath.type !== 'True') {
            bestPath = { type: p.type, distance: p.distance + 1, targetLabel: p.targetLabel };
          } else if (p.type === 'Good' && bestPath.type !== 'True' && bestPath.type !== 'Good') {
            bestPath = { type: p.type, distance: p.distance + 1, targetLabel: p.targetLabel };
          } else if (p.type === bestPath.type && p.distance + 1 < bestPath.distance) {
            bestPath = { type: p.type, distance: p.distance + 1, targetLabel: p.targetLabel };
          }
        }
      }
    };

    scene.events.forEach(ev => {
      if (ev.type === 'jump' && ev.scene_id) evaluateTarget(ev.scene_id);
      if (ev.type === 'choice') {
        ev.opts?.forEach(o => { if (o.scene) evaluateTarget(o.scene); });
      }
      if (ev.type === 'if') {
        if (ev.scene_true) evaluateTarget(ev.scene_true);
        if (ev.scene_false) evaluateTarget(ev.scene_false);
      }
    });

    return bestPath;
  }

  let choiceCount = 0;
  project.scenes.forEach(scene => {
    scene.events.forEach(ev => {
      if (ev.type === 'choice') {
        choiceCount++;
        log += `* Scene "${scene.label}" has a Choice:\n`;
        ev.opts?.forEach(opt => {
          if (!opt.scene) {
            log += `  - "${opt.text}" -> (Unlinked / Dead End)\n`;
            return;
          }
          const targetScene = project.scenes.find(s => s.id === opt.scene);
          if (!targetScene) return;

          const pathInfo = findEndingPath(opt.scene);
          if (pathInfo) {
            log += `  - "${opt.text}" -> Leads to scene "${targetScene.label}". Eventually hits a ${pathInfo.type} ending ("${pathInfo.targetLabel}") in ~${pathInfo.distance} jumps.\n`;
          } else {
            log += `  - "${opt.text}" -> Leads to scene "${targetScene.label}". (Looks like an infinite loop or dead end!)\n`;
          }
        });
        log += `\n`;
      }
    });
  });
  
  if (choiceCount === 0) {
    log += `No choices found in the project.\n\n`;
  }

  // 3. Variable usage
  log += `### 🔑 Variables / Keys Detected\n`;
  const setVars = new Set<string>();
  const ifVars = new Set<string>();

  project.scenes.forEach(s => {
    s.events.forEach(ev => {
      if (ev.type === 'setvar' && ev.var_name) setVars.add(ev.var_name.trim());
      if (ev.type === 'if' && ev.condition) {
        // extract words that look like variables
        const words = ev.condition.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g);
        if (words) {
          const ignore = ['True', 'False', 'None', 'and', 'or', 'not', 'is'];
          words.forEach(w => { if (!ignore.includes(w)) ifVars.add(w); });
        }
      }
    });
  });

  if (setVars.size > 0 || ifVars.size > 0) {
    const allVars = new Set([...setVars, ...ifVars]);
    allVars.forEach(v => {
      if (setVars.has(v) && ifVars.has(v)) {
        log += `- Variable "${v}" is set and checked later. This might be a key item or important flag!\n`;
      } else if (setVars.has(v)) {
        log += `- Variable "${v}" is set but never checked in an 'if' statement.\n`;
      } else if (ifVars.has(v)) {
        log += `- Variable "${v}" is checked in an 'if' statement, but I couldn't find where it gets set.\n`;
      }
    });
  } else {
    log += `No variables or conditional branches found.\n`;
  }

  log += `\n====================================================\n`;
  log += `Bot analysis complete. Copy/paste this log to discuss it!\n`;

  return log;
}

export type EndType = 'true' | 'good' | 'bad' | 'stuck' | 'odd' | 'normal';

export function computeReachability(project: VNProject): Map<string, Set<EndType>> {
  const reachability = new Map<string, Set<EndType>>();

  const outgoingCounts = new Map<string, number>();
  project.scenes.forEach(s => outgoingCounts.set(s.id, 0));

  project.scenes.forEach(s => {
    s.events.forEach(ev => {
      if (ev.type === 'jump' && ev.scene_id) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
      if (ev.type === 'choice') {
        ev.opts?.forEach(o => { if (o.scene) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1); });
      }
      if (ev.type === 'if') {
        if (ev.scene_true) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
        if (ev.scene_false) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
      }
    });
  });

  const endings = project.scenes.filter(s => outgoingCounts.get(s.id) === 0 && s.id !== 'main_menu');

  const trueKeywords = ['true end', 'credits', 'finale', 'the end'];
  const badKeywords = ['bad', 'die', 'dead', 'death', 'game over', 'fail', 'end_bad', 'gameover'];
  const goodKeywords = ['good', 'happy', 'survive', 'win', 'best', 'end_good'];
  const stuckKeywords = ['stuck', 'loop'];
  const oddKeywords = ['odd', 'weird', 'secret', 'joke'];

  endings.forEach(end => {
    const textStr = end.events.map(e => e.text || '').join(' ').toLowerCase();
    const labelLower = end.label.toLowerCase();
    
    let detectedType: EndType = 'normal'; 
    
    if (trueKeywords.some(kw => labelLower.includes(kw))) detectedType = 'true';
    else if (badKeywords.some(kw => labelLower.includes(kw))) detectedType = 'bad';
    else if (goodKeywords.some(kw => labelLower.includes(kw))) detectedType = 'good';
    else if (stuckKeywords.some(kw => labelLower.includes(kw))) detectedType = 'stuck';
    else if (oddKeywords.some(kw => labelLower.includes(kw))) detectedType = 'odd';
    else if (trueKeywords.some(kw => textStr.includes(kw))) detectedType = 'true';
    else if (badKeywords.some(kw => textStr.includes(kw))) detectedType = 'bad';
    else if (goodKeywords.some(kw => textStr.includes(kw))) detectedType = 'good';
    else if (stuckKeywords.some(kw => textStr.includes(kw))) detectedType = 'stuck';
    else if (oddKeywords.some(kw => textStr.includes(kw))) detectedType = 'odd';
    
    if (detectedType === 'normal') detectedType = 'bad';

    const finalType = (end.ending_type as EndType) || detectedType;
    reachability.set(end.id, new Set([finalType]));
  });

  function computeReachable(sceneId: string, visited: Set<string>): Set<EndType> {
    if (reachability.has(sceneId)) return reachability.get(sceneId)!;
    if (visited.has(sceneId)) return new Set();

    visited.add(sceneId);
    const scene = project.scenes.find(s => s.id === sceneId);
    const results = new Set<EndType>();

    if (scene) {
      scene.events.forEach(ev => {
        const checkTarget = (tId: string) => {
          computeReachable(tId, new Set(visited)).forEach(e => results.add(e));
        };
        if (ev.type === 'jump' && ev.scene_id) checkTarget(ev.scene_id);
        if (ev.type === 'choice') ev.opts?.forEach(o => { if (o.scene) checkTarget(o.scene); });
        if (ev.type === 'if') {
          if (ev.scene_true) checkTarget(ev.scene_true);
          if (ev.scene_false) checkTarget(ev.scene_false);
        }
      });
    }

    reachability.set(sceneId, results);
    return results;
  }

  project.scenes.forEach(s => computeReachable(s.id, new Set()));
  return reachability;
}

/**
 * Auto-tags endings and choice paths based on bot keyword analysis and graph reachability.
 * Returns a cloned project with updated tags, or the original project if no changes were needed.
 */
export function autoTagProject(project: VNProject): VNProject {
  let changed = false;
  const p = { ...project, scenes: project.scenes.map(s => ({ ...s, events: s.events.map(ev => ({ ...ev })) })) };

  const outgoingCounts = new Map<string, number>();
  p.scenes.forEach(s => outgoingCounts.set(s.id, 0));

  p.scenes.forEach(s => {
    s.events.forEach(ev => {
      if (ev.type === 'jump' && ev.scene_id) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
      if (ev.type === 'choice') ev.opts?.forEach(o => { if (o.scene) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1); });
      if (ev.type === 'if') {
        if (ev.scene_true) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
        if (ev.scene_false) outgoingCounts.set(s.id, (outgoingCounts.get(s.id) || 0) + 1);
      }
    });
  });

  const endings = p.scenes.filter(s => outgoingCounts.get(s.id) === 0 && s.id !== 'main_menu');

  const trueKeywords = ['true end', 'credits', 'finale', 'the end'];
  const badKeywords = ['bad', 'die', 'dead', 'death', 'game over', 'fail', 'end_bad', 'gameover'];
  const goodKeywords = ['good', 'happy', 'survive', 'win', 'best', 'end_good'];
  const stuckKeywords = ['stuck', 'loop'];
  const oddKeywords = ['odd', 'weird', 'secret', 'joke'];

  endings.forEach(end => {
    const textStr = end.events.map(e => e.text || '').join(' ').toLowerCase();
    const labelLower = end.label.toLowerCase();
    let detectedType: EndType = 'normal'; 
    if (trueKeywords.some(kw => labelLower.includes(kw))) detectedType = 'true';
    else if (badKeywords.some(kw => labelLower.includes(kw))) detectedType = 'bad';
    else if (goodKeywords.some(kw => labelLower.includes(kw))) detectedType = 'good';
    else if (stuckKeywords.some(kw => labelLower.includes(kw))) detectedType = 'stuck';
    else if (oddKeywords.some(kw => labelLower.includes(kw))) detectedType = 'odd';
    else if (trueKeywords.some(kw => textStr.includes(kw))) detectedType = 'true';
    else if (badKeywords.some(kw => textStr.includes(kw))) detectedType = 'bad';
    else if (goodKeywords.some(kw => textStr.includes(kw))) detectedType = 'good';
    else if (stuckKeywords.some(kw => textStr.includes(kw))) detectedType = 'stuck';
    else if (oddKeywords.some(kw => textStr.includes(kw))) detectedType = 'odd';
    if (detectedType === 'normal') detectedType = 'bad';

    if (!end.ending_type) {
      end.ending_type = detectedType;
      changed = true;
    }
  });

  const reachability = computeReachability(p);



  // 4. Evaluate Choice Edges
  p.scenes.forEach(scene => {
    scene.events.forEach(ev => {
      if (ev.type === 'choice' && ev.opts && ev.opts.length > 1) {
        
        // Find if any sibling option reaches 'true' or 'good'
        const anyOptionReachesGoodOrTrue = ev.opts.some(o => {
          if (!o.scene) return false;
          const r = reachability.get(o.scene);
          return r && (r.has('good') || r.has('true'));
        });

        ev.opts.forEach(opt => {
          if (!opt.scene) return;
          const r = reachability.get(opt.scene);
          if (!r) return;

          // Clear stale 'is_incorrect' tags if the path now clearly reaches a true/good end
          if (opt.is_incorrect && (r.has('true') || r.has('good'))) {
             opt.is_incorrect = undefined;
             changed = true;
          }

          // Only tag if the user hasn't manually tagged it yet
          if (opt.is_correct === undefined && opt.is_incorrect === undefined) {
            
            // If it strictly leads to Bad/Stuck
            if (!r.has('true') && !r.has('good') && !r.has('odd') && (r.has('bad') || r.has('stuck'))) {
              opt.is_incorrect = true;
              opt.is_correct = false;
              changed = true;
            } 
            // If it leads to Good/True, and another sibling does NOT lead to good/true (making this one clearly the 'Correct' path)
            else if ((r.has('good') || r.has('true')) && anyOptionReachesGoodOrTrue) {
              // Wait, we need to check if there is an alternative that is strictly worse.
              // If *this* option reaches good, and *some other* option doesn't, this is 'correct'.
              const hasWorseSibling = ev.opts!.some(sib => {
                if (!sib.scene || sib.id === opt.id) return false;
                const sibR = reachability.get(sib.scene);
                return sibR && !sibR.has('good') && !sibR.has('true');
              });

              if (hasWorseSibling) {
                opt.is_correct = true;
                opt.is_incorrect = false;
                changed = true;
              }
            }
          }
        });
      }
    });
  });

  return changed ? p : project;
}

