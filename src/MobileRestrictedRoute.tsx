// src/MobileRestrictedRoute.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real device-based route restriction for the Intraop Queue mobile/OR
// workflow — see utils/deviceDetection.ts's own header comment for the
// full reasoning (viewport width + pointer:coarse, not width alone, plus
// the sessionStorage override escape hatch).
//
// Deliberately NOT role-based. A pathologist needs full desktop access
// at their workstation and the restricted view on their phone at a
// bedside — the same person, two different real moments. Role can't
// distinguish those; the device signal can. Sits inside ProtectedRoute
// (authentication still required first), and outside every other route,
// so it applies uniformly regardless of which page was requested.
// ─────────────────────────────────────────────────────────────────────────────

import { Navigate, Outlet, useLocation } from 'react-router';
import { shouldRestrictToMobileWorkflow } from '@/utils/deviceDetection';

const INTRAOP_QUEUE_PATH = '/intraop-queue';

const MobileRestrictedRoute = () => {
  const location = useLocation();

  // Evaluated fresh on every navigation (React Router re-renders this
  // guard on each route change) rather than cached once — cheap check,
  // and correctness matters more than the negligible cost of re-running
  // two DOM reads per navigation.
  const restricted = shouldRestrictToMobileWorkflow();

  if (restricted && location.pathname !== INTRAOP_QUEUE_PATH) {
    return <Navigate to={INTRAOP_QUEUE_PATH} replace />;
  }

  return <Outlet />;
};

export default MobileRestrictedRoute;
