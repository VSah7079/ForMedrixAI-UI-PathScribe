// api/qa/deficiencies/contain.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real endpoint for QualityAssurancePage.tsx's own "Immediate
// Containment" action — the backend equivalent of
// ISpecimenDeficiencyService.containImmediately() (src/services/
// deficiencies/IDeficiencyService.ts), reachable for a real,
// Firestore-sourced deficiency the client-only mockSpecimenDeficiencyService.ts
// can never see (same real split already solved for case mutations).
//
// Real transition: open -> closed directly, per that interface's own
// documented reasoning — "the fix and the record of the fix are the
// same action, nothing meaningful to verify later." Never touches
// pending-verification/resolved records; see transitionDeficiency.ts's
// own guard for why.
//
// Real, deliberate auth posture, same as every other endpoint in this
// folder: no shared-secret check, unlike the Engine webhooks. A
// secret embedded in this app's own public frontend bundle (the only
// real caller here) provides no genuine protection — anyone can read
// it straight out of the browser's own network tab or JS bundle,
// unlike the Engine's secret, which stays server-side on the vendor's
// own system and is never shipped to a browser at all. Real,
// unresolved question, same root cause as pending_engine_notifications'
// own open-read compromise: no real Firebase Auth (or equivalent
// server-verifiable session) exists yet to gate this properly — see
// this session's own open flag on it.
// ─────────────────────────────────────────────────────────────────────────────

import { transitionDeficiency } from './_lib/transitionDeficiency';
import { logIntegrationError } from '../../webhooks/engine/_lib/logIntegrationError';

interface ContainRequestBody {
  deficiencyId: string;
  resolutionTypeId: string;
  resolutionComment: string;
  resolvedBy: string;
}

function isValidBody(body: any): body is ContainRequestBody {
  return (
    typeof body?.deficiencyId === 'string' &&
    typeof body?.resolutionTypeId === 'string' &&
    typeof body?.resolutionComment === 'string' &&
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
      details: 'Missing or invalid required fields: deficiencyId, resolutionTypeId, resolutionComment, resolvedBy.',
      eventType: 'qa-deficiencies-contain',
    });
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields: deficiencyId, resolutionTypeId, resolutionComment, resolvedBy.' }), { status: 400 });
  }

  try {
    const result = await transitionDeficiency(body.deficiencyId, ['open'], () => ({
      status: 'closed',
      resolutionTypeId: body.resolutionTypeId,
      resolutionComment: body.resolutionComment,
      resolvedBy: body.resolvedBy,
      resolvedAt: new Date().toISOString(),
    }));

    if (result.outcome === 'not-found') {
      return new Response(JSON.stringify({ error: `No deficiency found for '${body.deficiencyId}'.` }), { status: 404 });
    }
    if (result.outcome === 'wrong-status') {
      return new Response(JSON.stringify({ error: `Deficiency ${body.deficiencyId} is '${result.actualStatus}', not 'open' — cannot be immediately contained.` }), { status: 409 });
    }

    return new Response(JSON.stringify({ status: 'applied', deficiencyId: body.deficiencyId }), { status: 200 });
  } catch (err) {
    console.error('[qa-deficiencies-contain] unexpected error', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
