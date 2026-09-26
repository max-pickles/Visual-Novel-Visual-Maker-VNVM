/**
 * SidebarAssetBrowser.tsx — The scene editor's left-hand image, audio and video list.
 */
import { useState, useEffect, useMemo } from "react";
import type { VNProject } from "./types";
import type { AssetKind } from "./eventAssets";
import { listAssetFiles } from "./tauriApi";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "./translationContext";

export function SidebarAssetBrowser({ project, mode, onPick }: {
  project: VNProject,
  mode: AssetKind | "effects",
  /** Called with a picked file's path, relative to the project folder, and the kind of file it was listed as. */
  onPick: (path: string, kind: AssetKind) => void,
}) {
  const [listing, setListing] = useState<{ kind: AssetKind, files: string[] } | null>(null);
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    if (!project._rootPath || mode === "effects") return;
    // A listing that arrives after the mode changed again is dropped.
    let current = true;
    listAssetFiles(project._rootPath, mode)
      .then(files => { if (current) setListing({ kind: mode, files }); })
      .catch(() => { if (current) setListing({ kind: mode, files: [] }); });
    return () => { current = false; };
  }, [project._rootPath, mode]);

  // Only the listing for the current mode is shown, so every file is picked as the kind it is.
  const shown = listing?.kind === mode ? listing : null;
  const loading = !shown && mode !== "effects" && !!project._rootPath;
  const filtered = useMemo(
    () => (shown?.files ?? []).filter(f => f.toLowerCase().includes(search.toLowerCase())),
    [shown, search],
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid color-mix(in srgb, var(--text) 10%, transparent)" }}>
        <input 
          className="input" 
          placeholder={t('editor.scene.search_placeholder').replace('{mode}', mode)}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", padding: "4px 8px", fontSize: 11, background: "color-mix(in srgb, var(--bg0) 20%, transparent)", border: "1px solid var(--bdr)" }}
        />
      </div>
      <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {shown?.kind === "images" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {filtered.map(f => {
              const url = convertFileSrc(`${project._rootPath}/${f}`);
              const name = f.split('/').pop() || f;
              return (
                <div key={f}
                  onClick={() => onPick(f, "images")}
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
        {shown && shown.kind !== "images" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map(f => {
              const name = f.split('/').pop();
              return (
                <div key={f}
                  onClick={() => onPick(f, shown.kind)}
                  title={name}
                  style={{
                    padding: "6px 8px", background: "var(--bg2)", borderRadius: 4, cursor: "pointer",
                    border: "1px solid var(--bdr)", fontSize: 11, color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--teal)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
                >
                  {shown.kind === "audio" ? "🎵" : "🎬"} {name}
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
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 11 }}>{t('editor.scene.no_results')}</div>
        )}
      </div>
    </div>
  );
}
