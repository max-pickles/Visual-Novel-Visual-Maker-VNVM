/**
 * CanvasNavControls.tsx — Fit-to-screen and Go-to-start buttons for StoryCanvas.
 * Ported from bmf-vangard-renpy-ide-main/components/CanvasNavControls.tsx
 */
import React from "react";

interface CanvasNavControlsProps {
  onFit: () => void;
  onGoToStart?: () => void;
  hasStart?: boolean;
}

const btnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8,
  border: "1px solid var(--bdr, #2a3050)",
  background: "rgba(13,18,32,0.88)",
  color: "var(--dim, #6b7280)",
  cursor: "pointer", display: "flex",
  alignItems: "center", justifyContent: "center",
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  backdropFilter: "blur(8px)",
  transition: "background 0.15s, color 0.15s",
  flexShrink: 0,
};

export function CanvasNavControls({ onFit, onGoToStart, hasStart }: CanvasNavControlsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Fit all to screen */}
      <button
        title="Fit all to screen (F)"
        aria-label="Fit all to screen"
        style={btnStyle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(13,18,32,0.88)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--dim)"; }}
        onClick={onFit}
      >
        {/* Expand arrows icon */}
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H5.414l3.293 3.293a1 1 0 11-1.414 1.414L4 6.414V8a1 1 0 01-2 0V4zm9 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-2 0V5.414l-3.293 3.293a1 1 0 01-1.414-1.414L15.586 4H14a1 1 0 01-1-1zM3 16a1 1 0 010-2V12.414L6.293 9.12a1 1 0 011.414 1.414L4.414 14H6a1 1 0 010 2H4a1 1 0 01-1-1zm13-1a1 1 0 01-.707-.293l-3.293-3.293a1 1 0 011.414-1.414L16.586 13H15a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V15.586l-3.293 3.293A1 1 0 0113 15z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Go to start scene */}
      {hasStart && onGoToStart && (
        <button
          title="Go to start scene"
          aria-label="Go to start scene"
          style={btnStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--teal, #22d3ee)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(13,18,32,0.88)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--dim)"; }}
          onClick={onGoToStart}
        >
          {/* Flag icon */}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 7l2.55 2.4A1 1 0 0116 11H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}
