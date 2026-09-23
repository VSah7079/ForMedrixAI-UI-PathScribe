// src/services/quality/applySurgicalPostSignOutQa.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. The real, post-sign-out orchestration wiring the two new
// generic-engine consumers into an actual surgical case sign-out:
//   1. Post-sign-out peer review SELECTION (PS-117's generic engine +
//      this ticket's own subspecialty risk-weighting layer).
//   2. Biopsy-to-resection correlation CANDIDATE DETECTION
//      (resolveSurgicalBiopsyToResectionCorrelationCandidates.ts).
// Neither one performs the actual review/comparison itself — both are
// real, mechanical "flag it for a human" side effects, matching every
// other real boundary this session has drawn between automatable
// case-selection and non-automatable diagnostic judgment.
//
// Real, deliberate isolation from useSignOutWorkflow.ts's own
// knownVersionRef optimistic-concurrency machinery: this function
// re-fetches the case fresh via caseRouter.getCase() immediately
// before writing, and calls caseRouter.updateCase() with NO
// expectedVersion — a real, honest choice, not an oversight. This
// function runs fire-and-forget (see its own call site in
// useSignOutWorkflow.ts) alongside other real, version-checked writes
// still in flight for the same case (the release-buffer state
// transition); racing it against knownVersionRef.current would risk a
// real, spurious ConcurrencyConflictError on the sign-out's own
// critical writes for a side channel that only ever adds a QA flag,
// never touches clinical content. A background flag that occasionally
// has to re-resolve on a rare, real concurrent edit is an acceptable,
// disclosed tradeoff; a sign-out-blocking conflict caused by this
// side effect would not be.
// ─────────────────────────────────────────────────────────────────────────────

import { caseRouter } from '@/services/cases/CaseRouter';
import { intraoperativeService } from '@/services';
import { mockSpecimenDictionaryService } from '@/services/specimenDictionary/mockSpecimenDictionaryService';
import { mockQaActivityTypeService, SURGICAL_PEER_REVIEW_ACTIVITY_TYPE_ID } from './mockQaActivityTypeService';
import { mockSurgicalPeerReviewRiskWeightService } from './mockSurgicalPeerReviewRiskWeightService';
import { resolveQaCaseSelectionContext } from './resolveQaCaseSelectionContext';
import { evaluateQaTargetedSelectionRule } from './evaluateQaTargetedSelectionRule';
import { resolveSurgicalPeerReviewSelectionForCase } from './resolveSurgicalPeerReviewSelectionForCase';
import {
  resolveSurgicalBiopsyToResectionCorrelationCandidates,
  type SurgicalBiopsySpecimenInfo,
} from './resolveSurgicalBiopsyToResectionCorrelationCandidates';
import type { Case } from '@/types/case/Case';
import type { Specimen } from '@/types/case/Specimen';

/** Real, per this file's own header: a specimen counts as "surgical"
 *  for biopsy-to-resection correlation purposes when its dictionary
 *  entry is anything OTHER than Cytology/FNA — the direct complement
 *  of the exact check CytologyScreeningPage.tsx's own histology-
 *  correlation detection already uses to identify a NON-cytology
 *  specimen, reused here rather than a second, differently-drawn
 *  line. A specimen with no resolvable dictionary entry is treated as
 *  surgical by default — same real "don't silently hide a real
 *  candidate" posture that file's own comment already documents for
 *  its own, inverse case. */
function isSurgicalSpecimen(specimen: Specimen, dictById: Map<string, { type: string }>): boolean {
  const entry = specimen.specimenDictionaryEntryId ? dictById.get(specimen.specimenDictionaryEntryId) : undefined;
  return !(entry && (entry.type === 'Cytology' || entry.type === 'FNA'));
}

function toBiopsySpecimenInfo(caseId: string, specimen: Specimen): SurgicalBiopsySpecimenInfo | undefined {
  if (!specimen.receivedAt) return undefined; // no real date to window against
  return {
    caseId,
    specimenId: specimen.id,
    receivedAt: specimen.receivedAt,
    bodySite: specimen.collection?.bodySite,
    laterality: specimen.collection?.laterality,
  };
}

/**
 * Real, per direct guidance (PS-324): runs both real post-sign-out QA
 * side effects for one just-signed-out surgical case. Deliberately
 * takes only `caseId` — re-fetches everything else fresh rather than
 * trusting a caller's possibly-stale `Case` object, since this always
 * runs after the case's own real sign-out state transition has
 * already been persisted.
 */
export async function applySurgicalPostSignOutQa(caseId: string): Promise<void> {
  const caseRes = await caseRouter.getCase(caseId);
  if (!caseRes) return;
  const freshCase = caseRes as Case;
  const specimens = freshCase.specimens ?? [];
  if (specimens.length === 0) return;

  let patchedSpecimens = specimens;
  let changed = false;

  // ── 1. Post-sign-out peer review selection (PS-117 + PS-324 weighting) ──
  const representativeSpecimen = patchedSpecimens[0];
  if (representativeSpecimen && !representativeSpecimen.surgicalPeerReview?.postSignOutPeerReviewFlag) {
    const [activityTypesRes, weightsRes, intraopRes] = await Promise.all([
      mockQaActivityTypeService.getAll(),
      mockSurgicalPeerReviewRiskWeightService.getAll(),
      intraoperativeService.getAll(),
    ]);
    const peerReviewActivityType = activityTypesRes.ok
      ? activityTypesRes.data.find(t => t.id === SURGICAL_PEER_REVIEW_ACTIVITY_TYPE_ID && t.active)
      : undefined;

    if (peerReviewActivityType && intraopRes.ok) {
      const context = resolveQaCaseSelectionContext(caseId, intraopRes.data);
      const targeted = evaluateQaTargetedSelectionRule(peerReviewActivityType.targetedSelectionRule, context);
      const weights = weightsRes.ok ? weightsRes.data : [];
      const selected = targeted || resolveSurgicalPeerReviewSelectionForCase(
        peerReviewActivityType.samplingPercentage, weights, freshCase.subspecialtyId,
      );

      if (selected) {
        const flaggedAt = new Date().toISOString();
        patchedSpecimens = patchedSpecimens.map(s =>
          s.id !== representativeSpecimen.id ? s : {
            ...s,
            surgicalPeerReview: {
              ...s.surgicalPeerReview,
              postSignOutPeerReviewFlag: { reason: targeted ? 'targeted_high_risk' : 'random_selection', flaggedAt },
            },
          }
        );
        changed = true;
      }
    }
  }

  // ── 2. Biopsy-to-resection correlation candidate detection ──────────────
  const dictRes = await mockSpecimenDictionaryService.getAll();
  const dictById = new Map((dictRes.ok ? dictRes.data : []).map(e => [e.id, e]));
  const thisCaseSurgicalSpecimens = patchedSpecimens.filter(s => isSurgicalSpecimen(s, dictById));

  if (thisCaseSurgicalSpecimens.length > 0) {
    const allCasesRes = await caseRouter.getAll();
    if (allCasesRes.ok) {
      const otherPatientSpecimens: SurgicalBiopsySpecimenInfo[] = [];
      for (const c of allCasesRes.data) {
        if (c.id === caseId || c.patient?.id !== freshCase.patient?.id) continue;
        for (const sp of c.specimens ?? []) {
          if (!isSurgicalSpecimen(sp, dictById)) continue;
          const info = toBiopsySpecimenInfo(c.id, sp);
          if (info) otherPatientSpecimens.push(info);
        }
      }

      const thisCaseInfos = thisCaseSurgicalSpecimens
        .map(s => toBiopsySpecimenInfo(caseId, s))
        .filter((s): s is SurgicalBiopsySpecimenInfo => s !== undefined);

      const candidates = resolveSurgicalBiopsyToResectionCorrelationCandidates(
        [...thisCaseInfos, ...otherPatientSpecimens],
      );

      // Real, deliberate scope: only ever write NEW candidates onto
      // THIS case's own specimens — a historical other-patient case
      // already had its own chance to detect and record this same
      // pair from its own sign-out, matching CytologyScreeningPage.tsx's
      // own "update only the current specimen" convention exactly.
      const relevantToThisCase = candidates.filter(c => c.earlierCaseId === caseId || c.laterCaseId === caseId);
      if (relevantToThisCase.length > 0) {
        const now = new Date().toISOString();
        patchedSpecimens = patchedSpecimens.map(s => {
          const ownCandidates = relevantToThisCase.filter(c =>
            (c.earlierCaseId === caseId && c.earlierSpecimenId === s.id) ||
            (c.laterCaseId === caseId && c.laterSpecimenId === s.id),
          );
          if (ownCandidates.length === 0) return s;
          const existing = s.surgicalPeerReview?.biopsyToResectionCandidates ?? [];
          const newEntries = ownCandidates
            .map(c => {
              const isEarlier = c.earlierCaseId === caseId && c.earlierSpecimenId === s.id;
              const candidateCaseId = isEarlier ? c.laterCaseId : c.earlierCaseId;
              const candidateSpecimenId = isEarlier ? c.laterSpecimenId : c.earlierSpecimenId;
              return { candidateCaseId, candidateSpecimenId, detectedAt: now, siteMatchStatus: c.siteMatchStatus };
            })
            .filter(n => !existing.some(e => e.candidateCaseId === n.candidateCaseId && e.candidateSpecimenId === n.candidateSpecimenId));
          if (newEntries.length === 0) return s;
          changed = true;
          return {
            ...s,
            surgicalPeerReview: { ...s.surgicalPeerReview, biopsyToResectionCandidates: [...existing, ...newEntries] },
          };
        });
      }
    }
  }

  if (changed) {
    try {
      await caseRouter.updateCase(caseId, { specimens: patchedSpecimens });
    } catch (e) {
      console.error('[PS-324] Could not persist surgical post-sign-out QA flags — a real, non-blocking background write, never the sign-out itself:', e);
    }
  }
}
