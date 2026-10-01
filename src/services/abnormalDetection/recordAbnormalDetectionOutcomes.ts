// src/services/abnormalDetection/recordAbnormalDetectionOutcomes.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-137: turns the pathologist's decision on the flagged findings shown at
// sign-out into agreement signals ("Level 1 AI learning").
//   - 'confirmed': they recorded a critical-finding notification;
//   - 'dismissed': they acknowledged without recording.
//
// Moved out of useSignOutWorkflow.ts in Batch 318, where the same mapping was
// written out twice (once per handler), and extended with the one piece
// PS-137 still lacked: each signal now carries the active Validation Study
// covering the case, resolved once per decision the same way the
// narrative-edit signals resolve theirs.
//
// PHI boundary (unchanged): a narrative finding's quote goes through
// deidentifyText() before it is stored. A discrete (synoptic trigger-rule)
// finding's quote is a configured field/value label, not clinical narrative.
// ─────────────────────────────────────────────────────────────────────────────

import type { CriticalFindingFlag } from '../clinical/detectCriticalFindings';
import { deidentifyText } from '../narrativeSignals/deidentification';
import type { IValidationStudyService } from '../validationStudies/IValidationStudyService';
import { resolveActiveStudyId, type StudyScope } from '../validationStudies/resolveActiveStudyId';
import type { AbnormalDetectionSignal, IAbnormalDetectionSignalService } from './IAbnormalDetectionSignalService';

export type AbnormalDetectionOutcome = AbnormalDetectionSignal['outcome'];

/** One finding → the signal to store (without id/capturedAt). Pure. */
export function toAbnormalDetectionSignalInput(
  finding: CriticalFindingFlag,
  caseId: string,
  outcome: AbnormalDetectionOutcome,
  studyId: string | undefined,
  deidentify: (text: string) => { clean: string } = deidentifyText,
): Omit<AbnormalDetectionSignal, 'id' | 'capturedAt'> {
  const source: AbnormalDetectionSignal['source'] = finding.sourceField === 'synoptic' ? 'discrete' : 'narrative';
  return {
    caseId,
    source,
    reasonClean: source === 'narrative' ? deidentify(finding.sourceQuote).clean : finding.sourceQuote,
    suggestedSeverity: finding.severity,
    suggestedConfidence: finding.confidence,
    outcome,
    ...(studyId ? { studyId } : {}),
  };
}

export interface RecordAbnormalDetectionOutcomesInput {
  caseId: string;
  findings: CriticalFindingFlag[];
  outcome: AbnormalDetectionOutcome;
  /** Who/where, for Validation Study resolution. */
  scope: StudyScope;
}

/** Records one signal per finding; returns how many were recorded. A failure
 *  to record one signal is logged and doesn't stop the others. Resolves the
 *  covering study once, and not at all when there are no findings. */
export async function recordAbnormalDetectionOutcomes(
  { caseId, findings, outcome, scope }: RecordAbnormalDetectionOutcomesInput,
  deps: {
    signalService: Pick<IAbnormalDetectionSignalService, 'recordSignal'>;
    studyService: Pick<IValidationStudyService, 'getStudyForCase'>;
  },
): Promise<number> {
  if (findings.length === 0) return 0;
  const studyId = await resolveActiveStudyId(scope, deps.studyService);
  const results = await Promise.all(findings.map(f =>
    deps.signalService
      .recordSignal(toAbnormalDetectionSignalInput(f, caseId, outcome, studyId))
      .then(r => r.ok)
      .catch(e => { console.error('[AbnormalDetection] Could not record agreement signal:', e); return false; }),
  ));
  return results.filter(Boolean).length;
}
