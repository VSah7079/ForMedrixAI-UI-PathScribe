// src/services/quality/resolveSurgicalBiopsyToResectionCorrelationCandidates.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-324. The real surgical-pathology analog of
// resolveCytologyHistologyCorrelationCandidates.ts (Cyto-Histo
// Correlation) — same real "automate the disciplined, mechanical part;
// never fake the analytical part" boundary: this finds WHICH pairs of a
// patient's own surgical specimens are plausible biopsy-to-resection
// correlation candidates (same patient, real time window), leaving the
// actual diagnosis comparison and outcome to a real human reviewer, who
// records it via a real QaActivityType (mirroring qa-activity-cyto-
// histo's own real pattern) once a candidate surfaces it.
//
// Real, deliberate difference from the cytology version: this ticket's
// own research (international post-sign-out QA survey) named anatomic
// site/laterality as a real, necessary filter surgical matching needs
// that cytology's own version never had to consider (a Pap smear has no
// meaningful "site" beyond "cervix"). Confirmed directly before
// building: Case.ts has no case-level site field; Specimen.collection.
// bodySite/laterality (types/case/Specimen.ts) are free-text, optional,
// per-specimen fields — genuinely useful but genuinely unreliable for
// an exact-string match (inconsistent phrasing, frequently blank).
//
// Real, deliberate design: a HARD site mismatch (both specimens have a
// real, normalized site recorded, and they genuinely differ) excludes a
// pair — that's exactly the false-positive prevention this ticket's own
// research asked for (an unrelated colon resection should never surface
// as a candidate for a breast biopsy). But when either specimen is
// missing site data, the pair is NOT excluded — real, missing data is
// not evidence of a real mismatch, and excluding it would silently
// create false negatives (a genuine correlation missed) instead of
// preventing false positives. Every candidate carries its own real
// `siteMatchStatus` so a human reviewer can see and prioritize by it,
// rather than either being silently dropped or silently trusted.
//
// Unlike the cytology version, this has no diagnostic-rank-style
// trigger threshold — Case.diagnostic.primaryDiagnosis is free text
// with no structured severity signal (confirmed by the cytology
// version's own header comment, still true here), so there is no
// honest way to pre-filter "was this biopsy significant enough to
// bother correlating." Every same-patient, in-window, non-site-
// mismatched specimen pair is a real, mechanical candidate — the human
// reviewer is exactly where "was this actually worth correlating" gets
// decided, same real boundary as Cyto-Histo Correlation's own design.
// ─────────────────────────────────────────────────────────────────────────────

export type SurgicalSiteMatchStatus = 'matched' | 'mismatched' | 'unknown';

export interface SurgicalBiopsySpecimenInfo {
  caseId: string;
  specimenId: string;
  receivedAt: string;
  bodySite?: string;
  laterality?: string;
}

export interface SurgicalBiopsyToResectionCorrelationCandidate {
  earlierCaseId: string;
  earlierSpecimenId: string;
  laterCaseId: string;
  laterSpecimenId: string;
  /** Real, per this file's own header: whether the two specimens'
   *  recorded anatomic site/laterality actually agree, disagree, or
   *  couldn't be compared at all because one or both are missing. */
  siteMatchStatus: SurgicalSiteMatchStatus;
}

function normalizeSiteText(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

function resolveSiteMatchStatus(a: SurgicalBiopsySpecimenInfo, b: SurgicalBiopsySpecimenInfo): SurgicalSiteMatchStatus {
  const siteA = normalizeSiteText(a.bodySite);
  const siteB = normalizeSiteText(b.bodySite);
  if (!siteA || !siteB) return 'unknown';
  if (siteA !== siteB) return 'mismatched';

  const lateralityA = normalizeSiteText(a.laterality);
  const lateralityB = normalizeSiteText(b.laterality);
  if (lateralityA && lateralityB && lateralityA !== lateralityB) return 'mismatched';

  return 'matched';
}

/**
 * Real, per direct guidance (PS-324): finds every plausible biopsy-to-
 * resection correlation candidate pair within one patient's own
 * surgical specimens. `patientSpecimens` must already be scoped to a
 * single real patient by the caller — this function has no patient
 * identity of its own to check, matching resolveCytologyHistology
 * CorrelationCandidates.ts's own "already-filtered input" convention.
 * A hard site mismatch excludes a pair; missing site data never does —
 * see this file's own header for why.
 */
export function resolveSurgicalBiopsyToResectionCorrelationCandidates(
  patientSpecimens: SurgicalBiopsySpecimenInfo[],
  windowDays = 180,
): SurgicalBiopsyToResectionCorrelationCandidate[] {
  const candidates: SurgicalBiopsyToResectionCorrelationCandidate[] = [];
  const sorted = [...patientSpecimens].sort(
    (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
  );

  for (let i = 0; i < sorted.length; i++) {
    const earlier = sorted[i];
    const earlierDate = new Date(earlier.receivedAt);
    const windowEnd = new Date(earlierDate);
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    for (let j = i + 1; j < sorted.length; j++) {
      const later = sorted[j];
      if (later.caseId === earlier.caseId) continue; // a real correlation is across two different cases/encounters

      const laterDate = new Date(later.receivedAt);
      if (laterDate > windowEnd) break; // sorted ascending — every subsequent specimen is even further out

      const siteMatchStatus = resolveSiteMatchStatus(earlier, later);
      if (siteMatchStatus === 'mismatched') continue;

      candidates.push({
        earlierCaseId: earlier.caseId,
        earlierSpecimenId: earlier.specimenId,
        laterCaseId: later.caseId,
        laterSpecimenId: later.specimenId,
        siteMatchStatus,
      });
    }
  }

  return candidates;
}
