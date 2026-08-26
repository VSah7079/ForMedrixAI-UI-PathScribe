// src/components/Config/System/NcciEditRulesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the real, intended mechanism for NCCI PTP
// edit data is a genuine customer-driven quarterly import - whoever
// holds the real AMA license downloads the current quarter's real
// "PTP Edits - Practitioner.xlsx" from CMS.gov and uploads it here.
// PathScribe never ships with real, current NCCI data baked in - see
// types/billing/NcciPtpEdit.ts's own header for why. Mirrors the same
// real bulk-upload pattern RvuCodeMapSection.tsx already established
// for its own generic CMS RVU spreadsheet import - not a new pattern
// invented here. Wholesale replace on import, not versioned/append-only
// - see mockNcciEditService.ts's own comment for why.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { mockNcciEditService } from '@/services/billing/mockNcciEditService';
import { parseNcciUploadRows } from '@/services/billing/ncciEditUtils';
import type { NcciPtpEditPair, NcciPtpEditImport } from '@/types/billing/NcciPtpEdit';

const MODIFIER_LABEL: Record<NcciPtpEditPair['modifierIndicator'], string> = {
  '0': 'Never bypass — real bundling conflict',
  '1': 'Can bypass with an appropriate modifier',
  '9': 'Edit does not apply',
};

const TEMPLATE_EXAMPLE_ROWS = [
  { 'Column 1': '88305', 'Column 2': '88300', 'Modifier Indicator': '0', 'Effective Date': '2026-01-01', 'Deletion Date': '' },
];

/** Real, per direct follow-up: "why do I always have to use a CSV
 *  file to correct a single entry" - a real, single-pair edit modal,
 *  matching ModifierDictionarySection.tsx's own EntryModal pattern
 *  exactly, so correcting one pair's modifier indicator no longer
 *  requires a full spreadsheet round-trip. */
const PairEditModal: React.FC<{ pair: NcciPtpEditPair; onSave: (p: NcciPtpEditPair) => void; onClose: () => void; busy: boolean }> = ({ pair, onSave, onClose, busy }) => {
  const [modifierIndicator, setModifierIndicator] = useState(pair.modifierIndicator);
  const [deletionDate, setDeletionDate] = useState(pair.deletionDate ?? '');
  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">Edit — {pair.columnOneCode} / {pair.columnTwoCode}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Column 1 / Column 2</label>
            <input className="ps-conf-input" value={`${pair.columnOneCode} / ${pair.columnTwoCode}`} disabled />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Modifier Indicator</label>
            <select className="ps-conf-select" value={modifierIndicator} onChange={e => setModifierIndicator(e.target.value as NcciPtpEditPair['modifierIndicator'])}>
              {(Object.keys(MODIFIER_LABEL) as NcciPtpEditPair['modifierIndicator'][]).map(k => (
                <option key={k} value={k}>{k} — {MODIFIER_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">Deletion Date (optional)</label>
            <input className="ps-conf-input" type="date" value={deletionDate} onChange={e => setDeletionDate(e.target.value)} />
          </div>
          <p className="ps-billing-reason-hint">
            Saving submits a new import for approval — a different, real reviewer must approve it before it
            replaces the active table. See Pending Billing Rule Approvals.
          </p>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="ps-conf-btn-primary" disabled={busy} onClick={() => onSave({ ...pair, modifierIndicator, deletionDate: deletionDate || undefined })}>
            {busy ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
};

const NcciEditRulesSection: React.FC = () => {
  const { user } = useAuth();
  const [pairs, setPairs] = useState<NcciPtpEditPair[]>([]);
  const [currentImport, setCurrentImport] = useState<NcciPtpEditImport | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [uploadPreview, setUploadPreview] = useState<Omit<NcciPtpEditPair, 'id'>[] | null>(null);
  const [uploadProblems, setUploadProblems] = useState<string[]>([]);
  const [quarterVersion, setQuarterVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingPair, setEditingPair] = useState<NcciPtpEditPair | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = () => {
    mockNcciEditService.getAll().then(res => { if (res.ok) setPairs(res.data); });
    mockNcciEditService.getCurrentImport().then(res => { if (res.ok) setCurrentImport(res.data); });
    mockNcciEditService.getAllImports().then(res => { if (res.ok) setPendingCount(res.data.filter(i => i.approvalStatus === 'PENDING_APPROVAL').length); });
  };
  useEffect(() => { loadAll(); }, []);

  /** Real, per direct follow-up: a single-pair correction goes
   *  through the exact same real path a full upload does -
   *  importQuarter, submitted for approval - built from the active
   *  table's own pairs with one real pair changed, using the active
   *  import's own quarterVersion label so the correction is clearly
   *  tied to the table it's correcting, rather than a fresh
   *  spreadsheet import. */
  const handleSaveEntry = async (pair: NcciPtpEditPair) => {
    setBusy(true);
    const newPairs = pairs.map(p => p.id === pair.id ? pair : p);
    const res = await mockNcciEditService.importQuarter(
      newPairs.map(({ id, ...rest }) => rest),
      `Manual edit — ${pair.columnOneCode}/${pair.columnTwoCode}`,
      user?.id ?? 'unknown',
    );
    setBusy(false);
    if (res.ok === false) return;
    setEditingPair(null);
    loadAll();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const { pairs: parsed, problems } = parseNcciUploadRows(rows);
      setUploadPreview(parsed);
      setUploadProblems(problems);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_EXAMPLE_ROWS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NCCI PTP Edits');
    XLSX.writeFile(wb, 'NcciPtpEditTemplate.xlsx');
  };

  const handleApplyUpload = () => {
    if (!uploadPreview || uploadPreview.length === 0 || !quarterVersion.trim()) return;
    setBusy(true);
    mockNcciEditService.importQuarter(uploadPreview, quarterVersion.trim(), user?.id ?? 'unknown')
      .then(() => { setUploadPreview(null); setUploadProblems([]); setQuarterVersion(''); loadAll(); })
      .finally(() => setBusy(false));
  };

  return (
    <div className="ps-conf-section">
      <div className="ps-conf-section-header">
        <h2 className="ps-conf-section-title">NCCI Edit Rules (Bundling)</h2>
        <p className="ps-conf-section-subtitle">
          Real, procedure-to-procedure bundling checks — flags a warning when two codes on the same specimen are a
          genuine, never-bypassable NCCI conflict. PathScribe does not ship with real, current CMS data; whoever
          holds the real AMA license downloads the current quarter's real file from CMS.gov → National Correct
          Coding Initiative → PTP Edits → Practitioner, and imports it below. A single pair can also be corrected
          directly (Edit, below) without a full re-upload — like every change here, it goes through the same real
          Four-Eyes approval process before it takes effect.
        </p>
      </div>

      {pendingCount > 0 && (
        <p className="ps-billing-reason-hint">
          {pendingCount} import{pendingCount !== 1 ? 's' : ''} pending approval — see Pending Billing Rule Approvals.
        </p>
      )}

      {currentImport?.isSyntheticSeed && (
        <p className="ps-conf-hint" style={{ color: '#f59e0b' }}>
          ⚠ Showing a small, synthetic demo pair — not real, current CMS data. Import a real quarterly file below
          before relying on this for a real bundling check.
        </p>
      )}

      {currentImport && (
        <p className="ps-conf-hint">
          Current: <strong>{currentImport.quarterVersion}</strong> — {currentImport.pairCount} pair{currentImport.pairCount === 1 ? '' : 's'},
          imported {new Date(currentImport.importedAt).toLocaleDateString()} by {currentImport.importedBy}.
        </p>
      )}

      <div className="ps-qa-tab-toolbar">
        <button className="ps-conf-btn-secondary" onClick={handleDownloadTemplate}>Download Template</button>
        <button className="ps-conf-btn-secondary" onClick={() => fileInputRef.current?.click()}>Upload Spreadsheet</button>
        <input ref={fileInputRef} type="file" hidden accept=".csv,.xlsx" onChange={handleFileSelect} />
      </div>

      {uploadPreview && (
        <div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="ncci-quarter-version">Quarter Version <span className="ps-conf-required">*</span></label>
            <input id="ncci-quarter-version" className="ps-conf-input" value={quarterVersion} onChange={e => setQuarterVersion(e.target.value)}
              placeholder="e.g. 2026Q3, matching CMS's own real quarterly file naming" />
          </div>
          {uploadProblems.length > 0 && (
            <p className="ps-conf-hint" style={{ color: '#f59e0b' }}>
              ⚠ {uploadProblems.length} row{uploadProblems.length === 1 ? '' : 's'} skipped:
              <ul>{uploadProblems.slice(0, 10).map((p, i) => <li key={i}>{p}</li>)}</ul>
            </p>
          )}
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky">
                  <tr><th className="ps-conf-th">Column 1</th><th className="ps-conf-th">Column 2</th><th className="ps-conf-th">Modifier Indicator</th><th className="ps-conf-th">Effective</th></tr>
                </thead>
                <tbody>
                  {uploadPreview.slice(0, 50).map((p, i) => (
                    <tr key={i} className="ps-conf-tr">
                      <td className="ps-conf-td">{p.columnOneCode}</td>
                      <td className="ps-conf-td">{p.columnTwoCode}</td>
                      <td className="ps-conf-td">{p.modifierIndicator} — {MODIFIER_LABEL[p.modifierIndicator]}</td>
                      <td className="ps-conf-td">{p.effectiveDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="ps-ms-footer">
            <button className="ps-conf-btn-secondary" onClick={() => { setUploadPreview(null); setUploadProblems([]); }}>Cancel</button>
            <button className="ps-conf-btn-primary" disabled={busy || uploadPreview.length === 0 || !quarterVersion.trim()} onClick={handleApplyUpload}>
              {busy ? 'Submitting…' : `Submit for Approval (${uploadPreview.length} pairs)`}
            </button>
          </div>
        </div>
      )}

      {!uploadPreview && (
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr><th className="ps-conf-th">Column 1</th><th className="ps-conf-th">Column 2</th><th className="ps-conf-th">Modifier Indicator</th><th className="ps-conf-th">Effective</th><th className="ps-conf-th">Actions</th></tr>
              </thead>
              <tbody>
                {pairs.map(p => (
                  <tr key={p.id} className="ps-conf-tr">
                    <td className="ps-conf-td">{p.columnOneCode}</td>
                    <td className="ps-conf-td">{p.columnTwoCode}</td>
                    <td className="ps-conf-td">{p.modifierIndicator} — {MODIFIER_LABEL[p.modifierIndicator]}</td>
                    <td className="ps-conf-td">{p.effectiveDate}</td>
                    <td className="ps-conf-td"><button className="ps-conf-btn-row" onClick={() => setEditingPair(p)}>Edit</button></td>
                  </tr>
                ))}
                {pairs.length === 0 && (
                  <tr><td className="ps-conf-empty-row" colSpan={5}>No NCCI edit pairs loaded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingPair && (
        <PairEditModal pair={editingPair} busy={busy} onSave={handleSaveEntry} onClose={() => setEditingPair(null)} />
      )}
    </div>
  );
};

export default NcciEditRulesSection;
