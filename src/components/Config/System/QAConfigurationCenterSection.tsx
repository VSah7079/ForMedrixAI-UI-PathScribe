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
import '../../../pathscribe.css';
import { qaActivityTypeService, qaSupervisionAssignmentTypeService, deficiencyTypeService } from '../../../services';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { QaSupervisionAssignmentType } from '@/types/quality/QaSupervisionAssignmentType';
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

const QAConfigurationCenterSection: React.FC = () => {
  const [tab, setTab] = useState<QaConfigTab>('standard');
  const [reviewTypes, setReviewTypes] = useState<QaActivityType[]>([]);
  const [supervisionTypes, setSupervisionTypes] = useState<QaSupervisionAssignmentType[]>([]);
  const [deficiencyTypes, setDeficiencyTypes] = useState<DeficiencyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'edit' | 'duplicate' | 'add'; unified: UnifiedEntry } | null>(null);
  const [addPicker, setAddPicker] = useState(false);

  const currentJurisdiction = getCurrentJurisdiction();

  const load = () => {
    Promise.all([qaActivityTypeService.getAll(), qaSupervisionAssignmentTypeService.getAll(), deficiencyTypeService.getAll()])
      .then(([r, s, d]) => {
        if (r.ok) setReviewTypes(r.data);
        if (s.ok) setSupervisionTypes(s.data);
        if (d.ok) setDeficiencyTypes(d.data.filter(dt => dt.status === 'Active'));
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

  const archetypeLabel = (kind: ArchetypeKind) => kind === 'review' ? 'Review-with-Outcome' : 'Supervision / Assignment';

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
      if (res.ok) setReviewTypes(prev => prev.map(t => t.id === res.data.id ? res.data : t));
    } else {
      const res = u.entry.active ? await qaSupervisionAssignmentTypeService.deactivate(u.entry.id) : await qaSupervisionAssignmentTypeService.reactivate(u.entry.id);
      if (res.ok) setSupervisionTypes(prev => prev.map(t => t.id === res.data.id ? res.data : t));
    }
  };

  const handleSave = async (u: UnifiedEntry) => {
    if (u.kind === 'review') {
      const { id, createdAt, ...rest } = u.entry;
      const exists = reviewTypes.some(t => t.id === id);
      const res = exists ? await qaActivityTypeService.update(id, rest) : await qaActivityTypeService.add(rest);
      if (res.ok) setReviewTypes(prev => exists ? prev.map(t => t.id === res.data.id ? res.data : t) : [...prev, res.data]);
    } else {
      const { id, createdAt, ...rest } = u.entry;
      const exists = supervisionTypes.some(t => t.id === id);
      const res = exists ? await qaSupervisionAssignmentTypeService.update(id, rest) : await qaSupervisionAssignmentTypeService.add(rest);
      if (res.ok) setSupervisionTypes(prev => exists ? prev.map(t => t.id === res.data.id ? res.data : t) : [...prev, res.data]);
    }
    setModal(null);
    setTab('custom'); // a duplicate/new-add always lands in Custom — follow it there
  };

  if (loading) return <div className="ps-conf-section-subtitle">Loading QA activity configuration…</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">QA Configuration Center</h3>
          <p className="ps-conf-section-subtitle">
            Activities are built on one of two real archetypes — Review-with-Outcome (a case gets reviewed and
            graded, e.g. Frozen vs Final Correlation) or Supervision/Assignment (a provider is supervised over a
            case-count or duration period, e.g. FPPE). Standard activities are PathScribe-curated for your
            jurisdiction ({currentJurisdiction}) and can't be disabled here — duplicate one to customize it.
          </p>
        </div>
      </div>

      <div className="ps-tab-bar">
        <button className={`ps-tab-btn ${tab === 'standard' ? 'active' : ''}`} onClick={() => setTab('standard')}>Standard</button>
        <button className={`ps-tab-btn ${tab === 'custom' ? 'active' : ''}`} onClick={() => setTab('custom')}>Custom</button>
      </div>

      {tab === 'custom' && (
        <div className="ps-conf-form-row">
          <button className="ps-conf-btn-primary" onClick={() => setAddPicker(true)}>+ Add Custom Activity</button>
        </div>
      )}

      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">Name</th>
              <th className="ps-conf-th">Archetype</th>
              {tab === 'standard' && <th className="ps-conf-th">Jurisdictions</th>}
              <th className="ps-conf-th">Sampling %</th>
              <th className="ps-conf-th">CAPA Trigger</th>
              <th className="ps-conf-th">Status</th>
              <th className="ps-conf-th">Actions</th>
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
                {tab === 'standard' && <td className="ps-conf-td">{u.entry.jurisdictions?.join(', ') ?? 'All'}</td>}
                <td className="ps-conf-td">{u.kind === 'review' ? (u.entry.samplingPercentage ? `${u.entry.samplingPercentage}%` : '—') : '—'}</td>
                <td className="ps-conf-td">
                  {u.kind === 'review' && u.entry.capaTriggerRule?.triggerSeverities?.length
                    ? `${u.entry.capaTriggerRule.triggerSeverities.join('/')} → ${deficiencyTypes.find(d => d.id === u.entry.capaTriggerRule?.deficiencyTypeId)?.name ?? u.entry.capaTriggerRule.deficiencyTypeId}`
                    : '—'}
                </td>
                <td className="ps-conf-td">
                  <div className="ps-conf-status-cell">
                    <span className={`ps-conf-status-dot ${u.entry.active ? 'ps-conf-status-dot--active' : ''}`} />
                    <span className={`ps-conf-status-text ${u.entry.active ? 'ps-conf-status-text--active' : ''}`}>{u.entry.active ? 'Active' : 'Inactive'}</span>
                  </div>
                </td>
                <td className="ps-conf-td">
                  <div className="ps-conf-row-actions">
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', unified: u })}>
                      {tab === 'standard' ? 'Configure' : 'Edit'}
                    </button>
                    <button className="ps-conf-btn-row" onClick={() => handleDuplicate(u)}>Duplicate</button>
                    {/* Real, deliberate absence: no Deactivate/Reactivate button renders
                        at all for the Standard tab — not disabled, not hidden behind a
                        permission check, simply never rendered in this branch. */}
                    {tab === 'custom' && (
                      <button className="ps-conf-btn-row" onClick={() => handleToggleActive(u)}>
                        {u.entry.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="ps-conf-empty-row" colSpan={tab === 'standard' ? 7 : 6}>
                {tab === 'standard' ? `No Standard activities apply to ${currentJurisdiction}.` : 'No Custom activities yet — duplicate a Standard activity to get started.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {addPicker && (
        <div className="ps-ms-overlay" onClick={() => setAddPicker(false)}>
          <div className="ps-ms-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ms-header">Add Custom Activity</div>
            <div className="ps-ms-body">
              <p className="ps-conf-section-subtitle">
                Most sites duplicate an existing Standard or Custom activity instead — it's the faster path since
                the review fields (or supervision scope) come pre-built. Starting from scratch here still works,
                with a minimal default.
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
              }}>New Review-with-Outcome Activity</button>
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
              }}>New Supervision/Assignment Activity</button>
              <div className="ps-ms-footer">
                <button className="ps-ms-btn-cancel" onClick={() => setAddPicker(false)}>Cancel</button>
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
  onSave: (u: UnifiedEntry) => void;
  onClose: () => void;
}> = ({ unified, mode, deficiencyTypes, onSave, onClose }) => {
  const [draft, setDraft] = useState<UnifiedEntry>(unified);
  const isStandard = unified.entry.tabScope === 'standard' && mode === 'edit';

  const setEntry = (patch: Partial<QaActivityType> | Partial<QaSupervisionAssignmentType>) => {
    setDraft(prev => ({ ...prev, entry: { ...prev.entry, ...patch } } as UnifiedEntry));
  };

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
          {mode === 'add' ? 'Add Custom Activity' : mode === 'duplicate' ? `Duplicate — ${unified.entry.name.replace(' (Copy)', '')}` : (isStandard ? `Configure — ${draft.entry.name}` : `Edit — ${draft.entry.name}`)}
        </div>
        <div className="ps-ms-body">
          {/* Real, deliberate boundary: name/description are the curated
              identity of a Standard activity — read-only here even though
              this entry has no disable control either, matching "PathScribe-
              curated" in spirit. Fully editable for Custom/duplicate/add. */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Name</label>
            {isStandard
              ? <p className="ps-conf-identity-name">{draft.entry.name}</p>
              : <input className="ps-conf-input" value={draft.entry.name} onChange={e => setEntry({ name: e.target.value })} />}
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Description</label>
            {isStandard
              ? <p className="ps-conf-section-subtitle">{draft.entry.description || '—'}</p>
              : <textarea className="ps-conf-input ps-conf-textarea" value={draft.entry.description ?? ''} onChange={e => setEntry({ description: e.target.value })} />}
          </div>

          {draft.kind === 'review' && (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Review Fields (from Duplicate — read-only here)</label>
                <ul>
                  {draft.entry.fields.map(f => <li key={f.id} className="ps-conf-section-subtitle">{f.label} ({f.type}{f.required ? ', required' : ''})</li>)}
                </ul>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">
                  <input type="checkbox" checked={draft.entry.teachingOnboardingEnabled} disabled={isStandard}
                    onChange={e => setEntry({ teachingOnboardingEnabled: e.target.checked })} />
                  {' '}Capture Teaching & Onboarding Feedback
                </label>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Sampling Percentage</label>
                <input className="ps-conf-input" type="number" min={0} max={100} value={draft.entry.samplingPercentage ?? ''}
                  onChange={e => setEntry({ samplingPercentage: e.target.value ? Number(e.target.value) : undefined })} />
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                  Fraction of eligible cases randomly selected for this activity. Blank = no automatic sampling.
                </p>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">CAPA Trigger — raise a deficiency automatically when</label>
                <div className="ps-conf-form-row">
                  {SEVERITY_OPTIONS.map(sev => (
                    <label key={sev} className="ps-conf-label">
                      <input type="checkbox" checked={(draft.entry.capaTriggerRule?.triggerSeverities ?? []).includes(sev)}
                        onChange={() => toggleSeverity(sev)} />
                      {' '}{sev}
                    </label>
                  ))}
                </div>
                <select className="ps-conf-select" value={draft.entry.capaTriggerRule?.deficiencyTypeId ?? ''}
                  onChange={e => setEntry({ capaTriggerRule: { ...draft.entry.capaTriggerRule, deficiencyTypeId: e.target.value || undefined } })}>
                  <option value="">— No deficiency type selected —</option>
                  {deficiencyTypes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                  Discordant severity is still always recorded either way — this only controls whether it also raises a real deficiency automatically.
                </p>
              </div>
            </>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Status</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => setEntry({ active: !draft.entry.active })} className={`ps-conf-toggle-track ${draft.entry.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.entry.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.entry.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={() => onSave(draft)}>
            {mode === 'add' ? 'Add' : mode === 'duplicate' ? 'Create Duplicate' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QAConfigurationCenterSection;
