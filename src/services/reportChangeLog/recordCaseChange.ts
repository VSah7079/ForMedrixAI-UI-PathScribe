// src/services/reportChangeLog/recordCaseChange.ts
// Batch 368 (PS-353): called by every case write in the mock case services
// (mockCaseService, mockOrchestratorCaseService), so no save path can skip
// the log. Attributes the save to the signed-in user and the workstation.
// It never blocks or fails the save itself; a failure to log goes to the
// console (the API server writes both in one transaction, so it can't happen there).

import { readSessionProfile } from '../auth/sessionProfile';
import { getEffectiveScanStationId } from '@/utils/effectiveScanStation';
import type { Case } from '@/types/case/Case';
import { diffCaseChanges, labelOf, labelSynopticChanges, type SynopticLabelSource } from './reportChangeRules';
import type { ReportFieldChange } from './IReportChangeLogService';
import { mockReportChangeLogService } from './mockReportChangeLogService';

export function recordCaseChange(caseId: string, before: Case | undefined, after: Case, writtenKeys: string[]): void {
  try {
    const changes = diffCaseChanges((before ?? {}) as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, writtenKeys);
    if (changes.length === 0) return;
    const profile = readSessionProfile();
    const entry = {
      caseId,
      at: new Date().toISOString(),
      userId: profile?.id ?? 'unknown',
      userName: profile?.name ?? 'Unknown user',
      stationId: getEffectiveScanStationId() ?? null,
    };
    const touchesAnswers = changes.some(c => c.path[0] === 'synopticReports' && c.path[2] === 'answers');
    if (!touchesAnswers) { void mockReportChangeLogService.record({ ...entry, changes }); return; }
    // Synoptic answers are ids; record the labels the template uses now.
    void withSynopticLabels(changes, [...(before?.synopticReports ?? []), ...(after.synopticReports ?? [])])
      .then(labelled => mockReportChangeLogService.record({ ...entry, changes: labelled }));
  } catch (err) {
    console.error('[reportChangeLog] could not record a case change', caseId, err);
  }
}

async function withSynopticLabels(changes: ReportFieldChange[], instances: { templateId?: string }[]): Promise<ReportFieldChange[]> {
  try {
    const { getTemplateCached } = await import('../templates/templateService');
    const byLabel = new Map<string, SynopticLabelSource>();
    for (const inst of instances) {
      const label = labelOf(inst, '');
      if (!inst.templateId || !label || byLabel.has(label)) continue;
      const detail = await getTemplateCached(inst.templateId).catch(() => null);
      if (detail?.template) byLabel.set(label, detail.template as unknown as SynopticLabelSource);
    }
    return labelSynopticChanges(changes, byLabel);
  } catch {
    return changes; // ids are still a faithful record
  }
}
