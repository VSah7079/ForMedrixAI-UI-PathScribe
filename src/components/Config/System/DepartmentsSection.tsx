// src/components/Config/System/DepartmentsSection.tsx
// ─────────────────────────────────────────────────────────────
// Admin config screen for the Department Dictionary
// (src/services/departments/). Migrated off the inline-style-
// constant pattern onto pathscribe.css's ps-conf-*/ps-ms-* classes,
// June 2026, same pass as PhysiciansSection.tsx.
//
// Real feature, per direct follow-up: "A regular admin can currently
// set a per-department override below the governing body's own floor
// with no guard at all." This screen already existed for every OTHER
// Department field (name, template, accession prefix, status)
// — retentionOverrideDays specifically had no UI at all until now.
// Raising a department's own retention above the current, live
// GoverningBody floor (services/governingBodies/) is free — no
// friction, since it's always safe. Going below it requires a
// separate, explicit confirmation with a required justification note
// and its own real audit log entry — the same "deliberate,
// distinguishable, logged" pattern this app already uses for
// retention holds, never the same casual input field used for
// raising it.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { departmentService } from '../../../services';
import { checkDepartmentReferences } from '../../../services/referenceCheck/referenceCheckService';
import { mockAuditService } from '../../../services/auditlog/mockAuditService';
import ConfirmModal from '../../Common/ConfirmModal';
import type { Department } from '../../../services/departments/IDepartmentService';
import { mockCaseMaskService } from '../../../services/caseRegistry/mockCaseMaskService';
import type { CaseMask } from '../../../types/config/CaseMask';
import type { RetainableMaterialType, RetentionOverrideDays } from '../../../services/retentionPolicy/RetentionPolicy';
import { MATERIAL_TYPE_LABEL, formatRetentionPeriod, getCurrentJurisdiction } from '../../../services/retentionPolicy/RetentionPolicy';
import { resolveCurrentGoverningBodyFloor } from '../../../services/retentionPolicy/resolveRetentionEligibility';

// The three Grossing Templates that exist today — see protocolShared.tsx's
// PROTOCOL_REGISTRY entries with isDiagnostic: false. Hardcoded here rather
// than fetched, same pragmatic scope call as AccessionPage's own template
// resolution; revisit if the list ever needs to come from templateService
// dynamically (e.g. once custom Grossing Templates beyond the three
// Gold Standard routes are supported).
// Stores a translation key rather than resolved display text, since this
// array lives at module scope, outside any component's render, and can't
// call useTranslation() itself — same pattern as
// SpecimenCategoriesSection.tsx's own GROSSING_TEMPLATES conversion
// (batch 70). This file's own local copy is not shared with the
// near-identical copies in SpecimenCategoriesSection.tsx and
// GrossingRouteOverridesSection.tsx — each is its own separate,
// unconverted-until-its-own-pass `const`.
const GROSSING_TEMPLATES: { id: string; labelKey: string }[] = [
  { id: 'grossing_standard_tissue', labelKey: 'departmentsSection.grossingTemplates.standardTissue' },
  { id: 'grossing_fluid_cytology',  labelKey: 'departmentsSection.grossingTemplates.fluidCytology' },
  { id: 'grossing_histology_only',  labelKey: 'departmentsSection.grossingTemplates.histologyOnly' },
];

const ALL_MATERIAL_TYPES: RetainableMaterialType[] = ['block', 'slide', 'wet_tissue'];

// ─── Modal ────────────────────────────────────────────────────────────────────
type Draft = Omit<Department, 'id' | 'status' | 'autoCreated' | 'autoCreatedAt' | 'autoCreatedNote'> & { active: boolean };

const emptyDraft: Draft = {
  name: '', description: '', defaultGrossingTemplateId: 'grossing_standard_tissue',
  active: true, retentionOverrideDays: undefined,
  directorName: undefined, cliaOrIsoNumber: undefined, headerLogoUrl: undefined,
};

/** Real, single check — which of the three material types, if any, a
 *  draft's own override values would set BELOW the given real, live
 *  floor. Empty array means every entered value is at or above the
 *  floor (or left blank, deferring to the floor entirely) — the safe,
 *  no-friction case. */
function findBelowFloorFields(
  override: RetentionOverrideDays | undefined,
  floor: Record<RetainableMaterialType, number> | undefined,
): RetainableMaterialType[] {
  if (!override || !floor) return [];
  return ALL_MATERIAL_TYPES.filter(mt => {
    const v = override[mt];
    return v != null && v < floor[mt];
  });
}

interface DepartmentModalProps {
  mode: 'add' | 'edit';
  department?: Department;
  floor?: Record<RetainableMaterialType, number>;
  onSave: (draft: Draft, belowFloorFields: RetainableMaterialType[], justification: string) => void;
  onClose: () => void;
}

const DepartmentModal: React.FC<DepartmentModalProps> = ({ mode, department, floor, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(
    department
      ? { ...department, active: department.status !== 'Inactive' }
      : emptyDraft
  );
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [retentionDays, setRetentionDays] = useState<Record<RetainableMaterialType, string>>({
    block: department?.retentionOverrideDays?.block != null ? String(department.retentionOverrideDays.block) : '',
    slide: department?.retentionOverrideDays?.slide != null ? String(department.retentionOverrideDays.slide) : '',
    wet_tissue: department?.retentionOverrideDays?.wet_tissue != null ? String(department.retentionOverrideDays.wet_tissue) : '',
  });
  const [belowFloorConfirm, setBelowFloorConfirm] = useState<{ fields: RetainableMaterialType[]; draft: Draft } | null>(null);
  const [justification, setJustification] = useState('');

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('common.required');
    if (!draft.defaultGrossingTemplateId) e.defaultGrossingTemplateId = t('common.required');
    return e;
  };

  const buildRetentionOverride = (): RetentionOverrideDays | undefined => {
    const parsed: RetentionOverrideDays = {};
    let any = false;
    for (const mt of ALL_MATERIAL_TYPES) {
      const raw = retentionDays[mt];
      if (raw.trim() === '') continue;
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) { parsed[mt] = n; any = true; }
    }
    return any ? parsed : undefined;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    const retentionOverrideDays = buildRetentionOverride();
    const finalDraft = { ...draft, retentionOverrideDays };
    const belowFloor = findBelowFloorFields(retentionOverrideDays, floor);
    if (belowFloor.length > 0) {
      setBelowFloorConfirm({ fields: belowFloor, draft: finalDraft });
      return;
    }
    onSave(finalDraft, [], '');
  };

  const confirmBelowFloor = () => {
    if (!belowFloorConfirm || !justification.trim()) return;
    onSave(belowFloorConfirm.draft, belowFloorConfirm.fields, justification.trim());
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'add' ? t('departmentsSection.modal.headerAdd') : t('departmentsSection.modal.headerEdit', { name: department?.name })}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('departmentsSection.modal.nameLabel')} <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder={t('departmentsSection.modal.namePlaceholder')} />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('departmentsSection.modal.descriptionLabel')}</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.description ?? ''} onChange={e => set('description', e.target.value)} placeholder={t('departmentsSection.modal.descriptionPlaceholder')} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="speccat-template">{t('departmentsSection.modal.templateLabel')} <span className="ps-conf-required">*</span></label>
            <select id="speccat-template" className={`ps-conf-select ${errors.defaultGrossingTemplateId ? 'ps-conf-input--error' : ''}`} value={draft.defaultGrossingTemplateId} onChange={e => set('defaultGrossingTemplateId', e.target.value)}>
              {GROSSING_TEMPLATES.map(gt => <option key={gt.id} value={gt.id}>{t(gt.labelKey)}</option>)}
            </select>
            {errors.defaultGrossingTemplateId && <span className="ps-conf-error-text">{errors.defaultGrossingTemplateId}</span>}
          </div>

          {/* Real, per direct report ("No Case Mask in the definition")
              and the full Case Mask rebuild that followed: accession
              numbering is no longer a pair of fields on Department
              itself at all — it's a real, standalone, optional
              CaseMask record (types/config/CaseMask.ts), managed
              entirely on its own screen. Real navigation, not just an
              explanation — same PATHSCRIBE_SYSTEM_NAVIGATE event
              ConfigSearchBar.tsx's own onNavigate already uses, and
              Config/System/index.tsx already listens for it regardless
              of which section dispatches it, so no setTimeout delay is
              needed here the way that cross-tab case needed. Only
              offered in edit mode — a brand-new department has no real
              scopeId (Department.id) for a CaseMask to reference yet
              until it's actually saved once. */}
          {mode === 'edit' && (
            <div className="ps-conf-form-field">
              <a
                href="#"
                onClick={e => {
                  e.preventDefault();
                  onClose();
                  window.dispatchEvent(new CustomEvent('PATHSCRIBE_SYSTEM_NAVIGATE', { detail: { section: 'case_mask_config' } }));
                }}
                className="ps-dept-casemask-link"
              >
                {t('departmentsSection.modal.caseMaskLink')}
              </a>
              <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                {t('departmentsSection.modal.caseMaskHint')}
              </p>
            </div>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('departmentsSection.modal.statusLabel')}</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? t('common.active') : t('common.inactive')}</span>
            </div>
          </div>

          {/* Real feature, per direct follow-up: retention override,
              with the current, live governing-body floor shown right
              alongside each field — raising is free; the confirmation
              step for going below only appears on Save, once we know
              the actual, final values. */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('departmentsSection.modal.retentionOverrideLabel')}</label>
            <div className="ps-participationtypes__modal-hint">
              {t('departmentsSection.modal.retentionOverrideHint')}
            </div>
            <div className="ps-conf-form-row">
              {ALL_MATERIAL_TYPES.map(mt => {
                const parsed = parseInt(retentionDays[mt], 10);
                const isBelowFloor = floor && Number.isFinite(parsed) && parsed > 0 && parsed < floor[mt];
                return (
                  <div className="ps-conf-form-field" key={mt}>
                    {/* MATERIAL_TYPE_LABEL is a shared display-label constant
                        (services/retentionPolicy/RetentionPolicy.ts) also consumed
                        by GoverningBodiesSection.tsx (batch 66) and
                        SpecimenCategoriesSection.tsx (batch 70) - left untouched
                        here too, same precedent; only the "(days)" suffix around
                        it is this component's own text. */}
                    <label className="ps-conf-label">{MATERIAL_TYPE_LABEL[mt]} {t('departmentsSection.modal.daysSuffix')}</label>
                    <input
                      className={`ps-conf-input ${isBelowFloor ? 'ps-conf-input--error' : ''}`}
                      value={retentionDays[mt]}
                      onChange={e => setRetentionDays(prev => ({ ...prev, [mt]: e.target.value }))}
                      placeholder={floor ? String(floor[mt]) : t('departmentsSection.modal.daysPlaceholder')}
                    />
                    {/* formatRetentionPeriod() (same RetentionPolicy.ts module) is a
                        service-layer function, not a component, and can't call
                        useTranslation() - its returned "N years"/"N weeks" text stays
                        English, same as every other consumer of it in this app. */}
                    <div className={`ps-speccat-days-hint ${isBelowFloor ? 'ps-speccat-days-hint--below' : ''}`}>
                      {Number.isFinite(parsed) && parsed > 0
                        ? t('departmentsSection.modal.approxPeriod', { period: formatRetentionPeriod(parsed) })
                        : floor ? t('departmentsSection.modal.floorPeriod', { period: formatRetentionPeriod(floor[mt]) }) : t('departmentsSection.modal.noFloorOnFile')}
                      {isBelowFloor && ` ${t('departmentsSection.modal.belowFloorSuffix')}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real, per PS-277 §1.2.2 gap-closing — Department was
              already the real, middle fallback tier in
              resolveFacilityPrintBranding.ts's own Facility →
              Department → Enterprise resolution (Department gained
              these three real, typed fields for exactly this reason),
              but this screen never actually exposed them to an admin —
              disclosed as a real, deliberate gap until now. Same real,
              free-text, "not validated against a format" posture as
              Facility's own equivalent fields (FacilityEditorModal.tsx). */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('departmentsSection.modal.brandingSectionTitle')}</label>
            <div className="ps-participationtypes__modal-hint">
              {t('departmentsSection.modal.brandingSectionHint')}
            </div>
            <div className="ps-conf-form-row">
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('departmentsSection.modal.brandingDirectorNameLabel')}</label>
                <input
                  className="ps-conf-input"
                  value={draft.directorName ?? ''}
                  onChange={e => set('directorName', e.target.value || undefined)}
                  placeholder={t('departmentsSection.modal.brandingDirectorNamePlaceholder')}
                />
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('departmentsSection.modal.brandingCliaOrIsoNumberLabel')}</label>
                <input
                  className="ps-conf-input"
                  value={draft.cliaOrIsoNumber ?? ''}
                  onChange={e => set('cliaOrIsoNumber', e.target.value || undefined)}
                  placeholder={t('departmentsSection.modal.brandingCliaOrIsoNumberPlaceholder')}
                />
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('departmentsSection.modal.brandingHeaderLogoUrlLabel')}</label>
                <input
                  className="ps-conf-input"
                  value={draft.headerLogoUrl ?? ''}
                  onChange={e => set('headerLogoUrl', e.target.value || undefined)}
                  placeholder={t('departmentsSection.modal.brandingHeaderLogoUrlPlaceholder')}
                />
                <div className="ps-speccat-days-hint">
                  {t('departmentsSection.modal.brandingHeaderLogoUrlHint')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? t('departmentsSection.modal.addButton') : t('departmentsSection.modal.saveButton')}
          </button>
        </div>
      </div>

      {/* Real, dedicated modal, not the shared ConfirmModal — a
          below-floor override needs a required, typed justification,
          which ConfirmModal (message + confirm/cancel only) has no
          field for. */}
      {belowFloorConfirm && (
        <div className="ps-ms-overlay ps-billing-postsignout-overlay">
          <div className="ps-ms-modal ps-speccat-belowfloor-modal">
            <div className="ps-ms-header acd-footer-status--error">⚠ {t('departmentsSection.modal.belowFloor.header')}</div>
            <div className="ps-ms-body">
              <p className="ps-speccat-belowfloor-text">
                {floor && belowFloorConfirm.fields.length === 1
                  ? t('departmentsSection.modal.belowFloor.messageWithFloor', {
                      fields: belowFloorConfirm.fields.map(f => MATERIAL_TYPE_LABEL[f]).join(` ${t('departmentsSection.modal.belowFloor.and')} `),
                      period: formatRetentionPeriod(floor[belowFloorConfirm.fields[0]]),
                    })
                  : t('departmentsSection.modal.belowFloor.message', {
                      fields: belowFloorConfirm.fields.map(f => MATERIAL_TYPE_LABEL[f]).join(` ${t('departmentsSection.modal.belowFloor.and')} `),
                    })}
              </p>
              <label className="ps-conf-label">
                {t('departmentsSection.modal.belowFloor.justificationLabel')} <span className="ps-conf-required">*</span>
              </label>
              <textarea
                className="ps-conf-input ps-conf-textarea"
                value={justification}
                onChange={e => setJustification(e.target.value)}
                placeholder={t('departmentsSection.modal.belowFloor.justificationPlaceholder')}
                rows={3}
                autoFocus
              />
            </div>
            <div className="ps-ms-footer">
              <button className="ps-ms-btn-cancel" onClick={() => setBelowFloorConfirm(null)}>{t('common.cancel')}</button>
              <button className="ps-ms-btn-apply ps-speccat-btn-danger" disabled={!justification.trim()} onClick={confirmBelowFloor}>
                {t('departmentsSection.modal.belowFloor.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main DepartmentsSection ────────────────────────────────────────────
const DepartmentsSection: React.FC = () => {
  const { t } = useTranslation();
  const [departments,   setDepartments]   = useState<Department[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive' | 'Unverified'>('All');
  const [modal,        setModal]        = useState<{ mode: 'add' | 'edit'; department?: Department } | null>(null);
  const [pendingDeactivation, setPendingDeactivation] = useState<{ draft: Draft; message: string } | null>(null);
  const [floor, setFloor] = useState<Record<RetainableMaterialType, number> | undefined>(undefined);
  // Real, per Case Mask rebuild: Department no longer carries its own
  // accessionPrefix/numberSeries — this reads the real, standalone
  // CaseMask (if any) for each department, at scopeType 'department',
  // purely to show the same "does this department have its own
  // sequence" glance the old column gave, from its own real source.
  const [caseMasksByDeptId, setCaseMasksByDeptId] = useState<Record<string, CaseMask>>({});

  useEffect(() => {
    departmentService.getAll().then(res => {
      if (res.ok) setDepartments(res.data);
      setLoading(false);
    });
    resolveCurrentGoverningBodyFloor(getCurrentJurisdiction()).then(setFloor).catch(() => {});
    mockCaseMaskService.getAllMasks().then(res => {
      if (res.ok) {
        setCaseMasksByDeptId(Object.fromEntries(
          res.data.filter(m => m.scopeType === 'department').map(m => [m.scopeId, m])
        ));
      }
    });
  }, []);

  const templateName = (id: string) => {
    const tpl = GROSSING_TEMPLATES.find(gt => gt.id === id);
    return tpl ? t(tpl.labelKey) : id;
  };

  const filtered = departments.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const persistSave = async (draft: Draft) => {
    const { active, ...rest } = draft;
    const payload = { ...rest, status: (active ? 'Active' : 'Inactive') as 'Active' | 'Inactive' };
    if (modal?.mode === 'add') {
      const res = await departmentService.add({ ...payload, autoCreated: false });
      if (res.ok) setDepartments(prev => [...prev, res.data]);
      return res.ok ? res.data : undefined;
    } else if (modal?.department) {
      const res = await departmentService.update(modal.department.id, payload);
      if (res.ok) setDepartments(prev => prev.map(c => c.id === res.data.id ? res.data : c));
      return res.ok ? res.data : undefined;
    }
    return undefined;
  };

  // Real feature, per direct follow-up: "Audit Trail Tracking" — same
  // real discipline as handleUpdateBlock's own "Foreign ID Bound"
  // entry earlier this session. caseId: null here is real and
  // correct — a Department edit isn't tied to any one case.
  const handleSave = async (draft: Draft, belowFloorFields: RetainableMaterialType[], justification: string) => {
    const wasActive = modal?.department ? modal.department.status === 'Active' : true;
    if (modal?.mode === 'edit' && modal.department && wasActive && !draft.active) {
      const refCheck = await checkDepartmentReferences(modal.department.id);
      if (refCheck.hasReferences) {
        const detail = refCheck.sources.map(s => `${s.count} ${s.label}`).join(', ');
        setPendingDeactivation({ draft, message: t('departmentsSection.deactivation.message', { detail }) });
        return;
      }
    }
    const saved = await persistSave(draft);
    if (saved && belowFloorFields.length > 0) {
      // Persisted audit-trail entry — stays English, same convention as
      // every other real audit-log detail string in this app.
      mockAuditService.logEvent({
        type: 'system', event: 'Retention Override Below Floor',
        detail: `Department "${draft.name}" — ${belowFloorFields.join(', ')} set below the current governing-body floor. Justification: ${justification}`,
        user: 'super-admin', caseId: null, confidence: null,
      }).catch(() => {});
    }
    setModal(null);
  };

  const handleVerify = async (id: string) => {
    const res = await departmentService.verify(id);
    if (res.ok) setDepartments(prev => prev.map(c => c.id === id ? res.data : c));
  };

  const confirmDeactivation = async () => {
    if (!pendingDeactivation) return;
    await persistSave(pendingDeactivation.draft);
    setPendingDeactivation(null);
  };

  if (loading) return <div className="ps-conf-loading">{t('departmentsSection.loading')}</div>;

  const tableHeaderKeys = ['department', 'defaultGrossingTemplate', 'caseMask', 'retentionOverride', 'status', 'actions'] as const;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('departmentsSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('departmentsSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>{t('departmentsSection.addDepartment')}</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder={t('departmentsSection.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">{t('departmentsSection.filters.statusAll')}</option>
          <option value="Active">{t('common.active')}</option>
          <option value="Inactive">{t('common.inactive')}</option>
          <option value="Unverified">{t('departmentsSection.filters.statusUnverified')}</option>
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {tableHeaderKeys.map(h => (
                  <th key={h} className="ps-conf-th">{t(`departmentsSection.table.headers.${h}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const belowFloorFields = findBelowFloorFields(c.retentionOverrideDays, floor);
                return (
                  <tr key={c.id} className="ps-conf-tr">
                    <td className="ps-conf-td">
                      <div className="ps-conf-identity-name">{c.name}</div>
                      {c.description && <div className="ps-conf-identity-sub">{c.description}</div>}
                    </td>
                    <td className="ps-conf-td">{templateName(c.defaultGrossingTemplateId)}</td>
                    <td className="ps-conf-td">
                      {caseMasksByDeptId[c.id]
                        ? <span className="ps-sub-system-badge" title={t('departmentsSection.table.caseMaskTooltip')}>{t('departmentsSection.table.caseMaskDefinedBadge', { prefix: caseMasksByDeptId[c.id].prefix })}</span>
                        : <span className="ps-conf-identity-sub">{t('departmentsSection.table.caseMaskNotDefined')}</span>}
                    </td>
                    <td className="ps-conf-td">
                      {c.retentionOverrideDays ? (
                        <div className="ps-ai-review-hint-label">
                          {ALL_MATERIAL_TYPES.filter(mt => c.retentionOverrideDays![mt] != null).map(mt => (
                            <div key={mt} className={belowFloorFields.includes(mt) ? 'ps-speccat-retention-row--below' : 'ps-speccat-retention-row'}>
                              {MATERIAL_TYPE_LABEL[mt]}: {formatRetentionPeriod(c.retentionOverrideDays![mt]!)}
                              {belowFloorFields.includes(mt) && ` ⚠ ${t('departmentsSection.table.belowFloorSuffix')}`}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="ps-gov-jur-hint">{t('departmentsSection.table.usesJurisdictionDefault')}</span>
                      )}
                    </td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-status-cell">
                        <span className={`ps-conf-status-dot ${c.status === 'Active' ? 'ps-conf-status-dot--active' : c.status === 'Unverified' ? 'ps-conf-status-dot--pending' : ''}`} />
                        <span className={`ps-conf-status-text ${c.status === 'Active' ? 'ps-conf-status-text--active' : c.status === 'Unverified' ? 'ps-conf-status-text--pending' : ''}`}>
                          {c.status === 'Active' ? t('common.active') : c.status === 'Inactive' ? t('common.inactive') : t('departmentsSection.filters.statusUnverified')}
                        </span>
                      </div>
                      {c.autoCreated && (
                        <div className="ps-conf-auto-note" title={c.autoCreatedNote}>
                          {c.autoCreatedAt ? t('departmentsSection.table.autoCreatedWithDate', { date: c.autoCreatedAt }) : t('departmentsSection.table.autoCreated')}
                        </div>
                      )}
                    </td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-row-actions">
                        {c.status === 'Unverified' && (
                          <button className="ps-conf-btn-verify" onClick={() => handleVerify(c.id)}>{t('departmentsSection.verify')}</button>
                        )}
                        <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', department: c })}>{t('common.edit')}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>{t('departmentsSection.noResults')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <DepartmentModal mode={modal.mode} department={modal.department} floor={floor} onSave={handleSave} onClose={() => setModal(null)} />}

      <ConfirmModal
        show={!!pendingDeactivation}
        title={t('departmentsSection.deactivation.title')}
        message={pendingDeactivation?.message ?? ''}
        confirmLabel={t('departmentsSection.deactivation.confirmLabel')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDeactivation}
        onCancel={() => setPendingDeactivation(null)}
      />
    </div>
  );
};

export default DepartmentsSection;
