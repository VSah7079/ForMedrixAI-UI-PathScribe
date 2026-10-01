// src/pages/SynopticReportPage/components/WsiViewerLaunchButton.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: "we just pass info and launch the app
// and route the unique id so that the correct scan is placed in
// their viewer." A small, self-contained, fully-translated component
// — deliberately separate from BlockStainEditorModal.tsx (1,300+
// lines, not yet converted to i18n) rather than a wholesale
// conversion of that whole file, same real "only what's actually
// touched" boundary already established elsewhere in this app
// (GrossingReleasePanel.tsx, the OR Suite Live Board's own nav
// button). This component is the one new piece of UI actually being
// added; the host file's own pre-existing text is untouched.
//
// Real, extended (Sep 2026) per direct guidance's own confirmed
// resolution while consolidating Cytology's own, separate WSI launch
// onto this shared component: Cytology's own mechanism had a real,
// deliberate "sticky" window-positioning feature (via
// useCompanionWindow.ts's own geometry-memory) this component didn't
// have — rather than lose that consolidating onto the simpler
// window.open() this file used before, or keep two divergent
// mechanisms, this component now optionally uses the same real
// useCompanionWindow.ts hook, benefiting Surgical Pathology's own
// callers too. windowName defaults to a real, shared name so every
// existing caller keeps working with zero required changes; a real
// caller wanting its own, independent sticky position (as Cytology
// does) passes its own windowName explicitly.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { mockWsiViewerVendorService } from '@/services/digitalPathology/mockWsiViewerVendorService';
import { buildWsiViewerLaunchUrl } from '@/utils/buildWsiViewerLaunchUrl';
import { useCompanionWindow } from '@/hooks/useCompanionWindow';
import type { WsiViewerVendorEntry } from '@/services/digitalPathology/IWsiViewerVendorService';

/** Real, per the RFP's own §3.4.1 ask — only shown once a real,
 *  physical slide genuinely exists to scan (coverslipped or beyond);
 *  earlier statuses have no real slide yet, so a launch button would
 *  route to nothing real. */
const SCANNABLE_STATUSES = new Set(['Coverslipped', 'Ready for Review']);

interface WsiViewerLaunchButtonProps {
  status: string;
  displayId?: string;
  /** Real, per direct guidance's own confirmed extension — defaults
   *  to a real, shared name so every existing (Surgical) caller keeps
   *  its own real, sticky position with zero required changes. A
   *  real caller in a genuinely different context (Cytology) passes
   *  its own name for an independent, separately-remembered
   *  position. */
  windowName?: string;
  preferredWidth?: number;
  preferredHeight?: number;
}

export const WsiViewerLaunchButton: React.FC<WsiViewerLaunchButtonProps> = ({
  status, displayId, windowName = 'PathScribeWsiViewer', preferredWidth = 1400, preferredHeight = 900,
}) => {
  const { t } = useTranslation();
  const [vendors, setVendors] = useState<WsiViewerVendorEntry[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Real, per this component's own extended header comment — every
  // real caller now gets sticky positioning, not just Cytology's own.
  const { openCompanion } = useCompanionWindow({ windowName, preferredWidth, preferredHeight });

  useEffect(() => {
    mockWsiViewerVendorService.getActive().then(res => {
      if (res.ok) {
        setVendors(res.data);
        if (res.data.length > 0) setSelectedVendorId(res.data[0].id);
      }
    });
  }, []);

  if (!SCANNABLE_STATUSES.has(status) || !displayId || vendors.length === 0) return null;

  const launch = async () => {
    setError(null);
    const vendor = vendors.find(v => v.id === selectedVendorId);
    if (!vendor) return;
    const result = buildWsiViewerLaunchUrl(vendor.launchUrlTemplate, displayId);
    if ('error' in result) { setError(result.error); return; }
    const launchResult = await openCompanion(result.url);
    if (launchResult === 'blocked') setError(t('wsiViewerLaunch.blockedError'));
  };

  return (
    <span className="ps-wsi-launch-wrap">
      {vendors.length > 1 && (
        <select
          className="ps-wsi-launch-select"
          value={selectedVendorId}
          onChange={e => setSelectedVendorId(e.target.value)}
          title={t('wsiViewerLaunch.selectVendorTitle')}
        >
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      )}
      <button type="button" className="ps-wsi-launch-btn" onClick={launch} title={t('wsiViewerLaunch.launchTitle')}>
        🔬 {t('wsiViewerLaunch.launchLabel')}
      </button>
      {error && <span className="ps-wsi-launch-error" title={error}>⚠</span>}
    </span>
  );
};

