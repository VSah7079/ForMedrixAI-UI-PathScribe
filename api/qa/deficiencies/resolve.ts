// api/qa/deficiencies/resolve.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real endpoint for QualityAssurancePage.tsx's own "Escalate to CAPA"
// action — the backend equivalent of ISpecimenDeficiencyService.resolve().
// Real transition: open -> pending-verification (never "resolved" —
// that status doesn't exist; ISO 15189:2022 Clause 8.7 requires a
// genuine, later effectiveness check before anything is truly done,
// which is exactly what verify.ts is for). See contain.ts's own
// header for the shared auth-posture reasoning.
// ─────────────────────────────────────────────────────────────────────────────

import { transitionDeficiency } from './_lib/transitionDeficiency';
import { logIntegrationError } from '../../webhooks/engine/_lib/logIntegrationError';

interface ResolveRequestBody {
  deficiencyId: string;
  resolutionTypeId: string;
  correctiveAction: string;
  rootCause: string;
  resolvedBy: string;
  preventiveAction?: string;
  verificationDueDate?: string;
}

function isValidBody(body: any): body is ResolveRequestBody {
  return (
    typeof body?.deficiencyId === 'string' &&
    typeof body?.resolutionTypeId === 'string' &&
    typeof body?.correctiveAction === 'string' &&
    typeof body?.rootCause === 'string' &&
    typeof body?.resolvedBy === 'string'
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
      details: 'Missing or invalid required fields: deficiencyId, resolutionTypeId, correctiveAction, rootCause, resolvedBy.',
      eventType: 'qa-deficiencies-resolve',
    });
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields: deficiencyId, resolutionTypeId, correctiveAction, rootCause, resolvedBy.' }), { status: 400 });
  }

  try {
    const result = await transitionDeficiency(body.deficiencyId, ['open'], () => ({
      status: 'pending-verification',
      resolutionTypeId: body.resolutionTypeId,
      correctiveAction: body.correctiveAction,
      rootCause: body.rootCause,
      preventiveAction: body.preventiveAction ?? null,
      resolvedBy: body.resolvedBy,
      resolvedAt: new Date().toISOString(),
      verificationDueDate: body.verificationDueDate ?? null,
    }));

    if (result.outcome === 'not-found') {
      return new Response(JSON.stringify({ error: `No deficiency found for '${body.deficiencyId}'.` }), { status: 404 });
    }
    if (result.outcome === 'wrong-status') {
      return new Response(JSON.stringify({ error: `Deficiency ${body.deficiencyId} is '${result.actualStatus}', not 'open' — cannot be escalated to CAPA.` }), { status: 409 });
    }

    return new Response(JSON.stringify({ status: 'applied', deficiencyId: body.deficiencyId }), { status: 200 });
  } catch (err) {
    console.error('[qa-deficiencies-resolve] unexpected error', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
