/**
 * MainMenuThumbnail.tsx — Small preview of the game's main menu, shown on the
 * story canvas's main menu node.
 */
import { useState, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { VNMainMenu, VNMainMenuButton } from "./types";

// Ren'Py's default idle and hover colors for main menu buttons
const D_IDLE    = '#555555';
const D_HOVER   = '#e0a366';

function defaultButtons(): VNMainMenuButton[] {
  const rows: [string, VNMainMenuButton['action']][] = [
    ['Start', 'start'], ['Load', 'load'], ['Preferences', 'preferences'],
    ['About', 'about'], ['Help', 'help'], ['Quit', 'quit'],
  ];
  return rows.map(([label, action], i) => ({
    id: `def_${i}`, label, action, x: 0, y: 0, visible: true,
    style: { color: D_IDLE, hoverColor: D_HOVER, fontSize: 24 },
  }));
}

export function MainMenuThumbnail({ menu, title, rootPath, style }: {
  menu?: VNMainMenu; title: string; rootPath?: string; style?: CSSProperties;
}) {
  const [bgOk, setBgOk]           = useState(true);
  const [overlayOk, setOverlayOk] = useState(true);

  const bgSrc      = rootPath ? convertFileSrc(`${rootPath}/game/gui/main_menu.png`)         : '';
  const overlaySrc = rootPath ? convertFileSrc(`${rootPath}/game/gui/overlay/main_menu.png`) : '';

  const titleColor = menu?.style?.titleColor ?? '#ffaa22';
  const buttons    = menu?.buttons.filter(b => b.visible) ?? defaultButtons();

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 4, background: '#0a1a0a', ...style }}>
      {/* bg */}
      {bgSrc && bgOk ? (
        <img src={bgSrc} alt="" onError={() => setBgOk(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1a2a1a,#2a3a2a 50%,#3a4a1a)' }} />
      )}
      {/* sidebar overlay */}
      {overlaySrc && overlayOk ? (
        <img src={overlaySrc} alt="" onError={() => setOverlayOk(false)}
          style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '22%', objectFit: 'fill' }} />
      ) : (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '22%', background: 'linear-gradient(to right,rgba(0,0,0,0.88) 80%,rgba(0,0,0,0))' }} />
      )}
      {/* buttons */}
      <div style={{ position: 'absolute', left: '4%', top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
        {buttons.slice(0, 6).map(b => (
          <div key={b.id} style={{ fontSize: '0.37em', color: b.style?.color ?? D_IDLE, whiteSpace: 'nowrap', lineHeight: 1.55 }}>{b.label}</div>
        ))}
      </div>
      {/* title */}
      <div style={{ position: 'absolute', left: '23.5%', bottom: '5%' }}>
        <div style={{ fontSize: '0.48em', fontWeight: 700, color: titleColor, lineHeight: 1.1 }}>{menu?.title ?? title}</div>
        <div style={{ fontSize: '0.33em', color: titleColor, opacity: 0.65 }}>Ren'Py 7+ Edition</div>
      </div>
    </div>
  );
}
