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
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '../../../utils/csv';
import '../../../pathscribe.css';
import { protocolService, stainTypeService, departmentService, fixativeDictionaryService, processingFormatDictionaryService } from '../../../services';
import { useSpecimenDictionary } from './useSpecimenDictionary';
import type { SpecimenEntry } from '../../../services/specimenDictionary/specimenTypes';
import type { Department } from '../../../services/departments/IDepartmentService';
import type { Protocol, ProtocolPathway, PathwayTask, StainType, FixativeDictionaryEntry, ProcessingFormatDictionaryEntry } from '../../../services';
import { isPathwayCountValid } from '../../../services/protocols/resolvePathwayCountValidation';
import { findDuplicate } from '../../../utils/validateUnique';
import { getActivePerformingLabs } from '../../../utils/performingLabs';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { duplicateProcessingProtocol } from '@/services/duplication/duplicateEntities';

type Draft = Omit<Protocol, 'id' | 'version' | 'updatedBy' | 'updatedAt'>;

const emptyTask = (stepOrder: number): PathwayTask => ({
  id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  stepOrder, action: '', stainTypeIds: [], isHold: false,
});
const emptyPathway = (
  defaultMaterialKind: ProtocolPathway['materialKind'] = 'block',
  defaultFixative = '10% Neutral Buffered Formalin',
  defaultProcessingFormat = 'Standard',
): ProtocolPathway => ({
  id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  pathwayName: '', materialKind: defaultMaterialKind, fixativeType: defaultFixative, requiresDecal: false,
  processingFormat: defaultProcessingFormat, tasks: [emptyTask(1)],
});
const emptyDraft = (defaultFixative?: string, defaultProcessingFormat?: string): Draft => ({
  name: '', description: '', requiresTriage: false, triageChecklist: [],
  pathways: [emptyPathway('block', defaultFixative, defaultProcessingFormat)], active: true,
  performingLabFacilityId: undefined,
});

// ── Spreadsheet import/export — one row per Step ────────────────────────────
// A Protocol's real shape is nested (Protocol → Track → Step → Stains),
// which doesn't map onto a spreadsheet directly. Flattened to one row
// per step, with the Protocol/Track fields repeated on every row that
// belongs to them — some redundancy, but it keeps both directions of
// the conversion straightforward: export is a simple flatMap, import
// groups rows back up by Protocol Name then Track Name (in the order
// they first appear) rather than needing a second, different sheet.
//
// CSV headers and exported values (Yes/No, Block/Decant) are real
// exported/persisted data and stay in English, per the sweep's
// established "exported data stays English" convention.

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
  /** Real, per direct follow-up: "update the spreadsheet to include
   *  the new fields" — round-trips as a blank string when unset,
   *  same real convention as every other optional numeric column
   *  here (Slide Count). See ProtocolPathway.defaultCount's own doc
   *  comment (IProtocolService.ts) for what this actually drives. */
  'Default Block/Decant Count': number | string;
  /** Same real convention as above — see
   *  ProtocolPathway.defaultPieceCount's own doc comment. Blank for
   *  a decant track, same as the admin UI itself (disabled there,
   *  not just blank on export). */
  'Default Piece Count': number | string;
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
          'Default Block/Decant Count': pw.defaultCount ?? '',
          'Default Piece Count': pw.defaultPieceCount ?? '',
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

export interface ParsedProtocolsResult {
  drafts: Draft[];
  unmatchedStainNames: Set<string>;
  /** Real, per direct follow-up: "update the spreadsheet to include
   *  the new fields" — surfaced this real gap along the way:
   *  handleApplyProtocolImport calls protocolService.update/add
   *  directly on imported drafts, entirely bypassing the editor
   *  modal's own canSave validation. An invalid value from a
   *  hand-edited or stale spreadsheet (negative count, a piece count
   *  on a decant track) would otherwise persist silently through
   *  import even though the same value is correctly blocked when
   *  entered by hand. Sanitized here (dropped back to undefined,
   *  never left invalid) with each drop named here for display,
   *  same real "surface it, don't silently succeed" reasoning as
   *  unmatchedStainNames above. */
  invalidPathwayCounts: Set<string>;
}

export function rowsToProtocols(rows: any[], stainTypes: StainType[], t: TFunction): ParsedProtocolsResult {
  const unmatchedStainNames = new Set<string>();
  const invalidPathwayCounts = new Set<string>();
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
      const newTrack: ProtocolPathway = {
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
        // Real, same honest fallback as materialKind above — an
        // older export or a hand-edited sheet with neither column at
        // all leaves both undefined, same as emptyPathway() itself
        // and every protocol that predates this UI. Deliberately
        // checked against '' / undefined, not a bare truthy check —
        // a cell literally containing 0 must still parse as the
        // number 0 (so the real validation below can actually catch
        // and warn about it), not get silently treated the same as
        // an empty cell the way a truthy check would.
        defaultCount: (row['Default Block/Decant Count'] !== '' && row['Default Block/Decant Count'] !== undefined)
          ? Number(row['Default Block/Decant Count']) : undefined,
        defaultPieceCount: (row['Default Piece Count'] !== '' && row['Default Piece Count'] !== undefined)
          ? Number(row['Default Piece Count']) : undefined,
        tasks: [],
      };
      // Real, per this function's own ParsedProtocolsResult doc
      // comment — the same validation the editor modal's canSave
      // applies, run here too, so an invalid spreadsheet value never
      // silently persists through a path canSave never gets a
      // chance to gate. These messages are shown to the admin in the
      // import-preview UI (not exported/persisted data), so they're
      // built from translated strings via the t passed in from the
      // component that owns the file-upload handler.
      if (!isPathwayCountValid(newTrack)) {
        if (newTrack.defaultCount !== undefined && !(Number.isInteger(newTrack.defaultCount) && newTrack.defaultCount > 0)) {
          invalidPathwayCounts.add(t('protocolDictionarySection.importValidation.invalidDefaultCount', {
            protocolName, trackName, value: newTrack.defaultCount,
          }));
          newTrack.defaultCount = undefined;
        }
        if (newTrack.defaultPieceCount !== undefined
          && (!(Number.isInteger(newTrack.defaultPieceCount) && newTrack.defaultPieceCount > 0) || newTrack.materialKind === 'decant')) {
          invalidPathwayCounts.add(
            newTrack.materialKind === 'decant'
              ? t('protocolDictionarySection.importValidation.pieceCountBlockOnly', { protocolName, trackName })
              : t('protocolDictionarySection.importValidation.invalidPieceCount', { protocolName, trackName, value: newTrack.defaultPieceCount })
          );
          newTrack.defaultPieceCount = undefined;
        }
      }
      protocol._tracksByName.set(trackName, newTrack);
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
      slideCount: (row['Slide Count'] !== '' && row['Slide Count'] !== undefined)
        ? Number(row['Slide Count']) : undefined,
      isHold: String(row['Hold'] ?? '').trim().toLowerCase() === 'yes',
    });
  });

  const drafts: Draft[] = protocolOrder.map(name => {
    const p = protocolMap.get(name)!;
    const { _trackOrder, _tracksByName, ...rest } = p;
    return { ...rest, pathways: _trackOrder.map(t => _tracksByName.get(t)!) };
  });

  return { drafts, unmatchedStainNames, invalidPathwayCounts };
}


// ── Real search + multi-select for stains — a scalable replacement for a ────
// ── flat pill grid, since a real Stain Dictionary can run to hundreds ───────

const StainMultiSelect: React.FC<{
  stainTypes: StainType[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}> = ({ stainTypes, selectedIds, onChange }) => {
  const { t } = useTranslation();
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
        placeholder={t('protocolDictionarySection.stainSelect.searchPlaceholder')}
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
          <div className="ps-protocol-stainselect-empty">{t('protocolDictionarySection.stainSelect.noMatches')}</div>
        </div>
      )}
    </div>
  );
};

// ── Editor modal ─────────────────────────────────────────────────────────

interface EditorModalProps {
  mode: 'add' | 'edit';
  entry?: Protocol;
  /** Name of the protocol being duplicated (header only). The copy's own
   *  name is already marked in the user's language, so the header names
   *  the source instead of stripping a marker back off. */
  duplicateOf?: string;
  stainTypes: StainType[];
  fixatives: FixativeDictionaryEntry[];
  processingFormats: ProcessingFormatDictionaryEntry[];
  usage: SpecimenEntry[];
  /** Real, direct follow-up (PS-73): the full current list, for the
   *  same-name uniqueness check below — same shape every other
   *  dictionary's editor modal already takes (see
   *  PhysiciansSection.tsx, StainDictionarySection.tsx). */
  existingEntries: Protocol[];
  /** Real, direct follow-up (PS-75): active performing labs, for the
   *  Performing Lab picker below — same list ProtocolDictionarySection
   *  itself already loads for its own filter/column. */
  labs: Facility[];
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

const EditorModal: React.FC<EditorModalProps> = ({ mode, entry, duplicateOf, stainTypes, fixatives, processingFormats, usage, existingEntries, labs, defaultsToDecant, onSave, onRestore, onClose }) => {
  const { t } = useTranslation();
  // Real, per direct correction — resolves the real, live catalog's
  // own isDefault entry, never a string baked into this component.
  // Undefined (catalog not yet loaded, or no entry marked default)
  // falls back to emptyPathway()'s own hardcoded default, same
  // real safety net every pathway had before this catalog existed.
  const defaultFixativeName = fixatives.find(f => f.isDefault)?.name;
  const defaultProcessingFormatName = processingFormats.find(p => p.isDefault)?.name;
  const [draft, setDraft] = useState<Draft>(entry ? {
    name: entry.name, description: entry.description ?? '', requiresTriage: entry.requiresTriage,
    triageChecklist: entry.triageChecklist ?? [], pathways: entry.pathways, active: entry.active,
    performingLabFacilityId: entry.performingLabFacilityId,
  } : emptyDraft(defaultFixativeName, defaultProcessingFormatName));
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  // Real, direct follow-up (PS-73): Protocol Dictionary already had
  // Duplicate (handleClone, ProtocolDictionarySection's own component)
  // but no uniqueness check backing it up — an admin could save the
  // clone (or any edit) under a name that collides with an existing
  // protocol with nothing catching it. Real, confirmed uses of Protocol
  // name as a de facto key elsewhere: this same file's own spreadsheet
  // round-trip (handleApplyProtocolImport, matches import rows to
  // existing protocols by name.toLowerCase() because the spreadsheet
  // never carries the internal id) and validateUnique.ts's own header
  // comment, which already named this exact dictionary as one of the
  // real, confirmed uses this shared helper serves. Same
  // case-insensitive, id-excluded-on-edit comparison every other
  // dictionary's editor already uses (see StainDictionarySection.tsx,
  // PhysiciansSection.tsx).
  const [nameError, setNameError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft(prev => ({ ...prev, [field]: value }));

  const updatePathway = (idx: number, changes: Partial<ProtocolPathway>) => {
    set('pathways', draft.pathways.map((p, i) => i === idx ? { ...p, ...changes } : p));
  };
  const removePathway = (idx: number) => set('pathways', draft.pathways.filter((_, i) => i !== idx));
  const addPathway = () => set('pathways', [...draft.pathways, emptyPathway(defaultsToDecant ? 'decant' : 'block', defaultFixativeName, defaultProcessingFormatName)]);

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

  // Real, per direct follow-up: "schema validation" — extracted
  // to resolvePathwayCountValidation.ts (services/protocols/) as its
  // own pure, tested function rather than inline here. A real,
  // positive integer when set (undefined/blank stays valid, same as
  // every other optional field here); defaultPieceCount additionally
  // can't be set on a decant track, since it's only meaningful for
  // materialKind: 'block' (IProtocolService.ts's own doc comment).
  const canSave = draft.name.trim().length > 0 && draft.pathways.length > 0
    && draft.pathways.every(p => p.pathwayName.trim())
    && draft.pathways.every(isPathwayCountValid);

  const handleSave = () => {
    // Real, direct follow-up (PS-75): scoped by performingLabFacilityId +
    // name together, same compound-key shape as ContainerTypesSection.tsx/
    // CrosswalkSection.tsx — "Medical Renal Protocol" can exist once
    // globally and once more per lab without colliding, but never twice
    // within the same scope.
    const collision = findDuplicate(existingEntries, { performingLabFacilityId: draft.performingLabFacilityId, name: draft.name.trim() }, ['performingLabFacilityId', 'name'], mode === 'edit' ? entry?.id : undefined);
    if (collision) {
      setNameError(draft.performingLabFacilityId
        ? t('protocolDictionarySection.nameCollisionErrorScoped', { name: collision.name })
        : t('protocolDictionarySection.nameCollisionErrorGlobal', { name: collision.name }));
      return;
    }
    setNameError(null);
    onSave(draft);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal ps-ms-modal--protocol">
        <div className="ps-ms-header-row">
          <div className="ps-ms-header">
            {mode === 'edit'
              ? t('protocolDictionarySection.modal.editTitle', { name: entry?.name })
              : entry
                ? t('protocolDictionarySection.modal.addClonedTitle', { name: duplicateOf ?? entry.name })
                : t('protocolDictionarySection.modal.addTitle')}
          </div>
          <button className="ps-ms-close-btn" onClick={onClose} title={t('common.close')}>✕</button>
        </div>
        <div className="ps-ms-body ps-protocol-body-grid">

          {/* ── Left column: protocol-level fields ── */}
          <div className="ps-protocol-col-left">
            {mode === 'edit' && (
              <div className="ps-protocol-usage-banner">
                {usage.length === 0 ? (
                  <span>{t('protocolDictionarySection.modal.usageBanner.none')}</span>
                ) : (
                  <span>
                    {t('protocolDictionarySection.modal.usageBanner.used', { count: usage.length, names: usage.map(e => e.name).join(', ') })}
                  </span>
                )}
              </div>
            )}

            {mode === 'edit' && entry && (entry.history?.length ?? 0) > 0 && (
              <div className="ps-protocol-history-block">
                <button className="ps-conf-btn-row" onClick={() => setShowHistory(s => !s)}>
                  {t('protocolDictionarySection.modal.history.label', {
                    count: entry.history!.length,
                    toggle: showHistory ? t('protocolDictionarySection.modal.history.toggleHide') : t('protocolDictionarySection.modal.history.toggleView'),
                  })}
                </button>
                {showHistory && (
                  <div className="ps-protocol-history-list">
                    {[...entry.history!].reverse().map(h => (
                      <div key={h.version} className="ps-protocol-history-item">
                        <div className="ps-protocol-history-item-meta">
                          <strong>v{h.version}</strong> — {h.snapshot.name} · {h.savedBy} · {new Date(h.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' } as any)}
                        </div>
                        <button className="ps-protocol-remove-btn" onClick={() => onRestore(entry.id, h.version)}>{t('protocolDictionarySection.modal.restoreVersionBtn')}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('protocolDictionarySection.modal.nameLabel')} <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={draft.name} onChange={e => { set('name', e.target.value); if (nameError) setNameError(null); }} placeholder={t('protocolDictionarySection.modal.namePlaceholder')} />
              {nameError && <div className="ps-body-modal-error">{nameError}</div>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="protocol-performing-lab">{t('protocolDictionarySection.modal.performingLabLabel')}</label>
              <select id="protocol-performing-lab" className="ps-conf-select"
                value={draft.performingLabFacilityId ?? ''}
                onChange={e => { set('performingLabFacilityId', e.target.value || undefined); if (nameError) setNameError(null); }}>
                <option value="">{t('protocolDictionarySection.modal.performingLabAllOption')}</option>
                {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('protocolDictionarySection.modal.statusLabel')}</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('active', !draft.active)} className={`ps-conf-toggle-track ${draft.active ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${draft.active ? 'ps-conf-toggle-label--active' : ''}`}>{draft.active ? t('common.active') : t('common.inactive')}</span>
              </div>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('protocolDictionarySection.modal.descriptionLabel')}</label>
              <textarea className="ps-conf-input ps-conf-textarea" value={draft.description} onChange={e => set('description', e.target.value)}
                placeholder={t('protocolDictionarySection.modal.descriptionPlaceholder')} />
            </div>

            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('protocolDictionarySection.modal.requiresTriageLabel')}</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => set('requiresTriage', !draft.requiresTriage)} className={`ps-conf-toggle-track ${draft.requiresTriage ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${draft.requiresTriage ? 'ps-conf-toggle-label--active' : ''}`}>{draft.requiresTriage ? t('protocolDictionarySection.modal.triageRequired') : t('protocolDictionarySection.modal.triageNotRequired')}</span>
              </div>
            </div>

            {draft.requiresTriage && (
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('protocolDictionarySection.modal.triageChecklistLabel')}</label>
                {(draft.triageChecklist ?? []).map((item, i) => (
                  <div key={i} className="ps-protocol-checklist-item">
                    <span>{item}</span>
                    <button className="ps-protocol-remove-btn" onClick={() => removeChecklistItem(i)}>{t('common.remove')}</button>
                  </div>
                ))}
                <div className="ps-protocol-checklist-add">
                  <input className="ps-conf-input" value={newChecklistItem} onChange={e => setNewChecklistItem(e.target.value)}
                    placeholder={t('protocolDictionarySection.modal.triageItemPlaceholder')} onKeyDown={e => e.key === 'Enter' && addChecklistItem()} />
                  <button className="ps-conf-btn-row" onClick={addChecklistItem}>{t('protocolDictionarySection.modal.triageAddStepBtn')}</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right column: tracks, independently scrollable ── */}
          <div className="ps-protocol-col-right">
            <div className="ps-protocol-tracks-header">
              <label className="ps-conf-label">{t('protocolDictionarySection.modal.tracksLabel')}</label>
              <button className="ps-conf-btn-primary" onClick={addPathway}>{t('protocolDictionarySection.modal.addTrackBtn')}</button>
            </div>

            <div className="ps-protocol-tracks-scroll">
              {draft.pathways.map((pathway, pIdx) => (
                <div key={pathway.id} className="ps-protocol-track-card">
                  <div className="ps-protocol-track-header">
                    <input className="ps-conf-input ps-protocol-track-name" value={pathway.pathwayName}
                      onChange={e => updatePathway(pIdx, { pathwayName: e.target.value })} placeholder={t('protocolDictionarySection.modal.trackNamePlaceholder', { number: pIdx + 1 })} />
                    {draft.pathways.length > 1 && (
                      <button className="ps-protocol-remove-btn" onClick={() => removePathway(pIdx)}>{t('protocolDictionarySection.modal.removeTrackBtn')}</button>
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
                      <label className="ps-conf-label">{t('protocolDictionarySection.modal.materialKindLabel')}</label>
                      <select className="ps-conf-select" value={pathway.materialKind}
                        onChange={e => {
                          const materialKind = e.target.value as ProtocolPathway['materialKind'];
                          // Real, defensive pairing with the
                          // validation above: switching to decant
                          // while a real defaultPieceCount value was
                          // already entered would otherwise leave the
                          // admin stuck — the field becomes disabled
                          // (so it can't be cleared by hand) while
                          // canSave still fails on it. Cleared here
                          // instead, at the one real moment that
                          // makes it stale.
                          updatePathway(pIdx, materialKind === 'decant' ? { materialKind, defaultPieceCount: undefined } : { materialKind });
                        }}>
                        <option value="block">{t('protocolDictionarySection.modal.materialKindBlockOption')}</option>
                        <option value="decant">{t('protocolDictionarySection.modal.materialKindDecantOption')}</option>
                      </select>
                    </div>
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">{t('protocolDictionarySection.modal.fixativeLabel')}</label>
                      <select className="ps-conf-input" value={pathway.fixativeType} onChange={e => updatePathway(pIdx, { fixativeType: e.target.value })}>
                        {/* Real, per direct correction ("why is processingFormat
                            free text when they are all known commodities?" /
                            "fixativeType has the same underlying problem") —
                            a real, closed, catalog-backed picker replacing the
                            old free-text input. An existing pathway's own,
                            already-saved value is always included as an option
                            even if it doesn't match any real, active catalog
                            entry (e.g. a legacy value predating this catalog) —
                            never silently replaced or blanked out on open. */}
                        {!fixatives.some(f => f.name === pathway.fixativeType) && pathway.fixativeType && (
                          <option value={pathway.fixativeType}>{t('protocolDictionarySection.modal.notInDictionaryOption', { value: pathway.fixativeType })}</option>
                        )}
                        {fixatives.map(f => (
                          <option key={f.id} value={f.name}>
                            {f.name}{f.requiresWarningLabel ? ' ⚠️' : ''}{f.regulatoryStatus && f.regulatoryStatus !== 'Active' ? ` (${f.regulatoryStatus})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">{t('protocolDictionarySection.modal.processingFormatLabel')}</label>
                      <select className="ps-conf-input" value={pathway.processingFormat} onChange={e => updatePathway(pIdx, { processingFormat: e.target.value })}>
                        {!processingFormats.some(p => p.name === pathway.processingFormat) && pathway.processingFormat && (
                          <option value={pathway.processingFormat}>{t('protocolDictionarySection.modal.notInDictionaryOption', { value: pathway.processingFormat })}</option>
                        )}
                        {processingFormats.map(p => (
                          <option key={p.id} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="ps-conf-form-field ps-protocol-decal-field">
                      <label className="ps-conf-label">{t('protocolDictionarySection.modal.requiresDecalLabel')}</label>
                      <div className="ps-conf-toggle-row">
                        <div onClick={() => updatePathway(pIdx, { requiresDecal: !pathway.requiresDecal })}
                          className={`ps-conf-toggle-track ${pathway.requiresDecal ? 'ps-conf-toggle-track--active' : ''}`}>
                          <div className="ps-conf-toggle-thumb" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Real, per direct follow-up: "both fields need to
                      be wired into the form state, schema validation,
                      and rendering logic" — defaultCount and
                      defaultPieceCount (IProtocolService.ts) already
                      drove real accession-time generation
                      (generateDefaultMaterial.ts), but had no admin
                      UI at all until now — a real, pre-existing gap
                      the Autopsy Cardiac Sectioning protocol's own
                      defaultCount: 4 first exposed, since every prior
                      protocol left both fields unset. Undefined
                      (blank) keeps producing exactly one block/decant
                      per pathway, same as before this UI existed. */}
                  <div className="ps-conf-form-row">
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">
                        {pathway.materialKind === 'decant' ? t('protocolDictionarySection.modal.defaultDecantCountLabel') : t('protocolDictionarySection.modal.defaultBlockCountLabel')}
                      </label>
                      <input className="ps-conf-input" type="number" min="1" value={pathway.defaultCount ?? ''}
                        placeholder={t('protocolDictionarySection.modal.defaultCountPlaceholder')}
                        onChange={e => updatePathway(pIdx, { defaultCount: e.target.value ? Number(e.target.value) : undefined })} />
                    </div>
                    {/* Only meaningful for materialKind: 'block' — see
                        that field's own doc comment
                        (IProtocolService.ts). Disabled, not hidden,
                        for a decant track, so switching Material Kind
                        back to Block doesn't silently lose whatever
                        value was already entered. */}
                    <div className="ps-conf-form-field">
                      <label className="ps-conf-label">{t('protocolDictionarySection.modal.defaultPieceCountLabel')}</label>
                      <input className="ps-conf-input" type="number" min="1"
                        disabled={pathway.materialKind === 'decant'}
                        value={pathway.defaultPieceCount ?? ''}
                        placeholder={pathway.materialKind === 'decant' ? t('protocolDictionarySection.modal.defaultPieceCountPlaceholderBlockOnly') : t('protocolDictionarySection.modal.defaultPieceCountPlaceholderUnset')}
                        onChange={e => updatePathway(pIdx, { defaultPieceCount: e.target.value ? Number(e.target.value) : undefined })} />
                    </div>
                  </div>

                  {pathway.tasks.map((task, tIdx) => (
                    <div key={task.id} className="ps-protocol-step-row">
                      <div className="ps-conf-form-row">
                        <div className="ps-conf-form-field">
                          <label className="ps-conf-label">{t('protocolDictionarySection.modal.stepActionLabel', { number: tIdx + 1 })}</label>
                          <input className="ps-conf-input" value={task.action} onChange={e => updateTask(pIdx, tIdx, { action: e.target.value })}
                            placeholder={t('protocolDictionarySection.modal.stepActionPlaceholder')} />
                        </div>
                        <div className="ps-conf-form-field ps-protocol-slidecount-field">
                          <label className="ps-conf-label">{t('protocolDictionarySection.modal.slidesLabel')}</label>
                          <input className="ps-conf-input" type="number" min="0" value={task.slideCount ?? ''}
                            onChange={e => updateTask(pIdx, tIdx, { slideCount: e.target.value ? Number(e.target.value) : undefined })} />
                        </div>
                        <div className="ps-conf-form-field ps-protocol-hold-field">
                          <label className="ps-conf-label">{t('protocolDictionarySection.modal.holdLabel')}</label>
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
                      <button className="ps-protocol-remove-btn" onClick={() => removeTask(pIdx, tIdx)}>{t('protocolDictionarySection.modal.removeStepBtn')}</button>
                    </div>
                  ))}
                  <button className="ps-conf-btn-row" onClick={() => addTask(pIdx)}>{t('protocolDictionarySection.modal.trackAddStepBtn')}</button>
                </div>
              ))}
            </div>
          </div>

        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave} disabled={!canSave}>
            {mode === 'add' ? t('protocolDictionarySection.modal.addTitle') : t('protocolDictionarySection.modal.saveChangesBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main section ─────────────────────────────────────────────────────────

const ProtocolDictionarySection: React.FC = () => {
  const { t } = useTranslation();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  // Real, per direct correction ("why is processingFormat free text
  // when they are all known commodities?" / "fixativeType has the
  // same underlying problem") — same real fetch pattern as
  // stainTypes above, never a second, competing way of loading
  // reference data into this component.
  const [fixatives, setFixatives] = useState<FixativeDictionaryEntry[]>([]);
  const [processingFormats, setProcessingFormats] = useState<ProcessingFormatDictionaryEntry[]>([]);
  // protocolsToRows/rowsToProtocols (above) were fully built — the whole
  // point of flattening one row per Step was to make both directions of
  // this conversion straightforward — but never actually wired to a
  // button or file input anywhere in this component. Real bug, not a
  // design gap: the feature existed, nothing could reach it.
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<Draft[] | null>(null);
  const [importUnmatchedStains, setImportUnmatchedStains] = useState<Set<string>>(new Set());
  const [importInvalidPathwayCounts, setImportInvalidPathwayCounts] = useState<Set<string>>(new Set());

  const handleDownloadProtocols = () => {
    downloadCsv('ProtocolDictionary.csv', toCsv(protocolsToRows(protocols, stainTypes)));
  };

  const handleProtocolFileUpload = async (file: File) => {
    if (!isCsvFile(file)) {
      alert(t('protocolDictionarySection.csvUploadError', { fileName: file.name }));
      return;
    }
    const text = await readFileAsText(file);
    const rows = parseCsv(text);
    const { drafts, unmatchedStainNames, invalidPathwayCounts } = rowsToProtocols(rows, stainTypes, t);
    setImportPreview(drafts);
    setImportUnmatchedStains(unmatchedStainNames);
    setImportInvalidPathwayCounts(invalidPathwayCounts);
  };

  const handleApplyProtocolImport = () => {
    if (!importPreview) return;
    // Matches by name against what's currently loaded — an import row
    // for a Protocol Name that already exists updates it; anything new
    // is added. No id-based matching, since the spreadsheet round-trip
    // never carries the internal id — only ever the human-readable name.
    Promise.all(importPreview.map(draft => {
      // Real, direct follow-up (PS-75): the spreadsheet has no
      // Performing Lab column, so every imported draft is global
      // (performingLabFacilityId undefined) — matching must be scoped
      // the same way, or a re-import could silently overwrite a
      // lab-specific protocol that happens to share a name with a
      // global one, instead of adding a new global entry alongside it.
      const existing = protocols.find(p => !p.performingLabFacilityId && p.name.toLowerCase() === draft.name.toLowerCase());
      return existing ? protocolService.update(existing.id, draft) : protocolService.add(draft);
    })).then(() => {
      setImportPreview(null);
      setImportUnmatchedStains(new Set());
      setImportInvalidPathwayCounts(new Set());
      loadAll();
    });
  };
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: Protocol; duplicateOf?: string } | null>(null);
  // Real, direct follow-up (PS-75): same "Performing Lab is going to be
  // a fixture" scoping every other dictionary already has
  // (utils/performingLabs.ts). Loaded once here, passed down to the
  // modal (its own Performing Lab picker) and used for the list's own
  // lab filter/column below.
  const [labs, setLabs] = useState<Facility[]>([]);
  useEffect(() => { getActivePerformingLabs().then(setLabs); }, []);
  const [labFilter, setLabFilter] = useState<'All' | 'Global' | string>('All');
  const filteredProtocols = protocols.filter(p => labFilter === 'All'
    || (labFilter === 'Global' ? !p.performingLabFacilityId : p.performingLabFacilityId === labFilter));
  const labName = (id?: string) => id ? (labs.find(l => l.id === id)?.name ?? id) : t('protocolDictionarySection.labFilter.allLabs');
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
    fixativeDictionaryService.getAll().then(res => { if (res.ok) setFixatives(res.data.filter(f => f.active)); });
    processingFormatDictionaryService.getAll().then(res => { if (res.ok) setProcessingFormats(res.data.filter(p => p.active)); });
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

  // Cloning — opens the Add modal pre-filled with an existing protocol.
  // services/duplication/duplicateEntities.ts deep-copies tracks/tasks with
  // fresh ids (so editing the copy can never touch the original's), starts
  // a new version history, and marks the name in the user's language.
  const handleClone = (source: Protocol) => {
    setModal({ mode: 'add', entry: duplicateProcessingProtocol(source, name => t('common.copyOfName', { name })), duplicateOf: source.name });
  };

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('protocolDictionarySection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('protocolDictionarySection.subtitle')}
          </p>
        </div>
        <div className="ps-specdict-header-actions">
          <button className="ps-conf-btn-secondary" onClick={handleDownloadProtocols}>{t('common.export')}</button>
          <button className="ps-conf-btn-secondary" onClick={() => importFileInputRef.current?.click()}>{t('protocolDictionarySection.importSpreadsheetBtn')}</button>
          <input ref={importFileInputRef} type="file" hidden accept=".csv,text/csv" onChange={e => { if (e.target.files?.[0]) handleProtocolFileUpload(e.target.files[0]); e.target.value = ''; }} />
          <button className="ps-conf-btn-primary" onClick={() => setModal({ mode: 'add' })}>{t('protocolDictionarySection.addProtocolBtn')}</button>
        </div>
      </div>

      {importPreview && (
        <div className="ps-conf-import-preview">
          <p>
            {t('protocolDictionarySection.importPreview.parsed', { count: importPreview.length })}
            {importUnmatchedStains.size > 0 && (
              <> {t('protocolDictionarySection.importPreview.unmatchedStains', { count: importUnmatchedStains.size, names: [...importUnmatchedStains].join(', ') })}</>
            )}
          </p>
          {importInvalidPathwayCounts.size > 0 && (
            <p>
              {t('protocolDictionarySection.importPreview.invalidCounts', { count: importInvalidPathwayCounts.size, details: [...importInvalidPathwayCounts].join('; ') })}
            </p>
          )}
          <button className="ps-conf-btn-primary" onClick={handleApplyProtocolImport}>{t('protocolDictionarySection.importPreview.applyImportBtn')}</button>
          <button className="ps-conf-btn-row" onClick={() => { setImportPreview(null); setImportUnmatchedStains(new Set()); setImportInvalidPathwayCounts(new Set()); }}>{t('common.cancel')}</button>
        </div>
      )}

      {/* Real, direct follow-up (PS-75) — same lab-filter convention as
          ContainerTypesSection.tsx, only shown once real facilities are
          scoped as performing labs so an unconfigured lab list doesn't
          render a pointless single-option dropdown. */}
      {labs.length > 0 && (
        <div className="ps-conf-form-row">
          <select value={labFilter} onChange={e => setLabFilter(e.target.value)} className="ps-conf-select">
            <option value="All">{t('protocolDictionarySection.labFilter.allLabs')}</option>
            <option value="Global">{t('protocolDictionarySection.labFilter.globalOnly')}</option>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>{[
                t('protocolDictionarySection.table.name'),
                t('protocolDictionarySection.table.performingLab'),
                t('protocolDictionarySection.table.tracks'),
                t('protocolDictionarySection.table.usedBy'),
                t('protocolDictionarySection.table.requiresTriage'),
                t('protocolDictionarySection.table.status'),
                t('protocolDictionarySection.table.actions'),
              ].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredProtocols.map(p => (
                <tr key={p.id} className="ps-conf-tr">
                  <td className="ps-conf-td">
                    <div className="ps-conf-identity-name" data-phi="name">{p.name}</div>
                    {p.description && <div className="ps-specreq-meta">{p.description}</div>}
                  </td>
                  <td className="ps-conf-td">{labName(p.performingLabFacilityId)}</td>
                  <td className="ps-conf-td">{p.pathways.map(pw => `${pw.pathwayName}${pw.materialKind === 'decant' ? ' (Decant)' : ''}`).join(', ')}</td>
                  <td className="ps-conf-td">{usageFor(p.id).length || '—'}</td>
                  <td className="ps-conf-td">{p.requiresTriage ? t('common.yes') : t('common.no')}</td>
                  <td className="ps-conf-td">
                    <span className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${p.active ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${p.active ? 'ps-conf-status-text--active' : ''}`}>{p.active ? t('common.active') : t('common.inactive')}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-row" onClick={() => setModal({ mode: 'edit', entry: p })}>{t('common.edit')}</button>
                    <button className="ps-conf-btn-row" onClick={() => handleClone(p)}>{t('common.duplicate')}</button>
                  </td>
                </tr>
              ))}
              {filteredProtocols.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={7}>{protocols.length === 0 ? t('protocolDictionarySection.noProtocolsYet') : t('protocolDictionarySection.noProtocolsMatchFilter')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <EditorModal mode={modal.mode} entry={modal.entry} duplicateOf={modal.duplicateOf} stainTypes={stainTypes} fixatives={fixatives} processingFormats={processingFormats} usage={modal.entry ? usageFor(modal.entry.id) : []} existingEntries={protocols} labs={labs}
          defaultsToDecant={!!modal.entry && usageFor(modal.entry.id).some(e => !!e.departmentId && fluidDepartmentIds.has(e.departmentId))}
          onSave={handleSave} onRestore={handleRestore} onClose={() => setModal(null)} />
      )}
    </div>
  );
};

export default ProtocolDictionarySection;
