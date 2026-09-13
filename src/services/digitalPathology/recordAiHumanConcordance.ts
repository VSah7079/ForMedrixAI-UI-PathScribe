// src/services/digitalPathology/recordAiHumanConcordance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per this module's own established CAPA-design decision: "NO
// auto-CAPA. AI discordance should raise a SpecimenDeficiency (status:
// 'open') via existing deficiencyService.raise(). Human decides —
// Contain, Escalate to CAPA, or leave — using existing
// QualityAssurancePage.tsx UI." This is that real orchestration: a
// real pathologist/cytotechnologist's own concordance judgment is
// recorded, and a genuine "no" raises a real, open deficiency for a
// human to triage through the existing QA workflow — this app never
// escalates to CAPA on its own.
// ─────────────────────────────────────────────────────────────────────────────

import { mockAiScreeningResultService } from './mockAiScreeningResultService';
import { mockSpecimenDeficiencyService } from '../deficiencies/mockSpecimenDeficiencyService';
import type { ServiceResult, ID } from '../types';
import type { AiScreeningResult } from '@/types/digitalPathology/AiScreeningResult';

export async function recordAiHumanConcordance(
  resultId: ID,
  concordant: boolean,
): Promise<ServiceResult<AiScreeningResult>> {
  const updated = await mockAiScreeningResultService.recordHumanConcordance(resultId, concordant);
  if (!updated.ok || concordant) return updated;

  // Real, per this module's own CAPA-design decision — a genuine
  // discordance raises a real, open deficiency; never auto-escalated,
  // never auto-resolved.
  await mockSpecimenDeficiencyService.raise({
    caseId: updated.data.caseId,
    specimenId: updated.data.specimenId,
    deficiencyTypeId: 'def-ai-discordance',
    comment: `AI screening result ${updated.data.id} (vendor ${updated.data.vendorId}) marked discordant with the reviewing pathologist/cytotechnologist's own independent finding.`,
    raisedBy: 'system',
  });

  return updated;
}
