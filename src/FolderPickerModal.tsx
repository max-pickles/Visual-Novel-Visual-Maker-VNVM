/**
 * FolderPickerModal — custom in-app folder browser.
 * Replaces the native OS file dialog so position/style are fully controlled.
 */
import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_vnv_project: boolean;
}

interface QuickLink {
  label: string;
  icon: string;
  path: string;
}

interface Props {
  /** Starting directory; defaults to C:/ */
  initialPath?: string;
  /** Modal title */
  title?: string;
  /** Called with the chosen path when the user clicks "Select" */
  onSelect: (path: string) => void;
  /** Called when the user cancels */
  onCancel: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normalizePath(p: string) {
  return p.replace(/\\/g, "/").replace(/\/\//g, "/");
}

function parentOf(p: string): string {
  const n = normalizePath(p).replace(/\/$/, "");
  const idx = n.lastIndexOf("/");
  if (idx <= 0) return n; // already root
  const parent = n.slice(0, idx);
  // Windows drive root: "C:" → "C:/"
  return /^[A-Za-z]:$/.test(parent) ? parent + "/" : parent;
}

function breadcrumbsOf(p: string): { label: string; path: string }[] {
  const n = normalizePath(p).replace(/\/$/, "");
  const parts = n.split("/").filter(Boolean);
  return parts.map((part, i) => {
    const rawPath = parts.slice(0, i + 1).join("/");
    const path = /^[A-Za-z]:$/.test(rawPath) ? rawPath + "/" : rawPath;
    return { label: part, path };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const QUICK_ICONS: Record<string, string> = {
  Home: "🏠",
  Desktop: "🖥",
  OneDrive: "☁️",
  Documents: "📄",
  Downloads: "⬇",
  "VNV Projects": "🎮",
};

export function FolderPickerModal({
  initialPath,
  title = "Select Project Folder",
  onSelect,
  onCancel,
}: Props) {
  const [currentPath, setCurrentPath] = useState(normalizePath(initialPath || "C:/"));
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [drives, setDrives] = useState<string[]>([]);
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const pathRef = useRef<HTMLDivElement>(null);

  // Load drives + quick access once
  useEffect(() => {
    (async () => {
      try {
        const driveList = await invoke<string[]>("get_drives");
        setDrives(driveList);
        const qa = await invoke<Record<string, string>>("get_quick_access_paths");
        const links: QuickLink[] = Object.entries(qa)
          .sort(([a], [b]) => {
            const order = ["Home", "Desktop", "OneDrive", "Documents", "Downloads", "VNV Projects"];
            const ai = order.indexOf(a); const bi = order.indexOf(b);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          })
          .map(([label, path]) => ({ label, icon: QUICK_ICONS[label] ?? "📁", path: normalizePath(path) }));
        setQuickLinks(links);
      } catch (e) {
        console.error("FolderPicker init error:", e);
      }
    })();
  }, []);

  // Load directory entries whenever currentPath changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<DirEntry[]>("list_dir_entries", { path: currentPath })
      .then((res) => { if (!cancelled) setEntries(res); })
      .catch((e) => { if (!cancelled) { setError(String(e)); setEntries([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentPath]);

  const navigate = (p: string) => { setCurrentPath(normalizePath(p)); setSelected(null); };
  const goUp = () => navigate(parentOf(currentPath));
  const crumbs = breadcrumbsOf(currentPath);

  // The path shown in the footer — the selected subfolder if any, else current dir
  const footerPath = selected ?? currentPath;

  // Drag-scroll the path bar
  const onPathDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    let startX = e.pageX;
    let scrollLeft = el.scrollLeft;
    const onMove = (ev: MouseEvent) => { el.scrollLeft = scrollLeft - (ev.pageX - startX); };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      el.style.cursor = "grab";
    };
    el.style.cursor = "grabbing";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ── styles ──────────────────────────────────────────────────────────────────

  const sidebarItem = (active: boolean, h: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 9,
    padding: "7px 14px", borderRadius: 6, cursor: "pointer",
    fontSize: 12, fontWeight: active ? 700 : 500,
    color: active ? "var(--teal)" : h ? "#c8d8e8" : "var(--dim)",
    background: active ? "rgba(0,212,200,0.08)" : h ? "rgba(255,255,255,0.04)" : "transparent",
    transition: "all 0.1s",
    userSelect: "none",
  });

  const entryRow = (h: boolean, sel: boolean, isDir: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: 7, cursor: isDir ? "pointer" : "default",
    background: sel ? "rgba(0,212,200,0.12)" : h && isDir ? "rgba(255,255,255,0.05)" : "transparent",
    border: sel ? "1px solid rgba(0,212,200,0.25)" : "1px solid transparent",
    transition: "background 0.1s",
  });

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.82)", backdropFilter: "blur(10px)",
      zIndex: 600,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg1)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 14, width: 720, height: 520,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 40px 120px rgba(0,0,0,0.95), 0 0 0 1px rgba(0,212,200,0.06)",
      }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid var(--bdr)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#f1f5f9", letterSpacing: ".02em" }}>{title}</div>
          <button
            onClick={onCancel}
            style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 6px", borderRadius: 5 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f1f5f9"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--dim)"; }}
          >✕</button>
        </div>

        {/* ── Navigation bar ───────────────────────────────────────────────── */}
        <div style={{
          padding: "8px 14px", borderBottom: "1px solid var(--bdr)",
          display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.15)",
        }}>
          {/* Up button */}
          <button
            onClick={goUp}
            title="Go up one level"
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6, color: "var(--dim)", cursor: "pointer",
              padding: "4px 10px", fontSize: 14, lineHeight: 1, flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f1f5f9"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--dim)"; }}
          >↑</button>

          {/* Breadcrumb */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", flexWrap: "nowrap",
            overflowX: "auto", gap: 2, scrollbarWidth: "none",
          }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={c.path}>
                {i > 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, flexShrink: 0 }}>/</span>}
                <button
                  onClick={() => navigate(c.path)}
                  style={{
                    background: i === crumbs.length - 1 ? "rgba(0,212,200,0.08)" : "none",
                    border: "none", borderRadius: 4,
                    color: i === crumbs.length - 1 ? "var(--teal)" : "var(--dim)",
                    cursor: "pointer", fontSize: 12, fontWeight: i === crumbs.length - 1 ? 700 : 400,
                    padding: "3px 7px", whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >{c.label}</button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Sidebar */}
          <div style={{
            width: 168, borderRight: "1px solid var(--bdr)",
            overflowY: "auto", padding: "10px 6px",
            display: "flex", flexDirection: "column", gap: 2, flexShrink: 0,
          }}>
            {/* Quick Access */}
            {quickLinks.length > 0 && (
              <>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "rgba(255,255,255,0.2)", padding: "4px 10px 2px", textTransform: "uppercase" }}>Quick Access</div>
                {quickLinks.map(q => (
                  <div
                    key={q.path}
                    style={sidebarItem(normalizePath(currentPath) === q.path, hovered === q.path)}
                    onClick={() => navigate(q.path)}
                    onMouseEnter={() => setHovered(q.path)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <span style={{ fontSize: 14 }}>{q.icon}</span>
                    <span>{q.label}</span>
                  </div>
                ))}
              </>
            )}

            {/* Drives */}
            {drives.length > 0 && (
              <>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "rgba(255,255,255,0.2)", padding: "10px 10px 2px", textTransform: "uppercase" }}>Drives</div>
                {drives.map(d => (
                  <div
                    key={d}
                    style={sidebarItem(normalizePath(currentPath) === normalizePath(d), hovered === d)}
                    onClick={() => navigate(d)}
                    onMouseEnter={() => setHovered(d)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <span style={{ fontSize: 14 }}>💾</span>
                    <span>{d.replace("/", ":\\")}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Folder list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
            {loading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--dim)", fontSize: 13, gap: 10 }}>
                <span className="spin" style={{ fontSize: 20 }}>⟳</span> Loading…
              </div>
            )}
            {error && (
              <div style={{ padding: 20, color: "#f87171", fontSize: 12 }}>{error}</div>
            )}
            {!loading && !error && entries.length === 0 && (
              <div style={{ padding: 20, color: "var(--faint)", fontSize: 12 }}>This folder is empty.</div>
            )}
            {!loading && !error && entries.map(e => (
              <div
                key={e.path}
                style={entryRow(hovered === e.path, selected === e.path, e.is_dir)}
                onMouseEnter={() => setHovered(e.path)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => {
                  if (e.is_dir) setSelected(e.path);
                }}
                onDoubleClick={() => {
                  if (e.is_dir) navigate(e.path);
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0, opacity: e.is_dir ? 1 : 0.4 }}>
                  {e.is_vnv_project ? "💾" : e.is_dir ? "📁" : "📄"}
                </span>
                <span style={{ fontSize: 13, color: e.is_vnv_project ? "var(--teal)" : e.is_dir ? "#c8d8e8" : "var(--dim)", fontWeight: e.is_dir ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: "12px 18px", borderTop: "1px solid var(--bdr)",
          display: "flex", alignItems: "center", gap: 12,
          background: "rgba(0,0,0,0.12)",
        }}>
          {/* Current path — drag to scroll */}
          <div
            ref={pathRef}
            onMouseDown={onPathDrag}
            style={{
              flex: 1, fontSize: 11, fontFamily: "var(--mono)", color: "var(--teal)",
              background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "6px 10px",
              overflowX: "auto", whiteSpace: "nowrap", cursor: "grab",
              userSelect: "none", scrollbarWidth: "none",
            }}
          >
            {footerPath.replace(/\//g, "\\")}
          </div>
          <button
            onClick={onCancel}
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--dim)", fontSize: 13, padding: "8px 18px", borderRadius: 8, cursor: "pointer",
            }}
          >Cancel</button>
          <button
            onClick={() => onSelect(footerPath)}
            style={{
              background: "rgba(0,212,200,0.15)", border: "1px solid rgba(0,212,200,0.4)",
              color: "var(--teal)", fontSize: 13, fontWeight: 700,
              padding: "8px 22px", borderRadius: 8, cursor: "pointer",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,200,0.25)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,212,200,0.15)"; }}
          >Select This Folder</button>
        </div>
      </div>
    </div>
  );
}
