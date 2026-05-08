/**
 * BotAnalyzerPanel.tsx
 * Premium redesign of the path analysis bot UI.
 * Parses the structured ### sections from runBotAnalysis()
 * and renders each as a distinct glass card with icons and copy support.
 */
import React, { useState, useCallback, useRef } from "react";
import type { VNProject } from "./types";
import { runBotAnalysis } from "./botAnalyzer";
import { useTranslation } from "./translationContext";

interface Props {
  project: VNProject;
}

interface Section {
  title: string;
  icon: string;
  color: string;
  lines: string[];
}

/** Parse the flat string output into structured sections */
function parseReport(raw: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  const SECTION_MAP: Record<string, { icon: string; color: string }> = {
    "Endings Detected":   { icon: "🏁", color: "var(--acc2)" },
    "Choice Path Analysis": { icon: "🔀", color: "var(--teal)" },
    "Variables / Keys Detected": { icon: "🔑", color: "var(--warn)" },
  };

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("###")) {
      if (current) sections.push(current);
      const headerText = line.replace(/^###\s*/, "").replace(/^[🎯🔀🔑]\s*/, "");
      const key = Object.keys(SECTION_MAP).find(k => headerText.includes(k)) ?? headerText;
      const meta = SECTION_MAP[key] ?? { icon: "📋", color: "var(--dim)" };
      current = { title: headerText, icon: meta.icon, color: meta.color, lines: [] };
    } else if (current && line && !line.startsWith("====") && !line.startsWith("🤖") && !line.startsWith("Project:") && !line.startsWith("Bot analysis complete")) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function lineColor(line: string): string {
  if (line.includes("True ending")) return "var(--acc2)";
  if (line.includes("Good ending")) return "var(--ok)";
  if (line.includes("Bad ending") || line.includes("Dead End") || line.includes("dead end")) return "var(--err)";
  if (line.includes("infinite loop")) return "#f97316";
  if (line.includes("set and checked")) return "var(--teal)";
  if (line.includes("never checked")) return "var(--warn)";
  if (line.includes("couldn't find")) return "var(--err)";
  return "var(--text)";
}

function lineIcon(line: string): string {
  if (line.startsWith("* ") || line.startsWith("Scene")) return "🎬";
  if (line.includes("True ending")) return "⭐";
  if (line.includes("Good ending")) return "✅";
  if (line.includes("Bad ending") || line.includes("Dead End") || line.includes("dead end")) return "💀";
  if (line.includes("infinite loop")) return "♾️";
  if (line.includes("set and checked")) return "🔗";
  if (line.includes("never checked")) return "⚠️";
  if (line.includes("couldn't find")) return "❓";
  return "→";
}

export default function BotAnalyzerPanel({ project }: Props) {
  const [sections, setSections] = useState<Section[]>([]);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [rawLog, setRawLog] = useState("");
  const [copyLabel, setCopyLabel] = useState("");
  const [copyTimer, setCopyTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleRun = () => {
    setRunning(true);
    // Small delay for the spinner animation to be visible
    setTimeout(() => {
      const output = runBotAnalysis(project);
      setRawLog(output);
      setSections(parseReport(output));
      setHasRun(true);
      setRunning(false);
    }, 300);
  };

  const handleCopy = useCallback(() => {
    if (!rawLog) return;
    navigator.clipboard.writeText(rawLog).then(() => {
      setCopyLabel(t('bot.copied'));
      if (copyTimer) clearTimeout(copyTimer);
      setCopyTimer(setTimeout(() => setCopyLabel(''), 1800));
    });
  }, [rawLog, copyTimer, t]);

  const handleClear = () => {
    setSections([]);
    setRawLog("");
    setHasRun(false);
  };

  // Summary stats
  const endingSection = sections.find(s => s.title.includes("Endings"));
  const endingCount = endingSection
    ? endingSection.title.match(/\((\d+)\)/)?.[1] ?? "0"
    : "—";
  const choiceSection = sections.find(s => s.title.includes("Choice"));
  const choiceCount = choiceSection?.lines.filter(l => l.startsWith("* ")).length ?? 0;
  const varSection = sections.find(s => s.title.includes("Variables"));
  const varCount = varSection?.lines.length ?? 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      overflow: "hidden", background: "var(--bg0)",
    }}>
      {/* ── Header ── */}
      <div 
        onWheel={e => {
          if (scrollRef.current) scrollRef.current.scrollTop += e.deltaY;
        }}
        style={{
        padding: "20px 24px 16px", borderBottom: "1px solid var(--bdr)",
        background: "var(--bg1)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          {/* Bot avatar */}
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: "color-mix(in srgb, var(--acc2) 15%, var(--bg2))",
            border: "1px solid color-mix(in srgb, var(--acc2) 30%, transparent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, boxShadow: "0 0 20px color-mix(in srgb, var(--acc2) 15%, transparent)",
          }}>🤖</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
              {t('bot.path_analysis')}
            </div>
            <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.5 }}>
              {t('bot.simulates')} <strong style={{ color: "var(--text)" }}>{project.title}</strong>.
              {t('bot.traces')}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "flex-start" }}>
            {hasRun && (
              <>
                <button
                  onClick={handleCopy}
                  style={{
                    height: 34, padding: "0 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: copyLabel ? "color-mix(in srgb, var(--ok) 12%, transparent)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${copyLabel ? "var(--ok)" : "var(--bdr)"}`,
                    color: copyLabel ? "var(--ok)" : "var(--dim)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >{copyLabel || t('bot.copy_report')}</button>
                <button
                  onClick={handleClear}
                  style={{
                    height: 34, padding: "0 12px", borderRadius: 8, fontSize: 12,
                    background: "transparent", border: "1px solid var(--bdr)",
                    color: "var(--dim)", cursor: "pointer", transition: "all 0.15s",
                  }}
                >{t('bot.clear')}</button>
              </>
            )}
            <button
              onClick={handleRun}
              disabled={running}
              style={{
                height: 34, padding: "0 18px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 8,
                background: running
                  ? "color-mix(in srgb, var(--acc) 60%, transparent)"
                  : "var(--acc)",
                border: "1px solid color-mix(in srgb, var(--acc) 70%, transparent)",
                color: "#fff",
                cursor: running ? "default" : "pointer",
                boxShadow: running ? "none" : "0 0 16px color-mix(in srgb, var(--acc) 30%, transparent)",
                transition: "all 0.2s",
              }}
            >
              {running ? (
                <>
                  <span style={{ animation: "spin 0.6s linear infinite", display: "inline-block" }}>⟳</span>
                  {t('bot.analyzing')}
                </>
              ) : (
                <>▶ {t('bot.run_btn')}</>
              )}
            </button>
          </div>
        </div>

        {/* Summary stat pills (only after run) */}
        {hasRun && (
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {[
              { label: t('bot.endings_found'), value: endingCount, color: "var(--acc2)" },
              { label: t('bot.choices_traced'), value: String(choiceCount), color: "var(--teal)" },
              { label: t('bot.variables'), value: String(varCount), color: "var(--warn)" },
            ].map(stat => (
              <div key={stat.label} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 14px", borderRadius: 20,
                background: `color-mix(in srgb, ${stat.color} 8%, transparent)`,
                border: `1px solid color-mix(in srgb, ${stat.color} 25%, transparent)`,
              }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>
                  {stat.value}
                </span>
                <span style={{ fontSize: 11, color: "var(--dim)", fontWeight: 500 }}>
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Empty / welcome state */}
        {!hasRun && !running && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 16, padding: "40px 20px", textAlign: "center",
          }}>
            <div style={{ fontSize: 56 }}>🤖</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              {t('bot.ready')}
            </div>
            <div style={{ fontSize: 13, color: "var(--dim)", maxWidth: 380, lineHeight: 1.6 }}>
              {t('bot.ready_desc_start')} <strong>{t('bot.run_btn')}</strong> {t('bot.ready_desc_end')}
              <strong style={{ color: "var(--acc2)" }}>{project.scenes.length}</strong> {t('bot.scenes')}.
            </div>
          </div>
        )}

        {/* Running spinner */}
        {running && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 12,
          }}>
            <div style={{ fontSize: 36, animation: "spin 0.8s linear infinite" }}>⟳</div>
            <div style={{ fontSize: 13, color: "var(--dim)" }}>{t('bot.tracing')}</div>
          </div>
        )}

        {/* Structured section cards */}
        {!running && sections.map((section, si) => (
          <div key={si} style={{
            background: "var(--bg1)", border: "1px solid var(--bdr)",
            borderLeft: `3px solid ${section.color}`,
            borderRadius: 10, overflow: "hidden",
            animation: "vnv-fade-slide-in 0.2s ease both",
            animationDelay: `${si * 0.06}s`,
          }}>
            {/* Section header */}
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid var(--bdr)",
              background: `color-mix(in srgb, ${section.color} 6%, var(--bg2))`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>{section.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {section.title}
              </span>
              <span style={{
                marginLeft: "auto", fontSize: 10, fontWeight: 700,
                padding: "2px 8px", borderRadius: 10,
                background: `color-mix(in srgb, ${section.color} 15%, transparent)`,
                color: section.color,
              }}>
                {section.lines.length} {section.lines.length !== 1 ? t('bot.items') : t('bot.item')}
              </span>
            </div>

            {/* Lines */}
            <div style={{ padding: "8px 0" }}>
              {section.lines.map((line, li) => {
                const isHeader = line.startsWith("* ");
                const cleanLine = line.replace(/^\*\s*/, "").replace(/^-\s*/, "");
                return (
                  <div key={li} style={{
                    padding: isHeader ? "10px 16px 6px" : "5px 16px 5px 32px",
                    color: lineColor(line),
                    fontSize: isHeader ? 13 : 12,
                    fontWeight: isHeader ? 600 : 400,
                    lineHeight: 1.6,
                    borderTop: isHeader && li > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    display: "flex", alignItems: "flex-start", gap: 8,
                  }}>
                    {!isHeader && (
                      <span style={{ fontSize: 11, flexShrink: 0, opacity: 0.7, marginTop: 1 }}>
                        {lineIcon(line)}
                      </span>
                    )}
                    <span style={{ fontFamily: isHeader ? "var(--font)" : "var(--mono)", flex: 1 }}>
                      {cleanLine}
                    </span>
                  </div>
                );
              })}
              {section.lines.length === 0 && (
                <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--faint)", fontStyle: "italic" }}>
                  {t('bot.nothing')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
