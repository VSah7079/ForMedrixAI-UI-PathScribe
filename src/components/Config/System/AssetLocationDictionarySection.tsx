// src/components/Config/System/AssetLocationDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "it all needs to be wired." Investigation
// found the Asset Location Dictionary (services/assetLocation/) — real,
// governed, tested, seeded with real example data — had no admin UI
// anywhere, meaning a real admin had no way to even define a real
// mortuary storage_slot, let alone see resolveMortuaryStorageOccupancy.ts's
// own real occupancy read. Same real CRUD shape as
// DepartmentsSection.tsx/PhysiciansSection.tsx (status/autoCreated/verify),
// deliberately simplified — this dictionary has no retention floor,
// grossing template, or Case Mask concerns of its own.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { assetLocationDictionaryService } from '../../../services';
import { caseRouter } from '../../../services/cases/CaseRouter';
import type { AssetLocationEntry, AssetLocationType } from '@/types/assetLocation/AssetLocationEntry';
import { resolveMortuaryStorageOccupancy } from '@/services/autopsy/resolveMortuaryStorageOccupancy';

const LOCATION_TYPE_LABEL: Record<AssetLocationType, string> = {
  building: 'Building', room: 'Room', storage_unit: 'Storage Unit', storage_slot: 'Storage Slot',
  workstation: 'Workstation', archive_shelf: 'Archive Shelf', other: 'Other',
};

type Draft = Omit<AssetLocationEntry, 'id' | 'status' | 'autoCreated' | 'autoCreatedAt' | 'autoCreatedNote' | 'normalizedLabel' | 'synonyms' | 'version' | 'updatedBy' | 'updatedAt'> & { active: boolean };

const emptyDraft = (): Draft => ({ name: '', locationType: 'storage_slot', description: '', active: true });

interface EditorModalProps {
  mode: 'add' | 'edit';
  entry?: AssetLocationEntry;
  allLocations: AssetLocationEntry[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const EditorModal: React.FC<EditorModalProps> = ({ mode, entry, allLocations, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(
    entry ? { name: entry.name, locationType: entry.locationType, parentLocationId: entry.parentLocationId, description: entry.description ?? '', active: entry.status !== 'Inactive' } : emptyDraft(),
  );
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(prev => ({ ...prev, [k]: v }));
  const canSave = draft.name.trim().length > 0;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{mode === 'add' ? 'Add Asset Location' : `Edit — ${entry?.name}`}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Name <span className="ps-conf-required">*</span></label>
            <input className="ps-conf-input" value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Mortuary Cooler 1 — Tray A" />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Location Type</label>
            <select className="ps-conf-select" value={draft.locationType} onChange={e => set('locationType', e.target.value as AssetLocationType)}>
              {(Object.keys(LOCATION_TYPE_LABEL) as AssetLocationType[]).map(t => (
                <option key={t} value={t}>{LOCATION_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Parent Location (optional)</label>
            <select className="ps-conf-select" value={draft.parentLocationId ?? ''} onChange={e => set('parentLocationId', e.target.value || undefined)}>
              <option value="">— none —</option>
              {allLocations.filter(l => l.id !== entry?.id).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Description</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.description ?? ''} onChange={e => set('description', e.target.value)} />
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
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" disabled={!canSave} onClick={() => onSave(draft)}>
            {mode === 'add' ? 'Add Location' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AssetLocationDictionarySection: React.FC = () => {
  const [locations, setLocations] = useState<AssetLocationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: AssetLocationEntry } | null>(null);
  const [tab, setTab] = useState<'dictionary' | 'occupancy'>('dictionary');
  // Real, per resolveMortuaryStorageOccupancy.ts's own real signature
  // — every real specimen's own locationHistory, gathered across every
  // real case this admin can see (case-level access control already
  // applies via caseRouter.getAll() itself, same as every other real
  // caller). Only real Autopsy cases carry a real body/specimen worth
  // checking against mortuary storage_slot occupancy.
  const [occupancyLoading, setOccupancyLoading] = useState(false);
  const [specimenHistories, setSpecimenHistories] = useState<import('@/types/case/Material').MaterialLocation[][]>([]);

  useEffect(() => {
    assetLocationDictionaryService.getAll().then(res => {
      if (res.ok) setLocations(res.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (tab !== 'occupancy') return;
    setOccupancyLoading(true);
    caseRouter.getAll(undefined, { includeOrchestration: true }).then(res => {
      if (res.ok) {
        const histories = res.data
          .filter(c => (c as any).autopsy)
          .flatMap(c => (c.specimens ?? []).map(s => s.locationHistory ?? []));
        setSpecimenHistories(histories);
      }
      setOccupancyLoading(false);
    });
  }, [tab]);

  const filtered = locations.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) || (l.description ?? '').toLowerCase().includes(search.toLowerCase()));

  const occupancy = resolveMortuaryStorageOccupancy(locations, specimenHistories);

  const persist = async (draft: Draft) => {
    const { active, ...rest } = draft;
    const payload = { ...rest, normalizedLabel: draft.name.trim().toLowerCase(), synonyms: [] as string[], status: (active ? 'Active' : 'Inactive') as 'Active' | 'Inactive' };
    if (modal?.mode === 'add') {
      const res = await assetLocationDictionaryService.add({ ...payload, autoCreated: false, version: 1, updatedBy: 'admin', updatedAt: new Date().toISOString() });
      if (res.ok) setLocations(prev => [...prev, res.data]);
    } else if (modal?.entry) {
      const res = await assetLocationDictionaryService.update(modal.entry.id, payload);
      if (res.ok) setLocations(prev => prev.map(l => l.id === res.data.id ? res.data : l));
    }
    setModal(null);
  };

  const handleVerify = async (id: string) => {
    const res = await assetLocationDictionaryService.verify(id);
    if (res.ok) setLocations(prev => prev.map(l => l.id === id ? res.data : l));
  };

  if (loading) return <div className="ps-conf-loading">Loading asset locations...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Asset Location Dictionary</h3>
          <p className="ps-conf-section-subtitle">
            The governed reference list for physical/asset locations — mortuary storage, workstations, archive shelves — that MaterialLocation's own free-text entries are checked against.
          </p>
        </div>
        {tab === 'dictionary' && (
          <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>+ Add Location</button>
        )}
      </div>

      <div className="ps-conf-form-row">
        <button className={tab === 'dictionary' ? 'ps-btn-primary' : 'ps-btn-ghost-dark'} onClick={() => setTab('dictionary')}>Dictionary</button>
        <button className={tab === 'occupancy' ? 'ps-btn-primary' : 'ps-btn-ghost-dark'} onClick={() => setTab('occupancy')}>Mortuary Storage Occupancy</button>
      </div>

      {tab === 'dictionary' && (
        <>
          <div className="ps-conf-form-row">
            <input type="text" placeholder="Search by name or description..." value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
          </div>
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky">
                  <tr>
                    {['Name', 'Type', 'Parent', 'Status', 'Actions'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id} className="ps-conf-tr">
                      <td className="ps-conf-td">
                        <div className="ps-conf-identity-name">{l.name}</div>
                        {l.description && <div className="ps-conf-identity-sub">{l.description}</div>}
                      </td>
                      <td className="ps-conf-td">{LOCATION_TYPE_LABEL[l.locationType]}</td>
                      <td className="ps-conf-td">{l.parentLocationId ? (locations.find(p => p.id === l.parentLocationId)?.name ?? '—') : '—'}</td>
                      <td className="ps-conf-td">
                        <div className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${l.status === 'Active' ? 'ps-conf-status-dot--active' : l.status === 'Unverified' ? 'ps-conf-status-dot--pending' : ''}`} />
                          <span className={`ps-conf-status-text ${l.status === 'Active' ? 'ps-conf-status-text--active' : l.status === 'Unverified' ? 'ps-conf-status-text--pending' : ''}`}>{l.status}</span>
                        </div>
                        {l.autoCreated && (
                          <div className="ps-conf-auto-note" title={l.autoCreatedNote}>Auto-created{l.autoCreatedAt ? ` ${l.autoCreatedAt}` : ''}</div>
                        )}
                      </td>
                      <td className="ps-conf-td">
                        <div className="ps-conf-row-actions">
                          {l.status === 'Unverified' && <button className="ps-conf-btn-verify" onClick={() => handleVerify(l.id)}>Verify</button>}
                          <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: l })}>Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td className="ps-conf-empty-row" colSpan={5}>No asset locations match the current filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'occupancy' && (
        <div className="ps-conf-table-wrap">
          {occupancyLoading ? (
            <div className="ps-conf-loading">Loading occupancy...</div>
          ) : (
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky">
                  <tr>{['Storage Slot', 'Status'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {occupancy.map(entry => (
                    <tr key={entry.location.id} className="ps-conf-tr">
                      <td className="ps-conf-td">{entry.location.name}</td>
                      <td className="ps-conf-td">
                        <span className={`ps-conf-status-text ${entry.occupied ? 'ps-conf-status-text--pending' : 'ps-conf-status-text--active'}`}>
                          {entry.occupied ? 'Occupied' : 'Available'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {occupancy.length === 0 && (
                    <tr><td className="ps-conf-empty-row" colSpan={2}>No real storage_slot locations defined yet — add one from the Dictionary tab.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modal && <EditorModal mode={modal.mode} entry={modal.entry} allLocations={locations} onSave={persist} onClose={() => setModal(null)} />}
    </div>
  );
};

export default AssetLocationDictionarySection;
