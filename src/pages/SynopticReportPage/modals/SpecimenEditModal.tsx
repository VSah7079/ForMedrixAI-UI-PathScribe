/**
 * SpecimenEditModal.tsx
 * src/pages/SynopticReportPage/modals/SpecimenEditModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Add a new specimen to the case or edit an existing one.
 *
 * Left panel  — searchable Specimen Dictionary for quick population
 * Right panel — editable form fields: label, description, site,
 *               laterality, collection method, container type, SNOMED codes
 *
 * Mapping: SpecimenEntry (dictionary) → Specimen (case)
 *   entry.normalizedLabel / entry.name  → specimen.description
 *   entry.site                          → specimen.collection.bodySite
 *   entry.laterality                    → appended to description
 *   entry.procedure                     → specimen.collection.method
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import '@/pathscribe.css';
import { useSpecimenDictionary } from '@/components/Config/System/useSpecimenDictionary';
import { containerTypeService } from '@/services';
import type { ContainerType, ContainerCategory } from '@/services/containerTypes/IContainerTypeService';
import type { Specimen, SpecimenLisStatus } from '@/types/case/Specimen';
import { findForeignIdCollision } from '@/utils/foreignIdCollision';
import type { ForeignIdCollision } from '@/utils/foreignIdCollision';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SpecimenEditModalProps {
  /** Existing specimen to edit, or null to add a new one */
  specimen:        Specimen | null;
  /** Next letter label for a new specimen (e.g. 'C') */
  nextLabel:       string;
  /** All existing specimens on the case (used to validate label uniqueness) */
  existingSpecimens:    Specimen[];
  isOrchestrationMode:  boolean;
  onSave:               (specimen: Specimen) => void;
  onClose:              () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const genId = () => crypto.randomUUID();

// ─── Component ────────────────────────────────────────────────────────────────

const SpecimenEditModal: React.FC<SpecimenEditModalProps> = ({
  specimen, nextLabel, existingSpecimens, isOrchestrationMode, onSave, onClose,
}) => {
  const isEdit = !!specimen;
  const { dictionary } = useSpecimenDictionary();

  // ── Form state ───────────────────────────────────────────────────────────
  const [label,       setLabel]       = useState(specimen?.label       ?? nextLabel);
  const [description, setDescription] = useState(specimen?.description ?? '');
  const [bodySite,    setBodySite]    = useState(specimen?.collection?.bodySite  ?? '');
  const [method,      setMethod]      = useState(specimen?.collection?.method    ?? '');
  const [laterality,  setLaterality]  = useState('');
  const [container,   setContainer]   = useState(specimen?.container?.type       ?? '');
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  useEffect(() => {
    containerTypeService.getAll().then(res => { if (res.ok) setContainerTypes(res.data.filter(c => c.status === 'Active')); });
  }, []);
  const [snomedCode,  setSnomedCode]  = useState(specimen?.snomedTypeCode        ?? '');
  const [siteCode,    setSiteCode]    = useState(specimen?.snomedSiteCode        ?? '');
  const [dictSearch,  setDictSearch]  = useState('');
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Real feature, per direct follow-up: "Specimen/Decant-level foreign
  // ID... the actual cytology fluid case." Same real, on-blur
  // collision check as BlockStainEditorModal.tsx's own identical
  // fields — see that file's own comment for the full reasoning on
  // why this checks on blur, not every keystroke.
  const [externalId,       setExternalId]       = useState(specimen?.externalId       ?? '');
  const [externalIdSource, setExternalIdSource] = useState(specimen?.externalIdSource ?? '');
  const [foreignIdCollision, setForeignIdCollision] = useState<ForeignIdCollision | null>(null);

  const checkForeignIdCollision = async () => {
    if (!externalId.trim() || !externalIdSource.trim()) {
      setForeignIdCollision(null);
      return;
    }
    const result = await findForeignIdCollision(externalIdSource, externalId, specimen?.id);
    setForeignIdCollision(result);
  };

  // ── ESC to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Dictionary list ───────────────────────────────────────────────────────
  const activeEntries = useMemo(() =>
    dictionary.filter(e => e.active && (
      !dictSearch ||
      e.name.toLowerCase().includes(dictSearch.toLowerCase()) ||
      (e.normalizedLabel ?? '').toLowerCase().includes(dictSearch.toLowerCase()) ||
      (e.type ?? '').toLowerCase().includes(dictSearch.toLowerCase()) ||
      (e.site ?? '').toLowerCase().includes(dictSearch.toLowerCase())
    )), [dictionary, dictSearch]
  );

  // Group by type
  const grouped = useMemo(() => {
    const map = new Map<string, typeof activeEntries>();
    for (const e of activeEntries) {
      const key = e.type || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [activeEntries]);

  // ── Apply dictionary entry ────────────────────────────────────────────────
  const applyEntry = useCallback((entryId: string) => {
    const entry = dictionary.find(e => e.id === entryId);
    if (!entry) return;
    setSelectedEntry(entryId);
    // Populate form from dictionary entry
    setDescription(entry.normalizedLabel || entry.name);
    if (entry.site)        setBodySite(entry.site);
    if (entry.laterality)  setLaterality(entry.laterality);
    if (entry.procedure)   setMethod(entry.procedure);
  }, [dictionary]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const trimLabel = label.trim().toUpperCase();
    if (!trimLabel) {
      e.label = 'Specimen label is required';
    } else {
      // Check uniqueness (allow same label when editing the same specimen)
      const conflict = existingSpecimens.find(s =>
        s.label.toUpperCase() === trimLabel && s.id !== specimen?.id
      );
      if (conflict) e.label = `Label "${trimLabel}" already exists on this case`;
    }
    if (!description.trim()) e.description = 'Description is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!validate()) return;
    // Determine LIS sync status for this specimen
    const lisStatus: SpecimenLisStatus = isOrchestrationMode
      ? 'local_only'                                      // O26-: goes out with result message
      : (specimen?.lisStatus === 'lis_owned' || !specimen) // S26-: edited or new
        ? 'pending_sync'                                  // needs LIS write-back
        : specimen.lisStatus;                             // preserve sync_sent/rejected

    const built: Specimen = {
      ...(specimen ?? {}),
      id:          specimen?.id ?? genId(),
      label:       label.trim().toUpperCase(),
      description: description.trim(),
      displayName: `Specimen ${label.trim().toUpperCase()} — ${description.trim()}`,
      active:      true,
      lisStatus,
      collection: {
        ...(specimen?.collection ?? {}),
        bodySite: bodySite.trim() || undefined,
        method:   method.trim()   || undefined,
      },
      container:   container.trim() ? { type: container.trim() } : specimen?.container,
      snomedTypeCode: snomedCode.trim() || undefined,
      snomedSiteCode: siteCode.trim()   || undefined,
      externalId:       externalId.trim()       || undefined,
      externalIdSource: externalIdSource.trim() || undefined,
      createdAt:   specimen?.createdAt ?? new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };
    onSave(built);
  };

  const selectedEntryObj = selectedEntry ? dictionary.find(e => e.id === selectedEntry) : null;

  return (
    <div className="ps-specedit-overlay" onClick={onClose}>
      <div className="ps-specedit-shell" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ps-specedit-header">
          <div>
            <h2 className="ps-specedit-title">
              {isEdit ? `Edit Specimen ${specimen!.label}` : 'Add Specimen'}
            </h2>
            <div className="ps-specedit-subtitle">
              {isEdit
                ? 'Update specimen details — changes apply to this case only'
                : 'Search the specimen dictionary or enter details manually'}
            </div>
          </div>
          <button className="ps-research-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="ps-specedit-body">

          {/* LEFT — Dictionary search */}
          <div className="ps-specedit-left">
            <div className="ps-specedit-search-wrap">
              <input
                className="ps-search-input"
                placeholder="Search specimen dictionary…"
                value={dictSearch}
                onChange={e => setDictSearch(e.target.value)}
                autoFocus={!isEdit}
              />
            </div>
            <div className="ps-specedit-dict-list">
              {activeEntries.length === 0 ? (
                <div className="ps-specedit-dict-empty">
                  {dictSearch ? `No matches for "${dictSearch}"` : 'No specimens in dictionary'}
                </div>
              ) : grouped.map(([type, entries]) => (
                <div key={type}>
                  <div className="ps-specedit-dict-section">{type}</div>
                  {entries.map(e => (
                    <div
                      key={e.id}
                      className={`ps-specedit-dict-row${selectedEntry === e.id ? ' ps-specedit-dict-row--active' : ''}`}
                      onClick={() => applyEntry(e.id)}
                    >
                      <span className="ps-specedit-dict-name">{e.name}</span>
                      <span className="ps-specedit-dict-meta">
                        {[e.site, e.laterality, e.procedure].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — Edit form */}
          <div className="ps-specedit-right">

            {/* Dictionary hint */}
            {selectedEntryObj && (
              <div className="ps-specedit-dict-hint">
                Pre-filled from: <span className="ps-specedit-dict-hint-name">{selectedEntryObj.name}</span>
                {' '}— you can edit any field below
              </div>
            )}

            {/* Label */}
            <div className="ps-specedit-field-group">
              <label className="ps-specedit-label ps-specedit-label--required">Specimen Label</label>
              <div className="ps-specedit-label-row">
                <span className="ps-specedit-label-badge">{label || '?'}</span>
                <input
                  className={`ps-specedit-input ps-specedit-label-input${errors.label ? ' ps-specedit-input--error' : ''}`}
                  value={label}
                  onChange={e => setLabel(e.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="A"
                />
                <span className="ps-specedit-label-hint">Letter or short code (A, B, 1, 1A…)</span>
              </div>
              {errors.label && <span className="ps-specedit-error-msg">{errors.label}</span>}
            </div>

            {/* Description */}
            <div className="ps-specedit-field-group">
              <label className="ps-specedit-label ps-specedit-label--required">Description</label>
              <input
                className={`ps-specedit-input${errors.description ? ' ps-specedit-input--error' : ''}`}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Left breast mastectomy"
              />
              {errors.description && <span className="ps-specedit-error-msg">{errors.description}</span>}
            </div>

            {/* Site + Laterality */}
            <div className="ps-specedit-row-2col">
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">Anatomic Site</label>
                <input
                  className="ps-specedit-input"
                  value={bodySite}
                  onChange={e => setBodySite(e.target.value)}
                  placeholder="e.g. Breast"
                />
              </div>
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">Laterality</label>
                <select
                  className="ps-specedit-input"
                  value={laterality}
                  onChange={e => setLaterality(e.target.value)}
                >
                  <option value="">— not specified —</option>
                  <option value="Left">Left</option>
                  <option value="Right">Right</option>
                  <option value="Bilateral">Bilateral</option>
                  <option value="Midline">Midline</option>
                  <option value="Not applicable">Not applicable</option>
                </select>
              </div>
            </div>

            {/* Method + Container */}
            <div className="ps-specedit-row-2col">
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">Collection Method</label>
                <input
                  className="ps-specedit-input"
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                  placeholder="e.g. Core biopsy, Excision"
                />
              </div>
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">Container Type</label>
                <select
                  className="ps-specedit-input"
                  value={container}
                  onChange={e => setContainer(e.target.value)}
                >
                  <option value="">Select container type…</option>
                  {(['histology', 'cytology', 'special_media'] as ContainerCategory[]).map(cat => {
                    const inCat = containerTypes.filter(c => c.category === cat);
                    if (inCat.length === 0) return null;
                    const label = cat === 'histology' ? 'Histology' : cat === 'cytology' ? 'Cytology' : 'Special Media';
                    return (
                      <optgroup key={cat} label={label}>
                        {inCat.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* SNOMED codes */}
            <div className="ps-specedit-row-2col">
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">SNOMED Specimen Type</label>
                <input
                  className="ps-specedit-input"
                  value={snomedCode}
                  onChange={e => setSnomedCode(e.target.value)}
                  placeholder="e.g. 122643008"
                />
              </div>
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">SNOMED Anatomic Site</label>
                <input
                  className="ps-specedit-input"
                  value={siteCode}
                  onChange={e => setSiteCode(e.target.value)}
                  placeholder="e.g. 80248007"
                />
              </div>
            </div>

            {/* Real feature, per direct follow-up: "Specimen/Decant-level
                foreign ID... the actual cytology fluid case." Same real
                pattern as BlockStainEditorModal.tsx's own identical
                fields — a specimen (e.g. a fluid/cytology specimen)
                that arrives already carrying a foreign, outside lab's
                own identifier gets linked here, never re-labeled. */}
            <div className="ps-specedit-row-2col">
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">Foreign ID Source</label>
                <input
                  className="ps-specedit-input"
                  value={externalIdSource}
                  onChange={e => setExternalIdSource(e.target.value)}
                  onBlur={checkForeignIdCollision}
                  placeholder="e.g. Outside Cytology Lab"
                />
              </div>
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">Foreign ID</label>
                <input
                  className="ps-specedit-input"
                  value={externalId}
                  onChange={e => setExternalId(e.target.value)}
                  onBlur={checkForeignIdCollision}
                  placeholder="e.g. the id already assigned by that lab"
                />
              </div>
            </div>
            {foreignIdCollision && (
              <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)' }}>
                <div style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>
                  ⚠ This foreign ID is already linked to {foreignIdCollision.recordLabel} on case {foreignIdCollision.caseAccession} — double-check before continuing.
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="ps-specedit-footer">
          <div className="ps-specedit-error-msg">
            {Object.values(errors)[0] ?? ''}
          </div>
          <div className="ps-specedit-footer-btns">
            <button className="ps-btn-ghost-dark" onClick={onClose}>Cancel</button>
            <button className="ps-btn-primary" onClick={handleSave}>
              {isEdit ? 'Save Changes' : 'Add Specimen'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SpecimenEditModal;
