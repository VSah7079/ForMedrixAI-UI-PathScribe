// src/components/Config/System/JurisdictionPaymentMappingSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance (Outside Client Support & International
// Financial Class Architecture Specification, Section 3.2 + "Step 1
// should be under System / Financial"): admin CRUD for the per-country
// local-scheme mappings, each pointing at a real Master Payment Type.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockJurisdictionPaymentMappingService } from '../../../services/billing/mockJurisdictionPaymentMappingService';
import { mockMasterPaymentTypeService } from '../../../services/billing/mockMasterPaymentTypeService';
import type { JurisdictionPaymentMapping } from '../../../types/billing/JurisdictionPaymentMapping';
import type { MasterPaymentType } from '../../../types/billing/MasterPaymentType';

function blankDraft(): Partial<JurisdictionPaymentMapping> {
  return { countryCode: '', localSchemeCode: '', localDisplayTerminology: '', masterPaymentTypeId: '', primaryOutboundFormat: '', notes: '' };
}

const JurisdictionPaymentMappingSection: React.FC = () => {
  const [entries, setEntries] = useState<JurisdictionPaymentMapping[]>([]);
  const [masterTypes, setMasterTypes] = useState<MasterPaymentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: JurisdictionPaymentMapping } | null>(null);
  const [draft, setDraft] = useState<Partial<JurisdictionPaymentMapping>>(blankDraft());

  const refresh = () => {
    setLoading(true);
    Promise.all([mockJurisdictionPaymentMappingService.getAll(), mockMasterPaymentTypeService.getAll()]).then(([mapRes, typeRes]) => {
      if (mapRes.ok) setEntries(mapRes.data);
      if (typeRes.ok) setMasterTypes(typeRes.data);
      setLoading(false);
    });
  };
  useEffect(refresh, []);

  const masterTypeName = (id: string) => masterTypes.find(t => t.id === id)?.displayName ?? id;

  const openAdd = () => { setDraft(blankDraft()); setModal({ mode: 'add' }); };
  const openEdit = (e: JurisdictionPaymentMapping) => { setDraft(e); setModal({ mode: 'edit', entry: e }); };

  const canSave = !!draft.countryCode?.trim() && !!draft.localSchemeCode?.trim()
    && !!draft.localDisplayTerminology?.trim() && !!draft.masterPaymentTypeId && !!draft.primaryOutboundFormat?.trim();

  const handleSave = async () => {
    if (!canSave) return;
    const payload = {
      countryCode: draft.countryCode!.trim().toUpperCase(),
      localSchemeCode: draft.localSchemeCode!.trim().toUpperCase(),
      localDisplayTerminology: draft.localDisplayTerminology!.trim(),
      masterPaymentTypeId: draft.masterPaymentTypeId!,
      primaryOutboundFormat: draft.primaryOutboundFormat!.trim(),
      notes: draft.notes?.trim() || undefined,
    };
    const res = modal?.mode === 'add'
      ? await mockJurisdictionPaymentMappingService.add(payload)
      : await mockJurisdictionPaymentMappingService.update(modal!.entry!.id, payload);
    if (!res.ok) { alert((res as any).error); return; }
    setModal(null);
    refresh();
  };

  const toggleActive = async (e: JurisdictionPaymentMapping) => {
    const res = e.active ? await mockJurisdictionPaymentMappingService.deactivate(e.id) : await mockJurisdictionPaymentMappingService.reactivate(e.id);
    if (res.ok) refresh();
  };

  const countries = Array.from(new Set(entries.map(e => e.countryCode))).sort();
  const displayed = entries
    .filter(e => showInactive || e.active)
    .filter(e => !countryFilter || e.countryCode === countryFilter)
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.localSchemeCode.localeCompare(b.localSchemeCode));

  if (loading) return <div className="ps-conf-loading">Loading Jurisdiction Payment Mappings…</div>;

  return (
    <div>
      <div className="ps-defic-page-header">
        <h2 className="ps-defic-page-title">🌍 Jurisdiction Payment Mapping</h2>
        <p className="ps-defic-page-subtitle">
          Real, per-country local payment schemes, each mapped to a jurisdiction-agnostic Master Payment Type.
          The Accessioning Screen's own Primary Jurisdiction selector resolves against these.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select className="ps-conf-select" value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="ps-sub-toggle-wrap" style={{ cursor: 'pointer' }}>
            <div onClick={() => setShowInactive(v => !v)} className={showInactive ? 'ps-sub-toggle-track ps-sub-toggle-track--on' : 'ps-sub-toggle-track ps-sub-toggle-track--off'}>
              <div className={showInactive ? 'ps-sub-toggle-thumb ps-sub-toggle-thumb--on' : 'ps-sub-toggle-thumb ps-sub-toggle-thumb--off'} />
            </div>
            <span className="ps-tat-hint-text">Show inactive</span>
          </label>
        </div>
        <button className="ps-conf-btn-primary" onClick={openAdd}>+ Add Mapping</button>
      </div>

      <div className="ps-conf-table-wrap">
        <table className="ps-conf-table">
          <thead>
            <tr>
              <th className="ps-conf-th">Country</th>
              <th className="ps-conf-th">Local Scheme</th>
              <th className="ps-conf-th">Local Terminology</th>
              <th className="ps-conf-th">Master Payment Type</th>
              <th className="ps-conf-th">Outbound Format</th>
              <th className="ps-conf-th">Status</th>
              <th className="ps-conf-th"></th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && <tr><td className="ps-conf-td" colSpan={7}>No mappings match.</td></tr>}
            {displayed.map(e => (
              <tr key={e.id} style={{ opacity: e.active ? 1 : 0.5 }}>
                <td className="ps-conf-td">{e.countryCode}</td>
                <td className="ps-conf-td"><code style={{ fontSize: 12 }}>{e.localSchemeCode}</code></td>
                <td className="ps-conf-td">{e.localDisplayTerminology}</td>
                <td className="ps-conf-td">{masterTypeName(e.masterPaymentTypeId)}</td>
                <td className="ps-conf-td">{e.primaryOutboundFormat}</td>
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
            <div className="ps-ose-quicktext-title">{modal.mode === 'add' ? 'Add Jurisdiction Mapping' : `Edit ${modal.entry?.localSchemeCode}`}</div>

            <label className="ps-conf-label">Country Code</label>
            <input className="ps-conf-input" value={draft.countryCode ?? ''} onChange={e => setDraft(d => ({ ...d, countryCode: e.target.value }))}
              placeholder='e.g. "US", "UK", "DE", "CA_ON" (province-specific where relevant)' />

            <label className="ps-conf-label">Local Scheme Code</label>
            <input className="ps-conf-input" value={draft.localSchemeCode ?? ''} onChange={e => setDraft(d => ({ ...d, localSchemeCode: e.target.value }))}
              placeholder="e.g. DE_GKV" />

            <label className="ps-conf-label">Local Display Terminology</label>
            <input className="ps-conf-input" value={draft.localDisplayTerminology ?? ''} onChange={e => setDraft(d => ({ ...d, localDisplayTerminology: e.target.value }))}
              placeholder="e.g. Gesetzliche Krankenversicherung — real local-language name" />

            <label className="ps-conf-label">Master Payment Type</label>
            <select className="ps-conf-select" value={draft.masterPaymentTypeId ?? ''} onChange={e => setDraft(d => ({ ...d, masterPaymentTypeId: e.target.value }))}>
              <option value="">— Select —</option>
              {masterTypes.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.displayName}</option>)}
            </select>

            <label className="ps-conf-label">Primary Outbound Format</label>
            <input className="ps-conf-input" value={draft.primaryOutboundFormat ?? ''} onChange={e => setDraft(d => ({ ...d, primaryOutboundFormat: e.target.value }))}
              placeholder="e.g. X12 837P" />

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

export default JurisdictionPaymentMappingSection;
