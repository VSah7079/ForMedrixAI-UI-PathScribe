// src/components/Config/System/ModifierDictionarySection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own "Bring-Your-Own-License (BYOL)
// Ingestion" best practice: a real, licensed customer uploads their
// own real, licensed CPT modifier descriptions here - PathScribe
// itself never embeds or redistributes real AMA text (see
// cptModifierDictionary.ts's own header). Mirrors
// RvuCodeMapSection.tsx's own established, proven upload/preview/
// import pattern - download a real template, upload a real file, see
// a real preview before anything is committed, one click to save.
//
// Real, per direct guidance's own "Isolate Synthetic Data" best
// practice: every version carries an explicit, required
// licenseStatus - the uploading admin must affirmatively attest they
// hold a real, current AMA license before any import is ever marked
// 'licensed' rather than 'synthetic'. Never inferred from a filename
// or label.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { mockModifierDictionaryService } from '@/services/billing/mockModifierDictionaryService';
import type { ModifierTableVersion } from '@/services/billing/ModifierTableVersion';
import { parseModifierUploadRows, DEFAULT_CPT_MODIFIERS, type CptModifierEntry } from '@/services/billing/cptModifierDictionary';
import { getSessionUser } from '@/services/auth/caseAccessControl';

const TEMPLATE_EXAMPLE_ROWS = DEFAULT_CPT_MODIFIERS.slice(0, 2).map(m => ({ Code: m.code, Description: m.description }));

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Real, per direct follow-up: "why do I always have to use a CSV
 *  file to correct a single entry" - a real, single-entry edit modal,
 *  matching RvuCodeMapSection.tsx's own EntryModal pattern exactly,
 *  so correcting one modifier's description no longer requires a
 *  full spreadsheet round-trip. */
const EntryModal: React.FC<{ entry: CptModifierEntry; onSave: (e: CptModifierEntry) => void; onClose: () => void; busy: boolean }> = ({ entry, onSave, onClose, busy }) => {
  const [description, setDescription] = useState(entry.description);
  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Edit — {entry.code}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Code</label>
            <input className="ps-conf-input" value={entry.code} disabled />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Description</label>
            <input className="ps-conf-input" value={description} onChange={e => setDescription(e.target.value)} autoFocus />
          </div>
          <p className="ps-billing-reason-hint">
            Saving submits a new version for approval — a different, real reviewer must approve it before it
            replaces the active dictionary. See Pending Billing Rule Approvals.
          </p>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" disabled={busy || !description.trim()} onClick={() => onSave({ ...entry, description: description.trim() })}>
            {busy ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ModifierDictionarySection: React.FC = () => {
  const [versions, setVersions] = useState<ModifierTableVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOlder, setShowOlder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadPreview, setUploadPreview] = useState<CptModifierEntry[] | null>(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadEffectiveDate, setUploadEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Real, per direct guidance's own "Isolate Synthetic Data" best
  // practice - a real, required attestation, never defaulted to true.
  const [confirmLicensed, setConfirmLicensed] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CptModifierEntry | null>(null);

  const refresh = useCallback(() => {
    mockModifierDictionaryService.getAllVersions().then(res => {
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

  /** Real, per direct follow-up: a single-entry correction now goes
   *  through the exact same real path a full upload does -
   *  createVersion, submitted for approval - just built from the
   *  active version's own entries with one row changed, rather than a
   *  freshly parsed spreadsheet. Never activates immediately; see
   *  mockModifierDictionaryService.ts's own createVersion. */
  const handleSaveEntry = async (entry: CptModifierEntry) => {
    if (!activeVersion) return;
    setBusy(true);
    const user = getSessionUser();
    const newEntries = activeVersion.entries.map(e => e.code === entry.code ? entry : e);
    const res = await mockModifierDictionaryService.createVersion({
      label: `Manual edit — ${entry.code}`,
      effectiveDate: new Date().toISOString(),
      entries: newEntries,
      uploadedBy: user?.id ?? 'admin',
      licenseStatus: activeVersion.licenseStatus,
    });
    setBusy(false);
    if (res.ok === false) { setToast(res.error); return; }
    setEditingEntry(null);
    setToast(`"${entry.code}" submitted for approval — see Pending Billing Rule Approvals.`);
    refresh();
  };

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
        const { entries, problems } = parseModifierUploadRows(rows);
        if (entries.length === 0 && problems.length === 0) {
          setUploadError('No real rows found in this file — check it has Code and Description columns.');
          return;
        }
        if (problems.length > 0) setUploadError(problems.slice(0, 5).join(' '));
        setUploadPreview(entries);
        setUploadFileName(file.name);
        if (!uploadLabel) setUploadLabel(`Upload — ${file.name.replace(/\.(xlsx|csv)$/i, '')}`);
      } catch {
        setUploadError("Could not read this file — make sure it's a real .xlsx or .csv spreadsheet.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleApplyUpload = async () => {
    if (!uploadPreview || uploadPreview.length === 0) return;
    if (!confirmLicensed) { setUploadError('Confirm you hold a real, current AMA license for these modifier descriptions before importing.'); return; }
    setBusy(true);
    const user = getSessionUser();
    const res = await mockModifierDictionaryService.createVersion({
      label: uploadLabel.trim() || uploadFileName,
      effectiveDate: new Date(uploadEffectiveDate).toISOString(),
      entries: uploadPreview,
      uploadedBy: user?.id ?? 'admin',
      licenseStatus: 'licensed',
      sourceFileName: uploadFileName,
    });
    if (res.ok === false) { setBusy(false); setUploadError(res.error); return; }
    setBusy(false);
    setToast(`"${res.data.label}" submitted for approval — see Pending Billing Rule Approvals.`);
    setUploadPreview(null);
    setUploadFileName('');
    setUploadLabel('');
    setConfirmLicensed(false);
    refresh();
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_EXAMPLE_ROWS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modifiers');
    XLSX.writeFile(wb, 'ModifierDictionaryTemplate.xlsx');
  };

  if (loading) return <div className="ps-conf-loading">Loading Modifier Dictionary...</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">CPT Modifier Dictionary</h3>
          <p className="ps-conf-section-subtitle">
            The reference list of CPT modifiers this app can attach to a billing code — the two-digit or two-letter
            suffixes (e.g. -26 Professional Component, -TC Technical Component, -59 Distinct Procedural Service)
            that tell a payer how a procedure was actually performed or billed. Referenced from the Billing
            Dictionary's own "Modifiers Commonly Associated" field as an informational guide for whoever is coding
            a case — PathScribe does not currently validate or auto-append a modifier onto a resolved charge (see
            the Limitations section of the Billing Capacity Review). The active version's descriptions are
            synthetic placeholders until a real, licensed admin imports their own real AMA modifier text below,
            using their own real license — PathScribe never embeds or redistributes that real, copyrighted text
            itself. A single entry can also be corrected directly (Edit, below) without a full re-upload — like
            every change here, it goes through the same real Four-Eyes approval process before it takes effect.
          </p>
        </div>
        <div className="ps-conf-row-actions">
          <button className="ps-conf-btn-secondary" onClick={handleDownloadTemplate}>Download Template</button>
          <button className="ps-conf-btn-secondary" onClick={() => fileInputRef.current?.click()}>Upload Spreadsheet</button>
          <input ref={fileInputRef} type="file" hidden accept=".csv,.xlsx"
            onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      {toast && <p className="ps-billing-reason-hint">{toast}</p>}
      {pendingCount > 0 && (
        <p className="ps-billing-reason-hint">
          {pendingCount} version{pendingCount !== 1 ? 's' : ''} pending approval — see Pending Billing Rule Approvals.
        </p>
      )}

      {activeVersion && (
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-section-header">
            <div>
              <span className="ps-conf-status-text ps-conf-status-text--active">Active version</span>
              <div className="ps-conf-identity-name">{activeVersion.label}</div>
            </div>
            <span className="ps-billing-reason-hint">
              Effective {formatDate(activeVersion.effectiveDate)} — {activeVersion.licenseStatus === 'licensed' ? 'Real, licensed import' : 'Synthetic placeholder (no real AMA license on file)'}
            </span>
          </div>
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead><tr><th className="ps-conf-th">Code</th><th className="ps-conf-th">Description</th><th className="ps-conf-th">Actions</th></tr></thead>
              <tbody>
                {activeVersion.entries.map(e => (
                  <tr key={e.code} className="ps-conf-tr">
                    <td className="ps-conf-td"><span className="ps-conf-identity-name">{e.code}</span></td>
                    <td className="ps-conf-td">{e.description}</td>
                    <td className="ps-conf-td"><button className="ps-conf-btn-row" onClick={() => setEditingEntry(e)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {olderVersions.length > 0 && (
        <div className="ps-conf-form-field">
          <button className="ps-conf-btn-row" onClick={() => setShowOlder(o => !o)}>
            {showOlder ? '▾ Hide' : '▸ Show'} {olderVersions.length} older version{olderVersions.length === 1 ? '' : 's'}
          </button>
          {showOlder && (
            <div className="ps-conf-table-wrap">
              <table className="ps-conf-table">
                <thead><tr>{['Label', 'Effective', 'License', 'Approval Status'].map(h => <th key={h} className="ps-conf-th">{h}</th>)}</tr></thead>
                <tbody>
                  {olderVersions.map(v => (
                    <tr key={v.id} className="ps-conf-tr">
                      <td className="ps-conf-td">{v.label}</td>
                      <td className="ps-conf-td">{formatDate(v.effectiveDate)}</td>
                      <td className="ps-conf-td">{v.licenseStatus === 'licensed' ? 'Licensed' : 'Synthetic'}</td>
                      <td className="ps-conf-td">
                        {v.approvalStatus === 'PENDING_APPROVAL' ? 'Pending approval'
                          : v.approvalStatus === 'REJECTED' ? `Rejected${v.rejectionReason ? ` — ${v.rejectionReason}` : ''}`
                          : v.approvalStatus === 'APPROVED' ? 'Approved (superseded)'
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {uploadPreview && (
        <div className="ps-ms-overlay">
          <div className="ps-ms-modal ps-ms-modal--extra-wide">
            <div className="ps-ms-header">Import Modifier Dictionary — {uploadFileName}</div>
            <div className="ps-ms-body">
              {uploadError && <p className="ps-conf-error-text">{uploadError}</p>}
              <div className="ps-conf-form-row">
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Version Label</label>
                  <input className="ps-conf-input" value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} />
                </div>
                <div className="ps-conf-form-field">
                  <label className="ps-conf-label">Effective From</label>
                  <input className="ps-conf-input" type="date" value={uploadEffectiveDate} onChange={e => setUploadEffectiveDate(e.target.value)} />
                </div>
              </div>
              <div className="ps-conf-table-wrap">
                <div className="ps-conf-table-scroll">
                  <table className="ps-conf-table">
                    <thead><tr><th className="ps-conf-th">Code</th><th className="ps-conf-th">Description</th></tr></thead>
                    <tbody>
                      {uploadPreview.map((e, i) => (
                        <tr key={`${e.code}-${i}`} className="ps-conf-tr">
                          <td className="ps-conf-td">{e.code}</td>
                          <td className="ps-conf-td">{e.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="ps-conf-form-field">
                <label className="ps-conf-label">
                  <input type="checkbox" checked={confirmLicensed} onChange={e => setConfirmLicensed(e.target.checked)} />
                  {' '}I confirm my organization holds a real, current AMA license covering these modifier descriptions.
                </label>
              </div>
              <p className="ps-billing-reason-hint">
                This version will be submitted for approval — a different, real reviewer must approve it before it
                replaces the active dictionary. See Pending Billing Rule Approvals.
              </p>
            </div>
            <div className="ps-ms-footer">
              <button className="ps-conf-btn-secondary" onClick={() => { setUploadPreview(null); setUploadError(null); }}>Cancel</button>
              <button className="ps-conf-btn-primary" disabled={busy || !confirmLicensed} onClick={handleApplyUpload}>
                {busy ? 'Submitting…' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingEntry && (
        <EntryModal entry={editingEntry} busy={busy} onSave={handleSaveEntry} onClose={() => setEditingEntry(null)} />
      )}
    </div>
  );
};

export default ModifierDictionarySection;
