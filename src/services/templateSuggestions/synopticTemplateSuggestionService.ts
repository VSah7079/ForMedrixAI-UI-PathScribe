// src/services/templateSuggestions/synopticTemplateSuggestionService.ts

import { callAi } from '../aiIntegration/aiProviderService';
import { resolveAiConfigOverrideForClient } from '../../components/Config/AI/resolveClientAiModel';
import type {
  SynopticSuggestionInput,
  SynopticSuggestionResult,
  SynopticTemplateSuggestion,
} from './ISynopticTemplateSuggestionService';

const DEFAULT_CONFIDENCE_THRESHOLD = 60;

export async function suggestSynopticTemplates(
  input: SynopticSuggestionInput
): Promise<SynopticSuggestionResult> {
  const warnings: string[] = [];
  const threshold = input.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const templateNameById = new Map(input.availableTemplates.map(t => [t.id, t.name]));

  if (input.availableTemplates.length === 0) {
    warnings.push('No candidate templates were provided — cannot suggest anything without real template IDs to ground against.');
    return { suggestions: [], warnings };
  }

  if (input.specimens.length === 0) {
    return { suggestions: [], warnings };
  }

  const templateList = input.availableTemplates.map(t => {
    const sites = t.applicability?.specimenSites?.join(', ') ?? '—';
    const types = t.applicability?.specimenTypes?.join(', ') ?? '—';
    return `- ${t.id} | ${t.name}\n  Category: ${t.category}${t.standard ? ` | Standard: ${t.standard}` : ''}\n  Applies to specimen site(s): ${sites} | specimen type(s): ${types}${t.applicability?.note ? `\n  Note: ${t.applicability.note}` : ''}`;
  }).join('\n\n');

  const specimenBlocks = input.specimens.map(spec => {
    const detailLines = [
      spec.specimenType ? `  Specimen type (procedure category): ${spec.specimenType}` : null,
      spec.bodySite ? `  Body site: ${spec.bodySite}` : null,
      spec.laterality ? `  Laterality: ${spec.laterality}` : null,
    ].filter(Boolean).join('\n');
    return `SPECIMEN ${spec.specimenId} (${spec.specimenLabel}): ${spec.specimenDesc ?? '—'}${detailLines ? '\n' + detailLines : ''}`;
  }).join('\n\n');

  const prompt = `You are a pathology AI assistant suggesting which diagnostic synoptic report template best fits each specimen below, so a pathologist can review and confirm — you are NOT making the final selection, only proposing one with a confidence score.

CLINICAL INDICATION: ${input.clinicalIndication || '—'}

${specimenBlocks}

CANDIDATE SYNOPTIC TEMPLATES (use ONLY these IDs — never invent one not in this list):
${templateList}

Match primarily on specimen site (e.g. "Thyroid", "Salivary Gland") against each template's "Applies to specimen site(s)" — the specimen type/procedure category alone (e.g. "FNA") is not specific enough on its own, since multiple templates can share the same procedure category but apply to completely different sites.

Return ONLY a JSON array (no markdown, no preamble). Include an entry ONLY for specimens where a template genuinely fits — if no candidate template is a reasonable match for a specimen, omit that specimen entirely rather than forcing a low-confidence guess. Shape exactly as:
[
  {
    "specimenId": "...",
    "templateId": "...",
    "reason": "short plain-language justification referencing the specific specimen detail that matched",
    "confidence": 0-100
  }
]`;

  try {
    const { text: raw } = await callAi({
      system: 'You are a pathology AI assistant. You return only valid JSON — no markdown, no preamble.',
      prompt,
      configOverride: await resolveAiConfigOverrideForClient(input.facilityId),
    });
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as Array<{
      specimenId: string;
      templateId: string;
      reason: string;
      confidence: number;
    }>;

    const suggestions: SynopticTemplateSuggestion[] = [];
    for (const p of parsed) {
      if (!templateNameById.has(p.templateId)) {
        warnings.push(`AI proposed templateId "${p.templateId}" for specimen ${p.specimenId}, which is not in the candidate list — discarded.`);
        continue;
      }
      if (p.confidence < threshold) {
        warnings.push(`Suggestion for specimen ${p.specimenId} (${templateNameById.get(p.templateId)}, confidence ${p.confidence}) was below the ${threshold}% threshold — no suggestion returned for this specimen. Original reasoning: ${p.reason}`);
        continue;
      }
      suggestions.push({
        specimenId: p.specimenId,
        templateId: p.templateId,
        templateName: templateNameById.get(p.templateId)!,
        confidence: p.confidence,
        reason: p.reason,
      });
    }

    return { suggestions, warnings };
  } catch (e) {
    console.error('[PathScribe] Synoptic template suggestion failed:', e);
    warnings.push(`Synoptic template suggestion failed (${(e as Error)?.message ?? 'unknown error'}) — no suggestions returned; manual template selection is unaffected.`);
    return { suggestions: [], warnings };
  }
}
