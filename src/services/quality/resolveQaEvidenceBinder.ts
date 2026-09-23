// src/services/quality/resolveQaEvidenceBinder.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-108, Story 6.1/6.3 — Inspection Mode's real evidence binder: "one-click
// export of all QA evidence for the last 24 months," with "the binder mapping
// each QA activity to the relevant regulatory clause for each supported
// nation." Built directly on the same generic QaActivityRecord/QaActivityType
// engine the Dashboard (resolveQaActivityDashboardReport.ts) reports on — an
// inspector reviewing this binder is looking at the exact same real review
// records a QA Lead already sees on the Dashboard, just organized for audit
// rather than trend-spotting.
//
// Real, honest regulatory-clause mapping: PS-108's own "Supported Nations &
// Regulatory Basis" section names one real accreditation framework per
// country (CAP/CLIA for the US, ISO 15189 + ISO/TS 23824:2024 for the EU,
// etc.) — reused verbatim here, keyed against this app's own real
// Jurisdiction enum (types/systemConfig.ts), not re-researched or
// re-worded. A QaActivityType's own `jurisdictions` field (already real,
// already admin-configured — PS-115) is what actually drives which
// clause(s) a given activity cites: an activity type with no jurisdictions
// configured (a site's own 'custom' tab activity) honestly cites none,
// rather than a fabricated universal default.
//
// Real, disclosed scope limit on "CAPA triggered": this app's real CAPA
// auto-raise path (mockQaActivityRecordService.ts's own create()) does not
// store a back-reference from the raised SpecimenDeficiency to the
// QaActivityRecord that triggered it — only a free-text audit comment.
// Rather than fabricate a precise linkage this app doesn't actually track,
// this binder reports "records meeting this activity's own configured
// CAPA-trigger threshold" (discordant + severity within
// capaTriggerRule.triggerSeverities) — a real, honestly-computable proxy,
// clearly labeled as such rather than claimed to be a traced 1:1 link.
// ─────────────────────────────────────────────────────────────────────────────

import type { QaActivityRecord } from '@/types/quality/QaActivityRecord';
import type { QaActivityType } from '@/types/quality/QaActivityType';
import type { Jurisdiction } from '@/types/systemConfig';

/** Real, verbatim from PS-108's own "Supported Nations & Regulatory Basis"
 *  table — one primary citation per real Jurisdiction enum value this app
 *  actually has. GB_EW/GB_SCT/GB_NIR all cite the same real UK basis
 *  (UKAS ISO 15189) — PS-108 names the UK once, not per home nation. */
export const REGULATORY_CLAUSE_BY_JURISDICTION: Record<Jurisdiction, string> = {
  US: 'CAP AP Checklist / CLIA interpretive QA requirements',
  CA: 'IQMH, CPSA — interpretive QA, correlation audits, discrepancy tracking',
  GB_EW: 'UKAS ISO 15189 — interpretive audits, discrepancy documentation',
  GB_SCT: 'UKAS ISO 15189 — interpretive audits, discrepancy documentation',
  GB_NIR: 'UKAS ISO 15189 — interpretive audits, discrepancy documentation',
  IE: 'ISO 15189 / ISO/TS 23824:2024 — internal audits, diagnostic accuracy review',
  AU: 'NATA/RCPA — structured AP QA, correlation audits, random review',
  NZ: 'IANZ — interpretive QA, internal audits',
  KR: 'National accreditation programs — interpretive QA, peer review, discrepancy tracking',
  BE: 'ISO 15189 / ISO/TS 23824:2024 — internal audits, diagnostic accuracy review',
  NL: 'ISO 15189 / ISO/TS 23824:2024 — internal audits, diagnostic accuracy review',
  DE: 'ISO 15189 / ISO/TS 23824:2024 — internal audits, diagnostic accuracy review',
  FR: 'ISO 15189 / ISO/TS 23824:2024 — internal audits, diagnostic accuracy review',
};

export interface QaEvidenceBinderRecordRow {
  recordId: string;
  caseId: string;
  specimenId?: string;
  outcome: QaActivityRecord['outcome'];
  severity?: QaActivityRecord['severity'];
  recordedAt: string;
  recordedByName: string;
  meetsCapaThreshold: boolean;
}

export interface QaEvidenceBinderEntry {
  activityTypeId: string;
  activityTypeName: string;
  regulatoryBasis: { jurisdiction: Jurisdiction; clause: string }[];
  totalRecords: number;
  discordantCount: number;
  capaThresholdMetCount: number;
  records: QaEvidenceBinderRecordRow[];
}

export interface QaEvidenceBinderReport {
  windowMonths: number;
  windowStart: string;
  generatedAt: string;
  totalRecords: number;
  entries: QaEvidenceBinderEntry[];
}

export function resolveQaEvidenceBinder(
  records: QaActivityRecord[],
  activityTypes: QaActivityType[],
  windowMonths: number,
  now: Date = new Date(),
): QaEvidenceBinderReport {
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - windowMonths);
  const windowStartMs = windowStart.getTime();

  const inWindow = records.filter(r => new Date(r.recordedAt).getTime() >= windowStartMs);

  const byType = new Map<string, QaActivityRecord[]>();
  for (const r of inWindow) {
    const bucket = byType.get(r.activityTypeId);
    if (bucket) bucket.push(r);
    else byType.set(r.activityTypeId, [r]);
  }

  const entries: QaEvidenceBinderEntry[] = [];
  for (const [activityTypeId, recs] of byType) {
    const type = activityTypes.find(t => t.id === activityTypeId);
    const triggerSeverities = type?.capaTriggerRule?.triggerSeverities ?? [];
    const rows: QaEvidenceBinderRecordRow[] = recs
      .slice()
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .map(r => ({
        recordId: r.id,
        caseId: r.caseId,
        specimenId: r.specimenId,
        outcome: r.outcome,
        severity: r.severity,
        recordedAt: r.recordedAt,
        recordedByName: r.recordedBy.userName,
        meetsCapaThreshold: r.outcome === 'discordant' && !!r.severity && triggerSeverities.includes(r.severity),
      }));
    entries.push({
      activityTypeId,
      activityTypeName: type?.name ?? activityTypeId,
      regulatoryBasis: (type?.jurisdictions ?? []).map(j => ({ jurisdiction: j, clause: REGULATORY_CLAUSE_BY_JURISDICTION[j] })),
      totalRecords: recs.length,
      discordantCount: recs.filter(r => r.outcome === 'discordant').length,
      capaThresholdMetCount: rows.filter(r => r.meetsCapaThreshold).length,
      records: rows,
    });
  }

  // Real, highest-volume-first — same real ordering rationale as the
  // Dashboard's own groups (resolveQaActivityDashboardReport.ts).
  entries.sort((a, b) => b.totalRecords - a.totalRecords);

  return {
    windowMonths,
    windowStart: windowStart.toISOString(),
    generatedAt: now.toISOString(),
    totalRecords: inWindow.length,
    entries,
  };
}
