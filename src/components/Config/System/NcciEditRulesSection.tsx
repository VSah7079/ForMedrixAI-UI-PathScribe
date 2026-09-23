// src/components/Config/System/NcciEditRulesSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: the real, intended mechanism for NCCI PTP
// edit data is a genuine customer-driven quarterly import - whoever
// holds the real AMA license downloads the current quarter's real
// "PTP Edits - Practitioner.xlsx" from CMS.gov, re-saves it as .csv in
// their spreadsheet editor (PS-48 standardized every manual-maintenance
// upload on strict CSV — CMS's own file still ships as .xlsx, so this is
// a one extra "Save As" step per quarter, not a blocker), and uploads
// the .csv here. PathScribe never ships with real, current NCCI data
// baked in - see types/billing/NcciPtpEdit.ts's own header for why.
// Mirrors the same real bulk-upload pattern RvuCodeMapSection.tsx
// already established for its own generic CMS RVU spreadsheet import -
// not a new pattern invented here. Wholesale replace on import, not
// versioned/append-only - see mockNcciEditService.ts's own comment for
// why.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '@/utils/csv';
import { useAuth } from '@/contexts/AuthContext';
import { mockNcciEditService } from '@/services/billing/mockNcciEditService';
import { parseNcciUploadRows } from '@/services/billing/ncciEditUtils';
import type { NcciPtpEditPair, NcciPtpEditImport } from '@/types/billing/NcciPtpEdit';

// Real, persisted modifier-indicator values ('0'/'1'/'9') stay as the
// option value/stored data; only the on-screen label is translated —
// same `{ value, labelKey }` split established for every other real
// enum lookup table this sweep has already converted.
const MODIFIER_LABEL_KEY: Record<NcciPtpEditPair['modifierIndicator'], string> = {
  '0': 'ncciEditRulesSection.modifierLabels.neverBypass',
  '1': 'ncciEditRulesSection.modifierLabels.canBypass',
  '9': 'ncciEditRulesSection.modifierLabels.doesNotApply',
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
  const { t } = useTranslation();
  const [modifierIndicator, setModifierIndicator] = useState(pair.modifierIndicator);
  const [deletionDate, setDeletionDate] = useState(pair.deletionDate ?? '');
  return (
    <div className="ps-ms-overlay">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">{t('ncciEditRulesSection.modal.editTitle', { col1: pair.columnOneCode, col2: pair.columnTwoCode })}</div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('ncciEditRulesSection.modal.columnLabel')}</label>
            <input className="ps-conf-input" value={`${pair.columnOneCode} / ${pair.columnTwoCode}`} disabled />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('ncciEditRulesSection.modal.modifierIndicatorLabel')}</label>
            <select className="ps-conf-select" value={modifierIndicator} onChange={e => setModifierIndicator(e.target.value as NcciPtpEditPair['modifierIndicator'])}>
              {(Object.keys(MODIFIER_LABEL_KEY) as NcciPtpEditPair['modifierIndicator'][]).map(k => (
                <option key={k} value={k}>{k} — {t(MODIFIER_LABEL_KEY[k])}</option>
              ))}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('ncciEditRulesSection.modal.deletionDateLabel')}</label>
            <input className="ps-conf-input" type="date" value={deletionDate} onChange={e => setDeletionDate(e.target.value)} />
          </div>
          <p className="ps-billing-reason-hint">
            {t('ncciEditRulesSection.modal.approvalHint')}
          </p>
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" disabled={busy} onClick={() => onSave({ ...pair, modifierIndicator, deletionDate: deletionDate || undefined })}>
            {busy ? t('ncciEditRulesSection.submitting') : t('ncciEditRulesSection.modal.submitButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

const NcciEditRulesSection: React.FC = () => {
  const { t } = useTranslation();
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isCsvFile(file)) {
      setUploadPreview(null);
      setUploadProblems([t('ncciEditRulesSection.upload.notCsvError', { filename: file.name })]);
      return;
    }
    const text = await readFileAsText(file);
    const rows = parseCsv(text);
    const { pairs: parsed, problems } = parseNcciUploadRows(rows);
    setUploadPreview(parsed);
    setUploadProblems(problems.map(p => {
      if (p.kind === 'missing_codes') return t('ncciEditRulesSection.upload.problems.missingCodes', { row: p.row });
      if (p.kind === 'invalid_modifier') {
        return t('ncciEditRulesSection.upload.problems.invalidModifier', {
          row: p.row, col1: p.columnOneCode, col2: p.columnTwoCode,
          modifierRaw: p.modifierRaw || t('ncciEditRulesSection.upload.blankPlaceholder'),
        });
      }
      return t('ncciEditRulesSection.upload.problems.missingEffectiveDate', { row: p.row, col1: p.columnOneCode, col2: p.columnTwoCode });
    }));
  };

  const handleDownloadTemplate = () => {
    downloadCsv('NcciPtpEditTemplate.csv', toCsv(TEMPLATE_EXAMPLE_ROWS));
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
        <h2 className="ps-conf-section-title">{t('ncciEditRulesSection.title')}</h2>
        <p className="ps-conf-section-subtitle">
          {t('ncciEditRulesSection.subtitle')}
        </p>
      </div>

      {pendingCount > 0 && (
        <p className="ps-billing-reason-hint">
          {t('ncciEditRulesSection.pendingCount', { count: pendingCount })}
        </p>
      )}

      {currentImport?.isSyntheticSeed && (
        <p className="ps-conf-hint ps-conf-hint--warning">
          ⚠ {t('ncciEditRulesSection.syntheticSeedWarning')}
        </p>
      )}

      {currentImport && (
        <p className="ps-conf-hint">
          <Trans
            i18nKey="ncciEditRulesSection.currentLabel"
            count={currentImport.pairCount}
            values={{
              version: currentImport.quarterVersion,
              date: new Date(currentImport.importedAt).toLocaleDateString(),
              importedBy: currentImport.importedBy,
            }}
            components={{ bold: <strong /> }}
          />
        </p>
      )}

      <div className="ps-conf-row-actions">
        <button className="ps-conf-btn-secondary" onClick={handleDownloadTemplate}>{t('ncciEditRulesSection.downloadTemplateButton')}</button>
        <button className="ps-conf-btn-secondary" onClick={() => fileInputRef.current?.click()}>{t('ncciEditRulesSection.uploadSpreadsheetButton')}</button>
        <input ref={fileInputRef} type="file" hidden accept=".csv,text/csv" onChange={handleFileSelect} />
      </div>

      {uploadPreview && (
        <div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label" htmlFor="ncci-quarter-version">{t('ncciEditRulesSection.upload.quarterVersionLabel')} <span className="ps-conf-required">*</span></label>
            <input id="ncci-quarter-version" className="ps-conf-input" value={quarterVersion} onChange={e => setQuarterVersion(e.target.value)}
              placeholder={t('ncciEditRulesSection.upload.quarterVersionPlaceholder')} />
          </div>
          {uploadProblems.length > 0 && (
            <p className="ps-conf-hint ps-conf-hint--warning">
              ⚠ {t('ncciEditRulesSection.upload.rowsSkipped', { count: uploadProblems.length })}
              <ul>{uploadProblems.slice(0, 10).map((p, i) => <li key={i}>{p}</li>)}</ul>
            </p>
          )}
          <div className="ps-conf-table-wrap">
            <div className="ps-conf-table-scroll">
              <table className="ps-conf-table">
                <thead className="ps-conf-thead-sticky">
                  <tr><th className="ps-conf-th">{t('ncciEditRulesSection.table.headers.column1')}</th><th className="ps-conf-th">{t('ncciEditRulesSection.table.headers.column2')}</th><th className="ps-conf-th">{t('ncciEditRulesSection.table.headers.modifierIndicator')}</th><th className="ps-conf-th">{t('ncciEditRulesSection.table.headers.effective')}</th></tr>
                </thead>
                <tbody>
                  {uploadPreview.slice(0, 50).map((p, i) => (
                    <tr key={i} className="ps-conf-tr">
                      <td className="ps-conf-td">{p.columnOneCode}</td>
                      <td className="ps-conf-td">{p.columnTwoCode}</td>
                      <td className="ps-conf-td">{p.modifierIndicator} — {t(MODIFIER_LABEL_KEY[p.modifierIndicator])}</td>
                      <td className="ps-conf-td">{p.effectiveDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="ps-ms-footer">
            <button className="ps-conf-btn-secondary" onClick={() => { setUploadPreview(null); setUploadProblems([]); }}>{t('common.cancel')}</button>
            <button className="ps-conf-btn-primary" disabled={busy || uploadPreview.length === 0 || !quarterVersion.trim()} onClick={handleApplyUpload}>
              {busy ? t('ncciEditRulesSection.submitting') : t('ncciEditRulesSection.upload.submitForApproval', { count: uploadPreview.length })}
            </button>
          </div>
        </div>
      )}

      {!uploadPreview && (
        <div className="ps-conf-table-wrap">
          <div className="ps-conf-table-scroll">
            <table className="ps-conf-table">
              <thead className="ps-conf-thead-sticky">
                <tr><th className="ps-conf-th">{t('ncciEditRulesSection.table.headers.column1')}</th><th className="ps-conf-th">{t('ncciEditRulesSection.table.headers.column2')}</th><th className="ps-conf-th">{t('ncciEditRulesSection.table.headers.modifierIndicator')}</th><th className="ps-conf-th">{t('ncciEditRulesSection.table.headers.effective')}</th><th className="ps-conf-th">{t('ncciEditRulesSection.table.headers.actions')}</th></tr>
              </thead>
              <tbody>
                {pairs.map(p => (
                  <tr key={p.id} className="ps-conf-tr">
                    <td className="ps-conf-td">{p.columnOneCode}</td>
                    <td className="ps-conf-td">{p.columnTwoCode}</td>
                    <td className="ps-conf-td">{p.modifierIndicator} — {t(MODIFIER_LABEL_KEY[p.modifierIndicator])}</td>
                    <td className="ps-conf-td">{p.effectiveDate}</td>
                    <td className="ps-conf-td"><button className="ps-conf-btn-row" onClick={() => setEditingPair(p)}>{t('common.edit')}</button></td>
                  </tr>
                ))}
                {pairs.length === 0 && (
                  <tr><td className="ps-conf-empty-row" colSpan={5}>{t('ncciEditRulesSection.table.emptyState')}</td></tr>
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
