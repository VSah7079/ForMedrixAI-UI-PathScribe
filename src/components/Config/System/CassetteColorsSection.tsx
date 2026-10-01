// src/components/Config/System/CassetteColorsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up's own two-layer architecture:
// "Routing Dictionary Management: Interfaces to maintain color keys,
// display names, and hex codes" and "Fallback Policy Settings." Same
// real table+modal pattern as ScanStationsSection.tsx / Cassette
// RoutingRulesSection.tsx — not a new one invented for this.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCassetteColorService } from '../../../services/cassetteColors/mockCassetteColorService';
import type { CassetteColorDefinition, CassetteColorFallbackBehavior } from '../../../services/cassetteColors/ICassetteColorService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { findDuplicate } from '../../../utils/validateUnique';
import { getActivePerformingLabs } from '../../../utils/performingLabs';

type Draft = Omit<CassetteColorDefinition, 'id' | 'createdAt' | 'updatedAt'>;

const emptyDraft: Draft = {
  key: '', displayName: '', hexCode: '#3B82F6', active: true, fallbackBehavior: 'prompt', performingLabFacilityId: undefined,
};

interface ColorModalProps {
  mode: 'add' | 'edit';
  color?: CassetteColorDefinition;
  allColors: CassetteColorDefinition[];
  labs: Facility[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const ColorModal: React.FC<ColorModalProps> = ({ mode, color, allColors, labs, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(color ? { ...color } : emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.key.trim()) e.key = t('cassetteColorsSection.modal.errors.keyRequired');
    if (!draft.displayName.trim()) e.displayName = t('common.required');
    if (!/^#[0-9A-Fa-f]{6}$/.test(draft.hexCode)) e.hexCode = t('cassetteColorsSection.modal.errors.hexCodeInvalid');
    if (draft.fallbackBehavior === 'auto' && !draft.fallbackColorId) e.fallbackColorId = t('cassetteColorsSection.modal.errors.fallbackColorRequired');
    // PS-73: key AND displayName uniqueness, each scoped by performing
    // lab (same compound-key pattern as ContainerTypesSection.tsx).
    // Both are real collision risks, not just a cosmetic dupe: `key`
    // is the identifier sent downstream to the Engine; `displayName`
    // is what a technician actually reads off the "Substitute With"
    // fallback picker, where two colors both labeled the same thing is
    // a real physical-safety ambiguity in a cassette-loading workflow.
    const excludeId = mode === 'edit' ? color?.id : undefined;
    if (draft.key.trim()) {
      const keyCollision = findDuplicate(allColors, { performingLabFacilityId: draft.performingLabFacilityId, key: draft.key.trim() }, ['performingLabFacilityId', 'key'], excludeId);
      if (keyCollision) {
        e.key = draft.performingLabFacilityId
          ? t('cassetteColorsSection.modal.errors.keyCollisionForLab', { key: keyCollision.key, name: keyCollision.displayName })
          : t('cassetteColorsSection.modal.errors.keyCollision', { key: keyCollision.key, name: keyCollision.displayName });
      }
    }
    if (draft.displayName.trim()) {
      const nameCollision = findDuplicate(allColors, { performingLabFacilityId: draft.performingLabFacilityId, displayName: draft.displayName.trim() }, ['performingLabFacilityId', 'displayName'], excludeId);
      if (nameCollision) {
        e.displayName = draft.performingLabFacilityId
          ? t('cassetteColorsSection.modal.errors.nameCollisionForLab', { name: nameCollision.displayName })
          : t('cassetteColorsSection.modal.errors.nameCollision', { name: nameCollision.displayName });
      }
    }
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
        <div className="ps-ms-header">{mode === 'add' ? t('cassetteColorsSection.modal.addTitle') : t('cassetteColorsSection.modal.editTitle', { name: color?.displayName })}</div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteColorsSection.modal.keyField')} <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.key ? 'ps-conf-input--error' : ''}`}
              value={draft.key} onChange={e => set('key', e.target.value.toUpperCase().replace(/\s+/g, '_'))} placeholder={t('cassetteColorsSection.modal.keyPlaceholder')} />
            {errors.key ? <span className="ps-conf-error-text">{errors.key}</span> : <span className="ps-conf-field-hint">{t('cassetteColorsSection.modal.keyHint')}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteColorsSection.modal.displayNameField')} <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.displayName ? 'ps-conf-input--error' : ''}`}
              value={draft.displayName} onChange={e => set('displayName', e.target.value)} placeholder={t('cassetteColorsSection.modal.displayNamePlaceholder')} />
            {errors.displayName && <span className="ps-conf-error-text">{errors.displayName}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteColorsSection.modal.hexCodeField')} <span className="ps-conf-required">*</span></label>
            <div className="ps-flex-row-gap-8">
              <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(draft.hexCode) ? draft.hexCode : '#3B82F6'} onChange={e => set('hexCode', e.target.value)} className="ps-cassclr-color-input" />
              <input className={`ps-conf-input ps-conf-input--flex ${errors.hexCode ? 'ps-conf-input--error' : ''}`}
                value={draft.hexCode} onChange={e => set('hexCode', e.target.value)} placeholder={t('cassetteColorsSection.modal.hexCodePlaceholder')} />
            </div>
            {errors.hexCode && <span className="ps-conf-error-text">{errors.hexCode}</span>}
          </div>

          <div className="ps-conf-section-divider">{t('cassetteColorsSection.modal.fallbackPolicyDivider')}</div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteColorsSection.modal.fallbackQuestionLabel')}</label>
            <div className="ps-conf-radio-group">
              {(['auto', 'prompt'] as CassetteColorFallbackBehavior[]).map(b => (
                <label key={b} className="ps-conf-radio-label">
                  <input type="radio" name="fallbackBehavior" checked={draft.fallbackBehavior === b} onChange={() => set('fallbackBehavior', b)} />
                  <span className="ps-conf-option-text">{b === 'auto' ? t('cassetteColorsSection.modal.autoSubstituteOption') : t('cassetteColorsSection.modal.promptTechnicianOption')}</span>
                </label>
              ))}
            </div>
          </div>

          {draft.fallbackBehavior === 'auto' && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="color-fallback">{t('cassetteColorsSection.modal.substituteWithField')} <span className="ps-conf-required">*</span></label>
              <select id="color-fallback" className={`ps-conf-select ${errors.fallbackColorId ? 'ps-conf-input--error' : ''}`}
                value={draft.fallbackColorId ?? ''} onChange={e => set('fallbackColorId', e.target.value || undefined)}>
                <option value="">{t('cassetteColorsSection.modal.selectColorOption')}</option>
                {fallbackCandidates.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select>
              {errors.fallbackColorId && <span className="ps-conf-error-text">{errors.fallbackColorId}</span>}
            </div>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="cassette-color-performing-lab">{t('cassetteColorsSection.modal.performingLabField')}</label>
            <select id="cassette-color-performing-lab" className="ps-conf-select"
              value={draft.performingLabFacilityId ?? ''}
              onChange={e => set('performingLabFacilityId', e.target.value || undefined)}>
              <option value="">{t('cassetteColorsSection.modal.allLabsOption')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('cassetteColorsSection.modal.statusField')}</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? t('common.active') : t('common.inactive')}</span>
            </div>
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'add' ? t('cassetteColorsSection.modal.addColorButton') : t('cassetteColorsSection.modal.saveChangesButton')}</button>
        </div>
      </div>
    </div>
  );
};

const CassetteColorsSection: React.FC = () => {
  const { t } = useTranslation();
  const [colors, setColors] = useState<CassetteColorDefinition[]>([]);
  const [labs, setLabs] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [labFilter, setLabFilter] = useState<'All' | 'Global' | string>('All');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; color?: CassetteColorDefinition } | null>(null);

  useEffect(() => {
    mockCassetteColorService.getAll().then(res => {
      if (res.ok) setColors(res.data);
      setLoading(false);
    });
    getActivePerformingLabs().then(setLabs);
  }, []);

  const nameFor = (id?: string) => colors.find(c => c.id === id)?.displayName ?? '—';
  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : t('cassetteColorsSection.allLabsLabel');

  const filteredColors = colors.filter(c => (
    labFilter === 'All' || (labFilter === 'Global' ? !c.performingLabFacilityId : c.performingLabFacilityId === labFilter)
  ));

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

  if (loading) return <div className="ps-conf-loading">{t('cassetteColorsSection.loading')}</div>;

  const headers: Array<[string, string]> = [
    ['color', t('cassetteColorsSection.headers.color')],
    ['key', t('cassetteColorsSection.headers.key')],
    ['performingLab', t('cassetteColorsSection.headers.performingLab')],
    ['fallbackPolicy', t('cassetteColorsSection.headers.fallbackPolicy')],
    ['status', t('cassetteColorsSection.headers.status')],
    ['actions', t('cassetteColorsSection.headers.actions')],
  ];

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('cassetteColorsSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('cassetteColorsSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>{t('cassetteColorsSection.addColorButton')}</button>
      </div>

      <div className="ps-conf-form-row">
        <select value={labFilter} onChange={e => setLabFilter(e.target.value)} className="ps-conf-select">
          <option value="All">{t('cassetteColorsSection.allLabsLabel')}</option>
          <option value="Global">{t('cassetteColorsSection.labFilter.globalOnly')}</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {headers.map(([key, label]) => (
                  <th key={key} className="ps-conf-th">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredColors.map(c => (
                <tr key={c.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <span className="ps-flex-row-gap-8">
                      {/* PS-73 whole-file inline-CSS sweep (Sep 2026): was
                          `style={{ background: c.hexCode }}` — a real, dynamic
                          per-row value, not something a static class can
                          express, so it stays inline, but now goes through
                          the same CSS-custom-property indirection this file's
                          sibling dictionaries already use for the identical
                          need (DelegationTypeSection.tsx's own --swatch-color/
                          --del-badge-* vars) — the real styling
                          (size/shape/border) lives in .ps-cassette-color-swatch
                          in pathscribe.css, this only ever sets the one value
                          that's genuinely per-instance. */}
                      <span className="ps-cassette-color-swatch" style={{ '--swatch-color': c.hexCode } as React.CSSProperties} />
                      <span className="ps-conf-identity-name">{c.displayName}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td"><code>{c.key}</code></td>
                  <td className="ps-conf-td">{labName(c.performingLabFacilityId)}</td>
                  <td className="ps-conf-td ps-rvu-muted-sm">
                    {c.fallbackBehavior === 'auto' ? t('cassetteColorsSection.fallback.autoSubstitute', { name: nameFor(c.fallbackColorId) }) : t('cassetteColorsSection.fallback.promptTechnician')}
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${c.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${c.active ? 'ps-conf-status-text--active' : ''}`}>{c.active ? t('common.active') : t('common.inactive')}</span>
                    </div>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', color: c })}>{t('common.edit')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleToggleStatus(c)}>{c.active ? t('common.deactivate') : t('common.reactivate')}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredColors.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>{t('cassetteColorsSection.emptyState')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <ColorModal mode={modal.mode} color={modal.color} allColors={colors} labs={labs} onSave={handleSave} onClose={() => setModal(null)} />
      )}
    </div>
  );
};

export default CassetteColorsSection;
