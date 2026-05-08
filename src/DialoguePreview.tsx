/**
 * DialoguePreview.tsx
 * Inline "Player View" — shows a mock Ren'Py textbox for dialogue lines
 * or a choice screen for menu blocks. Ported from legacy IDE; all Tailwind
 * replaced with VNV Maker CSS variables.
 */
import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface DialogueData {
  kind: 'dialogue';
  charName: string | null;
  charColor: string | null;
  text: string;
  whoPrefix?: string;
  whoSuffix?: string;
  whatPrefix?: string;
  whatSuffix?: string;
}

export interface MenuChoice {
  text: string;
  condition?: string;
  destination?: string;
}

interface MenuData {
  kind: 'menu';
  prompt?: string;
  choices: MenuChoice[];
}

export type DialoguePreviewData = DialogueData | MenuData;

interface DialoguePreviewProps {
  data: DialoguePreviewData | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

// ── Ren'Py text tag renderer ─────────────────────────────────────────────────

function renderRenpyText(text: string): React.ReactNode {
  const segments: React.ReactNode[] = [];
  const tagRe = /\{([^}]*)\}|\[([^\]]*)\]/g;
  let pos = 0; let key = 0;
  let bold = false; let italic = false; let underline = false; let strike = false;
  let color: string | undefined;

  const push = (str: string) => {
    if (!str) return;
    const style: React.CSSProperties = {};
    if (bold)   style.fontWeight = 'bold';
    if (italic) style.fontStyle = 'italic';
    if (underline && strike) style.textDecoration = 'underline line-through';
    else if (underline)      style.textDecoration = 'underline';
    else if (strike)         style.textDecoration = 'line-through';
    if (color)  style.color = color;
    if (Object.keys(style).length > 0) {
      segments.push(<span key={key++} style={style}>{str}</span>);
    } else {
      segments.push(<React.Fragment key={key++}>{str}</React.Fragment>);
    }
  };

  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(text)) !== null) {
    push(text.slice(pos, match.index));
    pos = match.index + match[0].length;
    if (match[2] !== undefined) {
      segments.push(<span key={key++} style={{ opacity: 0.5, fontStyle: 'italic' }}>[{match[2]}]</span>);
    } else {
      const tag = match[1];
      if      (tag === 'b')       bold = true;
      else if (tag === '/b')      bold = false;
      else if (tag === 'i')       italic = true;
      else if (tag === '/i')      italic = false;
      else if (tag === 'u')       underline = true;
      else if (tag === '/u')      underline = false;
      else if (tag === 's')       strike = true;
      else if (tag === '/s')      strike = false;
      else if (tag === '/color')  color = undefined;
      else {
        const cm = tag.match(/^color=(#[0-9a-fA-F]{3,8}|[a-z]+)$/i);
        if (cm) color = cm[1];
      }
    }
  }
  push(text.slice(pos));
  return <>{segments}</>;
}

// ── Sub-renderers ────────────────────────────────────────────────────────────

const DialogueBox: React.FC<{ data: DialogueData }> = ({ data }) => (
  <div style={{
    background: 'rgba(0,0,0,0.82)',
    border: '1px solid var(--bdr)',
    borderRadius: 6,
    padding: '10px 14px',
  }}>
    {data.charName && (
      <div style={{ marginBottom: 6 }}>
        <span style={{
          display: 'inline-block',
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 4,
          background: data.charColor ? `${data.charColor}33` : 'rgba(255,255,255,0.12)',
          color: data.charColor ?? '#ffffff',
          border: `1px solid ${data.charColor ?? 'rgba(255,255,255,0.25)'}55`,
        }}>
          {data.whoPrefix}{data.charName}{data.whoSuffix}
        </span>
      </div>
    )}
    <p style={{ fontSize: 13, lineHeight: 1.6, color: '#f0f0f0', fontFamily: 'serif', margin: 0 }}>
      {data.whatPrefix && <span style={{ opacity: 0.6 }}>{data.whatPrefix}</span>}
      {renderRenpyText(data.text)}
      {data.whatSuffix && <span style={{ opacity: 0.6 }}>{data.whatSuffix}</span>}
    </p>
  </div>
);

const ChoiceScreen: React.FC<{ data: MenuData }> = ({ data }) => (
  <div style={{
    background: 'rgba(0,0,0,0.82)',
    border: '1px solid var(--bdr)',
    borderRadius: 6,
    padding: '10px 14px',
  }}>
    {data.prompt && (
      <p style={{ fontSize: 13, marginBottom: 8, color: '#d0d0d0', fontFamily: 'serif' }}>
        {renderRenpyText(data.prompt)}
      </p>
    )}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.choices.map((choice, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            flex: 1, padding: '4px 10px', borderRadius: 4, fontSize: 13,
            background: 'rgba(255,255,255,0.08)',
            color: '#f0f0f0',
            border: '1px solid rgba(255,255,255,0.18)',
          }}>
            {renderRenpyText(choice.text)}
            {choice.condition && (
              <span style={{ marginLeft: 8, fontFamily: 'monospace', opacity: 0.4, fontSize: 10 }}>
                if {choice.condition}
              </span>
            )}
          </div>
          {choice.destination && (
            <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: 'nowrap', color: 'var(--acc2)' }}>
              → {choice.destination}
            </span>
          )}
        </div>
      ))}
    </div>
  </div>
);

// ── Main component ───────────────────────────────────────────────────────────

const DialoguePreview: React.FC<DialoguePreviewProps> = ({ data, isExpanded, onToggleExpand }) => {
  const label = data?.kind === 'menu' ? 'Choice Preview' : 'Dialogue Preview';
  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid var(--bdr)',
      background: 'var(--bg2)',
      userSelect: 'none',
    }}>
      <button
        onClick={onToggleExpand}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--dim)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <span>{label}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: 14, height: 14, transform: isExpanded ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isExpanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {data ? (
            data.kind === 'dialogue'
              ? <DialogueBox data={data} />
              : <ChoiceScreen data={data} />
          ) : (
            <p style={{ fontSize: 11, color: 'var(--faint)', fontStyle: 'italic', padding: '4px 0' }}>
              No dialogue or menu at selected event
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default DialoguePreview;
