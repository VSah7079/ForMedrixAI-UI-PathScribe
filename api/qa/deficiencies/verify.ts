// api/qa/deficiencies/verify.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real endpoint for QualityAssurancePage.tsx's own "Verify
// Effectiveness" action — the backend equivalent of
// ISpecimenDeficiencyService.verifyEffectiveness(). The real
// ISO 15189:2022 Clause 8.7 effectiveness check itself, not a
// formality: 'effective' closes the record for good; 'recurred' sends
// it back to 'open' (not a new status — a reopened issue needs the
// same corrective-action treatment a fresh one does) and increments
// reopenCount, which is exactly why this uses transitionDeficiency's
// own computeUpdates callback rather than a static update object —
// the real increment depends on the document's own current value.
// See contain.ts's own header for the shared auth-posture reasoning.
// ─────────────────────────────────────────────────────────────────────────────

import { transitionDeficiency } from './_lib/transitionDeficiency';
import { logIntegrationError } from '../../webhooks/engine/_lib/logIntegrationError';

interface VerifyRequestBody {
  deficiencyId: string;
  outcome: 'effective' | 'recurred';
  verifiedBy: string;
  comment?: string;
}

function isValidBody(body: any): body is VerifyRequestBody {
  return (
    typeof body?.deficiencyId === 'string' &&
    (body?.outcome === 'effective' || body?.outcome === 'recurred') &&
    typeof body?.verifiedBy === 'string'
  );
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!isValidBody(body)) {
    await logIntegrationError({
      category: 'PAYLOAD_VALIDATION_FAILED', source: 'PathScribeQA', httpStatus: 400,
      details: 'Missing or invalid required fields: deficiencyId, outcome (must be \'effective\' or \'recurred\'), verifiedBy.',
      eventType: 'qa-deficiencies-verify',
    });
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields: deficiencyId, outcome (must be \'effective\' or \'recurred\'), verifiedBy.' }), { status: 400 });
  }

  try {
    const result = await transitionDeficiency(body.deficiencyId, ['pending-verification'], (current) => ({
      // Real, deliberate branch — 'effective' closes for good;
      // 'recurred' reopens with a real, incremented reopenCount so a
      // pattern of failed fixes stays visible rather than looking
      // identical to a first occurrence.
      status: body.outcome === 'effective' ? 'closed' : 'open',
      verifiedBy: body.verifiedBy,
      verifiedAt: new Date().toISOString(),
      verificationOutcome: body.outcome,
      verificationComment: body.comment ?? null,
      ...(body.outcome === 'recurred' ? { reopenCount: (current.reopenCount ?? 0) + 1 } : {}),
    }));

    if (result.outcome === 'not-found') {
      return new Response(JSON.stringify({ error: `No deficiency found for '${body.deficiencyId}'.` }), { status: 404 });
    }
    if (result.outcome === 'wrong-status') {
      return new Response(JSON.stringify({ error: `Deficiency ${body.deficiencyId} is '${result.actualStatus}', not 'pending-verification' — cannot be verified.` }), { status: 409 });
    }

    return new Response(JSON.stringify({ status: 'applied', deficiencyId: body.deficiencyId, outcome: body.outcome }), { status: 200 });
  } catch (err) {
    console.error('[qa-deficiencies-verify] unexpected error', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
