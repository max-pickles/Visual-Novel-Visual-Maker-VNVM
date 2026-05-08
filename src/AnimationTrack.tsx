import React, { useState } from "react";
import type { VNKeyframe, ATLEasing } from "./types";
import { DraggableNumber } from "./Inspector";
import { useTranslation } from "./translationContext";

interface Props {
  frames: VNKeyframe[];
  selIdx: number;
  onChange: (v: VNKeyframe[]) => void;
}

export function AnimPropertiesPanel({ frames, selIdx, onChange }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'transform' | 'crop' | 'effects' | 'color'>('transform');
  const cur = frames[selIdx];

  const setProp = (key: keyof VNKeyframe["props"], val: number) => {
    if (!frames[selIdx]) return;
    const copy = [...frames];
    copy[selIdx] = { ...copy[selIdx], props: { ...copy[selIdx].props, [key]: val } };
    onChange(copy);
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginTop: 12
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: "16px", background: "rgba(0,0,0,0.15)" }}>
      {cur ? (
        <div className="col gap12">
          {/* Property Tabs - Segmented Control */}
          <div className="row" style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 4, display: "flex" }}>
            {(['transform', 'crop', 'effects', 'color'] as const).map(tab => {
              const icons = { transform: "⤡", crop: "◩", effects: "✨", color: "◑" };
              const isAct = activeTab === tab;
              return (
                <button
                  key={tab}
                  style={{
                    flex: 1, padding: "6px 8px", fontSize: 11, fontWeight: isAct ? 700 : 600,
                    borderRadius: 6, border: "none", cursor: "pointer", transition: "all 0.15s",
                    background: isAct ? "var(--teal)" : "transparent",
                    color: isAct ? "#000" : "var(--dim)"
                  }}
                  onClick={() => setActiveTab(tab)}
                >
                  <span style={{ marginRight: 4, fontSize: 12 }}>{icons[tab]}</span>
                  {t(`animation_track.tab_${tab}`)}
                </button>
              );
            })}
          </div>

          {activeTab === 'transform' && (
            <div style={gridStyle}>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>↔ {t("animation_track.prop_xalign")}</span>
                <DraggableNumber value={cur.props.xalign ?? 0.5} onChange={v => setProp("xalign", v)} min={-2.0} max={2.0} step={0.01} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>↕ {t("animation_track.prop_yalign")}</span>
                <DraggableNumber value={cur.props.yalign ?? 1.0} onChange={v => setProp("yalign", v)} min={-2.0} max={2.0} step={0.01} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>⬌ {t("animation_track.prop_xpos")}</span>
                <DraggableNumber value={cur.props.xpos ?? 0} onChange={v => setProp("xpos", v)} min={-1920} max={1920} step={1} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>⬍ {t("animation_track.prop_ypos")}</span>
                <DraggableNumber value={cur.props.ypos ?? 0} onChange={v => setProp("ypos", v)} min={-1080} max={1080} step={1} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>◿ {t("animation_track.prop_zoom")}</span>
                <DraggableNumber value={cur.props.zoom ?? 1.0} onChange={v => setProp("zoom", v)} min={0} max={10} step={0.05} suffix="x" />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>↻ {t("animation_track.prop_rotate")}</span>
                <DraggableNumber value={cur.props.rotate ?? 0} onChange={v => setProp("rotate", v)} min={-360} max={360} step={1} suffix="°" />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>↔ {t("animation_track.prop_xzoom")}</span>
                <DraggableNumber value={cur.props.xzoom ?? 1.0} onChange={v => setProp("xzoom", v)} min={-10} max={10} step={0.05} suffix="x" />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>↕ {t("animation_track.prop_yzoom")}</span>
                <DraggableNumber value={cur.props.yzoom ?? 1.0} onChange={v => setProp("yzoom", v)} min={-10} max={10} step={0.05} suffix="x" />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>⚓ {t("animation_track.prop_xanchor")}</span>
                <DraggableNumber value={cur.props.xanchor ?? 0.5} onChange={v => setProp("xanchor", v)} min={0} max={1.0} step={0.05} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>⚓ {t("animation_track.prop_yanchor")}</span>
                <DraggableNumber value={cur.props.yanchor ?? 0.5} onChange={v => setProp("yanchor", v)} min={0} max={1.0} step={0.05} />
              </div>
            </div>
          )}

          {activeTab === 'crop' && (
            <div style={gridStyle}>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>◩ {t("animation_track.prop_cropx")}</span>
                <DraggableNumber value={cur.props.cropX ?? 0} onChange={v => setProp("cropX", v)} min={0} max={1920} step={1} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>◩ {t("animation_track.prop_cropy")}</span>
                <DraggableNumber value={cur.props.cropY ?? 0} onChange={v => setProp("cropY", v)} min={0} max={1080} step={1} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>↔ {t("animation_track.prop_cropw")}</span>
                <DraggableNumber value={cur.props.cropW ?? 1920} onChange={v => setProp("cropW", v)} min={0} max={1920} step={1} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>↕ {t("animation_track.prop_croph")}</span>
                <DraggableNumber value={cur.props.cropH ?? 1080} onChange={v => setProp("cropH", v)} min={0} max={1080} step={1} />
              </div>
            </div>
          )}

          {activeTab === 'effects' && (
            <div style={gridStyle}>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>👁 {t("animation_track.prop_alpha")}</span>
                <DraggableNumber value={cur.props.alpha ?? 1.0} onChange={v => setProp("alpha", v)} min={0} max={1.0} step={0.05} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>🌫 {t("animation_track.prop_blur")}</span>
                <DraggableNumber value={cur.props.blur ?? 0} onChange={v => setProp("blur", v)} min={0} max={50} step={1} suffix="px" />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>✨ {t("animation_track.prop_additive")}</span>
                <DraggableNumber value={cur.props.additive ?? 0} onChange={v => setProp("additive", v)} min={0} max={1.0} step={0.05} />
              </div>
            </div>
          )}

          {activeTab === 'color' && (
            <div style={gridStyle}>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>🎨 {t("animation_track.prop_hue")}</span>
                <DraggableNumber value={cur.props.hue ?? 0} onChange={v => setProp("hue", v)} min={-180} max={180} step={1} suffix="°" />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>◑ {t("animation_track.prop_contrast")}</span>
                <DraggableNumber value={cur.props.contrast ?? 1.0} onChange={v => setProp("contrast", v)} min={0} max={2.0} step={0.05} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>🌈 {t("animation_track.prop_saturate")}</span>
                <DraggableNumber value={cur.props.saturate ?? 1.0} onChange={v => setProp("saturate", v)} min={0} max={2.0} step={0.05} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>☀ {t("animation_track.prop_bright")}</span>
                <DraggableNumber value={cur.props.bright ?? 0} onChange={v => setProp("bright", v)} min={-1.0} max={1.0} step={0.05} />
              </div>
              <div className="col gap4">
                <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase" }}>◪ {t("animation_track.prop_invert")}</span>
                <DraggableNumber value={cur.props.invert ?? 0} onChange={v => setProp("invert", v)} min={0} max={1.0} step={0.05} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--faint)", textAlign: "center", fontSize: 13 }}>
          {t("animation_track.no_selection")}
        </div>
      )}
    </div>
  );
}

interface ActionsProps {
  frames: VNKeyframe[];
  selIdx: number;
  onChange: (v: VNKeyframe[]) => void;
  onPlayIde: () => void;
  onTestRenpy: () => void;
  onClose: () => void;
}

export function AnimActionsPanel({ frames, selIdx, onChange, onPlayIde, onTestRenpy, onClose }: ActionsProps) {
  const { t } = useTranslation();
  const cur = frames[selIdx];

  const setEasing = (val: ATLEasing) => {
    if (!frames[selIdx]) return;
    const copy = [...frames];
    copy[selIdx] = { ...copy[selIdx], easing: val };
    onChange(copy);
  };

  const setDur = (val: number) => {
    if (!frames[selIdx]) return;
    const copy = [...frames];
    copy[selIdx] = { ...copy[selIdx], duration: val };
    onChange(copy);
  };

  const removeFrame = (idx: number) => {
    const copy = [...frames];
    copy.splice(idx, 1);
    onChange(copy);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 11, fontWeight: 700, color: "var(--dim)",
        letterSpacing: ".05em", textTransform: "uppercase", background: "rgba(0,0,0,0.4)"
      }}>
        {t("animation_track.settings_title")}
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        {cur ? (
          <>
            <div className="col gap12" style={{ background: "rgba(0,212,200,0.05)", padding: 16, borderRadius: 8, border: "1px solid rgba(0,212,200,0.15)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--teal)" }}>
                {selIdx === 0 ? t("animation_track.start_state") : `${t("animation_track.keyframe")} ${selIdx}`}
              </span>
              
              {selIdx > 0 && (
                <>
                  <div className="col gap4">
                    <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", fontWeight: 700 }}>⏱ {t("animation_track.duration")}</span>
                    <DraggableNumber value={cur.duration ?? 1.0} onChange={setDur} min={0} max={10} step={0.1} suffix="s" />
                  </div>
                  <div className="col gap4">
                    <span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", fontWeight: 700 }}>📈 {t("animation_track.easing")}</span>
                    <select className="input" style={{ fontSize: 12, padding: "6px 10px", width: "100%", background: "var(--bg3)", border: "1px solid var(--bdr)", borderRadius: 6 }} value={cur.easing} onChange={e => setEasing(e.target.value as any)}>
                      <option value="linear">linear</option>
                      <option value="ease">ease</option>
                      <option value="easein">easein</option>
                      <option value="easeout">easeout</option>
                      <option value="none">none</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <button className="btn btn-ghost" style={{ fontSize: 11, padding: "8px", color: "var(--err)", border: "1px solid rgba(255,0,0,0.2)", borderRadius: 6, fontWeight: 600 }} onClick={() => removeFrame(selIdx)}>
              {t("animation_track.remove_frame")}
            </button>
          </>
        ) : (
          <div style={{ color: "var(--faint)", fontSize: 12, textAlign: "center", marginTop: 24 }}>
            {t("animation_track.no_kf_selected")}
          </div>
        )}
      </div>

      {/* Global Actions */}
      <div style={{
        padding: "16px", borderTop: "1px solid rgba(255,255,255,0.05)",
        display: "flex", flexDirection: "column", gap: 10, background: "rgba(0,0,0,0.3)"
      }}>
        <button className="btn" style={{ background: "var(--teal)", color: "#000", fontSize: 12, padding: "10px", fontWeight: 700, borderRadius: 6 }} onClick={onPlayIde}>
          {t("animation_track.play_ide")}
        </button>
        <button className="btn" style={{ background: "var(--acc)", color: "#000", fontSize: 12, padding: "10px", fontWeight: 700, borderRadius: 6 }} onClick={onTestRenpy}>
          {t("animation_track.test_renpy")}
        </button>
        <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 11, padding: "8px", marginTop: 4, color: "var(--dim)" }}>
          {t("animation_track.exit_anim")}
        </button>
      </div>
    </div>
  );
}

interface TimelineProps {
  frames: VNKeyframe[];
  selIdx: number;
  setSelIdx: (idx: number) => void;
  onChange: (v: VNKeyframe[]) => void;
}

export function AnimTimelinePanel({ frames, selIdx, setSelIdx, onChange }: TimelineProps) {
  const { t } = useTranslation();
  
  const addFrame = () => {
    const newFrame: VNKeyframe = {
      id: "kf_" + Date.now(),
      duration: 1.0,
      easing: "linear",
      props: frames.length > 0 ? { ...frames[frames.length - 1].props } : { xalign: 0.5, yalign: 1.0, zoom: 1.0, alpha: 1.0, rotate: 0 }
    };
    onChange([...frames, newFrame]);
    setSelIdx(frames.length);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg1)" }}>
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--bdr)", fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: ".1em", textTransform: "uppercase", background: "rgba(0,0,0,0.2)" }}>
        {t("animation_track.timeline_title")}
      </div>
      <div className="hide-scrollbar" style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 24px", gap: 0, overflowX: "auto", position: "relative" }}>
        {/* Continuous Track Line Behind Keyframes */}
        {frames.length > 0 && (
          <div style={{ position: "absolute", top: "50%", left: 24, right: 24, height: 2, background: "rgba(255,255,255,0.1)", zIndex: 0, pointerEvents: "none" }} />
        )}
        
        {frames.length === 0 ? (
          <div style={{ textAlign: "center", width: "100%", zIndex: 1 }}>
            <span style={{ fontSize: 13, color: "var(--dim)", marginRight: 16 }}>{t("animation_track.no_keyframes")}</span>
            <button className="btn btn-teal" onClick={addFrame} style={{ padding: "8px 16px", fontWeight: 700, borderRadius: 20 }}>
              {t("animation_track.add_start")}
            </button>
          </div>
        ) : (
          <>
            {frames.map((f, i) => {
              const isSel = i === selIdx;
              return (
                <React.Fragment key={f.id}>
                  {i > 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 80, zIndex: 1, position: "relative" }}>
                      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: isSel ? "var(--teal)" : "var(--bdr)", opacity: isSel ? 0.5 : 1, transform: "translateY(-50%)" }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: isSel ? "var(--teal)" : "var(--dim)", background: "var(--bg1)", padding: "0 6px", borderRadius: 10, border: `1px solid ${isSel ? "var(--teal)" : "var(--bdr)"}`, zIndex: 2 }}>
                        {f.duration}s
                      </span>
                    </div>
                  )}
                  <button
                    style={{ 
                      zIndex: 2,
                      cursor: "pointer",
                      padding: "10px 16px", minWidth: 110,
                      border: "none", outline: isSel ? "2px solid var(--teal)" : "1px solid var(--bdr)",
                      outlineOffset: -1,
                      background: isSel ? "linear-gradient(to bottom, rgba(0,212,200,0.15), rgba(0,212,200,0.05))" : "linear-gradient(to bottom, var(--bg2), var(--bg1))",
                      borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      boxShadow: isSel ? "0 0 16px rgba(0,212,200,0.2)" : "0 4px 6px rgba(0,0,0,0.2)",
                      transition: "all 0.2s"
                    }}
                    onClick={() => setSelIdx(i)}
                  >
                    <span style={{ color: isSel ? "var(--teal)" : "var(--text)", fontSize: 16, lineHeight: 1 }}>⯁</span>
                    <span style={{ fontWeight: 700, fontSize: 12, color: isSel ? "#fff" : "var(--text)" }}>
                      {i === 0 ? t("animation_track.start_state") : `${t("animation_track.frame")} ${i}`}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--dim)" }}>
                      {i === 0 ? t("animation_track.initial_pos") : f.easing}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, zIndex: 1, position: "relative" }}>
              <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "var(--bdr)", transform: "translateY(-50%)" }} />
            </div>
            <button className="btn btn-ghost" onClick={addFrame} style={{ zIndex: 2, border: "1px dashed var(--dim)", height: 50, borderRadius: 8, padding: "0 16px", color: "var(--dim)", transition: "all 0.2s" }}>
              {t("animation_track.add_kf")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
