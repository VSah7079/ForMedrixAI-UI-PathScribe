// src/components/Config/AI/resolveVoiceAiModel.ts
// ─────────────────────────────────────────────────────────────
// Real fix, built alongside the ForMedrixAI store work: voice
// dictation refinement was a hardcoded 'gemini-2.0-flash-lite'
// string constant in VoiceProvider.tsx, completely disconnected from
// the AIModel catalog and its validation-study governance. This is
// the voice-specific mirror of resolveClientAiModel.ts's proven
// hard-block philosophy — deliberately a separate, simpler file
// rather than folding voice into that one, for a real reason: voice
// is a deployment-wide setting (VoiceSection.tsx's own words —
// "enables or disables voice ... for this client deployment", i.e.
// the whole app instance), not resolved per ordering-client the way
// a case's report-generation model is. There is no per-lab voice
// override to resolve here, only an org-wide default.
//
// Same absolute-block posture as the report-model equivalent, same
// reason: an accidental or unvalidated voice-model change on a live
// clinical deployment is a real liability concern, not just a UX one.
// ─────────────────────────────────────────────────────────────

import { modelService } from '../../../services';
import { mockValidationStudyService as validationStudyService } from '../../../services/validationStudies/mockValidationStudyService';
import type { AiProviderConfig } from './aiProviderConfig';

/**
 * The hard-block check for voice models: does this model have at
 * least one completed, PASS-graded validation study behind it?
 * Deliberately not client-scoped (unlike hasPassingValidationForModel
 * in resolveClientAiModel.ts) — voice isn't resolved per ordering
 * client, so "was this validated for client X" isn't the right
 * question here; "was this validated at all" is.
 */
export async function hasPassingValidationForVoiceModel(modelId: string): Promise<boolean> {
  const res = await validationStudyService.getAll();
  if (!res.ok) return false;
  return res.data.some(s =>
    s.modelId === modelId &&
    s.status === 'reported' &&
    s.finalGrade === 'PASS'
  );
}

/** Whether the Models tab may make this model the organisation's
 *  default. A voice model goes live the moment it becomes the default
 *  (there is no per-facility voice override), so the validation hard block
 *  applies here; a report-generation model's gate is the per-facility
 *  override instead (resolveClientAiModel.ts), so its default is free. */
export async function canBecomeDefault(model: { id: string; type: string }): Promise<boolean> {
  if (model.type !== 'Voice Dictation') return true;
  return hasPassingValidationForVoiceModel(model.id);
}

/** Every Voice Dictation model in the catalog with at least one
 *  passing, reported validation study — the real, enforced list an
 *  admin is allowed to set as the active voice model. Mirrors
 *  getEligibleModelIdsForClient's own reasoning: showing an
 *  unvalidated model here would just move the accidental-adoption
 *  risk from "can't select it" to "can see it and be tempted to
 *  anyway." */
export async function getEligibleVoiceModelIds(): Promise<string[]> {
  const modelsRes = await modelService.getAll();
  if (!modelsRes.ok) return [];
  const voiceModelIds = new Set(
    modelsRes.data.filter(m => m.type === 'Voice Dictation').map(m => m.id as string)
  );
  const studiesRes = await validationStudyService.getAll();
  if (!studiesRes.ok) return [];
  const passing = studiesRes.data.filter(s =>
    voiceModelIds.has(s.modelId) && s.status === 'reported' && s.finalGrade === 'PASS'
  );
  return Array.from(new Set(passing.map(s => s.modelId)));
}

/**
 * Effective resolution for "which model does voice dictation
 * refinement actually call right now" — the org-wide default within
 * the Voice Dictation group (see mockModelService.ts's type-aware
 * setDefault()/getDefaultVoiceModel()). No per-client override layer,
 * matching voice's genuinely deployment-wide scope.
 */
export async function resolveVoiceAiModelId(): Promise<string | null> {
  const defaultRes = await modelService.getDefaultVoiceModel();
  return defaultRes.ok ? (defaultRes.data?.id ?? null) : null;
}

/**
 * Turns the resolved voice model into the literal request-shape
 * config a provider needs to actually call it — same connective
 * purpose as resolveAiConfigOverrideForClient for report models.
 * Returns null (rather than throwing) whenever resolution can't
 * complete, so a missing/misconfigured voice model fails safe to
 * "voice AI refinement unavailable" (VoiceProvider.tsx already has a
 * local-only fallback path for exactly this) rather than blocking
 * dictation outright.
 */
export async function resolveVoiceAiConfig(): Promise<Pick<AiProviderConfig, 'providerId' | 'modelId'> | null> {
  const modelId = await resolveVoiceAiModelId();
  if (!modelId) return null;
  const modelRes = await modelService.getById(modelId);
  if (!modelRes.ok) return null;
  return { providerId: modelRes.data.requestFormat, modelId: modelRes.data.apiModelId };
}
