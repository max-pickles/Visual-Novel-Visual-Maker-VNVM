/**
 * Toast.tsx — Godot EditorToaster-inspired notification stack.
 *
 * Ported features:
 *  ✓ 3-severity color scheme (info / warning / error)
 *  ✓ Progress bar that depletes as the timer runs (drawn on bottom of card)
 *  ✓ Hover over ANY toast pauses ALL timers + resets remaining time
 *  ✓ Duplicate collapse: same message shows "(3)" badge
 *  ✓ Copy button on each toast
 *  ✓ Sticky (duration=-1) toasts: no progress bar, no auto-dismiss
 *  ✓ RAF-driven fade-in/fade-out alpha controlled by context
 *  ✓ Slide-in from right on enter
 *  ✓ Tooltip support (shown on hover via native title)
 */
import React, { useRef } from "react";
import type { ToastMessage, ToastSeverity } from "./toastContext";
import { useToast } from "./toastContext";

// ─── Design tokens ────────────────────────────────────────────────────────────

const SEV: Record<ToastSeverity, {
  border: string; bar: string; bg: string; icon: string; label: string;
}> = {
  info: {
    border: "#4b6cf7",
    bar:    "#4b6cf7",
    bg:     "rgba(75,108,247,0.10)",
    icon:   "ℹ",
    label:  "INFO",
  },
  warning: {
    border: "#f59e0b",
    bar:    "#f59e0b",
    bg:     "rgba(245,158,11,0.10)",
    icon:   "⚠",
    label:  "WARN",
  },
  error: {
    border: "#ef4444",
    bar:    "#ef4444",
    bg:     "rgba(239,68,68,0.10)",
    icon:   "✕",
    label:  "ERR",
  },
};

// Map old "success" to info colours
function getSev(t: ToastMessage) {
  return SEV[t.severity] ?? SEV.info;
}

// ─── Single card ──────────────────────────────────────────────────────────────

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const s = getSev(toast);

  // Progress ratio 0–1 (full → empty as timer runs)
  const progress = toast.duration > 0
    ? Math.min(1, toast.remainingTime / toast.duration)
    : 1;

  const handleCopy = () => {
    try { navigator.clipboard.writeText(toast.message); } catch {}
  };

  // Slide offset: fade in from right
  const slideX = toast.alpha < 1 && toast.popped ? `${-(1 - toast.alpha) * 32}px` : "0px";

  return (
    <div
      title={toast.tooltip ?? ""}
      style={{
        position: "relative",
        minWidth: 280, maxWidth: 400,
        borderRadius: 8,
        background: "var(--bg2, #141824)",
        border: `1px solid var(--bdr, #2a3050)`,
        borderLeft: `3px solid ${s.border}`,
        boxShadow: `0 8px 28px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.04)`,
        overflow: "hidden",
        opacity: toast.alpha,
        transform: `translateX(${slideX})`,
        transition: "transform 0.02s linear",
        willChange: "opacity, transform",
      }}
    >
      {/* ── Content Row ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 9,
        padding: "10px 12px 12px",
      }}>

        {/* Severity icon bubble */}
        <span style={{
          flexShrink: 0, width: 20, height: 20, borderRadius: "50%",
          background: s.bg, border: `1px solid ${s.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: s.border,
          lineHeight: 1, marginTop: 1,
        }}>
          {s.icon}
        </span>

        {/* Message */}
        <div style={{
          flex: 1, fontSize: 12.5, color: "var(--text, #e2e8f0)",
          lineHeight: 1.45, wordBreak: "break-word",
        }}>
          {toast.message}
          {toast.count > 1 && (
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 700,
              color: s.border, opacity: 0.85,
            }}>
              ({toast.count})
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0, marginTop: -1 }}>
          {/* Copy */}
          <ActionBtn title="Copy" onClick={handleCopy}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </ActionBtn>
          {/* Dismiss */}
          <ActionBtn title="Dismiss" onClick={() => onDismiss(toast.id)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </ActionBtn>
        </div>
      </div>

      {/* ── Progress bar (Godot: drawn on bottom, depletes left→right) ── */}
      {toast.duration > 0 && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
          background: "rgba(255,255,255,0.06)",
        }}>
          <div style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: s.bar,
            opacity: 0.7,
            // No CSS transition — alpha-based RAF loop updates this every frame
          }} />
        </div>
      )}
    </div>
  );
}

// ─── Small icon button ─────────────────────────────────────────────────────────

function ActionBtn({
  title, onClick, children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 20, height: 20, borderRadius: 4, padding: 0,
        background: hover ? "rgba(255,255,255,0.1)" : "transparent",
        border: "none", cursor: "pointer",
        color: hover ? "var(--text, #e2e8f0)" : "var(--dim, #6b7280)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s, color 0.12s",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ─── Toast Stack ──────────────────────────────────────────────────────────────

export function ToastStack() {
  const { toasts, removeToast, setHovered } = useToast();

  // Only render toasts that are visible (popped or still fading out)
  const visible = toasts.filter(t => t.alpha > 0.01 || t.popped);
  if (!visible.length) return null;

  return (
    <div
      style={{
        position: "fixed", bottom: 20, left: 20,
        display: "flex", flexDirection: "column-reverse", gap: 8,
        zIndex: 99999, pointerEvents: "none",
        // Leave room for the progress bar to draw at the bottom edge
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {visible.map(t => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastCard toast={t} onDismiss={removeToast} />
        </div>
      ))}
    </div>
  );
}
