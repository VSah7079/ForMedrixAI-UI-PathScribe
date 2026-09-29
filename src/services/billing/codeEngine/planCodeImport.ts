// src/services/billing/codeEngine/planCodeImport.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-89 §1-§2 (Batch 333): turns mapped CSV rows into new BillingRuleVersion
// rows under one CodeImportJob.
//
//   • Fine-grained: each code gets its own next version in its own
//     (billingCode, siteId) scope; no whole-catalogue pointer.
//   • Per Pete, every row is PENDING_APPROVAL under the job; a second person
//     approves or rejects the job as a whole (planImportJob.ts).
//   • changeReason is synthesized deterministically:
//     "Bulk Import [{jobId}] ({fileName}) by {user}" + ": {note}" if given.
//   • Rows are refused, with a reason, for: a missing code or CPT, a bad or
//     missing effective date, an unknown level/billing type, a bad RVU
//     number, a duplicate code in the file, or a code that already has a
//     version pending approval in the same scope.
//
// Storage-neutral and pure: chunking into database write batches belongs
// to whichever real backend is chosen, not to these rules.
// ─────────────────────────────────────────────────────────────────────────────

import type { BillingRuleVersion, CodeVocabulary } from '@/types/billing/BillingRuleVersion';
import type { CodeImportJob } from '@/types/billing/CodeImportJob';
import { inferLevelFromDescription } from '../codeMapTable';
import type { ColumnMapping } from './csvColumnMapping';
import { missingRequiredMappings } from './csvColumnMapping';

export type ImportRowProblemCode =
  | 'missingBillingCode' | 'missingCpt' | 'badEffectiveFrom' | 'unknownLevel' | 'unknownBillingType'
  | 'badRvu' | 'duplicateInFile' | 'pendingVersionExists';

export interface ImportRowProblem {
  /** 1-based data row number (header excluded). */
  row: number;
  billingCode?: string;
  code: ImportRowProblemCode;
}

export interface CodeImportRequest {
  jobId: string;
  fileName: string;
  uploadedBy: string;
  /** Shown in the synthesized changeReason; falls back to uploadedBy. */
  uploaderLabel?: string;
  timestamp: string;
  vocabulary: CodeVocabulary;
  country?: string;
  siteId?: string;
  batchNote?: string;
  mapping: ColumnMapping;
  fallbackEffectiveFrom?: string;
  /** Used when the level / billing type column is unmapped or blank. */
  defaultLevel?: BillingRuleVersion['level'];
  defaultBillingType?: BillingRuleVersion['billingType'];
}

export type CodeImportPlan =
  | { ok: true; job: CodeImportJob; newVersions: BillingRuleVersion[]; problems: ImportRowProblem[] }
  | { ok: false; reason: 'mappingIncomplete'; missing: string[] };

const LEVELS = ['specimen', 'block', 'stain', 'decant'] as const;
const BILLING_TYPES = ['TC', '26', 'Global'] as const;

export function synthesizeImportChangeReason(jobId: string, fileName: string, user: string, note?: string): string {
  const base = `Bulk Import [${jobId}] (${fileName}) by ${user}`;
  return note?.trim() ? `${base}: ${note.trim()}` : base;
}

/** A date as YYYY-MM-DD, or null if it can't be read. Accepts ISO dates
 *  and US-style M/D/YYYY. */
export function normalizeImportDate(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return isNaN(Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}`)) ? null : `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (us) {
    const d = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    return isNaN(Date.parse(d)) ? null : d;
  }
  return null;
}

const parseRvu = (raw: string | undefined): number | undefined | 'bad' => {
  const v = raw?.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 'bad';
};

export function planCodeImport(
  existing: readonly BillingRuleVersion[],
  rows: readonly Record<string, string>[],
  req: CodeImportRequest,
): CodeImportPlan {
  const missing = missingRequiredMappings(req.mapping, req.fallbackEffectiveFrom);
  if (missing.length) return { ok: false, reason: 'mappingIncomplete', missing };

  const fallbackDate = normalizeImportDate(req.fallbackEffectiveFrom) ?? undefined;
  const scopeSite = req.siteId || undefined;
  const inScope = (v: BillingRuleVersion, code: string) => v.billingCode === code && (v.siteId ?? undefined) === scopeSite;
  const col = (row: Record<string, string>, field: keyof ColumnMapping) => {
    const header = req.mapping[field];
    return header ? (row[header] ?? '').trim() : '';
  };
  const reason = synthesizeImportChangeReason(req.jobId, req.fileName, req.uploaderLabel ?? req.uploadedBy, req.batchNote);

  const problems: ImportRowProblem[] = [];
  const newVersions: BillingRuleVersion[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const rowNo = i + 1;
    if (Object.values(row).every(v => !String(v ?? '').trim())) return; // blank line
    const billingCode = col(row, 'billingCode');
    if (!billingCode) { problems.push({ row: rowNo, code: 'missingBillingCode' }); return; }
    const flag = (code: ImportRowProblemCode) => problems.push({ row: rowNo, billingCode, code });

    const cpt = col(row, 'cpt') || billingCode;
    if (!cpt) { flag('missingCpt'); return; }

    const effectiveFrom = normalizeImportDate(col(row, 'effectiveFrom')) ?? (col(row, 'effectiveFrom') ? null : fallbackDate ?? null);
    if (!effectiveFrom) { flag('badEffectiveFrom'); return; }

    const description = col(row, 'description');
    const levelRaw = col(row, 'level').toLowerCase();
    const level = (LEVELS as readonly string[]).includes(levelRaw)
      ? levelRaw as BillingRuleVersion['level']
      : levelRaw ? null : (inferLevelFromDescription(description) ?? req.defaultLevel ?? null);
    if (!level) { flag('unknownLevel'); return; }

    const typeRaw = col(row, 'billingType');
    const billingType = typeRaw
      ? (BILLING_TYPES as readonly string[]).find(t => t.toLowerCase() === typeRaw.toLowerCase()) as BillingRuleVersion['billingType'] | undefined
      : (req.defaultBillingType ?? 'Global');
    if (!billingType) { flag('unknownBillingType'); return; }

    const rvuWork = parseRvu(col(row, 'rvuWork'));
    const rvuPe = parseRvu(col(row, 'rvuPe'));
    const rvuMp = parseRvu(col(row, 'rvuMp'));
    if (rvuWork === 'bad' || rvuPe === 'bad' || rvuMp === 'bad') { flag('badRvu'); return; }

    if (seen.has(billingCode)) { flag('duplicateInFile'); return; }
    seen.add(billingCode);

    const scoped = existing.filter(v => inScope(v, billingCode));
    if (scoped.some(v => v.status === 'PENDING_APPROVAL' || v.status === 'DRAFT')) { flag('pendingVersionExists'); return; }
    const version = scoped.length ? Math.max(...scoped.map(v => v.version)) + 1 : 1;

    const hcpcsCode = col(row, 'hcpcsCode');
    const notes = col(row, 'notes');
    newVersions.push({
      ...(scopeSite ? { siteId: scopeSite } : {}),
      billingCode,
      version,
      effectiveFrom,
      effectiveTo: null,
      status: 'PENDING_APPROVAL',
      level,
      billingType,
      cpt,
      ...(description ? { description } : {}),
      ...(hcpcsCode ? { hcpcsCode } : {}),
      ...(rvuWork !== undefined ? { rvuWork } : {}),
      ...(rvuPe !== undefined ? { rvuPe } : {}),
      ...(rvuMp !== undefined ? { rvuMp } : {}),
      ...(notes ? { notes } : {}),
      ...(req.country ? { country: req.country } : {}),
      vocabulary: req.vocabulary,
      importJobId: req.jobId,
      createdAt: req.timestamp,
      createdBy: req.uploadedBy,
      changeReason: reason,
      submittedForApprovalBy: req.uploadedBy,
      submittedForApprovalAt: req.timestamp,
    });
  });

  const job: CodeImportJob = {
    jobId: req.jobId,
    fileName: req.fileName,
    uploadedBy: req.uploadedBy,
    timestamp: req.timestamp,
    status: 'PENDING_APPROVAL',
    vocabulary: req.vocabulary,
    ...(req.country ? { country: req.country } : {}),
    ...(scopeSite ? { siteId: scopeSite } : {}),
    ...(req.batchNote?.trim() ? { batchNote: req.batchNote.trim() } : {}),
    codesProcessed: newVersions.map(v => ({ billingCode: v.billingCode, ...(v.siteId ? { siteId: v.siteId } : {}), version: v.version })),
  };
  return { ok: true, job, newVersions, problems };
}
