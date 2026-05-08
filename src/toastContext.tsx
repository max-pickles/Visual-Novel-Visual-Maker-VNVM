/**
 * toastContext.tsx — Godot EditorToaster-inspired global notification system.
 *
 * Features ported from Godot:
 *  - 3 severity levels: info / warning / error  (replaces success/error/warning/info)
 *  - Duplicate collapsing: same message + severity → count badge, timer reset
 *  - Per-toast duration (default 5 s, -1 = sticky)
 *  - Hover-over-any-toast pauses all timers
 *  - Max 5 visible at once (oldest auto-dismissed)
 *  - Global singleton: ToastManager.show() works outside React tree
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

// ─── Public API ───────────────────────────────────────────────────────────────

export type ToastSeverity = "info" | "warning" | "error";

// Keep "success" as an alias mapped to "info" so old call-sites still compile.
export type ToastType = ToastSeverity | "success";

export interface ToastMessage {
  id: string;
  type: ToastType;         // kept for backwards compat
  severity: ToastSeverity;
  message: string;
  tooltip?: string;
  duration: number;        // seconds; -1 = sticky
  remainingTime: number;   // seconds remaining
  count: number;           // duplicate count
  popped: boolean;         // currently visible
  alpha: number;           // 0–1
}

interface ToastContextValue {
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastType, opts?: { tooltip?: string; duration?: number }) => void;
  removeToast: (id: string) => void;
  setHovered: (h: boolean) => void;
  // Convenience
  success: (msg: string) => void;
  error:   (msg: string, tooltip?: string) => void;
  warning: (msg: string, tooltip?: string) => void;
  info:    (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Singleton bridge (works outside React tree) ──────────────────────────────

type ShowFn = (message: string, severity?: ToastSeverity, opts?: { tooltip?: string }) => void;
let _globalShow: ShowFn | null = null;

export const ToastManager = {
  show: (message: string, severity: ToastSeverity = "info", opts?: { tooltip?: string }) => {
    _globalShow?.(message, severity, opts);
  },
  info:    (msg: string) => ToastManager.show(msg, "info"),
  success: (msg: string) => ToastManager.show(msg, "info"),
  warning: (msg: string, tooltip?: string) => ToastManager.show(msg, "warning", { tooltip }),
  error:   (msg: string, tooltip?: string) => ToastManager.show(msg, "error",   { tooltip }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 5.0; // seconds

function severityOf(type: ToastType): ToastSeverity {
  if (type === "success") return "info";
  return type as ToastSeverity;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const hoveredRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(performance.now());

  // Tick loop — runs every rAF frame
  useEffect(() => {
    const tick = (now: number) => {
      const delta = (now - lastTickRef.current) / 1000; // seconds
      lastTickRef.current = now;

      setToasts(prev => {
        let changed = false;
        const next = prev.map(t => {
          let { remainingTime, alpha, popped } = t;

          // Fade in
          if (popped && alpha < 1) {
            alpha = Math.min(1, alpha + delta * 4);
            changed = true;
          }
          // Fade out
          if (!popped && alpha > 0) {
            alpha = Math.max(0, alpha - delta * 3);
            changed = true;
          }

          // Countdown (skip when hovered or sticky)
          if (!hoveredRef.current && popped && t.duration > 0) {
            remainingTime = Math.max(0, remainingTime - delta);
            changed = true;
            if (remainingTime <= 0) {
              popped = false;
            }
          }

          return changed ? { ...t, remainingTime, alpha, popped } : t;
        });

        // Remove fully faded toasts
        const filtered = next.filter(t => t.alpha > 0 || t.popped);
        if (filtered.length !== next.length) changed = true;

        return changed ? filtered : prev;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Register global singleton
  useEffect(() => {
    _globalShow = (message, severity = "info", opts) => {
      addToast(message, severity, opts);
    };
    return () => { _globalShow = null; };
  });

  const setHovered = useCallback((h: boolean) => {
    hoveredRef.current = h;
    if (h) {
      // Reset timers while hovered
      setToasts(prev => prev.map(t =>
        t.duration > 0 ? { ...t, remainingTime: t.duration } : t
      ));
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, popped: false } : t));
  }, []);

  const addToast = useCallback((
    message: string,
    type: ToastType = "info",
    opts: { tooltip?: string; duration?: number } = {}
  ) => {
    const severity = severityOf(type);
    const duration = opts.duration ?? DEFAULT_DURATION;

    setToasts(prev => {
      // Duplicate collapse: same message + severity → bump count and reset timer
      const existing = prev.find(t => t.message === message && t.severity === severity);
      if (existing) {
        return prev.map(t => t.id === existing.id
          ? { ...t, count: t.popped ? t.count + 1 : 1, remainingTime: duration, popped: true }
          : t
        );
      }

      const newToast: ToastMessage = {
        id: Math.random().toString(36).slice(2, 10),
        type, severity, message,
        tooltip: opts.tooltip,
        duration, remainingTime: duration,
        count: 1, popped: true, alpha: 0,
      };

      const next = [...prev, newToast];

      // Auto-dismiss oldest visible toasts when over limit
      let visible = next.filter(t => t.popped).length;
      return next.map(t => {
        if (t.popped && visible > MAX_VISIBLE && t.id !== newToast.id) {
          visible--;
          return { ...t, popped: false };
        }
        return t;
      });
    });
  }, []);

  const success = useCallback((msg: string) => addToast(msg, "success"), [addToast]);
  const error   = useCallback((msg: string, tooltip?: string) => addToast(msg, "error",   { tooltip }), [addToast]);
  const warning = useCallback((msg: string, tooltip?: string) => addToast(msg, "warning", { tooltip }), [addToast]);
  const info    = useCallback((msg: string) => addToast(msg, "info"), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, setHovered, success, error, warning, info }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
