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
import * as XLSX from 'xlsx';
import '../../../pathscribe.css';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import type { RvuTableVersion, BillingDictionaryEntry } from '@/services/billing/RvuTableVersion';
import { parseRvuUploadRows, type ParsedRvuUploadRow } from '@/services/billing/codeMapTable';
import { getSessionUser } from '@/services/auth/caseAccessControl';

const TEMPLATE_EXAMPLE_ROWS = [
  { Code: '88305', Description: 'Surgical pathology, gross and microscopic examination (Level IV)', WorkRVU: 0.73 },
  { Code: '88307', Description: 'Surgical pathology, gross and microscopic examination (Level V)',  WorkRVU: 1.55 },
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
      hcpcsCode: hcpcsCode.trim() || undefined,
      workRvu: workRvu.trim() ? Number(workRvu) : undefined,
      rvuPe: rvuPe.trim() ? Number(rvuPe) : undefined,
      rvuMp: rvuMp.trim() ? Number(rvuMp) : undefined,
    });
  };

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
            {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Code'}
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
  const [activateOnSave, setActivateOnSave] = useState(true);
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

  const handleActivate = async (versionId: string) => {
    setBusy(true);
    const res = await mockRvuCodeMapService.activateVersion(versionId);
    setBusy(false);
    if (res.ok === false) {
      setToast(res.error);
    } else {
      setToast(`"${res.data.label}" is now the active version.`);
      refresh();
    }
  };

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
    await mockRvuCodeMapService.activateVersion(res.data.id);
    setEntryBusy(false);
    setEntryModalState(null);
    setToast(`"${entry.code}" ${isEdit ? 'updated' : 'added'} and activated.`);
    refresh();
  };

  // ── Spreadsheet upload ────────────────────────────────────────────────────

  const handleFileUpload = (file: File) => {
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = evt => {
      const data = evt.target?.result;
      if (!data) return;
      try {
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

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
        if (!uploadLabel) setUploadLabel(`Upload — ${file.name.replace(/\.(xlsx|csv)$/i, '')}`);
      } catch {
        setUploadError('Could not read this file - make sure it\'s a real .xlsx or .csv spreadsheet.');
      }
    };
    reader.readAsBinaryString(file);
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
    const entriesWithBillingCode: BillingDictionaryEntry[] = uploadPreview.map(row => ({ ...row, billingCode: row.code }));
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

    if (activateOnSave) {
      await mockRvuCodeMapService.activateVersion(res.data.id);
    }
    setBusy(false);
    setToast(`"${res.data.label}" saved${activateOnSave ? ' and activated' : ''}.`);
    setUploadPreview(null);
    setUploadFileName('');
    setUploadLabel('');
    refresh();
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_EXAMPLE_ROWS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RVU Codes');
    XLSX.writeFile(wb, 'RvuCodeMapTemplate.xlsx');
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
          <button className="ps-conf-btn-primary" onClick={() => setEntryModalState({})}>+ Add Code</button>
          <button className="ps-conf-btn-secondary" onClick={handleDownloadTemplate}>Download Template</button>
          <button className="ps-conf-btn-secondary" onClick={() => fileInputRef.current?.click()}>Upload Spreadsheet</button>
          <input ref={fileInputRef} type="file" hidden accept=".csv,.xlsx"
            onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      {toast && <div className="ps-conf-section-subtitle" style={{ color: '#10b981', fontWeight: 600 }}>{toast}</div>}

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
                  <button className="ps-conf-btn-row" disabled={busy} onClick={() => handleActivate(v.id)}>Activate</button>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginTop: '18px' }}>
              <input type="checkbox" checked={activateOnSave} onChange={e => setActivateOnSave(e.target.checked)} />
              Activate immediately
            </label>
          </div>

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
              {busy ? 'Saving…' : `Save Version (${uploadPreview.length} codes)`}
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
