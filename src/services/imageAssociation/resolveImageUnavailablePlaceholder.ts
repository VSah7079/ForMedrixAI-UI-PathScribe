// src/services/imageAssociation/resolveImageUnavailablePlaceholder.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the spec's own §4.3 (Error Handling & Visual Placeholders):
// "If both primary and fallback URLs fail to resolve during report
// generation, Pathscribe MUST insert an explicit, non-destructive
// inline error indicator in the report (e.g., 'Image Unavailable -
// Server Unreachable: [Asset ID]') without halting the execution of
// the entire Orchestration pipeline."
//
// Pure — real, per the spec's own worked example wording, kept exact
// rather than paraphrased, since a report-embedded placeholder is
// real, patient-facing/clinical-record text a reviewer will read
// literally.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveImageUnavailablePlaceholder(assetId: string): string {
  return `Image Unavailable - Server Unreachable: [${assetId}]`;
}
