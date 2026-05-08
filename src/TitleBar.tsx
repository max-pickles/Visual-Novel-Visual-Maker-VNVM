import React, { useState, useEffect, useRef } from "react";

interface TitleBarProps {
  title?: string;
}

export function TitleBar({ title = "VNVMaker" }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const winRef = useRef<any>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      winRef.current = win;
      setIsMaximized(await win.isMaximized());
      unlisten = await win.onResized(async () => {
        setIsMaximized(await win.isMaximized());
      });
    })();
    return () => { unlisten?.(); };
  }, []);

  const handleMinimize = () => winRef.current?.minimize();

  const handleMaximize = async () => {
    if (!winRef.current) return;
    if (await winRef.current.isMaximized()) {
      winRef.current.unmaximize();
    } else {
      winRef.current.maximize();
    }
  };

  const handleClose = () => winRef.current?.close();

  return (
    <div
      data-tauri-drag-region="true"
      style={{
        height: 32,
        display: "flex",
        alignItems: "center",
        background: "var(--bg1)",
        borderBottom: "1px solid rgba(0,212,200,0.08)",
        flexShrink: 0,
        userSelect: "none",
        position: "relative",
        zIndex: 10000,
      }}
    >
      {/* Drag region — fills all space left of the buttons */}
      <div
        data-tauri-drag-region="true"
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          paddingLeft: 12,
          gap: 8,
          cursor: "default",
        }}
      >
        <div data-tauri-drag-region="true" style={{ display: "flex", gap: 3 }}>
          <div data-tauri-drag-region="true" style={{ width: 8, height: 8, background: "var(--teal)" }} />
          <div data-tauri-drag-region="true" style={{ width: 8, height: 8, background: "var(--acc)" }} />
        </div>
        <span data-tauri-drag-region="true" style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#7e95ab",
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          letterSpacing: "0.02em",
        }}>
          {title}
        </span>
      </div>

      {/* Control buttons */}
      <div style={{ display: "flex", height: "100%" }}>
        <button onClick={handleMinimize} className="titlebar-btn" style={btnStyle()} title="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>

        <button onClick={handleMaximize} className="titlebar-btn" style={btnStyle()} title={isMaximized ? "Restore" : "Maximize"}>
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="2" y="0" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
              <rect x="0" y="2" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="var(--bg1)" />
              <rect x="0" y="2" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          )}
        </button>

        <button onClick={handleClose} className="titlebar-btn titlebar-close" style={btnStyle()} title="Close">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function btnStyle(): React.CSSProperties {
  return {
    width: 46,
    height: "100%",
    border: "none",
    background: "transparent",
    color: "#6b7280",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 0.1s, color 0.1s",
    outline: "none",
  };
}
