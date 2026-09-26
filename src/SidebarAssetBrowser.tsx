/**
 * SidebarAssetBrowser.tsx — The scene editor's left-hand image and audio list.
 */
import { useState, useEffect, useMemo } from "react";
import type { VNProject } from "./types";
import { listAssetFiles } from "./tauriApi";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "./translationContext";

export function SidebarAssetBrowser({ project, mode, onPick }: { project: VNProject, mode: "images" | "audio" | "effects", onPick: (path: string) => void }) {
  const [files, setFiles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  
  useEffect(() => {
    if (!project._rootPath) return;
    const typeMap = { images: "images", audio: "audio", effects: "images" } as const;
    if (mode === "effects") {
      setFiles([]); return;
    }
    listAssetFiles(project._rootPath, typeMap[mode]).then(setFiles).catch(() => setFiles([]));
  }, [project._rootPath, mode]);

  const filtered = useMemo(() => files.filter(f => f.toLowerCase().includes(search.toLowerCase())), [files, search]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <input 
          className="input" 
          placeholder={t('editor.scene.search_placeholder').replace('{mode}', mode)}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", padding: "4px 8px", fontSize: 11, background: "rgba(0,0,0,0.2)", border: "1px solid var(--bdr)" }}
        />
      </div>
      <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {mode === "images" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {filtered.map(f => {
              const url = convertFileSrc(`${project._rootPath}/${f}`);
              const name = f.split('/').pop() || f;
              return (
                <div key={f} 
                  onClick={() => onPick(f)}
                  title={name}
                  style={{ 
                    aspectRatio: "1", background: "var(--bg2)", borderRadius: 4, overflow: "hidden", 
                    cursor: "pointer", border: "1px solid var(--bdr)", transition: "border 0.1s" 
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--teal)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
                >
                  <img src={url} alt={name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              );
            })}
          </div>
        )}
        {mode === "audio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map(f => {
              const name = f.split('/').pop();
              return (
                <div key={f}
                  onClick={() => onPick(f)}
                  title={name}
                  style={{
                    padding: "6px 8px", background: "var(--bg2)", borderRadius: 4, cursor: "pointer",
                    border: "1px solid var(--bdr)", fontSize: 11, color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--teal)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
                >
                  🎵 {name}
                </div>
              );
            })}
          </div>
        )}
        {mode === "effects" && (
          <div style={{ padding: 12, color: "var(--dim)", fontSize: 11, textAlign: "center" }}>
            (Effects preset list coming soon)
          </div>
        )}
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 11 }}>{t('editor.scene.no_results')}</div>
        )}
      </div>
    </div>
  );
}
