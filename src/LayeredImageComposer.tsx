import React, { useState, useMemo } from "react";
import type { VNCharacter } from "./types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "./translationContext";

interface Props {
  char: VNCharacter;
  rootPath: string;
  onChange: (char: VNCharacter) => void;
  imageFiles: string[];
}

export function LayeredImageComposer({ char, rootPath, onChange, imageFiles }: Props) {
  const [activePose, setActivePose] = useState<string>(char.poses[0] ?? "neutral");
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const isLayered = char.is_layered ?? false;
  const layerOrder = char.layer_order ?? ["base", "clothes", "eyes", "mouth"];
  const layeredSprites = char.layered_sprites ?? {};
  const currentPoseLayers = layeredSprites[activePose] ?? {};

  const toggleLayeredMode = () => {
    onChange({
      ...char,
      is_layered: !isLayered,
      layer_order: layerOrder,
      layered_sprites: layeredSprites,
    });
  };

  const filteredImages = useMemo(() => {
    if (!search) return imageFiles;
    const lowerSearch = search.toLowerCase();
    return imageFiles.filter(f => f.toLowerCase().includes(lowerSearch));
  }, [imageFiles, search]);

  if (!isLayered) {
    return (
      <div className="col gap16" style={{ padding: "20px", background: "var(--bg1)", borderRadius: 8, border: "1px solid var(--bdr)" }}>
        <div className="row gap12" style={{ alignItems: "center" }}>
          <div style={{ fontSize: 24 }}>🎛️</div>
          <div className="col gap4">
            <div style={{ fontWeight: 700 }}>{t('chars.layered_mode')}</div>
            <div style={{ fontSize: 12, color: "var(--dim)" }}>{t('chars.layered_hint')}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-accent" onClick={toggleLayeredMode}>{t('chars.enable_layered')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="col gap20" style={{ padding: "20px", background: "var(--bg0)", border: "1px solid var(--bdr)", borderRadius: 8 }}>
      <div className="row gap20" style={{ alignItems: "flex-start" }}>
        
        {/* Left: Pose list & Layers */}
        <div className="col gap16" style={{ width: 220, flexShrink: 0 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{t('chars.poses')}</div>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={toggleLayeredMode}>{t('chars.revert')}</button>
          </div>
          
          <div className="col gap4">
            {char.poses.map(pose => (
              <div key={pose}
                className="row"
                style={{
                  padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                  background: activePose === pose ? "var(--teal)" : "var(--bg1)",
                  color: activePose === pose ? "#000" : "var(--text)",
                  fontWeight: activePose === pose ? 700 : 500
                }}
                onClick={() => { setActivePose(pose); setActiveLayer(null); }}
              >
                {pose}
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: "var(--bdr)", margin: "8px 0" }} />
          
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "var(--dim)" }}>{t('chars.layers')} ({activePose})</div>
          
          <div className="col gap6">
            {layerOrder.map((layer) => {
              const file = currentPoseLayers[layer];
              const isSel = activeLayer === layer;
              return (
                <div key={layer}
                  className="col"
                  style={{
                    padding: "8px", borderRadius: 6, cursor: "pointer",
                    background: "var(--bg1)", border: `1px solid ${isSel ? "var(--acc2)" : "transparent"}`,
                    opacity: file ? 1 : 0.6
                  }}
                  onClick={() => setActiveLayer(layer)}
                >
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{layer}</div>
                    {file && <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--teal)" }} />}
                  </div>
                  {file && (
                    <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.split("/").pop()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Middle: Live Composite Preview */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>{t('chars.composite_preview')}</div>
          <div style={{
            height: 400, background: "var(--bg1)", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
            overflow: "hidden"
          }}>
            {layerOrder.map((layer, idx) => {
              const file = currentPoseLayers[layer];
              if (!file) return null;
              return (
                <img
                  key={layer}
                  src={convertFileSrc(`${rootPath}/${file.startsWith("game/") ? file : "game/" + file}`)}
                  style={{
                    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                    maxWidth: "100%", maxHeight: "100%",
                    objectFit: "contain", zIndex: idx
                  }}
                />
              );
            })}
            {Object.keys(currentPoseLayers).length === 0 && (
              <div style={{ color: "var(--faint)", marginBottom: 180 }}>{t('chars.select_layers')}</div>
            )}
          </div>
        </div>

        {/* Right: Asset Picker for active layer */}
        <div className="col gap12" style={{ width: 280, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>
            {activeLayer ? `${t('chars.select_asset')}: ${activeLayer.toUpperCase()}` : t('chars.select_a_layer')}
          </div>
          
          {activeLayer ? (
            <div className="col gap8" style={{ flex: 1, background: "var(--bg1)", borderRadius: 8, padding: 12, border: "1px solid var(--bdr)" }}>
              <input 
                className="input" 
                placeholder={t('chars.search_images')} 
                value={search} onChange={e => setSearch(e.target.value)} 
              />
              <div className="row wrap gap6" style={{ overflowY: "auto", maxHeight: 340 }}>
                {filteredImages.map(f => {
                  const url = convertFileSrc(`${rootPath}/${f.startsWith("game/") ? f : "game/" + f}`);
                  const name = f.split("/").pop() ?? f;
                  const isSel = currentPoseLayers[activeLayer] === f || currentPoseLayers[activeLayer] === (f.startsWith("game/") ? f.slice(5) : f);
                  
                  return (
                    <div key={f}
                      onClick={() => {
                        const cleanPath = f.startsWith("game/") ? f.slice(5) : f;
                        const nextPoseLayers = { ...currentPoseLayers, [activeLayer]: cleanPath };
                        onChange({
                          ...char,
                          layered_sprites: {
                            ...char.layered_sprites,
                            [activePose]: nextPoseLayers
                          }
                        });
                      }}
                      style={{
                        width: "48%", aspectRatio: "1", background: "var(--bg3)", borderRadius: 6,
                        border: `2px solid ${isSel ? "var(--teal)" : "transparent"}`, overflow: "hidden",
                        cursor: "pointer", position: "relative"
                      }}
                      title={f}
                    >
                      <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding: "24px", textAlign: "center", background: "var(--bg1)", borderRadius: 8, color: "var(--faint)", fontSize: 12 }}>
              {t('chars.click_layer')}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
