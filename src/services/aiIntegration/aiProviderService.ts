// src/services/aiIntegration/aiProviderService.ts
// ─────────────────────────────────────────────────────────────
// Unified AI completion layer for PathScribe.
//
// All providers route through the Vite dev proxy in development,
// and through your backend proxy in production. This avoids CORS
// issues — Anthropic blocks direct browser-to-API calls entirely.
//
// Proxy config lives in vite.config.ts → server.proxy.
//
// Provider builders/parsers below are named for their real request/
// response protocol shape (structured_messages, chat_completions,
// model_gateway, structured_content) rather than the vendor, matching
// this codebase's naming convention for internal AI-provider code. The
// admin configuration UI (AiProviderSettings.tsx) still shows real
// vendor/model names, since that's what an admin actually needs to see
// to configure a real integration.
// ─────────────────────────────────────────────────────────────

import {
  resolveAiConfig,
  isDevMode,
  type AiProviderConfig,
  type AiProviderId,
} from '@/components/Config/AI/aiProviderConfig';

export interface AiCallOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
  configOverride?: Partial<AiProviderConfig>;
}

export interface AiCallResult {
  text: string;
  provider: AiProviderId;
  model: string;
}

// ─── Provider-specific request builders ──────────────────────

function buildStructuredMessagesRequest(cfg: AiProviderConfig, opts: AiCallOptions): { url: string; headers: Record<string, string>; body: object } {
  // Anthropic blocks direct browser→API calls with CORS.
  // Always route through the Vite proxy → vite.config.ts injects x-api-key server-side.
  return {
    url: '/api/ai/anthropic/v1/messages',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model:      cfg.modelId,
      max_tokens: opts.maxTokens ?? cfg.maxTokens ?? 1000,
      system:     opts.system,
      messages:   [{ role: 'user', content: opts.prompt }],
    },
  };
}

function buildChatCompletionsRequest(cfg: AiProviderConfig, opts: AiCallOptions): { url: string; headers: Record<string, string>; body: object } {
  return {
    url: '/api/ai/openai/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model:      cfg.modelId,
      max_tokens: opts.maxTokens ?? cfg.maxTokens ?? 1000,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user',   content: opts.prompt },
      ],
    },
  };
}

function buildChatCompletionsManagedRequest(cfg: AiProviderConfig, opts: AiCallOptions): { url: string; headers: Record<string, string>; body: object } {
  const devMode = isDevMode() && !!cfg.apiKey;
  const url = devMode
    ? `${cfg.managedEndpoint}/openai/deployments/${cfg.managedDeploymentName}/chat/completions?api-version=2024-02-15-preview`
    : `${cfg.proxyUrl}/azure/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (devMode) headers['api-key'] = cfg.apiKey!;
  return {
    url,
    headers,
    body: {
      max_tokens: opts.maxTokens ?? cfg.maxTokens ?? 1000,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user',   content: opts.prompt },
      ],
    },
  };
}

function buildModelGatewayRequest(cfg: AiProviderConfig, opts: AiCallOptions): { url: string; headers: Record<string, string>; body: object } {
  return {
    url: `${cfg.proxyUrl}/bedrock/invoke`,
    headers: { 'Content-Type': 'application/json' },
    body: {
      modelId:   cfg.modelId,
      region:    cfg.gatewayRegion ?? 'us-east-1',
      maxTokens: opts.maxTokens ?? cfg.maxTokens ?? 1000,
      system:    opts.system,
      prompt:    opts.prompt,
    },
  };
}

function buildCustomRequest(cfg: AiProviderConfig, opts: AiCallOptions): { url: string; headers: Record<string, string>; body: object } {
  const devMode = isDevMode() && !!cfg.apiKey;
  const base    = cfg.customEndpoint ?? cfg.proxyUrl ?? '/api/ai/custom';
  const url     = devMode ? `${base}/chat/completions` : `${cfg.proxyUrl}/custom/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (devMode && cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
  return {
    url,
    headers,
    body: {
      model:      cfg.modelId,
      max_tokens: opts.maxTokens ?? cfg.maxTokens ?? 1000,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user',   content: opts.prompt },
      ],
    },
  };
}

function buildStructuredContentRequest(cfg: AiProviderConfig, opts: AiCallOptions): { url: string; headers: Record<string, string>; body: object } {
  // Matches the real, already-configured proxy route in vite.config.ts:
  // client calls /api/ai/gemini/generate?model=..., which the proxy
  // rewrites server-side to Google's real
  // /v1beta/models/{model}:generateContent endpoint with the API key
  // injected - deliberately NOT constructing the colon-bearing URL here,
  // same reasoning as that proxy config's own comment (it confuses
  // Vite's proxy router if built client-side).
  const devMode = isDevMode() && !!cfg.apiKey;
  const url = devMode
    ? `https://generativelanguage.googleapis.com/v1beta/models/${cfg.modelId}:generateContent?key=${cfg.apiKey}`
    : `${cfg.proxyUrl}/gemini/generate?model=${cfg.modelId}`;
  return {
    url,
    headers: { 'Content-Type': 'application/json' },
    body: {
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      systemInstruction: { parts: [{ text: opts.system }] },
      generationConfig: { maxOutputTokens: opts.maxTokens ?? cfg.maxTokens ?? 1000 },
    },
  };
}

// ─── Response parsers ─────────────────────────────────────────

function parseStructuredMessagesResponse(data: any): string {
  return (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
}

function parseChatCompletionsResponse(data: any): string {
  return data.choices?.[0]?.message?.content ?? '';
}

const parseChatCompletionsManagedResponse = parseChatCompletionsResponse;
const parseCustomResponse                 = parseChatCompletionsResponse;

function parseModelGatewayResponse(data: any): string {
  if (data.content) return parseStructuredMessagesResponse(data);
  if (data.output?.message?.content?.[0]?.text) return data.output.message.content[0].text;
  return data.generation ?? data.results?.[0]?.outputText ?? '';
}

function parseStructuredContentResponse(data: any): string {
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p.text ?? '')
    .join('');
}

// ─── Main entry point ─────────────────────────────────────────

export async function callAi(opts: AiCallOptions): Promise<AiCallResult> {
  const cfg: AiProviderConfig = {
    ...resolveAiConfig(),
    ...opts.configOverride,
  };

  let request: { url: string; headers: Record<string, string>; body: object };
  let parseResponse: (data: any) => string;

  switch (cfg.providerId) {
    case 'structured_messages':
      request       = buildStructuredMessagesRequest(cfg, opts);
      parseResponse = parseStructuredMessagesResponse;
      break;
    case 'chat_completions':
      request       = buildChatCompletionsRequest(cfg, opts);
      parseResponse = parseChatCompletionsResponse;
      break;
    case 'chat_completions_managed':
      request       = buildChatCompletionsManagedRequest(cfg, opts);
      parseResponse = parseChatCompletionsManagedResponse;
      break;
    case 'model_gateway':
      request       = buildModelGatewayRequest(cfg, opts);
      parseResponse = parseModelGatewayResponse;
      break;
    case 'structured_content':
      request       = buildStructuredContentRequest(cfg, opts);
      parseResponse = parseStructuredContentResponse;
      break;
    case 'custom':
      request       = buildCustomRequest(cfg, opts);
      parseResponse = parseCustomResponse;
      break;
    default:
      // Real, deliberate defense-in-depth alongside resolveAiConfig()'s
      // own validation (aiProviderConfig.ts) — that fix catches an
      // invalid providerId from the two localStorage config layers,
      // but a configOverride (e.g. resolveAiConfigOverrideForClient,
      // built from a saved AI model record's own requestFormat) is
      // merged in AFTER that validation runs, so an invalid value from
      // THAT source would still reach here untouched. This is the one
      // place every possible source funnels through before a request
      // actually gets built, so it's the right final backstop: warn
      // and fail safe to a known-good default, rather than a hard
      // throw that breaks the entire feature the moment any layer,
      // present or future, holds a bad value.
      console.warn(`[PathScribe AI] Unknown provider '${(cfg as any).providerId}' — falling back to structured_messages.`);
      request       = buildStructuredMessagesRequest({ ...cfg, providerId: 'structured_messages' }, opts);
      parseResponse = parseStructuredMessagesResponse;
  }

  const response = await fetch(request.url, {
    method:  'POST',
    headers: request.headers,
    body:    JSON.stringify(request.body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `[PathScribe AI] ${cfg.providerId} returned ${response.status}: ${errorBody.slice(0, 200)}`
    );
  }

  const data = await response.json();
  const text = parseResponse(data);

  return { text, provider: cfg.providerId, model: cfg.modelId };
}
