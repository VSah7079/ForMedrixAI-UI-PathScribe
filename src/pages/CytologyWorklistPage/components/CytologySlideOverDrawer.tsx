// src/pages/CytologyWorklistPage/components/CytologySlideOverDrawer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own explicit design: a real, right-hand
// slide-over drawer, reusing this app's own established real drawer
// CSS convention (.ps-drawer / .ps-drawer-backdrop / .ps-drawer-header
// — the same real classes EMRSidecarDrawer.tsx and the Messages/Notes
// drawers already use), so Material View and Synoptic Reporting share
// one real, generic shell rather than each building their own —
// "double the UI ROI with a single component shell," per direct
// guidance's own explicit reasoning.
//
// Real, deliberate: this shell renders whatever real content its
// caller passes as children — it has no real opinion about Material
// vs. Synoptic content itself.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import '../../../pathscribe.css';

interface CytologySlideOverDrawerProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const CytologySlideOverDrawer: React.FC<CytologySlideOverDrawerProps> = ({ isOpen, title, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <>
      <div className="ps-drawer-backdrop" onClick={onClose} />
      <div className="ps-drawer" style={{ width: 420 }}>
        <div className="ps-drawer-header">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e5e7eb', margin: 0 }}>{title}</h2>
          <button onClick={onClose} className="ps-research-close">✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {children}
        </div>
      </div>
    </>
  );
};

export default CytologySlideOverDrawer;
