// src/components/Config/System/SpecimenCategoriesSection.tsx
// ─────────────────────────────────────────────────────────────
// Admin config screen for the Specimen Category Dictionary
// (src/services/specimenCategories/). Migrated off the inline-style-
// constant pattern onto pathscribe.css's ps-conf-*/ps-ms-* classes,
// June 2026, same pass as PhysiciansSection.tsx.
//
// Real feature, per direct follow-up: "A regular admin can currently
// set a per-category override below the governing body's own floor
// with no guard at all." This screen already existed for every OTHER
// SpecimenCategory field (name, template, accession prefix, status)
// — retentionOverrideDays specifically had no UI at all until now.
// Raising a category's own retention above the current, live
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
import { specimenCategoryService } from '../../../services';
import { checkSpecimenCategoryReferences } from '../../../services/referenceCheck/referenceCheckService';
import { mockAuditService } from '../../../services/auditlog/mockAuditService';
import ConfirmModal from '../../Common/ConfirmModal';
import type { SpecimenCategory } from '../../../services/specimenCategories/ISpecimenCategoryService';
import type { RetainableMaterialType, RetentionOverrideDays } from '../../../services/retentionPolicy/RetentionPolicy';
import { MATERIAL_TYPE_LABEL, formatRetentionPeriod, getCurrentJurisdiction } from '../../../services/retentionPolicy/RetentionPolicy';
import { resolveCurrentGoverningBodyFloor } from '../../../services/retentionPolicy/resolveRetentionEligibility';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { findDuplicate } from '../../../utils/validateUnique';
import { getActivePerformingLabs } from '../../../utils/performingLabs';

// The three Grossing Templates that exist today — see protocolShared.tsx's
// PROTOCOL_REGISTRY entries with isDiagnostic: false. Hardcoded here rather
// than fetched, same pragmatic scope call as AccessionPage's own template
// resolution; revisit if the list ever needs to come from templateService
// dynamically (e.g. once custom Grossing Templates beyond the three
// Gold Standard routes are supported).
// Stores a translation key rather than resolved display text, since this
// array lives at module scope, outside any component's render, and can't
// call useTranslation() itself — the same pattern GROSSING_TEMPLATES'
// own sibling copies (DepartmentsSection.tsx, GrossingRouteOverridesSection.tsx)
// still use raw `name` text; each is its own separate, unconverted local
// const (not a shared import), so converting this file's copy doesn't
// touch those others — same "each own copy, own pass" precedent already
// applied to the duplicated 5-name-prefix `<option>` list (batch 65 note).
const GROSSING_TEMPLATES: { id: string; labelKey: string }[] = [
  { id: 'grossing_standard_tissue', labelKey: 'specimenCategoriesSection.grossingTemplates.standardTissue' },
  { id: 'grossing_fluid_cytology',  labelKey: 'specimenCategoriesSection.grossingTemplates.fluidCytology' },
  { id: 'grossing_histology_only',  labelKey: 'specimenCategoriesSection.grossingTemplates.histologyOnly' },
];

const ALL_MATERIAL_TYPES: RetainableMaterialType[] = ['block', 'slide', 'wet_tissue'];

// ─── Modal ────────────────────────────────────────────────────────────────────
type Draft = Omit<SpecimenCategory, 'id' | 'status' | 'autoCreated' | 'autoCreatedAt' | 'autoCreatedNote'> & { active: boolean };

const emptyDraft: Draft = {
  name: '', description: '', defaultGrossingTemplateId: 'grossing_standard_tissue',
  accessionPrefix: 'O', numberSeries: '', active: true, retentionOverrideDays: undefined,
  performingLabFacilityId: undefined,
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

interface CategoryModalProps {
  mode: 'add' | 'edit';
  category?: SpecimenCategory;
  existingEntries: SpecimenCategory[];
  labs: Facility[];
  floor?: Record<RetainableMaterialType, number>;
  onSave: (draft: Draft, belowFloorFields: RetainableMaterialType[], justification: string) => void;
  onClose: () => void;
}

const CategoryModal: React.FC<CategoryModalProps> = ({ mode, category, existingEntries, labs, floor, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(
    category
      ? { ...category, active: category.status !== 'Inactive' }
      : emptyDraft
  );
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [retentionDays, setRetentionDays] = useState<Record<RetainableMaterialType, string>>({
    block: category?.retentionOverrideDays?.block != null ? String(category.retentionOverrideDays.block) : '',
    slide: category?.retentionOverrideDays?.slide != null ? String(category.retentionOverrideDays.slide) : '',
    wet_tissue: category?.retentionOverrideDays?.wet_tissue != null ? String(category.retentionOverrideDays.wet_tissue) : '',
  });
  const [belowFloorConfirm, setBelowFloorConfirm] = useState<{ fields: RetainableMaterialType[]; draft: Draft } | null>(null);
  const [justification, setJustification] = useState('');

  const set = (k: keyof Draft, v: any) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('common.required');
    if (!draft.defaultGrossingTemplateId) e.defaultGrossingTemplateId = t('common.required');
    // PS-73: name uniqueness, scoped by performing lab — same
    // compound-key pattern as ContainerTypesSection.tsx. Real
    // justification, not a guess: mockSpecimenCategoryService's own
    // findOrCreateByName already treats `name` as a de facto
    // case-insensitive unique key for order-intake auto-creation, so
    // letting an admin create a second category with the same name
    // here would just be a collision that logic doesn't expect.
    const excludeId = mode === 'edit' ? category?.id : undefined;
    if (draft.name.trim()) {
      const nameCollision = findDuplicate(existingEntries, { performingLabFacilityId: draft.performingLabFacilityId, name: draft.name.trim() }, ['performingLabFacilityId', 'name'], excludeId);
      if (nameCollision) {
        e.name = draft.performingLabFacilityId
          ? t('specimenCategoriesSection.modal.nameCollisionScoped', { name: nameCollision.name })
          : t('specimenCategoriesSection.modal.nameCollision', { name: nameCollision.name });
      }
    }
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
          {mode === 'add' ? t('specimenCategoriesSection.modal.headerAdd') : t('specimenCategoriesSection.modal.headerEdit', { name: category?.name })}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('specimenCategoriesSection.modal.nameLabel')} <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder={t('specimenCategoriesSection.modal.namePlaceholder')} />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('specimenCategoriesSection.modal.descriptionLabel')}</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.description ?? ''} onChange={e => set('description', e.target.value)} placeholder={t('specimenCategoriesSection.modal.descriptionPlaceholder')} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="speccat-template">{t('specimenCategoriesSection.modal.templateLabel')} <span className="ps-conf-required">*</span></label>
            <select id="speccat-template" className={`ps-conf-select ${errors.defaultGrossingTemplateId ? 'ps-conf-input--error' : ''}`} value={draft.defaultGrossingTemplateId} onChange={e => set('defaultGrossingTemplateId', e.target.value)}>
              {GROSSING_TEMPLATES.map(gt => <option key={gt.id} value={gt.id}>{t(gt.labelKey)}</option>)}
            </select>
            {errors.defaultGrossingTemplateId && <span className="ps-conf-error-text">{errors.defaultGrossingTemplateId}</span>}
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenCategoriesSection.modal.accessionPrefixLabel')}</label>
              <input className="ps-conf-input" value={draft.accessionPrefix ?? ''} onChange={e => set('accessionPrefix', e.target.value.toUpperCase())} placeholder={t('specimenCategoriesSection.modal.accessionPrefixPlaceholder')} maxLength={3} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenCategoriesSection.modal.numberingSeriesLabel')}</label>
              <input className="ps-conf-input" value={draft.numberSeries ?? ''} onChange={e => set('numberSeries', e.target.value)} placeholder={t('specimenCategoriesSection.modal.numberingSeriesPlaceholder')} />
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="speccat-performing-lab">{t('specimenCategoriesSection.modal.performingLabLabel')}</label>
            <select id="speccat-performing-lab" className="ps-conf-select"
              value={draft.performingLabFacilityId ?? ''}
              onChange={e => set('performingLabFacilityId', e.target.value || undefined)}>
              <option value="">{t('specimenCategoriesSection.modal.allLabsOption')}</option>
              {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('specimenCategoriesSection.modal.statusLabel')}</label>
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
            <label className="ps-conf-label">{t('specimenCategoriesSection.modal.retentionOverrideLabel')}</label>
            <div className="ps-participationtypes__modal-hint">
              {t('specimenCategoriesSection.modal.retentionOverrideHint')}
            </div>
            <div className="ps-conf-form-row">
              {ALL_MATERIAL_TYPES.map(mt => {
                const parsed = parseInt(retentionDays[mt], 10);
                const isBelowFloor = floor && Number.isFinite(parsed) && parsed > 0 && parsed < floor[mt];
                return (
                  <div className="ps-conf-form-field" key={mt}>
                    {/* MATERIAL_TYPE_LABEL is a shared display-label constant
                        (services/retentionPolicy/RetentionPolicy.ts) also consumed
                        by GoverningBodiesSection.tsx (batch 66) - left untouched
                        here too, same precedent; only the "(days)" suffix around
                        it is this component's own text. */}
                    <label className="ps-conf-label">{MATERIAL_TYPE_LABEL[mt]} {t('specimenCategoriesSection.modal.daysSuffix')}</label>
                    <input
                      className={`ps-conf-input ${isBelowFloor ? 'ps-conf-input--error' : ''}`}
                      value={retentionDays[mt]}
                      onChange={e => setRetentionDays(prev => ({ ...prev, [mt]: e.target.value }))}
                      placeholder={floor ? String(floor[mt]) : t('specimenCategoriesSection.modal.daysPlaceholder')}
                    />
                    {/* formatRetentionPeriod() (same RetentionPolicy.ts module) is a
                        service-layer function, not a component, and can't call
                        useTranslation() - its returned "N years"/"N weeks" text stays
                        English, same as every other consumer of it in this app. */}
                    <div className={`ps-speccat-days-hint ${isBelowFloor ? 'ps-speccat-days-hint--below' : ''}`}>
                      {Number.isFinite(parsed) && parsed > 0
                        ? t('specimenCategoriesSection.modal.approxPeriod', { period: formatRetentionPeriod(parsed) })
                        : floor ? t('specimenCategoriesSection.modal.floorPeriod', { period: formatRetentionPeriod(floor[mt]) }) : t('specimenCategoriesSection.modal.noFloorOnFile')}
                      {isBelowFloor && ` ${t('specimenCategoriesSection.modal.belowFloorSuffix')}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? t('specimenCategoriesSection.modal.addButton') : t('specimenCategoriesSection.modal.saveButton')}
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
            <div className="ps-ms-header acd-footer-status--error">⚠ {t('specimenCategoriesSection.modal.belowFloor.header')}</div>
            <div className="ps-ms-body">
              <p className="ps-speccat-belowfloor-text">
                {floor && belowFloorConfirm.fields.length === 1
                  ? t('specimenCategoriesSection.modal.belowFloor.messageWithFloor', {
                      fields: belowFloorConfirm.fields.map(f => MATERIAL_TYPE_LABEL[f]).join(` ${t('specimenCategoriesSection.modal.belowFloor.and')} `),
                      period: formatRetentionPeriod(floor[belowFloorConfirm.fields[0]]),
                    })
                  : t('specimenCategoriesSection.modal.belowFloor.message', {
                      fields: belowFloorConfirm.fields.map(f => MATERIAL_TYPE_LABEL[f]).join(` ${t('specimenCategoriesSection.modal.belowFloor.and')} `),
                    })}
              </p>
              <label className="ps-conf-label">
                {t('specimenCategoriesSection.modal.belowFloor.justificationLabel')} <span className="ps-conf-required">*</span>
              </label>
              <textarea
                className="ps-conf-input ps-conf-textarea"
                value={justification}
                onChange={e => setJustification(e.target.value)}
                placeholder={t('specimenCategoriesSection.modal.belowFloor.justificationPlaceholder')}
                rows={3}
                autoFocus
              />
            </div>
            <div className="ps-ms-footer">
              <button className="ps-ms-btn-cancel" onClick={() => setBelowFloorConfirm(null)}>{t('common.cancel')}</button>
              <button className="ps-ms-btn-apply ps-speccat-btn-danger" disabled={!justification.trim()} onClick={confirmBelowFloor}>
                {t('specimenCategoriesSection.modal.belowFloor.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main SpecimenCategoriesSection ────────────────────────────────────────────
const SpecimenCategoriesSection: React.FC = () => {
  const { t } = useTranslation();
  const [categories,   setCategories]   = useState<SpecimenCategory[]>([]);
  const [labs,         setLabs]         = useState<Facility[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive' | 'Unverified'>('All');
  const [labFilter,    setLabFilter]    = useState<'All' | 'Global' | string>('All');
  const [modal,        setModal]        = useState<{ mode: 'add' | 'edit'; category?: SpecimenCategory } | null>(null);
  const [pendingDeactivation, setPendingDeactivation] = useState<{ draft: Draft; message: string } | null>(null);
  const [floor, setFloor] = useState<Record<RetainableMaterialType, number> | undefined>(undefined);

  useEffect(() => {
    specimenCategoryService.getAll().then(res => {
      if (res.ok) setCategories(res.data);
      setLoading(false);
    });
    resolveCurrentGoverningBodyFloor(getCurrentJurisdiction()).then(setFloor).catch(() => {});
    getActivePerformingLabs().then(setLabs);
  }, []);

  const templateName = (id: string) => {
    const tpl = GROSSING_TEMPLATES.find(gt => gt.id === id);
    return tpl ? t(tpl.labelKey) : id;
  };
  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : t('specimenCategoriesSection.filters.labAll');

  const filtered = categories.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || c.status === statusFilter;
    const matchLab = labFilter === 'All'
      || (labFilter === 'Global' ? !c.performingLabFacilityId : c.performingLabFacilityId === labFilter);
    return matchSearch && matchStatus && matchLab;
  });

  const persistSave = async (draft: Draft) => {
    const { active, ...rest } = draft;
    const payload = { ...rest, status: (active ? 'Active' : 'Inactive') as 'Active' | 'Inactive' };
    if (modal?.mode === 'add') {
      const res = await specimenCategoryService.add({ ...payload, autoCreated: false });
      if (res.ok) setCategories(prev => [...prev, res.data]);
      return res.ok ? res.data : undefined;
    } else if (modal?.category) {
      const res = await specimenCategoryService.update(modal.category.id, payload);
      if (res.ok) setCategories(prev => prev.map(c => c.id === res.data.id ? res.data : c));
      return res.ok ? res.data : undefined;
    }
    return undefined;
  };

  // Real feature, per direct follow-up: "Audit Trail Tracking" — same
  // real discipline as handleUpdateBlock's own "Foreign ID Bound"
  // entry earlier this session. caseId: null here is real and
  // correct — a SpecimenCategory edit isn't tied to any one case.
  const handleSave = async (draft: Draft, belowFloorFields: RetainableMaterialType[], justification: string) => {
    const wasActive = modal?.category ? modal.category.status === 'Active' : true;
    if (modal?.mode === 'edit' && modal.category && wasActive && !draft.active) {
      const refCheck = await checkSpecimenCategoryReferences(modal.category.id);
      if (refCheck.hasReferences) {
        const detail = refCheck.sources.map(s => `${s.count} ${s.label}`).join(', ');
        setPendingDeactivation({ draft, message: t('specimenCategoriesSection.deactivation.message', { detail }) });
        return;
      }
    }
    const saved = await persistSave(draft);
    if (saved && belowFloorFields.length > 0) {
      // Persisted audit-trail entry — stays English, same convention as
      // every other real audit-log detail string in this app.
      mockAuditService.logEvent({
        type: 'system', event: 'Retention Override Below Floor',
        detail: `Category "${draft.name}" — ${belowFloorFields.join(', ')} set below the current governing-body floor. Justification: ${justification}`,
        user: 'super-admin', caseId: null, confidence: null,
      }).catch(() => {});
    }
    setModal(null);
  };

  const handleVerify = async (id: string) => {
    const res = await specimenCategoryService.verify(id);
    if (res.ok) setCategories(prev => prev.map(c => c.id === id ? res.data : c));
  };

  const confirmDeactivation = async () => {
    if (!pendingDeactivation) return;
    await persistSave(pendingDeactivation.draft);
    setPendingDeactivation(null);
  };

  if (loading) return <div className="ps-conf-loading">{t('specimenCategoriesSection.loading')}</div>;

  const tableHeaderKeys = ['category', 'defaultGrossingTemplate', 'accessionPrefix', 'performingLab', 'retentionOverride', 'status', 'actions'] as const;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('specimenCategoriesSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('specimenCategoriesSection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>{t('specimenCategoriesSection.addCategory')}</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder={t('specimenCategoriesSection.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">{t('specimenCategoriesSection.filters.statusAll')}</option>
          <option value="Active">{t('common.active')}</option>
          <option value="Inactive">{t('common.inactive')}</option>
          <option value="Unverified">{t('specimenCategoriesSection.filters.statusUnverified')}</option>
        </select>
        <select value={labFilter} onChange={e => setLabFilter(e.target.value)} className="ps-conf-select">
          <option value="All">{t('specimenCategoriesSection.filters.labAll')}</option>
          <option value="Global">{t('specimenCategoriesSection.filters.labGlobalOnly')}</option>
          {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {tableHeaderKeys.map(h => (
                  <th key={h} className="ps-conf-th">{t(`specimenCategoriesSection.table.headers.${h}`)}</th>
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
                      {c.accessionPrefix ?? '—'}
                      {c.numberSeries
                        ? <span className="ps-sub-system-badge" title={t('specimenCategoriesSection.table.ownSequenceTooltip')}>{t('specimenCategoriesSection.table.ownSequenceBadge', { series: c.numberSeries })}</span>
                        : c.accessionPrefix && <span className="ps-sub-system-badge">{t('specimenCategoriesSection.table.sharesSequenceBadge')}</span>}
                    </td>
                    <td className="ps-conf-td">{labName(c.performingLabFacilityId)}</td>
                    <td className="ps-conf-td">
                      {c.retentionOverrideDays ? (
                        <div className="ps-ai-review-hint-label">
                          {ALL_MATERIAL_TYPES.filter(mt => c.retentionOverrideDays![mt] != null).map(mt => (
                            <div key={mt} className={belowFloorFields.includes(mt) ? 'ps-speccat-retention-row--below' : 'ps-speccat-retention-row'}>
                              {MATERIAL_TYPE_LABEL[mt]}: {formatRetentionPeriod(c.retentionOverrideDays![mt]!)}
                              {belowFloorFields.includes(mt) && ` ⚠ ${t('specimenCategoriesSection.table.belowFloorSuffix')}`}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="ps-gov-jur-hint">{t('specimenCategoriesSection.table.usesJurisdictionDefault')}</span>
                      )}
                    </td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-status-cell">
                        <span className={`ps-conf-status-dot ${c.status === 'Active' ? 'ps-conf-status-dot--active' : c.status === 'Unverified' ? 'ps-conf-status-dot--pending' : ''}`} />
                        <span className={`ps-conf-status-text ${c.status === 'Active' ? 'ps-conf-status-text--active' : c.status === 'Unverified' ? 'ps-conf-status-text--pending' : ''}`}>
                          {c.status === 'Active' ? t('common.active') : c.status === 'Inactive' ? t('common.inactive') : t('specimenCategoriesSection.filters.statusUnverified')}
                        </span>
                      </div>
                      {c.autoCreated && (
                        <div className="ps-conf-auto-note" title={c.autoCreatedNote}>
                          {c.autoCreatedAt ? t('specimenCategoriesSection.table.autoCreatedWithDate', { date: c.autoCreatedAt }) : t('specimenCategoriesSection.table.autoCreated')}
                        </div>
                      )}
                    </td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-row-actions">
                        {c.status === 'Unverified' && (
                          <button className="ps-conf-btn-verify" onClick={() => handleVerify(c.id)}>{t('specimenCategoriesSection.verify')}</button>
                        )}
                        <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', category: c })}>{t('common.edit')}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={7}>{t('specimenCategoriesSection.noResults')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <CategoryModal mode={modal.mode} category={modal.category} existingEntries={categories} labs={labs} floor={floor} onSave={handleSave} onClose={() => setModal(null)} />}

      <ConfirmModal
        show={!!pendingDeactivation}
        title={t('specimenCategoriesSection.deactivation.title')}
        message={pendingDeactivation?.message ?? ''}
        confirmLabel={t('specimenCategoriesSection.deactivation.confirmLabel')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDeactivation}
        onCancel={() => setPendingDeactivation(null)}
      />
    </div>
  );
};

export default SpecimenCategoriesSection;
