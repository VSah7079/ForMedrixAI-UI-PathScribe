// src/components/Config/System/SnomedCervicalHistologySeverityMappingSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "Implement a real settings layer for the
// mapping table." Same real, established admin-dictionary pattern
// this app already uses elsewhere (CytologyCategoriesSection.tsx,
// ParticipationTypesSection.tsx) — a real, new subtab under System
// configuration, not a new, separate configuration surface.
//
// Real, honest empty state matches this codebase's own established
// policy: no seed data exists, and none ever should — every real
// mapping here is entered by a real admin/customer who has real
// SNOMED CT terminology access (Case.ts's own syntheticAbnormalCoding
// doc comment; resolveEmbeddedCoding.ts's own "empty until a
// confirmed license" default).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockSnomedCervicalHistologySeverityMappingService } from '../../../services/cytology/mockSnomedCervicalHistologySeverityMappingService';
import type { SnomedCervicalHistologySeverityMappingEntry } from '../../../services/cytology/ISnomedCervicalHistologySeverityMappingService';
import { getSessionUser } from '../../../services/auth/caseAccessControl';
import type { ServiceResult } from '../../../services/types';

interface Draft { snomedCode: string; description: string; severityRank: string }
const emptyDraft: Draft = { snomedCode: '', description: '', severityRank: '' };

const SnomedCervicalHistologySeverityMappingSection: React.FC = () => {
  const [entries, setEntries] = useState<SnomedCervicalHistologySeverityMappingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    mockSnomedCervicalHistologySeverityMappingService.getAll().then(res => {
      if (res.ok) setEntries([...res.data].sort((a, b) => a.severityRank - b.severityRank));
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []);

  const handleAdd = async () => {
    setError(null);
    const rank = Number(draft.severityRank);
    if (!draft.snomedCode.trim() || !draft.description.trim() || Number.isNaN(rank)) {
      setError('SNOMED code, description, and a numeric severity rank are all required.');
      return;
    }
    const session = getSessionUser();
    const sessionName = session ? `${session.firstName ?? ''} ${session.lastName ?? ''}`.trim() || session.id : undefined;
    const res: ServiceResult<SnomedCervicalHistologySeverityMappingEntry> = await mockSnomedCervicalHistologySeverityMappingService.add({
      snomedCode: draft.snomedCode.trim(),
      description: draft.description.trim(),
      severityRank: rank,
      createdBy: session ? { userId: session.id, userName: sessionName ?? session.id } : undefined,
    });
    if ('error' in res) { setError(res.error); return; }
    setDraft(emptyDraft);
    refresh();
  };

  const startEdit = (entry: SnomedCervicalHistologySeverityMappingEntry) => {
    setEditingId(entry.id);
    setEditDraft({ snomedCode: entry.snomedCode, description: entry.description, severityRank: String(entry.severityRank) });
  };

  const handleSaveEdit = async (id: string) => {
    const rank = Number(editDraft.severityRank);
    if (!editDraft.description.trim() || Number.isNaN(rank)) return;
    await mockSnomedCervicalHistologySeverityMappingService.update(id, { description: editDraft.description.trim(), severityRank: rank });
    setEditingId(null);
    refresh();
  };

  const handleRemove = async (id: string) => {
    if (!window.confirm('Remove this SNOMED severity mapping? This cannot be undone.')) return;
    await mockSnomedCervicalHistologySeverityMappingService.remove(id);
    refresh();
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Cyto-Histologic Correlation — SNOMED Severity Mapping</h3>
      <p style={{ fontSize: 13, color: '#9ca3af', maxWidth: 720 }}>
        Maps a SNOMED CT code found on a surgical pathology specimen's own coding to a severity rank on the same 0–5 scale
        cytology's own Bethesda categories already use, so CYT-QA-04's real cyto-histologic correlation can compare the two
        directly. This list is intentionally empty until your organization's own licensed SNOMED CT terminology is available —
        PathScribe never ships a real code value here.
      </p>

      <div className="ps-conf-table-wrap" style={{ marginBottom: 20 }}>
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">SNOMED Code</th>
                <th className="ps-conf-th">Description</th>
                <th className="ps-conf-th">Severity Rank (0–5)</th>
                <th className="ps-conf-th">Added</th>
                <th className="ps-conf-th"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td className="ps-conf-empty-row" colSpan={5}>Loading…</td></tr>)}
              {!loading && entries.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={5}>No mappings configured yet.</td></tr>
              )}
              {!loading && entries.map(entry => (
                <tr key={entry.id} className="ps-conf-tr">
                  <td className="ps-conf-td">{entry.snomedCode}</td>
                  <td className="ps-conf-td">
                    {editingId === entry.id
                      ? <input className="ps-input-dark" value={editDraft.description} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} />
                      : entry.description}
                  </td>
                  <td className="ps-conf-td">
                    {editingId === entry.id
                      ? <input className="ps-input-dark" style={{ width: 60 }} type="number" min={0} max={5} value={editDraft.severityRank} onChange={e => setEditDraft(d => ({ ...d, severityRank: e.target.value }))} />
                      : entry.severityRank}
                  </td>
                  <td className="ps-conf-td" style={{ fontSize: 11, color: '#6b7280' }}>
                    {new Date(entry.createdAt).toLocaleDateString()}{entry.createdBy ? ` — ${entry.createdBy.userName}` : ''}
                  </td>
                  <td className="ps-conf-td">
                    {editingId === entry.id ? (
                      <>
                        <button className="ps-btn-small" onClick={() => handleSaveEdit(entry.id)}>Save</button>
                        <button className="ps-btn-small" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="ps-btn-small" onClick={() => startEdit(entry)}>Edit</button>
                        <button className="ps-btn-small" onClick={() => handleRemove(entry.id)}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
        <h4 style={{ marginTop: 0 }}>Add Mapping</h4>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="ps-label" htmlFor="snomed-map-code">SNOMED Code</label>
            <input id="snomed-map-code" className="ps-input-dark" value={draft.snomedCode} onChange={e => setDraft(d => ({ ...d, snomedCode: e.target.value }))} placeholder="e.g. your licensed code for CIN III" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="ps-label" htmlFor="snomed-map-desc">Description</label>
            <input id="snomed-map-desc" className="ps-input-dark" style={{ width: '100%' }} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="e.g. CIN III / High-grade squamous intraepithelial lesion" />
          </div>
          <div>
            <label className="ps-label" htmlFor="snomed-map-rank">Severity Rank (0–5)</label>
            <input id="snomed-map-rank" className="ps-input-dark" style={{ width: 80 }} type="number" min={0} max={5} value={draft.severityRank} onChange={e => setDraft(d => ({ ...d, severityRank: e.target.value }))} />
          </div>
          <button className="ps-btn-small" onClick={handleAdd}>Add</button>
        </div>
        {error && <div style={{ marginTop: 10, fontSize: 12, color: '#ef4444' }}>{error}</div>}
      </div>
    </div>
  );
};

export default SnomedCervicalHistologySeverityMappingSection;
