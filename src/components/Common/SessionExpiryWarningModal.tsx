// src/components/Common/SessionExpiryWarningModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 of the Inactivity Timeout & Draft Recovery spec.
//
// NOTE on copy: the original spec's wireframe text ("Any unsaved changes will
// be safely cached on this device") describes Phase 2 (draft preservation),
// which does not exist yet. Using that wording here before Phase 2 is built
// would make the exact same category of false claim just removed from the
// audit log's fabricated "session expired" entries -- a UI promising a
// safety behavior that doesn't actually happen. Reworded to be honest about
// what Phase 1 actually does: nothing is auto-saved, so the user is told to
// save manually. Revisit this copy once Phase 2 lands for real.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

interface SessionExpiryWarningModalProps {
  secondsRemaining: number;
  onStayLoggedIn:   () => void;
  onLogOutNow:      () => void;
}

const SessionExpiryWarningModal: React.FC<SessionExpiryWarningModalProps> = ({
  secondsRemaining, onStayLoggedIn, onLogOutNow,
}) => {
  const mm = String(Math.floor(secondsRemaining / 60)).padStart(2, '0');
  const ss = String(secondsRemaining % 60).padStart(2, '0');

  return (
    <div className="ps-overlay" style={{ zIndex: 50000 }}>
      <div className="ps-modal-dark" style={{ width: 440, textAlign: 'center' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <span className="ps-modal-dark-title">Session Expiring Soon</span>
        <p className="ps-modal-dark-body">
          You've been inactive for a while. For security reasons, your session will expire in{' '}
          <strong style={{ color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</strong>.
        </p>
        <p className="ps-modal-dark-body" style={{ color: '#f59e0b' }}>
          Please save any unsaved work now — changes are not automatically preserved.
        </p>
        <div className="ps-modal-dark-footer">
          <button className="ps-btn-ghost-dark" onClick={onLogOutNow}>Log Out</button>
          <button className="ps-btn-primary" onClick={onStayLoggedIn} autoFocus>Stay Logged In</button>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiryWarningModal;
