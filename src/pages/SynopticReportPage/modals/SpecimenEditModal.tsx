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
import { useTranslation, Trans } from 'react-i18next';
import '@/pathscribe.css';
import { useSpecimenDictionary } from '@/components/Config/System/useSpecimenDictionary';
import { containerTypeService } from '@/services';
import type { ContainerType, ContainerCategory } from '@/services/containerTypes/IContainerTypeService';
import type { Specimen, SpecimenLisStatus, SpecimenComplexity } from '@/types/case/Specimen';
import { findForeignIdCollision } from '@/utils/foreignIdCollision';
import type { ForeignIdCollision } from '@/utils/foreignIdCollision';

// ─── Persisted-value label maps ─────────────────────────────────────────────
// Laterality and container-category values below are real, stored/matched
// tokens (laterality feeds inferLateralityFromText.ts's own English word-
// matching and is persisted as typed) — only the displayed label translates.

const LATERALITY_LABEL_KEY: Record<string, string> = {
  Left:              'specimenEditModal.laterality.left',
  Right:             'specimenEditModal.laterality.right',
  Bilateral:         'specimenEditModal.laterality.bilateral',
  Midline:           'specimenEditModal.laterality.midline',
  'Not applicable':  'specimenEditModal.laterality.notApplicable',
};

const CONTAINER_CATEGORY_LABEL_KEY: Record<ContainerCategory, string> = {
  histology:      'specimenEditModal.containerCategory.histology',
  cytology:       'specimenEditModal.containerCategory.cytology',
  special_media:  'specimenEditModal.containerCategory.specialMedia',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface SpecimenEditModalProps {
  /** Existing specimen to edit, or null to add a new one */
  specimen:        Specimen | null;
  /** Next letter label for a new specimen (e.g. 'C') */
  nextLabel:       string;
  /** All existing specimens on the case (used to validate label uniqueness) */
  existingSpecimens:    Specimen[];
  isOrchestrationMode:  boolean;
  /** Real, per direct guidance's own follow-up: the real, auto-derived
   *  effective complexity (getEffectiveComplexity,
   *  useEffectiveSpecimenComplexity.ts) for this specific specimen,
   *  when real synoptic evidence exists to derive one - undefined
   *  otherwise. Resolved by the caller, never computed in this
   *  component; this modal only displays it, as a hint the explicit
   *  Gross Only / Gross + Micro toggle below may be silently
   *  overridden at billing time regardless of what's selected here. */
  effectiveComplexity?: SpecimenComplexity;
  onSave:               (specimen: Specimen) => void;
  onClose:              () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const genId = () => crypto.randomUUID();

// ─── Component ────────────────────────────────────────────────────────────────

const SpecimenEditModal: React.FC<SpecimenEditModalProps> = ({
  specimen, nextLabel, existingSpecimens, isOrchestrationMode, effectiveComplexity, onSave, onClose,
}) => {
  const { t } = useTranslation();
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
  const [selectedEntry, setSelectedEntry] = useState<string | null>(specimen?.specimenDictionaryEntryId ?? null);
  const [complexity, setComplexity] = useState<SpecimenComplexity | undefined>(specimen?.complexity);
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
    // Real, per direct guidance's own spec: "Default Assignment (Smart
    // Preset): when a specimen is... selected from the dictionary...
    // default complexity... based on the dictionary template."
    if (entry.defaultComplexity) setComplexity(entry.defaultComplexity);
  }, [dictionary]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const trimLabel = label.trim().toUpperCase();
    if (!trimLabel) {
      e.label = t('specimenEditModal.errors.labelRequired');
    } else {
      // Check uniqueness (allow same label when editing the same specimen)
      const conflict = existingSpecimens.find(s =>
        s.label.toUpperCase() === trimLabel && s.id !== specimen?.id
      );
      if (conflict) e.label = t('specimenEditModal.errors.labelExists', { label: trimLabel });
    }
    if (!description.trim()) e.description = t('specimenEditModal.errors.descriptionRequired');
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
      // Real fix, found while building specimen complexity: selecting
      // a dictionary entry from the left panel never actually
      // persisted the link - selectedEntry was tracked in local state
      // but never written into the saved specimen, silently breaking
      // resolveSpecimenDictionaryBaseCptCode's own real dependency on
      // this field for every specimen edited through this modal.
      // Falls back to the specimen's own existing link when no new
      // selection was made this session, never clears a real,
      // pre-existing link the user didn't touch.
      specimenDictionaryEntryId: selectedEntry ?? specimen?.specimenDictionaryEntryId,
      complexity,
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
              {isEdit ? t('specimenEditModal.title.edit', { label: specimen!.label }) : t('specimenEditModal.title.add')}
            </h2>
            <div className="ps-specedit-subtitle">
              {isEdit
                ? t('specimenEditModal.header.editSubtitle')
                : t('specimenEditModal.header.addSubtitle')}
            </div>
          </div>
          <button className="ps-research-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        {/* Body */}
        <div className="ps-specedit-body">

          {/* LEFT — Dictionary search */}
          <div className="ps-specedit-left">
            <div className="ps-specedit-search-wrap">
              <input
                className="ps-search-input"
                placeholder={t('specimenEditModal.dictSearch.placeholder')}
                value={dictSearch}
                onChange={e => setDictSearch(e.target.value)}
                autoFocus={!isEdit}
              />
            </div>
            <div className="ps-specedit-dict-list">
              {activeEntries.length === 0 ? (
                <div className="ps-specedit-dict-empty">
                  {dictSearch ? t('specimenEditModal.dictSearch.noMatches', { query: dictSearch }) : t('specimenEditModal.dictSearch.empty')}
                </div>
              ) : grouped.map(([type, entries]) => (
                <div key={type}>
                  <div className="ps-specedit-dict-section">{type === 'Other' ? t('specimenEditModal.dictSearch.otherType') : type}</div>
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
                <Trans
                  i18nKey="specimenEditModal.dictHint"
                  values={{ name: selectedEntryObj.name }}
                  components={{ nameSpan: <span className="ps-specedit-dict-hint-name" /> }}
                />
              </div>
            )}

            {/* Label */}
            <div className="ps-specedit-field-group">
              <label className="ps-specedit-label ps-specedit-label--required">{t('specimenEditModal.fields.specimenLabel')}</label>
              <div className="ps-specedit-label-row">
                <span className="ps-specedit-label-badge">{label || '?'}</span>
                <input
                  className={`ps-specedit-input ps-specedit-label-input${errors.label ? ' ps-specedit-input--error' : ''}`}
                  value={label}
                  onChange={e => setLabel(e.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="A"
                />
                <span className="ps-specedit-label-hint">{t('specimenEditModal.fields.specimenLabelHint')}</span>
              </div>
              {errors.label && <span className="ps-specedit-error-msg">{errors.label}</span>}
            </div>

            {/* Description */}
            <div className="ps-specedit-field-group">
              <label className="ps-specedit-label ps-specedit-label--required">{t('specimenEditModal.fields.description')}</label>
              <input
                className={`ps-specedit-input${errors.description ? ' ps-specedit-input--error' : ''}`}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('specimenEditModal.fields.descriptionPlaceholder')}
              />
              {errors.description && <span className="ps-specedit-error-msg">{errors.description}</span>}
            </div>

            {/* Complexity */}
            <div className="ps-specedit-field-group">
              <label className="ps-specedit-label">{t('specimenEditModal.complexity.label')}</label>
              <div className="ps-specedit-complexity-row">
                <button
                  type="button"
                  onClick={() => setComplexity('GROSS_ONLY')}
                  className={`ps-specedit-complexity-btn${complexity === 'GROSS_ONLY' ? ' ps-specedit-complexity-btn--active' : ''}`}
                >
                  {t('specimenEditModal.complexity.grossOnly')}
                </button>
                <button
                  type="button"
                  onClick={() => setComplexity('GROSS_AND_MICRO')}
                  className={`ps-specedit-complexity-btn${complexity === 'GROSS_AND_MICRO' ? ' ps-specedit-complexity-btn--active' : ''}`}
                >
                  {t('specimenEditModal.complexity.grossAndMicro')}
                </button>
              </div>
              {selectedEntryObj?.defaultComplexity && complexity && complexity !== selectedEntryObj.defaultComplexity && (
                <p className="ps-specedit-hint ps-specedit-hint--spaced">
                  {t('specimenEditModal.complexity.overridingDefault', {
                    default: selectedEntryObj.defaultComplexity === 'GROSS_ONLY'
                      ? t('specimenEditModal.complexity.grossOnlyLower')
                      : t('specimenEditModal.complexity.grossAndMicroLower'),
                  })}
                </p>
              )}
              {!complexity && effectiveComplexity && (
                <p className="ps-specedit-hint ps-specedit-hint--spaced">
                  {t('specimenEditModal.complexity.autoBillHint', {
                    complexity: effectiveComplexity === 'GROSS_AND_MICRO'
                      ? t('specimenEditModal.complexity.grossAndMicro')
                      : t('specimenEditModal.complexity.grossOnly'),
                  })}
                </p>
              )}
            </div>

            {/* Site + Laterality */}
            <div className="ps-specedit-row-2col">
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">{t('specimenEditModal.fields.anatomicSite')}</label>
                <input
                  className="ps-specedit-input"
                  value={bodySite}
                  onChange={e => setBodySite(e.target.value)}
                  placeholder={t('specimenEditModal.fields.anatomicSitePlaceholder')}
                />
              </div>
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">{t('specimenEditModal.fields.laterality')}</label>
                <select
                  className="ps-specedit-input"
                  value={laterality}
                  onChange={e => setLaterality(e.target.value)}
                >
                  <option value="">{t('specimenEditModal.laterality.notSpecified')}</option>
                  {(['Left', 'Right', 'Bilateral', 'Midline', 'Not applicable'] as const).map(v => (
                    <option key={v} value={v}>{t(LATERALITY_LABEL_KEY[v])}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Method + Container */}
            <div className="ps-specedit-row-2col">
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">{t('specimenEditModal.fields.collectionMethod')}</label>
                <input
                  className="ps-specedit-input"
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                  placeholder={t('specimenEditModal.fields.collectionMethodPlaceholder')}
                />
              </div>
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">{t('specimenEditModal.fields.containerType')}</label>
                <select
                  className="ps-specedit-input"
                  value={container}
                  onChange={e => setContainer(e.target.value)}
                >
                  <option value="">{t('specimenEditModal.fields.containerTypePlaceholder')}</option>
                  {(['histology', 'cytology', 'special_media'] as ContainerCategory[]).map(cat => {
                    const inCat = containerTypes.filter(c => c.category === cat);
                    if (inCat.length === 0) return null;
                    return (
                      <optgroup key={cat} label={t(CONTAINER_CATEGORY_LABEL_KEY[cat])}>
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
                <label className="ps-specedit-label">{t('specimenEditModal.fields.snomedType')}</label>
                <input
                  className="ps-specedit-input"
                  value={snomedCode}
                  onChange={e => setSnomedCode(e.target.value)}
                  placeholder={t('specimenEditModal.fields.snomedTypePlaceholder')}
                />
              </div>
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">{t('specimenEditModal.fields.snomedSite')}</label>
                <input
                  className="ps-specedit-input"
                  value={siteCode}
                  onChange={e => setSiteCode(e.target.value)}
                  placeholder={t('specimenEditModal.fields.snomedSitePlaceholder')}
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
                {/* Real fix (PS-302) — relabeled, same reasoning as
                    ForeignIdFields.tsx's own identical relabel.
                    Real fix (PS-314) — relabeled again to "Referral
                    Client", same reasoning and same wording as
                    ForeignIdFields.tsx's own identical follow-up
                    relabel (this modal keeps its own, separate copy of
                    these two fields rather than the shared component,
                    so both need updating to stay in sync). This
                    field's own input already used ps-specedit-input,
                    not ps-conf-select, so it never had that sibling
                    bug's dropdown-chevron/placeholder issue. */}
                <label className="ps-specedit-label">{t('specimenEditModal.fields.referralClient')}</label>
                <input
                  className="ps-specedit-input"
                  value={externalIdSource}
                  onChange={e => setExternalIdSource(e.target.value)}
                  onBlur={checkForeignIdCollision}
                  placeholder={t('specimenEditModal.fields.referralClientPlaceholder')}
                />
              </div>
              <div className="ps-specedit-field-group">
                <label className="ps-specedit-label">{t('specimenEditModal.fields.referralClientId')}</label>
                <input
                  className="ps-specedit-input"
                  value={externalId}
                  onChange={e => setExternalId(e.target.value)}
                  onBlur={checkForeignIdCollision}
                  placeholder={t('specimenEditModal.fields.referralClientIdPlaceholder')}
                />
              </div>
            </div>
            {foreignIdCollision && (
              <div className="ps-specedit-collision-warning">
                <div className="ps-specedit-collision-warning-text">
                  ⚠ {t('specimenEditModal.foreignId.collisionWarning', {
                    recordLabel: foreignIdCollision.recordLabel,
                    caseAccession: foreignIdCollision.caseAccession,
                  })}
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
            <button className="ps-btn-ghost-dark" onClick={onClose}>{t('common.cancel')}</button>
            <button className="ps-btn-primary" onClick={handleSave}>
              {isEdit ? t('specimenEditModal.footer.saveChanges') : t('specimenEditModal.title.add')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SpecimenEditModal;
