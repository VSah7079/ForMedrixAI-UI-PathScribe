// src/components/Config/System/MasterPaymentTypeDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (Outside Client Support & International
// Financial Class Architecture Specification, Section 3.1 + "Step 1
// should be under System / Financial"): admin CRUD for the
// jurisdiction-agnostic Master Payment Type dictionary. Registered
// under the existing 'Financial & Revenue Lookups' sidebar group
// (Config/System/index.tsx) alongside Billing Dictionary/RVU Code
// Map/NCCI Edit Rules — a real, established group this app already
// has, not a new one invented for this feature.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockMasterPaymentTypeService } from '../../../services/billing/mockMasterPaymentTypeService';
import type { MasterPaymentType, GuarantorRequirement } from '../../../types/billing/MasterPaymentType';

const GUARANTOR_LABELS: Record<GuarantorRequirement, string> = {
  required: 'Required',
  optional: 'Optional',
  not_required: 'Not Required',
};

function blankDraft(): Partial<MasterPaymentType> {
  return {
    id: '', displayName: '', requiresSubscriberId: false, subscriberIdLabel: '',
    requiresGuarantor: 'not_required', supportsSplitBilling: false, notes: '',
  };
}

const MasterPaymentTypeDictionarySection: React.FC = () => {
  const [entries, setEntries] = useState<MasterPaymentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: MasterPaymentType } | null>(null);
  const [draft, setDraft] = useState<Partial<MasterPaymentType>>(blankDraft());

  const refresh = () => {
    setLoading(true);
    mockMasterPaymentTypeService.getAll().then(res => {
      if (res.ok) setEntries(res.data);
      setLoading(false);
    });
  };
  useEffect(refresh, []);

  const openAdd = () => { setDraft(blankDraft()); setModal({ mode: 'add' }); };
  const openEdit = (e: MasterPaymentType) => { setDraft(e); setModal({ mode: 'edit', entry: e }); };

  const canSave = !!draft.id?.trim() && !!draft.displayName?.trim()
    && (modal?.mode === 'edit' || !entries.some(e => e.id === draft.id?.trim().toUpperCase().replace(/\s+/g, '_')));

  const handleSave = async () => {
    if (!canSave) return;
    if (modal?.mode === 'add') {
      const res = await mockMasterPaymentTypeService.add({
        id: draft.id!.trim().toUpperCase().replace(/\s+/g, '_'),
        displayName: draft.displayName!.trim(),
        requiresSubscriberId: !!draft.requiresSubscriberId,
        subscriberIdLabel: draft.requiresSubscriberId ? (draft.subscriberIdLabel?.trim() || undefined) : undefined,
        requiresGuarantor: draft.requiresGuarantor ?? 'not_required',
        supportsSplitBilling: !!draft.supportsSplitBilling,
        notes: draft.notes?.trim() || undefined,
      });
      if (!res.ok) { alert((res as any).error); return; }
    } else if (modal?.entry) {
      const res = await mockMasterPaymentTypeService.update(modal.entry.id, {
        displayName: draft.displayName!.trim(),
        requiresSubscriberId: !!draft.requiresSubscriberId,
        subscriberIdLabel: draft.requiresSubscriberId ? (draft.subscriberIdLabel?.trim() || undefined) : undefined,
        requiresGuarantor: draft.requiresGuarantor ?? 'not_required',
        supportsSplitBilling: !!draft.supportsSplitBilling,
        notes: draft.notes?.trim() || undefined,
      });
      if (!res.ok) { alert((res as any).error); return; }
    }
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: MasterPaymentType) => {
    const res = e.active ? await mockMasterPaymentTypeService.deactivate(e.id) : await mockMasterPaymentTypeService.reactivate(e.id);
    if (res.ok) refresh();
  };

  const displayed = entries.filter(e => showInactive || e.active);

  if (loading) return <div className="ps-conf-loading">Loading Master Payment Types…</div>;

  return (
    <div>
      <div className="ps-defic-page-header">
        <h2 className="ps-defic-page-title">💳 Master Payment Type Dictionary</h2>
        <p className="ps-defic-page-subtitle">
          Jurisdiction-agnostic financial-mechanics categories — how a payment category behaves
          (subscriber ID, guarantor, split-billing), independent of which country or local scheme it belongs to.
          See the Jurisdiction Payment Mapping dictionary for the per-country schemes that reference these.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <label className="ps-sub-toggle-wrap" style={{ cursor: 'pointer' }}>
          <div onClick={() => setShowInactive(v => !v)} className={showInactive ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}>
            <div className={showInactive ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
          </div>
          <span className="ps-tat-hint-text">Show inactive</span>
        </label>
        <button className="ps-conf-btn-primary" onClick={openAdd}>+ Add Payment Type</button>
      </div>

      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">Category ID</th>
              <th className="ps-conf-th">Display Name</th>
              <th className="ps-conf-th">Subscriber ID</th>
              <th className="ps-conf-th">Guarantor</th>
              <th className="ps-conf-th">Split Billing</th>
              <th className="ps-conf-th">Status</th>
              <th className="ps-conf-th"></th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && <tr><td className="ps-conf-td" colSpan={7}>No payment types match.</td></tr>}
            {displayed.map(e => (
              <tr key={e.id} style={{ opacity: e.active ? 1 : 0.5 }}>
                <td className="ps-conf-td"><code style={{ fontSize: 12 }}>{e.id}</code></td>
                <td className="ps-conf-td">{e.displayName}</td>
                <td className="ps-conf-td">{e.requiresSubscriberId ? (e.subscriberIdLabel ? `Required (${e.subscriberIdLabel})` : 'Required') : 'Not Required'}</td>
                <td className="ps-conf-td">{GUARANTOR_LABELS[e.requiresGuarantor]}</td>
                <td className="ps-conf-td">{e.supportsSplitBilling ? 'Yes' : 'No'}</td>
                <td className="ps-conf-td">{e.active ? 'Active' : 'Inactive'}</td>
                <td className="ps-conf-td" style={{ textAlign: 'right' }}>
                  <button className="ps-conf-btn-secondary" onClick={() => openEdit(e)} style={{ marginRight: 6 }}>Edit</button>
                  <button className="ps-conf-btn-secondary" onClick={() => toggleActive(e)}>{e.active ? 'Deactivate' : 'Reactivate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="ps-conf-backdrop" onClick={() => setModal(null)}>
          <div className="ps-macro-import-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-ose-quicktext-title">{modal.mode === 'add' ? 'Add Master Payment Type' : `Edit ${modal.entry?.displayName}`}</div>

            <label className="ps-conf-label">Category ID {modal.mode === 'edit' && <span style={{ opacity: 0.6 }}>(locked — referenced by Jurisdiction Mappings)</span>}</label>
            <input className="ps-conf-input" value={draft.id ?? ''} disabled={modal.mode === 'edit'}
              onChange={e => setDraft(d => ({ ...d, id: e.target.value }))} placeholder="e.g. SELF_PAY" />

            <label className="ps-conf-label">Display Name</label>
            <input className="ps-conf-input" value={draft.displayName ?? ''} onChange={e => setDraft(d => ({ ...d, displayName: e.target.value }))} />

            <label className="ps-conf-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!draft.requiresSubscriberId} onChange={e => setDraft(d => ({ ...d, requiresSubscriberId: e.target.checked }))} />
              Requires Subscriber ID
            </label>
            {draft.requiresSubscriberId && (
              <input className="ps-conf-input" value={draft.subscriberIdLabel ?? ''} onChange={e => setDraft(d => ({ ...d, subscriberIdLabel: e.target.value }))}
                placeholder='Optional real label, e.g. "NHS Number" or "Claim #" — leave blank for generic "Subscriber ID"' />
            )}

            <label className="ps-conf-label">Requires Guarantor</label>
            <select className="ps-conf-select" value={draft.requiresGuarantor ?? 'not_required'} onChange={e => setDraft(d => ({ ...d, requiresGuarantor: e.target.value as GuarantorRequirement }))}>
              <option value="not_required">Not Required</option>
              <option value="optional">Optional</option>
              <option value="required">Required</option>
            </select>

            <label className="ps-conf-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input type="checkbox" checked={!!draft.supportsSplitBilling} onChange={e => setDraft(d => ({ ...d, supportsSplitBilling: e.target.checked }))} />
              Supports Split Billing
            </label>

            <label className="ps-conf-label">Notes (optional)</label>
            <input className="ps-conf-input" value={draft.notes ?? ''} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />

            <div className="ps-ose-quicktext-actions">
              <button className="ps-btn-ghost-dark" onClick={() => setModal(null)}>Cancel</button>
              <button className="ps-conf-btn-primary" disabled={!canSave} onClick={handleSave}>{modal.mode === 'add' ? 'Create' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterPaymentTypeDictionarySection;
