/**
 * NewProjectWizard.tsx — The start screen's "Create Project" wizard.
 */
import { useState } from "react";
import { useTranslation } from "./translationContext";

/** The wizard's fields and current step. */
export function useNewProjectWizard() {
  const [newTitle, setNewTitle] = useState("My Visual Novel");
  const [newAuthor, setNewAuthor] = useState("Me");
  const [newRes, setNewRes] = useState("1920x1080");
  const [newAccent, setNewAccent] = useState("#0099cc");
  const [newBg, setNewBg] = useState("#1a1a2e");
  const [wizardStep, setWizardStep] = useState<0|1|2|3|4>(0); // 0=name,1=template,2=res,3=colors,4=processing
  const [newTemplate, setNewTemplate] = useState<"blank" | "demo">("blank");
  return {
    newTitle, setNewTitle, newAuthor, setNewAuthor, newRes, setNewRes,
    newAccent, setNewAccent, newBg, setNewBg, wizardStep, setWizardStep,
    newTemplate, setNewTemplate,
  };
}

interface Props {
  wizard: ReturnType<typeof useNewProjectWizard>;
  /** Create the project from the wizard's fields. */
  onCreate: () => void;
  onCancel: () => void;
}

export function NewProjectWizard({ wizard, onCreate, onCancel }: Props) {
  const { t } = useTranslation();
  const {
    newTitle, setNewTitle, newAuthor, setNewAuthor, newRes, setNewRes,
    newAccent, setNewAccent, newBg, setNewBg, wizardStep, setWizardStep,
    newTemplate, setNewTemplate,
  } = wizard;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
      backdropFilter: 'blur(12px)', zIndex: 120,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 560, background: 'linear-gradient(145deg,var(--bg2),var(--bg3))',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
        boxShadow: '0 32px 80px rgba(0,0,0,.9)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Step indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '24px 0 0' }}>
          {([t("wizard.step_name"), t("wizard.step_template"), t("wizard.step_res"), t("wizard.step_color"), t("wizard.step_create")].map((label, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: i <= wizardStep ? 28 : 20,
                height: i <= wizardStep ? 28 : 20,
                borderRadius: '50%',
                background: i < wizardStep ? 'var(--teal)' : i === wizardStep ? 'var(--acc)' : 'rgba(255,255,255,0.07)',
                border: `2px solid ${i === wizardStep ? 'var(--acc)' : i < wizardStep ? 'var(--teal)' : 'rgba(255,255,255,0.12)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: i <= wizardStep ? '#fff' : 'var(--dim)',
                transition: 'all 0.25s',
              }}>{i < wizardStep ? '✓' : i + 1}</div>
              <div style={{ fontSize: 9, color: i === wizardStep ? 'var(--acc)' : 'var(--dim)', letterSpacing: '.08em', fontWeight: i === wizardStep ? 700 : 400 }}>{label}</div>
            </div>
          )))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '20px 32px 0' }} />

        {/* Step content */}
        <div style={{ padding: '28px 40px 24px', minHeight: 240 }}>

          {/* Step 0: Project Name */}
          {wizardStep === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.01em', marginBottom: 6 }}>{t("wizard.name_title")}</div>
                <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.6 }}>
                  {t("wizard.name_desc")} <code style={{ color: 'var(--teal)', fontFamily: 'var(--mono)', fontSize: 11 }}>VNVMAKER/games/</code>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 10, letterSpacing: '.10em', color: 'var(--dim)', fontWeight: 700 }}>{t("wizard.project_title")}</div>
                <input autoFocus className="input" style={{ fontSize: 15, padding: '10px 14px' }}
                  value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && newTitle.trim() && setWizardStep(1)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 10, letterSpacing: '.10em', color: 'var(--dim)', fontWeight: 700 }}>{t("wizard.author")}</div>
                <input className="input" style={{ fontSize: 14, padding: '10px 14px' }}
                  value={newAuthor} onChange={e => setNewAuthor(e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 1: Template */}
          {wizardStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{t("wizard.template_title")}</div>
                <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.6 }}>
                  {t("wizard.template_desc")}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {/* Blank Option */}
                <div onClick={() => setNewTemplate('blank')} style={{
                  flex: 1, padding: '20px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${newTemplate === 'blank' ? 'var(--acc)' : 'rgba(255,255,255,0.07)'}`,
                  background: newTemplate === 'blank' ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : 'rgba(255,255,255,0.025)',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: newTemplate === 'blank' ? '#fff' : '#aaa', marginBottom: 8 }}>{t("wizard.blank_title")}</div>
                  <div style={{ fontSize: 11, color: newTemplate === 'blank' ? 'var(--acc)' : 'var(--dim)' }}>{t("wizard.blank_desc")}</div>
                </div>

                {/* Demo Option */}
                <div onClick={() => setNewTemplate('demo')} style={{
                  flex: 1, padding: '20px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${newTemplate === 'demo' ? 'var(--acc)' : 'rgba(255,255,255,0.07)'}`,
                  background: newTemplate === 'demo' ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : 'rgba(255,255,255,0.025)',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: newTemplate === 'demo' ? '#fff' : '#aaa', marginBottom: 8 }}>{t("wizard.demo_title")}</div>
                  <div style={{ fontSize: 11, color: newTemplate === 'demo' ? 'var(--acc)' : 'var(--dim)' }}>{t("wizard.demo_desc")}</div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Resolution */}
          {wizardStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{t("wizard.res_title")}</div>
                <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.6 }}>
                  {t("wizard.res_desc")}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { val: '1280x720',  label: '1280 × 720',  note: 'HD' },
                  { val: '1920x1080', label: '1920 × 1080', note: 'Full HD — recommended' },
                  { val: '2560x1440', label: '2560 × 1440', note: '2K' },
                  { val: '3840x2160', label: '3840 × 2160', note: '4K' },
                ].map(r => {
                  const sel = newRes === r.val;
                  return (
                    <div key={r.val} onClick={() => setNewRes(r.val)} style={{
                      padding: '13px 18px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${sel ? 'var(--acc)' : 'rgba(255,255,255,0.07)'}`,
                      background: sel ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : 'rgba(255,255,255,0.025)',
                      display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.15s',
                    }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%',
                        border: `2px solid ${sel ? 'var(--acc)' : 'rgba(255,255,255,0.2)'}`,
                        background: sel ? 'var(--acc)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {sel && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: sel ? '#fff' : '#aaa', fontWeight: sel ? 700 : 400, flex: 1 }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: sel ? 'var(--acc)' : 'var(--dim)' }}>{r.note}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Colors */}
          {wizardStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{t("wizard.color_title")}</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>{t("wizard.color_desc")}</div>
              </div>
              {/* Accent swatches */}
              <div>
                <div style={{ fontSize: 10, letterSpacing: '.10em', color: 'var(--dim)', fontWeight: 700, marginBottom: 10 }}>{t("wizard.accent_color")}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                  {[
                    '#00b8c3','#6eb5ff','#00cc88','#e6c84a','#e67c00',
                    '#4b6cf7','#9b59b6','#00d4c8','#e91e8c','#e74c3c',
                    '#ffffff','#0099cc',
                  ].map(c => (
                    <div key={c} onClick={() => setNewAccent(c)}
                      title={c}
                      style={{
                        height: 34, borderRadius: 7, background: c, cursor: 'pointer',
                        border: newAccent === c ? '3px solid #fff' : '2px solid transparent',
                        boxShadow: newAccent === c ? `0 0 12px ${c}88` : 'none',
                        transform: newAccent === c ? 'scale(1.12)' : 'scale(1)',
                        transition: 'all 0.15s',
                      }} />
                  ))}
                </div>
              </div>
              {/* Background swatches */}
              <div>
                <div style={{ fontSize: 10, letterSpacing: '.10em', color: 'var(--dim)', fontWeight: 700, marginBottom: 10 }}>{t("wizard.bg_color")}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                  {[
                    '#0d0d1a','#0d1b2a','#0d1a0d','#1a1a00','#1a0d00',
                    '#000820','#0d001a','#001a1a','#1a0011','#1a0000',
                    '#111111','#1a1a2e',
                  ].map(c => (
                    <div key={c} onClick={() => setNewBg(c)}
                      title={c}
                      style={{
                        height: 34, borderRadius: 7, background: c, cursor: 'pointer',
                        border: newBg === c ? `3px solid ${newAccent}` : '2px solid rgba(255,255,255,0.10)',
                        boxShadow: newBg === c ? `0 0 10px ${newAccent}66` : 'none',
                        transform: newBg === c ? 'scale(1.12)' : 'scale(1)',
                        transition: 'all 0.15s',
                      }} />
                  ))}
                </div>
              </div>
              {/* Preview bar */}
              <div style={{ borderRadius: 8, padding: '12px 16px', background: newBg, border: `1px solid ${newAccent}44`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: newAccent }} />
                <div style={{ fontSize: 13, color: newAccent, fontWeight: 700 }}>{newTitle}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>{t("wizard.preview")}</div>
              </div>
            </div>
          )}

          {/* Step 4: Creating */}
          {wizardStep === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, height: 200 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.08)',
                borderTop: `3px solid ${newAccent}`,
                animation: 'spin 0.9s linear infinite',
              }} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>{t("wizard.creating_title")}</div>
                <div style={{ fontSize: 12, color: 'var(--dim)', textAlign: 'center', marginTop: 6 }}>{newTitle}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 32px' }} />
        <div style={{ padding: '18px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {wizardStep < 4 ? (
            <>
              <button className="btn btn-ghost" onClick={() => {
                if (wizardStep === 0) onCancel();
                else setWizardStep(s => (s - 1) as 0|1|2|3|4);
              }} style={{ fontSize: 13, color: 'var(--dim)' }}>
                {wizardStep === 0 ? t("wizard.btn_cancel") : `← ${t("wizard.btn_back")}`}
              </button>
              <button
                className="btn"
                disabled={wizardStep === 0 && !newTitle.trim()}
                onClick={() => {
                  if (wizardStep < 3) setWizardStep(s => (s + 1) as 0|1|2|3|4);
                  else onCreate();
                }}
                style={{ background: 'var(--acc)', color: '#fff', border: 'none', padding: '10px 28px', fontSize: 14, fontWeight: 700, borderRadius: 8, letterSpacing: '.04em', cursor: wizardStep === 0 && !newTitle.trim() ? 'not-allowed' : 'pointer', opacity: wizardStep === 0 && !newTitle.trim() ? 0.4 : 1 }}
              >
                {wizardStep === 3 ? `✨ ${t("wizard.btn_create")}` : `${t("wizard.btn_continue")} →`}
              </button>
            </>
          ) : (
            <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--dim)' }}>{t("wizard.btn_wait")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
