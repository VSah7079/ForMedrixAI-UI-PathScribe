// src/pages/SynopticReportPage/hooks/buildReviewFieldsFromAiSuggestions.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed, foundational gap (PS-274):
// suggestSynopticFields() (services/aiIntegration/) and AiReviewModal.tsx
// (confidence-badge review UI) were both already real and live, but
// nothing in the app ever connected them — reviewFields, AiReviewModal's
// own data source, was declared as state and never populated anywhere.
// This is that missing connection's own pure transform: given the raw
// AiFieldSuggestionResult map suggestSynopticFields() returns and the
// real EditorTemplate whose fields were suggested against, builds the
// real ReviewField[] AiReviewModal.tsx already expects and already
// knows how to render — never a second, parallel review UI.
//
// Real, deliberate scope: kept as its own pure function, no React
// state, no AI call itself — the real caller (a hook/handler in
// SynopticReportPage.tsx) does the actual suggestSynopticFields() call
// and setReviewFields(...); this only does the honest, testable shape
// transform in between.
// ─────────────────────────────────────────────────────────────────────────────

import type { EditorTemplate } from '@/components/Config/Protocols/SynopticEditor';
import type { AiFieldSuggestionResult } from '@/services/aiIntegration/IAIIntegrationService';
import type { ReviewField } from '../modals/AiReviewModal';
import { matchSourceText } from '../../../utils/sourceTextMatching';
import type { Case } from '@/types/case/Case';

export function buildReviewFieldsFromAiSuggestions(
  suggestions: Record<string, AiFieldSuggestionResult>,
  template: EditorTemplate,
  caseData: Case | null,
): ReviewField[] {
  const reviewFields: ReviewField[] = [];

  for (const section of template.sections) {
    for (const field of section.fields) {
      const suggestion = suggestions[field.id];
      if (!suggestion) continue;

      const match = matchSourceText(suggestion.source, caseData);

      reviewFields.push({
        fieldId: field.id,
        fieldLabel: field.label,
        sectionTitle: section.title,
        aiValue: suggestion.value,
        confidence: suggestion.confidence,
        source: suggestion.source,
        verification: 'unverified',
        sourceNotFound: !match.found,
      });
    }
  }

  return reviewFields;
}
