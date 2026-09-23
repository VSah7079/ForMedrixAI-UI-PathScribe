// src/pages/SynopticReportPage/components/EMRSidecarDrawer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Replaces EMRSidecarModal.tsx (the earlier floating/draggable version) --
// this now matches the app's established drawer convention (see
// .ps-drawer / .ps-msg-drawer in pathscribe.css), sliding in from the
// right edge rather than floating as a movable window. Chosen over the
// "try window.open(), fall back to embedded" hybrid: a drawer, like the
// modal before it, is fundamentally clipped to the browser's own
// viewport either way, so second-monitor dragging was never actually on
// the table once a drawer was the target UX -- this is a deliberate,
// confirmed trade of that capability for a cleaner, more familiar
// interaction consistent with Messages/Notes elsewhere in the app.
//
// TWO IMPORTANT DESIGN DECISIONS, WORKING TOGETHER:
//
// 1. ALWAYS MOUNTED. This component renders its content unconditionally
//    -- `isOpen` only controls a CSS transform (slid on/off screen) and
//    pointer-events, never an early `return null`. Today, with
//    MockEMRPage's hardcoded synthetic data, this has no real benefit.
//    It matters once real EMR integration exists: SMART on FHIR auth has
//    genuine latency (redirect, authenticate, token exchange), and
//    unmounting on every close would mean re-authenticating on every
//    single open. Staying mounted keeps a future real session warm
//    across opens within the same case.
//
// 2. THE INNER CONTENT IS KEYED ON patientId. This is the structural
//    guarantee against ever showing a stale/wrong patient's data: React
//    treats a changed `key` as a completely different element, and is
//    REQUIRED to fully unmount the old instance and mount a fresh one --
//    not a convention that well-behaved code needs to honor, a hard
//    guarantee enforced by React itself. This is what makes decision #1
//    safe: the OUTER drawer shell can stay warm indefinitely, while the
//    INNER content is forcibly, completely reset the instant the patient
//    changes, with zero possibility of old state leaking through no
//    matter how complex the real embedded content becomes later.
// ─────────────────────────────────────────────────────────────────────────────

//
// i18n note: the drawer chrome (title, close button) is translated;
// the embedded MockEMRPage content is out of scope for this file.
// Inline styles replaced with the new .ps-emr-sidecar-* classes in
// pathscribe.css (following the existing .ps-drawer/.ps-drawer-backdrop
// convention) -- the always-mounted open/close toggle that used to be
// three separate inline style props (transform/pointerEvents/boxShadow)
// is now a single `--open` modifier class, and the close button's
// inline hover handlers are now a plain CSS :hover rule.

import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import MockEMRPage from '@/pages/MockEMRPage';

interface EMRSidecarDrawerProps {
  isOpen:    boolean;
  patientId: string;
  onClose:   () => void;
}

const EMRSidecarDrawer: React.FC<EMRSidecarDrawerProps> = ({ isOpen, patientId, onClose }) => {
  const { t } = useTranslation();
  const drawerRef = useRef<HTMLDivElement>(null);

  // React's JSX prop reconciliation doesn't yet recognize `inert` as a
  // valid DOM attribute on this React/TS version and silently drops it
  // if passed as a prop - setting it directly via the DOM API guarantees
  // it actually lands, so aria-hidden content can't still be tabbed into.
  useEffect(() => {
    if (drawerRef.current) {
      drawerRef.current.inert = !isOpen;
    }
  }, [isOpen]);

  return (
    <>
      {/* Backdrop -- unlike the drawer itself, safe to conditionally
          render, since it has no state worth preserving while closed. */}
      {isOpen && (
        <div className="ps-drawer-backdrop" onClick={onClose} />
      )}

      {/* Drawer shell -- ALWAYS rendered. Visibility is purely CSS. */}
      <div
        className={`ps-emr-sidecar-drawer${isOpen ? ' ps-emr-sidecar-drawer--open' : ''}`}
        aria-hidden={!isOpen}
        ref={drawerRef}
      >
        <div className="ps-emr-sidecar-header">
          <span className="ps-emr-sidecar-title">
            🌐 {t('emrSidecarDrawer.title')}
          </span>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="ps-emr-sidecar-close"
          >✕</button>
        </div>

        <div className="ps-emr-sidecar-body">
          {/* key={patientId} -- see file header. This is what makes it
              safe for the drawer shell above to stay mounted forever. */}
          <MockEMRPage key={patientId} patientId={patientId} />
        </div>
      </div>
    </>
  );
};

export default EMRSidecarDrawer;
