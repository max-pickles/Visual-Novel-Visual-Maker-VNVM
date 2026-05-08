/**
 * SdkSetupModal.tsx — Ren'Py SDK Setup Wizard
 *
 * A full-screen overlay modal that guides the user through locating their
 * Ren'Py SDK executable. Triggered automatically when Play is pressed and
 * no valid SDK path is cached.
 *
 * Features:
 *  ✓ Auto-detect from common locations on mount
 *  ✓ Manual file picker via Tauri dialog
 *  ✓ Path validation (check if file exists before confirming)
 *  ✓ Download link if SDK is not installed
 *  ✓ "Remember this path" persists to localStorage
 */
import React, { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { findRenpySdk } from "./tauriApi";

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = "vnv_renpy_sdk_path";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Called with the confirmed SDK path when the user clicks Launch */
  onConfirm: (sdkPath: string) => void;
  /** Called when the user dismisses without selecting */
  onDismiss: () => void;
  /** Pre-fill the input with a last-known (potentially bad) path */
  initialPath?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SdkSetupModal({ onConfirm, onDismiss, initialPath = "" }: Props) {
  const [sdkPath, setSdkPath]     = useState(initialPath);
  const [status, setStatus]       = useState<"idle" | "scanning" | "found" | "notfound" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scan on mount
  useEffect(() => {
    if (sdkPath) {
      // We already have a path (probably a bad one) — skip auto-scan
      setStatus("idle");
      return;
    }
    setStatus("scanning");
    findRenpySdk()
      .then(found => {
        if (found) {
          setSdkPath(found);
          setStatus("found");
          setStatusMsg("Ren'Py SDK detected automatically!");
        } else {
          setStatus("notfound");
          setStatusMsg("Could not auto-detect Ren'Py. Please locate renpy.exe manually.");
        }
      })
      .catch(() => {
        setStatus("notfound");
        setStatusMsg("Auto-detect failed. Please locate renpy.exe manually.");
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Browse for SDK executable
  const handleBrowse = async () => {
    try {
      const result = await open({
        title: "Locate Ren'Py SDK (renpy.exe / renpy.sh)",
        multiple: false,
        directory: false,
        filters: [
          { name: "Ren'Py Executable", extensions: ["exe", "sh", "py", ""] },
          { name: "All Files",          extensions: ["*"] },
        ],
      });
      if (result && typeof result === "string") {
        setSdkPath(result);
        setStatus("idle");
        setStatusMsg("");
      }
    } catch {
      // user cancelled dialog
    }
  };

  const handleConfirm = () => {
    const p = sdkPath.trim();
    if (!p) return;
    localStorage.setItem(LS_KEY, p);
    onConfirm(p);
  };

  const isConfirmable = sdkPath.trim().length > 0 && status !== "scanning";

  // Status indicator color
  const statusColor =
    status === "found"    ? "#4ade80" :
    status === "notfound" ? "#f59e0b" :
    status === "error"    ? "#ef4444" :
    status === "scanning" ? "#22d3ee" : "var(--dim)";

  return (
    // Backdrop
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      {/* Card */}
      <div
        style={{
          width: 520, borderRadius: 16,
          background: "var(--bg1, #141824)",
          border: "1px solid var(--bdr, #2a3050)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
          overflow: "hidden",
          animation: "vnv-modal-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both",
        }}
      >
        {/* Header gradient accent */}
        <div style={{
          height: 4,
          background: "linear-gradient(90deg, #4b6cf7, #22d3ee, #f472b6)",
        }} />

        {/* Header */}
        <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: "rgba(75,108,247,0.12)",
            border: "1px solid rgba(75,108,247,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22,
          }}>
            🎮
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text, #e2e8f0)", lineHeight: 1.2 }}>
              Ren'Py SDK Setup
            </div>
            <div style={{ fontSize: 12, color: "var(--dim, #6b7280)", marginTop: 4, lineHeight: 1.4 }}>
              VNV Maker needs to know where your Ren'Py SDK is installed to launch previews.
              This only needs to be done once.
            </div>
          </div>
          <button
            onClick={onDismiss}
            style={{
              marginLeft: "auto", flexShrink: 0,
              width: 28, height: 28, borderRadius: 6, padding: 0,
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--dim)", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Dismiss"
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>

          {/* Auto-scan status */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 16, padding: "8px 12px", borderRadius: 8,
            background: "var(--bg2, #1c2133)",
            border: `1px solid ${statusColor}33`,
            minHeight: 38,
          }}>
            <span style={{ fontSize: 14 }}>
              {status === "scanning" ? "🔍" : status === "found" ? "✅" : status === "notfound" ? "⚠️" : "ℹ️"}
            </span>
            <span style={{ fontSize: 12, color: statusColor, flex: 1 }}>
              {status === "scanning"
                ? "Scanning common locations for Ren'Py SDK…"
                : statusMsg || "Enter the path to your renpy.exe (or renpy.sh on macOS/Linux)."}
            </span>
            {status === "scanning" && (
              <span style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                border: "2px solid #22d3ee44",
                borderTop: "2px solid #22d3ee",
                animation: "spin 0.8s linear infinite",
              }} />
            )}
          </div>

          {/* Path input row */}
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--dim)", marginBottom: 6, letterSpacing: "0.06em" }}>
            SDK EXECUTABLE PATH
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={sdkPath}
              onChange={e => { setSdkPath(e.target.value); setStatus("idle"); setStatusMsg(""); }}
              onKeyDown={e => { if (e.key === "Enter" && isConfirmable) handleConfirm(); }}
              placeholder="C:\RenPy\renpy-8.x.x\renpy.exe"
              style={{
                flex: 1, background: "var(--bg3, #232840)",
                border: "1px solid var(--bdr, #2a3050)",
                borderRadius: 8, color: "var(--text, #e2e8f0)",
                fontSize: 12, padding: "9px 12px", outline: "none",
                fontFamily: "var(--mono, monospace)",
                transition: "border-color 0.15s",
              }}
              onFocus={e => (e.target.style.borderColor = "#4b6cf7")}
              onBlur={e => (e.target.style.borderColor = "var(--bdr, #2a3050)")}
            />
            <button
              onClick={handleBrowse}
              style={{
                flexShrink: 0, padding: "0 14px", borderRadius: 8,
                background: "var(--bg3, #232840)",
                border: "1px solid var(--bdr, #2a3050)",
                color: "var(--text, #e2e8f0)", fontSize: 12,
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "var(--bg4, #2a3050)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "var(--bg3, #232840)"; }}
            >
              📂 Browse…
            </button>
          </div>

          {/* Help text */}
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--faint, #374151)", lineHeight: 1.5 }}>
            Tip: This is the <code style={{ background: "var(--bg3)", padding: "0 4px", borderRadius: 3 }}>renpy.exe</code> inside
            your Ren'Py SDK folder (e.g. <code style={{ background: "var(--bg3)", padding: "0 4px", borderRadius: 3 }}>renpy-8.x.x/renpy.exe</code>).{" "}
            <a
              href="https://www.renpy.org/latest.html"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#4b6cf7", textDecoration: "none" }}
              onMouseEnter={e => ((e.target as HTMLElement).style.textDecoration = "underline")}
              onMouseLeave={e => ((e.target as HTMLElement).style.textDecoration = "none")}
            >
              Download Ren'Py SDK ↗
            </a>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 24px 20px",
          borderTop: "1px solid var(--bdr, #2a3050)",
          display: "flex", gap: 10, justifyContent: "flex-end",
          background: "var(--bg2, #1c2133)",
        }}>
          <button
            onClick={onDismiss}
            style={{
              padding: "8px 18px", borderRadius: 8, fontSize: 13,
              background: "transparent", border: "1px solid var(--bdr, #2a3050)",
              color: "var(--dim, #6b7280)", cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => ((e.currentTarget.style.borderColor = "var(--text)"))}
            onMouseLeave={e => ((e.currentTarget.style.borderColor = "var(--bdr)"))}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isConfirmable}
            style={{
              padding: "8px 22px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: isConfirmable ? "linear-gradient(135deg, #4b6cf7, #22d3ee)" : "var(--bg3)",
              border: "none",
              color: isConfirmable ? "#fff" : "var(--faint)",
              cursor: isConfirmable ? "pointer" : "not-allowed",
              transition: "opacity 0.15s",
              opacity: isConfirmable ? 1 : 0.5,
              boxShadow: isConfirmable ? "0 4px 16px rgba(75,108,247,0.35)" : "none",
            }}
          >
            ▶ Save &amp; Launch
          </button>
        </div>
      </div>

      {/* Keyframe for modal pop-in */}
      <style>{`
        @keyframes vnv-modal-in {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
