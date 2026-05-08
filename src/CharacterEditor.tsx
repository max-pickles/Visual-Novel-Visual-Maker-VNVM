/**
 * CharacterEditor.tsx — Full character & sprite management.
 * Ported from vn_chars.rpy (legacy Ren'Py VNVMaker).
 * Features: character list, name/color editor, pose/sprite slots,
 *           inline sprite picker, pose rename/delete, dialogue preview.
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import type { VNProject, VNCharacter } from "./types";
import { newCharacter, VN_POSES, VN_PALETTE } from "./types";
import { listAssetFiles } from "./tauriApi";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ColorPicker } from "./ColorPicker";
import type { PaletteColor } from "./colorPalettes";
import { LayeredImageComposer } from "./LayeredImageComposer";
import { useTranslation } from "./translationContext";

interface Props {
  project: VNProject;
  onProjectChange: (p: VNProject) => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CharacterEditor({ project, onProjectChange }: Props) {
  const [selCharId, setSelCharId] = useState<string | null>(
    project.characters[0]?.id ?? null
  );
  const [pickingPose, setPickingPose] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<string[]>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [imgSearch, setImgSearch] = useState("");
  const [previewPose, setPreviewPose] = useState<string>("neutral");
  const [previewWidth, setPreviewWidth] = useState(300);
  const resizeDragRef = useRef<{ active: boolean; startX: number; startW: number }>({ active: false, startX: 0, startW: 0 });
  const { t } = useTranslation();

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizeDragRef.current.active) return;
      const dx = resizeDragRef.current.startX - e.clientX;
      setPreviewWidth(Math.max(200, Math.min(1000, resizeDragRef.current.startW + dx)));
    };
    const onUp = () => { resizeDragRef.current.active = false; document.body.style.cursor = ''; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const rootPath = project._rootPath ?? "";
  const char = project.characters.find((c) => c.id === selCharId) ?? null;

  // Load images for sprite picker whenever it opens
  useEffect(() => {
    if (!rootPath || pickingPose === null) return;
    listAssetFiles(rootPath, "images")
      .then(setImageFiles)
      .catch(() => setImageFiles([]));
  }, [rootPath, pickingPose]);

  // Reset preview pose when character changes
  useEffect(() => {
    if (char && !char.poses.includes(previewPose)) {
      setPreviewPose(char.poses[0] ?? "neutral");
    }
  }, [char?.id]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const updateChar = (updated: VNCharacter) => {
    onProjectChange({
      ...project,
      characters: project.characters.map((c) =>
        c.id === updated.id ? updated : c
      ),
    });
  };

  const addChar = () => {
    const c = newCharacter(`Character ${project.characters.length + 1}`);
    onProjectChange({ ...project, characters: [...project.characters, c] });
    setSelCharId(c.id);
  };

  const deleteChar = (id: string) => {
    const remaining = project.characters.filter((c) => c.id !== id);
    onProjectChange({ ...project, characters: remaining });
    setSelCharId(remaining[0]?.id ?? null);
  };

  const addPose = () => {
    if (!char) return;
    let name = `pose${char.poses.length + 1}`;
    while (char.poses.includes(name)) name += "_";
    updateChar({ ...char, poses: [...char.poses, name], sprites: { ...char.sprites, [name]: "" } });
  };

  const renamePose = (oldPose: string, newPose: string) => {
    if (!char || !newPose.trim() || newPose === oldPose) return;
    if (char.poses.includes(newPose)) return; // avoid duplicates
    const poses = char.poses.map((p) => (p === oldPose ? newPose : p));
    const sprites: Record<string, string> = {};
    for (const [k, v] of Object.entries(char.sprites)) {
      sprites[k === oldPose ? newPose : k] = v;
    }
    if (previewPose === oldPose) setPreviewPose(newPose);
    updateChar({ ...char, poses, sprites });
  };

  const deletePose = (pose: string) => {
    if (!char) return;
    const sprites = { ...char.sprites };
    delete sprites[pose];
    const poses = char.poses.filter((p) => p !== pose);
    if (previewPose === pose) setPreviewPose(poses[0] ?? "neutral");
    updateChar({ ...char, poses, sprites });
  };

  const assignSprite = (pose: string, path: string) => {
    if (!char) return;
    const cleanPath = path.startsWith("game/") ? path.slice(5) : path;
    updateChar({ ...char, sprites: { ...char.sprites, [pose]: cleanPath } });
    setPickingPose(null);
  };

  const clearSprite = (pose: string) => {
    if (!char) return;
    updateChar({ ...char, sprites: { ...char.sprites, [pose]: "" } });
  };

  // ── Filtered image list ──────────────────────────────────────────────────────

  const filteredImages = useMemo(() =>
    imgSearch
      ? imageFiles.filter((f) => f.toLowerCase().includes(imgSearch.toLowerCase()))
      : imageFiles,
    [imageFiles, imgSearch]
  );

  // ── Stats ────────────────────────────────────────────────────────────────────

  const charStats = useMemo(() => {
    if (!char) return { lines: 0, scenes: 0 };
    let lines = 0, sceneSet = new Set<string>();
    for (const sc of project.scenes) {
      for (const ev of sc.events) {
        if (ev.type === "dialogue" && ev.char_id === char.id) {
          lines++;
          sceneSet.add(sc.id);
        }
      }
    }
    return { lines, scenes: sceneSet.size };
  }, [char, project.scenes]);

  // ── Preview sprite URL ────────────────────────────────────────────────────────

  const previewSpriteUrl = useMemo(() => {
    if (!char || !rootPath) return null;
    const path = char.sprites[previewPose] || char.sprites["neutral"] || "";
    return path ? convertFileSrc(`${rootPath}/${path.startsWith("game/") ? path : "game/" + path}`) : null;
  }, [char, previewPose, rootPath]);

  // Build project colour palette from character colors
  const projectColors: PaletteColor[] = project.characters
    .filter((c) => c.color)
    .map((c) => ({ hex: c.color, name: c.display }));

  return (
    <div className="row" style={{ height: "100%", overflow: "hidden" }}>

      {/* ─── Character List sidebar ─── */}
      <div className="panel col" style={{ width: 220, height: "100%", flexShrink: 0, overflowY: "auto" }}>
        <div className="sec-hdr row" style={{ justifyContent: "space-between" }}>
          <span>{t('chars.title')}</span>
          <button className="btn btn-ghost btn-icon" onClick={addChar} title={t('chars.new_char')}>+</button>
        </div>
        <div className="col" style={{ flex: 1, overflowY: "auto", padding: "12px 8px", gap: 8 }}>
          {project.characters.map((c) => {
            const spriteCount = Object.values(c.sprites).filter(Boolean).length;
            const isSel = selCharId === c.id;
            const neutralSprite = c.sprites["neutral"] || Object.values(c.sprites).find(s => s) || "";
            const avatarUrl = neutralSprite ? convertFileSrc(`${rootPath}/${neutralSprite.startsWith("game/") ? neutralSprite : "game/" + neutralSprite}`) : null;
            return (
              <div key={c.id}
                className={`nav-item ${isSel ? "active" : ""}`}
                onClick={() => setSelCharId(c.id)}
                style={{ 
                  gap: 12, padding: "10px 12px", borderRadius: 8, 
                  background: isSel ? `linear-gradient(135deg, ${c.color}15, var(--bg1))` : "var(--bg1)",
                  border: `1px solid ${isSel ? c.color + "33" : "rgba(255,255,255,0.03)"}`,
                  boxShadow: isSel ? `0 4px 12px ${c.color}0A` : "none",
                  borderLeft: isSel ? `3px solid ${c.color}` : "3px solid transparent",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                }}
              >
                <CharAvatar char={c} size={42} spriteUrl={avatarUrl} />
                <div className="col flex1" style={{ gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 14, color: isSel ? c.color : "var(--text)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.display}
                  </span>
                  <div className="row" style={{ gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--dim)", background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4 }}>
                      {spriteCount === 1 ? t('chars.n_sprites').replace('{count}', String(spriteCount)) : t('chars.n_sprites_pl').replace('{count}', String(spriteCount))}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--dim)", background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4 }}>
                      {c.poses.length === 1 ? t('chars.n_poses').replace('{count}', String(c.poses.length)) : t('chars.n_poses_pl').replace('{count}', String(c.poses.length))}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {!project.characters.length && (
            <div style={{ padding: "24px 14px", fontSize: 12, color: "var(--faint)", textAlign: "center" }}>
              No characters yet.<br />Click + to add one.
            </div>
          )}
        </div>

        {/* Add button at bottom */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--bdr)" }}>
          <button className="btn btn-accent" style={{ width: "100%", fontSize: 12 }} onClick={addChar}>
            {t('chars.new_char')}
          </button>
        </div>
      </div>

      {/* ─── Character Inspector ─── */}
      {char ? (
        <div className="col flex1" style={{ height: "100%", overflow: "hidden" }}>
          <div className="row" style={{ flex: 1, overflow: "hidden", minHeight: 0, alignItems: "stretch" }}>

            {/* ── Left: editor fields ── */}
            <div className="col" style={{ flex: 1, height: "100%", overflowY: "auto", padding: "32px 64px 32px 40px", background: "var(--bg0)", minHeight: 0 }}>
              <div className="col gap24" style={{ width: "100%" }}>
                
                {/* Header: avatar + name fields + actions */}
                <div className="col" style={{ gap: 32, alignItems: "flex-start", paddingBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <CharAvatar char={char} size={84} fontSize={36} spriteUrl={previewSpriteUrl} />
                  
                  <div className="col gap12" style={{ width: "100%" }}>
                    <div className="row gap16">
                      <div className="col gap4 flex1">
                        <div className="label">{t('chars.script_name')} <span style={{ color: "var(--faint)", fontWeight: 400, textTransform: "none", letterSpacing: "normal" }}>{t('chars.script_name_hint')}</span></div>
                        <input className="input mono"
                          value={char.name}
                          style={{ fontSize: 14, padding: "8px 12px" }}
                          onChange={(e) => updateChar({ ...char, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_") })}
                          placeholder="MyCharacter"
                        />
                      </div>
                      <div className="col gap4 flex1">
                        <div className="label">{t('chars.display_name')} <span style={{ color: "var(--faint)", fontWeight: 400, textTransform: "none", letterSpacing: "normal" }}>{t('chars.display_name_hint')}</span></div>
                        <input className="input"
                          value={char.display}
                          style={{ fontSize: 14, padding: "8px 12px" }}
                          onChange={(e) => updateChar({ ...char, display: e.target.value })}
                          placeholder="Character Name"
                        />
                      </div>
                    </div>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>
                        Ren'Py variable: <code style={{ fontFamily: "var(--mono)", color: "var(--teal)", background: "rgba(0,212,200,0.1)", padding: "2px 6px", borderRadius: 4 }}>vnc_{char.name}</code>
                      </div>
                      <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--err)", padding: "4px 8px" }}
                        onClick={() => deleteChar(char.id)}>
                        {t('chars.delete_char')}
                      </button>
                    </div>
                  </div>

                </div>

              {/* Color picker */}
              {/* Color picker */}
              <div className="col gap10">
                <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <div className="label">{t('chars.name_color')}</div>
                  <div style={{ padding: "2px 10px", fontSize: 12, color: char.color, fontWeight: 700 }}>
                    {char.display || "Character"}
                  </div>
                </div>
                
                <div style={{ background: "var(--bg1)", borderRadius: 8, border: "1px solid var(--bdr)", padding: 12 }}>
                  <ColorPicker
                    key={char.id}
                    initialColor={char.color}
                    projectColors={projectColors.length > 0 ? projectColors : undefined}
                    onChange={(col) => updateChar({ ...char, color: col })}
                    onPick={(col) => updateChar({ ...char, color: col })}
                  />
                </div>
              </div>



              {/* Advanced Properties */}
              <details style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', background: 'var(--bg1)', overflow: 'hidden' }}>
                <summary style={{ padding: '12px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--dim)', letterSpacing: '0.08em', textTransform: 'uppercase', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t('chars.advanced')}
                </summary>
                <div className="col gap20" style={{ padding: '16px 20px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>

                  {/* NAME LABEL */}
                  <div className="col gap10">
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('chars.name_label')}</div>
                    <div className="row gap12">
                      <div className="col gap4 flex1">
                        <div className="label">{t('chars.name_prefix')}</div>
                        <input className="input mono" style={{ fontSize: 13 }}
                          value={char.name_prefix ?? ''}
                          placeholder="e.g., ~"
                          onChange={(e) => updateChar({ ...char, name_prefix: e.target.value })}
                        />
                        <div className="sublabel">{t('chars.name_prefix_hint')}</div>
                      </div>
                      <div className="col gap4 flex1">
                        <div className="label">{t('chars.name_suffix')}</div>
                        <input className="input mono" style={{ fontSize: 13 }}
                          value={char.name_suffix ?? ''}
                          placeholder="e.g., :"
                          onChange={(e) => updateChar({ ...char, name_suffix: e.target.value })}
                        />
                        <div className="sublabel">{t('chars.name_suffix_hint')}</div>
                      </div>
                    </div>
                  </div>

                  {/* DIALOGUE TEXT */}
                  <div className="col gap10">
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('chars.dialogue_text_section')}</div>
                    <div className="row gap12">
                      <div className="col gap4 flex1">
                        <div className="label">{t('chars.dialogue_prefix')}</div>
                        <input className="input mono" style={{ fontSize: 13 }}
                          value={char.dialogue_prefix ?? ''}
                          placeholder={`e.g., "`}
                          onChange={(e) => updateChar({ ...char, dialogue_prefix: e.target.value })}
                        />
                        <div className="sublabel">{t('chars.dialogue_prefix_hint')}</div>
                      </div>
                      <div className="col gap4 flex1">
                        <div className="label">{t('chars.dialogue_suffix')}</div>
                        <input className="input mono" style={{ fontSize: 13 }}
                          value={char.dialogue_suffix ?? ''}
                          placeholder={`e.g., "`}
                          onChange={(e) => updateChar({ ...char, dialogue_suffix: e.target.value })}
                        />
                        <div className="sublabel">{t('chars.dialogue_suffix_hint')}</div>
                      </div>
                    </div>
                  </div>

                  {/* PROFILE / NOTES */}
                  <div className="col gap4">
                    <div className="label">{t('chars.notes')}</div>
                    <textarea className="input" rows={4}
                      style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.6, fontFamily: 'var(--font)' }}
                      value={char.notes ?? ''}
                      placeholder="A cheerful and optimistic young artist..."
                      onChange={(e) => updateChar({ ...char, notes: e.target.value })}
                    />
                    <div className="sublabel">{t('chars.notes_hint')}</div>
                  </div>

                </div>
              </details>

              {/* Conditional Layered Image Composer or flat Sprite slots */}
              {char.is_layered ? (
                <LayeredImageComposer
                  char={char}
                  rootPath={rootPath}
                  onChange={updateChar}
                  imageFiles={filteredImages}
                />
              ) : (
                <div className="col gap12">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="col gap4">
                      <div className="label">{t('chars.sprite_poses')}</div>
                      <div className="sublabel">{t('chars.sprite_poses_hint')}</div>
                    </div>
                    <div className="row gap8">
                      <button className="btn" style={{ fontSize: 12, padding: "6px 12px", background: "rgba(255,255,255,0.05)" }} onClick={() => updateChar({ ...char, is_layered: true })}>{t('chars.convert_layered')}</button>
                      <button className="btn" style={{ fontSize: 12, padding: "6px 12px", background: "rgba(255,255,255,0.05)" }} onClick={addPose}>{t('chars.add_pose')}</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px", color: "var(--err)" }} onClick={() => deletePose(previewPose)} disabled={char.poses.length <= 1}>{t('chars.delete_pose')}</button>
                    </div>
                  </div>

                  <div className="row wrap gap12">
                    {char.poses.map((pose) => {
                      const spritePath = char.sprites[pose] ?? "";
                      const spriteUrl = spritePath && rootPath
                        ? convertFileSrc(`${rootPath}/${spritePath.startsWith("game/") ? spritePath : "game/" + spritePath}`)
                        : null;
                      const isPreview = previewPose === pose;
                      return (
                        <SpriteSlot
                          key={pose}
                          pose={pose}
                          spriteUrl={spriteUrl}
                          spritePath={spritePath}
                          charColor={char.color}
                          isPreview={isPreview}
                          onPick={() => { setPickingPose(pose); setImgSearch(""); }}
                          onClear={() => clearSprite(pose)}
                          onRename={(n) => renamePose(pose, n)}
                          onDelete={() => deletePose(pose)}
                          onSetPreview={() => setPreviewPose(pose)}
                        />
                      );
                    })}
                  </div>

                  {/* ─── Inline Sprite Picker ─── */}
                  {pickingPose !== null && (
                    <div style={{ marginTop: 16, background: "var(--bg1)", border: "1px solid var(--bdr)", borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <div className="sec-hdr row" style={{ justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--bdr)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700 }}>{t('chars.pick_sprite')} — <span style={{ color: "var(--teal)" }}>{pickingPose}</span></span>
                        <button className="btn btn-ghost btn-icon" style={{ width: 24, height: 24, fontSize: 12 }} onClick={() => setPickingPose(null)}>✕</button>
                      </div>
                      <div className="row" style={{ padding: "10px 14px", gap: 10, borderBottom: "1px solid var(--bdr)" }}>
                        <input className="input flex1" placeholder={t('chars.search_images')}
                          value={imgSearch} onChange={(e) => setImgSearch(e.target.value)} autoFocus />
                        {char?.sprites[pickingPose] && (
                          <button className="btn btn-ghost" style={{ fontSize: 11, color: "var(--err)" }}
                            onClick={() => { clearSprite(pickingPose); setPickingPose(null); }}>
                            {t('chars.clear')}
                          </button>
                        )}
                        <span style={{ fontSize: 11, color: "var(--dim)", alignSelf: "center" }}>
                          {filteredImages.length} files
                        </span>
                      </div>
                      <div className="row wrap gap8" style={{ padding: "12px 14px 14px", overflowY: "auto", minHeight: 120, maxHeight: 300 }}>
                        {filteredImages.map((f) => {
                          const url = convertFileSrc(`${rootPath}/${f.startsWith("game/") ? f : "game/" + f}`);
                          const name = f.split("/").pop() ?? f;
                          const isSel = char?.sprites[pickingPose] === f || char?.sprites[pickingPose] === (f.startsWith("game/") ? f.slice(5) : f);
                          return (
                            <div key={f}
                              className={`asset-tile${isSel ? " selected" : ""}`}
                              onClick={() => assignSprite(pickingPose, f)}
                              title={f}
                            >
                              <img src={url} alt={name} style={{ flex: 1, width: "100%", objectFit: "contain", minHeight: 0 }} />
                              <div className="name">{name}</div>
                            </div>
                          );
                        })}
                        {!filteredImages.length && (
                          <div style={{ width: "100%", textAlign: "center", padding: "32px 0", fontSize: 12, color: "var(--faint)" }}>
                            {imageFiles.length
                              ? `No results for "${imgSearch}"`
                              : `No images found. Add .png or .jpg files to your project's images/ folder.`}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>

            {/* ── Right: dialogue preview ── */}
            <div className="col" style={{ position: "relative", width: previewWidth, flexShrink: 0, borderLeft: "1px solid var(--bdr)", background: "var(--bg0)" }}>
              {/* Resizer */}
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  resizeDragRef.current = { active: true, startX: e.clientX, startW: previewWidth };
                  document.body.style.cursor = 'ew-resize';
                }}
                style={{
                  position: 'absolute', top: 0, left: -3, width: 6, height: '100%',
                  cursor: 'ew-resize', zIndex: 10, background: 'transparent',
                }}
                title="Drag to resize preview"
              />
              <div className="sec-hdr">{t('chars.dialogue_preview')}</div>

              {/* Preview canvas */}
              <div style={{
                flex: 1, position: "relative", background: "#111",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden", minHeight: 0,
              }}>
                {/* Sprite */}
                {char.is_layered ? (
                  char.layer_order?.map((layer, idx) => {
                    const file = char.layered_sprites?.[previewPose]?.[layer];
                    if (!file) return null;
                    return (
                      <img key={layer} src={convertFileSrc(`${rootPath}/${file.startsWith("game/") ? file : "game/" + file}`)} alt=""
                        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", maxHeight: "85%", maxWidth: "85%", objectFit: "contain", zIndex: idx }}
                      />
                    );
                  })
                ) : previewSpriteUrl ? (
                  <img src={previewSpriteUrl} alt={previewPose}
                    style={{ maxHeight: "85%", maxWidth: "85%", objectFit: "contain", zIndex: 1 }}
                  />
                ) : (
                  <div style={{ color: "var(--faint)", fontSize: 12, textAlign: "center", padding: 24, zIndex: 1 }}>
                    {t('chars.no_sprite')}<br />for "{previewPose}"
                  </div>
                )}

                {/* Mock dialogue box */}
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  background: "rgba(0,0,0,0.85)", borderTop: `2px solid ${char.color}`,
                  padding: "10px 14px", zIndex: 2,
                }}>
                  <div style={{ fontSize: 13, color: char.color, fontWeight: 700, marginBottom: 4 }}>
                    {char.display || "Character"}
                  </div>
                  <div style={{ fontSize: 11, color: "#e0e0e0", lineHeight: 1.5 }}>
                    Hello! I'm {char.display || "a character"} in your visual novel.
                  </div>
                </div>
              </div>

              {/* Pose selector strip */}
              <div style={{ borderTop: "1px solid var(--bdr)", padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6, letterSpacing: "0.05em" }}>
                  {t('chars.preview_pose')}
                </div>
                <div className="row wrap gap4">
                  {char.poses.map((pose) => {
                    const hasSprite = char.is_layered 
                      ? Object.keys(char.layered_sprites?.[pose] ?? {}).length > 0
                      : !!char.sprites[pose];
                    return (
                      <button key={pose}
                        onClick={() => setPreviewPose(pose)}
                        style={{
                          padding: "3px 8px", fontSize: 10, border: "1px solid",
                          borderColor: previewPose === pose ? char.color : "var(--bdr)",
                          borderRadius: 4, cursor: "pointer", fontFamily: "var(--mono)",
                          background: previewPose === pose ? char.color + "22" : "transparent",
                          color: previewPose === pose ? char.color : hasSprite ? "var(--text)" : "var(--faint)",
                        }}>
                        {pose}
                        {!hasSprite && <span style={{ opacity: 0.4 }}> ○</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "var(--faint)" }}>
          <span style={{ fontSize: 56 }}>👥</span>
          <span style={{ fontSize: 14, color: "var(--dim)" }}>{t('chars.select_or_create')}</span>
          <button className="btn btn-accent" style={{ fontSize: 13, padding: "8px 24px" }} onClick={addChar}>
            {t('chars.new_char')}
          </button>
        </div>
      )}


    </div>
  );
}

// ─── Character Avatar ─────────────────────────────────────────────────────────

function CharAvatar({ char, size = 36, fontSize, spriteUrl }: { char: VNCharacter; size?: number; fontSize?: number; spriteUrl?: string | null }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size > 40 ? 10 : "50%",
      background: char.color + "22", border: `2px solid ${char.color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: char.color, fontWeight: 700, fontSize: fontSize ?? Math.floor(size * 0.44),
      flexShrink: 0, userSelect: "none", overflow: "hidden",
    }}>
      {spriteUrl ? (
        <img src={spriteUrl} alt={char.display} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
      ) : (
        char.display.charAt(0).toUpperCase() || "?"
      )}
    </div>
  );
}

// ─── Sprite Slot ──────────────────────────────────────────────────────────────

interface SpriteSlotProps {
  pose: string;
  spriteUrl: string | null;
  spritePath: string;
  charColor: string;
  isPreview: boolean;
  onPick: () => void;
  onClear: () => void;
  onRename: (n: string) => void;
  onDelete: () => void;
  onSetPreview: () => void;
}

function SpriteSlot({ pose, spriteUrl, spritePath, charColor, isPreview, onPick, onClear, onRename, onDelete, onSetPreview }: SpriteSlotProps) {
  const [imgError, setImgError] = useState(false);
  useEffect(() => setImgError(false), [spriteUrl]);

  return (
    <div style={{ width: 110, flexShrink: 0 }}>
      {/* Sprite thumbnail */}
      <div
        style={{
          width: 110, height: 110, background: "var(--bg3)",
          border: `1px solid ${isPreview ? charColor : "var(--bdr)"}`,
          borderRadius: 6, overflow: "hidden", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", transition: "border-color 0.15s",
        }}
        onClick={() => { onPick(); onSetPreview?.(); }}
        title="Click to assign sprite"
      >
        {spriteUrl && !imgError ? (
          <img src={spriteUrl} alt={pose} onError={() => setImgError(true)} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center" }} />
        ) : spriteUrl && imgError ? (
          <div className="col gap4" style={{ alignItems: 'center', opacity: 0.4 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>👤</span>
            <span style={{ fontSize: 9, textAlign: 'center', width: '100%', padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pose}</span>
          </div>
        ) : (
          <span style={{ fontSize: 22, color: "var(--faint)" }}>+</span>
        )}
        {/* Preview badge */}
        {isPreview && (
          <div style={{ position: "absolute", top: 4, right: 4, background: charColor, color: "#000", fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3 }}>
            PREVIEW
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="row gap2" style={{ marginTop: 5 }}>
        <PoseName name={pose} onRename={onRename} />
      </div>

      {/* Clear sprite link */}
      {spritePath && (
        <div onClick={onClear}
          style={{ fontSize: 9, color: "var(--faint)", cursor: "pointer", textAlign: "center", marginTop: 2, textDecoration: "underline" }}>
          clear
        </div>
      )}
    </div>
  );
}

// ─── Inline Pose Name Editor ──────────────────────────────────────────────────

function PoseName({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);

  if (editing) {
    return (
      <input autoFocus className="input flex1"
        style={{ height: 20, fontSize: 10, padding: "1px 4px" }}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEditing(false); onRename(val.trim() || name); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); onRename(val.trim() || name); }
          if (e.key === "Escape") { setEditing(false); setVal(name); }
        }}
      />
    );
  }

  return (
    <div
      className="flex1"
      style={{ fontSize: 10, color: "var(--dim)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text", lineHeight: "20px" }}
      title={`Double-click to rename "${name}"`}
      onDoubleClick={() => { setEditing(true); setVal(name); }}
    >
      {name}
    </div>
  );
}
