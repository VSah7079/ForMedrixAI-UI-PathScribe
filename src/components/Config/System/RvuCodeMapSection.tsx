// src/components/Config/System/RvuCodeMapSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real admin UI for the versioned CPT-to-work-RVU table
// (services/billing/). Built directly from a real product question -
// "is there a UI to update the table?" (no) and "these need to be
// versioned, correct?" (yes) - closing both gaps together.
//
// Deliberately easy to use, per direct request:
//   - The active version is front and center - what an admin cares
//     about 99% of the time.
//   - Older versions are collapsed behind a single toggle by default -
//     they're never deleted (see RvuTableVersion.ts for why), but
//     shouldn't clutter the common case.
//   - Upload flow matches this app's own established, real pattern
//     (SpecimenDictionarySection.tsx): download a real template first,
//     upload a real file, see a real preview before anything is
//     committed, then one click to save - and "activate immediately" is
//     checked by default, since an admin uploading a new CMS file
//     almost always wants it live right away, not sitting inactive
//     needing a second trip back to this screen.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '@/utils/csv';
import '../../../pathscribe.css';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import type { RvuTableVersion, BillingDictionaryEntry } from '@/services/billing/RvuTableVersion';
import { parseRvuUploadRows, validateCodeLevel, inferLevelFromDescription, BILLING_TYPE_LABEL, type ParsedRvuUploadRow } from '@/services/billing/codeMapTable';
import { getSessionUser } from '@/services/auth/caseAccessControl';

// Real fix, per direct guidance's own follow-up on dictionary
// licensing: this previously embedded what reads as real, verbatim
// AMA CPT descriptive text directly in source AND in a real,
// downloadable file every admin who clicks "Download Template"
// receives - exactly the PS-92 gap (codeMapTable.ts's own header)
// this table's real seed data was already fixed for, missed here.
// Synthetic description text now, matching that same, established
// "Code {code} — {Level} Level" format - the real code numbers stay
// accurate (numbers alone aren't licensed content), only the
// human-readable description is synthetic.
const TEMPLATE_EXAMPLE_ROWS = [
  { Code: '88305', Description: 'Code 88305 — Specimen Level', WorkRVU: 0.73 },
  { Code: '88307', Description: 'Code 88307 — Specimen Level', WorkRVU: 1.55 },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Real, per direct question: "is there a reason we do not have a way
// to add a RVU code outside of using CSV files. Also, can't edit or
// duplicate?" Confirmed directly — there wasn't a real architectural
// reason; the service layer's own createVersion already accepts any
// real entries array, the UI simply never exposed a single-entry path,
// only the bulk CSV one. This modal is that real, single-entry path —
// add, edit, or duplicate all route through it. Reuses the exact real
// ps-ms-overlay/ps-ms-modal pattern already proven throughout
// BillingDictionarySection.tsx this same session, not a new one.
interface EntryModalProps {
  seed?: BillingDictionaryEntry;
  /** True when duplicating — seed's own values pre-fill the form, but
   *  code/billingCode are cleared, since a real duplicate needs a
   *  real, distinct code, not a silent overwrite of the original. */
  isDuplicate?: boolean;
  onSave: (entry: BillingDictionaryEntry) => void;
  onClose: () => void;
  busy: boolean;
}

const EntryModal: React.FC<EntryModalProps> = ({ seed, isDuplicate, onSave, onClose, busy }) => {
  const isEdit = !!seed && !isDuplicate;
  const [code, setCode] = useState(isDuplicate ? '' : seed?.code ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [billingCode, setBillingCode] = useState(isDuplicate ? '' : seed?.billingCode ?? '');
  const [level, setLevel] = useState<BillingDictionaryEntry['level']>(seed?.level ?? 'stain');
  const [billingType, setBillingType] = useState<BillingDictionaryEntry['billingType']>(seed?.billingType ?? 'Global');
  const [hcpcsCode, setHcpcsCode] = useState(seed?.hcpcsCode ?? '');
  const [workRvu, setWorkRvu] = useState(seed?.workRvu?.toString() ?? '');
  const [rvuPe, setRvuPe] = useState(seed?.rvuPe?.toString() ?? '');
  const [rvuMp, setRvuMp] = useState(seed?.rvuMp?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!code.trim()) { setError('Code is required.'); return; }
    if (!billingCode.trim()) { setError('Billing code is required.'); return; }
    if (workRvu.trim() && !(Number(workRvu) > 0)) { setError('Work RVU must be a positive number if given — leave blank if unverified.'); return; }
    onSave({
      code: code.trim(),
      billingCode: billingCode.trim(),
      description: description.trim() || code.trim(),
      level,
      billingType,
      hcpcsCode: hcpcsCode.trim() || undefined,
      workRvu: workRvu.trim() ? Number(workRvu) : undefined,
      rvuPe: rvuPe.trim() ? Number(rvuPe) : undefined,
      rvuMp: rvuMp.trim() ? Number(rvuMp) : undefined,
    });
  };

  // Real, advisory-only check (see codeMapTable.ts's own
  // validateCodeLevel) - never blocks saving, since a real code can
  // legitimately not match the pattern (e.g. 88311 decalcification,
  // confirmed via direct research not to state its own billing unit
  // in its description text at all).
  const levelWarning = description.trim() ? validateCodeLevel({ description: description.trim(), level }) : null;

  return (
    <div className="ps-ms-overlay ps-ms-overlay--top-align">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{isEdit ? `Edit — ${seed?.code}` : isDuplicate ? `Duplicate — ${seed?.code}` : 'Add Code'}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Code <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={code} onChange={e => setCode(e.target.value)} disabled={isEdit} placeholder="e.g. 88305" />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Billing Code <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={billingCode} onChange={e => setBillingCode(e.target.value)} disabled={isEdit} placeholder="Often same as Code" />
            </div>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Description</label>
            <input className="ps-conf-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Real, human-readable description" />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Level <span className="ps-conf-required">*</span></label>
            <select className="ps-conf-input" value={level} onChange={e => setLevel(e.target.value as BillingDictionaryEntry['level'])}>
              <option value="specimen">Specimen — primary diagnostic work</option>
              <option value="block">Block — tissue processing &amp; preparation</option>
              <option value="stain">Stain — staining, recuts &amp; analytical procedures</option>
              <option value="decant">Decant — decanted fluid/slide work</option>
            </select>
            {levelWarning && <p className="ps-conf-hint" style={{ color: '#f59e0b' }}>⚠ {levelWarning}</p>}
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">
              Component Type <span className="ps-conf-required">*</span>{' '}
              <span
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1px solid #64748b', color: '#94a3b8', fontSize: 10, fontWeight: 700, cursor: 'help', verticalAlign: 'middle' }}
                title={`Which biller performs this work, and therefore when its charge releases: ${BILLING_TYPE_LABEL.TC} at specimen grossing complete, ${BILLING_TYPE_LABEL['26']}/${BILLING_TYPE_LABEL.Global} at case signout.`}
              >i</span>
            </label>
            <select className="ps-conf-input" value={billingType} onChange={e => setBillingType(e.target.value as BillingDictionaryEntry['billingType'])}>
              <option value="TC">{BILLING_TYPE_LABEL.TC}</option>
              <option value="26">{BILLING_TYPE_LABEL['26']}</option>
              <option value="Global">{BILLING_TYPE_LABEL.Global}</option>
            </select>
          </div>
          <div className="ps-conf-form-row--3">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">Work RVU</label>
              <input className="ps-conf-input" type="number" step="0.01" value={workRvu} onChange={e => setWorkRvu(e.target.value)} placeholder="Blank if unverified" />
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
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">HCPCS Code</label>
            <input className="ps-conf-input" value={hcpcsCode} onChange={e => setHcpcsCode(e.target.value)} placeholder="Optional" />
          </div>
          {error && <span className="ps-conf-error-text">{error}</span>}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" disabled={busy} onClick={handleSave}>
            {busy ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RvuCodeMapSection: React.FC = () => {
  const [versions, setVersions]   = useState<RvuTableVersion[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showOlder, setShowOlder] = useState(false);
  const [busy, setBusy]           = useState(false);
  const [toast, setToast]         = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload preview state - nothing is committed until the admin
  // explicitly confirms, same "preview then apply" pattern this app
  // already uses for spreadsheet uploads elsewhere. Real fix, per
  // direct guidance (Charge Capture work): was typed CptWorkRvuEntry[]
  // (now BillingDictionaryEntry[]) purely by structural coincidence -
  // a raw parsed upload row genuinely has no billingCode yet (a real
  // CMS PPRRVU file has no concept of this app's internal billing
  // codes), so ParsedRvuUploadRow[] is the real, correct type. See
  // handleApplyUpload's own comment for how billingCode gets a real,
  // honest default at commit time.
  const [uploadPreview, setUploadPreview] = useState<ParsedRvuUploadRow[] | null>(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadEffectiveDate, setUploadEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Real, per direct question: single-entry add/edit/duplicate state —
  // undefined entryModalState means the modal is closed; entry
  // undefined within it means "Add"; isDuplicate distinguishes a real
  // duplicate (code/billingCode cleared) from a real edit (code/
  // billingCode locked, since those are this entry's real identity).
  const [entryModalState, setEntryModalState] = useState<{ entry?: BillingDictionaryEntry; isDuplicate?: boolean } | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);

  const refresh = useCallback(() => {
    mockRvuCodeMapService.getAllVersions().then(res => {
      if (res.ok) setVersions(res.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const activeVersion = versions.find(v => v.isActive) ?? null;
  const olderVersions = versions.filter(v => !v.isActive);
  const pendingCount = versions.filter(v => v.approvalStatus === 'PENDING_APPROVAL').length;

  // ── Single-entry add / edit / duplicate ──────────────────────────────────
  // Real, per direct question — the same real createVersion the upload
  // flow already uses, just computing its entries array from a single
  // real change instead of a whole parsed CSV. isEdit real replaces
  // the matching entry in place (by code); add/duplicate real appends.
  const handleSaveEntry = async (entry: BillingDictionaryEntry) => {
    const isEdit = !!entryModalState?.entry && !entryModalState?.isDuplicate;
    const current = activeVersion?.entries ?? [];
    if (!isEdit && current.some(e => e.code === entry.code)) {
      setToast(`Code "${entry.code}" already exists in the active version.`);
      return;
    }
    const newEntries = isEdit
      ? current.map(e => e.code === entry.code ? entry : e)
      : [...current, entry];

    setEntryBusy(true);
    const user = getSessionUser();
    const label = isEdit ? `Manual edit — ${entry.code}` : `Manual add — ${entry.code}`;
    const res = await mockRvuCodeMapService.createVersion({
      label,
      effectiveDate: new Date().toISOString(),
      entries: newEntries,
      uploadedBy: user?.id ?? 'admin',
    });
    if (res.ok === false) {
      setEntryBusy(false);
      setToast(res.error);
      return;
    }
    setEntryBusy(false);
    setEntryModalState(null);
    setToast(`"${entry.code}" submitted for approval — see Pending Billing Rule Approvals.`);
    refresh();
  };

  // ── Spreadsheet upload ────────────────────────────────────────────────────

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    if (!isCsvFile(file)) {
      setUploadError(`"${file.name}" isn't a CSV file. Export/download the template, edit it in your spreadsheet editor, and save it as .csv before importing.`);
      return;
    }
    try {
      const text = await readFileAsText(file);
      const rows = parseCsv(text);

      const { entries, problems, skippedNonPayable } = parseRvuUploadRows(rows);

      if (entries.length === 0 && problems.length === 0) {
        setUploadError('No real rows found in this file - check it has Code and WorkRVU columns.');
        return;
      }
      if (problems.length > 0) {
        setUploadError(problems.slice(0, 5).join(' '));
      }
      if (skippedNonPayable > 0) {
        setToast(`${entries.length} real, payable codes found — ${skippedNonPayable} non-payable/modifier rows skipped automatically.`);
      }
      setUploadPreview(entries);
      setUploadFileName(file.name);
      if (!uploadLabel) setUploadLabel(`Upload — ${file.name.replace(/\.csv$/i, '')}`);
    } catch {
      setUploadError("Could not read this file - make sure it's a real .csv file.");
    }
  };

  const handleApplyUpload = async () => {
    if (!uploadPreview || uploadPreview.length === 0) return;
    setBusy(true);
    const user = getSessionUser();
    // Real, disclosed default, per direct guidance: a raw CMS PPRRVU
    // upload has no concept of this app's internal billingCode labels
    // (IHC-FIRST, PIN4-PANEL, etc.) - defaults billingCode to the CPT
    // code itself for every uploaded row, same as every base
    // surgical-pathology-level entry already does in CODE_MAP_TABLE.
    // Real indirection (a genuinely distinct internal label) needs a
    // real admin to configure it manually afterward - not built here,
    // since inferring which uploaded codes need one isn't something
    // this app should guess at.
    // Real, disclosed limitation: a bulk CSV upload is a generic CMS
    // RVU spreadsheet, not pathology-specific data - it has no level
    // column at all. Uses the same real text-pattern signal as the
    // advisory validator where it matches; falls back to 'specimen'
    // (the least-wrong default for a general RVU table, and matches
    // this app's own existing base-code family) only when it doesn't.
    // Not a confident classification - a real admin should review
    // uploaded rows' levels afterward, same as the billingCode
    // indirection noted just above.
    // Same honest-default posture for billingType: a generic CMS
    // upload has no TC/26/Global column either. Defaults to 'Global'
    // (the most common real-world case - one biller performs both
    // components) rather than guessing TC or 26 specifically, since a
    // wrong TC/26 guess would release a charge at the wrong real-world
    // moment - same "admin should review afterward" disclosure as level.
    const entriesWithBillingCode: BillingDictionaryEntry[] = uploadPreview.map(row => ({
      ...row,
      billingCode: row.code,
      level: inferLevelFromDescription(row.description) ?? 'specimen',
      billingType: 'Global',
    }));
    const res = await mockRvuCodeMapService.createVersion({
      label: uploadLabel.trim() || uploadFileName,
      effectiveDate: new Date(uploadEffectiveDate).toISOString(),
      entries: entriesWithBillingCode,
      uploadedBy: user?.id ?? 'admin',
      sourceFileName: uploadFileName,
    });

    if (res.ok === false) {
      setBusy(false);
      setUploadError(res.error);
      return;
    }

    setBusy(false);
    setToast(`"${res.data.label}" submitted for approval — see Pending Billing Rule Approvals.`);
    setUploadPreview(null);
    setUploadFileName('');
    setUploadLabel('');
    refresh();
  };

  const handleDownloadTemplate = () => {
    downloadCsv('RvuCodeMapTemplate.csv', toCsv(TEMPLATE_EXAMPLE_ROWS));
  };

  if (loading) return <div className="ps-conf-section-subtitle">Loading…</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">RVU Code Map</h3>
          <p className="ps-conf-section-subtitle">
            CPT-to-work-RVU values used for real workload/productivity tracking (not a billing
            system — no claims, modifiers, or payer rules). Every update becomes a new, dated
            version — older versions are kept, never edited, so past cases keep the real rates
            that were in effect when they were finalized.
          </p>
        </div>
        <div className="ps-specdict-header-actions">
          <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setEntryModalState({})}>+ Add Code</button>
          <button className="ps-conf-btn-secondary" onClick={handleDownloadTemplate}>Download Template</button>
          <button className="ps-conf-btn-secondary" onClick={() => fileInputRef.current?.click()}>Upload Spreadsheet</button>
          <input ref={fileInputRef} type="file" hidden accept=".csv,text/csv"
            onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      {toast && <div className="ps-conf-section-subtitle" style={{ color: '#10b981', fontWeight: 600 }}>{toast}</div>}
      {pendingCount > 0 && (
        <p className="ps-billing-reason-hint">
          {pendingCount} version{pendingCount !== 1 ? 's' : ''} pending approval — see Pending Billing Rule Approvals.
        </p>
      )}

      {/* ── Active version — front and center ── */}
      {activeVersion ? (
        <div style={{ margin: '16px 0', padding: '16px', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Active version</span>
              <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>{activeVersion.label}</div>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Effective {formatDate(activeVersion.effectiveDate)}</div>
          </div>
          <div className="ps-conf-table-wrap" style={{ marginTop: '12px' }}>
            <table className="ps-conf-table">
              <thead><tr><th className="ps-conf-th">Code</th><th className="ps-conf-th">Description</th><th className="ps-conf-th">Work RVU</th><th className="ps-conf-th">Actions</th></tr></thead>
              <tbody>
                {activeVersion.entries.map(e => (
                  <tr key={e.code}>
                    <td className="ps-conf-td">{e.code}</td>
                    <td className="ps-conf-td">{e.description}</td>
                    <td className="ps-conf-td">{e.workRvu === undefined ? <span className="ps-conf-error-text">Unverified</span> : e.workRvu}</td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-row-actions">
                        <button className="ps-conf-btn-row" onClick={() => setEntryModalState({ entry: e })}>Edit</button>
                        <button className="ps-conf-btn-row" onClick={() => setEntryModalState({ entry: e, isDuplicate: true })}>Duplicate</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="ps-conf-section-subtitle" style={{ margin: '16px 0' }}>No active version yet — upload a spreadsheet below to get started.</div>
      )}

      {/* ── Older versions — collapsed by default, never deleted ── */}
      {olderVersions.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <button className="ps-conf-btn-row" onClick={() => setShowOlder(s => !s)}>
            {showOlder ? '▾' : '▸'} Older versions ({olderVersions.length})
          </button>
          {showOlder && (
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {olderVersions
                .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
                .map(v => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{v.label}</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      Effective {formatDate(v.effectiveDate)} · {v.entries.length} codes
                      {v.sourceFileName && <> · from {v.sourceFileName}</>}
                    </div>
                  </div>
                  <span className="ps-billing-reason-hint">
                    {v.approvalStatus === 'PENDING_APPROVAL' ? 'Pending approval'
                      : v.approvalStatus === 'REJECTED' ? `Rejected${v.rejectionReason ? ` — ${v.rejectionReason}` : ''}`
                      : v.approvalStatus === 'APPROVED' ? 'Approved (superseded)'
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Upload preview panel ── */}
      {uploadPreview && (
        <div style={{ marginTop: '20px', padding: '16px', borderRadius: '10px', border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.06)' }}>
          <div style={{ fontWeight: 700, marginBottom: '10px' }}>Review before saving</div>

          {uploadError && <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '10px' }}>{uploadError}</div>}

          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', gap: '4px' }}>
              Version label
              <input value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', gap: '4px' }}>
              Effective date
              <input type="date" value={uploadEffectiveDate} onChange={e => setUploadEffectiveDate(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px' }} />
            </label>
          </div>
          <p className="ps-billing-reason-hint">
            This version will be submitted for approval — a different, real reviewer must approve it before it
            replaces the active table. See Pending Billing Rule Approvals.
          </p>

          <div className="ps-conf-table-wrap" style={{ maxHeight: '240px', overflowY: 'auto' }}>
            <table className="ps-conf-table">
              <thead><tr><th className="ps-conf-th">Code</th><th className="ps-conf-th">Description</th><th className="ps-conf-th">Work RVU</th></tr></thead>
              <tbody>
                {uploadPreview.map((e, i) => (
                  <tr key={`${e.code}-${i}`}>
                    <td className="ps-conf-td">{e.code}</td>
                    <td className="ps-conf-td">{e.description}</td>
                    <td className="ps-conf-td">{e.workRvu}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="ps-conf-btn-primary" disabled={busy || uploadPreview.length === 0} onClick={handleApplyUpload}>
              {busy ? 'Submitting…' : `Submit for Approval (${uploadPreview.length} codes)`}
            </button>
            <button className="ps-conf-btn-row" onClick={() => { setUploadPreview(null); setUploadError(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {entryModalState && (
        <EntryModal
          seed={entryModalState.entry}
          isDuplicate={entryModalState.isDuplicate}
          busy={entryBusy}
          onSave={handleSaveEntry}
          onClose={() => setEntryModalState(null)}
        />
      )}
    </div>
  );
};

export default RvuCodeMapSection;
