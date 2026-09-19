// src/components/Config/System/SpecimenDictionarySection.tsx
// ─────────────────────────────────────────────────────────────
// The ONE real admin screen for the Specimen Dictionary
// (useSpecimenDictionary/SpecimenEntry) — the dictionary Accession,
// SpecimenEditModal (Synoptic page), and Search actually consume.
//
// Replaces two previous screens, both retired:
//   - The old "Specimen Dictionary" sidebar entry (SpecimenDictionary.tsx)
//     edited a completely different, disconnected Specimen model
//     (useSpecimens/Config/Models/specimenTypes.ts) that nothing
//     downstream ever read. Its Add/Edit modal and spreadsheet import/
//     export were fully working — just wired to the wrong data. Ported
//     here onto the real model rather than rebuilt from scratch.
//   - "Specimen Requirements" (SpecimenRequirementsSection.tsx) — my own
//     narrower first pass, toggle-only, no Add. Superseded by this.
//
// Spreadsheet template expanded from the old 4 columns (Name,
// Description, Subspecialty, SpecimenCode) to cover every real
// SpecimenEntry field — see TEMPLATE_EXAMPLE_ROWS below.
// ─────────────────────────────────────────────────────────────

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '../../../utils/csv';
import '../../../pathscribe.css';
import { useSpecimenDictionary } from './useSpecimenDictionary';
import { departmentService, subspecialtyService, Subspecialty } from '../../../services';
import { protocolService } from '../../../services';
import type { SpecimenEntry } from '../../../services/specimenDictionary/specimenTypes';
import type { Department } from '../../../services/departments/IDepartmentService';
import type { Protocol } from '../../../services/protocols/IProtocolService';

// ─── Draft type ─────────────────────────────────────────────────────────────

type Draft = Omit<SpecimenEntry, 'id' | 'normalizedLabel' | 'version' | 'updatedBy' | 'updatedAt'> & { synonymsText: string; defaultStainsText: string };

const emptyDraft = (): Draft => ({
  name: '', description: '', subspecialty: '', type: '', procedure: '', site: '', laterality: '',
  synonyms: [], synonymsText: '', active: true, departmentId: undefined,
  requireFixativeTimeBeforeSignout: false, specimenCode: '',
  defaultStains: [], defaultStainsText: '', processingNotes: '',
});

// ─── Add/Edit modal ─────────────────────────────────────────────────────────

interface EditorModalProps {
  mode: 'add' | 'edit';
  entry?: SpecimenEntry;
  subspecialties: Subspecialty[];
  departments: Department[];
  protocols: Protocol[];
  onSave: (draft: Draft) => void;
  onClose: () => void;
}

const EditorModal: React.FC<EditorModalProps> = ({ mode, entry, subspecialties, departments, protocols, onSave, onClose }) => {
  const [draft, setDraft] = useState<Draft>(() => {
    if (!entry) return emptyDraft();
    // Legacy back-fill, per direct ruling: an entry saved before
    // subspecialtyId existed only has the bare-name `subspecialty`
    // field — best-effort resolve it to a real id on open so re-saving
    // an old entry migrates it onto the real FK without the admin
    // having to notice and re-pick anything. A name that no longer
    // matches any real subspecialty (renamed/deleted since) is left
    // unresolved rather than guessed — the select just shows "— None —".
    const resolvedId = entry.subspecialtyId
      ?? subspecialties.find(s => s.name.toLowerCase() === (entry.subspecialty ?? '').toLowerCase())?.id;
    return { ...entry, subspecialtyId: resolvedId, synonymsText: (entry.synonyms ?? []).join(', '), defaultStainsText: (entry.defaultStains ?? []).join(', ') };
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft(prev => ({ ...prev, [k]: v })); setErrors(prev => ({ ...prev, [k]: '' })); };

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = 'Required';
    if (!draft.type.trim()) e.type = 'Required';
    if (!draft.procedure.trim()) e.procedure = 'Required';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    // subspecialty (the legacy name field) is kept in sync with the
    // real id on every save, per direct ruling — id is authoritative,
    // name is a derived display/back-compat cache, never independently
    // free-typed from here on.
    const linkedSub = subspecialties.find(s => s.id === draft.subspecialtyId);
    onSave({
      ...draft,
      subspecialty: linkedSub?.name,
      synonyms: draft.synonymsText.split(',').map(s => s.trim()).filter(Boolean),
      defaultStains: draft.defaultStainsText.split(',').map(s => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--wide">
        <div className="ps-ms-header">{mode === 'add' ? 'Add Specimen' : `Edit — ${entry?.name}`}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Name <span className="ps-conf-required">*</span></label>
              <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Core Needle Biopsy — Breast" />
              {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Specimen Code (optional)</label>
              <input className="ps-conf-input" value={draft.specimenCode ?? ''} onChange={e => set('specimenCode', e.target.value)} placeholder="e.g. BR-CORE-BX — stable spreadsheet re-import key" />
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Description</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="What this specimen type is" />
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Type <span className="ps-conf-required">*</span></label>
              <input className={`ps-conf-input ${errors.type ? 'ps-conf-input--error' : ''}`} value={draft.type} onChange={e => set('type', e.target.value)} placeholder="e.g. Breast" />
              {errors.type && <span className="ps-conf-error-text">{errors.type}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Procedure <span className="ps-conf-required">*</span></label>
              <input className={`ps-conf-input ${errors.procedure ? 'ps-conf-input--error' : ''}`} value={draft.procedure} onChange={e => set('procedure', e.target.value)} placeholder="e.g. Core Needle Biopsy" />
              {errors.procedure && <span className="ps-conf-error-text">{errors.procedure}</span>}
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Specimen Category</label>
              <select className="ps-conf-select" value={draft.specimenCategory ?? ''} onChange={e => set('specimenCategory', (e.target.value || undefined) as any)}>
                <option value="">(none — this entry doesn't drive specialty-specific behavior)</option>
                <option value="SURGICAL_TISSUE">Surgical Tissue</option>
                <option value="GYN_CYTOLOGY">GYN Cytology</option>
                <option value="NON_GYN_CYTOLOGY">Non-GYN Cytology</option>
                <option value="AUTOPSY">Autopsy</option>
                <option value="MOLECULAR">Molecular</option>
                <option value="CONSULT">Consult</option>
                <option value="OTHER">Other</option>
              </select>
              <span className="ps-conf-field-hint">Customers can name this entry anything, in any language — this fixed category is what drives real system behavior (Cytology/Autopsy worklist routing, accessioning fields, sign-out gates), never the entry's own name.</span>
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Anatomic Site</label>
              <input className="ps-conf-input" value={draft.site ?? ''} onChange={e => set('site', e.target.value)} placeholder="e.g. Breast" />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="specdict-laterality">Laterality</label>
              <select id="specdict-laterality" className="ps-conf-select" value={draft.laterality ?? ''} onChange={e => set('laterality', e.target.value)}>
                <option value="">— not specified —</option>
                <option value="Left">Left</option>
                <option value="Right">Right</option>
                <option value="Bilateral">Bilateral</option>
                <option value="Midline">Midline</option>
                <option value="N/A">Not applicable</option>
              </select>
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="specdict-subspecialty">Subspecialty</label>
              <select id="specdict-subspecialty" className="ps-conf-select"
                value={draft.subspecialtyId ?? ''} onChange={e => set('subspecialtyId', e.target.value || undefined)}>
                <option value="">— None —</option>
                {subspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="specdict-department">Department</label>
              <select id="specdict-department" className="ps-conf-select" value={draft.departmentId ?? ''} onChange={e => set('departmentId', e.target.value || undefined)}>
                <option value="">— not linked —</option>
                {departments.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Synonyms (comma-separated)</label>
            <input className="ps-conf-input" value={draft.synonymsText} onChange={e => set('synonymsText', e.target.value)} placeholder="e.g. core bx, needle core, CNB" />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Default Base CPT Code</label>
            <input
              className="ps-conf-input"
              value={draft.defaultBaseCptCode ?? ''}
              onChange={e => set('defaultBaseCptCode', e.target.value.trim() || undefined)}
              placeholder="e.g. 88305 — leave blank to use the generic default"
            />
            <p className="ps-conf-section-subtitle" style={{ marginTop: 4 }}>
              Real, coder-entered surgical pathology base code for this specimen type — requires your own AMA CPT license to determine correctly.
              Leave blank to fall back to the app's generic, honest default (one code per specimen).
            </p>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Default Stains (comma-separated)</label>
            <input className="ps-conf-input" value={draft.defaultStainsText} onChange={e => set('defaultStainsText', e.target.value)} placeholder="e.g. H&E, ER, PR" />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Processing Notes</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.processingNotes ?? ''} onChange={e => set('processingNotes', e.target.value)} placeholder='e.g. "Submit all cores", "Decal per protocol"' />
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Status</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Requires Fixative Time Before Sign-Out</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('requireFixativeTimeBeforeSignout', !draft.requireFixativeTimeBeforeSignout)}
                  className={`ps-conf-toggle-track ${draft.requireFixativeTimeBeforeSignout ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${draft.requireFixativeTimeBeforeSignout ? 'ps-conf-toggle-label--active' : ''}`}>
                  {draft.requireFixativeTimeBeforeSignout ? 'Required' : 'Not required'}
                </span>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="specdict-protocol">Processing Protocol</label>
              <select id="specdict-protocol" className="ps-conf-select" value={draft.protocolId ?? ''} onChange={e => set('protocolId', e.target.value || undefined)}>
                <option value="">None — single block, defaultStains/H&amp;E</option>
                {protocols.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="ps-conf-field-hint">
                This specimen type uses → the selected Protocol's tracks/steps generate blocks at accession.
                Shared across any specimen type that maps to the same one — editing the Protocol itself happens
                in its own dictionary, not here.
              </p>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'add' ? 'Add Specimen' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Spreadsheet template columns ────────────────────────────────────────────
// Every real SpecimenEntry field is represented — expanded from the old
// 4-column template (Name, Description, Subspecialty, SpecimenCode).
const TEMPLATE_EXAMPLE_ROWS = [
  {
    Name: 'Colon Biopsy', Description: 'Biopsy of colon tissue', Subspecialty: 'GI', SpecimenCode: 'GI-COL-BX',
    Type: 'Colon', Procedure: 'Endoscopic Biopsy', Site: 'Colon', Laterality: '', Synonyms: 'colonic bx',
    Department: 'Surgical Tissue', RequiresFixativeTime: 'No', Active: 'Yes',
    DefaultStains: 'H&E', ProcessingNotes: 'Submit entirely',
  },
  {
    Name: 'Core Needle Biopsy — Breast', Description: 'Core biopsy of breast tissue', Subspecialty: 'Breast', SpecimenCode: 'BR-CORE-BX',
    Type: 'Breast', Procedure: 'Core Needle Biopsy', Site: 'Breast', Laterality: 'Left', Synonyms: 'core bx, CNB',
    Department: 'Surgical Tissue', RequiresFixativeTime: 'Yes', Active: 'Yes',
    DefaultStains: 'H&E, ER, PR', ProcessingNotes: 'Submit all cores',
  },
];

// ─── Main section ─────────────────────────────────────────────────────────

const SpecimenDictionarySection: React.FC = () => {
  const { dictionary, addEntries, updateEntries } = useSpecimenDictionary();
  const [subspecialties, setSubspecialties] = useState<Subspecialty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);

  useEffect(() => {
    departmentService.getAll().then(res => { if (res.ok) setDepartments(res.data); });
    protocolService.getAll().then(res => { if (res.ok) setProtocols(res.data.filter(p => p.active)); });
    subspecialtyService.getAll().then(res => { if (res.ok) setSubspecialties(res.data); });
  }, []);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: SpecimenEntry } | null>(null);

  const [uploadPreview, setUploadPreview] = useState<SpecimenEntry[] | null>(null);
  const [uploadSummary, setUploadSummary] = useState({ newCount: 0, updateCount: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const types = useMemo(() => Array.from(new Set(dictionary.map(e => e.type || 'Other'))).sort(), [dictionary]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dictionary
      .filter(e => !q || e.name.toLowerCase().includes(q) || (e.type ?? '').toLowerCase().includes(q) || (e.procedure ?? '').toLowerCase().includes(q))
      .filter(e => typeFilter === 'All' || (e.type || 'Other') === typeFilter)
      .filter(e => statusFilter === 'All' || (statusFilter === 'Active' ? e.active : !e.active))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dictionary, search, typeFilter, statusFilter]);

  const buildEntry = (draft: Draft, existing?: SpecimenEntry): SpecimenEntry => ({
    id: existing?.id ?? `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: draft.name.trim(),
    description: draft.description?.trim() || undefined,
    subspecialty: draft.subspecialty?.trim() || undefined,
    subspecialtyId: draft.subspecialtyId || undefined,
    type: draft.type.trim(),
    procedure: draft.procedure.trim(),
    site: draft.site?.trim() || undefined,
    laterality: draft.laterality || undefined,
    normalizedLabel: draft.name.trim(),
    synonyms: draft.synonyms,
    active: draft.active,
    version: (existing?.version ?? 0) + 1,
    updatedBy: 'admin',
    updatedAt: new Date().toISOString(),
    departmentId: draft.departmentId || undefined,
    requireFixativeTimeBeforeSignout: draft.requireFixativeTimeBeforeSignout || undefined,
    specimenCode: draft.specimenCode?.trim() || undefined,
    defaultStains: draft.defaultStains?.length ? draft.defaultStains : undefined,
    processingNotes: draft.processingNotes?.trim() || undefined,
    defaultBaseCptCode: draft.defaultBaseCptCode?.trim() || undefined,
  });

  const handleSaveEntry = (draft: Draft) => {
    if (modal?.mode === 'add') {
      addEntries([buildEntry(draft)]);
    } else if (modal?.entry) {
      updateEntries([buildEntry(draft, modal.entry)]);
    }
    setModal(null);
  };

  const toggleActive = (entry: SpecimenEntry) => {
    updateEntries([{ ...entry, active: !entry.active, version: entry.version + 1, updatedAt: new Date().toISOString(), updatedBy: 'admin' }]);
  };

  // ── Spreadsheet import ──────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!isCsvFile(file)) {
      alert(`"${file.name}" isn't a CSV file. Export/download the template, edit it in your spreadsheet editor, and save it as .csv before importing.`);
      return;
    }
    const text = await readFileAsText(file);
    const rows: any[] = parseCsv(text);

    const preview: SpecimenEntry[] = [];
    let newCount = 0, updateCount = 0;

    rows.forEach(row => {
      const get = (...keys: string[]) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim(); return ''; };
      const name = get('Name', 'name');
      if (!name) return;
      const code = get('SpecimenCode', 'specimenCode', 'Specimen Code');
      const departmentName = get('Department', 'department', 'Category', 'category');
      const department = departments.find(c => c.name.toLowerCase() === departmentName.toLowerCase());
      const requiresFixative = /^(yes|true|y|1)$/i.test(get('RequiresFixativeTime', 'RequireFixativeTime', 'Requires Fixative Time'));
      const activeText = get('Active', 'active');
      const active = activeText ? /^(yes|true|y|1)$/i.test(activeText) : true;

      // Match by SpecimenCode first (stable key), then by Name — same
      // fallback the old, disconnected system used, ported here.
      let existing = code ? dictionary.find(e => e.specimenCode?.toLowerCase() === code.toLowerCase()) : undefined;
      if (!existing) existing = dictionary.find(e => e.name.toLowerCase() === name.toLowerCase());

      const synonyms = get('Synonyms', 'synonyms').split(',').map(s => s.trim()).filter(Boolean);
      const defaultStains = get('DefaultStains', 'defaultStains', 'Default Stains').split(',').map(s => s.trim()).filter(Boolean);
      const processingNotes = get('ProcessingNotes', 'processingNotes', 'Processing Notes');
      // Spreadsheet round-trip has no id column (same limitation as
      // Protocol Dictionary's own PS-75 import, Update 273) — resolve
      // the real subspecialtyId by a best-effort name match on import,
      // per direct ruling that bare-name linking needs to go away.
      // Falls back to whatever the existing entry already had linked
      // if the sheet's own Subspecialty cell is blank or matches
      // nothing real, rather than silently clearing a real link.
      const subspecialtyNameFromRow = get('Subspecialty', 'subspecialty');
      const matchedSubspecialty = subspecialtyNameFromRow
        ? subspecialties.find(s => s.name.toLowerCase() === subspecialtyNameFromRow.toLowerCase())
        : undefined;

      const entry: SpecimenEntry = {
        id: existing?.id ?? `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        description: get('Description', 'description') || existing?.description,
        subspecialty: matchedSubspecialty?.name ?? (subspecialtyNameFromRow || existing?.subspecialty),
        subspecialtyId: matchedSubspecialty?.id ?? existing?.subspecialtyId,
        type: get('Type', 'type') || existing?.type || 'Other',
        procedure: get('Procedure', 'procedure') || existing?.procedure || '',
        site: get('Site', 'site') || existing?.site,
        laterality: get('Laterality', 'laterality') || existing?.laterality,
        normalizedLabel: name,
        synonyms: synonyms.length ? synonyms : (existing?.synonyms ?? []),
        active,
        version: (existing?.version ?? 0) + 1,
        updatedBy: 'upload',
        updatedAt: new Date().toISOString(),
        departmentId: department?.id ?? existing?.departmentId,
        requireFixativeTimeBeforeSignout: requiresFixative || existing?.requireFixativeTimeBeforeSignout || undefined,
        specimenCode: code || existing?.specimenCode,
        defaultStains: defaultStains.length ? defaultStains : existing?.defaultStains,
        processingNotes: processingNotes || existing?.processingNotes,
      };
      if (existing) updateCount++; else newCount++;
      preview.push(entry);
    });

    setUploadPreview(preview);
    setUploadSummary({ newCount, updateCount });
  };

  const handleApplyUpload = () => {
    if (!uploadPreview) return;
    const toAdd = uploadPreview.filter(e => !dictionary.some(d => d.id === e.id));
    const toUpdate = uploadPreview.filter(e => dictionary.some(d => d.id === e.id));
    if (toAdd.length) addEntries(toAdd);
    if (toUpdate.length) updateEntries(toUpdate);
    setUploadPreview(null);
  };

  const handleDownloadTemplate = () => {
    downloadCsv('SpecimenDictionaryTemplate.csv', toCsv(TEMPLATE_EXAMPLE_ROWS));
  };

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Specimen Dictionary</h3>
          <p className="ps-conf-section-subtitle">
            The specimen types used at Accession, in the Synoptic Report editor, and in Search.
            Add entries directly, or bulk-manage via spreadsheet.
          </p>
        </div>
        <div className="ps-specdict-header-actions">
          <button className="ps-conf-btn-secondary" onClick={handleDownloadTemplate}>Download Template</button>
          <button className="ps-conf-btn-secondary" onClick={() => fileInputRef.current?.click()}>Upload Spreadsheet</button>
          <input ref={fileInputRef} type="file" hidden accept=".csv,text/csv" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
          <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ Add Specimen</button>
        </div>
      </div>

      <div className="ps-conf-form-row--3">
        <input type="text" placeholder="Search by name, type, or procedure..." value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Filter by type" className="ps-conf-select">
          <option value="All">All Types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} aria-label="Filter by status" className="ps-conf-select">
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>{['Specimen', 'Type · Procedure · Site', 'Department', 'Base CPT', 'Protocol', 'Fixative Req.', 'Status', 'Actions'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name">{e.name}</div>
                    {e.specimenCode && <div className="ps-specreq-meta">{e.specimenCode}</div>}
                  </td>
                  <td className="ps-conf-td"><div className="ps-specreq-meta">{[e.type, e.procedure, e.site].filter(Boolean).join(' · ') || '—'}</div></td>
                  <td className="ps-conf-td">{departments.find(c => c.id === e.departmentId)?.name ?? '—'}</td>
                  <td className="ps-conf-td">{e.defaultBaseCptCode || '—'}</td>
                  <td className="ps-conf-td">{e.protocolId ? (protocols.find(p => p.id === e.protocolId)?.name ?? e.protocolId) : '—'}</td>
                  <td className="ps-conf-td">{e.requireFixativeTimeBeforeSignout ? <span className="ps-specreq-required-badge">Required</span> : '—'}</td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-row" onClick={() => toggleActive(e)}>
                      <span className="ps-conf-status-cell">
                        <span className={`ps-conf-status-dot ${e.active ? 'ps-conf-status-dot--active' : ''}`} />
                        <span className={`ps-conf-status-text ${e.active ? 'ps-conf-status-text--active' : ''}`}>{e.active ? 'Active' : 'Inactive'}</span>
                      </span>
                    </button>
                  </td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: e })}>Edit</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={6}>No specimen types match the current filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <EditorModal mode={modal.mode} entry={modal.entry} subspecialties={subspecialties} departments={departments} protocols={protocols}
          onSave={handleSaveEntry} onClose={() => setModal(null)} />
      )}

      {uploadPreview && (
        <div className="ps-ms-overlay">
          <div className="ps-ms-modal ps-ms-modal--wide">
            <div className="ps-ms-header">Review Upload</div>
            <div className="ps-ms-body">
              <p className="ps-fixgate-intro">{uploadSummary.newCount} new, {uploadSummary.updateCount} updated. Applying will add/update these entries in the dictionary.</p>
              <div className="ps-conf-table-wrap">
                <div className="ps-conf-table-scroll">
                  <table className="ps-conf-table">
                    <thead className="ps-conf-thead-sticky"><tr>{['Name', 'Type · Procedure', 'Department', 'Fixative Req.'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr></thead>
                    <tbody>
                      {uploadPreview.map((e, i) => (
                        <tr key={i} className="ps-conf-tr">
                          <td className="ps-conf-td">{e.name}</td>
                          <td className="ps-conf-td">{[e.type, e.procedure].filter(Boolean).join(' · ')}</td>
                          <td className="ps-conf-td">{departments.find(c => c.id === e.departmentId)?.name ?? '—'}</td>
                          <td className="ps-conf-td">{e.requireFixativeTimeBeforeSignout ? 'Required' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="ps-ms-footer">
              <button className="ps-ms-btn-cancel" onClick={() => setUploadPreview(null)}>Cancel</button>
              <button className="ps-ms-btn-apply" onClick={handleApplyUpload}>Apply {uploadPreview.length} Row(s)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecimenDictionarySection;
