// src/services/clinical/detectCriticalFindings.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own revised PS-105 scope: negation-aware
// detection of critical/abnormal narrative findings (PS-105's own
// "Narrative NLP & Keyphrase Extraction" section), built on this
// app's existing, proven callAi() provider abstraction rather than a
// separate spaCy/MedSpaCy pipeline this app has no real
// infrastructure for. Same real, established pattern as
// evaluateSynopticAssignment (mockCaseService.ts) - a standalone
// function calling callAi() directly, not a method on
// PathScribeAIService/IAIIntegrationService.
//
// Real, per direct guidance's own follow-up ("will the data going to
// the LLM be encrypted, we have to be careful"): deliberately scoped
// to narrative text only (gross/microscopic/ancillary) - the exact
// same real fields suggestSynopticFields already sends, never
// patient name, MRN, DOB, or any other direct identifier. This is a
// real, enforced boundary at this function's own signature, not
// implicit - there is no parameter this function could even pass a
// patient identifier through. Encryption in transit and at-rest
// retention are governed by the configured provider's own
// infrastructure/contract, not by this function.
// ─────────────────────────────────────────────────────────────────────────────

import { callAi } from '@/services/aiIntegration/aiProviderService';
import type { ServiceResult } from '../types';

export type CriticalFindingSeverity = 'critical' | 'abnormal';

export interface CriticalFindingFlag {
  /** The real term/phrase the model flagged, e.g. "invasive carcinoma". */
  term: string;
  sourceField: 'gross' | 'microscopic' | 'ancillary';
  /** Short, real quote from the source text showing the term in
   *  context - lets a reviewer see WHY this was flagged, not just
   *  that it was. */
  sourceQuote: string;
  severity: CriticalFindingSeverity;
}

export interface CriticalFindingDetectionResult {
  flags: CriticalFindingFlag[];
}

/** Real, per direct guidance's own PS-105 scope - scans real,
 *  already-entered narrative text for critical/abnormal findings a
 *  pathologist may need to communicate urgently. Negation-aware by
 *  prompt design (flags "high-grade dysplasia", not "no evidence of
 *  high-grade dysplasia" - PS-105's own stated example), covering the
 *  same real high-severity term categories PS-105 names (malignant,
 *  carcinoma, melanoma, acid-fast bacilli, organ rejection) without
 *  hard-coding a fixed keyword list, since real pathology narrative
 *  language varies far more than any fixed dictionary could capture.
 *
 *  Never a hard gate on its own - this only detects and returns real,
 *  structured flags; a caller (the sign-out workflow) decides what to
 *  do with them (surface a banner, require acknowledgment or a real
 *  CriticalResultNotification before finalizing). Returns an honest,
 *  empty flags array, never a fabricated one, when nothing in the
 *  real text warrants flagging. */
export async function detectCriticalFindings(
  caseText: { gross: string; microscopic: string; ancillary: string }
): Promise<ServiceResult<CriticalFindingDetectionResult>> {
  if (!caseText.gross.trim() && !caseText.microscopic.trim() && !caseText.ancillary.trim()) {
    return { ok: true, data: { flags: [] } };
  }

  try {
    const { text: raw } = await callAi({
      system: 'You are a pathology AI assistant identifying critical and abnormal findings that may require urgent physician notification. Return only valid JSON — no markdown, no preamble.',
      prompt: `Analyse the following pathology case narrative for critical or abnormal findings requiring urgent clinical notification.

GROSS: ${caseText.gross || '—'}
MICROSCOPIC: ${caseText.microscopic || '—'}
ANCILLARY: ${caseText.ancillary || '—'}

Flag real findings such as: unexpected or newly-diagnosed malignancy (e.g. carcinoma, melanoma, invasive disease), organ transplant rejection, acid-fast bacilli or other findings suggesting active infectious disease requiring urgent treatment, and any other finding a reasonable pathologist would consider a critical value requiring immediate physician communication.

Be negation-aware: do NOT flag a term that is explicitly negated or ruled out (e.g. "no evidence of malignancy", "negative for acid-fast bacilli") — only flag findings actually present.

Return JSON: { "flags": [ { "term": "short flagged term", "sourceField": "gross" | "microscopic" | "ancillary", "sourceQuote": "≤15 word quote from the text", "severity": "critical" | "abnormal" } ] }
Rules:
- "critical" severity: findings requiring immediate/urgent notification (e.g. unexpected malignancy, organ rejection, active untreated infection)
- "abnormal" severity: clinically significant but not immediately urgent
- Return an empty flags array if nothing in the real text warrants flagging — never fabricate a finding`,
      maxTokens: 800,
    });

    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const flags: CriticalFindingFlag[] = Array.isArray(parsed?.flags) ? parsed.flags : [];
    return { ok: true, data: { flags } };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? 'Critical finding detection failed' };
  }
}
