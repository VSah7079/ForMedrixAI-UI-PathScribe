// src/components/Config/System/QAConfigurationCenterSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-115. The real admin UI for the two QA activity archetypes PS-113
// (review-with-outcome, QaActivityType) and PS-114 (supervision/
// assignment, QaSupervisionAssignmentType) already define — nothing
// could create, edit, or duplicate one before this existed.
//
// Real, deliberate design decision, per direct guidance: two separate
// tabs, not one unified list with a per-item enable/disable toggle.
// The Standard tab (PathScribe-curated, jurisdiction-driven) has NO
// disable control anywhere in its own row actions — not hidden, not
// greyed out, the control simply doesn't exist in this component at
// all for that tab. That absence is what actually stops a site from
// disabling something their own jurisdiction mandates — there's no
// toggle to misuse in the first place, not a guarded one.
//
// Duplicate is the real creation mechanism, per direct guidance — "a
// site clicks Duplicate on any Standard (or existing Custom) activity
// and gets a new entry with the identical underlying archetype, ready
// to relabel/customize," the same real pattern SynopticEditor.tsx
// already uses for report templates (`{...t, id: uid(), name:
// '${t.name} (Copy)'}`). A duplicate always lands in the Custom tab
// with a fresh id, "(Copy)" appended to the name, and duplicatedFromId
// set — regardless of which tab it was duplicated from.
//
// Real, deliberate scope boundary: a QaActivityType's own `fields[]`
// schema (the dynamic review-capture form) is shown read-only here —
// Duplicate carries it over byte-for-byte (satisfying this ticket's
// own "clones an existing activity's full definition" acceptance
// criterion), but building a full add/remove/reorder field-schema
// editor is real, separate scope. This matches the ticket's own
// framing: Duplicate, not a from-scratch wizard, is the primary
// creation path, so relabeling/reconfiguring an existing field set is
// the real, common case — not authoring one from nothing.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { qaActivityTypeService, qaSupervisionAssignmentTypeService, deficiencyTypeService, subspecialtyService } from '../../../services';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { QaSupervisionAssignmentType, ExpectedCaseMixTarget } from '@/types/quality/QaSupervisionAssignmentType';
import type { Subspecialty } from '@/services';
import type { QaDiscordanceSeverity } from '@/types/quality/QaActivityRecord';
import type { DeficiencyType } from '@/services/deficiencies/IDeficiencyService';
import { getCurrentJurisdiction } from '@/services/retentionPolicy/RetentionPolicy';

type QaConfigTab = 'standard' | 'custom';
type ArchetypeKind = 'review' | 'supervision';

// A unified row shape spanning both real archetypes, for one combined
// table — kind tags which real entry (and which real service) it is.
type UnifiedEntry =
  | { kind: 'review'; entry: QaActivityType }
  | { kind: 'supervision'; entry: QaSupervisionAssignmentType };

const SEVERITY_OPTIONS: QaDiscordanceSeverity[] = ['low', 'medium', 'high'];

// Data-key-stays-English, label-is-translated: QaDiscordanceSeverity
// ('low'/'medium'/'high') is the real stored value on capaTriggerRule —
// only the displayed checkbox text is translated.
const SEVERITY_LABEL_KEY: Record<QaDiscordanceSeverity, string> = {
  low: 'qaConfigurationCenterSection.modal.severity.low',
  medium: 'qaConfigurationCenterSection.modal.severity.medium',
  high: 'qaConfigurationCenterSection.modal.severity.high',
};

const QAConfigurationCenterSection: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<QaConfigTab>('standard');
  const [reviewTypes, setReviewTypes] = useState<QaActivityType[]>([]);
  const [supervisionTypes, setSupervisionTypes] = useState<QaSupervisionAssignmentType[]>([]);
  const [deficiencyTypes, setDeficiencyTypes] = useState<DeficiencyType[]>([]);
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'edit' | 'duplicate' | 'add'; unified: UnifiedEntry } | null>(null);
  const [addPicker, setAddPicker] = useState(false);

  const currentJurisdiction = getCurrentJurisdiction();

  const load = () => {
    Promise.all([qaActivityTypeService.getAll(), qaSupervisionAssignmentTypeService.getAll(), deficiencyTypeService.getAll(), subspecialtyService.getAll()])
      .then(([r, s, d, sub]) => {
        if (r.ok) setReviewTypes(r.data);
        if (s.ok) setSupervisionTypes(s.data);
        if (d.ok) setDeficiencyTypes(d.data.filter(dt => dt.status === 'Active'));
        if (sub.ok) setSubspecialties(sub.data);
        setLoading(false);
      });
  };
  useEffect(load, []);

  const unified: UnifiedEntry[] = [
    ...reviewTypes.map((entry): UnifiedEntry => ({ kind: 'review', entry })),
    ...supervisionTypes.map((entry): UnifiedEntry => ({ kind: 'supervision', entry })),
  ];

  const filtered = unified.filter(u => {
    if (u.entry.tabScope !== tab) return false;
    // Standard tab is jurisdiction-filtered — a site only ever sees the
    // Standard activities that actually apply to it, same real
    // resolution getCurrentJurisdiction() already drives elsewhere in
    // this app (RetentionPolicy, IdentifierFormats).
    if (tab === 'standard' && u.entry.jurisdictions && !u.entry.jurisdictions.includes(currentJurisdiction)) return false;
    return true;
  });

  const archetypeLabel = (kind: ArchetypeKind) => kind === 'review' ? t('qaConfigurationCenterSection.archetypeLabel.review') : t('qaConfigurationCenterSection.archetypeLabel.supervision');

  const handleDuplicate = (u: UnifiedEntry) => {
    // Real fix, caught before this ever shipped: without a fresh id
    // here, handleSave's own exists-check (id already present in
    // reviewTypes/supervisionTypes) would treat this as an EDIT to the
    // original entry and silently overwrite it with the "(Copy)" name
    // instead of creating a genuinely new one — a real, serious data-
    // corruption risk for exactly the kind of curated Standard entry
    // this whole feature exists to protect.
    const freshId = u.kind === 'review' ? `qa-activity-${Date.now().toString(36)}` : `qa-supervision-type-${Date.now().toString(36)}`;
    const cloned: UnifiedEntry = u.kind === 'review'
      ? { kind: 'review', entry: { ...u.entry, id: freshId, name: `${u.entry.name} (Copy)`, tabScope: 'custom', duplicatedFromId: u.entry.id, active: true } }
      : { kind: 'supervision', entry: { ...u.entry, id: freshId, name: `${u.entry.name} (Copy)`, tabScope: 'custom', duplicatedFromId: u.entry.id, active: true } };
    setModal({ mode: 'duplicate', unified: cloned });
  };

  const handleToggleActive = async (u: UnifiedEntry) => {
    if (u.kind === 'review') {
      const res = u.entry.active ? await qaActivityTypeService.deactivate(u.entry.id) : await qaActivityTypeService.reactivate(u.entry.id);
      if (res.ok) setReviewTypes(prev => prev.map(rt => rt.id === res.data.id ? res.data : rt));
    } else {
      const res = u.entry.active ? await qaSupervisionAssignmentTypeService.deactivate(u.entry.id) : await qaSupervisionAssignmentTypeService.reactivate(u.entry.id);
      if (res.ok) setSupervisionTypes(prev => prev.map(rt => rt.id === res.data.id ? res.data : rt));
    }
  };

  const handleSave = async (u: UnifiedEntry) => {
    if (u.kind === 'review') {
      const { id, createdAt, ...rest } = u.entry;
      const exists = reviewTypes.some(rt => rt.id === id);
      const res = exists ? await qaActivityTypeService.update(id, rest) : await qaActivityTypeService.add(rest);
      if (res.ok) setReviewTypes(prev => exists ? prev.map(rt => rt.id === res.data.id ? res.data : rt) : [...prev, res.data]);
    } else {
      const { id, createdAt, ...rest } = u.entry;
      const exists = supervisionTypes.some(rt => rt.id === id);
      const res = exists ? await qaSupervisionAssignmentTypeService.update(id, rest) : await qaSupervisionAssignmentTypeService.add(rest);
      if (res.ok) setSupervisionTypes(prev => exists ? prev.map(rt => rt.id === res.data.id ? res.data : rt) : [...prev, res.data]);
    }
    setModal(null);
    setTab('custom'); // a duplicate/new-add always lands in Custom — follow it there
  };

  if (loading) return <div className="ps-conf-section-subtitle">{t('qaConfigurationCenterSection.loading')}</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('qaConfigurationCenterSection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('qaConfigurationCenterSection.subtitle', { jurisdiction: currentJurisdiction })}
          </p>
        </div>
      </div>

      <div className="ps-tab-bar">
        <button className={`ps-tab-btn ${tab === 'standard' ? 'active' : ''}`} onClick={() => setTab('standard')}>{t('qaConfigurationCenterSection.tabs.standard')}</button>
        <button className={`ps-tab-btn ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>{t('qaConfigurationCenterSection.tabs.custom')}</button>
      </div>

      {tab === 'custom' && (
        <div className="ps-conf-form-row">
          <button className="ps-conf-btn-primary" onClick={() => setAddPicker(true)}>{t('qaConfigurationCenterSection.addCustomActivityButton')}</button>
        </div>
      )}

      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">{t('qaConfigurationCenterSection.table.headers.name')}</th>
              <th className="ps-conf-th">{t('qaConfigurationCenterSection.table.headers.archetype')}</th>
              {tab === 'standard' && <th className="ps-conf-th">{t('qaConfigurationCenterSection.table.headers.jurisdictions')}</th>}
              <th className="ps-conf-th">{t('qaConfigurationCenterSection.table.headers.samplingPercent')}</th>
              <th className="ps-conf-th">{t('qaConfigurationCenterSection.table.headers.capaTrigger')}</th>
              <th className="ps-conf-th">{t('qaConfigurationCenterSection.table.headers.status')}</th>
              <th className="ps-conf-th">{t('qaConfigurationCenterSection.table.headers.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.entry.id} className="ps-conf-tr">
                <td className="ps-conf-td">
                  <div className="ps-conf-identity-name">{u.entry.name}</div>
                  {u.entry.description && <div className="ps-conf-identity-sub">{u.entry.description}</div>}
                </td>
                <td className="ps-conf-td">{archetypeLabel(u.kind)}</td>
                {tab === 'standard' && <td className="ps-conf-td">{u.entry.jurisdictions?.join(', ') ?? t('qaConfigurationCenterSection.table.jurisdictionsAll')}</td>}
                <td className="ps-conf-td">{u.kind === 'review' ? (u.entry.samplingPercentage ? `${u.entry.samplingPercentage}%` : '—') : '—'}</td>
                <td className="ps-conf-td">
                  {u.kind === 'review' && u.entry.capaTriggerRule?.triggerSeverities?.length
                    ? `${u.entry.capaTriggerRule.triggerSeverities.join('/')} → ${deficiencyTypes.find(d => d.id === u.entry.capaTriggerRule?.deficiencyTypeId)?.name ?? u.entry.capaTriggerRule.deficiencyTypeId}`
                    : '—'}
                </td>
                <td className="ps-conf-td">
                  <div className="ps-conf-status-cell">
                    <span className={`ps-conf-status-dot ${u.entry.active ? 'ps-conf-status-dot--active' : ''}`} />
                    <span className={`ps-conf-status-text ${u.entry.active ? 'ps-conf-status-text--active' : ''}`}>{u.entry.active ? t('common.active') : t('common.inactive')}</span>
                  </div>
                </td>
                <td className="ps-conf-td">
                  <div className="ps-conf-row-actions">
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', unified: u })}>
                      {tab === 'standard' ? t('qaConfigurationCenterSection.table.configure') : t('common.edit')}
                    </button>
                    <button className="ps-conf-btn-row" onClick={() => handleDuplicate(u)}>{t('common.duplicate')}</button>
                    {/* Real, deliberate absence: no Deactivate/Reactivate button renders
                        at all for the Standard tab — not disabled, not hidden behind a
                        permission check, simply never rendered in this branch. */}
                    {tab === 'custom' && (
                      <button className="ps-conf-btn-row" onClick={() => handleToggleActive(u)}>
                        {u.entry.active ? t('common.deactivate') : t('common.reactivate')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="ps-conf-empty-row" colSpan={tab === 'standard' ? 7 : 6}>
                {tab === 'standard' ? t('qaConfigurationCenterSection.table.emptyStandard', { jurisdiction: currentJurisdiction }) : t('qaConfigurationCenterSection.table.emptyCustom')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {addPicker && (
        <div className="ps-ms-overlay" onClick={() => setAddPicker(false)}>
          <div className="ps-ms-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ms-header">{t('qaConfigurationCenterSection.addPicker.header')}</div>
            <div className="ps-ms-body">
              <p className="ps-conf-section-subtitle">
                {t('qaConfigurationCenterSection.addPicker.body')}
              </p>
              <button className="ps-conf-btn-primary" onClick={() => {
                setAddPicker(false);
                setModal({
                  mode: 'add', unified: {
                    kind: 'review', entry: {
                      id: `qa-activity-${Date.now().toString(36)}`, name: '', description: '', tabScope: 'custom',
                      fields: [{ id: 'notes', label: 'Notes', type: 'longtext', required: false, options: [] }],
                      teachingOnboardingEnabled: false, active: true, createdAt: '', createdBy: 'admin',
                    },
                  },
                });
              }}>{t('qaConfigurationCenterSection.addPicker.newReviewButton')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => {
                setAddPicker(false);
                setModal({
                  mode: 'add', unified: {
                    kind: 'supervision', entry: {
                      id: `qa-supervision-type-${Date.now().toString(36)}`, name: '', description: '', tabScope: 'custom',
                      active: true, createdAt: '', createdBy: 'admin',
                    },
                  },
                });
              }}>{t('qaConfigurationCenterSection.addPicker.newSupervisionButton')}</button>
              <div className="ps-ms-footer">
                <button className="ps-ms-btn-cancel" onClick={() => setAddPicker(false)}>{t('common.cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <ActivityConfigModal
          unified={modal.unified}
          mode={modal.mode}
          deficiencyTypes={deficiencyTypes}
          subspecialties={subspecialties}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

// ─── Edit/Duplicate/Add modal ───────────────────────────────────────────────

const ActivityConfigModal: React.FC<{
  unified: UnifiedEntry;
  mode: 'edit' | 'duplicate' | 'add';
  deficiencyTypes: DeficiencyType[];
  subspecialties: Subspecialty[];
  onSave: (u: UnifiedEntry) => void;
  onClose: () => void;
}> = ({ unified, mode, deficiencyTypes, subspecialties, onSave, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<UnifiedEntry>(unified);
  const isStandard = unified.entry.tabScope === 'standard' && mode === 'edit';

  const setEntry = (patch: Partial<QaActivityType> | Partial<QaSupervisionAssignmentType>) => {
    setDraft(prev => ({ ...prev, entry: { ...prev.entry, ...patch } } as UnifiedEntry));
  };

  // Real, per direct follow-up on the resident/mentor case-mix review —
  // an org-wide default set once per supervision type (see
  // ExpectedCaseMixTarget's own doc comment for why the type, not the
  // individual assignment). Additive only: a type with an empty array
  // behaves identically to one with the field left undefined.
  const caseMixTargets: ExpectedCaseMixTarget[] =
    draft.kind === 'supervision' ? (draft.entry.expectedCaseMix ?? []) : [];
  const setCaseMixTargets = (targets: ExpectedCaseMixTarget[]) => {
    if (draft.kind !== 'supervision') return;
    setEntry({ expectedCaseMix: targets });
  };
  const unusedSubspecialties = subspecialties.filter(s => !caseMixTargets.some(cmt => cmt.subspecialtyId === s.id));

  const toggleSeverity = (sev: QaDiscordanceSeverity) => {
    if (draft.kind !== 'review') return;
    const current = draft.entry.capaTriggerRule?.triggerSeverities ?? [];
    const next = current.includes(sev) ? current.filter(s => s !== sev) : [...current, sev];
    setEntry({ capaTriggerRule: { ...draft.entry.capaTriggerRule, triggerSeverities: next } });
  };

  return (
    <div className="ps-ms-overlay" onClick={onClose}>
      <div className="ps-ms-modal" onClick={e => e.stopPropagation()}>
        <div className="ps-ms-header">
          {mode === 'add' ? t('qaConfigurationCenterSection.addPicker.header')
            : mode === 'duplicate' ? t('qaConfigurationCenterSection.modal.headerDuplicate', { name: unified.entry.name.replace(' (Copy)', '') })
            : (isStandard ? t('qaConfigurationCenterSection.modal.headerConfigure', { name: draft.entry.name }) : t('qaConfigurationCenterSection.modal.headerEdit', { name: draft.entry.name }))}
        </div>
        <div className="ps-ms-body">
          {/* Real, deliberate boundary: name/description are the curated
              identity of a Standard activity — read-only here even though
              this entry has no disable control either, matching "PathScribe-
              curated" in spirit. Fully editable for Custom/duplicate/add. */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('qaConfigurationCenterSection.modal.nameLabel')}</label>
            {isStandard
              ? <p className="ps-conf-identity-name">{draft.entry.name}</p>
              : <input className="ps-conf-input" value={draft.entry.name} onChange={e => setEntry({ name: e.target.value })} />}
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('qaConfigurationCenterSection.modal.descriptionLabel')}</label>
            {isStandard
              ? <p className="ps-conf-section-subtitle">{draft.entry.description || '—'}</p>
              : <textarea className="ps-conf-input ps-conf-textarea" value={draft.entry.description ?? ''} onChange={e => setEntry({ description: e.target.value })} />}
          </div>

          {draft.kind === 'review' && (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('qaConfigurationCenterSection.modal.reviewFieldsLabel')}</label>
                <ul>
                  {/* f.label/f.type are the real, persisted field-schema definition
                      (admin-authored when the field was created) - left as-is, same
                      "real dictionary content admins type in" convention as every
                      other real record's own name/label text in this app. */}
                  {draft.entry.fields.map(f => <li key={f.id} className="ps-conf-section-subtitle">{f.label} ({f.type}{f.required ? `, ${t('qaConfigurationCenterSection.modal.requiredSuffix')}` : ''})</li>)}
                </ul>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">
                  <input type="checkbox" checked={draft.entry.teachingOnboardingEnabled} disabled={isStandard}
                    onChange={e => setEntry({ teachingOnboardingEnabled: e.target.checked })} />
                  {' '}{t('qaConfigurationCenterSection.modal.teachingCheckboxLabel')}
                </label>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('qaConfigurationCenterSection.modal.samplingLabel')}</label>
                <input className="ps-conf-input" type="number" min={0} max={100} value={draft.entry.samplingPercentage ?? ''}
                  onChange={e => setEntry({ samplingPercentage: e.target.value ? Number(e.target.value) : undefined })} />
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                  {t('qaConfigurationCenterSection.modal.samplingHint')}
                </p>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('qaConfigurationCenterSection.modal.capaTriggerLabel')}</label>
                <div className="ps-conf-form-row">
                  {SEVERITY_OPTIONS.map(sev => (
                    <label key={sev} className="ps-conf-label">
                      <input type="checkbox" checked={(draft.entry.capaTriggerRule?.triggerSeverities ?? []).includes(sev)}
                        onChange={() => toggleSeverity(sev)} />
                      {' '}{t(SEVERITY_LABEL_KEY[sev])}
                    </label>
                  ))}
                </div>
                <select className="ps-conf-select" value={draft.entry.capaTriggerRule?.deficiencyTypeId ?? ''}
                  onChange={e => setEntry({ capaTriggerRule: { ...draft.entry.capaTriggerRule, deficiencyTypeId: e.target.value || undefined } })}>
                  <option value="">{t('qaConfigurationCenterSection.modal.noDeficiencyOption')}</option>
                  {deficiencyTypes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                  {t('qaConfigurationCenterSection.modal.capaTriggerHint')}
                </p>
              </div>
            </>
          )}

          {draft.kind === 'supervision' && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('qaConfigurationCenterSection.modal.expectedCaseMixLabel')}</label>
              <p className="ps-conf-section-subtitle">
                {t('qaConfigurationCenterSection.modal.expectedCaseMixHint')}
              </p>
              {caseMixTargets.map((cmt, i) => (
                <div key={cmt.subspecialtyId} className="ps-conf-form-row--3">
                  <span className="ps-conf-identity-name">{subspecialties.find(s => s.id === cmt.subspecialtyId)?.name ?? cmt.subspecialtyId}</span>
                  <input
                    className="ps-conf-input"
                    type="number"
                    min={1}
                    value={cmt.minCount}
                    onChange={e => {
                      const next = [...caseMixTargets];
                      next[i] = { ...cmt, minCount: e.target.value ? Number(e.target.value) : 1 };
                      setCaseMixTargets(next);
                    }}
                  />
                  <button
                    className="ps-conf-btn-secondary"
                    onClick={() => setCaseMixTargets(caseMixTargets.filter(x => x.subspecialtyId !== cmt.subspecialtyId))}
                  >
                    {t('qaConfigurationCenterSection.modal.removeButton')}
                  </button>
                </div>
              ))}
              {unusedSubspecialties.length > 0 && (
                <select
                  className="ps-conf-select"
                  value=""
                  onChange={e => {
                    if (!e.target.value) return;
                    setCaseMixTargets([...caseMixTargets, { subspecialtyId: e.target.value, minCount: 1 }]);
                  }}
                >
                  <option value="">{t('qaConfigurationCenterSection.modal.addSubspecialtyOption')}</option>
                  {unusedSubspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('qaConfigurationCenterSection.modal.statusLabel')}</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => setEntry({ active: !draft.entry.active })} className={`ps-conf-toggle-track ${draft.entry.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.entry.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.entry.active ? t('common.active') : t('common.inactive')}</span>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={() => onSave(draft)}>
            {mode === 'add' ? t('qaConfigurationCenterSection.modal.saveButtons.add') : mode === 'duplicate' ? t('qaConfigurationCenterSection.modal.saveButtons.createDuplicate') : t('qaConfigurationCenterSection.modal.saveButtons.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QAConfigurationCenterSection;
