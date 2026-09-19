/// <reference types="vite/client" />
/** Semantic version string from package.json, injected by vite.config.ts define. */
declare const __APP_VERSION__: string;

// Real, direct follow-up (PS-61): all 22 real VITE_* env vars actually read
// anywhere in src/ (confirmed via grep, not assumed — see this ticket's own
// history for the exact count) were previously untyped, so a typo'd or
// renamed var name compiled clean and silently read as undefined at
// runtime. Standard Vite pattern: augment ImportMetaEnv here so tsc catches
// that instead. Every one of these is genuinely optional at the type level
// (string | undefined) — every real call site already reads them
// defensively (?? 'default', === 'true', etc.), so typing them as
// non-optional would be dishonest and would just force new `!` assertions
// at each site instead of reflecting how they're actually used.
interface ImportMetaEnv {
  readonly VITE_AI_API_KEY?: string;
  readonly VITE_AI_CUSTOM_ENDPOINT?: string;
  readonly VITE_AI_DEV_MODE?: string;
  readonly VITE_AI_GATEWAY_REGION?: string;
  readonly VITE_AI_MANAGED_DEPLOYMENT?: string;
  readonly VITE_AI_MANAGED_ENDPOINT?: string;
  readonly VITE_AI_MAX_TOKENS?: string;
  readonly VITE_AI_MODEL?: string;
  readonly VITE_AI_PROVIDER?: string;
  readonly VITE_AI_PROXY_URL?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_BABAKHANI_EMAIL?: string;
  readonly VITE_CPT_PROXY_URL?: string;
  readonly VITE_ENHANCEMENT_EMAIL?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_ICD10_PROXY_URL?: string;
  readonly VITE_NLM_BASE_URL?: string;
  readonly VITE_QA_ADMIN_CC?: string;
  readonly VITE_QA_EMAIL?: string;
  readonly VITE_QA_ENABLED?: string;
  readonly VITE_VOICE_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}