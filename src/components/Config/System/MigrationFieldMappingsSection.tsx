// src/components/Config/System/MigrationFieldMappingsSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Historical Data Migration
// Engine gap's own "field mapping" ask — admin CRUD for
// MigrationFieldMapping. Same real list/add-edit-modal pattern this
// app's own other dictionaries already use.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockMigrationFieldMappingService } from '../../../services/migration/mockMigrationFieldMappingService';
import { MIGRATION_FIELD_CATEGORIES, MIGRATION_TARGET_FIELDS_BY_CATEGORY, type MigrationFieldCategory } from '../../../types/migration/MigrationCaseDraft';
import type { MigrationFieldMapping, NewMigrationFieldMapping } from '../../../services/migration/IMigrationFieldMappingService';

type Draft = NewMigrationFieldMapping;
const emptyDraft = (): Draft => ({ sourceSystemName: '', sourceFieldName: '', targetField: '', category: 'demographics', active: true });

const CATEGORY_LABEL: Record<MigrationFieldCategory, string> = {
  demographics: 'Demographics', accession_detail: 'Accession Detail', gross_micro_text: 'Gross/Micro Text',
  coding: 'SNOMED/ICD-O Coding', slide_block_inventory: 'Slide/Block Inventory',
  pdf_archive: 'PDF Report Archive', synoptic_field: 'Discrete Synoptic Field',
};

const MappingModal: React.FC<{ mode: 'add' | 'edit'; entry?: MigrationFieldMapping; onSave: (draft: Draft) => void; onClose: () => void }> = ({ mode, entry, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(entry ? { ...entry } : emptyDraft());
  const isSynoptic = draft.category === 'synoptic_field';

  return (
    <div data-capture-hide="true" className="ps-conf-backdrop" onClick={onClose}>
      <div className="ps-conf-modal ps-conf-modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="ps-conf-modal-header">{mode === 'add' ? 'Add Field Mapping' : 'Edit Field Mapping'}</div>
        <div className="ps-conf-modal-body">
          <label className="ps-label" htmlFor="mfm-source-system">Legacy Source System</label>
          <input id="mfm-source-system" className="ps-conf-input" value={draft.sourceSystemName} onChange={e => setDraft({ ...draft, sourceSystemName: e.target.value })} placeholder="e.g. LegacyLIS-Cerner" />

          <label className="ps-label" htmlFor="mfm-source-field">Source Field Name</label>
          <input id="mfm-source-field" className="ps-conf-input" value={draft.sourceFieldName} onChange={e => setDraft({ ...draft, sourceFieldName: e.target.value })} placeholder="e.g. PT_FNAME" />

          <label className="ps-label" htmlFor="mfm-category">Category</label>
          <select id="mfm-category" className="ps-conf-select" value={draft.category}
            onChange={e => setDraft({ ...draft, category: e.target.value as MigrationFieldCategory, targetField: '' })}>
            {MIGRATION_FIELD_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>

          <label className="ps-label" htmlFor="mfm-target-field">Target Field</label>
          {isSynoptic ? (
            <input id="mfm-target-field" className="ps-conf-input" value={draft.targetField} onChange={e => setDraft({ ...draft, targetField: e.target.value })} placeholder="e.g. Tumor Size" />
          ) : (
            <select id="mfm-target-field" className="ps-conf-select" value={draft.targetField} onChange={e => setDraft({ ...draft, targetField: e.target.value })}>
              <option value="">— select target field —</option>
              {MIGRATION_TARGET_FIELDS_BY_CATEGORY[draft.category].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}

          <label className="ps-label" htmlFor="mfm-transform-note">Transform Note (optional)</label>
          <input id="mfm-transform-note" className="ps-conf-input" value={draft.transformNote ?? ''} onChange={e => setDraft({ ...draft, transformNote: e.target.value })} placeholder="e.g. convert MM/DD/YYYY to ISO" />
        </div>
        <div className="ps-conf-modal-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" onClick={() => onSave(draft)} disabled={!draft.sourceSystemName.trim() || !draft.sourceFieldName.trim() || !draft.targetField.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
};

const MigrationFieldMappingsSection: React.FC = () => {
  const [entries, setEntries] = useState<MigrationFieldMapping[]>([]);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: MigrationFieldMapping } | null>(null);
  const [sourceFilter, setSourceFilter] = useState('All');

  const refresh = () => { mockMigrationFieldMappingService.getAll().then(res => { if (res.ok) setEntries(res.data); }); };
  useEffect(() => { refresh(); }, []);

  const sourceSystems = Array.from(new Set(entries.map(e => e.sourceSystemName)));
  const visible = entries.filter(e => sourceFilter === 'All' || e.sourceSystemName === sourceFilter);

  const handleSave = async (draft: Draft) => {
    if (modal?.mode === 'edit' && modal.entry) await mockMigrationFieldMappingService.update(modal.entry.id, draft);
    else await mockMigrationFieldMappingService.add(draft);
    setModal(null);
    refresh();
  };

  return (
    <div className="ps-conf-page">
      <div className="ps-conf-row">
        <div>
          <h2 className="ps-conf-section-title">Migration Field Mappings</h2>
          <p className="ps-conf-section-subtitle ps-conf-section-subtitle--spaced">
            Real, admin-editable mapping from a legacy LIS's own source field names to this app's own migration
            target fields — scoped per source system, since a customer with many institutions may migrate from
            more than one legacy system.
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'add' })}>+ Add Mapping</button>
      </div>

      {sourceSystems.length > 0 && (
        <select className="ps-conf-select" style={{ marginBottom: 12, maxWidth: 280 }} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="All">All source systems</option>
          {sourceSystems.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      <div className="ps-conf-card">
        {visible.map(e => (
          <div key={e.id} className="ps-conf-row">
            <span className="ps-conf-value">
              {e.sourceSystemName} · {e.sourceFieldName} → {e.targetField}
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ps-conf-text-3, #94a3b8)' }}>
                {CATEGORY_LABEL[e.category]}{!e.active ? ' · Inactive' : ''}
              </span>
            </span>
            <div className="ps-conf-row-actions">
              <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', entry: e })}>Edit</button>
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="ps-conf-empty-row">No field mappings on file.</div>}
      </div>

      {modal && <MappingModal mode={modal.mode} entry={modal.entry} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
};

export default MigrationFieldMappingsSection;
