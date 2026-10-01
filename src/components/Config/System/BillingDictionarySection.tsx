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
//
// i18n note: BILLING_TYPE_LABEL (imported from codeMapTable.ts) is a
// shared, already-English constant owned by another file, not this
// one — left untouched here, same as every other batch's convention
// of not reaching into a shared export it doesn't own. The real
// BillingRuleStatus enum (DRAFT/PENDING_APPROVAL/ACTIVE/REJECTED/
// RETIRED) — an internal data value that also flows into
// mockBillingRuleService/auditService — keeps its raw value as the
// data key; only its on-screen badge text is translated, via the same
// "data key stays English, display label translated" LABEL_KEY
// pattern used for TAT_TYPE/ROLE/STAIN_CATEGORY elsewhere in this
// sweep (BILLING_STATUS_LABEL_KEY below).
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import '../../../pathscribe.css';
import { mockBillingRuleService } from '@/services/billing/mockBillingRuleService';
import type { BillingRuleVersion, BillingRuleStatus } from '@/types/billing/BillingRuleVersion';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import { mockModifierDictionaryService } from '@/services/billing/mockModifierDictionaryService';
import type { CptModifierEntry } from '@/services/billing/cptModifierDictionary';
import { HCPCS_LEVEL_II_DICTIONARY } from '@/services/billing/hcpcsLevelIIDictionary';
import type { HcpcsLevelIIEntry } from '@/services/billing/hcpcsLevelIIDictionary';
import type { BillingDictionaryEntry } from '@/services/billing/RvuTableVersion';
import { BILLING_TYPE_LABEL } from '@/services/billing/codeMapTable';
import { CptCodeSearchPicker } from '@/components/Common/CptCodeSearchPicker';
import { listAllSites } from '@/services/organisation/organisationService';
import type { Site } from '@/services/organisation/organisationService';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { auditService } from '@/services';

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
// now also be scoped to). `.name` here stays the real, canonical
// English reference name (the array itself, and the ISO `.code` that
// actually gets persisted as the rule's `country`, are unaffected by
// i18n); the on-screen dropdown label is translated separately below
// via EU_COUNTRY_NAME_KEY, same "data key stays English, display
// label translated" pattern used throughout this sweep.
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

const EU_COUNTRY_NAME_KEY: Record<string, string> = {
  AT: 'billingDictionarySection.countries.AT', BE: 'billingDictionarySection.countries.BE',
  BG: 'billingDictionarySection.countries.BG', HR: 'billingDictionarySection.countries.HR',
  CY: 'billingDictionarySection.countries.CY', CZ: 'billingDictionarySection.countries.CZ',
  DK: 'billingDictionarySection.countries.DK', EE: 'billingDictionarySection.countries.EE',
  FI: 'billingDictionarySection.countries.FI', FR: 'billingDictionarySection.countries.FR',
  DE: 'billingDictionarySection.countries.DE', GR: 'billingDictionarySection.countries.GR',
  HU: 'billingDictionarySection.countries.HU', IE: 'billingDictionarySection.countries.IE',
  IT: 'billingDictionarySection.countries.IT', LV: 'billingDictionarySection.countries.LV',
  LT: 'billingDictionarySection.countries.LT', LU: 'billingDictionarySection.countries.LU',
  MT: 'billingDictionarySection.countries.MT', NL: 'billingDictionarySection.countries.NL',
  PL: 'billingDictionarySection.countries.PL', PT: 'billingDictionarySection.countries.PT',
  RO: 'billingDictionarySection.countries.RO', SK: 'billingDictionarySection.countries.SK',
  SI: 'billingDictionarySection.countries.SI', ES: 'billingDictionarySection.countries.ES',
  SE: 'billingDictionarySection.countries.SE',
};

const BILLING_STATUS_LABEL_KEY: Record<BillingRuleStatus, string> = {
  DRAFT: 'billingDictionarySection.status.draft',
  PENDING_APPROVAL: 'billingDictionarySection.status.pendingApproval',
  ACTIVE: 'common.active',
  REJECTED: 'billingDictionarySection.status.rejected',
  RETIRED: 'billingDictionarySection.status.retired',
};

// `t` is optional — PendingApprovalSection.tsx also imports and calls
// this exported function directly, and it hasn't gone through its own
// i18n pass yet (it's still queued later in this sweep). Without a
// `t` passed in, the fallback stays the same plain English string
// that call site already renders today, so this file's own signature
// change doesn't force an unrelated file to be touched or break.
export function siteLabel(sites: Site[], siteId: string | undefined, t?: TFunction): string {
  if (!siteId) return t ? t('billingDictionarySection.enterpriseWideLabel') : 'Enterprise-Wide';
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
// CptCodeSearchPicker extracted to components/Common/CptCodeSearchPicker.tsx,
// per direct requirement - BillingReviewPanel.tsx's own new manual add-code
// feature needed this same, real search UI. See that shared file's own
// header for the full reasoning.

const NewVersionModal: React.FC<NewVersionModalProps> = ({ sites, billingCode, siteId, existingVersions, duplicateFrom, onSave, onClose }) => {
  const { t } = useTranslation();
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

  // Real, per direct guidance's own follow-up: modifiersAllowed was
  // free text despite a real, fixed CPT modifier dictionary genuinely
  // existing (cptModifierDictionary.ts) - fetched once, read-only,
  // same pattern as rvuEntries immediately above.
  const [modifierEntries, setModifierEntries] = useState<CptModifierEntry[]>([]);
  useEffect(() => {
    mockModifierDictionaryService.getActiveVersion().then(res => {
      if (res.ok && res.data) setModifierEntries(res.data.entries);
    });
  }, []);

  // Real, per direct guidance's own "HCPCS Level II Pre-loading" best
  // practice: unlike CPT/modifiers, HCPCS Level II is public domain -
  // the real, verified dictionary (hcpcsLevelIIDictionary.ts) is
  // embedded directly, no license or import step required.
  const hcpcsEntries: HcpcsLevelIIEntry[] = HCPCS_LEVEL_II_DICTIONARY;
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
  const [level, setLevel] = useState<BillingRuleVersion['level']>(seed?.level ?? duplicateFrom?.level ?? 'stain');
  const [billingType, setBillingType] = useState<BillingRuleVersion['billingType']>(seed?.billingType ?? duplicateFrom?.billingType ?? 'Global');
  const [hcpcsCode, setHcpcsCode] = useState(seed?.hcpcsCode ?? '');
  const [rvuWork, setRvuWork] = useState(seed?.rvuWork?.toString() ?? '');
  const [rvuPe, setRvuPe] = useState(seed?.rvuPe?.toString() ?? '');
  const [rvuMp, setRvuMp] = useState(seed?.rvuMp?.toString() ?? '');
  const [modifiersAllowed, setModifiersAllowed] = useState<string[]>(seed?.modifiersAllowed ?? []);
  const [quantityRules, setQuantityRules] = useState(seed?.quantityRules ?? '');
  const [bundlingRules, setBundlingRules] = useState(seed?.bundlingRules ?? '');
  const [documentationRequirements, setDocumentationRequirements] = useState((seed?.documentationRequirements ?? []).join(', '));
  const [suppressionAdvisory, setSuppressionAdvisory] = useState(seed?.suppressionAdvisory ?? '');
  const [country, setCountry] = useState(seed?.country ?? 'US');
  const [notes, setNotes] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [changeReason, setChangeReason] = useState('');
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
    if (!code.trim()) e.code = t('common.required');
    if (!cpt.trim()) e.cpt = t('billingDictionarySection.validation.cptRequired');
    if (!effectiveFrom) e.effectiveFrom = t('common.required');
    if (needsChangeReason && !changeReason.trim()) e.changeReason = t('billingDictionarySection.validation.changeReasonRequired');
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
      level,
      billingType,
      hcpcsCode: hcpcsCode.trim() || undefined,
      rvuWork: rvuWork.trim() ? Number(rvuWork) : undefined,
      rvuPe: rvuPe.trim() ? Number(rvuPe) : undefined,
      rvuMp: rvuMp.trim() ? Number(rvuMp) : undefined,
      modifiersAllowed: modifiersAllowed.length > 0 ? modifiersAllowed : undefined,
      quantityRules: quantityRules.trim() || undefined,
      bundlingRules: bundlingRules.trim() || undefined,
      documentationRequirements: parseCommaList(documentationRequirements),
      suppressionAdvisory: suppressionAdvisory.trim() || undefined,
      country: country.trim() || undefined,
      notes: notes.trim() || undefined,
      effectiveFrom: new Date(effectiveFrom).toISOString(),
      effectiveTo: null,
      changeReason: changeReason.trim() || undefined,
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
            ? t('billingDictionarySection.modal.duplicateTitle', { code: duplicateFrom.billingCode, scope: siteLabel(sites, duplicateFrom.siteId, t), version: duplicateFrom.version })
            : isNewCode
              ? t('billingDictionarySection.modal.newBillingCodeTitle')
              : t('billingDictionarySection.modal.newVersionTitle', { code: billingCode, scope: siteLabel(sites, siteId, t), version: (latest?.version ?? 0) + 1 })}
        </div>

        {/* Real, per direct request: "why don't we tab this modal."
            Reuses the same real ps-sub-tab-group/ps-sub-tab-btn
            pattern already proven elsewhere in this app (Validation
            Studies' own Studies/Dashboard/Reports row). */}
        <div className="ps-sub-tab-group">
          <button onClick={() => setModalTab('core')} className={`ps-sub-tab-btn${modalTab === 'core' ? ' active' : ''}`}>{t('billingDictionarySection.modal.tabBillingRvu')}</button>
          <button onClick={() => setModalTab('coding_rules')} className={`ps-sub-tab-btn${modalTab === 'coding_rules' ? ' active' : ''}`}>{t('billingDictionarySection.modal.tabCodingRules')}</button>
        </div>

        <div className="ps-ms-body">
          {modalTab === 'core' && (
            <>
              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.billingCodeLabel')} <span className="ps-conf-required">*</span></label>
                  <input className={`ps-conf-input ${errors.code ? 'ps-conf-input--error' : ''}`}
                    value={code} onChange={e => set(setCode)(e.target.value)} disabled={!isNewCode && !duplicateFrom}
                    placeholder={t('billingDictionarySection.modal.billingCodePlaceholder')} />
                  {errors.code && <span className="ps-conf-error-text">{errors.code}</span>}
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.scopeLabel')}</label>
                  <select className="ps-conf-select" value={targetSiteId} onChange={e => set(setTargetSiteId)(e.target.value)}>
                    <option value="">{t('billingDictionarySection.enterpriseWideLabel')}</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              {targetScopeChanged && (duplicateFrom || !isNewCode) && (
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--form-gap">
                  {t('billingDictionarySection.modal.newScopeNotice')}
                </p>
              )}

              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.countryLabel')}</label>
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
                    <optgroup label={t('billingDictionarySection.modal.countryGroupOperating')}>
                      <option value="US">US</option>
                      <option value="UK">UK</option>
                      <option value="AU">AU</option>
                      <option value="CA">CA</option>
                    </optgroup>
                    <optgroup label={t('billingDictionarySection.modal.countryGroupEU')}>
                      {EU_COUNTRIES.map(c => <option key={c.code} value={c.code}>{t(EU_COUNTRY_NAME_KEY[c.code])} ({c.code})</option>)}
                    </optgroup>
                    <optgroup label={t('billingDictionarySection.modal.countryGroupOther')}>
                      <option value="NZ">{t('billingDictionarySection.countries.NZ')} (NZ)</option>
                    </optgroup>
                  </select>
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.hcpcsCodeLabel')}</label>
                  <CptCodeSearchPicker
                    entries={hcpcsEntries}
                    value={hcpcsCode}
                    onChange={setHcpcsCode}
                    onSelect={entry => setHcpcsCode(entry.code)}
                  />
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
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.cptCodeLabel')} <span className="ps-conf-required">*</span></label>
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
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.descriptionLabel')}</label>
                  <input className="ps-conf-input" value={description} onChange={e => setDescription(e.target.value)}
                    placeholder={t('billingDictionarySection.modal.descriptionPlaceholder')} />
                </div>
              </div>

              <div className="ps-conf-form-row--3">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.levelLabel')} <span className="ps-conf-required">*</span></label>
                  <select className="ps-conf-input" value={level} onChange={e => setLevel(e.target.value as BillingRuleVersion['level'])}>
                    <option value="specimen">{t('billingDictionarySection.modal.levelSpecimenOption')}</option>
                    <option value="block">{t('billingDictionarySection.modal.levelBlockOption')}</option>
                    <option value="stain">{t('billingDictionarySection.modal.levelStainOption')}</option>
                    <option value="decant">{t('billingDictionarySection.modal.levelDecantOption')}</option>
                  </select>
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">
                    {t('billingDictionarySection.modal.componentTypeLabel')} <span className="ps-conf-required">*</span>{' '}
                    <span
                      className="ps-billingdict__info-badge"
                      title={t('billingDictionarySection.modal.componentTypeTooltip', { tc: BILLING_TYPE_LABEL.TC, professional: BILLING_TYPE_LABEL['26'], global: BILLING_TYPE_LABEL.Global })}
                    >i</span>
                  </label>
                  <select className="ps-conf-input" value={billingType} onChange={e => setBillingType(e.target.value as BillingRuleVersion['billingType'])}>
                    <option value="TC">{BILLING_TYPE_LABEL.TC}</option>
                    <option value="26">{BILLING_TYPE_LABEL['26']}</option>
                    <option value="Global">{BILLING_TYPE_LABEL.Global}</option>
                  </select>
                </div>
              </div>

              <div className="ps-conf-form-row--3">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.rvuWorkLabel')}</label>
                  <input className="ps-conf-input" type="number" step="0.01" value={rvuWork} onChange={e => setRvuWork(e.target.value)}
                    placeholder={t('billingDictionarySection.modal.rvuWorkPlaceholder')} />
                  <span className="ps-conf-section-subtitle">{t('billingDictionarySection.modal.rvuWorkHint')}</span>
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.rvuPeLabel')}</label>
                  <input className="ps-conf-input" type="number" step="0.01" value={rvuPe} onChange={e => setRvuPe(e.target.value)} />
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.rvuMpLabel')}</label>
                  <input className="ps-conf-input" type="number" step="0.01" value={rvuMp} onChange={e => setRvuMp(e.target.value)} />
                </div>
              </div>

              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.effectiveFromLabel')} <span className="ps-conf-required">*</span></label>
                  <input className={`ps-conf-input ${errors.effectiveFrom ? 'ps-conf-input--error' : ''}`}
                    type="date" value={effectiveFrom} onChange={e => set(setEffectiveFrom)(e.target.value)} />
                  {errors.effectiveFrom && <span className="ps-conf-error-text">{errors.effectiveFrom}</span>}
                </div>
                {needsChangeReason && (
                  <div className="ps-conf-form-field">
                    <label className="ps-conf-label">{t('billingDictionarySection.modal.changeReasonLabel')} <span className="ps-conf-required">*</span></label>
                    <input className={`ps-conf-input ${errors.changeReason ? 'ps-conf-input--error' : ''}`}
                      value={changeReason} onChange={e => set(setChangeReason)(e.target.value)}
                      placeholder={t('billingDictionarySection.modal.changeReasonPlaceholder')} />
                    {errors.changeReason && <span className="ps-conf-error-text">{errors.changeReason}</span>}
                  </div>
                )}
              </div>

              <div className="ps-conf-form-field">
                <label className="ps-conf-label">{t('billingDictionarySection.modal.notesLabel')}</label>
                <input className="ps-conf-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('billingDictionarySection.modal.notesPlaceholder')} />
              </div>
            </>
          )}

          {modalTab === 'coding_rules' && (
            <>
              <p className="ps-conf-section-subtitle ps-conf-section-subtitle--form-gap">
                {t('billingDictionarySection.modal.codingRulesIntro')}
              </p>

              <div className="ps-conf-form-row--3">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.modifiersLabel')}</label>
                  <div className="ps-conf-row-actions">
                    {modifierEntries.map(m => (
                      <label key={m.code} className="ps-conf-label" title={m.description}>
                        <input
                          type="checkbox"
                          checked={modifiersAllowed.includes(m.code)}
                          onChange={e => setModifiersAllowed(prev => e.target.checked ? [...prev, m.code] : prev.filter(c => c !== m.code))}
                        />
                        {' '}{m.code}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.quantityRuleLabel')}</label>
                  <input className="ps-conf-input" value={quantityRules} onChange={e => setQuantityRules(e.target.value)}
                    placeholder={t('billingDictionarySection.modal.quantityRulePlaceholder')} />
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.bundlingRuleLabel')}</label>
                  <input className="ps-conf-input" value={bundlingRules} onChange={e => setBundlingRules(e.target.value)}
                    placeholder={t('billingDictionarySection.modal.bundlingRulePlaceholder')} />
                </div>
              </div>
              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.documentationRequirementsLabel')}</label>
                  <input className="ps-conf-input" value={documentationRequirements} onChange={e => setDocumentationRequirements(e.target.value)}
                    placeholder={t('billingDictionarySection.modal.documentationRequirementsPlaceholder')} />
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">{t('billingDictionarySection.modal.suppressionAdvisoryLabel')}</label>
                  <input className="ps-conf-input" value={suppressionAdvisory} onChange={e => setSuppressionAdvisory(e.target.value)}
                    placeholder={t('billingDictionarySection.modal.suppressionAdvisoryPlaceholder')} />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" onClick={handleSave}>
            {duplicateFrom ? t('billingDictionarySection.modal.saveDuplicateBtn') : isNewCode ? t('billingDictionarySection.modal.createBillingCodeBtn') : t('billingDictionarySection.modal.createNewVersionBtn')}
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
  /** Real, per direct guidance's own Four-Eyes Principle requirement -
   *  moves a real DRAFT to PENDING_APPROVAL. Only ever shown for a
   *  version whose own status is genuinely DRAFT. */
  onSubmitForApproval: (version: number) => void;
  onClose: () => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ billingCode, siteId, sites, versions, onRetire, onDuplicate, onSubmitForApproval, onClose }) => {
  const { t } = useTranslation();
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  return (
    <div className="ps-ms-overlay ps-ms-overlay--top-align">
      {/* Real, same fix as NewVersionModal above - the real, existing
          8-column table here (Version/CPT/RVU/Effective From/
          Effective To/Status/Change Reason/Actions) already needed
          overflow-x: auto to cope with the 520px base width - a real
          sign of the same real problem, widened for the same reason. */}
      <div className="ps-ms-modal ps-ms-modal--extra-wide">
        <div className="ps-ms-header">{t('billingDictionarySection.historyModal.title', { code: billingCode, scope: siteLabel(sites, siteId, t) })}</div>
        <div className="ps-ms-body">
          <table className="ps-conf-table">
            <thead>
              <tr>{[
                t('billingDictionarySection.historyModal.table.version'),
                t('billingDictionarySection.historyModal.table.cpt'),
                t('billingDictionarySection.historyModal.table.rvuWork'),
                t('billingDictionarySection.historyModal.table.effectiveFrom'),
                t('billingDictionarySection.historyModal.table.effectiveTo'),
                t('billingDictionarySection.historyModal.table.status'),
                t('billingDictionarySection.historyModal.table.changeReason'),
                t('billingDictionarySection.historyModal.table.actions'),
              ].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
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
                      <span className={`ps-conf-status-text ${v.status === 'ACTIVE' ? 'ps-conf-status-text--active' : ''}`}>{t(BILLING_STATUS_LABEL_KEY[v.status])}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td">{v.changeReason ?? '—'}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => onDuplicate(v)}>{t('common.duplicate')}</button>
                      {v.status === 'DRAFT' && (
                        <button className="ps-conf-btn-row" onClick={() => onSubmitForApproval(v.version)}>{t('billingDictionarySection.historyModal.submitForApprovalBtn')}</button>
                      )}
                      {v.status === 'ACTIVE' && (
                        <button className="ps-conf-btn-row" onClick={() => onRetire(v.version)}>{t('billingDictionarySection.historyModal.retireBtn')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.close')}</button>
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
  const { t } = useTranslation();
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

  // Real, per direct guidance's own Four-Eyes Principle requirement -
  // moves a real DRAFT to PENDING_APPROVAL, placing it in a real,
  // different reviewer's queue. Audited here (UI layer), matching the
  // established pattern this app already uses for admin config
  // actions elsewhere (OutboundChargeDlqSection.tsx,
  // BillingTypeTriggerSection.tsx).
  const handleSubmitForApproval = async (billingCode: string, version: number, siteId?: string) => {
    const submittedBy = getSessionUser()?.id ?? 'unknown';
    const res = await mockBillingRuleService.submitForApproval(billingCode, version, siteId, submittedBy);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    auditService.logEvent({
      type: 'user',
      event: 'Billing rule submitted for approval',
      detail: `${billingCode} v${version}${siteId ? ` (site ${siteId})` : ' (enterprise-wide)'} submitted for review`,
      user: getSessionUser()?.firstName ? `${getSessionUser()?.firstName} ${getSessionUser()?.lastName ?? ''}`.trim() : submittedBy,
      caseId: null,
      confidence: null,
    });
    refresh();
  };

  if (loading) return <div className="ps-conf-loading">{t('billingDictionarySection.loading')}</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('billingDictionarySection.title')}</h3>
          <p className="ps-conf-section-subtitle">
            {t('billingDictionarySection.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setNewVersionState({ siteId: activeSiteId })}>{t('billingDictionarySection.addBillingCodeBtn')}</button>
      </div>

      {errorMsg && <p className="ps-conf-error-text">{errorMsg}</p>}

      <div className="ps-conf-form-row">
        <input type="text" placeholder={t('billingDictionarySection.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
        <select value={viewingSiteId} onChange={e => setViewingSiteId(e.target.value)} className="ps-conf-select">
          <option value="">{t('billingDictionarySection.viewingLabel', { scope: t('billingDictionarySection.enterpriseWideLabel') })}</option>
          {sites.map(s => <option key={s.id} value={s.id}>{t('billingDictionarySection.viewingLabel', { scope: s.name })}</option>)}
        </select>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead>
              <tr>{[
                t('billingDictionarySection.table.billingCode'),
                t('billingDictionarySection.table.cpt'),
                t('billingDictionarySection.table.description'),
                t('billingDictionarySection.table.rvuWork'),
                t('billingDictionarySection.table.effectiveFrom'),
                t('billingDictionarySection.table.scope'),
                t('billingDictionarySection.table.status'),
                t('billingDictionarySection.table.versions'),
                t('billingDictionarySection.table.actions'),
              ].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.billingCode}>
                  <td className="ps-conf-td"><span className="ps-conf-identity-name">{r.billingCode}</span></td>
                  <td className="ps-conf-td">{r.current.cpt}</td>
                  <td className="ps-conf-td">{r.current.description ?? '—'}</td>
                  <td className="ps-conf-td">
                    {r.current.rvuWork === undefined ? (
                      <span className="ps-conf-error-text">{t('billingDictionarySection.unverified')}</span>
                    ) : (
                      <>
                        {r.current.rvuWork}
                        {r.codeMapDrift !== undefined && (
                          <span className="ps-conf-error-text" title={t('billingDictionarySection.codeMapDriftTooltip', { driftValue: r.codeMapDrift, cpt: r.current.cpt, rvuWork: r.current.rvuWork })}>
                            {' '}{t('billingDictionarySection.codeMapDriftLabel', { value: r.codeMapDrift })}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="ps-conf-td">{new Date(r.current.effectiveFrom).toLocaleDateString()}</td>
                  <td className="ps-conf-td">
                    {r.isInherited
                      ? <span className="ps-conf-status-text">{t('billingDictionarySection.inheritedLabel')}</span>
                      : activeSiteId
                        ? <span className="ps-conf-status-text ps-conf-status-text--active">{t('billingDictionarySection.siteOverrideLabel')}</span>
                        : <span className="ps-conf-status-text">{t('billingDictionarySection.enterpriseWideLabel')}</span>}
                  </td>
                  <td className="ps-conf-td">
                    <span className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${r.current.status === 'ACTIVE' ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${r.current.status === 'ACTIVE' ? 'ps-conf-status-text--active' : ''}`}>{t(BILLING_STATUS_LABEL_KEY[r.current.status])}</span>
                    </span>
                  </td>
                  <td className="ps-conf-td">{r.scopedVersions.length}</td>
                  <td className="ps-conf-td">
                    <div className="ps-conf-row-actions">
                      <button className="ps-conf-btn-row" onClick={() => setHistoryFor({ billingCode: r.billingCode, siteId: r.isInherited ? undefined : activeSiteId })}>{t('billingDictionarySection.historyBtn')}</button>
                      <button className="ps-conf-btn-row" onClick={() => setNewVersionState({ duplicateFrom: r.current, siteId: activeSiteId })}>{t('common.duplicate')}</button>
                      {!r.isInherited && (
                        <button className="ps-conf-btn-row" onClick={() => setNewVersionState({ billingCode: r.billingCode, siteId: activeSiteId })}>{t('billingDictionarySection.newVersionBtn')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={9}>{t('billingDictionarySection.noBillingCodesMatch')}</td></tr>
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
          onSubmitForApproval={version => handleSubmitForApproval(historyFor.billingCode, version, historyFor.siteId)}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
};

export default BillingDictionarySection;
