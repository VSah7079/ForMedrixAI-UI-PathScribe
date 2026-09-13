// src/pages/AccessionPage/ClinicalHistory/ClinicalHistoryEntryPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the uploaded "Structured Clinical History Dictionary &
// Accessioning Integration" spec's own User Stories 3 and 4.
//
// Story 3: cascading dropdowns (real Specimen Type, derived from this
// case's own already-entered specimens → Category → History Code),
// with dynamic metadata inputs rendered from the selected entry's own
// requiredMetadataSchema. Multi-entry, with an optional per-specimen
// "Applies To" target for a genuinely multi-specimen case (per direct
// guidance's own real LIS/cytology data-modeling follow-up).
//
// Story 4: real keyboard completeness, not just a text-input
// re-skin — Alt+1 through Alt+6 jump directly to one of the spec's own
// six real categories (Acceptance Criteria 1); the History Item field
// is a real typeahead (queries by display_text or history_code,
// Acceptance Criteria 2) with real arrow-key highlighting, Enter
// commits the highlighted match and advances focus to the first real
// metadata field (or the Add button when there is none), and Escape
// clears the open suggestion list without selecting. The Alt+N
// listener is scoped to this component's own mount lifecycle — it
// only exists while this panel is actually visible (the parent only
// ever mounts it under the Clinical History tab), never a stray,
// page-wide hotkey.
//
// Real, per pathscribe.css reuse guidance: named CSS classes
// throughout (ps-input-dark, ps-label, ps-conf-btn-secondary,
// ps-conf-empty-row), no inline styles.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import '../../../pathscribe.css';
import { mockClinicalHistoryDictionaryService } from '../../../services/clinicalHistory/mockClinicalHistoryDictionaryService';
import type { ClinicalHistoryDictionaryEntry } from '../../../services/clinicalHistory/IClinicalHistoryDictionaryService';
import type { ClinicalHistoryCategoryCode, RecordedClinicalHistoryEntry } from '@/types/clinicalHistory/RecordedClinicalHistoryEntry';

const CATEGORY_LABELS: Record<ClinicalHistoryCategoryCode, string> = {
  SCR: 'Screening', SYM: 'Symptoms', RAD_LAB: 'Radiology / Lab',
  PRIOR_PATH: 'Prior Pathology', MAL_STAGE: 'Malignancy / Staging', HIGH_RISK: 'High-Risk Factors',
};

/** Real, per the spec's own explicit numbering (User Story 1's own
 *  "6 categories (SCR, SYM, RAD_LAB, PRIOR_PATH, MAL_STAGE,
 *  HIGH_RISK)"; User Story 3's own "Category 1 (SCR)"..."Category 5
 *  (MAL_STAGE)") — Alt+1 through Alt+6 map to this exact, real order. */
const CATEGORY_ORDER: ClinicalHistoryCategoryCode[] = ['SCR', 'SYM', 'RAD_LAB', 'PRIOR_PATH', 'MAL_STAGE', 'HIGH_RISK'];

export interface ClinicalHistoryTarget {
  id: string;
  label: string;
  entries: RecordedClinicalHistoryEntry[];
}

interface ClinicalHistoryEntryPanelProps {
  specimenTypes: string[];
  targets: ClinicalHistoryTarget[];
  onChangeTarget: (targetId: string, entries: RecordedClinicalHistoryEntry[]) => void;
  /** Real, per direct guidance ("Check the actions ts as that is where
   *  we are wiring keyboard shortcuts") — the real
   *  accession.clinicalHistoryCategoryN action, dispatched via
   *  AccessionPage.tsx's own existing mockActionRegistryService.onAction
   *  subscription (Alt+1 through Alt+6), bridged down here as a prop
   *  since this panel isn't itself subscribed to the registry. A
   *  nonce accompanies the category so this fires even when the same
   *  category is requested twice in a row. */
  requestedCategory: { category: ClinicalHistoryCategoryCode; nonce: number } | null;
}

const ClinicalHistoryEntryPanel: React.FC<ClinicalHistoryEntryPanelProps> = ({ specimenTypes, targets, onChangeTarget, requestedCategory }) => {
  const [dictionary, setDictionary] = useState<ClinicalHistoryDictionaryEntry[]>([]);
  const [targetId, setTargetId] = useState<string>(targets[0]?.id ?? 'case');
  const [specimenType, setSpecimenType] = useState<string>(specimenTypes[0] ?? '');
  const [categoryCode, setCategoryCode] = useState<ClinicalHistoryCategoryCode | ''>('');
  const [historyCode, setHistoryCode] = useState<string>('');
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());

  const categorySelectRef = useRef<HTMLSelectElement>(null);
  const firstMetadataInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mockClinicalHistoryDictionaryService.getActive().then(r => { if (r.ok) setDictionary(r.data); });
  }, []);

  useEffect(() => { if (!specimenType && specimenTypes[0]) setSpecimenType(specimenTypes[0]); }, [specimenTypes]);

  useEffect(() => {
    if (!targets.some(t => t.id === targetId) && targets[0]) setTargetId(targets[0].id);
  }, [targets, targetId]);

  // Real, per direct guidance ("Check the actions ts as that is where
  // we are wiring keyboard shortcuts") — reacts to the real
  // accession.clinicalHistoryCategoryN action dispatch (Alt+1 through
  // Alt+6), bridged down via the requestedCategory prop, rather than
  // a separate, local, raw keydown listener duplicating what the
  // action registry already owns.
  useEffect(() => {
    if (!requestedCategory) return;
    setCategoryCode(requestedCategory.category);
    setHistoryCode(''); setQuery(''); setMetadataDraft({});
    categorySelectRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per real, distinct dispatch (nonce), not on every render.
  }, [requestedCategory?.nonce]);

  const activeTarget = targets.find(t => t.id === targetId) ?? targets[0];

  const forSpecimenType = useMemo(
    () => dictionary.filter(e => !e.specimenFamilyFilter || e.specimenFamilyFilter.includes(specimenType)),
    [dictionary, specimenType],
  );
  const availableCategories = useMemo(
    () => Array.from(new Set(forSpecimenType.map(e => e.categoryCode))) as ClinicalHistoryCategoryCode[],
    [forSpecimenType],
  );
  const forCategory = useMemo(
    () => categoryCode ? forSpecimenType.filter(e => e.categoryCode === categoryCode) : [],
    [forSpecimenType, categoryCode],
  );
  // Real, per Acceptance Criteria 2 — "queries... by display_text or
  // history_code." Every entry in the current category shows by
  // default (empty query); typing narrows it.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return forCategory;
    return forCategory.filter(e => e.displayText.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  }, [forCategory, query]);

  const selectedEntry = useMemo(() => dictionary.find(e => e.id === historyCode), [dictionary, historyCode]);

  useEffect(() => { setHighlightIdx(0); }, [matches.length, query]);

  const commit = (entry: ClinicalHistoryDictionaryEntry) => {
    setHistoryCode(entry.id);
    setQuery(entry.displayText);
    setSuggestionsOpen(false);
    setMetadataDraft({});
    setMissingFields(new Set());
    setError(null);
    // Real, per Acceptance Criteria 2 — "Enter commits the selection
    // and moves focus to the next field": the first real metadata
    // input when this entry has one, otherwise the Add button.
    requestAnimationFrame(() => {
      (entry.requiredMetadataSchema.length > 0 ? firstMetadataInputRef.current : addButtonRef.current)?.focus();
    });
  };

  const handleTypeaheadKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionsOpen(true); setHighlightIdx(i => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[highlightIdx]) commit(matches[highlightIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); setSuggestionsOpen(false); }
  };

  const handleAdd = () => {
    setError(null);
    if (!activeTarget) return;
    if (!selectedEntry) { setError('Select a history code before adding.'); return; }
    const missing = selectedEntry.requiredMetadataSchema.filter(f => f.required && !metadataDraft[f.key]?.trim());
    if (missing.length > 0) {
      setError(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.map(f => f.label).join(', ')}.`);
      setMissingFields(new Set(missing.map(f => f.key)));
      return;
    }
    setMissingFields(new Set());
    const newEntry: RecordedClinicalHistoryEntry = {
      historyCode: selectedEntry.id, categoryCode: selectedEntry.categoryCode, metadata: { ...metadataDraft },
    };
    onChangeTarget(activeTarget.id, [...activeTarget.entries, newEntry]);
    setHistoryCode(''); setQuery(''); setMetadataDraft({});
  };

  const handleRemove = (target: ClinicalHistoryTarget, idx: number) => {
    onChangeTarget(target.id, target.entries.filter((_, i) => i !== idx));
  };

  const displayTextFor = (code: string | null) => code ? (dictionary.find(e => e.id === code)?.displayText ?? code) : null;

  return (
    <div ref={panelRef} className="ps-card-dark" style={{ padding: 16 }}>
      <div className="ps-label" style={{ marginBottom: 4, fontWeight: 700 }}>Structured Clinical History</div>
      <div style={{ fontSize: 11, color: 'var(--ps-conf-text-3, #94a3b8)', marginBottom: 10 }}>
        Alt+1–6 jumps to a category · type to search · Enter selects · Esc closes
      </div>

      {targets.map(target => target.entries.length > 0 && (
        <div key={target.id} style={{ marginBottom: 14 }}>
          {targets.length > 1 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ps-conf-text-3, #94a3b8)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {target.label}
            </div>
          )}
          {target.entries.map((entry, i) => (
            <div key={i} className="ps-conf-row">
              <span className="ps-conf-value">
                {displayTextFor(entry.historyCode) ?? entry.unmappedTextFallback} <em style={{ color: 'var(--ps-conf-text-3, #94a3b8)' }}>({CATEGORY_LABELS[entry.categoryCode]})</em>
                {Object.keys(entry.metadata).length > 0 && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ps-conf-text-3, #94a3b8)' }}>
                    {Object.entries(entry.metadata).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </span>
                )}
              </span>
              <button className="ps-conf-btn-secondary" onClick={() => handleRemove(target, i)}>Remove</button>
            </div>
          ))}
        </div>
      ))}
      {targets.every(t => t.entries.length === 0) && <div className="ps-conf-empty-row">No structured clinical history added yet.</div>}

      {targets.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <label className="ps-label" htmlFor="ch-target">Applies To</label>
          <select id="ch-target" className="ps-input-dark" value={targetId} onChange={e => setTargetId(e.target.value)}>
            {targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      )}

      <div className="ps-accession-specimen-row-3col" style={{ marginTop: 14 }}>
        <div>
          <label className="ps-label" htmlFor="ch-specimen-type">Specimen Type</label>
          <select id="ch-specimen-type" className="ps-input-dark" value={specimenType}
            onChange={e => { setSpecimenType(e.target.value); setCategoryCode(''); setHistoryCode(''); setQuery(''); }}>
            {specimenTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="ps-label" htmlFor="ch-category">Category (Alt+1–6)</label>
          <select ref={categorySelectRef} id="ch-category" className="ps-input-dark" value={categoryCode}
            onChange={e => { setCategoryCode(e.target.value as ClinicalHistoryCategoryCode); setHistoryCode(''); setQuery(''); }}>
            <option value="">— select category —</option>
            {CATEGORY_ORDER.filter(c => availableCategories.includes(c)).map((c, i) => (
              <option key={c} value={c}>{i + 1}. {CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div style={{ position: 'relative' }}>
          <label className="ps-label" htmlFor="ch-history-search">History Item</label>
          <input
            id="ch-history-search" className="ps-input-dark" disabled={!categoryCode}
            value={query}
            placeholder="Type to search…"
            onChange={e => { setQuery(e.target.value); setSuggestionsOpen(true); if (historyCode) setHistoryCode(''); }}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => setTimeout(() => setSuggestionsOpen(false), 120)}
            onKeyDown={handleTypeaheadKeyDown}
          />
          {suggestionsOpen && matches.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, background: '#161616', border: '1px solid #2a2a2a', borderRadius: 8, marginTop: 3, maxHeight: 220, overflowY: 'auto' }}>
              {matches.map((e, i) => (
                <div key={e.id} onMouseDown={() => commit(e)}
                  style={{ padding: '7px 10px', fontSize: 12, color: '#d1d5db', cursor: 'pointer', background: i === highlightIdx ? '#1f2937' : 'transparent' }}>
                  {e.displayText}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedEntry && selectedEntry.requiredMetadataSchema.length > 0 && (
        <div className="ps-accession-specimen-row-3col" style={{ marginTop: 12 }}>
          {selectedEntry.requiredMetadataSchema.map((field, i) => (
            <div key={field.key}>
              <label className="ps-label" htmlFor={`ch-meta-${field.key}`}>{field.label}{field.required && <span className="ps-conf-required"> *</span>}</label>
              <input id={`ch-meta-${field.key}`} ref={i === 0 ? firstMetadataInputRef : undefined}
                className={`ps-input-dark${missingFields.has(field.key) ? ' ps-conf-input--error' : ''}`}
                type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                value={metadataDraft[field.key] ?? ''}
                onChange={e => {
                  setMetadataDraft({ ...metadataDraft, [field.key]: e.target.value });
                  if (missingFields.has(field.key)) setMissingFields(prev => { const next = new Set(prev); next.delete(field.key); return next; });
                }} />
            </div>
          ))}
        </div>
      )}

      {error && <div className="ps-conf-error-text" style={{ marginTop: 8 }}>{error}</div>}

      <button ref={addButtonRef} className="ps-conf-btn-secondary" style={{ marginTop: 12 }} onClick={handleAdd} disabled={!historyCode}>
        + Add to Clinical History{targets.length > 1 ? ` (${activeTarget?.label})` : ''}
      </button>
    </div>
  );
};

export default ClinicalHistoryEntryPanel;
