// src/components/Config/System/CaseMaskConfigSection.tsx
// ─────────────────────────────────────────────────────────────
// Real admin UI for CaseMask (types/config/CaseMask.ts,
// services/caseRegistry/). Full rebuild, per direct guidance across a
// real, extended conversation:
//
//   - Original screen only ever showed one organisation's single
//     CaseMaskConfig at a time, with Facility/Department variation
//     buried in override fields the screen barely surfaced — "Seems
//     off... we should see a list of defined Case Mask Configurations
//     Grouped by Facility and Department."
//   - Confirmed directly this app has two real, unconnected "location"
//     hierarchies — Organisation/Site (services/organisation/, no real
//     admin UI, hardcoded seed data) and Facility (services/
//     facilities/, real persistence + real admin UI, with roles and a
//     parentId → isEnterprise hierarchy). Per direct guidance ("a site
//     is a Facility that does testing... a Facility that actually has
//     an attached laboratory is defined as a Facility - Performing
//     Lab"), this screen is built entirely on Facility, never Site.
//   - "Change the data model so each Facility/Department can have its
//     own fully independent, separately-saved mask config" — no more
//     override merging. Each CaseMask below is a real, complete,
//     independently-owned record.
//   - "Only Enterprise-tagged facilities appear as selectable Parent
//     Institutions" confirmed there's no separate "Enterprise" entity
//     — it's a Facility with isEnterprise: true, reached from any
//     other Facility by a single parentId hop.
//
// Site/Organisation itself is untouched by this rebuild — real,
// separate, future work, per direct guidance ("we cannot have
// hardcode values like that... [but] finish Case Mask now, then scope
// the larger replacement").
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { mockCaseMaskService } from '@/services/caseRegistry/mockCaseMaskService';
import type { CaseMask, CaseMaskScopeType } from '@/types/config/CaseMask';
import { DEFAULT_FALLBACK_PREFIX, DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_SEQUENCE_DIGITS } from '@/types/config/CaseMask';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { departmentService } from '@/services';
import type { Department } from '@/services/departments/IDepartmentService';
import { mockFacilityService, type Facility } from '@/services/facilities/mockFacilityService';
import { renderCaseMask } from '@/services/caseRegistry/renderCaseMask';

// Real i18n keys, not raw strings — SCOPE_LABEL_KEY is the Title Case
// form (dropdown options, headers, modal field labels); SCOPE_LABEL_LOWER_KEY
// is a separately-authored lowercase/mid-sentence form rather than a
// JS .toLowerCase() of the translated string, since case-folding an
// already-translated noun is wrong for languages that don't lowercase
// nouns the way English does (e.g. German keeps "Abteilung" capitalized
// regardless of sentence position).
const SCOPE_LABEL_KEY: Record<CaseMaskScopeType, string> = {
  enterprise: 'caseMaskConfigSection.scopeLabels.enterprise',
  facility: 'caseMaskConfigSection.scopeLabels.facility',
  department: 'caseMaskConfigSection.scopeLabels.department',
};
const SCOPE_LABEL_LOWER_KEY: Record<CaseMaskScopeType, string> = {
  enterprise: 'caseMaskConfigSection.scopeLabelsLower.enterprise',
  facility: 'caseMaskConfigSection.scopeLabelsLower.facility',
  department: 'caseMaskConfigSection.scopeLabelsLower.department',
};

interface CaseMaskModalProps {
  mode: 'add' | 'edit';
  mask?: CaseMask;
  departments: Department[];
  performingLabFacilities: Facility[];
  enterpriseFacilities: Facility[];
  existingScopeKeys: Set<string>;
  onSave: (mask: CaseMask) => void;
  onClose: () => void;
}

const CaseMaskModal: React.FC<CaseMaskModalProps> = ({ mode, mask, departments, performingLabFacilities, enterpriseFacilities, existingScopeKeys, onSave, onClose }) => {
  const { t } = useTranslation();
  const [scopeType, setScopeType] = useState<CaseMaskScopeType>(mask?.scopeType ?? 'department');
  const [scopeId, setScopeId] = useState(mask?.scopeId ?? '');
  const [prefix, setPrefix] = useState(mask?.prefix ?? '');
  const [maskPattern, setMaskPattern] = useState(mask?.maskPattern ?? DEFAULT_FALLBACK_MASK);
  const [sequenceDigits, setSequenceDigits] = useState(String(mask?.sequenceDigits ?? DEFAULT_FALLBACK_SEQUENCE_DIGITS));
  const [resetSequenceAnnually, setResetSequenceAnnually] = useState(mask?.resetSequenceAnnually ?? true);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeOptions = useMemo(() => {
    if (scopeType === 'department') return departments.map(d => ({ id: d.id, name: d.name }));
    if (scopeType === 'facility') return performingLabFacilities.map(f => ({ id: f.id, name: f.name }));
    return enterpriseFacilities.map(f => ({ id: f.id, name: f.name }));
  }, [scopeType, departments, performingLabFacilities, enterpriseFacilities]);

  // Real scope points that already have their own CaseMask can't be
  // picked again from Add — Edit is how you change an existing one;
  // Add is only ever for a genuinely new scope. Editing an existing
  // mask always keeps its own current scope selectable.
  const availableOptions = scopeOptions.filter(o => o.id === scopeId || !existingScopeKeys.has(`${scopeType}::${o.id}`));

  const runPreview = async () => {
    if (!scopeId || !prefix.trim() || !maskPattern.trim()) return;
    setBusy(true);
    const digits = Number(sequenceDigits) || DEFAULT_FALLBACK_SEQUENCE_DIGITS;
    const seq = (mask?.currentSequence ?? 0) + 1;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const rendered = renderCaseMask(maskPattern.trim(), prefix.trim(), seq, digits, timezone);
    setBusy(false);
    setPreview(rendered);
  };

  const handleSave = async () => {
    if (!scopeId) { setError(t('caseMaskConfigSection.modal.errors.scopeRequired')); return; }
    const digits = Number(sequenceDigits);
    if (!prefix.trim()) { setError(t('caseMaskConfigSection.modal.errors.prefixRequired')); return; }
    if (!maskPattern.trim()) { setError(t('caseMaskConfigSection.modal.errors.maskPatternRequired')); return; }
    if (!digits || digits < 1) { setError(t('caseMaskConfigSection.modal.errors.sequenceDigitsInvalid')); return; }

    setBusy(true);
    const draft: CaseMask = {
      id: scopeId,
      scopeType,
      scopeId,
      prefix: prefix.trim(),
      maskPattern: maskPattern.trim(),
      sequenceDigits: digits,
      // Real, deliberate: never resets currentSequence here — changing
      // the mask pattern shouldn't silently restart numbering.
      currentSequence: mask?.currentSequence ?? 0,
      resetSequenceAnnually,
      lastResetYear: mask?.lastResetYear,
      updatedBy: getSessionUser()?.id ?? 'admin',
      updatedAt: new Date().toISOString(),
    };
    const res = await mockCaseMaskService.saveMask(draft);
    setBusy(false);
    if (res.ok === false) { setError(res.error); return; }
    onSave(res.data);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'add' ? t('caseMaskConfigSection.modal.addTitle') : t('caseMaskConfigSection.modal.editTitle', { scope: t(SCOPE_LABEL_KEY[scopeType]) })}
        </div>

        <div className="ps-ms-body">
          {error && <p className="ps-conf-error-text">{error}</p>}

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('caseMaskConfigSection.modal.scopeLabel')} <span className="ps-conf-required">*</span></label>
              <select className="ps-conf-select" value={scopeType} disabled={mode === 'edit'}
                onChange={e => { setScopeType(e.target.value as CaseMaskScopeType); setScopeId(''); }}>
                <option value="department">{t('caseMaskConfigSection.modal.scopeTypeOptions.department')}</option>
                <option value="facility">{t('caseMaskConfigSection.modal.scopeTypeOptions.facility')}</option>
                <option value="enterprise">{t('caseMaskConfigSection.modal.scopeTypeOptions.enterprise')}</option>
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t(SCOPE_LABEL_KEY[scopeType])} <span className="ps-conf-required">*</span></label>
              <select className="ps-conf-select" value={scopeId} disabled={mode === 'edit'} onChange={e => setScopeId(e.target.value)}>
                <option value="">{t('caseMaskConfigSection.modal.selectScopePlaceholder', { scope: t(SCOPE_LABEL_LOWER_KEY[scopeType]) })}</option>
                {availableOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {scopeType === 'facility' && availableOptions.length === 0 && (
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                  {t('caseMaskConfigSection.modal.allFacilitiesConfigured')}
                </p>
              )}
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('caseMaskConfigSection.modal.prefixLabel')} <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder={t('caseMaskConfigSection.modal.prefixPlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('caseMaskConfigSection.modal.sequenceDigitsLabel')} <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" type="number" min="1" value={sequenceDigits} onChange={e => setSequenceDigits(e.target.value)} />
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('caseMaskConfigSection.modal.maskPatternLabel')} <span className="ps-conf-required">*</span></label>
            <input className="ps-conf-input" value={maskPattern} onChange={e => setMaskPattern(e.target.value)} />
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">{t('caseMaskConfigSection.modal.tokenHelp')}</p>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">
              <input type="checkbox" checked={resetSequenceAnnually} onChange={e => setResetSequenceAnnually(e.target.checked)} />
              {' '}{t('caseMaskConfigSection.modal.resetAnnuallyLabel')}
            </label>
          </div>

          <div className="ps-conf-form-row">
            <button className="ps-conf-btn-secondary" onClick={runPreview} disabled={busy || !scopeId}>{t('caseMaskConfigSection.modal.previewButton')}</button>
            {preview && (
              <span className="ps-conf-section-subtitle">
                <Trans i18nKey="caseMaskConfigSection.modal.previewResult" values={{ preview }} components={{ value: <span className="ps-conf-identity-name" /> }} />
              </span>
            )}
          </div>

          {mask && (
            <p className="ps-conf-section-subtitle">
              {t('caseMaskConfigSection.modal.currentSequenceLabel', { count: mask.currentSequence })}
              {mask.lastResetYear ? t('caseMaskConfigSection.modal.lastResetLabel', { year: mask.lastResetYear }) : ''}
              {t('caseMaskConfigSection.modal.lastUpdatedLabel', { user: mask.updatedBy, date: new Date(mask.updatedAt).toLocaleDateString() })}
            </p>
          )}
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={handleSave} disabled={busy}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
};

const CaseMaskConfigSection: React.FC = () => {
  const { t } = useTranslation();
  const [masks, setMasks] = useState<CaseMask[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; mask?: CaseMask } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      mockCaseMaskService.getAllMasks(),
      departmentService.getAll(),
      mockFacilityService.getAll(),
    ]).then(([masksRes, deptRes, facRes]) => {
      setLoading(false);
      if (masksRes.ok) setMasks(masksRes.data);
      if (deptRes.ok) setDepartments(deptRes.data.filter(d => d.status === 'Active'));
      if (facRes.ok) setFacilities(facRes.data.filter(f => f.status === 'Active'));
    });
  };
  useEffect(loadAll, []);

  // Only a Facility with the performing_lab role ever generates its
  // own accession numbers — a pure submitting/ordering facility's own
  // specimens get numbered by whichever real performing lab receives
  // them. Confirmed directly: "a site is a Facility that does
  // testing... a Facility - Performing Lab."
  const performingLabFacilities = useMemo(() => facilities.filter(f => f.roles.includes('performing_lab')), [facilities]);
  // Enterprise isn't a separate entity — same real Facility list,
  // filtered to isEnterprise: true, same real check
  // FacilityEditorModal.tsx's own Parent Enterprise picker uses.
  const enterpriseFacilities = useMemo(() => facilities.filter(f => f.isEnterprise), [facilities]);

  const departmentsById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments]);
  const facilitiesById = useMemo(() => new Map(facilities.map(f => [f.id, f])), [facilities]);

  const nameFor = (mask: CaseMask): string => {
    if (mask.scopeType === 'department') return departmentsById.get(mask.scopeId)?.name ?? mask.scopeId;
    return facilitiesById.get(mask.scopeId)?.name ?? mask.scopeId;
  };

  const existingScopeKeys = useMemo(() => new Set(masks.map(m => `${m.scopeType}::${m.scopeId}`)), [masks]);

  const grouped: Record<CaseMaskScopeType, CaseMask[]> = {
    enterprise: masks.filter(m => m.scopeType === 'enterprise'),
    facility: masks.filter(m => m.scopeType === 'facility'),
    department: masks.filter(m => m.scopeType === 'department'),
  };

  const handleDelete = async (mask: CaseMask) => {
    const res = await mockCaseMaskService.deleteMask(mask.scopeType, mask.scopeId);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    setErrorMsg(null);
    loadAll();
  };

  if (loading) return <div className="ps-conf-loading">{t('caseMaskConfigSection.loading')}</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('caseMaskConfigSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('caseMaskConfigSection.subtitle', { prefix: DEFAULT_FALLBACK_PREFIX })}
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>{t('caseMaskConfigSection.addButton')}</button>
      </div>

      {errorMsg && <p className="ps-conf-error-text">{errorMsg}</p>}

      {(['enterprise', 'facility', 'department'] as CaseMaskScopeType[]).map(scopeType => (
        <div key={scopeType} className="ps-mt-20">
          <h4 className="ps-conf-section-title ps-conf-section-title--sm">{t(SCOPE_LABEL_KEY[scopeType])}</h4>
          {grouped[scopeType].length === 0 ? (
            <p className="ps-conf-section-subtitle">{t('caseMaskConfigSection.emptyState', { scope: t(SCOPE_LABEL_LOWER_KEY[scopeType]) })}</p>
          ) : (
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr>{[
                  t(SCOPE_LABEL_KEY[scopeType]),
                  t('caseMaskConfigSection.headers.prefix'),
                  t('caseMaskConfigSection.headers.maskPattern'),
                  t('caseMaskConfigSection.headers.currentSequence'),
                  t('caseMaskConfigSection.headers.resetAnnually'),
                  t('caseMaskConfigSection.headers.actions'),
                ].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {grouped[scopeType].map(mask => (
                  <tr key={mask.id}>
                    <td className="ps-conf-td">{nameFor(mask)}</td>
                    <td className="ps-conf-td">{mask.prefix}</td>
                    <td className="ps-conf-td">{mask.maskPattern}</td>
                    <td className="ps-conf-td">{mask.currentSequence}</td>
                    <td className="ps-conf-td">{mask.resetSequenceAnnually ? t('common.yes') : t('common.no')}</td>
                    <td className="ps-conf-td">
                      <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', mask })}>{t('common.edit')}</button>
                      {' '}
                      <button className="ps-conf-btn-secondary" onClick={() => handleDelete(mask)}>{t('common.delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {modal && (
        <CaseMaskModal
          mode={modal.mode}
          mask={modal.mask}
          departments={departments}
          performingLabFacilities={performingLabFacilities}
          enterpriseFacilities={enterpriseFacilities}
          existingScopeKeys={existingScopeKeys}
          onSave={() => { setModal(null); loadAll(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default CaseMaskConfigSection;
