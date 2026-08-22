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
import '../../../pathscribe.css';
import { specimenCategoryService } from '../../../services';
import { checkSpecimenCategoryReferences } from '../../../services/referenceCheck/referenceCheckService';
import { mockAuditService } from '../../../services/auditlog/mockAuditService';
import ConfirmModal from '../../Common/ConfirmModal';
import type { SpecimenCategory } from '../../../services/specimenCategories/ISpecimenCategoryService';
import type { RetainableMaterialType, RetentionOverrideDays } from '../../../services/retentionPolicy/RetentionPolicy';
import { MATERIAL_TYPE_LABEL, formatRetentionPeriod, getCurrentJurisdiction } from '../../../services/retentionPolicy/RetentionPolicy';
import { resolveCurrentGoverningBodyFloor } from '../../../services/retentionPolicy/resolveRetentionEligibility';

// The three Grossing Templates that exist today — see protocolShared.tsx's
// PROTOCOL_REGISTRY entries with isDiagnostic: false. Hardcoded here rather
// than fetched, same pragmatic scope call as AccessionPage's own template
// resolution; revisit if the list ever needs to come from templateService
// dynamically (e.g. once custom Grossing Templates beyond the three
// Gold Standard routes are supported).
const GROSSING_TEMPLATES: { id: string; name: string }[] = [
  { id: 'grossing_standard_tissue', name: 'Standard Tissue Grossing (Route A)' },
  { id: 'grossing_fluid_cytology',  name: 'Fluid / Cell Block Grossing (Route B)' },
  { id: 'grossing_histology_only',  name: 'Histology-Only / Direct Triage (Route C)' },
];

const ALL_MATERIAL_TYPES: RetainableMaterialType[] = ['block', 'slide', 'wet_tissue'];

// ─── Modal ────────────────────────────────────────────────────────────────────
type Draft = Omit<SpecimenCategory, 'id' | 'status' | 'autoCreated' | 'autoCreatedAt' | 'autoCreatedNote'> & { active: boolean };

const emptyDraft: Draft = {
  name: '', description: '', defaultGrossingTemplateId: 'grossing_standard_tissue',
  accessionPrefix: 'O', numberSeries: '', active: true, retentionOverrideDays: undefined,
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
  return ALL_MATERIAL_TYPES.filter(t => {
    const v = override[t];
    return v != null && v < floor[t];
  });
}

interface CategoryModalProps {
  mode: 'add' | 'edit';
  category?: SpecimenCategory;
  floor?: Record<RetainableMaterialType, number>;
  onSave: (draft: Draft, belowFloorFields: RetainableMaterialType[], justification: string) => void;
  onClose: () => void;
}

const CategoryModal: React.FC<CategoryModalProps> = ({ mode, category, floor, onSave, onClose }) => {
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
    if (!draft.name.trim()) e.name = 'Required';
    if (!draft.defaultGrossingTemplateId) e.defaultGrossingTemplateId = 'Required';
    return e;
  };

  const buildRetentionOverride = (): RetentionOverrideDays | undefined => {
    const parsed: RetentionOverrideDays = {};
    let any = false;
    for (const t of ALL_MATERIAL_TYPES) {
      const raw = retentionDays[t];
      if (raw.trim() === '') continue;
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) { parsed[t] = n; any = true; }
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
          {mode === 'add' ? 'Add Specimen Category' : `Edit — ${category?.name}`}
        </div>

        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Name <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`}
              value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Surgical Tissue" />
            {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Description</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="What kinds of specimens fall into this category" />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="speccat-template">Default Grossing Template <span className="ps-conf-required">*</span></label>
            <select id="speccat-template" className={`ps-conf-select ${errors.defaultGrossingTemplateId ? 'ps-conf-input--error' : ''}`} value={draft.defaultGrossingTemplateId} onChange={e => set('defaultGrossingTemplateId', e.target.value)}>
              {GROSSING_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {errors.defaultGrossingTemplateId && <span className="ps-conf-error-text">{errors.defaultGrossingTemplateId}</span>}
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Accession Prefix</label>
              <input className="ps-conf-input" value={draft.accessionPrefix ?? ''} onChange={e => set('accessionPrefix', e.target.value.toUpperCase())} placeholder="O" maxLength={3} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Numbering Series (optional)</label>
              <input className="ps-conf-input" value={draft.numberSeries ?? ''} onChange={e => set('numberSeries', e.target.value)} placeholder="Leave blank to share the institution-wide series" />
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Status</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>

          {/* Real feature, per direct follow-up: retention override,
              with the current, live governing-body floor shown right
              alongside each field — raising is free; the confirmation
              step for going below only appears on Save, once we know
              the actual, final values. */}
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Retention Override (optional — per material type)</label>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
              Leave a field blank to use the current jurisdiction default. Only set a real exception here.
            </div>
            <div className="ps-conf-form-row">
              {ALL_MATERIAL_TYPES.map(t => {
                const parsed = parseInt(retentionDays[t], 10);
                const isBelowFloor = floor && Number.isFinite(parsed) && parsed > 0 && parsed < floor[t];
                return (
                  <div className="ps-conf-form-field" key={t}>
                    <label className="ps-conf-label">{MATERIAL_TYPE_LABEL[t]} (days)</label>
                    <input
                      className={`ps-conf-input ${isBelowFloor ? 'ps-conf-input--error' : ''}`}
                      value={retentionDays[t]}
                      onChange={e => setRetentionDays(prev => ({ ...prev, [t]: e.target.value }))}
                      placeholder={floor ? String(floor[t]) : 'e.g. 3653'}
                    />
                    <div style={{ fontSize: 11, marginTop: 2, color: isBelowFloor ? '#f87171' : '#64748b' }}>
                      {Number.isFinite(parsed) && parsed > 0 ? `≈ ${formatRetentionPeriod(parsed)}` : floor ? `Floor: ${formatRetentionPeriod(floor[t])}` : 'No governing-body floor on file'}
                      {isBelowFloor && ' — below floor'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>
            {mode === 'add' ? 'Add Category' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Real, dedicated modal, not the shared ConfirmModal — a
          below-floor override needs a required, typed justification,
          which ConfirmModal (message + confirm/cancel only) has no
          field for. */}
      {belowFloorConfirm && (
        <div className="ps-ms-overlay" style={{ zIndex: 9500 }}>
          <div className="ps-ms-modal" style={{ maxWidth: 460 }}>
            <div className="ps-ms-header" style={{ color: '#f87171' }}>⚠ Below the Current Retention Floor</div>
            <div className="ps-ms-body">
              <p style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 12 }}>
                This override sets {belowFloorConfirm.fields.map(f => MATERIAL_TYPE_LABEL[f]).join(' and ')} below the
                current governing-body floor{floor && belowFloorConfirm.fields.length === 1 ? ` (${formatRetentionPeriod(floor[belowFloorConfirm.fields[0]])})` : ''}.
                This is a real, deliberate exception to a real, published minimum — not something to do casually.
              </p>
              <label className="ps-conf-label">
                Justification <span className="ps-conf-required">*</span>
              </label>
              <textarea
                className="ps-conf-input ps-conf-textarea"
                value={justification}
                onChange={e => setJustification(e.target.value)}
                placeholder="Why this category's own retention should be shorter than the published floor..."
                rows={3}
                autoFocus
              />
            </div>
            <div className="ps-ms-footer">
              <button className="ps-ms-btn-cancel" onClick={() => setBelowFloorConfirm(null)}>Cancel</button>
              <button className="ps-ms-btn-apply" style={{ background: '#f87171' }} disabled={!justification.trim()} onClick={confirmBelowFloor}>
                Confirm Below-Floor Override
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
  const [categories,   setCategories]   = useState<SpecimenCategory[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive' | 'Unverified'>('All');
  const [modal,        setModal]        = useState<{ mode: 'add' | 'edit'; category?: SpecimenCategory } | null>(null);
  const [pendingDeactivation, setPendingDeactivation] = useState<{ draft: Draft; message: string } | null>(null);
  const [floor, setFloor] = useState<Record<RetainableMaterialType, number> | undefined>(undefined);

  useEffect(() => {
    specimenCategoryService.getAll().then(res => {
      if (res.ok) setCategories(res.data);
      setLoading(false);
    });
    resolveCurrentGoverningBodyFloor(getCurrentJurisdiction()).then(setFloor).catch(() => {});
  }, []);

  const templateName = (id: string) => GROSSING_TEMPLATES.find(t => t.id === id)?.name ?? id;

  const filtered = categories.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchSearch && matchStatus;
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
        setPendingDeactivation({ draft, message: `This specimen category is still referenced by: ${detail}. Deactivating it now won't remove those references — they'll keep pointing at a category that's no longer active. Deactivate anyway?` });
        return;
      }
    }
    const saved = await persistSave(draft);
    if (saved && belowFloorFields.length > 0) {
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

  if (loading) return <div className="ps-conf-loading">Loading specimen categories...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Specimen Category Dictionary</h3>
          <p className="ps-conf-section-subtitle">
            The coarse-grained classification that controls Grossing Template assignment, accession numbering, and per-category retention exceptions at intake.
          </p>
        </div>
        <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ Add Category</button>
      </div>

      <div className="ps-conf-form-row">
        <input type="text" placeholder="Search by name or description..." value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="ps-conf-select">
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Unverified">Unverified</option>
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {['Category', 'Default Grossing Template', 'Accession Prefix', 'Retention Override', 'Status', 'Actions'].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
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
                    <td className="ps-conf-td">{c.accessionPrefix ?? '—'}{c.numberSeries ? ` · ${c.numberSeries}` : ''}</td>
                    <td className="ps-conf-td">
                      {c.retentionOverrideDays ? (
                        <div style={{ fontSize: 11 }}>
                          {ALL_MATERIAL_TYPES.filter(t => c.retentionOverrideDays![t] != null).map(t => (
                            <div key={t} style={{ color: belowFloorFields.includes(t) ? '#f87171' : '#94a3b8' }}>
                              {MATERIAL_TYPE_LABEL[t]}: {formatRetentionPeriod(c.retentionOverrideDays![t]!)}
                              {belowFloorFields.includes(t) && ' ⚠ below floor'}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: '#64748b' }}>Uses jurisdiction default</span>
                      )}
                    </td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-status-cell">
                        <span className={`ps-conf-status-dot ${c.status === 'Active' ? 'ps-conf-status-dot--active' : c.status === 'Unverified' ? 'ps-conf-status-dot--pending' : ''}`} />
                        <span className={`ps-conf-status-text ${c.status === 'Active' ? 'ps-conf-status-text--active' : c.status === 'Unverified' ? 'ps-conf-status-text--pending' : ''}`}>{c.status}</span>
                      </div>
                      {c.autoCreated && (
                        <div className="ps-conf-auto-note" title={c.autoCreatedNote}>
                          Auto-created{c.autoCreatedAt ? ` ${c.autoCreatedAt}` : ''} — from order intake
                        </div>
                      )}
                    </td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-row-actions">
                        {c.status === 'Unverified' && (
                          <button className="ps-conf-btn-verify" onClick={() => handleVerify(c.id)}>Verify</button>
                        )}
                        <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', category: c })}>Edit</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={6}>No specimen categories match the current filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <CategoryModal mode={modal.mode} category={modal.category} floor={floor} onSave={handleSave} onClose={() => setModal(null)} />}

      <ConfirmModal
        show={!!pendingDeactivation}
        title="Specimen category still in use"
        message={pendingDeactivation?.message ?? ''}
        confirmLabel="Deactivate Anyway"
        cancelLabel="Cancel"
        onConfirm={confirmDeactivation}
        onCancel={() => setPendingDeactivation(null)}
      />
    </div>
  );
};

export default SpecimenCategoriesSection;
