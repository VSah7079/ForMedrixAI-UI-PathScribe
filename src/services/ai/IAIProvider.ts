// src/services/ai/IAIProvider.ts
// ─────────────────────────────────────────────────────────────
// AI Provider abstraction layer.
//
// All AI generation in PathScribe flows through this interface.
// The rest of the system never references a concrete provider —
// it only knows IAIProvider. This enables:
//   • Provider swapping without code changes (Claude ↔ GPT ↔ Bedrock)
//   • Mock provider for demos and offline testing (zero API cost)
//   • Audit logging at a single choke point
//   • Future multi-provider routing per facility/subspecialty
// ─────────────────────────────────────────────────────────────

export interface AIGenerationRequest {
  /** System-level instruction for the model */
  system:       string;
  /** User-facing prompt (the case context + section instruction) */
  prompt:       string;
  /** Max tokens to generate (default: 1024) */
  maxTokens?:   number;
  /** Abort signal for cancellation support */
  abortSignal?: AbortSignal;
  /** Real fix, per direct report: which report section this
   *  generation call is actually for (e.g. 'gross_description',
   *  'ancillary_and_diagnosis'). Known and available at the call
   *  site (orchestratorEngine.ts already has section.id in hand) but
   *  previously discarded before reaching the provider — forcing
   *  MockProvider.ts to guess the target section by searching for
   *  its name as literal text within the prompt, which incorrectly
   *  matched every section's shared case-context header block
   *  (e.g. the "─── GROSS DESCRIPTION ───" line is present in every
   *  prompt regardless of which section is the actual target),
   *  causing every section to resolve to the same canned text.
   *  Optional — real providers ignore it; only the mock provider
   *  needs it, since it has no real model to actually understand
   *  the prompt's own explicit "you are generating the X section"
   *  framing. */
  sectionId?:   string;
}

export interface AIGenerationResult {
  /** Full generated text (accumulated from stream or direct response) */
  text:            string;
  /** Approximate token count */
  tokensGenerated: number;
  /** Provider that generated this — recorded in audit log */
  providerId:      string;
  /** Model that generated this — recorded in audit log */
  modelId:         string;
  /** Wall-clock latency in milliseconds */
  latencyMs:       number;
}

/** Called with each streaming token as it arrives */
export type AIStreamCallback = (token: string) => void;

export interface AIConnectionTest {
  ok:        boolean;
  message:   string;
  latencyMs: number;
}

/**
 * IAIProvider — the single interface every AI backend must implement.
 *
 * Concrete implementations: StructuredMessagesProvider, MockProvider.
 * Resolved at runtime by AIProviderRegistry based on org config.
 */
export interface IAIProvider {
  /** Matches AiProviderId in aiProviderConfig.ts */
  readonly providerId:  string;
  /** Active model identifier */
  readonly modelId:     string;
  /** Human-readable label for UI display */
  readonly displayName: string;

  /**
   * Non-streaming generation — waits for the full response.
   * Use for short completions where latency is not critical.
   */
  generate(request: AIGenerationRequest): Promise<AIGenerationResult>;

  /**
   * Streaming generation — calls onToken for each token as it arrives.
   * Preferred for narrative section generation so the editor updates live.
   * Returns full result summary when the stream is complete.
   */
  generateStream(
    request: AIGenerationRequest,
    onToken: AIStreamCallback,
  ): Promise<AIGenerationResult>;

  /**
   * Quick connectivity and authentication test.
   * Used by the "Test Connection" button in AiProviderSettings.
   * Should resolve within 5 seconds.
   */
  testConnection(): Promise<AIConnectionTest>;
}
