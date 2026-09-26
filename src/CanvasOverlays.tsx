/**
 * CanvasOverlays.tsx — Menus and HUD elements drawn over the story canvas.
 */
import type { VNProject } from "./types";
import type { ConnMenu } from "./store/slices/connectionSlice";
import { useTranslation } from "./translationContext";

export interface ChoiceBuilderState {
  sourceNodeId: string;
  screenX: number;
  screenY: number;
  canvasX: number;
  canvasY: number;
  prompt: string;
  options: { id: string; text: string; sceneId: string | null }[];
}

export interface LegendItem { type: string; label: string; stroke: string; dash?: string }

/** Menu shown when a connection is dropped: jump, choice or screen call. */
export function ConnectionMenu({ connMenu, applyConnection, onCancel }: {
  connMenu: ConnMenu;
  applyConnection: (type: 'jump' | 'choice' | 'call') => void;
  onCancel: () => void;
}) {
  return (
    <div 
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', left: connMenu.x + 20, top: connMenu.y,
        background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        padding: 8, width: 160, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 1000,
        animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
      }}>
      <div style={{ padding: '0 4px 4px 4px', fontSize: 11, fontWeight: 600, color: 'var(--dim)', marginBottom: 2 }}>
        {connMenu.targetNodeId ? 'Connect to Scene' : 'Create New Scene'}
      </div>
      <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 12, padding: '4px 8px', minHeight: 28 }} onClick={() => applyConnection('jump')}>
        Jump to Scene
      </button>
      <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 12, padding: '4px 8px', minHeight: 28 }} onClick={() => applyConnection('choice')}>
        Choice Option
      </button>
      <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 12, padding: '4px 8px', minHeight: 28 }} onClick={() => applyConnection('call')}>
        Screen Call
      </button>
      <div style={{ height: 1, background: 'var(--bdr)', margin: '4px 0' }} />
      <button className="btn btn-ghost" style={{ justifyContent: 'flex-start', fontSize: 12, padding: '4px 8px', minHeight: 28, color: '#ef4444' }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** Builds a choice event with one answer per route, from a dropped connection. */
export function ChoiceBuilderMenu({ choiceBuilder, setChoiceBuilder, displayNodes, onCreate, onCancel }: {
  choiceBuilder: ChoiceBuilderState;
  setChoiceBuilder: (b: ChoiceBuilderState | null) => void;
  displayNodes: { id: string; label: string; kind: string }[];
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <div 
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', left: choiceBuilder.screenX + 20, top: choiceBuilder.screenY, zIndex: 1000,
        background: 'var(--bg1)', border: '1px solid var(--bdr)', borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)', padding: 12, width: 340,
        display: 'flex', flexDirection: 'column', gap: 8,
        animation: 'popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
      }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dim)', marginBottom: 4 }}>Create Choice Block</div>

      <label style={{ fontSize: 10, color: 'var(--faint)' }}>Question / Prompt</label>
      <input autoFocus className="input" style={{ width: '100%', fontSize: 12, padding: '6px 8px', background: 'var(--bg0)' }} value={choiceBuilder.prompt} onChange={e => setChoiceBuilder({...choiceBuilder, prompt: e.target.value})} />

      <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 8 }}>Answers / Routes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
        {choiceBuilder.options.map((opt, i) => (
          <div key={opt.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="input" style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px', background: 'var(--bg0)' }} value={opt.text} placeholder="Answer text..." onChange={e => {
               const newOpts = [...choiceBuilder.options];
               newOpts[i].text = e.target.value;
               setChoiceBuilder({...choiceBuilder, options: newOpts});
            }} />
            <span style={{ color: 'var(--faint)', fontSize: 10 }}>→</span>
            <select className="input" style={{ width: 120, fontSize: 10, padding: '4px 6px', background: 'var(--bg0)' }} value={opt.sceneId || ''} onChange={e => {
               const newOpts = [...choiceBuilder.options];
               newOpts[i].sceneId = e.target.value;
               setChoiceBuilder({...choiceBuilder, options: newOpts});
            }}>
               <option value="__NEW__">✨ New Scene</option>
               <option value="">(Unlinked)</option>
               {displayNodes.filter(s => s.kind === 'vn_scene' && s.id !== choiceBuilder.sourceNodeId).map(s => (
                 <option key={s.id} value={s.id}>{s.label}</option>
               ))}
            </select>
            <button className="btn btn-ghost" style={{ padding: '2px 6px', color: 'var(--err)', minHeight: 0, height: 24 }} onClick={() => {
               const newOpts = choiceBuilder.options.filter((_, idx) => idx !== i);
               setChoiceBuilder({...choiceBuilder, options: newOpts});
            }}>×</button>
          </div>
        ))}
      </div>

      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', alignSelf: 'flex-start', color: 'var(--acc2)' }} onClick={() => {
         setChoiceBuilder({...choiceBuilder, options: [...choiceBuilder.options, { id: crypto.randomUUID().slice(0, 8), text: `Option ${choiceBuilder.options.length + 1}`, sceneId: '__NEW__' }]});
      }}>+ Add Answer</button>

      <div style={{ height: 1, background: 'var(--bdr)', margin: '4px 0' }} />

      <div style={{ display: 'flex', gap: 8 }}>
         <button className="btn" style={{ flex: 1, background: 'var(--acc)', color: '#fff', fontSize: 12, padding: '6px' }} onClick={onCreate}>Create Choice</button>
         <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '6px' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Key for the edge colors in use, shown above the minimap. */
export function EdgeLegend({ legendItems }: { legendItems: LegendItem[] }) {
  const { t } = useTranslation();
  return (
    <div style={{
      background: 'rgba(8,13,26,0.88)', backdropFilter: 'blur(8px)',
      border: '1px solid var(--bdr)', borderRadius: 8,
      padding: '10px 14px', pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 2 }}>{t('canvas.edge_types')}</span>
      {legendItems.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width={42} height={10} style={{ flexShrink: 0, overflow: 'visible' }}>
              <path d="M 4 2 A 3 3 0 0 1 4 8" fill="none" stroke={item.stroke} strokeWidth={2} strokeLinecap="round" />
              <line x1={7} y1={5} x2={34} y2={5}
                stroke={item.stroke} strokeWidth={2}
                strokeDasharray={item.dash}
                strokeLinecap="round" />
              <path d="M 30 2 L 38 5 L 30 8 Z" fill={item.stroke} />
            </svg>
          <span style={{ fontSize: 10, color: '#8892a4', whiteSpace: 'nowrap' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Shows or hides the canvas panels; slides beside the minimap. */
export function HideUiButton({ displayedSide, suppressAnim, panelExiting, uiVisible, setUiVisible }: {
  displayedSide: 'left' | 'right';
  suppressAnim: boolean;
  panelExiting: boolean;
  uiVisible: boolean;
  setUiVisible: (visible: boolean) => void;
}) {
  const { t } = useTranslation();
  const btnWidth = 100;
  const gap = 12;
  const mmWidth = 220;

  return (
    <div
      key="hide-ui-btn-wrapper"
      style={{
        position: 'absolute', bottom: 16, zIndex: 40,
        left: displayedSide === 'right' ? 16 : 'auto',
        right: displayedSide === 'left' ? 16 : 'auto',
        pointerEvents: 'none',
        animation: suppressAnim ? 'none' : (
          panelExiting
            ? (displayedSide === 'left' ? 'vnv-slide-out-right 0.44s forwards cubic-bezier(0.4,0,0.2,1)' : 'vnv-slide-out-left 0.44s forwards cubic-bezier(0.4,0,0.2,1)')
            : (displayedSide === 'left' ? 'vnv-slide-in-right 0.44s forwards cubic-bezier(0.4,0,0.2,1)' : 'vnv-slide-in-left 0.44s forwards cubic-bezier(0.4,0,0.2,1)')
        ),
      }}
    >
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={() => setUiVisible(!uiVisible)}
        style={{
          width: btnWidth,
          transform: uiVisible ? (displayedSide === 'left' ? `translateX(-${mmWidth + gap}px)` : `translateX(${mmWidth + gap}px)`) : 'translateX(0)',
          transition: suppressAnim ? 'none' : 'transform 0.44s cubic-bezier(0.4,0,0.2,1)',
          background: 'color-mix(in srgb, var(--bg2) 85%, transparent)', border: '1px solid var(--bdr)',
          borderRadius: 8, color: 'var(--dim)', fontSize: 13, fontWeight: 700,
          padding: '12px 0', cursor: 'pointer', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, pointerEvents: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        {uiVisible ? `🙈 ${t('canvas.hide_ui') || 'Hide UI'}` : `👀 ${t('canvas.show_ui') || 'Show UI'}`}
      </button>
    </div>
  );
}

/** The "Recent" button and list of recently edited scenes. */
export function RecentScenesHud({ recentSceneIds, showRecent, setShowRecent, project, onEditScene }: {
  recentSceneIds: string[];
  showRecent: boolean;
  setShowRecent: (show: boolean | ((prev: boolean) => boolean)) => void;
  project: VNProject;
  onEditScene?: (id: string) => void;
}) {
  return (
    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 30, pointerEvents: 'auto' }}>
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={() => setShowRecent(v => !v)}
        style={{
          background: 'color-mix(in srgb, var(--bg2) 85%, transparent)', border: '1px solid var(--bdr)',
          borderRadius: 6, color: 'var(--dim)', fontSize: 11, fontWeight: 600,
          padding: '4px 10px', cursor: 'pointer', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        🕐 Recent {showRecent ? '▲' : '▼'}
      </button>
      {showRecent && (
        <div style={{
          marginTop: 4, background: 'color-mix(in srgb, var(--bg2) 92%, transparent)',
          border: '1px solid var(--bdr)', borderRadius: 8,
          overflow: 'hidden', backdropFilter: 'blur(6px)',
          minWidth: 180,
        }}>
          {recentSceneIds.map(id => {
            const sc = project.scenes.find(s => s.id === id);
            if (!sc) return null;
            return (
              <button key={id}
                onClick={() => { setShowRecent(false); onEditScene?.(id); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 12px', background: 'transparent',
                  border: 'none', borderBottom: '1px solid var(--bdr)',
                  color: 'var(--text)', fontSize: 11, cursor: 'pointer',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--acc) 12%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                🎬 {sc.label || id}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
