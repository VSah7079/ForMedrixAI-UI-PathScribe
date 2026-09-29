// src/hooks/useCapabilities.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-355 (Batch 369): which catalog capabilities the signed-in user holds,
// for screens to offer or grey out an action. The decision is the
// authorization service's evaluateCapability; nothing is decided here.
//
// PS-356 (Batch 370): `has` and `decide` take the action's context, so a
// button can also reflect the user's facility assignment (a QA export for
// a facility they don't work for is greyed out, with the reason).
//
// Deny until known: while loading, `has()` is false.
//
// This only decides what to show. The action itself is checked again, and
// audited, by the service that carries it out (authorizationService.enforce).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { authorizationService } from '@/services';
import { evaluateCapability, type CapabilityContext, type CapabilityDecision } from '@/services/authorization/evaluateCapability';
import type { AuthorizationSnapshot } from '@/services/authorization/authorizationService';
import { useAuth } from '@/contexts/AuthContext';

export interface CapabilitiesState {
  loading: boolean;
  has: (capability: string, context?: CapabilityContext) => boolean;
  decide: (capability: string, context?: CapabilityContext) => CapabilityDecision | null;
}

export function useCapabilities(): CapabilitiesState {
  const { user } = useAuth();
  const [snap, setSnap] = useState<AuthorizationSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSnap(null);
    authorizationService.snapshot()
      .then(s => { if (!cancelled) setSnap(s); })
      .catch(() => { if (!cancelled) setSnap({ subject: null, roles: [] }); });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);
  const decide = (c: string, ctx: CapabilityContext = {}) => (snap ? evaluateCapability(snap.subject, c, snap.roles, ctx) : null);
  return { loading: snap === null, has: (c, ctx) => !!decide(c, ctx)?.allowed, decide };
}
