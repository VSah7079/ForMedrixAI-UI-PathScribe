# services/ai/providers/

Every real `IAIProvider` implementation, one per distinctive request/response API *shape* (the naming convention here is by shape, not by vendor — a shape can be shared by more than one vendor's product).

## Files

- **`ChatCompletionsProvider.ts`** — OpenAI shape (system role inside the `messages` array, `/chat/completions` endpoint, OpenAI-style SSE).
- **`ChatCompletionsManagedProvider.ts`** — Azure OpenAI: same request/response shape as `ChatCompletionsProvider`, routed via a named deployment instead.
- **`CustomProvider.ts`** — self-hosted/custom OpenAI-compatible endpoints: same shape as `ChatCompletionsProvider` again, since "custom" here specifically means "speaks the OpenAI wire format."
- **`ModelGatewayProvider.ts`** — AWS Bedrock: model ID + region routing, a multi-model hosting platform's own distinctive shape.
- **`StructuredContentProvider.ts`** — Gemini: `contents`/`parts` array, separate `systemInstruction` field.
- **`StructuredMessagesProvider.ts`** — **the real, live Anthropic Claude provider.** System as a separate top-level field (not inside `messages`), SSE via `content_block_delta` events. Wraps the real Anthropic Messages API — full streaming, abort/cancellation, latency measurement, clean error typing. Routes through the Vite dev proxy (`/api/ai/anthropic` → `api.anthropic.com`) since Anthropic blocks direct browser-to-API calls entirely.
- **`openAiStyleStreaming.ts`** (+ `streamingProviders.test.ts`) — shared streaming request/parse logic for the three providers above that genuinely share the identical OpenAI Chat Completions SSE shape (`ChatCompletionsProvider`, `ChatCompletionsManagedProvider`, `CustomProvider`).
- **`MockProvider.ts`** — mock AI provider for development, testing, and demos.

## Real finding — confirmed dead code, removed

**`ClaudeProvider.ts`** was a near-verbatim duplicate of `StructuredMessagesProvider.ts` — same wrapped API, same feature list (streaming, abort, latency, error typing), same dev-proxy routing comment, word-for-word in places. `StructuredMessagesProvider.ts`'s own header explains the relationship directly: it was created specifically to rename the Claude provider to match this folder's shape-based naming convention, rather than being vendor-named like the original.

Checked directly, not assumed: grepped every real consumer before removing anything. `StructuredMessagesProvider` is genuinely imported by `AIProviderRegistry.ts`, `openAiStyleStreaming.ts`, and `IAIProvider.ts`. `ClaudeProvider` had **zero** real consumers anywhere in the codebase — confirmed with a second pass right before deletion, plus a full `tsc --noEmit` and full test suite run afterward (1272/1272, unchanged — neither file had its own test to lose). This read as a rename that was done by creating the new file and updating call sites, without ever deleting the old one — a real, confirmed-dead leftover, not an ambiguous or deliberately-scaffolded case like a couple of the ones documented in `types/README.md`. Removed.

---
*See [services/README.md](../../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
