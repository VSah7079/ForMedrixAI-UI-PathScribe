// src/components/Config/System/ProtocolDictionarySection.tsx
// ─────────────────────────────────────────────────────────────
// Admin screen for the standalone Protocol dictionary
// (services/protocols/IProtocolService.ts). Second pass on the editor
// specifically: first version packed everything into one narrow
// column and used a flat pill grid for stain selection — doesn't scale
// once a real customer's Stain Dictionary has hundreds of entries.
// Rebuilt with a real 2-column layout and an actual search+multiselect
// for stains, not a static list of checkboxes.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import '../../../pathscribe.css';
import { protocolService, stainTypeService, departmentService } from '../../../services';
import { useSpecimenDictionary } from './useSpecimenDictionary';
import type { SpecimenEntry } from '../../../services/specimenDictionary/specimenTypes';
import type { Department } from '../../../services/departments/IDepartmentService';
import type { Protocol, ProtocolPathway, PathwayTask, StainType } from '../../../services';

type Draft = Omit<Protocol, 'id' | 'version' | 'updatedBy' | 'updatedAt'>;

const emptyTask = (stepOrder: number): PathwayTask => ({
  id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  stepOrder, action: '', stainTypeIds: [], isHold: false,
});
const emptyPathway = (defaultMaterialKind: ProtocolPathway['materialKind'] = 'block'): ProtocolPathway => ({
  id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  pathwayName: '', materialKind: defaultMaterialKind, fixativeType: '10% Neutral Buffered Formalin', requiresDecal: false,
  processingFormat: 'Standard', tasks: [emptyTask(1)],
});
const emptyDraft = (): Draft => ({
  name: '', description: '', requiresTriage: false, triageChecklist: [], pathways: [emptyPathway()], active: true,
});

// ── Spreadsheet import/export — one row per Step ────────────────────────────
// A Protocol's real shape is nested (Protocol → Track → Step → Stains),
// which doesn't map onto a spreadsheet directly. Flattened to one row
// per step, with the Protocol/Track fields repeated on every row that
// belongs to them — some redundancy, but it keeps both directions of
// the conversion straightforward: export is a simple flatMap, import
// groups rows back up by Protocol Name then Track Name (in the order
// they first appear) rather than needing a second, different sheet.

interface ProtocolRow {
  'Protocol Name': string;
  'Description': string;
  'Requires Triage': string;
  'Triage Checklist': string;
  'Track Name': string;
  /** Real, new column, per direct follow-up's own Hybrid Model —
   *  see ProtocolPathway.materialKind's own doc comment
   *  (IProtocolService.ts) for the full reasoning. Round-trips as a
   *  plain "Block"/"Decant" string, same real, human-readable
   *  convention as every other Yes/No column here — never the raw
   *  'block'/'decant' union value directly. */
  'Material Kind': string;
  'Fixative': string;
  'Processing Format': string;
  'Requires Decal': string;
  'Step Order': number;
  'Step Action': string;
  'Slide Count': number | string;
  'Hold': string;
  'Stains': string;
}

function protocolsToRows(protocols: Protocol[], stainTypes: StainType[]): ProtocolRow[] {
  const stainName = (id: string) => stainTypes.find(s => s.id === id)?.name ?? id;
  const rows: ProtocolRow[] = [];
  protocols.forEach(p => {
    p.pathways.forEach(pw => {
      const sortedTasks = [...pw.tasks].sort((a, b) => a.stepOrder - b.stepOrder);
      sortedTasks.forEach(t => {
        rows.push({
          'Protocol Name': p.name,
          'Description': p.description ?? '',
          'Requires Triage': p.requiresTriage ? 'Yes' : 'No',
          'Triage Checklist': (p.triageChecklist ?? []).join('; '),
          'Track Name': pw.pathwayName,
          'Material Kind': pw.materialKind === 'decant' ? 'Decant' : 'Block',
          'Fixative': pw.fixativeType,
          'Processing Format': pw.processingFormat,
          'Requires Decal': pw.requiresDecal ? 'Yes' : 'No',
          'Step Order': t.stepOrder,
          'Step Action': t.action,
          'Slide Count': t.slideCount ?? '',
          'Hold': t.isHold ? 'Yes' : 'No',
          'Stains': t.stainTypeIds.map(stainName).join(', '),
        });
      });
    });
  });
  return rows;
}

interface ParsedProtocolsResult {
  drafts: Draft[];
  unmatchedStainNames: Set<string>;
}

function rowsToProtocols(rows: any[], stainTypes: StainType[]): ParsedProtocolsResult {
  const unmatchedStainNames = new Set<string>();
  const stainIdByName = new Map(stainTypes.map(s => [s.name.trim().toLowerCase(), s.id]));

  // Preserves first-seen order for both protocols and tracks within
  // them, rather than an object whose key order isn't guaranteed to
  // match insertion order across every JS engine.
  const protocolOrder: string[] = [];
  const protocolMap = new Map<string, Draft & { _trackOrder: string[]; _tracksByName: Map<string, ProtocolPathway> }>();

  rows.forEach(row => {
    const protocolName = String(row['Protocol Name'] ?? '').trim();
    const trackName = String(row['Track Name'] ?? '').trim();
    if (!protocolName || !trackName) return;

    if (!protocolMap.has(protocolName)) {
      protocolOrder.push(protocolName);
      protocolMap.set(protocolName, {
        name: protocolName,
        description: String(row['Description'] ?? '').trim() || undefined,
        requiresTriage: String(row['Requires Triage'] ?? '').trim().toLowerCase() === 'yes',
        triageChecklist: String(row['Triage Checklist'] ?? '').split(';').map(s => s.trim()).filter(Boolean),
        pathways: [],
        active: true,
        _trackOrder: [],
        _tracksByName: new Map(),
      });
    }
    const protocol = protocolMap.get(protocolName)!;

    if (!protocol._tracksByName.has(trackName)) {
      protocol._trackOrder.push(trackName);
      protocol._tracksByName.set(trackName, {
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        pathwayName: trackName,
        // Real, honest default — a real import row missing this new
        // column (an older export, or a hand-edited sheet) falls back
        // to 'block', the same safe default emptyPathway() itself
        // uses, rather than failing the whole import.
        materialKind: String(row['Material Kind'] ?? '').trim().toLowerCase() === 'decant' ? 'decant' : 'block',
        fixativeType: String(row['Fixative'] ?? '').trim(),
        requiresDecal: String(row['Requires Decal'] ?? '').trim().toLowerCase() === 'yes',
        processingFormat: String(row['Processing Format'] ?? '').trim(),
        tasks: [],
      });
    }
    const track = protocol._tracksByName.get(trackName)!;

    const stainNames = String(row['Stains'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const stainTypeIds: string[] = [];
    stainNames.forEach(name => {
      const id = stainIdByName.get(name.toLowerCase());
      if (id) stainTypeIds.push(id); else unmatchedStainNames.add(name);
    });

    track.tasks.push({
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      stepOrder: Number(row['Step Order']) || track.tasks.length + 1,
      action: String(row['Step Action'] ?? '').trim(),
      stainTypeIds,
      slideCount: row['Slide Count'] ? Number(row['Slide Count']) : undefined,
      isHold: String(row['Hold'] ?? '').trim().toLowerCase() === 'yes',
    });
  });

  const drafts: Draft[] = protocolOrder.map(name => {
    const p = protocolMap.get(name)!;
    const { _trackOrder, _tracksByName, ...rest } = p;
    return { ...rest, pathways: _trackOrder.map(t => _tracksByName.get(t)!) };
  });

  return { drafts, unmatchedStainNames };
}


// ── Real search + multi-select for stains — a scalable replacement for a ────
// ── flat pill grid, since a real Stain Dictionary can run to hundreds ───────

const StainMultiSelect: React.FC<{
  stainTypes: StainType[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}> = ({ stainTypes, selectedIds, onChange }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selected = selectedIds.map(id => stainTypes.find(s => s.id === id)).filter(Boolean) as StainType[];
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stainTypes
      .filter(s => !selectedIds.includes(s.id))
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
      .slice(0, 30);
  }, [stainTypes, selectedIds, query]);

  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);

  return (
    <div className="ps-protocol-stainselect" ref={wrapRef}>
      {selected.length > 0 && (
        <div className="ps-protocol-stainselect-chips">
          {selected.map(s => (
            <span key={s.id} className="ps-protocol-stainselect-chip">
              {s.name}
              <button type="button" onClick={() => toggle(s.id)} className="ps-protocol-stainselect-chip-remove">×</button>
            </span>
          ))}
        </div>
      )}
      <input
        className="ps-conf-input"
        placeholder="Search stains to add — name or category…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && matches.length > 0 && (
        <div className="ps-protocol-stainselect-dropdown">
          {matches.map(s => (
            <div key={s.id} className="ps-protocol-stainselect-option" onMouseDown={() => toggle(s.id)}>
              <span>{s.name}</span>
              <span className="ps-protocol-stainselect-option-cat">{s.category}</span>
            </div>
          ))}
        </div>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="ps-protocol-stainselect-dropdown">
          <div className="ps-protocol-stainselect-empty">No matching stains.</div>
        </div>
      )}
    </div>
  );
};

// ── Editor modal ─────────────────────────────────────────────────────────

interface EditorModalProps {
  mode: 'add' | 'edit';
  entry?: Protocol;
  stainTypes: StainType[];
  usage: SpecimenEntry[];
  /** Real feature, per direct follow-up's own Hybrid Model — see
   *  ProtocolDictionarySection's own computation for the full
   *  reasoning. Purely a UI default for a NEW track's own
   *  materialKind selector — never overrides an already-set value on
   *  an existing track, and the admin can always change it. */
  defaultsToDecant: boolean;
  onSave: (draft: Draft) => void;
  onRestore: (protocolId: string, version: number) => void;
  onClose: () => void;
}

const EditorModal: React.FC<EditorModalProps> = ({ mode, entry, stainTypes, usage, defaultsToDecant, onSave, onRestore, onClose }) => {
  const [draft, setDraft] = useState<Draft>(entry ? {
    name: entry.name, description: entry.description ?? '', requiresTriage: entry.requiresTriage,
    triageChecklist: entry.triageChecklist ?? [], pathways: entry.pathways, active: entry.active,
  } : emptyDraft());
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(prev => ({ ...prev, [field]: value }));

  const updatePathway = (idx: number, changes: Partial<ProtocolPathway>) => {
    set('pathways', draft.pathways.map((p, i) => i === idx ? { ...p, ...changes } : p));
  };
  const removePathway = (idx: number) => set('pathways', draft.pathways.filter((_, i) => i !== idx));
  const addPathway = () => set('pathways', [...draft.pathways, emptyPathway(defaultsToDecant ? 'decant' : 'block')]);

  const updateTask = (pathwayIdx: number, taskIdx: number, changes: Partial<PathwayTask>) => {
    const pathway = draft.pathways[pathwayIdx];
    const tasks = pathway.tasks.map((t, i) => i === taskIdx ? { ...t, ...changes } : t);
    updatePathway(pathwayIdx, { tasks });
  };
  const removeTask = (pathwayIdx: number, taskIdx: number) => {
    const pathway = draft.pathways[pathwayIdx];
    updatePathway(pathwayIdx, { tasks: pathway.tasks.filter((_, i) => i !== taskIdx) });
  };
  const addTask = (pathwayIdx: number) => {
    const pathway = draft.pathways[pathwayIdx];
    updatePathway(pathwayIdx, { tasks: [...pathway.tasks, emptyTask(pathway.tasks.length + 1)] });
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    set('triageChecklist', [...(draft.triageChecklist ?? []), newChecklistItem.trim()]);
    setNewChecklistItem('');
  };
  const removeChecklistItem = (idx: number) => {
    set('triageChecklist', (draft.triageChecklist ?? []).filter((_, i) => i !== idx));
  };

  const canSave = draft.name.trim().length > 0 && draft.pathways.length > 0 && draft.pathways.every(p => p.pathwayName.trim());

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--protocol">
        <div className="ps-ms-header-row">
          <div className="ps-ms-header">{mode === 'edit' ? `Edit — ${entry?.name}` : entry ? `Add Protocol — cloned from ${entry.name.replace(' (Copy)', '')}` : 'Add Protocol'}</div>
          <button className="ps-ms-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="ps-ms-body ps-protocol-body-grid">

          {/* ── Left column: protocol-level fields ── */}
          <div className="ps-protocol-col-left">
            {mode === 'edit' && (
              <div className="ps-protocol-usage-banner">
                {usage.length === 0 ? (
                  <span>Not currently mapped from any specimen type.</span>
                ) : (
                  <span>
                    Used by {usage.length} specimen type{usage.length === 1 ? '' : 's'}: {usage.map(e => e.name).join(', ')}.
                    Changes here affect all of them.
                  </span>
                )}
              </div>
            )}

            {mode === 'edit' && entry && (entry.history?.length ?? 0) > 0 && (
              <div className="ps-protocol-history-block">
                <button className="ps-conf-btn-row" onClick={() => setShowHistory(s => !s)}>
                  {showHistory ? 'Hide' : 'View'} History ({entry.history!.length} prior version{entry.history!.length === 1 ? '' : 's'})
                </button>
                {showHistory && (
                  <div className="ps-protocol-history-list">
                    {[...entry.history!].reverse().map(h => (
                      <div key={h.version} className="ps-protocol-history-item">
                        <div className="ps-protocol-history-item-meta">
                          <strong>v{h.version}</strong> — {h.snapshot.name} · {h.savedBy} · {new Date(h.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' } as any)}
                        </div>
                        <button className="ps-protocol-remove-btn" onClick={() => onRestore(entry.id, h.version)}>Restore This Version</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Name <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Medical Renal Protocol" />
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
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Description</label>
              <textarea className="ps-conf-input ps-conf-textarea" value={draft.description} onChange={e => set('description', e.target.value)}
                placeholder="What this protocol is for, and which specimen types typically map to it" />
            </div>

            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Requires Triage at the Bench</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('requiresTriage', !draft.requiresTriage)} className={`ps-conf-toggle-track ${draft.requiresTriage ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${draft.requiresTriage ? 'ps-conf-toggle-label--active' : ''}`}>{draft.requiresTriage ? 'Required' : 'Not required'}</span>
              </div>
            </div>

            {draft.requiresTriage && (
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Triage Checklist</label>
                {(draft.triageChecklist ?? []).map((item, i) => (
                  <div key={i} className="ps-protocol-checklist-item">
                    <span>{item}</span>
                    <button className="ps-protocol-remove-btn" onClick={() => removeChecklistItem(i)}>Remove</button>
                  </div>
                ))}
                <div className="ps-protocol-checklist-add">
                  <input className="ps-conf-input" value={newChecklistItem} onChange={e => setNewChecklistItem(e.target.value)}
                    placeholder="e.g. Split core into LM/IF/EM portions" onKeyDown={e => e.key === 'Enter' && addChecklistItem()} />
                  <button className="ps-conf-btn-row" onClick={addChecklistItem}>Add Step</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right column: tracks, independently scrollable ── */}
          <div className="ps-protocol-col-right">
            <div className="ps-protocol-tracks-header">
              <label className="ps-conf-label">Tracks</label>
              <button className="ps-conf-btn-primary" onClick={addPathway}>+ Add Track</button>
            </div>

            <div className="ps-protocol-tracks-scroll">
              {draft.pathways.map((pathway, pIdx) => (
                <div key={pathway.id} className="ps-protocol-track-card">
                  <div className="ps-protocol-track-header">
                    <input className="ps-conf-input ps-protocol-track-name" value={pathway.pathwayName}
                      onChange={e => updatePathway(pIdx, { pathwayName: e.target.value })} placeholder={`Track ${pIdx + 1} name — e.g. Light Microscopy`} />
                    {draft.pathways.length > 1 && (
                      <button className="ps-protocol-remove-btn" onClick={() => removePathway(pIdx)}>Remove Track</button>
                    )}
                  </div>
                  <div className="ps-conf-form-row">
                    {/* Real feature, per direct follow-up's own Hybrid
                        Model: "The pathway definition always dictates
                        whether a block or decant entity is
                        instantiated." Placed first, ahead of the
                        existing fixative/format/decal fields, since
                        this is the real, load-bearing choice that
                        determines what physical object accessioning's
                        own pathway-driven generation actually creates. */}
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">Material Kind</label>
                      <select className="ps-conf-select" value={pathway.materialKind}
                        onChange={e => updatePathway(pIdx, { materialKind: e.target.value as ProtocolPathway['materialKind'] })}>
                        <option value="block">Block (solid tissue, cassette)</option>
                        <option value="decant">Decant (fluid / cytology)</option>
                      </select>
                    </div>
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">Fixative</label>
                      <input className="ps-conf-input" value={pathway.fixativeType} onChange={e => updatePathway(pIdx, { fixativeType: e.target.value })} />
                    </div>
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">Processing Format</label>
                      <input className="ps-conf-input" value={pathway.processingFormat} onChange={e => updatePathway(pIdx, { processingFormat: e.target.value })} />
                    </div>
                    <div className="ps-conf-form-field ps-protocol-decal-field">
                      <label className="ps-conf-label">Requires Decal</label>
                      <div className="ps-conf-toggle-row">
                        <div onClick={() => updatePathway(pIdx, { requiresDecal: !pathway.requiresDecal })}
                          className={`ps-conf-toggle-track ${pathway.requiresDecal ? 'ps-conf-toggle-track--active' : ''}`}>
                          <div className="ps-conf-toggle-thumb" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {pathway.tasks.map((task, tIdx) => (
                    <div key={task.id} className="ps-protocol-step-row">
                      <div className="ps-conf-form-row">
                        <div className="ps-conf-form-field">
                          <label className="ps-conf-label">Step {tIdx + 1} Action</label>
                          <input className="ps-conf-input" value={task.action} onChange={e => updateTask(pIdx, tIdx, { action: e.target.value })}
                            placeholder="e.g. Cut Level 1, Frozen Section" />
                        </div>
                        <div className="ps-conf-form-field ps-protocol-slidecount-field">
                          <label className="ps-conf-label">Slides</label>
                          <input className="ps-conf-input" type="number" min="0" value={task.slideCount ?? ''}
                            onChange={e => updateTask(pIdx, tIdx, { slideCount: e.target.value ? Number(e.target.value) : undefined })} />
                        </div>
                        <div className="ps-conf-form-field ps-protocol-hold-field">
                          <label className="ps-conf-label">Hold</label>
                          <div className="ps-conf-toggle-row">
                            <div onClick={() => updateTask(pIdx, tIdx, { isHold: !task.isHold })}
                              className={`ps-conf-toggle-track ${task.isHold ? 'ps-conf-toggle-track--active' : ''}`}>
                              <div className="ps-conf-toggle-thumb" />
                            </div>
                          </div>
                        </div>
                      </div>
                      {!task.isHold && (
                        <StainMultiSelect
                          stainTypes={stainTypes}
                          selectedIds={task.stainTypeIds}
                          onChange={ids => updateTask(pIdx, tIdx, { stainTypeIds: ids })}
                        />
                      )}
                      <button className="ps-protocol-remove-btn" onClick={() => removeTask(pIdx, tIdx)}>Remove Step</button>
                    </div>
                  ))}
                  <button className="ps-conf-btn-row" onClick={() => addTask(pIdx)}>+ Add Step</button>
                </div>
              ))}
            </div>
          </div>

        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={() => onSave(draft)} disabled={!canSave}>
            {mode === 'add' ? 'Add Protocol' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main section ─────────────────────────────────────────────────────────

const ProtocolDictionarySection: React.FC = () => {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  // protocolsToRows/rowsToProtocols (above) were fully built — the whole
  // point of flattening one row per Step was to make both directions of
  // this conversion straightforward — but never actually wired to a
  // button or file input anywhere in this component. Real bug, not a
  // design gap: the feature existed, nothing could reach it.
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<Draft[] | null>(null);
  const [importUnmatchedStains, setImportUnmatchedStains] = useState<Set<string>>(new Set());

  const handleDownloadProtocols = () => {
    const ws = XLSX.utils.json_to_sheet(protocolsToRows(protocols, stainTypes));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Protocols');
    XLSX.writeFile(wb, 'ProtocolDictionary.xlsx');
  };

  const handleProtocolFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = evt => {
      const data = evt.target?.result;
      if (!data) return;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const { drafts, unmatchedStainNames } = rowsToProtocols(rows, stainTypes);
      setImportPreview(drafts);
      setImportUnmatchedStains(unmatchedStainNames);
    };
    reader.readAsBinaryString(file);
  };

  const handleApplyProtocolImport = () => {
    if (!importPreview) return;
    // Matches by name against what's currently loaded — an import row
    // for a Protocol Name that already exists updates it; anything new
    // is added. No id-based matching, since the spreadsheet round-trip
    // never carries the internal id — only ever the human-readable name.
    Promise.all(importPreview.map(draft => {
      const existing = protocols.find(p => p.name.toLowerCase() === draft.name.toLowerCase());
      return existing ? protocolService.update(existing.id, draft) : protocolService.add(draft);
    })).then(() => {
      setImportPreview(null);
      setImportUnmatchedStains(new Set());
      loadAll();
    });
  };
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: Protocol } | null>(null);
  const { dictionary } = useSpecimenDictionary();
  // Real feature, per direct follow-up's own Hybrid Model: "Sensible
  // UI fallback: Department provides defaults... the
  // configuration UI pre-selects materialKind: 'decant'." Real,
  // deliberate scope: matches by NAME ("Fluid / Cytology"), not a
  // hardcoded id — the real seed id could change, but the real,
  // human-facing department name is what an admin actually configures
  // against. A department renamed away from "Fluid" would correctly
  // stop being treated as fluid/cytology here too.
  const [departments, setDepartments] = useState<Department[]>([]);
  useEffect(() => { departmentService.getAll().then(res => { if (res.ok) setDepartments(res.data); }); }, []);
  const fluidDepartmentIds = useMemo(() =>
    new Set(departments.filter(c => c.name.toLowerCase().includes('fluid') || c.name.toLowerCase().includes('cytology')).map(c => c.id)),
    [departments]
  );

  const loadAll = () => {
    protocolService.getAll().then(res => { if (res.ok) setProtocols(res.data); });
  };
  useEffect(() => {
    loadAll();
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data.filter(s => s.active)); });
  }, []);

  // Usage indicator — which specimen types actually reference each
  // protocol. Computed here rather than stored on the Protocol record
  // itself, since the Specimen Dictionary side is the source of truth
  // for that relationship (protocolId lives on SpecimenEntry).
  const usageFor = (protocolId: string) => dictionary.filter(e => e.protocolId === protocolId);

  const handleSave = (draft: Draft) => {
    const promise = modal?.mode === 'edit' && modal.entry
      ? protocolService.update(modal.entry.id, draft)
      : protocolService.add(draft);
    promise.then(() => { setModal(null); loadAll(); });
  };

  const handleRestore = (protocolId: string, version: number) => {
    protocolService.restoreVersion(protocolId, version).then(() => { setModal(null); loadAll(); });
  };

  // Cloning — opens the Add modal pre-filled with an existing
  // protocol's data. Deep-clones tracks/steps with fresh ids so editing
  // the clone can never accidentally mutate the original's identifiers.
  const handleClone = (source: Protocol) => {
    const cloned: Protocol = {
      ...source,
      id: '__clone__',
      name: `${source.name} (Copy)`,
      pathways: source.pathways.map(pw => ({
        ...pw,
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tasks: pw.tasks.map(t => ({ ...t, id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })),
      })),
    };
    setModal({ mode: 'add', entry: cloned });
  };

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Protocol Dictionary</h3>
          <p className="ps-conf-section-subtitle">
            Standalone, referenceable processing workflows — a Protocol isn't tied to one specimen type. Map it
            from the Specimen Dictionary's "Processing Protocol" field; editing it here cascades to every
            specimen type that references it.
          </p>
        </div>
        <div className="ps-specdict-header-actions">
          <button className="ps-conf-btn-secondary" onClick={handleDownloadProtocols}>Export</button>
          <button className="ps-conf-btn-secondary" onClick={() => importFileInputRef.current?.click()}>Import Spreadsheet</button>
          <input ref={importFileInputRef} type="file" hidden accept=".csv,.xlsx" onChange={e => { if (e.target.files?.[0]) handleProtocolFileUpload(e.target.files[0]); e.target.value = ''; }} />
          <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>+ Add Protocol</button>
        </div>
      </div>

      {importPreview && (
        <div className="ps-conf-import-preview">
          <p>
            {importPreview.length} protocol{importPreview.length === 1 ? '' : 's'} parsed from the spreadsheet.
            {importUnmatchedStains.size > 0 && (
              <> {importUnmatchedStains.size} stain name{importUnmatchedStains.size === 1 ? '' : 's'} didn't match the Diagnostic Catalog and were skipped: {[...importUnmatchedStains].join(', ')}.</>
            )}
          </p>
          <button className="ps-conf-btn-primary" onClick={handleApplyProtocolImport}>Apply Import</button>
          <button className="ps-conf-btn-row" onClick={() => { setImportPreview(null); setImportUnmatchedStains(new Set()); }}>Cancel</button>
        </div>
      )}

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>{['Name', 'Tracks', 'Used By', 'Requires Triage', 'Status', 'Actions'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {protocols.map(p => (
                <tr key={p.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name" data-phi="name">{p.name}</div>
                    {p.description && <div className="ps-specreq-meta">{p.description}</div>}
                  </td>
                  <td className="ps-conf-td">{p.pathways.map(pw => `${pw.pathwayName}${pw.materialKind === 'decant' ? ' (Decant)' : ''}`).join(', ')}</td>
                  <td className="ps-conf-td">{usageFor(p.id).length || '—'}</td>
                  <td className="ps-conf-td">{p.requiresTriage ? 'Yes' : 'No'}</td>
                  <td className="ps-conf-td">
                    <span className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${p.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${p.active ? 'ps-conf-status-text--active' : ''}`}>{p.active ? 'Active' : 'Inactive'}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: p })}>Edit</button>
                    <button className="ps-conf-btn-row" onClick={() => handleClone(p)}>Duplicate</button>
                  </td>
                </tr>
              ))}
              {protocols.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={6}>No protocols yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <EditorModal mode={modal.mode} entry={modal.entry} stainTypes={stainTypes} usage={modal.entry ? usageFor(modal.entry.id) : []}
          defaultsToDecant={!!modal.entry && usageFor(modal.entry.id).some(e => !!e.departmentId && fluidDepartmentIds.has(e.departmentId))}
          onSave={handleSave} onRestore={handleRestore} onClose={() => setModal(null)} />
      )}
    </div>
  );
};

export default ProtocolDictionarySection;
