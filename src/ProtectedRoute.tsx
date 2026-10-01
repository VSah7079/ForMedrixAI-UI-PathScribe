import { Navigate, Outlet, useLocation } from "react-router";
import './pathscribe.css';
import { useEffect } from "react";
import { useAuth } from "@contexts/AuthContext";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useSessionSupersedeDetection } from "@/hooks/useSessionSupersedeDetection";
import SessionExpiryWarningModal from "@/components/Common/SessionExpiryWarningModal";
import { flagSupersededNotice } from "@/services/session/sessionSupersedeService";
import type { LoginRouteState } from "@/pages/LoginPage";

const ProtectedRoute = () => {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const location = useLocation();

  // Phase 1 of the Inactivity Timeout & Draft Recovery spec. Only active once actually authenticated -- no
  // point running an idle timer against the login page itself.
  const { showWarning, secondsRemaining, expired, stayLoggedIn } = useIdleTimeout(isAuthenticated);

  useEffect(() => {
    if (expired) logout(false);
  }, [expired, logout]);

  // Same-browser session-supersede detection — same Timeout Preservation
  // principle as idle-timeout: logout(false), never discard drafts. The
  // notice itself can't usefully render here — this component unmounts
  // and redirects to /login the instant logout() runs, so a modal shown
  // here would never actually be seen. Instead, leave a real marker
  // LoginPage.tsx checks for on arrival.
  const superseded = useSessionSupersedeDetection(isAuthenticated, user?.id);

  useEffect(() => {
    if (superseded) {
      flagSupersededNotice();
      logout(false);
    }
  }, [superseded, logout]);

  if (loading) {
    return <div className="ps-auth-check-loading" />;
  }

  if (!isAuthenticated) {
    // PS-60: the login page returns the user here after signing in.
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from } satisfies LoginRouteState} />;
  }

  return (
    <>
      <Outlet />
      {showWarning && (
        <SessionExpiryWarningModal
          secondsRemaining={secondsRemaining}
          onStayLoggedIn={stayLoggedIn}
          onLogOutNow={() => logout(true)}
        />
      )}
    </>
  );
};

export default ProtectedRoute;
