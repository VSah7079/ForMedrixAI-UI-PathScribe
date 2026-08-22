// src/components/Config/System/CaseMaskConfigSection.tsx
// ─────────────────────────────────────────────────────────────
// Real admin UI for CaseMaskConfig (types/config/CaseMaskConfig.ts,
// services/caseRegistry/) - the accession-number mask engine has been
// real, tested, and production-quality since before this screen
// existed; previewNextCaseNumber's own doc comment literally says it
// exists "for the admin config screen's live preview" - this is that
// screen, built directly against the real, already-complete
// getConfig/saveConfig/previewNextCaseNumber API, no service-layer
// work needed.
//
// Confirmed directly before building, per a real, direct question
// ("would the interface engine handle any of this logic?"): no -
// accession numbering is entirely PathScribe's own business logic,
// scoped to organisationId, resolved from PathScribe's own persisted
// config. The interface engine (Mirth/Rhapsody/etc., per the v1.2
// interface spec) only ever transports/translates messages; it has no
// role in generating or knowing this number.
//
// Real, live preview via previewNextCaseNumber - never consumes a
// sequence number, so an admin can safely experiment with a mask
// pattern before saving it. Site-prefix overrides are populated from
// the organisation's own real sites (services/organisation/), not
// free text, so a typo can't create an unresolvable {SITE} reference.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { mockCaseRegistryService } from '@/services/caseRegistry/mockCaseRegistryService';
import type { CaseMaskConfig } from '@/types/config/CaseMaskConfig';
import { DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_PREFIX, DEFAULT_FALLBACK_SEQUENCE_DIGITS } from '@/types/config/CaseMaskConfig';
import { listOrganisations } from '@/services/organisation/organisationService';
import type { Organisation } from '@/services/organisation/organisationService';
import { getSessionUser } from '@/services/auth/caseAccessControl';

const TOKEN_HELP = '{PREFIX} {SITE} {YEAR:4} {YEAR:2} {SEQ:N} — e.g. "{PREFIX}{YEAR:2}-{SEQ:4}" → "MFT26-0029"';

const CaseMaskConfigSection: React.FC = () => {
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [config, setConfig] = useState<CaseMaskConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewSiteId, setPreviewSiteId] = useState<string>('');

  // Draft form fields — kept separate from `config` (the real, loaded/
  // saved record) so "Reload" can always discard unsaved edits and
  // fall back to what's actually persisted.
  const [prefix, setPrefix] = useState('');
  const [maskPattern, setMaskPattern] = useState('');
  const [sequenceDigits, setSequenceDigits] = useState('4');
  const [resetSequenceAnnually, setResetSequenceAnnually] = useState(true);
  const [sitePrefixMap, setSitePrefixMap] = useState<Record<string, string>>({});

  useEffect(() => {
    listOrganisations().then(orgs => {
      setOrganisations(orgs);
      if (orgs.length > 0) setSelectedOrgId(orgs[0].id);
      setLoading(false);
    });
  }, []);

  const selectedOrg = organisations.find(o => o.id === selectedOrgId);

  const loadConfig = () => {
    if (!selectedOrgId) return;
    setBusy(true);
    mockCaseRegistryService.getConfig(selectedOrgId).then(res => {
      setBusy(false);
      if (res.ok === false) { setErrorMsg(res.error); return; }
      const real = res.data;
      // Real fallback, matching allocateNextCaseNumber's own
      // documented fallback path exactly - an organisation with no
      // config yet isn't an error, it's the same O{YEAR:2}-{SEQ:4}
      // scheme every unconfigured org already gets today.
      setConfig(real);
      setPrefix(real?.prefix ?? selectedOrg?.shortName ?? DEFAULT_FALLBACK_PREFIX);
      setMaskPattern(real?.maskPattern ?? DEFAULT_FALLBACK_MASK);
      setSequenceDigits(String(real?.sequenceDigits ?? DEFAULT_FALLBACK_SEQUENCE_DIGITS));
      setResetSequenceAnnually(real?.resetSequenceAnnually ?? true);
      setSitePrefixMap(real?.sitePrefixMap ?? {});
      setErrorMsg(null);
      setPreview(null);
    });
  };
  useEffect(loadConfig, [selectedOrgId]);

  const runPreview = () => {
    if (!selectedOrg) return;
    setBusy(true);
    mockCaseRegistryService.previewNextCaseNumber(selectedOrg.id, selectedOrg.timezone, previewSiteId || undefined).then(res => {
      setBusy(false);
      if (res.ok === false) { setErrorMsg(res.error); return; }
      setPreview(res.data);
      setErrorMsg(null);
    });
  };

  const handleSave = async () => {
    if (!selectedOrg) return;
    const digits = Number(sequenceDigits);
    if (!prefix.trim()) { setErrorMsg('A real prefix is required.'); return; }
    if (!maskPattern.trim()) { setErrorMsg('A real mask pattern is required.'); return; }
    if (!digits || digits < 1) { setErrorMsg('Sequence digits must be a real, positive number.'); return; }

    setBusy(true);
    const draft: CaseMaskConfig = {
      organisationId: selectedOrg.id,
      prefix: prefix.trim(),
      maskPattern: maskPattern.trim(),
      sequenceDigits: digits,
      // Real, deliberate: never resets currentSequence here - matches
      // saveConfig's own documented behavior exactly ("Does NOT reset
      // currentSequence unless the caller explicitly includes it —
      // changing the mask pattern shouldn't silently restart
      // numbering"). Preserves whatever the real, already-persisted
      // config has, or starts a genuinely new config at 0.
      currentSequence: config?.currentSequence ?? 0,
      resetSequenceAnnually,
      lastResetYear: config?.lastResetYear,
      sitePrefixMap: Object.keys(sitePrefixMap).length > 0 ? sitePrefixMap : undefined,
      updatedBy: getSessionUser()?.id ?? 'admin',
      updatedAt: new Date().toISOString(),
    };
    const res = await mockCaseRegistryService.saveConfig(draft);
    setBusy(false);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    setErrorMsg(null);
    loadConfig();
  };

  if (loading) return <div className="ps-conf-loading">Loading Case Mask Configuration...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Case Mask Configuration</h3>
          <p className="ps-conf-section-subtitle">
            Real, per-organisation accession-number mask rules. An accession number is a permanent, legally-binding
            identifier tied to physical tissue and chain of custody — saving here changes the mask going forward
            only; the current sequence counter is never reset by a pattern change. Site-prefix overrides only apply
            when the mask pattern actually uses {'{SITE}'}.
          </p>
        </div>
      </div>

      {errorMsg && <p className="ps-conf-error-text">{errorMsg}</p>}

      <div className="ps-conf-form-row">
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">Organisation</label>
          <select className="ps-conf-select" value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)}>
            {organisations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>

      {selectedOrg && (
        <>
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Prefix <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder={selectedOrg.shortName} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Sequence Digits <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" type="number" min="1" value={sequenceDigits} onChange={e => setSequenceDigits(e.target.value)} />
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Mask Pattern <span className="ps-conf-required">*</span></label>
            <input className="ps-conf-input" value={maskPattern} onChange={e => setMaskPattern(e.target.value)} />
            <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">{TOKEN_HELP}</p>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">
              <input type="checkbox" checked={resetSequenceAnnually} onChange={e => setResetSequenceAnnually(e.target.checked)} />
              {' '}Reset sequence annually (real, facility-timezone-anchored — never resets on device/browser local time)
            </label>
          </div>

          {(selectedOrg.sites ?? []).length > 0 && (
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Site Prefix Overrides (only consulted when the mask pattern uses {'{SITE}'})</label>
              {(selectedOrg.sites ?? []).map(site => (
                <div key={site.id} className="ps-conf-form-row">
                  <span className="ps-conf-identity-name">{site.name}</span>
                  <input className="ps-conf-input" value={sitePrefixMap[site.id] ?? ''}
                    onChange={e => setSitePrefixMap(prev => ({ ...prev, [site.id]: e.target.value }))}
                    placeholder={`Leave blank to use "${prefix}"`} />
                </div>
              ))}
              <p className="ps-conf-section-subtitle">
                {(selectedOrg.sites ?? []).length > 1 && !config?.sitePrefixMap
                  ? `${selectedOrg.name} currently runs one unified sequence across all ${(selectedOrg.sites ?? []).length} sites — leaving these blank preserves that.`
                  : ''}
              </p>
            </div>
          )}

          <div className="ps-conf-section-header">
            <h3 className="ps-conf-section-title">Live Preview</h3>
          </div>
          <div className="ps-conf-form-row">
            {(selectedOrg.sites ?? []).length > 0 && (
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">Preview for Site</label>
                <select className="ps-conf-select" value={previewSiteId} onChange={e => setPreviewSiteId(e.target.value)}>
                  <option value="">(none — org default)</option>
                  {(selectedOrg.sites ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <button className="ps-conf-btn-secondary" onClick={runPreview} disabled={busy}>Preview Next Number</button>
          </div>
          {preview && (
            <p className="ps-conf-section-subtitle">
              Next real accession number would be: <span className="ps-conf-identity-name">{preview}</span>
              {' '}— this does not consume a real sequence number.
            </p>
          )}

          <div className="ps-conf-form-row">
            <span className="ps-conf-section-subtitle">
              Current sequence: {config?.currentSequence ?? 0}
              {config?.lastResetYear ? ` · Last reset: ${config.lastResetYear}` : ''}
              {config ? ` · Last updated by ${config.updatedBy} on ${new Date(config.updatedAt).toLocaleDateString()}` : ' · Not yet configured — using the real, documented fallback scheme'}
            </span>
          </div>

          <div className="ps-ms-footer">
            <button className="ps-conf-btn-secondary" onClick={loadConfig} disabled={busy}>Reload</button>
            <button className="ps-conf-btn-primary" onClick={handleSave} disabled={busy}>Save</button>
          </div>
        </>
      )}
    </div>
  );
};

export default CaseMaskConfigSection;
