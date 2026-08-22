// src/components/Config/System/StainDictionarySection.tsx
// ─────────────────────────────────────────────────────────────
// Admin screen for the stain catalog — three related, tabbed
// dictionaries. See IStainService.ts's own header comment for the full
// design reasoning (orthogonal Stain Type / Sectioning Protocol,
// composed via quick-order macros for the ordering UX without merging
// the two dimensions in the data).
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import '../../../pathscribe.css';
import { stainTypeService, sectioningProtocolService, stainOrderMacroService } from '../../../services';
import type { StainType, StainCategory, SectioningProtocol, StainOrderMacro } from '../../../services';
import { prepareDuplicate } from '../../../utils/duplicateEntry';
import { findDuplicate } from '../../../utils/validateUnique';

type SubTab = 'types' | 'protocols' | 'macros';

// ── Stain Type editor ───────────────────────────────────────────────────────

const STAIN_CATEGORIES: StainCategory[] = ['Routine', 'Special Stain', 'IHC', 'Immunofluorescence', 'Molecular', 'Other'];

interface StainTypeModalProps {
  mode: 'add' | 'edit';
  entry?: StainType;
  existingEntries: StainType[];
  onSave: (draft: Omit<StainType, 'id' | 'version' | 'updatedBy' | 'updatedAt'>) => void;
  onClose: () => void;
}
const StainTypeModal: React.FC<StainTypeModalProps> = ({ mode, entry, existingEntries, onSave, onClose }) => {
  const [name, setName] = useState(entry?.name ?? '');
  const [category, setCategory] = useState<StainCategory>(entry?.category ?? 'Routine');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [antibodyClone, setAntibodyClone] = useState(entry?.antibodyClone ?? '');
  const [vendor, setVendor] = useState(entry?.vendor ?? '');
  const [turnaround, setTurnaround] = useState(entry?.defaultTurnaroundHours?.toString() ?? '');
  const [defaultBillingCode, setDefaultBillingCode] = useState(entry?.defaultBillingCode ?? '');
  const [excludeFromIhcSequenceCounting, setExcludeFromIhcSequenceCounting] = useState(entry?.excludeFromIhcSequenceCounting ?? false);
  const [active, setActive] = useState(entry?.active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim()) return;
    // Real, direct request: two entries with the same name genuinely
    // confuses staff — checked here, before save, not left to a
    // silent collision later. mode === 'edit' excludes the entry's own
    // real id; in 'add' mode (including duplicate, which prefills from
    // an existing entry but is still a real add) nothing is excluded,
    // so saving a duplicate without renaming it is correctly caught.
    const collision = findDuplicate(existingEntries, { name: name.trim() }, ['name'], mode === 'edit' ? entry?.id : undefined);
    if (collision) { setNameError(`A stain type named "${collision.name}" already exists.`); return; }
    setNameError(null);
    onSave({
      name: name.trim(), category, description: description.trim() || undefined,
      antibodyClone: antibodyClone.trim() || undefined, vendor: vendor.trim() || undefined,
      defaultTurnaroundHours: turnaround ? Number(turnaround) : undefined,
      defaultBillingCode: defaultBillingCode.trim() || undefined,
      // Only meaningful alongside a real defaultBillingCode — never
      // persisted true on its own, which would be a real, confusing
      // combination nothing downstream expects (see the field's own
      // doc comment in IStainService.ts).
      excludeFromIhcSequenceCounting: defaultBillingCode.trim() ? excludeFromIhcSequenceCounting : undefined,
      active,
    });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{mode === 'edit' ? `Edit — ${entry?.name}` : entry ? `Duplicate — ${entry.name}` : 'Add Stain Type'}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Name <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={name} onChange={e => { setName(e.target.value); setNameError(null); }} placeholder="e.g. Ki-67" />
              {nameError && <div className="ps-body-modal-error">{nameError}</div>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="stain-category">Category</label>
              <select id="stain-category" className="ps-conf-select" value={category} onChange={e => setCategory(e.target.value as StainCategory)}>
                {STAIN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Description</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="What this stain is used for" />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Default Billing Code</label>
            <input
              className="ps-conf-input"
              value={defaultBillingCode}
              onChange={e => setDefaultBillingCode(e.target.value.trim())}
              placeholder="e.g. PIN4-PANEL — leave blank to use the generic IHC/special-stain rule"
            />
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              References a Billing Dictionary entry by its billingCode — never a raw CPT code directly (CPT
              values/RVUs/payer rules live only in the Billing Dictionary, the one authoritative source for them).
              Set this for a stain billed differently than the generic first/additional IHC rule, or a real multiplex
              panel (e.g. a "PIN-4"-style combination stain, billed as its own distinct code). Leave blank to use the
              app's generic rule. Free text for now — a real picker against the Billing Dictionary is pending that
              dictionary's own build.
            </p>
            {defaultBillingCode.trim() && category === 'IHC' && (
              <div className="ps-conf-toggle-row ps-conf-section-subtitle--top-gap">
                <div onClick={() => setExcludeFromIhcSequenceCounting(!excludeFromIhcSequenceCounting)}
                  className={`ps-conf-toggle-track ${excludeFromIhcSequenceCounting ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${excludeFromIhcSequenceCounting ? 'ps-conf-toggle-label--active' : ''}`}>
                  Standalone billing unit — exclude from the IHC first/additional sequence
                </span>
              </div>
            )}
            {defaultBillingCode.trim() && category === 'IHC' && (
              <p className="ps-conf-section-subtitle">
                Off (default): this stain still occupies a real position in the specimen's IHC sequence for whatever
                comes after it — use this for a single antibody billed at its own rate but still, clinically, one
                real IHC stain. On: this stain neither gets sequence-assigned itself nor consumes a slot for a
                later stain — use this for a self-contained multiplex/combination panel like "PIN-4," which was
                never really a countable individual IHC stain to begin with.
              </p>
            )}
          </div>
          {(category === 'IHC' || category === 'Immunofluorescence') && (
            <div className="ps-conf-form-row">
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Antibody Clone</label>
                <input className="ps-conf-input" value={antibodyClone} onChange={e => setAntibodyClone(e.target.value)} placeholder="e.g. 30-9" />
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Vendor</label>
                <input className="ps-conf-input" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Ventana" />
              </div>
            </div>
          )}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Default Turnaround (hours)</label>
              <input className="ps-conf-input" type="number" min="0" value={turnaround} onChange={e => setTurnaround(e.target.value)} placeholder="e.g. 24" />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Status</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => setActive(!active)} className={`ps-conf-toggle-track ${active ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${active ? 'ps-conf-toggle-label--active' : ''}`}>{active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'edit' ? 'Save Changes' : 'Add Stain Type'}</button>
        </div>
      </div>
    </div>
  );
};

// ── Sectioning Protocol editor ──────────────────────────────────────────────

interface ProtocolModalProps {
  mode: 'add' | 'edit';
  entry?: SectioningProtocol;
  existingEntries: SectioningProtocol[];
  onSave: (draft: Omit<SectioningProtocol, 'id' | 'version' | 'updatedBy' | 'updatedAt'>) => void;
  onClose: () => void;
}
const ProtocolModal: React.FC<ProtocolModalProps> = ({ mode, entry, existingEntries, onSave, onClose }) => {
  const [name, setName] = useState(entry?.name ?? '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [active, setActive] = useState(entry?.active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim()) return;
    const collision = findDuplicate(existingEntries, { name: name.trim() }, ['name'], mode === 'edit' ? entry?.id : undefined);
    if (collision) { setNameError(`A sectioning protocol named "${collision.name}" already exists.`); return; }
    setNameError(null);
    onSave({ name: name.trim(), description: description.trim() || undefined, active });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{mode === 'edit' ? `Edit — ${entry?.name}` : entry ? `Duplicate — ${entry.name}` : 'Add Sectioning Protocol'}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Name <span className="ps-conf-required">*</span></label>
            <input className="ps-conf-input" value={name} onChange={e => { setName(e.target.value); setNameError(null); }} placeholder="e.g. Level x 3" />
            {nameError && <div className="ps-body-modal-error">{nameError}</div>}
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Description</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="What this sectioning instruction means" />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Status</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => setActive(!active)} className={`ps-conf-toggle-track ${active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${active ? 'ps-conf-toggle-label--active' : ''}`}>{active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'edit' ? 'Save Changes' : 'Add Protocol'}</button>
        </div>
      </div>
    </div>
  );
};

// ── Quick-Order Macro editor ────────────────────────────────────────────────

interface MacroModalProps {
  mode: 'add' | 'edit';
  entry?: StainOrderMacro;
  existingEntries: StainOrderMacro[];
  stainTypes: StainType[];
  protocols: SectioningProtocol[];
  onSave: (draft: Omit<StainOrderMacro, 'id' | 'version' | 'updatedBy' | 'updatedAt'>) => void;
  onClose: () => void;
}
const MacroModal: React.FC<MacroModalProps> = ({ mode, entry, existingEntries, stainTypes, protocols, onSave, onClose }) => {
  const [label, setLabel] = useState(entry?.label ?? '');
  const [stainTypeId, setStainTypeId] = useState(entry?.stainTypeId ?? stainTypes[0]?.id ?? '');
  const [sectioningProtocolId, setSectioningProtocolId] = useState(entry?.sectioningProtocolId ?? protocols[0]?.id ?? '');
  const [sortOrder, setSortOrder] = useState(entry?.sortOrder?.toString() ?? '99');
  const [active, setActive] = useState(entry?.active ?? true);
  const [labelError, setLabelError] = useState<string | null>(null);

  const handleSave = () => {
    if (!label.trim() || !stainTypeId || !sectioningProtocolId) return;
    const collision = findDuplicate(existingEntries, { label: label.trim() }, ['label'], mode === 'edit' ? entry?.id : undefined);
    if (collision) { setLabelError(`A macro labeled "${collision.label}" already exists.`); return; }
    setLabelError(null);
    onSave({ label: label.trim(), stainTypeId, sectioningProtocolId, sortOrder: Number(sortOrder) || 99, active });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{mode === 'edit' ? `Edit — ${entry?.label}` : entry ? `Duplicate — ${entry.label}` : 'Add Quick-Order Macro'}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Label <span className="ps-conf-required">*</span></label>
            <input className="ps-conf-input" value={label} onChange={e => { setLabel(e.target.value); setLabelError(null); }} placeholder='e.g. "H&E x 3"' />
            {labelError && <div className="ps-body-modal-error">{labelError}</div>}
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="macro-stain-type">Stain Type <span className="ps-conf-required">*</span></label>
              <select id="macro-stain-type" className="ps-conf-select" value={stainTypeId} onChange={e => setStainTypeId(e.target.value)}>
                {stainTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="macro-sectioning-protocol">Sectioning Protocol <span className="ps-conf-required">*</span></label>
              <select id="macro-sectioning-protocol" className="ps-conf-select" value={sectioningProtocolId} onChange={e => setSectioningProtocolId(e.target.value)}>
                {protocols.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Sort Order</label>
              <input className="ps-conf-input" type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Status</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => setActive(!active)} className={`ps-conf-toggle-track ${active ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${active ? 'ps-conf-toggle-label--active' : ''}`}>{active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'edit' ? 'Save Changes' : 'Add Macro'}</button>
        </div>
      </div>
    </div>
  );
};

// ── Main section ─────────────────────────────────────────────────────────

const StainDictionarySection: React.FC = () => {
  const [subTab, setSubTab] = useState<SubTab>('types');
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [protocols, setProtocols] = useState<SectioningProtocol[]>([]);
  const [macros, setMacros] = useState<StainOrderMacro[]>([]);
  const [search, setSearch] = useState('');
  const [typeModal, setTypeModal] = useState<{ mode: 'add' | 'edit'; entry?: StainType } | null>(null);
  const [protocolModal, setProtocolModal] = useState<{ mode: 'add' | 'edit'; entry?: SectioningProtocol } | null>(null);
  const [macroModal, setMacroModal] = useState<{ mode: 'add' | 'edit'; entry?: StainOrderMacro } | null>(null);

  const loadAll = () => {
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data); });
    sectioningProtocolService.getAll().then(res => { if (res.ok) setProtocols(res.data); });
    stainOrderMacroService.getAll().then(res => { if (res.ok) setMacros(res.data); });
  };
  useEffect(() => { loadAll(); }, []);

  const filteredTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stainTypes.filter(s => !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [stainTypes, search]);

  // ── Duplicate — opens the Add modal pre-filled with an existing
  // entry's data, matching Protocol Dictionary's own handleClone
  // pattern exactly (confirmed working, per direct user feedback) —
  // NOT an immediate silent save. The user reviews/edits in the form,
  // then a real Save creates a genuinely new entry. mode: 'add' is
  // what makes the save-decision logic below treat this as an add()
  // even though entry is populated for prefill.
  const handleCloneStainType = (source: StainType) => {
    setTypeModal({ mode: 'add', entry: { ...prepareDuplicate(source, 'name'), id: '__clone__' } });
  };
  const handleCloneProtocol = (source: SectioningProtocol) => {
    setProtocolModal({ mode: 'add', entry: { ...prepareDuplicate(source, 'name'), id: '__clone__' } });
  };
  const handleCloneMacro = (source: StainOrderMacro) => {
    setMacroModal({ mode: 'add', entry: { ...prepareDuplicate(source, 'label'), id: '__clone__' } });
  };

  // ── Spreadsheet import/export — also genuinely missing before, unlike
  // Specimen Dictionary which already has this. Same two-step
  // preview-then-apply shape, matched rather than reinvented.
  const stainImportFileInputRef = useRef<HTMLInputElement>(null);
  const [stainImportPreview, setStainImportPreview] = useState<Omit<StainType, 'id' | 'version' | 'updatedBy' | 'updatedAt'>[] | null>(null);
  const [stainImportCounts, setStainImportCounts] = useState({ newCount: 0, updateCount: 0 });

  const handleDownloadStainTypes = () => {
    const rows = stainTypes.map(s => ({
      Name: s.name, Category: s.category, Description: s.description ?? '',
      AntibodyClone: s.antibodyClone ?? '', Vendor: s.vendor ?? '',
      DefaultTurnaroundHours: s.defaultTurnaroundHours ?? '', Active: s.active ? 'Yes' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stain Types');
    XLSX.writeFile(wb, 'StainDictionary.xlsx');
  };

  const handleStainFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = evt => {
      const data = evt.target?.result;
      if (!data) return;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const get = (row: any, ...keys: string[]) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return String(row[k]).trim(); return ''; };
      let newCount = 0, updateCount = 0;
      const preview = rows.map(row => {
        const name = get(row, 'Name', 'name');
        const existing = stainTypes.find(s => s.name.toLowerCase() === name.toLowerCase());
        if (existing) updateCount++; else newCount++;
        const category = (get(row, 'Category', 'category') || existing?.category || 'Routine') as StainCategory;
        const turnaround = get(row, 'DefaultTurnaroundHours', 'defaultTurnaroundHours');
        const activeText = get(row, 'Active', 'active');
        return {
          name, category,
          description: get(row, 'Description', 'description') || existing?.description,
          antibodyClone: get(row, 'AntibodyClone', 'antibodyClone') || existing?.antibodyClone,
          vendor: get(row, 'Vendor', 'vendor') || existing?.vendor,
          defaultTurnaroundHours: turnaround ? Number(turnaround) : existing?.defaultTurnaroundHours,
          active: activeText ? /^(yes|true|y|1)$/i.test(activeText) : (existing?.active ?? true),
        };
      }).filter(d => d.name);

      setStainImportPreview(preview);
      setStainImportCounts({ newCount, updateCount });
    };
    reader.readAsBinaryString(file);
  };

  const handleApplyStainImport = () => {
    if (!stainImportPreview) return;
    Promise.all(stainImportPreview.map(draft => {
      const existing = stainTypes.find(s => s.name.toLowerCase() === draft.name.toLowerCase());
      return existing ? stainTypeService.update(existing.id, draft) : stainTypeService.add(draft);
    })).then(() => {
      setStainImportPreview(null);
      loadAll();
    });
  };

  const stainName = (id: string) => stainTypes.find(s => s.id === id)?.name ?? '—';
  const protocolName = (id: string) => protocols.find(p => p.id === id)?.name ?? '—';

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Stain Dictionary</h3>
          <p className="ps-conf-section-subtitle">
            Stain Type and Sectioning Protocol are independent dimensions — Quick-Order Macros compose
            one of each into a single ordering preset for the UX, without merging them in the data.
          </p>
        </div>
      </div>

      <div className="ps-tab-bar ps-staindict-tabs">
        <button className={`ps-tab-btn ${subTab === 'types' ? 'active' : ''}`} onClick={() => setSubTab('types')}>Stain Types ({stainTypes.length})</button>
        <button className={`ps-tab-btn ${subTab === 'protocols' ? 'active' : ''}`} onClick={() => setSubTab('protocols')}>Sectioning Protocols ({protocols.length})</button>
        <button className={`ps-tab-btn ${subTab === 'macros' ? 'active' : ''}`} onClick={() => setSubTab('macros')}>Quick-Order Macros ({macros.length})</button>
      </div>

      {subTab === 'types' && (
        <>
          <div className="ps-conf-form-row--3">
            <input type="text" placeholder="Search stain types..." value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
            <div className="ps-specdict-header-actions">
              <button className="ps-conf-btn-secondary" onClick={handleDownloadStainTypes}>Export</button>
              <button className="ps-conf-btn-secondary" onClick={() => stainImportFileInputRef.current?.click()}>Import Spreadsheet</button>
              <input ref={stainImportFileInputRef} type="file" hidden accept=".csv,.xlsx" onChange={e => { if (e.target.files?.[0]) handleStainFileUpload(e.target.files[0]); e.target.value = ''; }} />
            </div>
            <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setTypeModal({ mode: 'add' })}>+ Add Stain Type</button>
          </div>
          {stainImportPreview && (
            <div className="ps-conf-import-preview">
              <p>{stainImportCounts.newCount} new, {stainImportCounts.updateCount} to update, parsed from the spreadsheet.</p>
              <button className="ps-conf-btn-primary" onClick={handleApplyStainImport}>Apply Import</button>
              <button className="ps-conf-btn-row" onClick={() => setStainImportPreview(null)}>Cancel</button>
            </div>
          )}
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky">
                  <tr>{['Name', 'Category', 'Clone / Vendor', 'Billing Code', 'Turnaround', 'Status', 'Actions'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredTypes.map(s => (
                    <tr key={s.id} className="ps-conf-tr">
                      <td className="ps-conf-td"><div className="ps-conf-identity-name">{s.name}</div></td>
                      <td className="ps-conf-td">{s.category}</td>
                      <td className="ps-conf-td"><div className="ps-specreq-meta">{[s.antibodyClone, s.vendor].filter(Boolean).join(' · ') || '—'}</div></td>
                      <td className="ps-conf-td">{s.defaultBillingCode || '—'}</td>
                      <td className="ps-conf-td">{s.defaultTurnaroundHours ? `${s.defaultTurnaroundHours}h` : '—'}</td>
                      <td className="ps-conf-td">
                        <span className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${s.active ? 'ps-conf-status-dot--active' : ''}`} />
                          <span className={`ps-conf-status-text ${s.active ? 'ps-conf-status-text--active' : ''}`}>{s.active ? 'Active' : 'Inactive'}</span>
                        </span>
                      </td>
                      <td className="ps-conf-td">
                        <button className="ps-conf-btn-row" onClick={() => setTypeModal({ mode: 'edit', entry: s })}>Edit</button>
                        <button className="ps-conf-btn-row" onClick={() => handleCloneStainType(s)}>Duplicate</button>
                      </td>
                    </tr>
                  ))}
                  {filteredTypes.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={6}>No stain types match the current search.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {subTab === 'protocols' && (
        <>
          <div className="ps-conf-form-row--3">
            <div /><div />
            <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setProtocolModal({ mode: 'add' })}>+ Add Protocol</button>
          </div>
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky"><tr>{['Name', 'Description', 'Status', 'Actions'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr></thead>
                <tbody>
                  {protocols.map(p => (
                    <tr key={p.id} className="ps-conf-tr">
                      <td className="ps-conf-td"><div className="ps-conf-identity-name" data-phi="name">{p.name}</div></td>
                      <td className="ps-conf-td"><div className="ps-specreq-meta">{p.description ?? '—'}</div></td>
                      <td className="ps-conf-td">
                        <span className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${p.active ? 'ps-conf-status-dot--active' : ''}`} />
                          <span className={`ps-conf-status-text ${p.active ? 'ps-conf-status-text--active' : ''}`}>{p.active ? 'Active' : 'Inactive'}</span>
                        </span>
                      </td>
                      <td className="ps-conf-td">
                        <button className="ps-conf-btn-row" onClick={() => setProtocolModal({ mode: 'edit', entry: p })}>Edit</button>
                        <button className="ps-conf-btn-row" onClick={() => handleCloneProtocol(p)}>Duplicate</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {subTab === 'macros' && (
        <>
          <div className="ps-conf-form-row--3">
            <div /><div />
            <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setMacroModal({ mode: 'add' })}>+ Add Macro</button>
          </div>
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky"><tr>{['Label', 'Stain Type', 'Sectioning Protocol', 'Status', 'Actions'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr></thead>
                <tbody>
                  {macros.map(m => (
                    <tr key={m.id} className="ps-conf-tr">
                      <td className="ps-conf-td"><div className="ps-conf-identity-name">{m.label}</div></td>
                      <td className="ps-conf-td">{stainName(m.stainTypeId)}</td>
                      <td className="ps-conf-td">{protocolName(m.sectioningProtocolId)}</td>
                      <td className="ps-conf-td">
                        <span className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${m.active ? 'ps-conf-status-dot--active' : ''}`} />
                          <span className={`ps-conf-status-text ${m.active ? 'ps-conf-status-text--active' : ''}`}>{m.active ? 'Active' : 'Inactive'}</span>
                        </span>
                      </td>
                      <td className="ps-conf-td">
                        <button className="ps-conf-btn-row" onClick={() => setMacroModal({ mode: 'edit', entry: m })}>Edit</button>
                        <button className="ps-conf-btn-row" onClick={() => handleCloneMacro(m)}>Duplicate</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {typeModal && (
        <StainTypeModal mode={typeModal.mode} entry={typeModal.entry} existingEntries={stainTypes}
          onSave={async draft => {
            if (typeModal.mode === 'edit' && typeModal.entry) await stainTypeService.update(typeModal.entry.id, draft);
            else await stainTypeService.add(draft);
            setTypeModal(null); loadAll();
          }}
          onClose={() => setTypeModal(null)} />
      )}
      {protocolModal && (
        <ProtocolModal mode={protocolModal.mode} entry={protocolModal.entry} existingEntries={protocols}
          onSave={async draft => {
            if (protocolModal.mode === 'edit' && protocolModal.entry) await sectioningProtocolService.update(protocolModal.entry.id, draft);
            else await sectioningProtocolService.add(draft);
            setProtocolModal(null); loadAll();
          }}
          onClose={() => setProtocolModal(null)} />
      )}
      {macroModal && (
        <MacroModal mode={macroModal.mode} entry={macroModal.entry} existingEntries={macros} stainTypes={stainTypes} protocols={protocols}
          onSave={async draft => {
            if (macroModal.mode === 'edit' && macroModal.entry) await stainOrderMacroService.update(macroModal.entry.id, draft);
            else await stainOrderMacroService.add(draft);
            setMacroModal(null); loadAll();
          }}
          onClose={() => setMacroModal(null)} />
      )}
    </div>
  );
};

export default StainDictionarySection;
