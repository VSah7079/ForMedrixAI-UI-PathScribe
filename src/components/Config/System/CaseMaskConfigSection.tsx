// src/components/Config/System/CaseMaskConfigSection.tsx
// ─────────────────────────────────────────────────────────────
// Real admin UI for CaseMask (types/config/CaseMask.ts,
// services/caseRegistry/). Full rebuild, per direct guidance across a
// real, extended conversation:
//
//   - Original screen only ever showed one organisation's single
//     CaseMaskConfig at a time, with Facility/Department variation
//     buried in override fields the screen barely surfaced — "Seems
//     off... we should see a list of defined Case Mask Configurations
//     Grouped by Facility and Department."
//   - Confirmed directly this app has two real, unconnected "location"
//     hierarchies — Organisation/Site (services/organisation/, no real
//     admin UI, hardcoded seed data) and Facility (services/
//     facilities/, real persistence + real admin UI, with roles and a
//     parentId → isEnterprise hierarchy). Per direct guidance ("a site
//     is a Facility that does testing... a Facility that actually has
//     an attached laboratory is defined as a Facility - Performing
//     Lab"), this screen is built entirely on Facility, never Site.
//   - "Change the data model so each Facility/Department can have its
//     own fully independent, separately-saved mask config" — no more
//     override merging. Each CaseMask below is a real, complete,
//     independently-owned record.
//   - "Only Enterprise-tagged facilities appear as selectable Parent
//     Institutions" confirmed there's no separate "Enterprise" entity
//     — it's a Facility with isEnterprise: true, reached from any
//     other Facility by a single parentId hop.
//
// Site/Organisation itself is untouched by this rebuild — real,
// separate, future work, per direct guidance ("we cannot have
// hardcode values like that... [but] finish Case Mask now, then scope
// the larger replacement").
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import '../../../pathscribe.css';
import { mockCaseMaskService } from '@/services/caseRegistry/mockCaseMaskService';
import type { CaseMask, CaseMaskScopeType } from '@/types/config/CaseMask';
import { DEFAULT_FALLBACK_PREFIX, DEFAULT_FALLBACK_MASK, DEFAULT_FALLBACK_SEQUENCE_DIGITS } from '@/types/config/CaseMask';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { departmentService } from '@/services';
import type { Department } from '@/services/departments/IDepartmentService';
import { mockFacilityService, type Facility } from '@/services/facilities/mockFacilityService';
import { getFacilityDateParts } from '@/utils/facilityTime';

const TOKEN_HELP = '{PREFIX} {YEAR:4} {YEAR:2} {SEQ:N} — e.g. "{PREFIX}{YEAR:2}-{SEQ:4}" → "MFT26-0029"';

const SCOPE_LABELS: Record<CaseMaskScopeType, string> = {
  enterprise: 'Enterprise',
  facility: 'Facility',
  department: 'Department',
};

interface CaseMaskModalProps {
  mode: 'add' | 'edit';
  mask?: CaseMask;
  departments: Department[];
  performingLabFacilities: Facility[];
  enterpriseFacilities: Facility[];
  existingScopeKeys: Set<string>;
  onSave: (mask: CaseMask) => void;
  onClose: () => void;
}

const CaseMaskModal: React.FC<CaseMaskModalProps> = ({ mode, mask, departments, performingLabFacilities, enterpriseFacilities, existingScopeKeys, onSave, onClose }) => {
  const [scopeType, setScopeType] = useState<CaseMaskScopeType>(mask?.scopeType ?? 'department');
  const [scopeId, setScopeId] = useState(mask?.scopeId ?? '');
  const [prefix, setPrefix] = useState(mask?.prefix ?? '');
  const [maskPattern, setMaskPattern] = useState(mask?.maskPattern ?? DEFAULT_FALLBACK_MASK);
  const [sequenceDigits, setSequenceDigits] = useState(String(mask?.sequenceDigits ?? DEFAULT_FALLBACK_SEQUENCE_DIGITS));
  const [resetSequenceAnnually, setResetSequenceAnnually] = useState(mask?.resetSequenceAnnually ?? true);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeOptions = useMemo(() => {
    if (scopeType === 'department') return departments.map(d => ({ id: d.id, name: d.name }));
    if (scopeType === 'facility') return performingLabFacilities.map(f => ({ id: f.id, name: f.name }));
    return enterpriseFacilities.map(f => ({ id: f.id, name: f.name }));
  }, [scopeType, departments, performingLabFacilities, enterpriseFacilities]);

  // Real scope points that already have their own CaseMask can't be
  // picked again from Add — Edit is how you change an existing one;
  // Add is only ever for a genuinely new scope. Editing an existing
  // mask always keeps its own current scope selectable.
  const availableOptions = scopeOptions.filter(o => o.id === scopeId || !existingScopeKeys.has(`${scopeType}::${o.id}`));

  const runPreview = async () => {
    if (!scopeId || !prefix.trim() || !maskPattern.trim()) return;
    setBusy(true);
    const digits = Number(sequenceDigits) || DEFAULT_FALLBACK_SEQUENCE_DIGITS;
    const seq = (mask?.currentSequence ?? 0) + 1;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { year: year4num } = getFacilityDateParts(new Date(), timezone);
    const year4 = String(year4num);
    const year2 = year4.slice(-2);
    const rendered = maskPattern.trim()
      .split('{PREFIX}').join(prefix.trim())
      .split('{YEAR:4}').join(year4)
      .split('{YEAR:2}').join(year2)
      .replace(/\{SEQ:(\d+)\}/, (_m: string, d: string) => String(seq).padStart(Number(d) || digits, '0'));
    setBusy(false);
    setPreview(rendered);
  };

  const handleSave = async () => {
    if (!scopeId) { setError('Select a real scope for this Case Mask.'); return; }
    const digits = Number(sequenceDigits);
    if (!prefix.trim()) { setError('A real prefix is required.'); return; }
    if (!maskPattern.trim()) { setError('A real mask pattern is required.'); return; }
    if (!digits || digits < 1) { setError('Sequence digits must be a real, positive number.'); return; }

    setBusy(true);
    const draft: CaseMask = {
      id: scopeId,
      scopeType,
      scopeId,
      prefix: prefix.trim(),
      maskPattern: maskPattern.trim(),
      sequenceDigits: digits,
      // Real, deliberate: never resets currentSequence here — changing
      // the mask pattern shouldn't silently restart numbering.
      currentSequence: mask?.currentSequence ?? 0,
      resetSequenceAnnually,
      lastResetYear: mask?.lastResetYear,
      updatedBy: getSessionUser()?.id ?? 'admin',
      updatedAt: new Date().toISOString(),
    };
    const res = await mockCaseMaskService.saveMask(draft);
    setBusy(false);
    if (res.ok === false) { setError(res.error); return; }
    onSave(res.data);
  };

  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {mode === 'add' ? 'Add Case Mask' : `Edit Case Mask — ${SCOPE_LABELS[scopeType]}`}
        </div>

        <div className="ps-ms-body">
          {error && <p className="ps-conf-error-text">{error}</p>}

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Scope <span className="ps-conf-required">*</span></label>
              <select className="ps-conf-select" value={scopeType} disabled={mode === 'edit'}
                onChange={e => { setScopeType(e.target.value as CaseMaskScopeType); setScopeId(''); }}>
                <option value="department">Department</option>
                <option value="facility">Facility (Performing Lab)</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{SCOPE_LABELS[scopeType]} <span className="ps-conf-required">*</span></label>
              <select className="ps-conf-select" value={scopeId} disabled={mode === 'edit'} onChange={e => setScopeId(e.target.value)}>
                <option value="">Select a real {SCOPE_LABELS[scopeType].toLowerCase()}…</option>
                {availableOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {scopeType === 'facility' && availableOptions.length === 0 && (
                <p className="ps-conf-section-subtitle ps-conf-section-subtitle--top-gap">
                  Every real performing-lab facility already has its own Case Mask.
                </p>
              )}
            </div>
          </div>

          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Prefix <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. MFT" />
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

          <div className="ps-conf-form-row">
            <button className="ps-conf-btn-secondary" onClick={runPreview} disabled={busy || !scopeId}>Preview Next Number</button>
            {preview && (
              <span className="ps-conf-section-subtitle">
                Next: <span className="ps-conf-identity-name">{preview}</span> — does not consume a real sequence number.
              </span>
            )}
          </div>

          {mask && (
            <p className="ps-conf-section-subtitle">
              Current sequence: {mask.currentSequence}
              {mask.lastResetYear ? ` · Last reset: ${mask.lastResetYear}` : ''}
              {` · Last updated by ${mask.updatedBy} on ${new Date(mask.updatedAt).toLocaleDateString()}`}
            </p>
          )}
        </div>

        <div className="ps-ms-footer">
          <button className="ps-ms-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" onClick={handleSave} disabled={busy}>Save</button>
        </div>
      </div>
    </div>
  );
};

const CaseMaskConfigSection: React.FC = () => {
  const [masks, setMasks] = useState<CaseMask[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; mask?: CaseMask } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      mockCaseMaskService.getAllMasks(),
      departmentService.getAll(),
      mockFacilityService.getAll(),
    ]).then(([masksRes, deptRes, facRes]) => {
      setLoading(false);
      if (masksRes.ok) setMasks(masksRes.data);
      if (deptRes.ok) setDepartments(deptRes.data.filter(d => d.status === 'Active'));
      if (facRes.ok) setFacilities(facRes.data.filter(f => f.status === 'Active'));
    });
  };
  useEffect(loadAll, []);

  // Only a Facility with the performing_lab role ever generates its
  // own accession numbers — a pure submitting/ordering facility's own
  // specimens get numbered by whichever real performing lab receives
  // them. Confirmed directly: "a site is a Facility that does
  // testing... a Facility - Performing Lab."
  const performingLabFacilities = useMemo(() => facilities.filter(f => f.roles.includes('performing_lab')), [facilities]);
  // Enterprise isn't a separate entity — same real Facility list,
  // filtered to isEnterprise: true, same real check
  // FacilityEditorModal.tsx's own Parent Enterprise picker uses.
  const enterpriseFacilities = useMemo(() => facilities.filter(f => f.isEnterprise), [facilities]);

  const departmentsById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments]);
  const facilitiesById = useMemo(() => new Map(facilities.map(f => [f.id, f])), [facilities]);

  const nameFor = (mask: CaseMask): string => {
    if (mask.scopeType === 'department') return departmentsById.get(mask.scopeId)?.name ?? mask.scopeId;
    return facilitiesById.get(mask.scopeId)?.name ?? mask.scopeId;
  };

  const existingScopeKeys = useMemo(() => new Set(masks.map(m => `${m.scopeType}::${m.scopeId}`)), [masks]);

  const grouped: Record<CaseMaskScopeType, CaseMask[]> = {
    enterprise: masks.filter(m => m.scopeType === 'enterprise'),
    facility: masks.filter(m => m.scopeType === 'facility'),
    department: masks.filter(m => m.scopeType === 'department'),
  };

  const handleDelete = async (mask: CaseMask) => {
    const res = await mockCaseMaskService.deleteMask(mask.scopeType, mask.scopeId);
    if (res.ok === false) { setErrorMsg(res.error); return; }
    setErrorMsg(null);
    loadAll();
  };

  if (loading) return <div className="ps-conf-loading">Loading Case Mask Configuration...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">Case Mask Configuration</h3>
          <p className="ps-conf-section-subtitle">
            Every real, currently-defined accession-number mask, grouped by scope. Each Case Mask is fully
            self-contained — its own prefix, pattern, and sequence counter, never merged with any other level.
            An accession number is a permanent, legally-binding identifier tied to physical tissue and chain of
            custody — saving a mask changes the pattern going forward only; the current sequence counter is
            never reset by a pattern change. A case with no Case Mask anywhere in its own chain (Department →
            performing-lab Facility → Enterprise) uses the default {DEFAULT_FALLBACK_PREFIX}{'{YEAR:2}'}-{'{SEQ:4}'} scheme.
          </p>
        </div>
        <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setModal({ mode: 'add' })}>+ Add Case Mask</button>
      </div>

      {errorMsg && <p className="ps-conf-error-text">{errorMsg}</p>}

      {(['enterprise', 'facility', 'department'] as CaseMaskScopeType[]).map(scopeType => (
        <div key={scopeType} style={{ marginTop: 20 }}>
          <h4 className="ps-conf-section-title" style={{ fontSize: 14 }}>{SCOPE_LABELS[scopeType]}</h4>
          {grouped[scopeType].length === 0 ? (
            <p className="ps-conf-section-subtitle">No {SCOPE_LABELS[scopeType].toLowerCase()}-level Case Mask defined yet.</p>
          ) : (
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr>{[SCOPE_LABELS[scopeType], 'Prefix', 'Mask Pattern', 'Current Sequence', 'Reset Annually', 'Actions'].map(h => (
                  <th key={h} className="ps-conf-th">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {grouped[scopeType].map(mask => (
                  <tr key={mask.id}>
                    <td className="ps-conf-td">{nameFor(mask)}</td>
                    <td className="ps-conf-td">{mask.prefix}</td>
                    <td className="ps-conf-td">{mask.maskPattern}</td>
                    <td className="ps-conf-td">{mask.currentSequence}</td>
                    <td className="ps-conf-td">{mask.resetSequenceAnnually ? 'Yes' : 'No'}</td>
                    <td className="ps-conf-td">
                      <button className="ps-conf-btn-secondary" onClick={() => setModal({ mode: 'edit', mask })}>Edit</button>
                      {' '}
                      <button className="ps-conf-btn-secondary" onClick={() => handleDelete(mask)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {modal && (
        <CaseMaskModal
          mode={modal.mode}
          mask={modal.mask}
          departments={departments}
          performingLabFacilities={performingLabFacilities}
          enterpriseFacilities={enterpriseFacilities}
          existingScopeKeys={existingScopeKeys}
          onSave={() => { setModal(null); loadAll(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};

export default CaseMaskConfigSection;
