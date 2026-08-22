// src/components/Config/AI/aiProviderConfig.ts
// ─────────────────────────────────────────────────────────────
// Defines which AI providers PathScribe supports and how to
// resolve the active config at runtime.
//
// Priority order (highest wins):
//   1. User-level override (localStorage, dev/testing only)
//   2. Org-level setting   (fetched from your admin API / Firestore)
//   3. Environment variable defaults (set at deploy time)
//
// Keys NEVER live in the browser in production. The browser sends
// requests to /api/ai-proxy, which injects the key server-side.
// The apiKey field here is only populated in local dev mode where
// VITE_AI_DEV_MODE=true and VITE_AI_API_KEY is set.
// ─────────────────────────────────────────────────────────────

export type AiProviderId =
  | 'structured_messages'     // Anthropic-shaped: system as a separate field, SSE content_block_delta streaming
  | 'chat_completions'        // OpenAI-shaped: messages array with system role, /chat/completions
  | 'chat_completions_managed'// Same body shape as chat_completions, deployment-name + resource-endpoint routing
  | 'model_gateway'           // Multi-model hosting platform: region + modelId routing, wraps multiple underlying formats
  | 'structured_content'      // Gemini-shaped: contents/parts array, separate systemInstruction field
  | 'mock'        // Demo / offline testing — no API calls
  | 'custom';

// ─── Per-provider model options ───────────────────────────────
// Labels here are shown directly in the admin configuration dropdown
// (AiProviderSettings.tsx) — kept as real vendor/model names deliberately,
// since an admin picking a model needs to know which real model their
// actual account/contract covers. Only the AiProviderId keys above (an
// internal type, never shown to users) are protocol-shape-named.

export const PROVIDER_MODELS: Record<AiProviderId, { id: string; label: string }[]> = {
  structured_messages: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4 (recommended)' },
    { id: 'claude-opus-4-8',   label: 'Claude Opus 4 (highest accuracy)' },
    { id: 'claude-haiku-4-5',label: 'Claude Haiku 4.5 (fastest)' },
  ],
  chat_completions: [
    { id: 'gpt-4o',        label: 'GPT-4o (recommended)' },
    { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
    { id: 'gpt-4',         label: 'GPT-4' },
  ],
  chat_completions_managed: [
    { id: 'gpt-4o',      label: 'GPT-4o (Azure)' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo (Azure)' },
  ],
  model_gateway: [
    { id: 'anthropic.claude-sonnet-4-6-v1:0', label: 'Claude Sonnet 4 via Bedrock' },
    { id: 'anthropic.claude-opus-4-8-v1:0',   label: 'Claude Opus 4 via Bedrock' },
    { id: 'amazon.nova-pro-v1:0',                    label: 'Amazon Nova Pro' },
  ],
  structured_content: [
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (recommended)' },
    { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro (highest accuracy)' },
  ],
  mock: [
    { id: 'mock-v1', label: 'Mock (instant, no API cost — demo only)' },
  ],
  custom: [
    { id: 'custom', label: 'Custom model (set in endpoint config)' },
  ],
};

// ─── Config shape ─────────────────────────────────────────────

export interface AiProviderConfig {
  /** Which provider to use */
  providerId: AiProviderId;

  /** Model ID — must be valid for the chosen provider */
  modelId: string;

  /**
   * Only for chat_completions_managed: your deployment name.
   * e.g. 'my-gpt4-deployment'
   */
  managedDeploymentName?: string;

  /**
   * Only for chat_completions_managed: your resource endpoint.
   * e.g. 'https://my-org.openai.azure.com'
   */
  managedEndpoint?: string;

  /**
   * Only for model_gateway: hosting region.
   * e.g. 'us-east-1'
   */
  gatewayRegion?: string;

  /**
   * Only for custom: full base URL of the OpenAI-compatible endpoint.
   * e.g. 'https://my-llm.hospital.internal/v1'
   */
  customEndpoint?: string;

  /**
   * LOCAL DEV ONLY — populated from VITE_AI_API_KEY when
   * VITE_AI_DEV_MODE=true. Never set this in production.
   */
  apiKey?: string;

  /**
   * In production, all AI calls are routed through your backend proxy
   * so the real API key never reaches the browser.
   * Set VITE_AI_PROXY_URL to your proxy base, e.g. '/api/ai'
   */
  proxyUrl?: string;

  /** Max tokens for completions (default 1000) */
  maxTokens?: number;
}

// ─── Environment-variable defaults ───────────────────────────
// Set these in your .env / deployment config.
// VITE_ prefix makes them available to the Vite build.
//
//   VITE_AI_PROVIDER=structured_messages   # structured_messages | chat_completions | chat_completions_managed | model_gateway | structured_content | mock | custom
//   VITE_AI_MODEL=claude-sonnet-4-6
//   VITE_AI_PROXY_URL=/api/ai
//   VITE_AI_DEV_MODE=true          # enables direct browser→API calls
//   VITE_AI_API_KEY=sk-ant-...     # only used when DEV_MODE=true
//   VITE_AI_MANAGED_ENDPOINT=https://...
//   VITE_AI_MANAGED_DEPLOYMENT=...
//   VITE_AI_GATEWAY_REGION=us-east-1
//   VITE_AI_CUSTOM_ENDPOINT=https://...

function envDefaults(): AiProviderConfig {
  const providerId = (import.meta.env.VITE_AI_PROVIDER ?? 'structured_messages') as AiProviderId;
  const isDevMode  = import.meta.env.VITE_AI_DEV_MODE === 'true';

  return {
    providerId,
    modelId:              import.meta.env.VITE_AI_MODEL ?? PROVIDER_MODELS[providerId]?.[0]?.id ?? 'claude-sonnet-4-6',
    proxyUrl:             import.meta.env.VITE_AI_PROXY_URL ?? '/api/ai',
    apiKey:               isDevMode ? (import.meta.env.VITE_AI_API_KEY ?? '') : undefined,
    managedDeploymentName:import.meta.env.VITE_AI_MANAGED_DEPLOYMENT,
    managedEndpoint:      import.meta.env.VITE_AI_MANAGED_ENDPOINT,
    gatewayRegion:        import.meta.env.VITE_AI_GATEWAY_REGION ?? 'us-east-1',
    customEndpoint:       import.meta.env.VITE_AI_CUSTOM_ENDPOINT,
    maxTokens:            Number(import.meta.env.VITE_AI_MAX_TOKENS ?? 1000),
  };
}

// ─── Org-level config (loaded from your admin API / Firestore) ─
// Shape of the document stored in your org settings collection.
export interface OrgAiConfig {
  providerId: AiProviderId;
  modelId: string;
  managedDeploymentName?: string;
  managedEndpoint?: string;
  gatewayRegion?: string;
  customEndpoint?: string;
  maxTokens?: number;
  // Note: API keys are NEVER stored here — they live in your backend secrets manager
}

// ─── Storage keys ─────────────────────────────────────────────
const USER_OVERRIDE_KEY = 'pathscribe_ai_user_config';
const ORG_CONFIG_KEY    = 'pathscribe_ai_org_config';   // populated by your auth/org bootstrap

// ─── Config resolution ────────────────────────────────────────

/**
 * The full, real set of request-shape identifiers callAi() knows how
 * to build a request for — kept as one, single source of truth so
 * this list and AiProviderSettings.tsx's own PROVIDER_MODELS keys
 * can't quietly drift apart.
 */
const VALID_PROVIDER_IDS: readonly AiProviderId[] = [
  'structured_messages', 'chat_completions', 'chat_completions_managed',
  'model_gateway', 'structured_content', 'mock', 'custom',
];

/**
 * Returns the active AI provider config, respecting the priority chain:
 *   user override > org config > env defaults
 *
 * Call this wherever you need to make an AI request.
 */
export function resolveAiConfig(): AiProviderConfig {
  const base = envDefaults();

  // Layer 2: org config (written by your org-bootstrap code after login)
  try {
    const orgRaw = localStorage.getItem(ORG_CONFIG_KEY);
    if (orgRaw) {
      const org: OrgAiConfig = JSON.parse(orgRaw);
      Object.assign(base, org);
    }
  } catch { /* corrupt storage — fall through */ }

  // Layer 1: user override (dev/testing only)
  try {
    const userRaw = localStorage.getItem(USER_OVERRIDE_KEY);
    if (userRaw) {
      const user: Partial<AiProviderConfig> = JSON.parse(userRaw);
      Object.assign(base, user);
    }
  } catch { /* corrupt storage — fall through */ }

  // Real fix, per direct report: "⚠ [PathScribe AI] Unknown provider:
  // anthropic." Confirmed directly: AiProviderSettings.tsx (the admin
  // settings SCREEN) already had a guard for exactly this — an
  // unrecognized stored providerId, falling back to
  // 'structured_messages' — but that guard only ever applied to the
  // settings screen's own DISPLAY. This function is the one callAi()
  // actually calls, and it had no equivalent validation at all — a
  // stale or invalid providerId sitting in either localStorage layer
  // (org or user override) would sail through here untouched, so the
  // settings screen could look completely fine (self-healing on
  // display) while every real AI call still hit the hard error the
  // moment it tried to build a request. Same fallback, same reasoning,
  // now applied to the actual call path, not just the screen that
  // shows it.
  if (!VALID_PROVIDER_IDS.includes(base.providerId)) {
    console.warn(`[PathScribe AI] Stored providerId '${base.providerId}' isn't a real request-shape identifier — falling back to structured_messages. Check Configuration → AI Behavior.`);
    base.providerId = 'structured_messages';
  }

  return base;
}

/**
 * Saves a user-level override config.
 * Intended for dev/QA use — admins should configure at org level.
 */
export function setUserAiConfig(config: Partial<AiProviderConfig>): void {
  localStorage.setItem(USER_OVERRIDE_KEY, JSON.stringify(config));
}

/**
 * Saves the org-level config fetched from your backend after login.
 * Call this from your auth bootstrap / org context provider.
 */
export function setOrgAiConfig(config: OrgAiConfig): void {
  localStorage.setItem(ORG_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Clears the user-level override, reverting to org/env defaults.
 */
export function clearUserAiConfig(): void {
  localStorage.removeItem(USER_OVERRIDE_KEY);
}

/**
 * Returns true when running in local dev mode with direct API access.
 * Production must always use the proxy.
 */
export function isDevMode(): boolean {
  return import.meta.env.VITE_AI_DEV_MODE === 'true';
}
