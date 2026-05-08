/**
 * AchievementManager.tsx
 * Premium redesign: trophy card grid sidebar with glow/unlock-status borders,
 * rich detail editor with icon preview, animated hidden toggle, and points field.
 */
import React, { useState } from "react";
import { VNProject, VNAchievement, uid } from "./types";
import { AssetPicker } from "./Inspector";
import { useTranslation } from "./translationContext";

interface Props {
  project: VNProject;
  onProjectChange: (p: VNProject) => void;
  rootPath: string;
}

const ENDING_COLORS: Record<string, string> = {
  visible: "var(--teal)",
  hidden:  "var(--warn)",
};

function AchievementCard({
  achievement,
  isSelected,
  onClick,
}: {
  achievement: VNAchievement;
  isSelected: boolean;
  onClick: () => void;
}) {
  const borderColor = isSelected ? "var(--acc2)" : achievement.hidden ? "color-mix(in srgb, var(--warn) 30%, var(--bdr))" : "var(--bdr)";
  const bgColor = isSelected
    ? "color-mix(in srgb, var(--acc2) 8%, var(--bg2))"
    : "var(--bg2)";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px",
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${isSelected ? "var(--acc2)" : achievement.hidden ? "var(--warn)" : "var(--bdr)"}`,
        borderRadius: 8, cursor: "pointer",
        transition: "all 0.15s",
        boxShadow: isSelected ? `0 0 12px color-mix(in srgb, var(--acc2) 15%, transparent)` : "none",
      }}
      onMouseEnter={e => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--acc2)";
          (e.currentTarget as HTMLDivElement).style.background = "color-mix(in srgb, var(--acc2) 4%, var(--bg2))";
        }
      }}
      onMouseLeave={e => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.borderColor = borderColor;
          (e.currentTarget as HTMLDivElement).style.background = bgColor;
        }
      }}
    >
      {/* Icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: isSelected
          ? "color-mix(in srgb, var(--acc2) 15%, var(--bg3))"
          : "var(--bg3)",
        border: `1px solid ${isSelected ? "color-mix(in srgb, var(--acc2) 30%, transparent)" : "var(--bdr)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: achievement.icon ? 10 : 20,
        transition: "all 0.15s",
        boxShadow: isSelected ? `0 0 8px color-mix(in srgb, var(--acc2) 20%, transparent)` : "none",
      }}>
        {achievement.icon ? (
          <img
            src={achievement.icon}
            alt="icon"
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : "🏆"}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: isSelected ? "var(--acc2)" : "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          transition: "color 0.15s",
        }}>
          {achievement.name}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
            background: achievement.hidden
              ? "color-mix(in srgb, var(--warn) 15%, transparent)"
              : "color-mix(in srgb, var(--ok) 12%, transparent)",
            color: achievement.hidden ? "var(--warn)" : "var(--ok)",
            border: `1px solid ${achievement.hidden ? "color-mix(in srgb, var(--warn) 30%, transparent)" : "color-mix(in srgb, var(--ok) 25%, transparent)"}`,
            letterSpacing: "0.06em",
          }}>
            {achievement.hidden ? "🔒 HIDDEN" : "🔓 VISIBLE"}
          </span>
          {(achievement as any).points && (
            <span style={{ fontSize: 10, color: "var(--warn)", fontWeight: 600 }}>
              ★ {(achievement as any).points}pts
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AchievementManager({ project, onProjectChange, rootPath }: Props) {
  const achievements = project.achievements ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(achievements[0]?.id ?? null);
  const { t } = useTranslation();

  const addAchievement = () => {
    const newAch: VNAchievement = {
      id: uid(),
      name: "New Achievement",
      description: "Unlocks when the player...",
      hidden: false,
    };
    onProjectChange({ ...project, achievements: [...achievements, newAch] });
    setSelectedId(newAch.id);
  };

  const deleteAchievement = (id: string) => {
    onProjectChange({ ...project, achievements: achievements.filter(a => a.id !== id) });
    if (selectedId === id) setSelectedId(achievements.find(a => a.id !== id)?.id ?? null);
  };

  const updateAchievement = (id: string, updates: Partial<VNAchievement>) => {
    onProjectChange({
      ...project,
      achievements: achievements.map(a => a.id === id ? { ...a, ...updates } : a),
    });
  };

  const activeAch = achievements.find(a => a.id === selectedId);

  // Summary
  const hiddenCount = achievements.filter(a => a.hidden).length;
  const visibleCount = achievements.length - hiddenCount;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg0)" }}>

      {/* ── Left Sidebar ── */}
      <div style={{
        width: 300, flexShrink: 0,
        borderRight: "1px solid var(--bdr)",
        background: "var(--bg1)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Sidebar header */}
        <div style={{
          padding: "14px 16px", borderBottom: "1px solid var(--bdr)",
          background: "var(--bg2)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--dim)", textTransform: "uppercase" }}>
              {t('achievements.title')}
            </span>
            <button
              onClick={addAchievement}
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: "color-mix(in srgb, var(--acc2) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--acc2) 30%, transparent)",
                color: "var(--acc2)", cursor: "pointer", fontSize: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
              title="Add achievement"
            >+</button>
          </div>

          {/* Summary pills */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{
              flex: 1, padding: "6px 10px", borderRadius: 8, textAlign: "center",
              background: "color-mix(in srgb, var(--ok) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--ok) 20%, transparent)",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ok)" }}>{visibleCount}</div>
              <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.06em" }}>VISIBLE</div>
            </div>
            <div style={{
              flex: 1, padding: "6px 10px", borderRadius: 8, textAlign: "center",
              background: "color-mix(in srgb, var(--warn) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--warn) 20%, transparent)",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--warn)" }}>{hiddenCount}</div>
              <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.06em" }}>HIDDEN</div>
            </div>
            <div style={{
              flex: 1, padding: "6px 10px", borderRadius: 8, textAlign: "center",
              background: "color-mix(in srgb, var(--acc2) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--acc2) 20%, transparent)",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--acc2)" }}>{achievements.length}</div>
              <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.06em" }}>TOTAL</div>
            </div>
          </div>
        </div>

        {/* Achievement list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexDirection: "column", gap: 6 }}>
          {achievements.map(a => (
            <AchievementCard
              key={a.id}
              achievement={a}
              isSelected={selectedId === a.id}
              onClick={() => setSelectedId(a.id)}
            />
          ))}
          {achievements.length === 0 && (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: 32, textAlign: "center", gap: 12,
            }}>
              <div style={{ fontSize: 36 }}>🏆</div>
              <div style={{ fontSize: 13, color: "var(--dim)", fontWeight: 600 }}>{t('achievements.no_achievements')}</div>
              <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.5 }}>
                Click <strong>+</strong> to add your first achievement
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Editor ── */}
      <div style={{ flex: 1, overflowY: "auto", background: "var(--bg0)" }}>
        {activeAch ? (
          <div style={{ maxWidth: 600, margin: "0 auto", padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {/* Large icon preview */}
              <div style={{
                width: 72, height: 72, borderRadius: 16, flexShrink: 0,
                background: "color-mix(in srgb, var(--acc2) 10%, var(--bg2))",
                border: "2px solid color-mix(in srgb, var(--acc2) 25%, var(--bdr))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36,
                boxShadow: "0 0 20px color-mix(in srgb, var(--acc2) 10%, transparent)",
              }}>
                {activeAch.icon ? (
                  <img src={activeAch.icon} alt="icon" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 13 }} />
                ) : "🏆"}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  className="input"
                  style={{ fontSize: 22, fontWeight: 700, padding: "8px 14px", letterSpacing: "-0.01em" }}
                  value={activeAch.name}
                  onChange={e => updateAchievement(activeAch.id, { name: e.target.value })}
                  placeholder={t('achievements.name')}
                />
                <div style={{ fontSize: 10, color: "var(--faint)", fontFamily: "var(--mono)", marginTop: 6, paddingLeft: 2 }}>
                  ID: ach_{activeAch.id.substring(0, 8)}
                </div>
              </div>

              <button
                onClick={() => deleteAchievement(activeAch.id)}
                style={{
                  height: 34, padding: "0 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "color-mix(in srgb, var(--err) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--err) 25%, transparent)",
                  color: "var(--err)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.15s", flexShrink: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--err) 15%, transparent)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--err) 8%, transparent)"; }}
              >
                🗑️ {t('achievements.delete')}
              </button>
            </div>

            {/* Description */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {t('achievements.description')}
              </div>
              <textarea
                className="input"
                rows={3}
                style={{ resize: "vertical", fontSize: 14, lineHeight: 1.6 }}
                value={activeAch.description}
                onChange={e => updateAchievement(activeAch.id, { description: e.target.value })}
                placeholder={t('achievements.description_ph')}
              />
            </div>

            {/* Settings */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Settings
              </div>

              {/* Hidden toggle */}
              <label style={{
                display: "flex", alignItems: "center", gap: 14,
                background: activeAch.hidden
                  ? "color-mix(in srgb, var(--warn) 6%, var(--bg1))"
                  : "var(--bg1)",
                padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${activeAch.hidden ? "color-mix(in srgb, var(--warn) 25%, transparent)" : "var(--bdr)"}`,
                transition: "all 0.2s",
              }}>
                {/* Custom toggle */}
                <div style={{
                  width: 38, height: 22, borderRadius: 11, flexShrink: 0, position: "relative",
                  background: activeAch.hidden ? "var(--warn)" : "var(--bg3)",
                  border: `1px solid ${activeAch.hidden ? "color-mix(in srgb, var(--warn) 70%, transparent)" : "var(--bdr)"}`,
                  transition: "all 0.2s",
                  cursor: "pointer",
                }} onClick={() => updateAchievement(activeAch.id, { hidden: !activeAch.hidden })}>
                  <div style={{
                    position: "absolute", top: 2, left: activeAch.hidden ? 17 : 2,
                    width: 16, height: 16, borderRadius: "50%",
                    background: activeAch.hidden ? "#000" : "var(--dim)",
                    transition: "left 0.2s",
                  }} />
                </div>
                <input type="checkbox" checked={activeAch.hidden} readOnly style={{ display: "none" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{t('achievements.hidden')}</div>
                  <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
                    {t('achievements.hidden_hint')}
                  </div>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                  background: activeAch.hidden ? "color-mix(in srgb, var(--warn) 15%, transparent)" : "color-mix(in srgb, var(--ok) 12%, transparent)",
                  color: activeAch.hidden ? "var(--warn)" : "var(--ok)",
                  border: `1px solid ${activeAch.hidden ? "color-mix(in srgb, var(--warn) 30%, transparent)" : "color-mix(in srgb, var(--ok) 25%, transparent)"}`,
                  letterSpacing: "0.08em", flexShrink: 0,
                }}>
                  {activeAch.hidden ? "HIDDEN" : "VISIBLE"}
                </span>
              </label>
            </div>

            {/* Icon picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Icon (Optional)
              </div>
              <div style={{
                background: "var(--bg1)", padding: 16, borderRadius: 10,
                border: "1px solid var(--bdr)",
              }}>
                <AssetPicker
                  rootPath={rootPath}
                  assetType="images"
                  value={activeAch.icon ?? ""}
                  onChange={v => updateAchievement(activeAch.id, { icon: v })}
                />
              </div>
              {activeAch.icon && (
                <button
                  onClick={() => updateAchievement(activeAch.id, { icon: undefined })}
                  style={{
                    alignSelf: "flex-start", padding: "4px 12px", borderRadius: 6, fontSize: 11,
                    background: "transparent", border: "1px solid var(--bdr)",
                    color: "var(--err)", cursor: "pointer",
                  }}
                >✕ Remove icon</button>
              )}
            </div>

          </div>
        ) : (
          <div style={{
            height: "100%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            color: "var(--faint)", gap: 14,
          }}>
            <div style={{ fontSize: 48 }}>🏆</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--dim)" }}>
              {achievements.length === 0 ? t('achievements.no_achievements') : t('achievements.select_hint')}
            </div>
            {achievements.length === 0 && (
              <button
                onClick={addAchievement}
                style={{
                  marginTop: 8, padding: "10px 20px", borderRadius: 10,
                  background: "color-mix(in srgb, var(--acc2) 12%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--acc2) 30%, transparent)",
                  color: "var(--acc2)", cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >{t('achievements.new')}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
