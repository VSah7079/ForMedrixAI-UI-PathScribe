import { Navigate, Outlet } from "react-router-dom";
import './pathscribe.css';
import { useEffect } from "react";
import { useAuth } from "@contexts/AuthContext";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useSessionSupersedeDetection } from "@/hooks/useSessionSupersedeDetection";
import SessionExpiryWarningModal from "@/components/Common/SessionExpiryWarningModal";

const SUPERSEDED_NOTICE_KEY = 'pathscribe_show_superseded_notice';

const ProtectedRoute = () => {
  const { user, isAuthenticated, loading, logout } = useAuth();

  // Force a re-check of auth state on mount.
  // This ensures Back/Forward cannot resurrect stale UI state.
  useEffect(() => {
    // Triggering a re-render is enough because isAuthenticated
    // is derived from localStorage in the updated AuthContext.
  }, []);

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
      try { sessionStorage.setItem(SUPERSEDED_NOTICE_KEY, '1'); } catch {}
      logout(false);
    }
  }, [superseded, logout]);

  if (loading) {
    return <div className="ps-auth-check-loading" />;
  }

  if (!isAuthenticated) {
   return <Navigate to="/login" replace />;
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
