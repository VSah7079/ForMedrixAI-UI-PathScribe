// src/components/Config/System/StainDictionarySection.tsx
// ─────────────────────────────────────────────────────────────
// Admin screen for the stain catalog — three related, tabbed
// dictionaries. See IStainService.ts's own header comment for the full
// design reasoning (orthogonal Stain Type / Sectioning Protocol,
// composed via quick-order macros for the ordering UX without merging
// the two dimensions in the data).
//
// Real, user-facing rename, per direct guidance: displayed as
// "Diagnostic Catalog" (not "Stain Dictionary") - reflects that this
// now houses stains, FISH/molecular testing (Category: 'Molecular'),
// and future testing suites (PCR/NGS), not stains alone. File/
// component name intentionally left as-is - an internal identifier,
// not the user-facing label this rename is actually about.
//
// i18n sweep (batch 60): every on-screen label, placeholder, button,
// hint, table header, and validation message across all 4 modals
// (Stain Type, Sectioning Protocol, Master Target, Quick-Order Macro)
// and the main tabbed section now goes through a new
// `stainDictionarySection` namespace. StainCategory and
// MolecularTarget['targetType'] each got their own `*_LABEL_KEY` map
// (the same pattern used for TAT types etc. earlier in this sweep) so
// the stored enum values stay unchanged while the displayed text
// translates. Real data stays untranslated: stain/protocol/macro
// names and descriptions, antibody clones, vendors, billing/CPT
// codes, control-tissue text, and every real target symbol/detail
// (ERBB2, TP53, etc. — genuine molecular-dictionary content, same
// convention as SNOMED codes elsewhere in this sweep) are shown
// exactly as entered/stored. CSV export headers/values in
// handleDownloadStainTypes stay English per this sweep's established
// "exported data stays English" convention.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '../../../utils/csv';
import '../../../pathscribe.css';
import { stainTypeService, sectioningProtocolService, stainOrderMacroService } from '../../../services';
import type { StainType, StainCategory, SectioningProtocol, StainOrderMacro } from '../../../services';
import { mockMolecularTargetService } from '@/services/stains/mockMolecularTargetService';
import type { MolecularTarget, MolecularMethodology, BillingModel, CptMappingRule } from '@/types/billing/MolecularBillingRule';
import { prepareDuplicate } from '../../../utils/duplicateEntry';
import { findDuplicate } from '../../../utils/validateUnique';

type SubTab = 'types' | 'protocols' | 'macros' | 'targets';

// ── Stain Type editor ───────────────────────────────────────────────────────

const STAIN_CATEGORIES: StainCategory[] = ['Routine', 'Special Stain', 'IHC', 'Immunofluorescence', 'Molecular', 'Cytology', 'Other'];

const STAIN_CATEGORY_LABEL_KEY: Record<StainCategory, string> = {
  'Routine':             'stainDictionarySection.categories.routine',
  'Special Stain':       'stainDictionarySection.categories.specialStain',
  'IHC':                 'stainDictionarySection.categories.ihc',
  'Immunofluorescence':  'stainDictionarySection.categories.immunofluorescence',
  'Molecular':           'stainDictionarySection.categories.molecular',
  'Cytology':            'stainDictionarySection.categories.cytology',
  'Other':               'stainDictionarySection.categories.other',
};

const TARGET_TYPE_LABEL_KEY: Record<MolecularTarget['targetType'], string> = {
  PROBE:            'stainDictionarySection.targetTypes.probe',
  GENE:             'stainDictionarySection.targetTypes.gene',
  MUTATION_REGION:  'stainDictionarySection.targetTypes.mutationRegion',
};

interface StainTypeModalProps {
  mode: 'add' | 'edit';
  entry?: StainType;
  existingEntries: StainType[];
  masterTargets: MolecularTarget[];
  onAddTarget: (symbol: string, detail: string) => Promise<MolecularTarget | null>;
  onSave: (draft: Omit<StainType, 'id' | 'version' | 'updatedBy' | 'updatedAt'>) => void;
  onClose: () => void;
}
const StainTypeModal: React.FC<StainTypeModalProps> = ({ mode, entry, existingEntries, masterTargets, onAddTarget, onSave, onClose }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(entry?.name ?? '');
  const [category, setCategory] = useState<StainCategory>(entry?.category ?? 'Routine');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [antibodyClone, setAntibodyClone] = useState(entry?.antibodyClone ?? '');
  const [vendor, setVendor] = useState(entry?.vendor ?? '');
  const [turnaround, setTurnaround] = useState(entry?.defaultTurnaroundHours?.toString() ?? '');
  const [defaultBillingCode, setDefaultBillingCode] = useState(entry?.defaultBillingCode ?? '');
  const [excludeFromIhcSequenceCounting, setExcludeFromIhcSequenceCounting] = useState(entry?.excludeFromIhcSequenceCounting ?? false);
  // Real, per PS-289/PS-292's own Gating Strategy and "batch-manifest
  // scanning with automatic control-slide appending" pieces — see
  // IStainService.ts's own doc comments on each field for the full
  // reasoning.
  const [qcEnforcementMode, setQcEnforcementMode] = useState<StainType['qcEnforcementMode']>(entry?.qcEnforcementMode);
  const [requiresTargetControl, setRequiresTargetControl] = useState(entry?.requiresTargetControl ?? false);
  const [allowControlAutoAppend, setAllowControlAutoAppend] = useState(entry?.allowControlAutoAppend ?? false);
  const [defaultControlTissueType, setDefaultControlTissueType] = useState(entry?.defaultControlTissueType ?? '');
  const [active, setActive] = useState(entry?.active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);
  // ── Real, per direct guidance: Molecular-category fields ──────────
  const [methodology, setMethodology] = useState<MolecularMethodology | ''>(entry?.methodology ?? '');
  const [selectedTargets, setSelectedTargets] = useState<MolecularTarget[]>(entry?.defaultTargets ?? []);
  const [targetSearch, setTargetSearch] = useState('');
  const [newTargetSymbol, setNewTargetSymbol] = useState('');
  const [newTargetDetail, setNewTargetDetail] = useState('');
  const [billingModel, setBillingModel] = useState<BillingModel>(entry?.billingRule?.billingModel ?? 'BASE_ADDON');
  const [baseCptCode, setBaseCptCode] = useState(entry?.billingRule?.baseCptCode ?? '');
  const [addOnCptCode, setAddOnCptCode] = useState(entry?.billingRule?.addOnCptCode ?? '');
  const [multiplexCptCode, setMultiplexCptCode] = useState(entry?.billingRule?.multiplexCptCode ?? '');
  const [multiplexThreshold, setMultiplexThreshold] = useState(entry?.billingRule?.multiplexThreshold?.toString() ?? '3');
  const [perUnitCptCode, setPerUnitCptCode] = useState(entry?.billingRule?.perUnitCptCode ?? '');
  const [flatFeeCptCode, setFlatFeeCptCode] = useState(entry?.billingRule?.flatFeeCptCode ?? '');

  const handleSave = () => {
    if (!name.trim()) return;
    // Real, direct request: two entries with the same name genuinely
    // confuses staff — checked here, before save, not left to a
    // silent collision later. mode === 'edit' excludes the entry's own
    // real id; in 'add' mode (including duplicate, which prefills from
    // an existing entry but is still a real add) nothing is excluded,
    // so saving a duplicate without renaming it is correctly caught.
    const collision = findDuplicate(existingEntries, { name: name.trim() }, ['name'], mode === 'edit' ? entry?.id : undefined);
    if (collision) { setNameError(t('stainDictionarySection.typeModal.nameDuplicateError', { name: collision.name })); return; }
    setNameError(null);

    // Real, per direct guidance: only the fields the chosen billingModel
    // actually uses are ever persisted - never a stale baseCptCode left
    // over from switching away from BASE_ADDON, for instance.
    const billingRule: CptMappingRule | undefined = category === 'Molecular' ? {
      billingModel,
      ...(billingModel === 'BASE_ADDON' ? {
        baseCptCode: baseCptCode.trim() || undefined,
        addOnCptCode: addOnCptCode.trim() || undefined,
        multiplexCptCode: multiplexCptCode.trim() || undefined,
        multiplexThreshold: multiplexThreshold.trim() ? Number(multiplexThreshold) : undefined,
      } : {}),
      ...(billingModel === 'PER_UNIT_MULTIPLIER' ? { perUnitCptCode: perUnitCptCode.trim() || undefined } : {}),
      ...(billingModel === 'FLAT_FEE' ? { flatFeeCptCode: flatFeeCptCode.trim() || undefined } : {}),
    } : undefined;

    onSave({
      name: name.trim(), category, description: description.trim() || undefined,
      antibodyClone: antibodyClone.trim() || undefined, vendor: vendor.trim() || undefined,
      defaultTurnaroundHours: turnaround ? Number(turnaround) : undefined,
      defaultBillingCode: defaultBillingCode.trim() || undefined,
      excludeFromIhcSequenceCounting: defaultBillingCode.trim() ? excludeFromIhcSequenceCounting : undefined,
      qcEnforcementMode: qcEnforcementMode || undefined,
      requiresTargetControl: requiresTargetControl || undefined,
      allowControlAutoAppend: requiresTargetControl && allowControlAutoAppend ? true : undefined,
      defaultControlTissueType: requiresTargetControl && defaultControlTissueType.trim() ? defaultControlTissueType.trim() : undefined,
      methodology: category === 'Molecular' && methodology ? methodology : undefined,
      defaultTargets: category === 'Molecular' && selectedTargets.length > 0 ? selectedTargets : undefined,
      billingRule,
      active,
    });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'edit' ? t('stainDictionarySection.editTitle', { value: entry?.name })
            : entry ? t('stainDictionarySection.duplicateTitle', { value: entry.name })
            : t('stainDictionarySection.typeModal.addTitle')}
        </div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('stainDictionarySection.nameLabel')} <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={name} onChange={e => { setName(e.target.value); setNameError(null); }} placeholder={t('stainDictionarySection.typeModal.namePlaceholder')} />
              {nameError && <div className="ps-body-modal-error">{nameError}</div>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="stain-category">{t('stainDictionarySection.table.category')}</label>
              <select id="stain-category" className="ps-conf-select" value={category} onChange={e => setCategory(e.target.value as StainCategory)}>
                {STAIN_CATEGORIES.map(c => <option key={c} value={c}>{t(STAIN_CATEGORY_LABEL_KEY[c])}</option>)}
              </select>
            </div>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('stainDictionarySection.descriptionLabel')}</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('stainDictionarySection.typeModal.descriptionPlaceholder')} />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('stainDictionarySection.typeModal.billingCodeLabel')}</label>
            <input
              className="ps-conf-input"
              value={defaultBillingCode}
              onChange={e => setDefaultBillingCode(e.target.value.trim())}
              placeholder={t('stainDictionarySection.typeModal.billingCodePlaceholder')}
            />
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              {t('stainDictionarySection.typeModal.billingCodeHint')}
            </p>
            {defaultBillingCode.trim() && category === 'IHC' && (
              <div className="ps-conf-toggle-row ps-conf-section-subtitle--top-gap">
                <div onClick={() => setExcludeFromIhcSequenceCounting(!excludeFromIhcSequenceCounting)}
                  className={`ps-conf-toggle-track ${excludeFromIhcSequenceCounting ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${excludeFromIhcSequenceCounting ? 'ps-conf-toggle-label--active' : ''}`}>
                  {t('stainDictionarySection.typeModal.standaloneBillingToggle')}
                </span>
              </div>
            )}
            {defaultBillingCode.trim() && category === 'IHC' && (
              <p className="ps-conf-section-subtitle">
                {t('stainDictionarySection.typeModal.standaloneBillingHint')}
              </p>
            )}
          </div>

          {(category === 'IHC' || category === 'Special Stain') && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('stainDictionarySection.typeModal.qcSettingsLabel')}</label>

              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label" htmlFor="stain-qc-mode">{t('stainDictionarySection.typeModal.qcModeLabel')}</label>
                  <select id="stain-qc-mode" className="ps-conf-select" value={qcEnforcementMode ?? ''} onChange={e => setQcEnforcementMode((e.target.value || undefined) as StainType['qcEnforcementMode'])}>
                    <option value="">{t('stainDictionarySection.typeModal.qcModeNoOverride')}</option>
                    <option value="Enforced">{t('stainDictionarySection.typeModal.qcModeEnforced')}</option>
                    <option value="Auto-Resolve">{t('stainDictionarySection.typeModal.qcModeAutoResolve')}</option>
                    <option value="Hybrid">{t('stainDictionarySection.typeModal.qcModeHybrid')}</option>
                  </select>
                  <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                    {t('stainDictionarySection.typeModal.qcModeHint')}
                  </p>
                </div>
              </div>

              <div className="ps-conf-toggle-row">
                <div onClick={() => { const next = !requiresTargetControl; setRequiresTargetControl(next); if (!next) { setAllowControlAutoAppend(false); setDefaultControlTissueType(''); } }}
                  className={`ps-conf-toggle-track ${requiresTargetControl ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${requiresTargetControl ? 'ps-conf-toggle-label--active' : ''}`}>
                  {t('stainDictionarySection.typeModal.requireControlToggle')}
                </span>
              </div>

              {requiresTargetControl && (
                <>
                  <div className="ps-conf-toggle-row ps-conf-section-subtitle--top-gap">
                    <div onClick={() => setAllowControlAutoAppend(!allowControlAutoAppend)}
                      className={`ps-conf-toggle-track ${allowControlAutoAppend ? 'ps-conf-toggle-track--active' : ''}`}>
                      <div className="ps-conf-toggle-thumb" />
                    </div>
                    <span className={`ps-conf-toggle-label ${allowControlAutoAppend ? 'ps-conf-toggle-label--active' : ''}`}>
                      {t('stainDictionarySection.typeModal.autoAppendToggle')}
                    </span>
                  </div>
                  <p className="ps-conf-section-subtitle">
                    {t('stainDictionarySection.typeModal.autoAppendHint')}
                  </p>

                  <div className="ps-conf-form-field ps-conf-section-subtitle--top-gap">
                    <label className="ps-conf-label">{t('stainDictionarySection.typeModal.controlTissueLabel')}</label>
                    <input className="ps-conf-input" value={defaultControlTissueType} onChange={e => setDefaultControlTissueType(e.target.value)} placeholder={t('stainDictionarySection.typeModal.controlTissuePlaceholder')} />
                    <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                      {t('stainDictionarySection.typeModal.controlTissueHint')}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          {(category === 'IHC' || category === 'Immunofluorescence') && (
            <div className="ps-conf-form-row">
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('stainDictionarySection.typeModal.antibodyCloneLabel')}</label>
                <input className="ps-conf-input" value={antibodyClone} onChange={e => setAntibodyClone(e.target.value)} placeholder={t('stainDictionarySection.typeModal.antibodyClonePlaceholder')} />
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('stainDictionarySection.typeModal.vendorLabel')}</label>
                <input className="ps-conf-input" value={vendor} onChange={e => setVendor(e.target.value)} placeholder={t('stainDictionarySection.typeModal.vendorPlaceholder')} />
              </div>
            </div>
          )}
          {category === 'Molecular' && (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="stain-methodology">{t('stainDictionarySection.typeModal.methodologyLabel')}</label>
                <select id="stain-methodology" className="ps-conf-select" value={methodology} onChange={e => setMethodology(e.target.value as MolecularMethodology)}>
                  <option value="">{t('stainDictionarySection.typeModal.methodologySelectPlaceholder')}</option>
                  <option value="FISH_ANATOMIC">{t('stainDictionarySection.typeModal.methodologyFishAnatomic')}</option>
                  <option value="FISH_CYTOGENETICS">{t('stainDictionarySection.typeModal.methodologyFishCytogenetics')}</option>
                  <option value="PCR_SINGLE">{t('stainDictionarySection.typeModal.methodologyPcrSingle')}</option>
                  <option value="NGS_PANEL">{t('stainDictionarySection.typeModal.methodologyNgsPanel')}</option>
                </select>
              </div>

              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('stainDictionarySection.typeModal.defaultTargetsLabel')}</label>
                <div className="ps-staindict__target-chips">
                  {selectedTargets.map(target => (
                    <span key={target.id} className="ps-staindict__target-chip">
                      {target.symbol}{target.detail ? ` (${target.detail})` : ''}
                      <button
                        type="button"
                        onClick={() => setSelectedTargets(prev => prev.filter(x => x.id !== target.id))}
                        className="ps-staindict__target-chip-remove"
                        aria-label={t('stainDictionarySection.typeModal.removeTargetAria', { symbol: target.symbol })}
                      >×</button>
                    </span>
                  ))}
                  {selectedTargets.length === 0 && <span className="ps-conf-hint">{t('stainDictionarySection.typeModal.noDefaultTargets')}</span>}
                </div>
                <input
                  className="ps-conf-input"
                  placeholder={t('stainDictionarySection.typeModal.targetSearchPlaceholder')}
                  value={targetSearch}
                  onChange={e => setTargetSearch(e.target.value)}
                />
                {targetSearch.trim() && (
                  <div className="ps-staindict__target-dropdown">
                    {masterTargets
                      .filter(target => !selectedTargets.some(s => s.id === target.id))
                      .filter(target => target.symbol.toLowerCase().includes(targetSearch.trim().toLowerCase()) || target.detail?.toLowerCase().includes(targetSearch.trim().toLowerCase()))
                      .map(target => (
                        <div key={target.id} onClick={() => { setSelectedTargets(prev => [...prev, target]); setTargetSearch(''); }}
                          className="ps-staindict__target-option">
                          <strong>{target.symbol}</strong>{target.detail ? <span className="ps-staindict__target-option-detail"> — {target.detail}</span> : null}
                        </div>
                      ))}
                  </div>
                )}
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                  {t('stainDictionarySection.typeModal.defaultTargetsHint')}
                </p>
                <div className="ps-staindict__new-target-row">
                  <input className="ps-conf-input ps-staindict__new-target-input" placeholder={t('stainDictionarySection.typeModal.newTargetSymbolPlaceholder')} value={newTargetSymbol} onChange={e => setNewTargetSymbol(e.target.value)} />
                  <input className="ps-conf-input ps-staindict__new-target-input" placeholder={t('stainDictionarySection.typeModal.newTargetDetailPlaceholder')} value={newTargetDetail} onChange={e => setNewTargetDetail(e.target.value)} />
                  <button
                    type="button"
                    className="ps-conf-btn-secondary"
                    disabled={!newTargetSymbol.trim()}
                    onClick={async () => {
                      const created = await onAddTarget(newTargetSymbol.trim(), newTargetDetail.trim());
                      if (created) { setSelectedTargets(prev => [...prev, created]); setNewTargetSymbol(''); setNewTargetDetail(''); }
                    }}
                  >{t('stainDictionarySection.typeModal.addToMasterDictBtn')}</button>
                </div>
              </div>

              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="billing-model">{t('stainDictionarySection.typeModal.billingModelLabel')}</label>
                <select id="billing-model" className="ps-conf-select" value={billingModel} onChange={e => setBillingModel(e.target.value as BillingModel)}>
                  <option value="BASE_ADDON">{t('stainDictionarySection.typeModal.billingModelBaseAddon')}</option>
                  <option value="PER_UNIT_MULTIPLIER">{t('stainDictionarySection.typeModal.billingModelPerUnit')}</option>
                  <option value="FLAT_FEE">{t('stainDictionarySection.typeModal.billingModelFlatFee')}</option>
                </select>
              </div>
              {billingModel === 'BASE_ADDON' && (
                <div className="ps-conf-form-row">
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">{t('stainDictionarySection.typeModal.baseCptLabel')}</label>
                    <input className="ps-conf-input" value={baseCptCode} onChange={e => setBaseCptCode(e.target.value)} placeholder={t('stainDictionarySection.typeModal.baseCptPlaceholder')} />
                  </div>
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">{t('stainDictionarySection.typeModal.addOnCptLabel')}</label>
                    <input className="ps-conf-input" value={addOnCptCode} onChange={e => setAddOnCptCode(e.target.value)} placeholder={t('stainDictionarySection.typeModal.addOnCptPlaceholder')} />
                  </div>
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">{t('stainDictionarySection.typeModal.multiplexCptLabel')}</label>
                    <input className="ps-conf-input" value={multiplexCptCode} onChange={e => setMultiplexCptCode(e.target.value)} placeholder={t('stainDictionarySection.typeModal.multiplexCptPlaceholder')} />
                  </div>
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">{t('stainDictionarySection.typeModal.multiplexThresholdLabel')}</label>
                    <input className="ps-conf-input" type="number" min="1" value={multiplexThreshold} onChange={e => setMultiplexThreshold(e.target.value)} />
                  </div>
                </div>
              )}
              {billingModel === 'PER_UNIT_MULTIPLIER' && (
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('stainDictionarySection.typeModal.perUnitCptLabel')}</label>
                  <input className="ps-conf-input" value={perUnitCptCode} onChange={e => setPerUnitCptCode(e.target.value)} placeholder={t('stainDictionarySection.typeModal.perUnitCptPlaceholder')} />
                </div>
              )}
              {billingModel === 'FLAT_FEE' && (
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('stainDictionarySection.typeModal.flatFeeCptLabel')}</label>
                  <input className="ps-conf-input" value={flatFeeCptCode} onChange={e => setFlatFeeCptCode(e.target.value)} placeholder={t('stainDictionarySection.typeModal.flatFeeCptPlaceholder')} />
                </div>
              )}
              <p className="ps-conf-section-subtitle">
                {t('stainDictionarySection.typeModal.molecularBillingHint')}
              </p>
            </>
          )}
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('stainDictionarySection.typeModal.turnaroundLabel')}</label>
              <input className="ps-conf-input" type="number" min="0" value={turnaround} onChange={e => setTurnaround(e.target.value)} placeholder={t('stainDictionarySection.typeModal.turnaroundPlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('stainDictionarySection.statusLabel')}</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => setActive(!active)} className={`ps-conf-toggle-track ${active ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${active ? 'ps-conf-toggle-label--active' : ''}`}>{active ? t('common.active') : t('common.inactive')}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'edit' ? t('stainDictionarySection.saveChangesBtn') : t('stainDictionarySection.typeModal.addTitle')}</button>
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
  const { t } = useTranslation();
  const [name, setName] = useState(entry?.name ?? '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [active, setActive] = useState(entry?.active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSave = () => {
    if (!name.trim()) return;
    const collision = findDuplicate(existingEntries, { name: name.trim() }, ['name'], mode === 'edit' ? entry?.id : undefined);
    if (collision) { setNameError(t('stainDictionarySection.protocolModal.nameDuplicateError', { name: collision.name })); return; }
    setNameError(null);
    onSave({ name: name.trim(), description: description.trim() || undefined, active });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'edit' ? t('stainDictionarySection.editTitle', { value: entry?.name })
            : entry ? t('stainDictionarySection.duplicateTitle', { value: entry.name })
            : t('stainDictionarySection.protocolModal.addTitle')}
        </div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('stainDictionarySection.nameLabel')} <span className="ps-conf-required">*</span></label>
            <input className="ps-conf-input" value={name} onChange={e => { setName(e.target.value); setNameError(null); }} placeholder={t('stainDictionarySection.protocolModal.namePlaceholder')} />
            {nameError && <div className="ps-body-modal-error">{nameError}</div>}
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('stainDictionarySection.descriptionLabel')}</label>
            <textarea className="ps-conf-input ps-conf-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('stainDictionarySection.protocolModal.descriptionPlaceholder')} />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('stainDictionarySection.statusLabel')}</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => setActive(!active)} className={`ps-conf-toggle-track ${active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${active ? 'ps-conf-toggle-label--active' : ''}`}>{active ? t('common.active') : t('common.inactive')}</span>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'edit' ? t('stainDictionarySection.saveChangesBtn') : t('stainDictionarySection.protocolModal.addTitle')}</button>
        </div>
      </div>
    </div>
  );
};

// ── Master Target editor ────────────────────────────────────────────────────
// Real, per direct follow-up: "actually manage targets... not just see
// them in seed data." The Stain Type editor's own inline "Add to
// master dictionary" action only ever creates - this is the real,
// separate, dedicated screen for fixing a typo in an existing target,
// or retiring an obsolete one, matching the exact same
// add/edit/duplicate/deactivate pattern every other real dictionary in
// this app already uses.

interface MolecularTargetModalProps {
  mode: 'add' | 'edit';
  entry?: MolecularTarget;
  existingEntries: MolecularTarget[];
  onSave: (draft: Omit<MolecularTarget, 'id'>) => void;
  onClose: () => void;
}
const MolecularTargetModal: React.FC<MolecularTargetModalProps> = ({ mode, entry, existingEntries, onSave, onClose }) => {
  const { t } = useTranslation();
  const [symbol, setSymbol] = useState(entry?.symbol ?? '');
  const [detail, setDetail] = useState(entry?.detail ?? '');
  const [targetType, setTargetType] = useState<MolecularTarget['targetType']>(entry?.targetType ?? 'PROBE');
  const [active, setActive] = useState(entry?.active ?? true);
  const [symbolError, setSymbolError] = useState<string | null>(null);

  const handleSave = () => {
    if (!symbol.trim()) return;
    // Real, same real-world collision this app's own real add() path
    // already guards against (symbol + detail together, not symbol
    // alone - ERBB2 with no detail and ERBB2 at a different real
    // locus are both legitimately real, distinct entries).
    const collision = existingEntries.find(target =>
      target.id !== (mode === 'edit' ? entry?.id : undefined) &&
      target.symbol.toLowerCase() === symbol.trim().toLowerCase() &&
      (target.detail ?? '') === detail.trim()
    );
    if (collision) {
      setSymbolError(
        collision.detail
          ? t('stainDictionarySection.targetModal.symbolDuplicateErrorWithDetail', { symbol: collision.symbol, detail: collision.detail })
          : t('stainDictionarySection.targetModal.symbolDuplicateError', { symbol: collision.symbol })
      );
      return;
    }
    setSymbolError(null);
    onSave({ symbol: symbol.trim(), detail: detail.trim() || undefined, targetType, active });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'edit' ? t('stainDictionarySection.editTitle', { value: entry?.symbol })
            : entry ? t('stainDictionarySection.duplicateTitle', { value: entry.symbol })
            : t('stainDictionarySection.targetModal.addTitle')}
        </div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('stainDictionarySection.targetModal.symbolLabel')} <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={symbol} onChange={e => { setSymbol(e.target.value); setSymbolError(null); }} placeholder={t('stainDictionarySection.targetModal.symbolPlaceholder')} />
              {symbolError && <div className="ps-body-modal-error">{symbolError}</div>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="target-type">{t('stainDictionarySection.table.type')}</label>
              <select id="target-type" className="ps-conf-select" value={targetType} onChange={e => setTargetType(e.target.value as MolecularTarget['targetType'])}>
                <option value="PROBE">{t('stainDictionarySection.targetModal.targetTypeProbeOption')}</option>
                <option value="GENE">{t('stainDictionarySection.targetModal.targetTypeGeneOption')}</option>
                <option value="MUTATION_REGION">{t('stainDictionarySection.targetModal.targetTypeMutationRegionOption')}</option>
              </select>
            </div>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('stainDictionarySection.targetModal.detailLabel')}</label>
            <input className="ps-conf-input" value={detail} onChange={e => setDetail(e.target.value)} placeholder={t('stainDictionarySection.targetModal.detailPlaceholder')} />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('stainDictionarySection.statusLabel')}</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => setActive(!active)} className={`ps-conf-toggle-track ${active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${active ? 'ps-conf-toggle-label--active' : ''}`}>{active ? t('common.active') : t('common.inactive')}</span>
            </div>
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              {t('stainDictionarySection.targetModal.inactiveHint')}
            </p>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'edit' ? t('stainDictionarySection.saveChangesBtn') : t('stainDictionarySection.targetModal.addTitle')}</button>
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
  const { t } = useTranslation();
  const [label, setLabel] = useState(entry?.label ?? '');
  const [stainTypeId, setStainTypeId] = useState(entry?.stainTypeId ?? stainTypes[0]?.id ?? '');
  const [sectioningProtocolId, setSectioningProtocolId] = useState(entry?.sectioningProtocolId ?? protocols[0]?.id ?? '');
  const [sortOrder, setSortOrder] = useState(entry?.sortOrder?.toString() ?? '99');
  const [active, setActive] = useState(entry?.active ?? true);
  const [labelError, setLabelError] = useState<string | null>(null);

  const handleSave = () => {
    if (!label.trim() || !stainTypeId || !sectioningProtocolId) return;
    const collision = findDuplicate(existingEntries, { label: label.trim() }, ['label'], mode === 'edit' ? entry?.id : undefined);
    if (collision) { setLabelError(t('stainDictionarySection.macroModal.labelDuplicateError', { label: collision.label })); return; }
    setLabelError(null);
    onSave({ label: label.trim(), stainTypeId, sectioningProtocolId, sortOrder: Number(sortOrder) || 99, active });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'edit' ? t('stainDictionarySection.editTitle', { value: entry?.label })
            : entry ? t('stainDictionarySection.duplicateTitle', { value: entry.label })
            : t('stainDictionarySection.macroModal.addTitle')}
        </div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('stainDictionarySection.macroModal.labelLabel')} <span className="ps-conf-required">*</span></label>
            <input className="ps-conf-input" value={label} onChange={e => { setLabel(e.target.value); setLabelError(null); }} placeholder={t('stainDictionarySection.macroModal.labelPlaceholder')} />
            {labelError && <div className="ps-body-modal-error">{labelError}</div>}
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="macro-stain-type">{t('stainDictionarySection.macroModal.stainTypeLabel')} <span className="ps-conf-required">*</span></label>
              <select id="macro-stain-type" className="ps-conf-select" value={stainTypeId} onChange={e => setStainTypeId(e.target.value)}>
                {stainTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="macro-sectioning-protocol">{t('stainDictionarySection.macroModal.sectioningProtocolLabel')} <span className="ps-conf-required">*</span></label>
              <select id="macro-sectioning-protocol" className="ps-conf-select" value={sectioningProtocolId} onChange={e => setSectioningProtocolId(e.target.value)}>
                {protocols.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('stainDictionarySection.macroModal.sortOrderLabel')}</label>
              <input className="ps-conf-input" type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('stainDictionarySection.statusLabel')}</label>
              <div className="ps-conf-toggle-row">
                <div onClick={() => setActive(!active)} className={`ps-conf-toggle-track ${active ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${active ? 'ps-conf-toggle-label--active' : ''}`}>{active ? t('common.active') : t('common.inactive')}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'edit' ? t('stainDictionarySection.saveChangesBtn') : t('stainDictionarySection.macroModal.addTitle')}</button>
        </div>
      </div>
    </div>
  );
};

// ── Main section ─────────────────────────────────────────────────────────

const StainDictionarySection: React.FC = () => {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<SubTab>('types');
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [protocols, setProtocols] = useState<SectioningProtocol[]>([]);
  const [macros, setMacros] = useState<StainOrderMacro[]>([]);
  const [masterTargets, setMasterTargets] = useState<MolecularTarget[]>([]);
  const [search, setSearch] = useState('');
  const [typeModal, setTypeModal] = useState<{ mode: 'add' | 'edit'; entry?: StainType } | null>(null);
  const [protocolModal, setProtocolModal] = useState<{ mode: 'add' | 'edit'; entry?: SectioningProtocol } | null>(null);
  const [macroModal, setMacroModal] = useState<{ mode: 'add' | 'edit'; entry?: StainOrderMacro } | null>(null);
  const [targetModal, setTargetModal] = useState<{ mode: 'add' | 'edit'; entry?: MolecularTarget } | null>(null);

  const loadAll = () => {
    stainTypeService.getAll().then(res => { if (res.ok) setStainTypes(res.data); });
    sectioningProtocolService.getAll().then(res => { if (res.ok) setProtocols(res.data); });
    stainOrderMacroService.getAll().then(res => { if (res.ok) setMacros(res.data); });
    mockMolecularTargetService.getAll().then(res => { if (res.ok) setMasterTargets(res.data); });
  };
  useEffect(() => { loadAll(); }, []);

  // Real, per direct guidance: the modal's own "Add to master
  // dictionary" action writes through to the real, persistent target
  // service, then refreshes this list - a target added mid-edit is
  // immediately available to search/select for the rest of this
  // session, not just this one modal instance.
  const handleAddTarget = async (symbol: string, detail: string) => {
    const res = await mockMolecularTargetService.add({ symbol, detail: detail || undefined, targetType: 'PROBE', active: true });
    if (res.ok) { setMasterTargets(prev => [...prev, res.data]); return res.data; }
    return null;
  };

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

  const handleCloneTarget = (source: MolecularTarget) => {
    setTargetModal({ mode: 'add', entry: { ...prepareDuplicate(source, 'symbol'), id: '__clone__' } });
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
    downloadCsv('StainDictionary.csv', toCsv(rows));
  };

  const handleStainFileUpload = async (file: File) => {
    if (!isCsvFile(file)) {
      alert(t('stainDictionarySection.csvUploadError', { fileName: file.name }));
      return;
    }
    const text = await readFileAsText(file);
    const rows: any[] = parseCsv(text);

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

  const typesTableHeaders = [
    t('stainDictionarySection.table.name'), t('stainDictionarySection.table.category'),
    t('stainDictionarySection.table.cloneVendor'), t('stainDictionarySection.table.billingCode'),
    t('stainDictionarySection.table.turnaround'), t('stainDictionarySection.table.status'), t('stainDictionarySection.table.actions'),
  ];
  const protocolsTableHeaders = [
    t('stainDictionarySection.table.name'), t('stainDictionarySection.table.description'),
    t('stainDictionarySection.table.status'), t('stainDictionarySection.table.actions'),
  ];
  const macrosTableHeaders = [
    t('stainDictionarySection.table.label'), t('stainDictionarySection.table.stainType'),
    t('stainDictionarySection.table.sectioningProtocol'), t('stainDictionarySection.table.status'), t('stainDictionarySection.table.actions'),
  ];
  const targetsTableHeaders = [
    t('stainDictionarySection.table.symbol'), t('stainDictionarySection.table.type'),
    t('stainDictionarySection.table.detail'), t('stainDictionarySection.table.status'), t('stainDictionarySection.table.actions'),
  ];

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('stainDictionarySection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('stainDictionarySection.subtitle')}
          </p>
        </div>
      </div>

      <div className="ps-tab-bar ps-staindict-tabs">
        <button className={`ps-tab-btn ${subTab === 'types' ? 'active' : ''}`} onClick={() => setSubTab('types')}>{t('stainDictionarySection.tabs.types', { count: stainTypes.length })}</button>
        <button className={`ps-tab-btn ${subTab === 'protocols' ? 'active' : ''}`} onClick={() => setSubTab('protocols')}>{t('stainDictionarySection.tabs.protocols', { count: protocols.length })}</button>
        <button className={`ps-tab-btn ${subTab === 'macros' ? 'active' : ''}`} onClick={() => setSubTab('macros')}>{t('stainDictionarySection.tabs.macros', { count: macros.length })}</button>
        <button className={`ps-tab-btn ${subTab === 'targets' ? 'active' : ''}`} onClick={() => setSubTab('targets')}>{t('stainDictionarySection.tabs.targets', { count: masterTargets.length })}</button>
      </div>

      {subTab === 'types' && (
        <>
          <div className="ps-conf-form-row--3">
            <input type="text" placeholder={t('stainDictionarySection.searchTypesPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
            <div className="ps-specdict-header-actions">
              <button className="ps-conf-btn-secondary" onClick={handleDownloadStainTypes}>{t('common.export')}</button>
              <button className="ps-conf-btn-secondary" onClick={() => stainImportFileInputRef.current?.click()}>{t('stainDictionarySection.importSpreadsheetBtn')}</button>
              <input ref={stainImportFileInputRef} type="file" hidden accept=".csv,text/csv" onChange={e => { if (e.target.files?.[0]) handleStainFileUpload(e.target.files[0]); e.target.value = ''; }} />
            </div>
            <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setTypeModal({ mode: 'add' })}>{t('stainDictionarySection.addTypeBtn')}</button>
          </div>
          {stainImportPreview && (
            <div className="ps-conf-import-preview">
              <p>{t('stainDictionarySection.importPreview', { newCount: stainImportCounts.newCount, updateCount: stainImportCounts.updateCount })}</p>
              <button className="ps-conf-btn-primary" onClick={handleApplyStainImport}>{t('stainDictionarySection.applyImportBtn')}</button>
              <button className="ps-conf-btn-row" onClick={() => setStainImportPreview(null)}>{t('common.cancel')}</button>
            </div>
          )}
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky">
                  <tr>{typesTableHeaders.map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredTypes.map(s => (
                    <tr key={s.id} className="ps-conf-tr">
                      <td className="ps-conf-td"><div className="ps-conf-identity-name">{s.name}</div></td>
                      <td className="ps-conf-td">{t(STAIN_CATEGORY_LABEL_KEY[s.category])}</td>
                      <td className="ps-conf-td"><div className="ps-specreq-meta">{[s.antibodyClone, s.vendor].filter(Boolean).join(' · ') || '—'}</div></td>
                      <td className="ps-conf-td">{s.defaultBillingCode || '—'}</td>
                      <td className="ps-conf-td">{s.defaultTurnaroundHours ? t('stainDictionarySection.hoursShort', { h: s.defaultTurnaroundHours }) : '—'}</td>
                      <td className="ps-conf-td">
                        <span className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${s.active ? 'ps-conf-status-dot--active' : ''}`} />
                          <span className={`ps-conf-status-text ${s.active ? 'ps-conf-status-text--active' : ''}`}>{s.active ? t('common.active') : t('common.inactive')}</span>
                        </span>
                      </td>
                      <td className="ps-conf-td">
                        <button className="ps-conf-btn-row" onClick={() => setTypeModal({ mode: 'edit', entry: s })}>{t('common.edit')}</button>
                        <button className="ps-conf-btn-row" onClick={() => handleCloneStainType(s)}>{t('common.duplicate')}</button>
                      </td>
                    </tr>
                  ))}
                  {filteredTypes.length === 0 && <tr><td className="ps-conf-empty-row" colSpan={6}>{t('stainDictionarySection.noTypesMatch')}</td></tr>}
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
            <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setProtocolModal({ mode: 'add' })}>{t('stainDictionarySection.addProtocolBtn')}</button>
          </div>
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky"><tr>{protocolsTableHeaders.map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr></thead>
                <tbody>
                  {protocols.map(p => (
                    <tr key={p.id} className="ps-conf-tr">
                      <td className="ps-conf-td"><div className="ps-conf-identity-name" data-phi="name">{p.name}</div></td>
                      <td className="ps-conf-td"><div className="ps-specreq-meta">{p.description ?? '—'}</div></td>
                      <td className="ps-conf-td">
                        <span className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${p.active ? 'ps-conf-status-dot--active' : ''}`} />
                          <span className={`ps-conf-status-text ${p.active ? 'ps-conf-status-text--active' : ''}`}>{p.active ? t('common.active') : t('common.inactive')}</span>
                        </span>
                      </td>
                      <td className="ps-conf-td">
                        <button className="ps-conf-btn-row" onClick={() => setProtocolModal({ mode: 'edit', entry: p })}>{t('common.edit')}</button>
                        <button className="ps-conf-btn-row" onClick={() => handleCloneProtocol(p)}>{t('common.duplicate')}</button>
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
            <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setMacroModal({ mode: 'add' })}>{t('stainDictionarySection.addMacroBtn')}</button>
          </div>
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky"><tr>{macrosTableHeaders.map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr></thead>
                <tbody>
                  {macros.map(m => (
                    <tr key={m.id} className="ps-conf-tr">
                      <td className="ps-conf-td"><div className="ps-conf-identity-name">{m.label}</div></td>
                      <td className="ps-conf-td">{stainName(m.stainTypeId)}</td>
                      <td className="ps-conf-td">{protocolName(m.sectioningProtocolId)}</td>
                      <td className="ps-conf-td">
                        <span className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${m.active ? 'ps-conf-status-dot--active' : ''}`} />
                          <span className={`ps-conf-status-text ${m.active ? 'ps-conf-status-text--active' : ''}`}>{m.active ? t('common.active') : t('common.inactive')}</span>
                        </span>
                      </td>
                      <td className="ps-conf-td">
                        <button className="ps-conf-btn-row" onClick={() => setMacroModal({ mode: 'edit', entry: m })}>{t('common.edit')}</button>
                        <button className="ps-conf-btn-row" onClick={() => handleCloneMacro(m)}>{t('common.duplicate')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {subTab === 'targets' && (
        <>
          <div className="ps-conf-form-row--3">
            <div /><div />
            <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setTargetModal({ mode: 'add' })}>{t('stainDictionarySection.addTargetBtn')}</button>
          </div>
          <p className="ps-conf-section-subtitle">
            {t('stainDictionarySection.targetsIntro')}
          </p>
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky"><tr>{targetsTableHeaders.map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr></thead>
                <tbody>
                  {masterTargets.map(target => (
                    <tr key={target.id} className="ps-conf-tr">
                      <td className="ps-conf-td"><div className="ps-conf-identity-name">{target.symbol}</div></td>
                      <td className="ps-conf-td">{t(TARGET_TYPE_LABEL_KEY[target.targetType])}</td>
                      <td className="ps-conf-td">{target.detail ?? '—'}</td>
                      <td className="ps-conf-td">
                        <span className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${target.active ? 'ps-conf-status-dot--active' : ''}`} />
                          <span className={`ps-conf-status-text ${target.active ? 'ps-conf-status-text--active' : ''}`}>{target.active ? t('common.active') : t('common.inactive')}</span>
                        </span>
                      </td>
                      <td className="ps-conf-td">
                        <button className="ps-conf-btn-row" onClick={() => setTargetModal({ mode: 'edit', entry: target })}>{t('common.edit')}</button>
                        <button className="ps-conf-btn-row" onClick={() => handleCloneTarget(target)}>{t('common.duplicate')}</button>
                      </td>
                    </tr>
                  ))}
                  {masterTargets.length === 0 && (
                    <tr><td className="ps-conf-empty-row" colSpan={5}>{t('stainDictionarySection.noTargetsYet')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {typeModal && (
        <StainTypeModal mode={typeModal.mode} entry={typeModal.entry} existingEntries={stainTypes}
          masterTargets={masterTargets} onAddTarget={handleAddTarget}
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
      {targetModal && (
        <MolecularTargetModal mode={targetModal.mode} entry={targetModal.entry} existingEntries={masterTargets}
          onSave={async draft => {
            if (targetModal.mode === 'edit' && targetModal.entry) await mockMolecularTargetService.update(targetModal.entry.id, draft);
            else await mockMolecularTargetService.add(draft);
            setTargetModal(null); loadAll();
          }}
          onClose={() => setTargetModal(null)} />
      )}
    </div>
  );
};

export default StainDictionarySection;
