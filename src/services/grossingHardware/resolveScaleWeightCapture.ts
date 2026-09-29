// src/services/grossingHardware/resolveScaleWeightCapture.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Grossing Station Hardware
// Integration gap's own digital scale piece. See
// IGrossingHardwareProfileService.ts's own header for the full,
// researched reasoning: unlike camera, no standard, cross-browser
// API exists for a real digital scale — the only real, honest bridge
// path is a local agent (the same real 'pathscribe_agent' concept
// PrinterBridgeType already names, PS-52).
//
// Real, honest contract this function assumes for a real
// pathscribe_agent instance's own scale endpoint — GET
// {agentBaseUrl}/scale/weight over HTTPS only (Batch 327), returning real JSON
// { grams: number, stable: boolean }. `stable` matters: a real
// digital scale's own reading genuinely fluctuates while a specimen
// is still settling onto the pan — a real, honest capture only ever
// accepts a `stable: true` reading, never a mid-settle number that
// could misrepresent the specimen's own real weight.
//
// Real, honest scope boundary, stated plainly rather than implied:
// this function's own real HTTP contract can be built and tested
// today (a real fetch to a real, well-known local URL, with real
// error handling) — but whether any given real, physical scale and
// a real pathscribe_agent binary actually exist and correctly speak
// this contract at a real site is genuinely unverifiable from this
// sandbox. The manual-entry fallback (the grossing template's own
// existing weight field, unchanged by this work) remains the real,
// always-working path regardless.
// ─────────────────────────────────────────────────────────────────────────────

import type { GrossingHardwareProfile } from './IGrossingHardwareProfileService';
import { isHttpsUrl } from '@/utils/serviceEndpoint';

export type ScaleWeightCaptureResult =
  | { ok: true; grams: number }
  | { ok: false; reason: 'not_configured' | 'not_https' | 'unreachable' | 'unstable_reading' | 'malformed_response' };

export async function resolveScaleWeightCapture(
  profile: GrossingHardwareProfile | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ScaleWeightCaptureResult> {
  if (!profile || profile.bridgeType !== 'pathscribe_agent' || !profile.agentBaseUrl) {
    return { ok: false, reason: 'not_configured' };
  }
  // Batch 327 (HTTPS): never read a weight over plain HTTP, even from a
  // profile stored before the service started refusing http:// addresses.
  if (!isHttpsUrl(profile.agentBaseUrl)) return { ok: false, reason: 'not_https' };

  let response: Response;
  try {
    response = await fetchImpl(`${profile.agentBaseUrl}/scale/weight`);
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!response.ok) return { ok: false, reason: 'unreachable' };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'malformed_response' };
  }
  if (typeof body !== 'object' || body === null || !('grams' in body) || !('stable' in body)) {
    return { ok: false, reason: 'malformed_response' };
  }
  const { grams, stable } = body as { grams: unknown; stable: unknown };
  if (typeof grams !== 'number' || typeof stable !== 'boolean') {
    return { ok: false, reason: 'malformed_response' };
  }
  if (!stable) return { ok: false, reason: 'unstable_reading' };

  return { ok: true, grams };
}
