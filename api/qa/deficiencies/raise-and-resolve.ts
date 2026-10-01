// api/qa/deficiencies/raise-and-resolve.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real endpoint for the backend equivalent of
// ISpecimenDeficiencyService.raiseAndResolve() — for the "minor,
// self-contained bench correction" case, where the fix and the record
// of the fix are the same real action. Creates a brand-new document
// directly at status 'closed', never touching transitionDeficiency.ts
// (there's no existing record to transition — same real distinction
// raiseSpecimenDeficiency.ts's own raise() draws).
//
// Real, honest scope note: every existing real use of
// raiseAndResolve() today (fixative-time gate, tissue discrepancy,
// dictionary-mismatch, post-hoc correction) already works fine
// against mockSpecimenDeficiencyService.ts's own client-side
// implementation — this endpoint doesn't replace any of them, and
// none of those call sites have been migrated to use it. Built for
// real, future backend-triggered or migrated frontend use, matching
// what was asked for, not because an existing flow was broken.
// ─────────────────────────────────────────────────────────────────────────────

import { getAdminFirestore } from '../../webhooks/engine/_lib/firebaseAdmin';
import { logIntegrationError } from '../../webhooks/engine/_lib/logIntegrationError';

const COLLECTION_NAME = 'specimen_deficiencies';

interface RaiseAndResolveRequestBody {
  caseId: string;
  organisationId?: string;
  siteId?: string;
  specimenId?: string;
  specimenLabel?: string;
  deficiencyTypeId: string;
  comment?: string;
  raisedBy: string;
  resolutionTypeId: string;
  resolvedBy: string;
  resolutionComment?: string;
}

function isValidBody(body: any): body is RaiseAndResolveRequestBody {
  return (
    typeof body?.caseId === 'string' &&
    typeof body?.deficiencyTypeId === 'string' &&
    typeof body?.raisedBy === 'string' &&
    typeof body?.resolutionTypeId === 'string' &&
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
      details: 'Missing or invalid required fields: caseId, deficiencyTypeId, raisedBy, resolutionTypeId, resolvedBy.',
      eventType: 'qa-deficiencies-raise-and-resolve',
    });
    return new Response(JSON.stringify({ error: 'Missing or invalid required fields: caseId, deficiencyTypeId, raisedBy, resolutionTypeId, resolvedBy.' }), { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const ref = db.collection(COLLECTION_NAME).doc();
    const now = new Date().toISOString();

    await ref.set({
      caseId: body.caseId,
      organisationId: body.organisationId ?? null,
      siteId: body.siteId ?? null,
      specimenId: body.specimenId ?? null,
      specimenLabel: body.specimenLabel ?? null,
      deficiencyTypeId: body.deficiencyTypeId,
      comment: body.comment ?? null,
      raisedBy: body.raisedBy,
      raisedAt: now,
      // Real, deliberate — created directly closed, per raiseAndResolve()'s
      // own real posture: the fix and the record of the fix are the
      // same action, no pending-verification stage to pass through.
      status: 'closed',
      resolutionTypeId: body.resolutionTypeId,
      resolutionComment: body.resolutionComment ?? null,
      resolvedBy: body.resolvedBy,
      resolvedAt: now,
    });

    return new Response(JSON.stringify({ status: 'applied', deficiencyId: ref.id }), { status: 200 });
  } catch (err) {
    console.error('[qa-deficiencies-raise-and-resolve] unexpected error', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}
