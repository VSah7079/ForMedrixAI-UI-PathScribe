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
import { useTranslation } from 'react-i18next';
import { parseCsv, toCsv, downloadCsv, isCsvFile, readFileAsText } from '@/utils/csv';
import '../../../pathscribe.css';
import { mockRvuCodeMapService } from '@/services/billing/mockRvuCodeMapService';
import type { RvuTableVersion, BillingDictionaryEntry } from '@/services/billing/RvuTableVersion';
import { parseRvuUploadRows, validateCodeLevel, inferLevelFromDescription, BILLING_TYPE_LABEL, type ParsedRvuUploadRow } from '@/services/billing/codeMapTable';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { formatDateLong } from '@/utils/formatDate';

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
// Kept in English deliberately: this is data written into a real,
// downloadable CSV template, not on-screen UI text - the same
// "exported data stays English" rule already applied to every other
// CSV export in this app.
const TEMPLATE_EXAMPLE_ROWS = [
  { Code: '88305', Description: 'Code 88305 — Specimen Level', WorkRVU: 0.73 },
  { Code: '88307', Description: 'Code 88307 — Specimen Level', WorkRVU: 1.55 },
];


// Real, per direct question: "is there a reason we do not have a way
// to add a RVU code outside of using CSV files. Also, can't edit or
// duplicate?" Confirmed directly — there wasn't a real architectural
// reason; the service layer's own createVersion already accepts any
// real entries array, the UI simply never exposed a single-entry path,
// only the bulk CSV one. This modal is that real, single-entry path for
// add and edit. Duplicate was removed (PS-73, confirmed by Pete): an RVU
// row is a flat code → value mapping inside a versioned, approved table,
// so Add is as quick. Policy: services/duplication/duplicatePolicy.ts. Reuses the exact real
// ps-ms-overlay/ps-ms-modal pattern already proven throughout
// BillingDictionarySection.tsx this same session, not a new one.
interface EntryModalProps {
  seed?: BillingDictionaryEntry;
  onSave: (entry: BillingDictionaryEntry) => void;
  onClose: () => void;
  busy: boolean;
}

const EntryModal: React.FC<EntryModalProps> = ({ seed, onSave, onClose, busy }) => {
  const { t } = useTranslation();
  const isEdit = !!seed;
  const [code, setCode] = useState(seed?.code ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [billingCode, setBillingCode] = useState(seed?.billingCode ?? '');
  const [level, setLevel] = useState<BillingDictionaryEntry['level']>(seed?.level ?? 'stain');
  const [billingType, setBillingType] = useState<BillingDictionaryEntry['billingType']>(seed?.billingType ?? 'Global');
  const [hcpcsCode, setHcpcsCode] = useState(seed?.hcpcsCode ?? '');
  const [workRvu, setWorkRvu] = useState(seed?.workRvu?.toString() ?? '');
  const [rvuPe, setRvuPe] = useState(seed?.rvuPe?.toString() ?? '');
  const [rvuMp, setRvuMp] = useState(seed?.rvuMp?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!code.trim()) { setError(t('rvuCodeMapSection.entryModal.errors.codeRequired')); return; }
    if (!billingCode.trim()) { setError(t('rvuCodeMapSection.entryModal.errors.billingCodeRequired')); return; }
    if (workRvu.trim() && !(Number(workRvu) > 0)) { setError(t('rvuCodeMapSection.entryModal.errors.workRvuInvalid')); return; }
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
  // in its description text at all). The warning text itself comes
  // from that service function, not this component, so it isn't
  // converted here.
  const levelWarning = description.trim() ? validateCodeLevel({ description: description.trim(), level }) : null;

  return (
    <div className="ps-ms-overlay ps-ms-overlay--top-align">
      <div className="ps-ms-modal">
        <div className="ps-ms-header">
          {isEdit
            ? t('rvuCodeMapSection.entryModal.headerEdit', { code: seed?.code })
            : t('rvuCodeMapSection.entryModal.headerAdd')}
        </div>
        <div className="ps-ms-body">
          <div className="ps-conf-form-row">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('rvuCodeMapSection.entryModal.codeLabel')} <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={code} onChange={e => setCode(e.target.value)} disabled={isEdit} placeholder={t('rvuCodeMapSection.entryModal.codePlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('rvuCodeMapSection.entryModal.billingCodeLabel')} <span className="ps-conf-required">*</span></label>
              <input className="ps-conf-input" value={billingCode} onChange={e => setBillingCode(e.target.value)} disabled={isEdit} placeholder={t('rvuCodeMapSection.entryModal.billingCodePlaceholder')} />
            </div>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('rvuCodeMapSection.entryModal.descriptionLabel')}</label>
            <input className="ps-conf-input" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('rvuCodeMapSection.entryModal.descriptionPlaceholder')} />
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('rvuCodeMapSection.entryModal.levelLabel')} <span className="ps-conf-required">*</span></label>
            <select className="ps-conf-input" value={level} onChange={e => setLevel(e.target.value as BillingDictionaryEntry['level'])}>
              <option value="specimen">{t('rvuCodeMapSection.entryModal.levelOptions.specimen')}</option>
              <option value="block">{t('rvuCodeMapSection.entryModal.levelOptions.block')}</option>
              <option value="stain">{t('rvuCodeMapSection.entryModal.levelOptions.stain')}</option>
              <option value="decant">{t('rvuCodeMapSection.entryModal.levelOptions.decant')}</option>
            </select>
            {levelWarning && <p className="ps-conf-hint ps-rvu-level-warning">⚠ {levelWarning}</p>}
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">
              {t('rvuCodeMapSection.entryModal.componentTypeLabel')} <span className="ps-conf-required">*</span>{' '}
              <span
                className="ps-billingdict__info-badge"
                title={t('rvuCodeMapSection.entryModal.componentTypeTooltip', { tc: BILLING_TYPE_LABEL.TC, pc: BILLING_TYPE_LABEL['26'], global: BILLING_TYPE_LABEL.Global })}
              >i</span>
            </label>
            <select className="ps-conf-input" value={billingType} onChange={e => setBillingType(e.target.value as BillingDictionaryEntry['billingType'])}>
              {/* Data keys ('TC'/'26'/'Global') stay literal; BILLING_TYPE_LABEL is a
                  shared display-label constant (services/billing/codeMapTable.ts) also
                  consumed by BillingDictionarySection.tsx, BillingTypeTriggerSection.tsx
                  and GoverningBodiesSection.tsx - left untouched here too, same as the
                  batch-62/66 precedent, since converting it would require touching every
                  other not-yet-converted consumer in the same change. */}
              <option value="TC">{BILLING_TYPE_LABEL.TC}</option>
              <option value="26">{BILLING_TYPE_LABEL['26']}</option>
              <option value="Global">{BILLING_TYPE_LABEL.Global}</option>
            </select>
          </div>
          <div className="ps-conf-form-row--3">
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('rvuCodeMapSection.entryModal.workRvuLabel')}</label>
              <input className="ps-conf-input" type="number" step="0.01" value={workRvu} onChange={e => setWorkRvu(e.target.value)} placeholder={t('rvuCodeMapSection.entryModal.workRvuPlaceholder')} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('rvuCodeMapSection.entryModal.rvuPeLabel')}</label>
              <input className="ps-conf-input" type="number" step="0.01" value={rvuPe} onChange={e => setRvuPe(e.target.value)} />
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('rvuCodeMapSection.entryModal.rvuMpLabel')}</label>
              <input className="ps-conf-input" type="number" step="0.01" value={rvuMp} onChange={e => setRvuMp(e.target.value)} />
            </div>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('rvuCodeMapSection.entryModal.hcpcsLabel')}</label>
            <input className="ps-conf-input" value={hcpcsCode} onChange={e => setHcpcsCode(e.target.value)} placeholder={t('rvuCodeMapSection.entryModal.hcpcsPlaceholder')} />
          </div>
          {error && <span className="ps-conf-error-text">{error}</span>}
        </div>
        <div className="ps-ms-footer">
          <button className="ps-conf-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="ps-conf-btn-primary" disabled={busy} onClick={handleSave}>
            {busy ? t('rvuCodeMapSection.entryModal.submitting') : t('rvuCodeMapSection.entryModal.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};

const RvuCodeMapSection: React.FC = () => {
  const { t, i18n } = useTranslation();
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

  // Single-entry add/edit state — null means the modal is closed; entry
  // undefined within it means "Add"; entry present means "Edit" (code/
  // billingCode locked, since those are this entry's real identity).
  const [entryModalState, setEntryModalState] = useState<{ entry?: BillingDictionaryEntry } | null>(null);
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
    // Renamed from the shadowing `t` used before this file had a real
    // useTranslation() `t` in scope - same fix pattern as
    // DemoResetTab.tsx (batch 64) and GoverningBodiesSection.tsx
    // (batch 66).
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const activeVersion = versions.find(v => v.isActive) ?? null;
  const olderVersions = versions.filter(v => !v.isActive);
  const pendingCount = versions.filter(v => v.approvalStatus === 'PENDING_APPROVAL').length;

  // ── Single-entry add / edit ──────────────────────────────────────────────
  // Real, per direct question — the same real createVersion the upload
  // flow already uses, just computing its entries array from a single
  // real change instead of a whole parsed CSV. isEdit real replaces
  // the matching entry in place (by code); add appends.
  const handleSaveEntry = async (entry: BillingDictionaryEntry) => {
    const isEdit = !!entryModalState?.entry;
    const current = activeVersion?.entries ?? [];
    if (!isEdit && current.some(e => e.code === entry.code)) {
      setToast(t('rvuCodeMapSection.toast.codeExists', { code: entry.code }));
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
    setToast(t('rvuCodeMapSection.toast.entrySubmitted', { code: entry.code }));
    refresh();
  };

  // ── Spreadsheet upload ────────────────────────────────────────────────────

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    if (!isCsvFile(file)) {
      setUploadError(t('rvuCodeMapSection.upload.invalidFileType', { fileName: file.name }));
      return;
    }
    try {
      const text = await readFileAsText(file);
      const rows = parseCsv(text);

      const { entries, problems, skippedNonPayable } = parseRvuUploadRows(rows);

      if (entries.length === 0 && problems.length === 0) {
        setUploadError(t('rvuCodeMapSection.upload.noRowsFound'));
        return;
      }
      if (problems.length > 0) {
        setUploadError(problems.slice(0, 5).join(' '));
      }
      if (skippedNonPayable > 0) {
        setToast(t('rvuCodeMapSection.toast.payableSkipped', { count: entries.length, skipped: skippedNonPayable }));
      }
      setUploadPreview(entries);
      setUploadFileName(file.name);
      if (!uploadLabel) setUploadLabel(`Upload — ${file.name.replace(/\.csv$/i, '')}`);
    } catch {
      setUploadError(t('rvuCodeMapSection.upload.readError'));
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
    setToast(t('rvuCodeMapSection.toast.uploadSubmitted', { label: res.data.label }));
    setUploadPreview(null);
    setUploadFileName('');
    setUploadLabel('');
    refresh();
  };

  const handleDownloadTemplate = () => {
    downloadCsv('RvuCodeMapTemplate.csv', toCsv(TEMPLATE_EXAMPLE_ROWS));
  };

  if (loading) return <div className="ps-conf-section-subtitle">{t('common.loading')}</div>;

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('rvuCodeMapSection.title')}</h3>
          <p className="ps-conf-section-subtitle">{t('rvuCodeMapSection.subtitle')}</p>
        </div>
        <div className="ps-specdict-header-actions">
          <button className="ps-conf-btn-primary ps-conf-btn-primary--nowrap" onClick={() => setEntryModalState({})}>{t('rvuCodeMapSection.addCode')}</button>
          <button className="ps-conf-btn-secondary" onClick={handleDownloadTemplate}>{t('rvuCodeMapSection.downloadTemplate')}</button>
          <button className="ps-conf-btn-secondary" onClick={() => fileInputRef.current?.click()}>{t('rvuCodeMapSection.uploadSpreadsheet')}</button>
          <input ref={fileInputRef} type="file" hidden accept=".csv,text/csv"
            onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      {toast && <div className="ps-conf-section-subtitle ps-rvu-toast-success">{toast}</div>}
      {pendingCount > 0 && (
        <p className="ps-billing-reason-hint">
          {t('rvuCodeMapSection.pendingApproval', { count: pendingCount })}
        </p>
      )}

      {/* ── Active version — front and center ── */}
      {activeVersion ? (
        <div className="ps-rvu-active-box">
          <div className="ps-rvu-active-box-head">
            <div>
              <span className="ps-rvu-active-eyebrow">{t('rvuCodeMapSection.activeVersion.eyebrow')}</span>
              <div className="ps-rvu-active-date">{activeVersion.label}</div>
            </div>
            <div className="ps-rvu-muted-sm">{t('rvuCodeMapSection.activeVersion.effective', { date: formatDateLong(activeVersion.effectiveDate, i18n.language) })}</div>
          </div>
          <div className="ps-conf-table-wrap ps-rvu-table-wrap--mt">
            <table className="ps-conf-table">
              <thead><tr>
                <th className="ps-conf-th">{t('rvuCodeMapSection.activeVersion.table.code')}</th>
                <th className="ps-conf-th">{t('rvuCodeMapSection.activeVersion.table.description')}</th>
                <th className="ps-conf-th">{t('rvuCodeMapSection.activeVersion.table.workRvu')}</th>
                <th className="ps-conf-th">{t('rvuCodeMapSection.activeVersion.table.actions')}</th>
              </tr></thead>
              <tbody>
                {activeVersion.entries.map(e => (
                  <tr key={e.code}>
                    <td className="ps-conf-td">{e.code}</td>
                    <td className="ps-conf-td">{e.description}</td>
                    <td className="ps-conf-td">{e.workRvu === undefined ? <span className="ps-conf-error-text">{t('rvuCodeMapSection.activeVersion.unverified')}</span> : e.workRvu}</td>
                    <td className="ps-conf-td">
                      <div className="ps-conf-row-actions">
                        <button className="ps-conf-btn-row" onClick={() => setEntryModalState({ entry: e })}>{t('common.edit')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="ps-conf-section-subtitle ps-rvu-empty-subtitle">{t('rvuCodeMapSection.activeVersion.empty')}</div>
      )}

      {/* ── Older versions — collapsed by default, never deleted ── */}
      {olderVersions.length > 0 && (
        <div className="ps-rvu-older-wrap">
          <button className="ps-conf-btn-row" onClick={() => setShowOlder(s => !s)}>
            {showOlder ? '▾' : '▸'} {t('rvuCodeMapSection.olderVersions.toggle', { count: olderVersions.length })}
          </button>
          {showOlder && (
            <div className="ps-rvu-older-list">
              {olderVersions
                .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
                .map(v => (
                <div key={v.id} className="ps-rvu-older-row">
                  <div>
                    <div className="ps-rvu-older-row-label">{v.label}</div>
                    <div className="ps-rvu-muted-sm">
                      {t('rvuCodeMapSection.olderVersions.effectiveCodes', { date: formatDateLong(v.effectiveDate, i18n.language), count: v.entries.length })}
                      {v.sourceFileName && <> · {t('rvuCodeMapSection.olderVersions.fromFile', { fileName: v.sourceFileName })}</>}
                    </div>
                  </div>
                  <span className="ps-billing-reason-hint">
                    {v.approvalStatus === 'PENDING_APPROVAL' ? t('rvuCodeMapSection.olderVersions.status.pending')
                      : v.approvalStatus === 'REJECTED' ? (v.rejectionReason ? t('rvuCodeMapSection.olderVersions.status.rejectedWithReason', { reason: v.rejectionReason }) : t('rvuCodeMapSection.olderVersions.status.rejected'))
                      : v.approvalStatus === 'APPROVED' ? t('rvuCodeMapSection.olderVersions.status.approved')
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
        <div className="ps-rvu-preview-box">
          <div className="ps-rvu-preview-title">{t('rvuCodeMapSection.preview.reviewTitle')}</div>

          {uploadError && <div className="ps-rvu-preview-error">{uploadError}</div>}

          <div className="ps-rvu-preview-fields">
            <label className="ps-rvu-preview-field">
              {t('rvuCodeMapSection.preview.versionLabel')}
              <input value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} className="ps-rvu-preview-field-value" />
            </label>
            <label className="ps-rvu-preview-field">
              {t('rvuCodeMapSection.preview.effectiveDate')}
              <input type="date" value={uploadEffectiveDate} onChange={e => setUploadEffectiveDate(e.target.value)} className="ps-rvu-preview-field-value" />
            </label>
          </div>
          <p className="ps-billing-reason-hint">
            {t('rvuCodeMapSection.preview.disclosure')}
          </p>

          <div className="ps-conf-table-wrap ps-rvu-preview-scroll">
            <table className="ps-conf-table">
              <thead><tr>
                <th className="ps-conf-th">{t('rvuCodeMapSection.activeVersion.table.code')}</th>
                <th className="ps-conf-th">{t('rvuCodeMapSection.activeVersion.table.description')}</th>
                <th className="ps-conf-th">{t('rvuCodeMapSection.activeVersion.table.workRvu')}</th>
              </tr></thead>
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

          <div className="ps-rvu-preview-actions">
            <button className="ps-conf-btn-primary" disabled={busy || uploadPreview.length === 0} onClick={handleApplyUpload}>
              {busy ? t('rvuCodeMapSection.entryModal.submitting') : t('rvuCodeMapSection.preview.submit', { count: uploadPreview.length })}
            </button>
            <button className="ps-conf-btn-row" onClick={() => { setUploadPreview(null); setUploadError(null); }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {entryModalState && (
        <EntryModal
          seed={entryModalState.entry}
          busy={entryBusy}
          onSave={handleSaveEntry}
          onClose={() => setEntryModalState(null)}
        />
      )}
    </div>
  );
};

export default RvuCodeMapSection;
