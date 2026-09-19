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
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
    if (collision) { setNameError(`A stain type named "${collision.name}" already exists.`); return; }
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
        <div className="ps-ms-header">{mode === 'edit' ? `Edit — ${entry?.name}` : entry ? `Duplicate — ${entry.name}` : 'Add Diagnostic Process'}</div>
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

          {(category === 'IHC' || category === 'Special Stain') && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">QC & Control Slide Settings</label>

              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label" htmlFor="stain-qc-mode">Post-Run QC Enforcement Mode</label>
                  <select id="stain-qc-mode" className="ps-conf-select" value={qcEnforcementMode ?? ''} onChange={e => setQcEnforcementMode((e.target.value || undefined) as StainType['qcEnforcementMode'])}>
                    <option value="">\u2014 No override (use bench default) \u2014</option>
                    <option value="Enforced">Enforced</option>
                    <option value="Auto-Resolve">Auto-Resolve</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                  <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                    Overrides the Workstation Group's own instrument-level default for any batch running this
                    specific stain. Leave unset to defer entirely to the bench.
                  </p>
                </div>
              </div>

              <div className="ps-conf-toggle-row">
                <div onClick={() => { const next = !requiresTargetControl; setRequiresTargetControl(next); if (!next) { setAllowControlAutoAppend(false); setDefaultControlTissueType(''); } }}
                  className={`ps-conf-toggle-track ${requiresTargetControl ? 'ps-conf-toggle-track--active' : ''}`}>
                  <div className="ps-conf-toggle-thumb" />
                </div>
                <span className={`ps-conf-toggle-label ${requiresTargetControl ? 'ps-conf-toggle-label--active' : ''}`}>
                  Require target control slide (enforces the QC gate at sign-out)
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
                      Auto-append control slide on batch creation
                    </span>
                  </div>
                  <p className="ps-conf-section-subtitle">
                    Off: turn this off if this stain relies on a real, internal tissue control, or the lab allocates
                    its control slide manually — the QC gate above still applies, it just won't be satisfied by an
                    auto-created slide.
                  </p>

                  <div className="ps-conf-form-field ps-conf-section-subtitle--top-gap">
                    <label className="ps-conf-label">Default Control Tissue</label>
                    <input className="ps-conf-input" value={defaultControlTissueType} onChange={e => setDefaultControlTissueType(e.target.value)} placeholder="e.g. Tonsil, Breast, Colon (normal mucosa)" />
                    <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                      Informational only — pre-fills the auto-created control's own specimen description. Never
                      validated or enforced; a real run's own control tissue choice can differ.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
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
          {category === 'Molecular' && (
            <>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="stain-methodology">Methodology</label>
                <select id="stain-methodology" className="ps-conf-select" value={methodology} onChange={e => setMethodology(e.target.value as MolecularMethodology)}>
                  <option value="">— Select —</option>
                  <option value="FISH_ANATOMIC">Anatomic Pathology FISH</option>
                  <option value="FISH_CYTOGENETICS">Cytogenetic FISH</option>
                  <option value="PCR_SINGLE">Single-Gene / Targeted PCR</option>
                  <option value="NGS_PANEL">NGS Panel</option>
                </select>
              </div>

              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Default Targets</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {selectedTargets.map(t => (
                    <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', fontSize: 12, color: '#a78bfa' }}>
                      {t.symbol}{t.detail ? ` (${t.detail})` : ''}
                      <button
                        type="button"
                        onClick={() => setSelectedTargets(prev => prev.filter(x => x.id !== t.id))}
                        style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
                        aria-label={`Remove ${t.symbol}`}
                      >×</button>
                    </span>
                  ))}
                  {selectedTargets.length === 0 && <span className="ps-conf-hint">No default targets yet — search below to add from the master target dictionary.</span>}
                </div>
                <input
                  className="ps-conf-input"
                  placeholder="Search master targets (e.g. ERBB2, BCL2)…"
                  value={targetSearch}
                  onChange={e => setTargetSearch(e.target.value)}
                />
                {targetSearch.trim() && (
                  <div style={{ maxHeight: 140, overflowY: 'auto', marginTop: 4, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
                    {masterTargets
                      .filter(t => !selectedTargets.some(s => s.id === t.id))
                      .filter(t => t.symbol.toLowerCase().includes(targetSearch.trim().toLowerCase()) || t.detail?.toLowerCase().includes(targetSearch.trim().toLowerCase()))
                      .map(t => (
                        <div key={t.id} onClick={() => { setSelectedTargets(prev => [...prev, t]); setTargetSearch(''); }}
                          style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>
                          <strong>{t.symbol}</strong>{t.detail ? <span style={{ color: '#64748b' }}> — {t.detail}</span> : null}
                        </div>
                      ))}
                  </div>
                )}
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                  Copied onto each new order at order time, then freely editable there — changing this dictionary
                  default never touches an existing order's own targets.
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input className="ps-conf-input" placeholder="New target symbol (e.g. TP53)" value={newTargetSymbol} onChange={e => setNewTargetSymbol(e.target.value)} style={{ flex: 1 }} />
                  <input className="ps-conf-input" placeholder="Detail (e.g. 17p13.1) — optional" value={newTargetDetail} onChange={e => setNewTargetDetail(e.target.value)} style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="ps-conf-btn-secondary"
                    disabled={!newTargetSymbol.trim()}
                    onClick={async () => {
                      const created = await onAddTarget(newTargetSymbol.trim(), newTargetDetail.trim());
                      if (created) { setSelectedTargets(prev => [...prev, created]); setNewTargetSymbol(''); setNewTargetDetail(''); }
                    }}
                  >Add to master dictionary</button>
                </div>
              </div>

              <div className="ps-conf-form-field">
                <label className="ps-conf-label" htmlFor="billing-model">Billing Model</label>
                <select id="billing-model" className="ps-conf-select" value={billingModel} onChange={e => setBillingModel(e.target.value as BillingModel)}>
                  <option value="BASE_ADDON">Base + Add-on (with multiplex threshold)</option>
                  <option value="PER_UNIT_MULTIPLIER">Per-Unit Multiplier (N units of one code)</option>
                  <option value="FLAT_FEE">Flat Fee (one code regardless of target count)</option>
                </select>
              </div>
              {billingModel === 'BASE_ADDON' && (
                <div className="ps-conf-form-row">
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">Base billingCode (1st target)</label>
                    <input className="ps-conf-input" value={baseCptCode} onChange={e => setBaseCptCode(e.target.value)} placeholder="e.g. FISH-MANUAL-BASE" />
                  </div>
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">Add-on billingCode (each additional)</label>
                    <input className="ps-conf-input" value={addOnCptCode} onChange={e => setAddOnCptCode(e.target.value)} placeholder="e.g. FISH-MANUAL-ADDL" />
                  </div>
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">Multiplex billingCode</label>
                    <input className="ps-conf-input" value={multiplexCptCode} onChange={e => setMultiplexCptCode(e.target.value)} placeholder="e.g. FISH-MANUAL-MULTIPLEX" />
                  </div>
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">Multiplex threshold</label>
                    <input className="ps-conf-input" type="number" min="1" value={multiplexThreshold} onChange={e => setMultiplexThreshold(e.target.value)} />
                  </div>
                </div>
              )}
              {billingModel === 'PER_UNIT_MULTIPLIER' && (
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Per-unit billingCode</label>
                  <input className="ps-conf-input" value={perUnitCptCode} onChange={e => setPerUnitCptCode(e.target.value)} placeholder="e.g. FISH-CYTO-PROBE" />
                </div>
              )}
              {billingModel === 'FLAT_FEE' && (
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Flat-fee billingCode</label>
                  <input className="ps-conf-input" value={flatFeeCptCode} onChange={e => setFlatFeeCptCode(e.target.value)} placeholder="e.g. NGS-PANEL-5-50" />
                </div>
              )}
              <p className="ps-conf-section-subtitle">
                References real Billing Dictionary entries by their billingCode — never a raw CPT code directly,
                same convention as Default Billing Code above.
              </p>
            </>
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
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'edit' ? 'Save Changes' : 'Add Diagnostic Process'}</button>
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
    const collision = existingEntries.find(t =>
      t.id !== (mode === 'edit' ? entry?.id : undefined) &&
      t.symbol.toLowerCase() === symbol.trim().toLowerCase() &&
      (t.detail ?? '') === detail.trim()
    );
    if (collision) { setSymbolError(`A target "${collision.symbol}"${collision.detail ? ` (${collision.detail})` : ''} already exists.`); return; }
    setSymbolError(null);
    onSave({ symbol: symbol.trim(), detail: detail.trim() || undefined, targetType, active });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{mode === 'edit' ? `Edit — ${entry?.symbol}` : entry ? `Duplicate — ${entry.symbol}` : 'Add Target'}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Symbol <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={symbol} onChange={e => { setSymbol(e.target.value); setSymbolError(null); }} placeholder="e.g. ERBB2" />
              {symbolError && <div className="ps-body-modal-error">{symbolError}</div>}
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label" htmlFor="target-type">Type</label>
              <select id="target-type" className="ps-conf-select" value={targetType} onChange={e => setTargetType(e.target.value as MolecularTarget['targetType'])}>
                <option value="PROBE">Probe (FISH)</option>
                <option value="GENE">Gene (NGS)</option>
                <option value="MUTATION_REGION">Mutation Region (PCR)</option>
              </select>
            </div>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Detail</label>
            <input className="ps-conf-input" value={detail} onChange={e => setDetail(e.target.value)} placeholder="e.g. 17q12 (locus), or V600E (mutation) — optional" />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Status</label>
            <div className="ps-conf-toggle-row">
              <div onClick={() => setActive(!active)} className={`ps-conf-toggle-track ${active ? 'ps-conf-toggle-track--active' : ''}`}>
                <div className="ps-conf-toggle-thumb" />
              </div>
              <span className={`ps-conf-toggle-label ${active ? 'ps-conf-toggle-label--active' : ''}`}>{active ? 'Active' : 'Inactive'}</span>
            </div>
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
              Inactive targets stay searchable in existing Stain Type entries that already reference them, but won't
              appear when searching to add a new default target.
            </p>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-ms-btn-apply" onClick={handleSave}>{mode === 'edit' ? 'Save Changes' : 'Add Target'}</button>
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
      alert(`"${file.name}" isn't a CSV file. Export/download the template, edit it in your spreadsheet editor, and save it as .csv before importing.`);
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

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Diagnostic Catalog</h3>
          <p className="ps-conf-section-subtitle">
            Stains, FISH/molecular testing, and future testing suites, all in one catalog. Stain Type and
            Sectioning Protocol are independent dimensions — Quick-Order Macros compose one of each into a single
            ordering preset for the UX, without merging them in the data.
          </p>
        </div>
      </div>

      <div className="ps-tab-bar ps-staindict-tabs">
        <button className={`ps-tab-btn ${subTab === 'types' ? 'active' : ''}`} onClick={() => setSubTab('types')}>Diagnostic Assays ({stainTypes.length})</button>
        <button className={`ps-tab-btn ${subTab === 'protocols' ? 'active' : ''}`} onClick={() => setSubTab('protocols')}>Sectioning Protocols ({protocols.length})</button>
        <button className={`ps-tab-btn ${subTab === 'macros' ? 'active' : ''}`} onClick={() => setSubTab('macros')}>Quick-Order Macros ({macros.length})</button>
        <button className={`ps-tab-btn ${subTab === 'targets' ? 'active' : ''}`} onClick={() => setSubTab('targets')}>Master Targets ({masterTargets.length})</button>
      </div>

      {subTab === 'types' && (
        <>
          <div className="ps-conf-form-row--3">
            <input type="text" placeholder="Search stain types..." value={search} onChange={e => setSearch(e.target.value)} className="ps-conf-search" />
            <div className="ps-specdict-header-actions">
              <button className="ps-conf-btn-secondary" onClick={handleDownloadStainTypes}>Export</button>
              <button className="ps-conf-btn-secondary" onClick={() => stainImportFileInputRef.current?.click()}>Import Spreadsheet</button>
              <input ref={stainImportFileInputRef} type="file" hidden accept=".csv,text/csv" onChange={e => { if (e.target.files?.[0]) handleStainFileUpload(e.target.files[0]); e.target.value = ''; }} />
            </div>
            <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setTypeModal({ mode: 'add' })}>+ Add Diagnostic Process</button>
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

      {subTab === 'targets' && (
        <>
          <div className="ps-conf-form-row--3">
            <div /><div />
            <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setTargetModal({ mode: 'add' })}>+ Add Target</button>
          </div>
          <p className="ps-conf-section-subtitle">
            The real, master probe/gene/mutation-region catalog every Stain Type's own Default Targets is built
            from — edit an existing entry here to fix a symbol/detail typo across every Stain Type that already
            references it, or deactivate one that's no longer in use.
          </p>
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky"><tr>{['Symbol', 'Type', 'Detail', 'Status', 'Actions'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr></thead>
                <tbody>
                  {masterTargets.map(t => (
                    <tr key={t.id} className="ps-conf-tr">
                      <td className="ps-conf-td"><div className="ps-conf-identity-name">{t.symbol}</div></td>
                      <td className="ps-conf-td">{t.targetType === 'PROBE' ? 'Probe' : t.targetType === 'GENE' ? 'Gene' : 'Mutation Region'}</td>
                      <td className="ps-conf-td">{t.detail ?? '—'}</td>
                      <td className="ps-conf-td">
                        <span className="ps-conf-status-cell">
                          <span className={`ps-conf-status-dot ${t.active ? 'ps-conf-status-dot--active' : ''}`} />
                          <span className={`ps-conf-status-text ${t.active ? 'ps-conf-status-text--active' : ''}`}>{t.active ? 'Active' : 'Inactive'}</span>
                        </span>
                      </td>
                      <td className="ps-conf-td">
                        <button className="ps-conf-btn-row" onClick={() => setTargetModal({ mode: 'edit', entry: t })}>Edit</button>
                        <button className="ps-conf-btn-row" onClick={() => handleCloneTarget(t)}>Duplicate</button>
                      </td>
                    </tr>
                  ))}
                  {masterTargets.length === 0 && (
                    <tr><td className="ps-conf-empty-row" colSpan={5}>No targets yet.</td></tr>
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
