/**
 * ImageMapComposer.tsx
 * Visual hotspot editor for Ren'Py imagemap screens.
 * Draw, move, and resize clickable regions over a background image,
 * then generate the Ren'Py screen code. Ported from legacy IDE.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';

interface Hotspot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  action: string;
}

interface ImageMapComposerProps {
  backgroundUrl?: string;   // full URL to the background image
  backgroundPath?: string;  // relative path for code generation
  screenName?: string;
  onCodeGenerated?: (code: string) => void;
}

let _nextId = 1;
const newId = () => `hs_${_nextId++}`;

function generateCode(screenName: string, bgPath: string, hotspots: Hotspot[]): string {
  const lines = [
    `screen ${screenName}():`,
    `    imagemap:`,
    `        ground "${bgPath}"`,
    `        hover "${bgPath}"`,
    ``,
  ];
  hotspots.forEach(hs => {
    lines.push(`        hotspot (${Math.round(hs.x)}, ${Math.round(hs.y)}, ${Math.round(hs.w)}, ${Math.round(hs.h)}) action ${hs.action || `Jump("${hs.label}")`}`);
  });
  return lines.join('\n');
}

const ImageMapComposer: React.FC<ImageMapComposerProps> = ({
  backgroundUrl,
  backgroundPath = 'images/background.png',
  screenName = 'map_screen',
  onCodeGenerated,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [mode, setMode] = useState<'draw' | 'select'>('draw');
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 800, h: 450 });
  const [generatedCode, setGeneratedCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editAction, setEditAction] = useState('');

  // Load image dimensions
  useEffect(() => {
    if (!backgroundUrl) return;
    const img = new Image();
    img.src = backgroundUrl;
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, [backgroundUrl]);

  const getRelativePos = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const scaleX = imgSize.w / rect.width;
    const scaleY = imgSize.h / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [imgSize]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode !== 'draw') return;
    e.preventDefault();
    const pos = getRelativePos(e);
    setDrawing(true);
    setDrawStart(pos);
    setDrawRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }, [mode, getRelativePos]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing || !drawStart) return;
    const pos = getRelativePos(e);
    setDrawRect({
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      w: Math.abs(pos.x - drawStart.x),
      h: Math.abs(pos.y - drawStart.y),
    });
  }, [drawing, drawStart, getRelativePos]);

  const onMouseUp = useCallback(() => {
    if (!drawing || !drawRect || drawRect.w < 10 || drawRect.h < 10) {
      setDrawing(false); setDrawRect(null); setDrawStart(null);
      return;
    }
    const id = newId();
    const hs: Hotspot = { id, ...drawRect, label: `label_${id}`, action: '' };
    setHotspots(prev => [...prev, hs]);
    setSelected(id);
    setEditLabel(hs.label);
    setEditAction('');
    setDrawing(false); setDrawRect(null); setDrawStart(null);
    setMode('select');
  }, [drawing, drawRect]);

  const deleteSelected = () => {
    if (!selected) return;
    setHotspots(prev => prev.filter(h => h.id !== selected));
    setSelected(null);
  };

  const applyEdit = () => {
    if (!selected) return;
    setHotspots(prev => prev.map(h => h.id === selected
      ? { ...h, label: editLabel, action: editAction }
      : h));
  };

  const generateAndCopy = () => {
    const code = generateCode(screenName, backgroundPath, hotspots);
    setGeneratedCode(code);
    setShowCode(true);
    onCodeGenerated?.(code);
    navigator.clipboard.writeText(code).catch(() => {});
  };

  const selectedHs = hotspots.find(h => h.id === selected);
  const scale = canvasRef.current
    ? { x: (canvasRef.current.clientWidth || 800) / imgSize.w, y: ((canvasRef.current.clientWidth || 800) / imgSize.w) }
    : { x: 1, y: 1 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg0)' }}>

      {/* Toolbar */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--bdr)', background: 'var(--bg1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>ImageMap Composer</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['draw', 'select'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                border: `1px solid ${mode === m ? 'var(--teal)' : 'var(--bdr)'}`,
                background: mode === m ? 'rgba(0,212,200,0.12)' : 'transparent',
                color: mode === m ? 'var(--teal)' : 'var(--dim)',
              }}>
              {m === 'draw' ? '✏ Draw' : '🖱 Select'}
            </button>
          ))}
        </div>

        {selected && (
          <button onClick={deleteSelected}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
            🗑 Delete
          </button>
        )}

        <button onClick={generateAndCopy}
          style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 12px', borderRadius: 5, cursor: 'pointer', background: 'var(--acc2)', border: 'none', color: '#fff', fontWeight: 600 }}>
          {'</>'} Generate Code
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Canvas area */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#0a0a12' }}>
          <div
            ref={canvasRef}
            style={{ position: 'relative', width: '100%', paddingTop: `${(imgSize.h / imgSize.w) * 100}%`, cursor: mode === 'draw' ? 'crosshair' : 'default', userSelect: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          >
            {/* Background image */}
            {backgroundUrl && (
              <img src={backgroundUrl} alt="background"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }} />
            )}
            {!backgroundUrl && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontSize: 13 }}>
                No background image — load one from the Asset Browser
              </div>
            )}

            {/* Hotspots */}
            {hotspots.map(hs => {
              const isSelected = selected === hs.id;
              const cw = canvasRef.current?.clientWidth ?? 800;
              const sx = cw / imgSize.w;
              const sy = (canvasRef.current?.clientHeight ?? (cw * imgSize.h / imgSize.w)) / imgSize.h;
              return (
                <div key={hs.id}
                  onClick={e => { e.stopPropagation(); setSelected(hs.id); setEditLabel(hs.label); setEditAction(hs.action); setMode('select'); }}
                  style={{
                    position: 'absolute',
                    left: hs.x * sx, top: hs.y * sy,
                    width: hs.w * sx, height: hs.h * sy,
                    border: `2px solid ${isSelected ? 'var(--teal)' : 'rgba(107,138,251,0.7)'}`,
                    background: isSelected ? 'rgba(0,212,200,0.15)' : 'rgba(107,138,251,0.1)',
                    cursor: 'pointer', boxSizing: 'border-box',
                  }}>
                  <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: isSelected ? 'var(--teal)' : 'var(--acc2)', fontFamily: 'var(--mono)', pointerEvents: 'none', background: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: 2 }}>
                    {hs.label}
                  </span>
                </div>
              );
            })}

            {/* Drawing preview */}
            {drawing && drawRect && drawRect.w > 5 && (
              <div style={{
                position: 'absolute',
                left: drawRect.x / imgSize.w * (canvasRef.current?.clientWidth ?? 800),
                top: drawRect.y / imgSize.h * (canvasRef.current?.clientHeight ?? 450),
                width: drawRect.w / imgSize.w * (canvasRef.current?.clientWidth ?? 800),
                height: drawRect.h / imgSize.h * (canvasRef.current?.clientHeight ?? 450),
                border: '2px dashed var(--teal)', background: 'rgba(0,212,200,0.08)',
                pointerEvents: 'none', boxSizing: 'border-box',
              }} />
            )}
          </div>
        </div>

        {/* Side panel */}
        <div style={{ width: 240, borderLeft: '1px solid var(--bdr)', background: 'var(--bg1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Hotspot list */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--bdr)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>HOTSPOTS ({hotspots.length})</div>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {hotspots.length === 0 && <div style={{ fontSize: 11, color: 'var(--faint)', fontStyle: 'italic' }}>Draw regions on the canvas.</div>}
              {hotspots.map(hs => (
                <div key={hs.id}
                  onClick={() => { setSelected(hs.id); setEditLabel(hs.label); setEditAction(hs.action); setMode('select'); }}
                  style={{
                    padding: '4px 8px', borderRadius: 4, cursor: 'pointer', marginBottom: 2, fontSize: 11,
                    background: selected === hs.id ? 'rgba(0,212,200,0.1)' : 'transparent',
                    border: `1px solid ${selected === hs.id ? 'var(--teal)' : 'transparent'}`,
                    color: selected === hs.id ? 'var(--teal)' : 'var(--text)',
                    fontFamily: 'var(--mono)',
                  }}>
                  {hs.label}
                </div>
              ))}
            </div>
          </div>

          {/* Edit selected */}
          <div style={{ flex: 1, padding: '10px', overflow: 'auto' }}>
            {selectedHs ? (
              <>
                <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>EDIT HOTSPOT</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--dim)', display: 'block', marginBottom: 3 }}>Label / Target</label>
                    <input className="input" value={editLabel} onChange={e => setEditLabel(e.target.value)} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--dim)', display: 'block', marginBottom: 3 }}>Action (optional)</label>
                    <input className="input" placeholder={`Jump("${editLabel}")`} value={editAction} onChange={e => setEditAction(e.target.value)} style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>
                    {Math.round(selectedHs.x)},{Math.round(selectedHs.y)} · {Math.round(selectedHs.w)}×{Math.round(selectedHs.h)}
                  </div>
                  <button onClick={applyEdit}
                    style={{ fontSize: 11, padding: '5px', borderRadius: 5, cursor: 'pointer', background: 'var(--teal)', border: 'none', color: '#000', fontWeight: 600 }}>
                    Apply
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--faint)', fontStyle: 'italic' }}>Select a hotspot to edit it.</div>
            )}
          </div>
        </div>
      </div>

      {/* Generated code panel */}
      {showCode && (
        <div style={{ borderTop: '1px solid var(--bdr)', background: 'var(--bg2)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', borderBottom: '1px solid var(--bdr)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flex: 1 }}>Generated Ren'Py Screen Code</span>
            <button onClick={() => setShowCode(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontSize: 14 }}>✕</button>
          </div>
          <pre style={{ margin: 0, padding: '10px 14px', maxHeight: 180, overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--teal)', background: 'var(--bg0)', whiteSpace: 'pre-wrap' }}>
            {generatedCode}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ImageMapComposer;
