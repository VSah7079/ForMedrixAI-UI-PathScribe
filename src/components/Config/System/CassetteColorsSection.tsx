// src/components/Config/System/CassetteColorsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up's own two-layer architecture:
// "Routing Dictionary Management: Interfaces to maintain color keys,
// display names, and hex codes" and "Fallback Policy Settings." Same
// real table+modal pattern as ScanStationsSection.tsx / Cassette
// RoutingRulesSection.tsx — not a new one invented for this.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockCassetteColorService } from '../../../services/cassetteColors/mockCassetteColorService';
import type { CassetteColorDefinition, CassetteColorFallbackBehavior } from '../../../services/cassetteColors/ICassetteColorService';

type Draft = Omit<CassetteColorDefinition, 'id' | 'createdAt' | 'updatedAt'>;

const emptyDraft: Draft = {
  key: '', displayName: '', hexCode: '#3B82F6', active: true, fallbackBehavior: 'prompt',
};

interface ColorModalProps {
  mode: 'add' | 'edit';
  color?: CassetteColorDefinition;
  allColors: CassetteColorDefinition[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const ColorModal: React.FC<ColorModalProps> = ({ mode, color, allColors, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(color ? { ...color } : emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.key.trim()) e.key = 'Required — the stable key sent to the Engine';
    if (!draft.displayName.trim()) e.displayName = 'Required';
    if (!/^#[0-9A-Fa-f]{6}$/.test(draft.hexCode)) e.hexCode = 'Enter a real 6-digit hex code, e.g. #3B82F6';
    if (draft.fallbackBehavior === 'auto' && !draft.fallbackColorId) e.fallbackColorId = 'Required when fallback behavior is "auto" — select the real color to substitute';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave(draft);
  };

  // Real, deliberate exclusion: a color can never fall back to itself.
  const fallbackCandidates = allColors.filter(c => c.id !== color?.id);

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{mode === 'add' ? 'Add Cassette Color' : `Edit — ${color?.displayName}`}</div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Key <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.key ? 'ps-conf-input--error' : ''}`}
              value={draft.key} onChange={e => set('key', e.target.value.toUpperCase().replace(/\s+/g, '_'))} placeholder="e.g. COLOR_BIOPSY" />
            {errors.key ? <span className="ps-conf-error-text">{errors.key}</span> : <span className="ps-conf-field-hint">Sent to the Engine as-is — renaming Display Name later never breaks this.</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Display Name <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.displayName ? 'ps-conf-input--error' : ''}`}
              value={draft.displayName} onChange={e => set('displayName', e.target.value)} placeholder="e.g. Blue" />
            {errors.displayName && <span className="ps-conf-error-text">{errors.displayName}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Hex Code <span className="ps-conf-required">*</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(draft.hexCode) ? draft.hexCode : '#3B82F6'} onChange={e => set('hexCode', e.target.value)} style={{ width: 40, height: 34, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
              <input className={`ps-conf-input ${errors.hexCode ? 'ps-conf-input--error' : ''}`} style={{ flex: 1 }}
                value={draft.hexCode} onChange={e => set('hexCode', e.target.value)} placeholder="#3B82F6" />
            </div>
            {errors.hexCode && <span className="ps-conf-error-text">{errors.hexCode}</span>}
          </div>

          <div className="ps-conf-section-divider">Fallback Policy</div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">If this color's hopper is unavailable</label>
            <div className="ps-conf-toggle-row" style={{ gap: 18 }}>
              {(['auto', 'prompt'] as CassetteColorFallbackBehavior[]).map(b => (
                <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' }}>
                  <input type="radio" name="fallbackBehavior" checked={draft.fallbackBehavior === b} onChange={() => set('fallbackBehavior', b)} />
                  {b === 'auto' ? 'Auto-substitute' : 'Prompt technician'}
                </label>
              ))}
            </div>
          </div>

          {draft.fallbackBehavior === 'auto' && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="color-fallback">Substitute With <span className="ps-conf-required">*</span></label>
              <select id="color-fallback" className={`ps-conf-select ${errors.fallbackColorId ? 'ps-conf-input--error' : ''}`}
                value={draft.fallbackColorId ?? ''} onChange={e => set('fallbackColorId', e.target.value || undefined)}>
                <option value="">— Select a color —</option>
                {fallbackCandidates.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select>
              {errors.fallbackColorId && <span className="ps-conf-error-text">{errors.fallbackColorId}</span>}
            </div>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Status</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'add' ? 'Add Color' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
};

const CassetteColorsSection: React.FC = () => {
  const [colors, setColors] = useState<CassetteColorDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; color?: CassetteColorDefinition } | null>(null);

  useEffect(() => {
    mockCassetteColorService.getAll().then(res => {
      if (res.ok) setColors(res.data);
      setLoading(false);
    });
  }, []);

  const nameFor = (id?: string) => colors.find(c => c.id === id)?.displayName ?? '—';

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'add') {
      const res = await mockCassetteColorService.create(draft);
      if (res.ok) setColors(prev => [...prev, res.data]);
    } else if (modal?.color) {
      const res = await mockCassetteColorService.update(modal.color.id, draft);
      if (res.ok) setColors(prev => prev.map(c => c.id === res.data.id ? res.data : c));
    }
    setModal(null);
  };

  const handleToggleStatus = async (color: CassetteColorDefinition) => {
    const res = color.active ? await mockCassetteColorService.deactivate(color.id) : await mockCassetteColorService.reactivate(color.id);
    if (res.ok) setColors(prev => prev.map(c => c.id === color.id ? res.data : c));
  };

  if (loading) return <div className="ps-conf-loading">Loading cassette colors...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Cassette Colors</h3>
          <p className="ps-conf-section-subtitle">
            The real color dictionary Cassette Routing Rules reference by key — rename a display name here and every
            rule using it updates automatically. Fallback policy also lives here, per color, since "what to
            substitute for Blue" is a real property of Blue itself, not something each rule should decide separately.
          </p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ Add Color</button>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {['Color', 'Key', 'Fallback Policy', 'Status', 'Actions'].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {colors.map(c => (
                <tr key={c.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: c.hexCode, border: '1px solid rgba(255,255,255,0.2)' }} />
                      <span className="ps-conf-identity-name">{c.displayName}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td"><code>{c.key}</code></td>
                  <td className="ps-conf-td" style={{ fontSize: 12, color: '#94a3b8' }}>
                    {c.fallbackBehavior === 'auto' ? `Auto → ${nameFor(c.fallbackColorId)}` : 'Prompt technician'}
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${c.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${c.active ? 'ps-conf-status-text--active' : ''}`}>{c.active ? 'Active' : 'Inactive'}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', color: c })}>Edit</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(c)}>{c.active ? 'Deactivate' : 'Reactivate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {colors.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={5}>No cassette colors configured yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <ColorModal mode={modal.mode} color={modal.color} allColors={colors} onSave={handleSave} onClose={() => setModal(null)} />
      )}
    </div>
  );
};

export default CassetteColorsSection;
