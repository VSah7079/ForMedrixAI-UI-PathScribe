// src/pages/AccessionPage/ReportDeficiencyModal.tsx
// ─────────────────────────────────────────────────────────────
// Manual deficiency reporting — distinct from the auto-detected
// order-import dictionary mismatch. Not every real specimen issue gets
// auto-detected (container damage, insufficient volume, a labeling
// discrepancy noticed by the accessioner) — this is how an accessioner
// flags one of those by hand. Raised, not raised-and-resolved: the
// actual resolution happens later, from the dedicated Deficiencies
// work queue (src/pages/QualityAssurancePage.tsx), independent of this
// case's own lifecycle — see that page's own header comment for why.
//
// Real fix, per direct follow-up: "You can have one Deficiency, but in
// the real world you may have multiple." Confirmed directly: the
// underlying storage (services/deficiencies/ — SpecimenDeficiency,
// getBySpecimenId returning an array, raise() creating an independent
// record each time) already fully supported multiple deficiencies per
// specimen/case — this modal's own single-item shape was the actual,
// narrowly-scoped gap. Now manages a real list: existing entries shown
// with their own Remove action, plus an "Add" form (the same
// Issue+Detail fields the single-item version already had) to append a
// new one. Emits the whole, final list on Done — the caller (Accession
// page) owns persistence, this modal only owns the editing session.
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import '../../pathscribe.css';
import type { DeficiencyType } from '@/services/deficiencies/IDeficiencyService';

export interface DeficiencyEntry {
  deficiencyTypeId: string;
  comment: string;
}

interface Props {
  /** Which level this modal instance was opened for — filters
   *  deficiencyTypes down to only the ones actually meaningful in this
   *  context (a type's own `level` of 'case', 'specimen', or 'both').
   *  A type with no `level` set at all (predates this field, or an
   *  admin hasn't classified it yet) is treated as 'both' — shown
   *  either way, the same safe default IDeficiencyService.ts documents. */
  context: 'case' | 'specimen';
  specimenLabel?: string;
  deficiencyTypes: DeficiencyType[];
  existing: DeficiencyEntry[];
  onSave: (deficiencies: DeficiencyEntry[]) => void;
  onClose: () => void;
}

export const ReportDeficiencyModal: React.FC<Props> = ({ context, specimenLabel, deficiencyTypes, existing, onSave, onClose }) => {
  // Real, local editing session — the caller only finds out the result
  // when Done is clicked, same as the single-item version never
  // persisted until Save either.
  const [entries, setEntries] = useState<DeficiencyEntry[]>(existing);

  // Always include every already-selected type even if it wouldn't
  // otherwise match this context — an admin can reclassify a type's
  // level after the fact, and a previously-saved record referencing it
  // shouldn't silently disappear from its own edit dropdown.
  const existingTypeIds = new Set(existing.map(e => e.deficiencyTypeId));
  const applicableTypes = deficiencyTypes.filter(t =>
    !t.level || t.level === 'both' || t.level === context || existingTypeIds.has(t.id)
  );

  const [newTypeId, setNewTypeId] = useState(applicableTypes[0]?.id ?? '');
  const [newComment, setNewComment] = useState('');

  const handleAdd = () => {
    if (!newTypeId) return;
    setEntries(prev => [...prev, { deficiencyTypeId: newTypeId, comment: newComment }]);
    setNewComment('');
  };

  const handleRemove = (idx: number) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const typeName = (id: string) => deficiencyTypes.find(t => t.id === id)?.name ?? id;

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          ⚠ Report Deficiencies{specimenLabel ? ` — Specimen ${specimenLabel}` : ' — Whole Case'}
        </div>
        <div className="ps-ms-body">
          <p className="ps-fixgate-intro">
            Each one creates an open nonconformance record, tracked to resolution independently of this case —
            not something you're expected to resolve right now. A specimen can genuinely have more than one.
          </p>

          {entries.length > 0 && (
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entries.map((entry, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px',
                  background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>{typeName(entry.deficiencyTypeId)}</div>
                    {entry.comment && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{entry.comment}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    title="Remove this deficiency"
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: 2 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="report-deficiency-type">
              {entries.length > 0 ? 'Add another issue' : 'Issue'} <span className="ps-conf-required">*</span>
            </label>
            <select id="report-deficiency-type" className="ps-conf-select" value={newTypeId} onChange={e => setNewTypeId(e.target.value)}>
              {applicableTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Detail</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={newComment} onChange={e => setNewComment(e.target.value)}
              placeholder="What's wrong, specifically?" />
          </div>
          <button type="button" className="ps-btn-secondary" onClick={handleAdd} disabled={!newTypeId}>
            + Add Deficiency
          </button>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={() => onSave(entries)}>
            Done{entries.length > 0 ? ` (${entries.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
