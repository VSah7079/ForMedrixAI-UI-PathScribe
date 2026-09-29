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
import { useTranslation } from 'react-i18next';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '../../../utils/csv';
import '../../../pathscribe.css';
import { useSpecimenDictionary } from './useSpecimenDictionary';
import { departmentService, subspecialtyService, Subspecialty } from '../../../services';
import { protocolService } from '../../../services';
import type { SpecimenEntry } from '../../../services/specimenDictionary/specimenTypes';
import { buildSpecimenEntry, type SpecimenEntryDraft } from '@/services/specimenDictionary/buildSpecimenEntry';
import { duplicateSpecimenEntry } from '@/services/duplication/duplicateEntities';
import type { Department } from '../../../services/departments/IDepartmentService';
import type { Protocol } from '../../../services/protocols/IProtocolService';

// ─── Draft type ─────────────────────────────────────────────────────────────

type Draft = SpecimenEntryDraft;

const emptyDraft = (): Draft => ({
  name: '', description: '', subspecialty: '', type: '', procedure: '', site: '', laterality: '',
  synonyms: [], synonymsText: '', active: true, departmentId: undefined,
  requireFixativeTimeBeforeSignout: false, specimenCode: '',
  defaultStains: [], defaultStainsText: '', processingNotes: '',
});

// Data key (SpecimenEntry.specimenCategory) stays English; only the
// displayed option text is translated.
const SPECIMEN_CATEGORY_LABEL_KEY: Record<string, string> = {
  SURGICAL_TISSUE: 'specimenDictionarySection.editorModal.categorySurgicalTissue',
  GYN_CYTOLOGY: 'specimenDictionarySection.editorModal.categoryGynCytology',
  NON_GYN_CYTOLOGY: 'specimenDictionarySection.editorModal.categoryNonGynCytology',
  AUTOPSY: 'specimenDictionarySection.editorModal.categoryAutopsy',
  MOLECULAR: 'specimenDictionarySection.editorModal.categoryMolecular',
  CONSULT: 'specimenDictionarySection.editorModal.categoryConsult',
  OTHER: 'specimenDictionarySection.editorModal.categoryOther',
};

// Data key (SpecimenEntry.laterality) stays English; only the
// displayed option text is translated.
const LATERALITY_LABEL_KEY: Record<string, string> = {
  Left: 'specimenDictionarySection.editorModal.lateralityLeft',
  Right: 'specimenDictionarySection.editorModal.lateralityRight',
  Bilateral: 'specimenDictionarySection.editorModal.lateralityBilateral',
  Midline: 'specimenDictionarySection.editorModal.lateralityMidline',
  'N/A': 'specimenDictionarySection.editorModal.lateralityNotApplicable',
};

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
  const { t } = useTranslation();
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
    if (!draft.name.trim()) e.name = t('common.required');
    if (!draft.type.trim()) e.type = t('common.required');
    if (!draft.procedure.trim()) e.procedure = t('common.required');
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
        <div className="ps-ms-header">{mode === 'add' ? t('specimenDictionarySection.editorModal.addHeader') : t('specimenDictionarySection.editorModal.editHeader', { name: entry?.name })}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.nameLabel')} <span className="ps-conf-required">*</span></label>
              <input className={`ps-conf-input ${errors.name ? 'ps-conf-input--error' : ''}`} value={draft.name} onChange={e => set('name', e.target.value)} placeholder={t('specimenDictionarySection.editorModal.namePlaceholder')} />
              {errors.name && <span className="ps-conf-error-text">{errors.name}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.specimenCodeLabel')}</label>
              <input className="ps-conf-input" value={draft.specimenCode ?? ''} onChange={e => set('specimenCode', e.target.value)} placeholder={t('specimenDictionarySection.editorModal.specimenCodePlaceholder')} />
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.descriptionLabel')}</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.description ?? ''} onChange={e => set('description', e.target.value)} placeholder={t('specimenDictionarySection.editorModal.descriptionPlaceholder')} />
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.typeLabel')} <span className="ps-conf-required">*</span></label>
              <input className={`ps-conf-input ${errors.type ? 'ps-conf-input--error' : ''}`} value={draft.type} onChange={e => set('type', e.target.value)} placeholder={t('specimenDictionarySection.editorModal.typePlaceholder')} />
              {errors.type && <span className="ps-conf-error-text">{errors.type}</span>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.procedureLabel')} <span className="ps-conf-required">*</span></label>
              <input className={`ps-conf-input ${errors.procedure ? 'ps-conf-input--error' : ''}`} value={draft.procedure} onChange={e => set('procedure', e.target.value)} placeholder={t('specimenDictionarySection.editorModal.procedurePlaceholder')} />
              {errors.procedure && <span className="ps-conf-error-text">{errors.procedure}</span>}
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.categoryLabel')}</label>
              <select className="ps-conf-select" value={draft.specimenCategory ?? ''} onChange={e => set('specimenCategory', (e.target.value || undefined) as any)}>
                <option value="">{t('specimenDictionarySection.editorModal.categoryNone')}</option>
                <option value="SURGICAL_TISSUE">{t(SPECIMEN_CATEGORY_LABEL_KEY.SURGICAL_TISSUE)}</option>
                <option value="GYN_CYTOLOGY">{t(SPECIMEN_CATEGORY_LABEL_KEY.GYN_CYTOLOGY)}</option>
                <option value="NON_GYN_CYTOLOGY">{t(SPECIMEN_CATEGORY_LABEL_KEY.NON_GYN_CYTOLOGY)}</option>
                <option value="AUTOPSY">{t(SPECIMEN_CATEGORY_LABEL_KEY.AUTOPSY)}</option>
                <option value="MOLECULAR">{t(SPECIMEN_CATEGORY_LABEL_KEY.MOLECULAR)}</option>
                <option value="CONSULT">{t(SPECIMEN_CATEGORY_LABEL_KEY.CONSULT)}</option>
                <option value="OTHER">{t(SPECIMEN_CATEGORY_LABEL_KEY.OTHER)}</option>
              </select>
              <span className="ps-conf-field-hint">{t('specimenDictionarySection.editorModal.categoryHint')}</span>
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.siteLabel')}</label>
              <input className="ps-conf-input" value={draft.site ?? ''} onChange={e => set('site', e.target.value)} placeholder={t('specimenDictionarySection.editorModal.sitePlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="specdict-laterality">{t('specimenDictionarySection.editorModal.lateralityLabel')}</label>
              <select id="specdict-laterality" className="ps-conf-select" value={draft.laterality ?? ''} onChange={e => set('laterality', e.target.value)}>
                <option value="">{t('specimenDictionarySection.editorModal.lateralityNotSpecified')}</option>
                <option value="Left">{t(LATERALITY_LABEL_KEY.Left)}</option>
                <option value="Right">{t(LATERALITY_LABEL_KEY.Right)}</option>
                <option value="Bilateral">{t(LATERALITY_LABEL_KEY.Bilateral)}</option>
                <option value="Midline">{t(LATERALITY_LABEL_KEY.Midline)}</option>
                <option value="N/A">{t(LATERALITY_LABEL_KEY['N/A'])}</option>
              </select>
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="specdict-subspecialty">{t('specimenDictionarySection.editorModal.subspecialtyLabel')}</label>
              <select id="specdict-subspecialty" className="ps-conf-select"
                value={draft.subspecialtyId ?? ''} onChange={e => set('subspecialtyId', e.target.value || undefined)}>
                <option value="">{t('specimenDictionarySection.editorModal.subspecialtyNone')}</option>
                {subspecialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="specdict-department">{t('specimenDictionarySection.editorModal.departmentLabel')}</label>
              <select id="specdict-department" className="ps-conf-select" value={draft.departmentId ?? ''} onChange={e => set('departmentId', e.target.value || undefined)}>
                <option value="">{t('specimenDictionarySection.editorModal.departmentNotLinked')}</option>
                {departments.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.synonymsLabel')}</label>
            <input className="ps-conf-input" value={draft.synonymsText} onChange={e => set('synonymsText', e.target.value)} placeholder={t('specimenDictionarySection.editorModal.synonymsPlaceholder')} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.baseCptLabel')}</label>
            <input
              className="ps-conf-input"
              value={draft.defaultBaseCptCode ?? ''}
              onChange={e => set('defaultBaseCptCode', e.target.value.trim() || undefined)}
              placeholder={t('specimenDictionarySection.editorModal.baseCptPlaceholder')}
            />
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              {t('specimenDictionarySection.editorModal.baseCptHint')}
            </p>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.defaultStainsLabel')}</label>
            <input className="ps-conf-input" value={draft.defaultStainsText} onChange={e => set('defaultStainsText', e.target.value)} placeholder={t('specimenDictionarySection.editorModal.defaultStainsPlaceholder')} />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.processingNotesLabel')}</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={draft.processingNotes ?? ''} onChange={e => set('processingNotes', e.target.value)} placeholder={t('specimenDictionarySection.editorModal.processingNotesPlaceholder')} />
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.statusLabel')}</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? t('common.active') : t('common.inactive')}</span>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('specimenDictionarySection.editorModal.requiresFixativeLabel')}</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('requireFixativeTimeBeforeSignout', !draft.requireFixativeTimeBeforeSignout)}
                  className={`ps-conf-toggle-track ${draft.requireFixativeTimeBeforeSignout ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${draft.requireFixativeTimeBeforeSignout ? 'ps-conf-toggle-label--active' : ''}`}>
                  {draft.requireFixativeTimeBeforeSignout ? t('common.required') : t('specimenDictionarySection.editorModal.notRequired')}
                </span>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="specdict-protocol">{t('specimenDictionarySection.editorModal.protocolLabel')}</label>
              <select id="specdict-protocol" className="ps-conf-select" value={draft.protocolId ?? ''} onChange={e => set('protocolId', e.target.value || undefined)}>
                <option value="">{t('specimenDictionarySection.editorModal.protocolNone')}</option>
                {protocols.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="ps-conf-field-hint">
                {t('specimenDictionarySection.editorModal.protocolHint')}
              </p>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'add' ? t('specimenDictionarySection.editorModal.addHeader') : t('specimenDictionarySection.saveChangesBtn')}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Spreadsheet template columns ────────────────────────────────────────────
// Every real SpecimenEntry field is represented — expanded from the old
// 4-column template (Name, Description, Subspecialty, SpecimenCode).
// Column headers and their values stay English — exported/imported
// spreadsheet data, same convention as every other dictionary's own
// CSV template in this sweep.
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
  const { t } = useTranslation();
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

  // Draft → stored entry lives in services/specimenDictionary/buildSpecimenEntry.ts
  // (it keeps every field the form doesn't show; see that file for the
  // data-loss bug it fixed). Add vs update keys off the modal's mode, never
  // off whether an entry was passed in (a duplicate passes one for an add).
  const handleSaveEntry = (draft: Draft) => {
    const opts = { now: new Date().toISOString(), newId: () => `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, updatedBy: 'admin' };
    if (modal?.mode === 'add') {
      addEntries([buildSpecimenEntry(draft, undefined, opts)]);
    } else if (modal?.entry) {
      updateEntries([buildSpecimenEntry(draft, modal.entry, opts)]);
    }
    setModal(null);
  };

  // Duplicate (PS-73): the Add form pre-filled from an existing entry. The
  // matching keys (specimen code, synonyms) are cleared; see
  // services/duplication/duplicateEntities.ts.
  const handleDuplicate = (source: SpecimenEntry) =>
    setModal({ mode: 'add', entry: duplicateSpecimenEntry(source, name => t('common.copyOfName', { name })) });

  const toggleActive = (entry: SpecimenEntry) => {
    updateEntries([{ ...entry, active: !entry.active, version: entry.version + 1, updatedAt: new Date().toISOString(), updatedBy: 'admin' }]);
  };

  // ── Spreadsheet import ──────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!isCsvFile(file)) {
      alert(t('specimenDictionarySection.upload.invalidFileType', { fileName: file.name }));
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
          <h3 className="ps-conf-section-title">{t('specimenDictionarySection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('specimenDictionarySection.subtitle')}
          </p>
        </div>
        <div className="ps-specdict-header-actions">
          <button className="ps-conf-btn-secondary" onClick={handleDownloadTemplate}>{t('specimenDictionarySection.downloadTemplateBtn')}</button>
          <button className="ps-conf-btn-secondary" onClick={() => fileInputRef.current?.click()}>{t('specimenDictionarySection.uploadSpreadsheetBtn')}</button>
          <input ref={fileInputRef} type="file" hidden accept=".csv,text/csv" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
          <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ {t('specimenDictionarySection.editorModal.addHeader')}</button>
        </div>
      </div>

      <div className="ps-conf-form-row--3">
        <input type="text" placeholder={t('specimenDictionarySection.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label={t('specimenDictionarySection.filterByTypeAria')} className="ps-conf-select">
          <option value="All">{t('specimenDictionarySection.allTypesOption')}</option>
          {types.map(ty => <option key={ty} value={ty}>{ty}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} aria-label={t('specimenDictionarySection.filterByStatusAria')} className="ps-conf-select">
          <option value="All">{t('specimenDictionarySection.allStatusesOption')}</option>
          <option value="Active">{t('common.active')}</option>
          <option value="Inactive">{t('common.inactive')}</option>
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                {[
                  t('specimenDictionarySection.table.specimen'),
                  t('specimenDictionarySection.table.typeProcedureSite'),
                  t('specimenDictionarySection.table.department'),
                  t('specimenDictionarySection.table.baseCpt'),
                  t('specimenDictionarySection.table.protocol'),
                  t('specimenDictionarySection.table.fixativeReq'),
                  t('specimenDictionarySection.table.status'),
                  t('specimenDictionarySection.table.actions'),
                ].map(h => <th key={h} className="ps-conf-th">{h}</th>)}
              </tr>
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
                  <td className="ps-conf-td">{e.requireFixativeTimeBeforeSignout ? <span className="ps-specreq-required-badge">{t('common.required')}</span> : '—'}</td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-row" onClick={() => toggleActive(e)}>
                      <span className="ps-conf-status-cell">
                        <span className={`ps-conf-status-dot ${e.active ? 'ps-conf-status-dot--active' : ''}`} />
                        <span className={`ps-conf-status-text ${e.active ? 'ps-conf-status-text--active' : ''}`}>{e.active ? t('common.active') : t('common.inactive')}</span>
                      </span>
                    </button>
                  </td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: e })}>{t('common.edit')}</button>
                      <button className="ps-conf-btn-row" onClick={() => handleDuplicate(e)}>{t('common.duplicate')}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={6}>{t('specimenDictionarySection.emptyRow')}</td></tr>}
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
            <div className="ps-ms-header">{t('specimenDictionarySection.reviewUpload.header')}</div>
            <div className="ps-ms-body">
              <p className="ps-fixgate-intro">{t('specimenDictionarySection.reviewUpload.summary', { newCount: uploadSummary.newCount, updateCount: uploadSummary.updateCount })}</p>
              <div className="ps-conf-table-wrap">
                <div className="ps-conf-table-scroll">
                  <table className="ps-conf-table">
                    <thead className="ps-conf-thead-sticky">
                      <tr>
                        {[
                          t('specimenDictionarySection.reviewUpload.nameHeader'),
                          t('specimenDictionarySection.reviewUpload.typeProcedureHeader'),
                          t('specimenDictionarySection.table.department'),
                          t('specimenDictionarySection.table.fixativeReq'),
                        ].map(h => <th key={h} className="ps-conf-th">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadPreview.map((e, i) => (
                        <tr key={i} className="ps-conf-tr">
                          <td className="ps-conf-td">{e.name}</td>
                          <td className="ps-conf-td">{[e.type, e.procedure].filter(Boolean).join(' · ')}</td>
                          <td className="ps-conf-td">{departments.find(c => c.id === e.departmentId)?.name ?? '—'}</td>
                          <td className="ps-conf-td">{e.requireFixativeTimeBeforeSignout ? t('common.required') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="ps-ms-footer">
              <button className="ps-ms-btn-cancel" onClick={() => setUploadPreview(null)}>{t('common.cancel')}</button>
              <button className="ps-ms-btn-apply" onClick={handleApplyUpload}>{t('specimenDictionarySection.reviewUpload.applyBtn', { count: uploadPreview.length })}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecimenDictionarySection;
