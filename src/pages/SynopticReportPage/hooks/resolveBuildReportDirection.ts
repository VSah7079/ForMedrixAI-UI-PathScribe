// src/pages/SynopticReportPage/hooks/resolveBuildReportDirection.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed correction (twice over):
// first, "Gross Complete" was the wrong trigger point (too late — the
// work's already done); second, a single auto-detecting "Build
// Report" action was itself the wrong shape — it silently does
// nothing when both sides already have content, and gives the user no
// way to explicitly ask for one direction regardless of what's
// currently filled in. Two separate, explicitly user-triggered
// actions instead (PS-274: narrative -> synoptic; PS-275: synoptic ->
// narrative) — this file is just the real, pure "is there enough
// real content to make this specific action worth offering" check for
// each one, used to enable/disable each action's own real control
// independently, never to pick between them.
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildReportAvailability {
  canSuggestSynopticFromNarrative: boolean;
  canGenerateNarrativeFromSynoptic: boolean;
}

export interface BuildReportInputs {
  caseText: { gross: string; microscopic: string; ancillary: string };
  synopticAnswers: Record<string, unknown>;
}

/** Real, per direct guidance's own confirmed design. A real,
 *  non-empty narrative is any of gross/microscopic/ancillary having
 *  real, non-whitespace content. A real, non-empty synoptic is the
 *  answers object having at least one real, own key — deliberately
 *  never inspecting individual answer values (a field's own value
 *  could legitimately be an empty string/false/0), just whether
 *  anything has been answered at all. The two real checks are
 *  independent — both can be true at once, and both actions stay
 *  available; a real user re-running "Suggest Synoptic" after editing
 *  the narrative further, even though synoptic answers already exist
 *  from an earlier pass, is a real, legitimate use, not an error
 *  state to block. */
export function resolveBuildReportAvailability(inputs: BuildReportInputs): BuildReportAvailability {
  const hasNarrative = Boolean(
    inputs.caseText.gross.trim() || inputs.caseText.microscopic.trim() || inputs.caseText.ancillary.trim(),
  );
  const hasSynoptic = Object.keys(inputs.synopticAnswers).length > 0;

  return {
    canSuggestSynopticFromNarrative: hasNarrative,
    canGenerateNarrativeFromSynoptic: hasSynoptic,
  };
}
