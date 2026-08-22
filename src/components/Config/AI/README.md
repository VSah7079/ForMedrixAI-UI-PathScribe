# components/Config/AI/

Admin-facing AI configuration: which provider/model PathScribe calls, and
the higher-level "AI Behavior" tab it lives inside (confidence thresholds,
orchestrator generation steps).

**Pattern:** `aiProviderConfig.ts` is the config/resolution layer (no React);
everything else is UI over it.

## Files

- **`aiProviderConfig.ts`** — Defines supported providers and per-provider
  model lists. 3-tier resolution: user override (localStorage, dev-only) →
  org setting → env default. API keys never live in the browser in
  production — routed through `/api/ai-proxy`; only populated locally when
  `VITE_AI_DEV_MODE=true`. **Real rename, this pass:** `AiProviderId`
  values (an internal type, never shown to users) are now named for their
  real request/response protocol shape rather than the vendor —
  `structured_messages` (Anthropic-shaped), `chat_completions` (OpenAI-
  shaped), `chat_completions_managed` (same shape, deployment-routed),
  `model_gateway` (multi-model hosting platform), `structured_content`
  (Gemini-shaped) — plus `mock`/`custom`, unchanged since they were already
  vendor-neutral. Deliberate decision: internal code (this type, function/
  class names, file names) is protocol-shape-named; the admin config UI
  (`AiProviderSettings.tsx`) and `PROVIDER_MODELS`' labels still show real
  vendor/model names, since an admin picking a provider needs to know
  which real account/contract they're configuring. `structured_content`
  (Gemini) was added as a formal, selectable provider in the same pass
  that introduced this renaming — previously used elsewhere in the app
  (`services/aiIntegration/PathScribeAIService.ts`'s real, working
  `callAi()`-based implementation) but never actually selectable here.
  Matches the real, already-configured proxy route in `vite.config.ts`.
- **`AiProviderSettings.tsx`** — Admin config UI (`isAdmin=true`) and dev
  override UI (`isAdmin=false`), same component. Has a defensive fallback
  to `'structured_messages'` if a stored `providerId` is no longer a
  recognised key (e.g. after a host migration corrupts localStorage) —
  displays as "Anthropic (Claude)" per `PROVIDER_LABELS`, real vendor name
  shown even though the underlying type value is protocol-shape-named.
- **`orchestratorModeConfig.ts`** (+ `orchestratorModeConfig.test.ts`) —
  **NEW (July 2026).** Real source of
  truth for "is AI Orchestrator narrative auto-draft on." Two layers,
  same null-means-inherit convention as `Facility.tatFirstTouchHours`/
  `jurisdiction`: an org-wide default (persisted, admin-editable here) and
  a per-facility override (`Facility.internalAiOrchestratorEnabled`,
  resolved via `resolvePerformingLabFacilityId()`,
  `services/facilities/IFacilityService.ts`). Replaces two previously
  disconnected, non-functional mechanisms — see its own header and Notes
  below.
- **`OrchestratorConfigSection.tsx`** — AI-generation step config, reframed
  from the old "Narrative Templates" tab (confirmed dead, deleted — see
  Notes). **FIXED this pass:** the ON/OFF badge used to read a static
  `orchestratorEnabled: true` literal directly off `narrativeTemplateConfig`
  — now a real, clickable admin toggle backed by `orchestratorModeConfig.ts`,
  with an explanatory note that internal facilities (labs) can override it
  individually in Facility Configuration.
- **`index.tsx`** — `AITab`, the top-level AI Behavior tab. Mounts
  `AiProviderSettings`, `OrchestratorConfigSection`, and (via prop)
  `ModelsPanel`. Own `useIsAdmin()` reads role directly from
  `localStorage['pathscribe_current_user']` rather than `useAuth()`/
  `AuthContext` (used elsewhere, e.g. `TemplateRenderer.tsx`) — not
  necessarily wrong, but an inconsistency worth knowing about if this file
  is touched again.
- **`resolveVoiceAiModel.ts`** — **NEW.** Voice-specific mirror of
  `resolveClientAiModel.ts`'s hard-block philosophy: `hasPassingValidationForVoiceModel()`
  is the real gate, `resolveVoiceAiConfig()` turns the resolved model into
  the literal `{providerId, modelId}` `callAi()` needs. Deliberately
  simpler than the report-model version — org-wide default only, no
  per-client override layer, since voice is a genuinely deployment-wide
  setting (`Config/System/VoiceSection.tsx`'s own words), not resolved
  per ordering-client the way a case's report-generation model is.

## Notes

- **RESOLVED (was "needs verification"):** confirmed via full-repo grep —
  `NarrativeTemplatesTab` (the old tab component) had zero importers
  anywhere in `src/`. Deleted it, along with its two sole consumers
  `SectionList.tsx`/`SectionEditor.tsx`. `narrativeTemplateConfig.ts` (the
  data) stays — still real, still consumed by `orchestratorEngine.ts` and
  this folder's `OrchestratorConfigSection.tsx`.
- **Real bug found and fixed in the same pass:** the only code that ever
  *wrote* the orchestrator-mode localStorage key lived inside that dead
  tab — meaning there was previously no live way for anyone to actually
  toggle Orchestrator Mode, despite two separate mechanisms appearing to
  read one. See `orchestratorModeConfig.ts`'s header for the full history.
- Model IDs in `PROVIDER_MODELS.structured_messages` match the `.env`/
  `AIProviderRegistry.ts` fix already made (`claude-sonnet-4-6` present).
- **Vendor names removed from internal code, this pass:** per a direct
  request, `AiProviderId` values, function/class names, and two file names
  (`ClaudeProvider.ts` → `services/ai/providers/StructuredMessagesProvider.ts`,
  and a test file) across this folder and `services/aiIntegration/`,
  `services/ai/` were renamed from vendor names to protocol-shape names.
  Deliberately NOT applied to: the admin UI's displayed labels/model names
  (functionally necessary for an admin to know which real account they're
  configuring), the NavBar "System Info" diagnostic panel's displayed
  labels (same reasoning — real vendor identity matters for support/
  troubleshooting), the config search index's synonyms (admins search for
  the real vendor name), or comments explaining real, documented vendor
  API behavior.

---
*See [components/Config/README.md](../README.md) for how this folder fits Config/.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master components/README.md or Config/README.md if this folder's overall PURPOSE changes.*
