import re

with open('src/SceneEditor.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add new props to Props interface
text = text.replace(
    '  initialSceneId?: string | null;\n}',
    '  initialSceneId?: string | null;\n  canUndo?: boolean;\n  canRedo?: boolean;\n  onUndo?: () => void;\n  onRedo?: () => void;\n}'
)

# 2. Add props to SceneEditor function
text = text.replace(
    'export function SceneEditor({ project, onProjectChange, initialSceneId }: Props) {',
    'export function SceneEditor({ project, onProjectChange, initialSceneId, canUndo, canRedo, onUndo, onRedo }: Props) {'
)

# 3. Remove useLocalHistory definition
text = re.sub(r'function useLocalHistory\(\) \{[\s\S]*?return \{ commit, undo, redo \};\n\}\n', '', text)

# 4. Remove history = useLocalHistory() call
text = re.sub(r'  const history = useLocalHistory\(\);\n', '', text)

# 5. Fix updateScene definition
update_scene_old = """  const updateScene = useCallback((fn: (sc: VNScene) => void, label: string) => {
    if (!scene) return;
    const sceneId = scene.id;
    const snap = JSON.parse(JSON.stringify(scene)) as VNScene;
    history.commit({
      do:   () => { 
        const sc = project.scenes.find(s => s.id === sceneId);
        if (sc) { fn(sc); onProjectChange({ ...project }); refresh(); }
      },
      undo: () => { 
        const idx = project.scenes.findIndex(s => s.id === sceneId);
        if (idx !== -1) {
          project.scenes[idx] = JSON.parse(JSON.stringify(snap));
          onProjectChange({ ...project }); 
          refresh(); 
        }
      },
    });
  }, [scene, project, onProjectChange, history]);"""

update_scene_new = """  const updateScene = useCallback((fn: (sc: VNScene) => void, label: string) => {
    if (!scene) return;
    const sceneId = scene.id;
    const newScenes = project.scenes.map(s => {
      if (s.id === sceneId) {
        const copy = JSON.parse(JSON.stringify(s)) as VNScene;
        fn(copy);
        return copy;
      }
      return s;
    });
    onProjectChange({ ...project, scenes: newScenes });
  }, [scene, project, onProjectChange]);"""
text = text.replace(update_scene_old, update_scene_new)

# 6. Remove Ctrl+Z and Ctrl+Y handlers from onKeyDown
text = re.sub(r'      if \(ctrl && e\.key === "z"\) \{ history\.undo\(\); refresh\(\); return; \}\n', '', text)
text = re.sub(r'      if \(ctrl && e\.key === "y"\) \{ history\.redo\(\); refresh\(\); return; \}\n', '', text)

# 7. Wire global undo/redo buttons
text = text.replace(
    '<button className="btn btn-ghost btn-icon" onClick={() => { history.undo(); refresh(); }} title="Undo (Ctrl+Z)">↩</button>',
    '<button className="btn btn-ghost btn-icon" onClick={onUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3 }} title="Undo (Ctrl+Z)">↩</button>'
)
text = text.replace(
    '<button className="btn btn-ghost btn-icon" onClick={() => { history.redo(); refresh(); }} title="Redo (Ctrl+Y)">↪</button>',
    '<button className="btn btn-ghost btn-icon" onClick={onRedo} disabled={!canRedo} style={{ opacity: canRedo ? 1 : 0.3 }} title="Redo (Ctrl+Y)">↪</button>'
)

# 8. Strip inline history.commit wrappers
# Pattern: history.commit({\n  do: () => { CODE },\n  undo: () => { ... },\n});
# Replace with: { CODE }
text = re.sub(r'history\.commit\(\{[\s]*do:\s*\(\)\s*=>\s*\{([^}]+)\},[\s]*undo:\s*\(\)\s*=>\s*\{[^}]+\},?\s*\}\);', r'{\1}', text)

# There's one specific multi-line commit that might fail the simple regex:
dup_commit = """                              history.commit({
                                do: () => { project.scenes.splice(idx + 1, 0, dup); onProjectChange({ ...project }); setSelSceneId(dup.id); refresh(); },
                                undo: () => { project.scenes.splice(idx + 1, 1); onProjectChange({ ...project }); setSelSceneId(s.id); refresh(); },
                              });"""
dup_replace = """                              const newScenes = [...project.scenes];
                              newScenes.splice(idx + 1, 0, dup);
                              onProjectChange({ ...project, scenes: newScenes });
                              setSelSceneId(dup.id);
                              refresh();"""
text = text.replace(dup_commit, dup_replace)

del_commit = """                              history.commit({
                                do: () => {
                                  project.scenes.splice(idx, 1);
                                  onProjectChange({ ...project });
                                  setSelSceneId(project.scenes[Math.max(0, idx - 1)]?.id ?? "");
                                  refresh();
                                },
                                undo: () => { project.scenes.splice(idx, 0, s); onProjectChange({ ...project }); setSelSceneId(s.id); refresh(); },
                              });"""
del_replace = """                              const newScenes = [...project.scenes];
                              newScenes.splice(idx, 1);
                              onProjectChange({ ...project, scenes: newScenes });
                              setSelSceneId(newScenes[Math.max(0, idx - 1)]?.id ?? "");
                              refresh();"""
text = text.replace(del_commit, del_replace)

new_scene_commit = """                      history.commit({
                        do: () => { project.scenes.push(s); onProjectChange({ ...project }); setSelSceneId(s.id); refresh(); },
                    undo: () => { project.scenes.pop(); onProjectChange({ ...project }); setSelSceneId(project.scenes[project.scenes.length-1].id); refresh(); }
                  });"""
new_scene_replace = """                      const newScenes = [...project.scenes, s];
                      onProjectChange({ ...project, scenes: newScenes });
                      setSelSceneId(s.id);
                      refresh();"""
text = text.replace(new_scene_commit, new_scene_replace)

left_mode_pick_commit = """                                history.commit({
                                  do:   () => { if(scene) scene.events[selIdx] = updated; onProjectChange({ ...project }); refresh(); },
                                  undo: () => { if(scene) scene.events = snap; onProjectChange({ ...project }); refresh(); },
                                });"""
left_mode_pick_replace = """                                const newScenes = project.scenes.map(sc => {
                                  if (sc.id === scene.id) {
                                    const copy = JSON.parse(JSON.stringify(sc)) as VNScene;
                                    copy.events[selIdx] = updated;
                                    return copy;
                                  }
                                  return sc;
                                });
                                onProjectChange({ ...project, scenes: newScenes });
                                refresh();"""
text = text.replace(left_mode_pick_commit, left_mode_pick_replace)

with open('src/SceneEditor.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Refactored SceneEditor.tsx")
