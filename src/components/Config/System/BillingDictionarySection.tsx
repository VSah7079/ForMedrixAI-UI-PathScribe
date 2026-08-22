// src/components/Config/System/BillingDictionarySection.tsx
// ─────────────────────────────────────────────────────────────
// Real admin UI for the per-billingCode append-only versioned Billing
// Dictionary (types/billing/BillingRuleVersion.ts,
// services/billing/mockBillingRuleService.ts).
//
// Real, corrected relationship to RvuCodeMapSection.tsx, per direct
// clarification — this does NOT replace it; they're deliberately
// separate, different concepts. RVU Code Map originated for Assist-
// mode cases, tracking a pathologist's own productivity (their real
// RVU output, for personal goals and peer averages) — a rough,
// whole-table, CMS-upload-driven reference. This Billing Dictionary
// exists because Orchestration mode made PathScribe the actual
// billing system of record, needing a real, precise, independently-
// versioned rule per billingCode — a genuinely different, more
// rigorous requirement than productivity tracking ever needed. Real,
// live search against the RVU Code Map's own current, verified
// entries (below) is the real, intended connection between them —
// a verified starting point for a new billing rule, not a merge of
// the two concepts into one.
//
// Two-level structure, matching the real (billingCode, version) model
// directly rather than flattening it: the main table shows one row per
// billingCode (its current, real ACTIVE version, for whichever scope -
// enterprise-wide or a real, selected Site - is currently being
// viewed); "History" opens that scope's full, real version history
// (the "Billing Rule Change Log" per direct guidance) - every version
// ever created, RETIRED ones included, never deleted.
//
// Real, two-tier site scoping, per direct, explicit guidance: a
// billingCode viewed while a real Site is selected shows that site's
// OWN override when one exists ("Site Override" badge), or the real
// enterprise-wide rule with an "Inherited" badge when it doesn't -
// exactly mirroring resolveBillingRuleAt's own real resolution
// algorithm, so what an admin sees here is genuinely what a real charge
// would resolve to for that site. NEVER called "Facility" anywhere in
// this file - see BillingRuleVersion.ts's own header for why.
//
// Real "Duplicate" action, per direct request ("this is pretty
// heavy"): pre-fills the New Version form from ANY specific existing
// row (an enterprise rule, or a specific site's own historical
// version) - including across scopes, so a new site's first override
// can start from the enterprise rule's own real values rather than a
// blank form. Distinct from the standard utils/duplicateEntry.ts
// pattern used elsewhere in this app: a billingCode is a resolvable
// reference, not a display name to suffix, so this reuses the New
// Version modal's own real, pre-fill-then-explicitly-save flow instead.
//
// modifiersAllowed/quantityRules/bundlingRules/documentationRequirements/
// suppressionAdvisory are rendered as real, informational reference
// fields only - this screen never validates or auto-suppresses a real
// charge because of them, matching BillingRuleVersion.ts's own header.
// Confirmed directly: nothing in this codebase reads these fields for
// enforcement anywhere.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import '../../../pathscribe.css';
import { mockBillingRuleService } from '@/services/billing/mockBillingRuleService';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import type { BillingDictionaryEntry } from '@/services/billing/RvuTableVersion';
import { listAllSites } from '@/services/organisation/organisationService';
import type { Site } from '@/services/organisation/organisationService';
import { getSessionUser } from '@/services/auth/caseAccessControl';

type NewVersionDraft = Omit<BillingRuleVersion, 'version' | 'createdAt' | 'status'> & { status?: BillingRuleVersion['status'] };

function parseCommaList(value: string): string[] | undefined {
  const items = value.split(',').map(s => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

// Real, per direct request: "add all the EU countries and New Zealand
// too." All 27 real, current EU member states (confirmed against a
// current source rather than assumed from memory, given this feeds a
// real billing-expert-facing screen) plus New Zealand, alphabetical
// by name, real ISO 3166-1 alpha-2 codes. Kept separate from the
// original 4 operating countries (US/UK/AU/CA) below — grouped
// visually in the dropdown itself, not merged into one flat list,
// since they're a real, different category (PathScribe's actual,
// confirmed operating countries vs. real countries a billing rule can
// now also be scoped to).
const EU_COUNTRIES: { code: string; name: string }[] = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
];

function siteLabel(sites: Site[], siteId: string | undefined): string {
  if (!siteId) return 'Enterprise-Wide';
  return sites.find(s => s.id === siteId)?.name ?? siteId;
}

// ── New Version modal ───────────────────────────────────────────────────────

interface NewVersionModalProps {
  sites: Site[];
  /** Real, new: which scope's own version history to pre-fill "next
   *  version" defaults from and enforce changeReason against - the
   *  billingCode being edited, and the exact scope (enterprise-wide
   *  when undefined, or a real siteId) this new version will belong
   *  to. Both fields are still editable in the form itself (a
   *  duplicate can retarget a different billingCode/site entirely -
   *  see duplicateFrom below), this is only the STARTING context. */
  billingCode?: string;
  siteId?: string;
  /** This (billingCode, siteId) scope's own real version history, in
   *  version order - used to determine whether changeReason is
   *  required (any version beyond the first WITHIN this exact scope)
   *  and to pre-fill sensible defaults from the most recent real
   *  version, so a routine annual update doesn't require re-typing
   *  every field from scratch. */
  existingVersions: BillingRuleVersion[];
  /** Real "Duplicate" source, per direct request - when given, every
   *  field pre-fills from THIS specific row (which may be a different
   *  billingCode/site than the billingCode/siteId props above - e.g.
   *  duplicating the enterprise rule as the starting point for a new
   *  site's own first override). Takes priority over
   *  existingVersions's own "latest" pre-fill when both could apply. */
  duplicateFrom?: BillingRuleVersion;
  onSave: (draft: NewVersionDraft) => void;
  onClose: () => void;
}

// Real, per direct request: "is there a way that we can verify
// codes... more like how we can search for ICD codes." Adapted from
// AccessionPage.tsx's own real, proven Icd10Picker pattern — same
// search-dropdown mechanics, single-select instead of multi-chip
// (a real billing rule has exactly one CPT code, not several).
//
// Real, per direct follow-up: "lets have just CPT code search" — this
// is now the sole real field for the CPT code, not a separate search
// box alongside a separate manual-entry input. A real, controlled
// component: value/onChange carry the real, current CPT value
// (supports typing a genuinely new code not yet in the dictionary —
// never blocks manual entry), onSelect fires additionally when a real
// dictionary match is picked, so the parent can also auto-fill
// Description/RVU/HCPCS from that same real match.
const CptCodeSearchPicker: React.FC<{
  entries: BillingDictionaryEntry[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (entry: BillingDictionaryEntry) => void;
  disabled?: boolean;
  hasError?: boolean;
}> = ({ entries, value, onChange, onSelect, disabled, hasError }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const matches = entries
    .filter(e => {
      const q = value.trim().toLowerCase();
      return !q || e.code.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
    })
    .slice(0, 20);

  return (
    <div className="ps-protocol-stainselect ps-protocol-stainselect--no-margin" ref={wrapRef}>
      <input
        className={`ps-conf-input ${hasError ? 'ps-conf-input--error' : ''}`}
        placeholder="e.g. 88342 — search by code or description"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        disabled={disabled}
      />
      {open && matches.length > 0 && (
        <div className="ps-protocol-stainselect-dropdown">
          {matches.map(e => (
            <div key={e.code} className="ps-protocol-stainselect-option ps-protocol-stainselect-option--code-col"
              onMouseDown={() => { onSelect(e); setOpen(false); }}>
              <span>{e.code}</span>
              <span className="ps-protocol-stainselect-option-cat">
                {e.description}{e.workRvu !== undefined ? ` · RVU ${e.workRvu}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {open && value.trim() && matches.length === 0 && (
        <div className="ps-protocol-stainselect-dropdown">
          <div className="ps-protocol-stainselect-empty">No matching verified codes — this will be saved as entered.</div>
        </div>
      )}
    </div>
  );
};

const NewVersionModal: React.FC<NewVersionModalProps> = ({ sites, billingCode, siteId, existingVersions, duplicateFrom, onSave, onClose }) => {
  const latest = existingVersions[existingVersions.length - 1];
  // Real, deliberate: duplicateFrom wins for pre-fill when given -
  // "start from THIS exact row," not just "the latest version of
  // whatever scope we happened to open this modal from."
  const seed = duplicateFrom ?? latest;
  const isNewCode = !billingCode && !duplicateFrom;

  // Real, per direct request: "is there a way that we can verify
  // codes... more like how we can search for ICD codes" — the RVU
  // Code Map's own current, real, CMS-verified entries are the
  // genuine, existing source of truth to search against (see this
  // file's own header for why that's the real, correct source rather
  // than inventing a separate one). Fetched once, read-only here —
  // this modal never writes to the Code Map, only searches it.
  const [rvuEntries, setRvuEntries] = useState<BillingDictionaryEntry[]>([]);
  useEffect(() => {
    mockRvuCodeMapService.getActiveVersion().then(res => {
      if (res.ok && res.data) setRvuEntries(res.data.entries);
    });
  }, []);

  // Real, per direct request: "why don't we tab this modal. But the
  // fields that include the 'below' text on the second tab." Splits
  // exactly at that real, existing explanatory paragraph's own
  // boundary — everything it actually describes (Modifiers/Quantity
  // Rule/Bundling Rule/Documentation Requirements/Suppression
  // Advisory) moves to its own tab; everything else (identity, RVU,
  // effective dating) stays on the first.
  const [modalTab, setModalTab] = useState<'core' | 'coding_rules'>('core');

  const [code, setCode] = useState(billingCode ?? duplicateFrom?.billingCode ?? '');
  const [targetSiteId, setTargetSiteId] = useState(siteId ?? duplicateFrom?.siteId ?? '');
  const [cpt, setCpt] = useState(seed?.cpt ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [hcpcsCode, setHcpcsCode] = useState(seed?.hcpcsCode ?? '');
  const [rvuWork, setRvuWork] = useState(seed?.rvuWork?.toString() ?? '');
  const [rvuPe, setRvuPe] = useState(seed?.rvuPe?.toString() ?? '');
  const [rvuMp, setRvuMp] = useState(seed?.rvuMp?.toString() ?? '');
  const [modifiersAllowed, setModifiersAllowed] = useState((seed?.modifiersAllowed ?? []).join(', '));
  const [quantityRules, setQuantityRules] = useState(seed?.quantityRules ?? '');
  const [bundlingRules, setBundlingRules] = useState(seed?.bundlingRules ?? '');
  const [documentationRequirements, setDocumentationRequirements] = useState((seed?.documentationRequirements ?? []).join(', '));
  const [suppressionAdvisory, setSuppressionAdvisory] = useState(seed?.suppressionAdvisory ?? '');
  const [country, setCountry] = useState(seed?.country ?? 'US');
  const [notes, setNotes] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [changeReason, setChangeReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const set = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setErrors({}); };

  // Real, deliberate: whether the FINAL, chosen (code, targetSiteId)
  // scope - which may differ from the modal's own starting
  // billingCode/siteId props when a duplicate retargets a different
  // scope - already has a real version 1 or not. A retargeted
  // duplicate (e.g. enterprise IHC-FIRST duplicated into a brand-new
  // site override) is that NEW scope's own real version 1, so no
  // changeReason should be forced on it even though existingVersions
  // (the ORIGINAL scope's history) is non-empty.
  const targetScopeChanged = code.trim() !== (billingCode ?? '') || (targetSiteId || undefined) !== siteId;
  const needsChangeReason = !targetScopeChanged && existingVersions.length > 0;

  const validate = () => {
    const e: typeof errors = {};
    if (!code.trim()) e.code = 'Required';
    if (!cpt.trim()) e.cpt = 'Required — customers may create custom billingCodes, but they must map to a real CPT/HCPCS/RVU value inside the Billing Dictionary, never invent their own.';
    if (!effectiveFrom) e.effectiveFrom = 'Required';
    if (needsChangeReason && !changeReason.trim()) e.changeReason = 'Required when adding a new version to an existing billingCode/site combination.';
    return e;
  };

  const handleSave = () => {
    const e = validate();
    // Real, per the tab redesign: every real validated field (code,
    // cpt, effectiveFrom, changeReason) lives on the "core" tab —
    // switching there on a real failure guarantees the error is
    // actually visible, rather than silently failing to save while
    // the admin is looking at "Coding Rules" with no visible feedback.
    if (Object.keys(e).length > 0) { setErrors(e); setModalTab('core'); return; }
    onSave({
      billingCode: code.trim(),
      siteId: targetSiteId.trim() || undefined,
      cpt: cpt.trim(),
      description: description.trim() || undefined,
      hcpcsCode: hcpcsCode.trim() || undefined,
      rvuWork: rvuWork.trim() ? Number(rvuWork) : undefined,
      rvuPe: rvuPe.trim() ? Number(rvuPe) : undefined,
      rvuMp: rvuMp.trim() ? Number(rvuMp) : undefined,
      modifiersAllowed: parseCommaList(modifiersAllowed),
      quantityRules: quantityRules.trim() || undefined,
      bundlingRules: bundlingRules.trim() || undefined,
      documentationRequirements: parseCommaList(documentationRequirements),
      suppressionAdvisory: suppressionAdvisory.trim() || undefined,
      country: country.trim() || undefined,
      notes: notes.trim() || undefined,
      effectiveFrom: new Date(effectiveFrom).toISOString(),
      effectiveTo: null,
      changeReason: changeReason.trim() || undefined,
      approvedBy: approvedBy.trim() || undefined,
      createdBy: getSessionUser()?.id ?? 'admin',
    });
  };

  return (
    <div className="ps-ms-overlay ps-ms-overlay--top-align">
      {/* Real, per direct feedback: base ps-ms-modal is only 520px —
          confirmed directly as the real root cause of the vertical-
          scroll complaint, not just field arrangement. --wide (620px)
          is a real, already-proven modifier in this exact modal
          family, used elsewhere for the same real reason — reused
          here rather than inventing a new width. */}
      <div className="ps-ms-modal ps-ms-modal--extra-wide">
        <div className="ps-ms-header">
          {duplicateFrom
            ? `Duplicate — ${duplicateFrom.billingCode} (${siteLabel(sites, duplicateFrom.siteId)}, v${duplicateFrom.version})`
            : isNewCode
              ? 'New Billing Code'
              : `New Version — ${billingCode} (${siteLabel(sites, siteId)}, v${(latest?.version ?? 0) + 1})`}
        </div>

        {/* Real, per direct request: "why don't we tab this modal."
            Reuses the same real ps-sub-tab-group/ps-sub-tab-btn
            pattern already proven elsewhere in this app (Validation
            Studies' own Studies/Dashboard/Reports row). */}
        <div className="ps-sub-tab-group">
          <button onClick={() => setModalTab('core')} className={`ps-sub-tab-btn${modalTab === 'core' ? ' active' : ''}`}>Billing & RVU</button>
          <button onClick={() => setModalTab('coding_rules')} className={`ps-sub-tab-btn${modalTab === 'coding_rules' ? ' active' : ''}`}>Coding Rules</button>
        </div>

        <div className="ps-ms-body">
          {modalTab === 'core' && (
            <>
              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Billing Code <span className="ps-conf-required">*</span></label>
                  <input className={`ps-conf-input ${errors.code ? 'ps-conf-input--error' : ''}`}
                    value={code} onChange={e => set(setCode)(e.target.value)} disabled={!isNewCode && !duplicateFrom}
                    placeholder="e.g. IHC-FIRST" />
                  {errors.code && <span className="ps-conf-error-text">{errors.code}</span>}
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Scope</label>
                  <select className="ps-conf-select" value={targetSiteId} onChange={e => set(setTargetSiteId)(e.target.value)}>
                    <option value="">Enterprise-Wide</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              {targetScopeChanged && (duplicateFrom || !isNewCode) && (
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--form-gap">
                  This will create a real, new, independent version 1 for this billing code + scope combination — its
                  own version history, separate from where it was duplicated from.
                </p>
              )}

              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Country</label>
                  {/* Real, per direct feedback: "are we actually going
                      to make them type in their country... that
                      should be cheap." Started from Organisation.
                      country's own real, established set
                      (services/organisation/organisationService.ts)
                      — PathScribe's actual, confirmed operating
                      countries. Real, per direct follow-up: "add all
                      the EU countries and New Zealand too" — the real,
                      current 27 EU member states (confirmed against a
                      current source, not assumed) plus NZ, added as
                      real, separate optgroups so the original 4
                      operating countries stay visually distinct from
                      the newly-added, broader set. country itself
                      stays a plain string on BillingRuleVersion (real,
                      deliberate — its own doc comment allows real ISO
                      3166-1 codes beyond a fixed set) — only the real,
                      current input mechanism changes here. */}
                  <select className="ps-conf-select" value={country} onChange={e => setCountry(e.target.value)}>
                    <optgroup label="Operating Countries">
                      <option value="US">US</option>
                      <option value="UK">UK</option>
                      <option value="AU">AU</option>
                      <option value="CA">CA</option>
                    </optgroup>
                    <optgroup label="European Union">
                      {EU_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                    </optgroup>
                    <optgroup label="Other">
                      <option value="NZ">New Zealand (NZ)</option>
                    </optgroup>
                  </select>
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">HCPCS Code</label>
                  <input className="ps-conf-input" value={hcpcsCode} onChange={e => setHcpcsCode(e.target.value)} placeholder="Optional" />
                </div>
              </div>

              {/* Real, per direct follow-up: "lets have just CPT code
                  search — assuming it's tied to our new Code
                  Dictionary." This is now the sole field for CPT —
                  the separate manual-entry input is gone. Selecting a
                  real dictionary match also fills Description/RVU/
                  HCPCS below; every field stays editable afterward
                  for a real, deliberate override. */}
              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">CPT Code <span className="ps-conf-required">*</span></label>
                  <CptCodeSearchPicker
                    entries={rvuEntries}
                    value={cpt}
                    onChange={value => set(setCpt)(value)}
                    hasError={!!errors.cpt}
                    onSelect={entry => {
                      setCpt(entry.code);
                      setDescription(entry.description);
                      if (entry.hcpcsCode) setHcpcsCode(entry.hcpcsCode);
                      if (entry.workRvu !== undefined) setRvuWork(entry.workRvu.toString());
                      if (entry.rvuPe !== undefined) setRvuPe(entry.rvuPe.toString());
                      if (entry.rvuMp !== undefined) setRvuMp(entry.rvuMp.toString());
                      setErrors({});
                    }}
                  />
                  {errors.cpt && <span className="ps-conf-error-text">{errors.cpt}</span>}
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Description</label>
                  <input className="ps-conf-input" value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Real, human-readable CPT description" />
                </div>
              </div>

              <div className="ps-conf-form-row--3">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">RVU — Work</label>
                  <input className="ps-conf-input" type="number" step="0.01" value={rvuWork} onChange={e => setRvuWork(e.target.value)}
                    placeholder="Blank if unverified" />
                  <span className="ps-conf-section-subtitle">Never fabricated — leave blank if unverified.</span>
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">RVU — Practice Expense</label>
                  <input className="ps-conf-input" type="number" step="0.01" value={rvuPe} onChange={e => setRvuPe(e.target.value)} />
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">RVU — Malpractice</label>
                  <input className="ps-conf-input" type="number" step="0.01" value={rvuMp} onChange={e => setRvuMp(e.target.value)} />
                </div>
              </div>

              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Effective From <span className="ps-conf-required">*</span></label>
                  <input className={`ps-conf-input ${errors.effectiveFrom ? 'ps-conf-input--error' : ''}`}
                    type="date" value={effectiveFrom} onChange={e => set(setEffectiveFrom)(e.target.value)} />
                  {errors.effectiveFrom && <span className="ps-conf-error-text">{errors.effectiveFrom}</span>}
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Approved By</label>
                  <input className="ps-conf-input" value={approvedBy} onChange={e => setApprovedBy(e.target.value)} placeholder="Optional" />
                </div>
                {needsChangeReason && (
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">Change Reason <span className="ps-conf-required">*</span></label>
                    <input className={`ps-conf-input ${errors.changeReason ? 'ps-conf-input--error' : ''}`}
                      value={changeReason} onChange={e => set(setChangeReason)(e.target.value)}
                      placeholder="Why this rule is changing" />
                    {errors.changeReason && <span className="ps-conf-error-text">{errors.changeReason}</span>}
                  </div>
                )}
              </div>

              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Notes</label>
                <input className="ps-conf-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Free-text audit note" />
              </div>
            </>
          )}

          {modalTab === 'coding_rules' && (
            <>
              <p className="ps-conf-section-subtitle ps-conf-section-subtitle--form-gap">
                The fields below are stored for audit, reference, and downstream RCM consumption only — PathScribe
                never validates, enforces, or auto-suppresses a real charge because of them. A suppression note flags a
                condition for a human or downstream RCM system to act on; it never stops PathScribe from generating the
                real charge itself.
              </p>

              <div className="ps-conf-form-row--3">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Modifiers Commonly Associated</label>
                  <input className="ps-conf-input" value={modifiersAllowed} onChange={e => setModifiersAllowed(e.target.value)}
                    placeholder="Comma-separated, e.g. 26, TC" />
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Quantity Rule (descriptive)</label>
                  <input className="ps-conf-input" value={quantityRules} onChange={e => setQuantityRules(e.target.value)}
                    placeholder="e.g. per block, first real IHC stain" />
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Bundling Rule (descriptive)</label>
                  <input className="ps-conf-input" value={bundlingRules} onChange={e => setBundlingRules(e.target.value)}
                    placeholder="e.g. IHC sequence first" />
                </div>
              </div>
              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Documentation Requirements (descriptive)</label>
                  <input className="ps-conf-input" value={documentationRequirements} onChange={e => setDocumentationRequirements(e.target.value)}
                    placeholder="Comma-separated, e.g. pathologist interpretation" />
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Suppression Advisory (descriptive, never auto-applied)</label>
                  <input className="ps-conf-input" value={suppressionAdvisory} onChange={e => setSuppressionAdvisory(e.target.value)}
                    placeholder="e.g. Bundled into base fee per local payer contract" />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" onClick={handleSave}>
            {duplicateFrom ? 'Save Duplicate' : isNewCode ? 'Create Billing Code' : 'Create New Version'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Version history modal ───────────────────────────────────────────────────

interface HistoryModalProps {
  billingCode: string;
  siteId?: string;
  sites: Site[];
  versions: BillingRuleVersion[];
  onRetire: (version: number) => void;
  onDuplicate: (version: BillingRuleVersion) => void;
  onClose: () => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ billingCode, siteId, sites, versions, onRetire, onDuplicate, onClose }) => {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  return (
    <div className="ps-ms-overlay ps-ms-overlay--top-align">
      {/* Real, same fix as NewVersionModal above - the real, existing
          8-column table here (Version/CPT/RVU/Effective From/
          Effective To/Status/Change Reason/Actions) already needed
          overflow-x: auto to cope with the 520px base width - a real
          sign of the same real problem, widened for the same reason. */}
      <div className="ps-ms-modal ps-ms-modal--extra-wide">
        <div className="ps-ms-header">Version History — {billingCode} ({siteLabel(sites, siteId)})</div>
        <div className="ps-ms-body">
          <table className="ps-conf-table">
            <thead>
              <tr>{['Version', 'CPT', 'RVU (Work)', 'Effective From', 'Effective To', 'Status', 'Change Reason', 'Actions'].map(h =>
                <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {sorted.map(v => (
                <tr key={v.version}>
                  <td className="ps-conf-td">v{v.version}</td>
                  <td className="ps-conf-td">{v.cpt}</td>
                  <td className="ps-conf-td">{v.rvuWork ?? '—'}</td>
                  <td className="ps-conf-td">{new Date(v.effectiveFrom).toLocaleDateString()}</td>
                  <td className="ps-conf-td">{v.effectiveTo ? new Date(v.effectiveTo).toLocaleDateString() : '—'}</td>
                  <td className="ps-conf-td">
                    <span className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${v.status === 'ACTIVE' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${v.status === 'ACTIVE' ? 'ps-conf-status-text--active' : ''}`}>{v.status}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td">{v.changeReason ?? '—'}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => onDuplicate(v)}>Duplicate</button>
                      {v.status === 'ACTIVE' && (
                        <button className="ps-conf-btn-row" onClick={() => onRetire(v.version)}>Retire</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ── Main section ─────────────────────────────────────────────────────────────

interface Row {
  billingCode: string;
  current: BillingRuleVersion;
  /** True when the currently-viewed scope is a real site AND that
   *  site has no override of its own for this billingCode - the row
   *  shown is the real, inherited enterprise-wide rule. */
  isInherited: boolean;
  scopedVersions: BillingRuleVersion[];
  /** Real, per direct request ahead of a real billing-expert review -
   *  the RVU Code Map's own current workRvu for this row's real CPT
   *  code, when it exists AND genuinely differs from what's stored
   *  here. undefined when there's no real drift to flag - either no
   *  Code Map entry exists for this CPT yet, or the two values
   *  genuinely agree. Never computed when this row's own rvuWork is
   *  itself undefined (an honest, disclosed gap is a different real
   *  state than drift, and shouldn't be flagged as if it were one). */
  codeMapDrift?: number;
}

const BillingDictionarySection: React.FC = () => {
  const [allVersions, setAllVersions] = useState<BillingRuleVersion[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Real, new: which scope is currently being viewed - '' means
  // Enterprise-Wide, a real Site.id shows that site's own overrides
  // (falling back to the enterprise rule, marked Inherited, for a
  // billingCode the site hasn't overridden).
  const [viewingSiteId, setViewingSiteId] = useState<string>('');
  const [newVersionState, setNewVersionState] = useState<{ billingCode?: string; siteId?: string; duplicateFrom?: BillingRuleVersion } | null>(null);
  const [historyFor, setHistoryFor] = useState<{ billingCode: string; siteId?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Real, per direct request ahead of a real billing-expert review:
  // the RVU Code Map's own current, real, CMS-verified entries — real,
  // read-only reference here, used only to flag a real, visible drift
  // warning on the main table below when a billingCode's own stored
  // RVU value no longer matches the Code Map's current figure for the
  // same real CPT code. Never auto-corrects anything — surfacing the
  // real gap for a human to review and decide is the whole point.
  const [rvuEntries, setRvuEntries] = useState<BillingDictionaryEntry[]>([]);

  const refresh = () => {
    Promise.all([mockBillingRuleService.getAll(), listAllSites(), mockRvuCodeMapService.getActiveVersion()]).then(([versionsRes, sitesRes, rvuRes]) => {
      if (versionsRes.ok) setAllVersions(versionsRes.data);
      setSites(sitesRes);
      if (rvuRes.ok && rvuRes.data) setRvuEntries(rvuRes.data.entries);
      setLoading(false);
    });
  };
  useEffect(refresh, []);

  const activeSiteId = viewingSiteId || undefined;

  // Real, per-billingCode grouping across BOTH the enterprise-wide
  // rows and the currently-viewed site's own rows - see this
  // component's own header for the real two-tier resolution this
  // mirrors.
  const byCodeAllScopes = new Map<string, BillingRuleVersion[]>();
  allVersions.forEach(v => {
    const list = byCodeAllScopes.get(v.billingCode) ?? [];
    list.push(v);
    byCodeAllScopes.set(v.billingCode, list);
  });

  // Every real billingCode with EITHER a real enterprise-wide row, OR
  // (when viewing a real site) a real, site-only custom billingCode
  // with no enterprise row at all - a real site can define its own
  // custom code, per direct guidance's own "facility-specific custom
  // billingCodes."
  const billingCodes = Array.from(byCodeAllScopes.entries())
    .filter(([, versions]) => versions.some(v => !v.siteId) || (activeSiteId && versions.some(v => v.siteId === activeSiteId)))
    .map(([code]) => code)
    .sort((a, b) => a.localeCompare(b));

  const rows: Row[] = billingCodes.map(billingCode => {
    const all = byCodeAllScopes.get(billingCode) ?? [];
    const enterpriseVersions = all.filter(v => !v.siteId);
    const siteVersions = activeSiteId ? all.filter(v => v.siteId === activeSiteId) : [];
    const enterpriseCurrent = enterpriseVersions.find(v => v.status === 'ACTIVE') ?? [...enterpriseVersions].sort((a, b) => b.version - a.version)[0];
    const siteCurrent = siteVersions.find(v => v.status === 'ACTIVE') ?? [...siteVersions].sort((a, b) => b.version - a.version)[0];
    const current = siteCurrent ?? enterpriseCurrent;
    const isInherited = !!activeSiteId && !siteCurrent && !!enterpriseCurrent;
    const scopedVersions = activeSiteId ? (siteVersions.length > 0 ? siteVersions : enterpriseVersions) : enterpriseVersions;
    const codeMapEntry = rvuEntries.find(e => e.code === current.cpt);
    const codeMapDrift = (current.rvuWork !== undefined && codeMapEntry?.workRvu !== undefined && codeMapEntry.workRvu !== current.rvuWork)
      ? codeMapEntry.workRvu
      : undefined;
    return { billingCode, current, isInherited, scopedVersions, codeMapDrift };
  }).filter(r => !search || r.billingCode.toLowerCase().includes(search.toLowerCase()) || r.current.cpt.includes(search));

  const handleSaveNewVersion = async (draft: NewVersionDraft) => {
    const res = await mockBillingRuleService.createVersion(draft);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    setNewVersionState(null);
    setErrorMsg(null);
    refresh();
  };

  const handleRetire = async (billingCode: string, version: number, siteId?: string) => {
    const res = await mockBillingRuleService.retireVersion(billingCode, version, undefined, siteId);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    refresh();
  };

  if (loading) return <div className="ps-conf-loading">Loading Billing Dictionary...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Billing Dictionary</h3>
          <p className="ps-conf-section-subtitle">
            Append-only and versioned — each row below is a billingCode's current, real, ACTIVE rule for the scope
            selected. PathScribe resolves and permanently stores CPT/HCPCS/RVU on each real charge at finalization;
            it never re-resolves a historical charge against a later version. modifiersAllowed, quantityRules,
            bundlingRules, documentationRequirements, and the suppression advisory are informational/reference
            fields only — PathScribe does not enforce, validate, or auto-suppress a real charge because of them.
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setNewVersionState({ siteId: activeSiteId })}>+ Add Billing Code</button>
      </div>

      {errorMsg && <p className="ps-conf-error-text">{errorMsg}</p>}

      <div className="ps-conf-form-row">
        <input type="text" placeholder="Search by billing code or CPT..." value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
        <select value={viewingSiteId} onChange={e => setViewingSiteId(e.target.value)} className="ps-conf-select">
          <option value="">Viewing: Enterprise-Wide</option>
          {sites.map(s => <option key={s.id} value={s.id}>Viewing: {s.name}</option>)}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead>
              <tr>{['Billing Code', 'CPT', 'Description', 'RVU (Work)', 'Effective From', 'Scope', 'Status', 'Versions', 'Actions'].map(h =>
                <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.billingCode}>
                  <td className="ps-conf-td"><span className="ps-conf-identity-name">{r.billingCode}</span></td>
                  <td className="ps-conf-td">{r.current.cpt}</td>
                  <td className="ps-conf-td">{r.current.description ?? '—'}</td>
                  <td className="ps-conf-td">
                    {r.current.rvuWork === undefined ? (
                      <span className="ps-conf-error-text">Unverified</span>
                    ) : (
                      <>
                        {r.current.rvuWork}
                        {r.codeMapDrift !== undefined && (
                          <span className="ps-conf-error-text" title={`RVU Code Map currently shows ${r.codeMapDrift} for CPT ${r.current.cpt} — this billing rule was last set to ${r.current.rvuWork}. Review and create a new version if the Code Map's figure should apply here.`}>
                            {' '}⚠ Code Map: {r.codeMapDrift}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="ps-conf-td">{new Date(r.current.effectiveFrom).toLocaleDateString()}</td>
                  <td className="ps-conf-td">
                    {r.isInherited
                      ? <span className="ps-conf-status-text">Inherited</span>
                      : activeSiteId
                        ? <span className="ps-conf-status-text ps-conf-status-text--active">Site Override</span>
                        : <span className="ps-conf-status-text">Enterprise-Wide</span>}
                  </td>
                  <td className="ps-conf-td">
                    <span className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${r.current.status === 'ACTIVE' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${r.current.status === 'ACTIVE' ? 'ps-conf-status-text--active' : ''}`}>{r.current.status}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td">{r.scopedVersions.length}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setHistoryFor({ billingCode: r.billingCode, siteId: r.isInherited ? undefined : activeSiteId })}>History</button>
                      <button className="ps-conf-btn-row" onClick={() => setNewVersionState({ duplicateFrom: r.current, siteId: activeSiteId })}>Duplicate</button>
                      {!r.isInherited && (
                        <button className="ps-conf-btn-row" onClick={() => setNewVersionState({ billingCode: r.billingCode, siteId: activeSiteId })}>New Version</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={9}>No billing codes match the current search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {newVersionState && (
        <NewVersionModal
          sites={sites}
          billingCode={newVersionState.billingCode}
          siteId={newVersionState.siteId}
          existingVersions={
            newVersionState.billingCode
              ? (byCodeAllScopes.get(newVersionState.billingCode) ?? []).filter(v => (v.siteId ?? undefined) === (newVersionState.siteId ?? undefined))
              : []
          }
          duplicateFrom={newVersionState.duplicateFrom}
          onSave={handleSaveNewVersion}
          onClose={() => { setNewVersionState(null); setErrorMsg(null); }}
        />
      )}

      {historyFor && (
        <HistoryModal
          billingCode={historyFor.billingCode}
          siteId={historyFor.siteId}
          sites={sites}
          versions={(byCodeAllScopes.get(historyFor.billingCode) ?? []).filter(v => (v.siteId ?? undefined) === (historyFor.siteId ?? undefined))}
          onRetire={version => handleRetire(historyFor.billingCode, version, historyFor.siteId)}
          onDuplicate={version => { setHistoryFor(null); setNewVersionState({ duplicateFrom: version, siteId: activeSiteId }); }}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
};

export default BillingDictionarySection;
