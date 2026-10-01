// src/components/Config/System/CodeImportSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 (Batch 334): System → Financial & Revenue Lookups → Code Import.
//
//   1. Choose a CSV file, the coding standard (vocabulary), the country and
//      an optional site, plus a batch note.
//   2. Match the file's columns to billing-code fields. Billing code, CPT
//      and effective date are required; a batch-wide effective date can
//      stand in for a missing date column.
//   3. Check the file: every row that would be refused is listed with its
//      reason. Refused rows block the import unless the admin skips them.
//   4. Import: one job, pending a second person's approval in
//      System → Pending Approvals (four-eyes).
//   5. The job history lists every import; an approved job can be rolled
//      back with a reason.
//
// Rules live in services/billing/codeEngine/ (importWizardRules.ts,
// csvColumnMapping.ts, pendingImportQueue.ts); the service writes the
// audit entries.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { codeImportService, type CodeImportPreview } from '@/services';
import { listAllSites, type Site } from '@/services/organisation/organisationService';
import { getSessionUser } from '@/services/auth/caseAccessControl';
import { CODE_VOCABULARIES, type BillingRuleVersion, type CodeVocabulary } from '@/types/billing/BillingRuleVersion';
import type { CodeImportJob } from '@/types/billing/CodeImportJob';
import {
  autoMapColumns, missingRequiredMappings, OPTIONAL_IMPORT_FIELDS, REQUIRED_IMPORT_FIELDS,
  type CodeImportField, type ColumnMapping,
} from '@/services/billing/codeEngine/csvColumnMapping';
import {
  canSubmitImport, defaultCountryForVocabulary, IMPORT_COUNTRY_GROUPS, PROBLEM_LIST_LIMIT, readImportCsv, withMappedColumn,
} from '@/services/billing/codeEngine/importWizardRules';
import { canRollBackImportJob } from '@/services/billing/codeEngine/pendingImportQueue';
import { isCsvFile, readFileAsText } from '@/utils/csv';
import { formatDateTime } from '@/utils/formatDate';
import { siteLabel } from './BillingDictionarySection';

const LEVEL_LABEL_KEY: Record<BillingRuleVersion['level'], string> = {
  specimen: 'billingDictionarySection.modal.levelSpecimenOption',
  block:    'billingDictionarySection.modal.levelBlockOption',
  stain:    'billingDictionarySection.modal.levelStainOption',
  decant:   'billingDictionarySection.modal.levelDecantOption',
};
const LEVELS = Object.keys(LEVEL_LABEL_KEY) as BillingRuleVersion['level'][];
const BILLING_TYPES: BillingRuleVersion['billingType'][] = ['Global', 'TC', '26'];

interface LoadedFile { fileName: string; headers: string[]; rows: Record<string, string>[] }

const CodeImportSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [jobs, setJobs] = useState<CodeImportJob[]>([]);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [vocabulary, setVocabulary] = useState<CodeVocabulary>('CPT');
  const [country, setCountry] = useState(defaultCountryForVocabulary('CPT'));
  const [siteId, setSiteId] = useState('');
  const [batchNote, setBatchNote] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fallbackDate, setFallbackDate] = useState('');
  const [defaultLevel, setDefaultLevel] = useState<BillingRuleVersion['level'] | ''>('');
  const [defaultBillingType, setDefaultBillingType] = useState<BillingRuleVersion['billingType']>('Global');
  const [preview, setPreview] = useState<CodeImportPreview | null>(null);
  const [skipRefused, setSkipRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');

  const refreshJobs = useCallback(() => {
    codeImportService.listJobs().then(res => { if (res.ok) setJobs(res.data); });
  }, []);

  useEffect(() => {
    refreshJobs();
    listAllSites().then(setSites).catch(() => setSites([]));
  }, [refreshJobs]);

  const session = getSessionUser();
  const userId = session?.id ?? 'unknown';
  const userLabel = session?.firstName ? `${session.firstName} ${session.lastName ?? ''}`.trim() : userId;

  // Any change to the inputs makes an earlier check stale.
  const invalidate = () => { setPreview(null); setSkipRefused(false); setNotice(null); };

  const handleFile = async (f: File) => {
    setError(null);
    invalidate();
    if (!isCsvFile(f)) { setError(t('codeImportSection.errors.notCsv', { fileName: f.name })); return; }
    try {
      const { headers, rows } = readImportCsv(await readFileAsText(f));
      if (!headers.length || !rows.length) { setError(t('codeImportSection.errors.emptyFile', { fileName: f.name })); return; }
      setFile({ fileName: f.name, headers, rows });
      setMapping(autoMapColumns(headers));
    } catch {
      setError(t('codeImportSection.errors.unreadable', { fileName: f.name }));
    }
  };

  const request = () => ({
    fileName: file?.fileName ?? '',
    uploadedBy: userId,
    uploaderLabel: userLabel,
    vocabulary,
    ...(country ? { country } : {}),
    ...(siteId ? { siteId } : {}),
    ...(batchNote.trim() ? { batchNote: batchNote.trim() } : {}),
    mapping,
    ...(fallbackDate ? { fallbackEffectiveFrom: fallbackDate } : {}),
    ...(defaultLevel ? { defaultLevel } : {}),
    defaultBillingType,
  });

  const handleCheck = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await codeImportService.previewImport(file.rows, request());
    setBusy(false);
    if (res.ok === false) { setError(t('codeImportSection.refusals.MAPPING_INCOMPLETE')); return; }
    setPreview(res.data);
  };

  const handleImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await codeImportService.importRows(file.rows, request(), { skipRefusedRows: skipRefused });
    setBusy(false);
    if (res.ok === false) { setError(t(`codeImportSection.refusals.${res.code}`)); return; }
    setNotice(t('codeImportSection.imported', { count: res.data.job.codesProcessed.length, jobId: res.data.job.jobId }));
    setFile(null);
    setMapping({});
    setBatchNote('');
    setFallbackDate('');
    setPreview(null);
    setSkipRefused(false);
    refreshJobs();
  };

  const handleRollback = async (job: CodeImportJob) => {
    setError(null);
    if (!rollbackReason.trim()) { setError(t('codeImportSection.errors.reasonRequired')); return; }
    const res = await codeImportService.rollbackJob(job.jobId, userId, rollbackReason.trim(), { actorLabel: userLabel });
    if (res.ok === false) { setError(t(`codeImportSection.refusals.${res.code}`)); return; }
    setRollingBackId(null);
    setRollbackReason('');
    refreshJobs();
  };

  const missing = missingRequiredMappings(mapping, fallbackDate);
  const fieldLabel = (f: CodeImportField) => t(`codeImportSection.fields.${f}`);

  const columnSelect = (field: CodeImportField) => (
    <select
      className="ps-conf-select"
      value={mapping[field] ?? ''}
      onChange={e => { setMapping(m => withMappedColumn(m, field, e.target.value)); invalidate(); }}
    >
      <option value="">{t('codeImportSection.mapping.notMapped')}</option>
      {file?.headers.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  );

  const countryOption = (code: string) => (
    <option key={code} value={code}>
      {IMPORT_COUNTRY_GROUPS.operating.includes(code) ? code : t('codeImportSection.countryOption', { name: t(`billingDictionarySection.countries.${code}`), code })}
    </option>
  );

  const jobScope = (job: CodeImportJob) =>
    t('codeImportSection.jobs.scope', { country: job.country || t('codeImportSection.anyCountry'), site: siteLabel(sites, job.siteId, t) });

  const jobOutcome = (job: CodeImportJob) => {
    if (job.rejection) return t('codeImportSection.jobs.rejectedReason', { reason: job.rejection.reason });
    if (job.rollbackMetadata) {
      return t('codeImportSection.jobs.rollbackSummary', {
        reason: job.rollbackMetadata.rollbackReason,
        removed: job.rollbackMetadata.purgedCount,
        retired: job.rollbackMetadata.retiredCount,
      });
    }
    return job.batchNote ?? '';
  };

  const shownProblems = preview?.problems.slice(0, PROBLEM_LIST_LIMIT) ?? [];

  return (
    <div>
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('codeImportSection.title')}</h3>
          <p className="ps-conf-section-subtitle">{t('codeImportSection.subtitle')}</p>
        </div>
      </div>

      {error && <p className="ps-conf-error-text">{error}</p>}
      {notice && <p className="ps-conf-hint ps-conf-hint--success">{notice}</p>}

      {/* ── 1. File and scope ── */}
      <div className="ps-conf-card ps-code-import-card">
        <div className="ps-conf-card-title">{t('codeImportSection.steps.file')}</div>
        <div className="ps-code-import-file-row">
          <button className="ps-conf-btn-secondary" onClick={() => fileInputRef.current?.click()}>
            {file ? t('codeImportSection.chooseAnotherFile') : t('codeImportSection.chooseFile')}
          </button>
          <input ref={fileInputRef} type="file" hidden accept=".csv,text/csv"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }} />
          {file && <span className="ps-conf-hint">{t('codeImportSection.fileSummary', { fileName: file.fileName, count: file.rows.length })}</span>}
        </div>

        <div className="ps-conf-form-row--3">
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('codeImportSection.vocabularyLabel')}</label>
            <select className="ps-conf-select" value={vocabulary} onChange={e => {
              const v = e.target.value as CodeVocabulary;
              setVocabulary(v);
              setCountry(defaultCountryForVocabulary(v));
              invalidate();
            }}>
              {CODE_VOCABULARIES.map(v => <option key={v} value={v}>{t(`codeImportSection.vocabularies.${v}`)}</option>)}
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('codeImportSection.countryLabel')}</label>
            <select className="ps-conf-select" value={country} onChange={e => { setCountry(e.target.value); invalidate(); }}>
              <option value="">{t('codeImportSection.anyCountry')}</option>
              <optgroup label={t('billingDictionarySection.modal.countryGroupOperating')}>{IMPORT_COUNTRY_GROUPS.operating.map(countryOption)}</optgroup>
              <optgroup label={t('billingDictionarySection.modal.countryGroupEU')}>{IMPORT_COUNTRY_GROUPS.eu.map(countryOption)}</optgroup>
              <optgroup label={t('billingDictionarySection.modal.countryGroupOther')}>{IMPORT_COUNTRY_GROUPS.other.map(countryOption)}</optgroup>
            </select>
          </div>
          <div className="ps-conf-form-field">
            <label className="ps-conf-label">{t('codeImportSection.siteLabel')}</label>
            <select className="ps-conf-select" value={siteId} onChange={e => { setSiteId(e.target.value); invalidate(); }}>
              <option value="">{t('billingDictionarySection.enterpriseWideLabel')}</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="ps-conf-form-field">
          <label className="ps-conf-label">{t('codeImportSection.batchNoteLabel')}</label>
          <input className="ps-conf-input" value={batchNote} onChange={e => setBatchNote(e.target.value)} placeholder={t('codeImportSection.batchNotePlaceholder')} />
          <span className="ps-conf-hint">{t('codeImportSection.batchNoteHint')}</span>
        </div>
      </div>

      {/* ── 2. Column mapping ── */}
      {file && (
        <div className="ps-conf-card ps-code-import-card">
          <div className="ps-conf-card-title">{t('codeImportSection.steps.mapping')}</div>
          <p className="ps-conf-card-description">{t('codeImportSection.mapping.intro')}</p>
          <div className="ps-code-import-mapping-grid">
            {REQUIRED_IMPORT_FIELDS.map(f => (
              <div key={f} className="ps-conf-form-field">
                <label className="ps-conf-label">{fieldLabel(f)} <span className="ps-conf-required">*</span></label>
                {columnSelect(f)}
              </div>
            ))}
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('codeImportSection.mapping.fallbackDateLabel')}</label>
              <input className="ps-conf-input" type="date" value={fallbackDate} onChange={e => { setFallbackDate(e.target.value); invalidate(); }} />
              <span className="ps-conf-hint">{t('codeImportSection.mapping.fallbackDateHint')}</span>
            </div>
            {OPTIONAL_IMPORT_FIELDS.map(f => (
              <div key={f} className="ps-conf-form-field">
                <label className="ps-conf-label">{fieldLabel(f)}</label>
                {columnSelect(f)}
              </div>
            ))}
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('codeImportSection.mapping.defaultLevelLabel')}</label>
              <select className="ps-conf-select" value={defaultLevel} onChange={e => { setDefaultLevel(e.target.value as BillingRuleVersion['level'] | ''); invalidate(); }}>
                <option value="">{t('codeImportSection.mapping.fromDescription')}</option>
                {LEVELS.map(l => <option key={l} value={l}>{t(LEVEL_LABEL_KEY[l])}</option>)}
              </select>
            </div>
            <div className="ps-conf-form-field">
              <label className="ps-conf-label">{t('codeImportSection.mapping.defaultBillingTypeLabel')}</label>
              <select className="ps-conf-select" value={defaultBillingType} onChange={e => { setDefaultBillingType(e.target.value as BillingRuleVersion['billingType']); invalidate(); }}>
                {BILLING_TYPES.map(b => <option key={b} value={b}>{t(`codeImportSection.billingTypes.${b}`)}</option>)}
              </select>
            </div>
          </div>
          {missing.length > 0 && (
            <p className="ps-conf-hint ps-conf-hint--warning">
              {t('codeImportSection.mapping.missing', { fields: missing.map(fieldLabel).join(t('codeImportSection.listSeparator')) })}
            </p>
          )}
          <div className="ps-code-import-actions">
            <button className="ps-conf-btn-primary" disabled={busy || missing.length > 0} onClick={handleCheck}>
              {t('codeImportSection.checkFile')}
            </button>
          </div>
        </div>
      )}

      {/* ── 3. Check and import ── */}
      {file && preview && (
        <div className="ps-conf-card ps-code-import-card">
          <div className="ps-conf-card-title">{t('codeImportSection.steps.check')}</div>
          <p className={preview.problems.length ? 'ps-conf-hint ps-conf-hint--warning' : 'ps-conf-hint ps-conf-hint--success'}>
            {t('codeImportSection.preview.summary', { count: preview.importable })}{' '}
            {preview.problems.length > 0 && t('codeImportSection.preview.refused', { count: preview.problems.length })}
          </p>
          {preview.problems.length > 0 && (
            <>
              <div className="ps-conf-table-wrap">
                <div className="ps-conf-table-scroll ps-code-import-problems">
                  <table className="ps-conf-table">
                    <thead><tr>
                      <th className="ps-conf-th">{t('codeImportSection.preview.headers.row')}</th>
                      <th className="ps-conf-th">{t('codeImportSection.preview.headers.billingCode')}</th>
                      <th className="ps-conf-th">{t('codeImportSection.preview.headers.problem')}</th>
                    </tr></thead>
                    <tbody>
                      {shownProblems.map(p => (
                        <tr key={`${p.row}-${p.code}`}>
                          <td className="ps-conf-td">{p.row}</td>
                          <td className="ps-conf-td">{p.billingCode ?? '—'}</td>
                          <td className="ps-conf-td">{t(`codeImportSection.problems.${p.code}`)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {preview.problems.length > shownProblems.length && (
                <p className="ps-conf-hint">{t('codeImportSection.preview.more', { count: preview.problems.length - shownProblems.length })}</p>
              )}
              <label className="ps-code-import-skip">
                <input type="checkbox" checked={skipRefused} onChange={e => setSkipRefused(e.target.checked)} />
                {t('codeImportSection.preview.skipRefused')}
              </label>
            </>
          )}
          <p className="ps-billing-reason-hint">{t('codeImportSection.preview.approvalNote')}</p>
          <div className="ps-code-import-actions">
            <button className="ps-conf-btn-primary" disabled={busy || !canSubmitImport(preview, skipRefused)} onClick={handleImport}>
              {t('codeImportSection.submit', { count: preview.importable })}
            </button>
          </div>
        </div>
      )}

      {/* ── Job history ── */}
      <div className="ps-conf-section-header">
        <div>
          <h3 className="ps-conf-section-title">{t('codeImportSection.jobs.title')}</h3>
          <p className="ps-conf-section-subtitle">{t('codeImportSection.jobs.subtitle')}</p>
        </div>
      </div>
      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead><tr>
              <th className="ps-conf-th">{t('codeImportSection.jobs.headers.job')}</th>
              <th className="ps-conf-th">{t('codeImportSection.jobs.headers.vocabulary')}</th>
              <th className="ps-conf-th">{t('codeImportSection.jobs.headers.scope')}</th>
              <th className="ps-conf-th">{t('codeImportSection.jobs.headers.codes')}</th>
              <th className="ps-conf-th">{t('codeImportSection.jobs.headers.uploaded')}</th>
              <th className="ps-conf-th">{t('codeImportSection.jobs.headers.status')}</th>
              <th className="ps-conf-th">{t('codeImportSection.jobs.headers.actions')}</th>
            </tr></thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.jobId}>
                  <td className="ps-conf-td">
                    <span className="ps-conf-identity-name">{job.fileName}</span>
                    <div className="ps-conf-hint">{job.jobId}</div>
                  </td>
                  <td className="ps-conf-td">{t(`codeImportSection.vocabularies.${job.vocabulary}`)}</td>
                  <td className="ps-conf-td">{jobScope(job)}</td>
                  <td className="ps-conf-td">{job.codesProcessed.length}</td>
                  <td className="ps-conf-td">
                    {formatDateTime(job.timestamp, i18n.language)}
                    <div className="ps-conf-hint">{job.uploadedBy}</div>
                  </td>
                  <td className="ps-conf-td">
                    {t(`codeImportSection.jobs.status.${job.status}`)}
                    {jobOutcome(job) && <div className="ps-conf-hint">{jobOutcome(job)}</div>}
                  </td>
                  <td className="ps-conf-td">
                    {canRollBackImportJob(job) && (rollingBackId === job.jobId ? (
                      <div className="ps-conf-row-actions">
                        <input className="ps-conf-input" value={rollbackReason} onChange={e => setRollbackReason(e.target.value)}
                          placeholder={t('codeImportSection.jobs.rollbackPlaceholder')} autoFocus />
                        <button className="ps-conf-btn-row" onClick={() => handleRollback(job)}>{t('codeImportSection.jobs.confirmRollback')}</button>
                        <button className="ps-conf-btn-row" onClick={() => { setRollingBackId(null); setRollbackReason(''); setError(null); }}>{t('common.cancel')}</button>
                      </div>
                    ) : (
                      <button className="ps-conf-btn-row" onClick={() => { setRollingBackId(job.jobId); setRollbackReason(''); setError(null); }}>
                        {t('codeImportSection.jobs.rollback')}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr><td className="ps-conf-empty-row" colSpan={7}>{t('codeImportSection.jobs.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="ps-billing-reason-hint">{t('codeImportSection.jobs.rollbackNote')}</p>
    </div>
  );
};

export default CodeImportSection;
