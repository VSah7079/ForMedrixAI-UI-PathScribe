// src/components/Config/System/FacilitySetupSection.tsx
// ─────────────────────────────────────────────────────────────
// Real admin UI for Site-level connection/registration setup
// (services/organisation/ — CLIA/ISO number, LIS endpoint/type/
// version, connection auth type, credential-configured status). Real,
// new persistence layer built alongside this screen: organisationService.ts
// was entirely read-only before this (a static seed array, no real
// storage-backed writes at all, unlike every other real mock service
// in this app) — see updateSiteFacilitySetup's own doc comment for the
// real, additive overlay this screen writes through, and this file's
// own header for the one, disclosed limitation (a handful of
// synchronous helper functions elsewhere in organisationService.ts,
// used in 11+ other real files, keep reading the original static seed
// only — converting them to reflect live edits too would be a much
// larger, separate refactor, not taken on here).
//
// Deliberately NEVER stores a raw credential/secret value - see
// Site.credentialConfigured's own doc comment. credentialConfigured is
// a real boolean flag only ("has a credential been provisioned for
// this connection, presumably via a real secrets manager this app
// doesn't model"), never a password/API-key/token field.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { listAllSites, updateSiteFacilitySetup } from '@/services/organisation/organisationService';
import type { Site, LisType } from '@/services/organisation/organisationService';
import { getSessionUser } from '@/services/auth/caseAccessControl';

const LIS_TYPES: LisType[] = ['WinPath', 'Telepath', 'Epic', 'CoPath', 'Beaker', 'Other'];
const AUTH_TYPES: NonNullable<Site['connectionAuthType']>[] = ['none', 'basic', 'oauth2', 'api_key'];

interface EditModalProps {
  site: Site;
  onSave: (update: Parameters<typeof updateSiteFacilitySetup>[1]) => void;
  onClose: () => void;
}

const EditModal: React.FC<EditModalProps> = ({ site, onSave, onClose }) => {
  const [cliaOrIsoNumber, setCliaOrIsoNumber] = useState(site.cliaOrIsoNumber ?? '');
  const [performingLabType, setPerformingLabType] = useState<NonNullable<Site['performingLabType']> | ''>(site.performingLabType ?? '');
  const [lisType, setLisType] = useState<LisType>(site.lisType);
  const [lisEndpoint, setLisEndpoint] = useState(site.lisEndpoint ?? '');
  const [lisVersion, setLisVersion] = useState(site.lisVersion ?? '');
  const [connectionAuthType, setConnectionAuthType] = useState<NonNullable<Site['connectionAuthType']>>(site.connectionAuthType ?? 'none');
  const [credentialConfigured, setCredentialConfigured] = useState(site.credentialConfigured ?? false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!lisEndpoint.trim()) e.lisEndpoint = 'Required';
    if (connectionAuthType !== 'none' && !credentialConfigured) {
      e.credentialConfigured = 'A real auth type is selected but no credential is marked as configured — this connection would fail.';
    }
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    onSave({
      cliaOrIsoNumber: cliaOrIsoNumber.trim() || undefined,
      performingLabType: performingLabType || undefined,
      lisType,
      lisEndpoint: lisEndpoint.trim(),
      lisVersion: lisVersion.trim() || undefined,
      connectionAuthType,
      credentialConfigured,
      updatedBy: getSessionUser()?.id ?? 'admin',
    });
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Facility Setup — {site.name}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">CLIA / ISO Registration Number</label>
            <input className="ps-conf-input" value={cliaOrIsoNumber} onChange={e => setCliaOrIsoNumber(e.target.value)}
              placeholder="e.g. a real CLIA number (US) or accreditation number" />
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Performing Lab Type (Place of Service)</label>
            <select className="ps-conf-select" value={performingLabType} onChange={e => setPerformingLabType(e.target.value as NonNullable<Site['performingLabType']> | '')}>
              <option value="">Not set</option>
              <option value="independent">Independent Lab</option>
              <option value="hospital_based">Hospital-Based</option>
            </select>
            <p className="ps-billing-reason-hint">
              A real, raw fact about this specific lab — not a computed CMS Place of Service code. The interface
              engine/RCM resolves the actual POS code (e.g. 11, 22) from this, since the exact mapping varies by
              payer.
            </p>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">LIS Type</label>
              <select className="ps-conf-select" value={lisType} onChange={e => setLisType(e.target.value as LisType)}>
                {LIS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">LIS Version</label>
              <input className="ps-conf-input" value={lisVersion} onChange={e => setLisVersion(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="ps-conf-form-field">
            <label className="ps-conf-label">LIS Endpoint <span className="ps-conf-required">*</span></label>
            <input className={`ps-conf-input ${errors.lisEndpoint ? 'ps-conf-input--error' : ''}`}
              value={lisEndpoint} onChange={e => setLisEndpoint(e.target.value)} placeholder="e.g. hl7://lis.example.org:2575" />
            {errors.lisEndpoint && <span className="ps-conf-error-text">{errors.lisEndpoint}</span>}
          </div>

          <p className="ps-conf-section-subtitle">
            No real credential value is ever entered or stored here — only whether a real connection credential has
            been provisioned elsewhere (a real secrets manager), for this admin screen to reflect honestly.
          </p>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Connection Auth Type</label>
              <select className="ps-conf-select" value={connectionAuthType} onChange={e => setConnectionAuthType(e.target.value as any)}>
                {AUTH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">
                <input type="checkbox" checked={credentialConfigured} onChange={e => setCredentialConfigured(e.target.checked)} />
                {' '}Credential provisioned
              </label>
              {errors.credentialConfigured && <span className="ps-conf-error-text">{errors.credentialConfigured}</span>}
            </div>
          </div>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

const FacilitySetupSection: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Site | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = () => {
    listAllSites().then(data => { setSites(data); setLoading(false); });
  };
  useEffect(refresh, []);

  const rows = sites.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.siteCode.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (update: Parameters<typeof updateSiteFacilitySetup>[1]) => {
    if (!editing) return;
    const result = await updateSiteFacilitySetup(editing.id, update);
    if (!result) { setErrorMsg(`Could not save — "${editing.id}" is no longer a real, known site.`); return; }
    setEditing(null);
    setErrorMsg(null);
    refresh();
  };

  if (loading) return <div className="ps-conf-loading">Loading Facility Setup...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Facility Setup</h3>
          <p className="ps-conf-section-subtitle">
            Real, per-site connection and registration setup — CLIA/ISO number, LIS endpoint/type/version, and
            connection auth type. No raw credential value is ever entered or stored here — only whether one has
            been provisioned elsewhere.
          </p>
        </div>
      </div>

      {errorMsg && <p className="ps-conf-error-text">{errorMsg}</p>}

      <div className="ps-conf-form-row">
        <input type="text" placeholder="Search by site name or code..." value={search} onChange={e => setSearch(e.target.value)}
          className="ps-conf-search" />
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead>
              <tr>{['Site', 'Organisation', 'CLIA / ISO', 'Performing Lab Type', 'LIS Type', 'Endpoint', 'Credential', 'Actions'].map(h =>
                <th key={h} className="ps-conf-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td className="ps-conf-td"><span className="ps-conf-identity-name">{s.name}</span></td>
                  <td className="ps-conf-td">{s.organisationId}</td>
                  <td className="ps-conf-td">{s.cliaOrIsoNumber ?? '—'}</td>
                  <td className="ps-conf-td">{s.performingLabType === 'independent' ? 'Independent' : s.performingLabType === 'hospital_based' ? 'Hospital-Based' : '—'}</td>
                  <td className="ps-conf-td">{s.lisType}</td>
                  <td className="ps-conf-td">{s.lisEndpoint}</td>
                  <td className="ps-conf-td">
                    <span className="ps-conf-status-cell">
                      <span className={`ps-conf-status-dot ${s.credentialConfigured ? 'ps-conf-status-dot--active' : ''}`} />
                      <span className={`ps-conf-status-text ${s.credentialConfigured ? 'ps-conf-status-text--active' : ''}`}>
                        {s.credentialConfigured ? 'Configured' : 'Not configured'}
                      </span>
                    </span>
                  </td>
                  <td className="ps-conf-td">
                    <button className="ps-conf-btn-row" onClick={() => setEditing(s)}>Edit</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={7}>No sites match the current search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <EditModal site={editing} onSave={handleSave} onClose={() => { setEditing(null); setErrorMsg(null); }} />}
    </div>
  );
};

export default FacilitySetupSection;
