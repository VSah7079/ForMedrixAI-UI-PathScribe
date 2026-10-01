// src/components/Config/System/BillingDictionarySection.tsx
// ─────────────────────────────────────────────────────────────
// Real admin UI for the per-billingCode append-only versioned Billing
// Dictionary (types/billing/BillingRuleVersion.ts,
// services/billing/mockBillingRuleService.ts) - replaces
// RvuCodeMapSection.tsx's whole-table "RVU Code Map" model, per
// direct, explicit guidance: each billingCode has its own independent
// version history now, not a whole-table snapshot.
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

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockBillingRuleService } from '@/services/billing/mockBillingRuleService';
import type { BillingRuleVersion } from '@/types/billing/BillingRuleVersion';
import { listAllSites } from '@/services/organisation/organisationService';
import type { Site } from '@/services/organisation/organisationService';
import { getSessionUser } from '@/services/auth/caseAccessControl';

type NewVersionDraft = Omit<BillingRuleVersion, 'version' | 'createdAt' | 'status'> & { status?: BillingRuleVersion['status'] };

function parseCommaList(value: string): string[] | undefined {
  const items = value.split(',').map(s => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

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

const NewVersionModal: React.FC<NewVersionModalProps> = ({ sites, billingCode, siteId, existingVersions, duplicateFrom, onSave, onClose }) => {
  const latest = existingVersions[existingVersions.length - 1];
  // Real, deliberate: duplicateFrom wins for pre-fill when given -
  // "start from THIS exact row," not just "the latest version of
  // whatever scope we happened to open this modal from."
  const seed = duplicateFrom ?? latest;
  const isNewCode = !billingCode && !duplicateFrom;

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
    if (Object.keys(e).length > 0) { setErrors(e); return; }
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
    <div className="ps-ms-overlay">
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
        <div className="ps-ms-body">
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
              <input className="ps-conf-input" value={country} onChange={e => setCountry(e.target.value)} placeholder="US" />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">HCPCS Code</label>
              <input className="ps-conf-input" value={hcpcsCode} onChange={e => setHcpcsCode(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">CPT Code <span className="ps-conf-required">*</span></label>
              <input className={`ps-conf-input ${errors.cpt ? 'ps-conf-input--error' : ''}`}
                value={cpt} onChange={e => set(setCpt)(e.target.value)} placeholder="e.g. 88342" />
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
                placeholder="Leave blank if unverified — never fabricated" />
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
            {/* Real, per direct feedback: paired into this same row
                whenever real estate allows, rather than its own
                standalone row — real, conditional field, so Notes
                below only moves up here alongside it when it's
                actually showing; Notes stays its own row otherwise,
                not left half-empty next to nothing. */}
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
    <div className="ps-ms-overlay">
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

  const refresh = () => {
    Promise.all([mockBillingRuleService.getAll(), listAllSites()]).then(([versionsRes, sitesRes]) => {
      if (versionsRes.ok) setAllVersions(versionsRes.data);
      setSites(sitesRes);
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
    return { billingCode, current, isInherited, scopedVersions };
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
        <button className="ps-conf-btn-primary" onClick={() => setNewVersionState({ siteId: activeSiteId })}>+ New Billing Code</button>
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
                  <td className="ps-conf-td">{r.current.rvuWork ?? '—'}</td>
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
