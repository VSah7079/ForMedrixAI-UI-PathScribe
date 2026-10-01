// src/pages/SynopticReportPage/components/MarkersPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Phase D of the biomarker display work. Shows
// resolved biomarker values grouped by marker (e.g. all ER-related fields --
// Status, % Positivity, Intensity -- under one "ER" card with those details
// listed together), rather than as separate, disconnected badges. Grouping
// comes from each field's markerGroup tag (set in the template JSON),
// falling back to the field's own label if untagged, so templates that
// haven't been tagged yet still degrade gracefully.
//
// No provenance/block-slide linking yet — that's a real, separate future
// piece (CoPilot mode needing real LIS
// material-list data, not PathScribe's own mock blocks, before that's
// safe to build for CoPilot cases specifically).
//
// i18n note: `groupName` (a real markerGroup tag or a field's own
// label, both template-authored data) and `f.fieldLabel`/
// `f.displayValue` are real, resolved report data — left as-is. Only
// the "Biomarkers" panel heading is UI chrome.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import '@/pathscribe.css';
import type { MarkerAnswer } from '@/orchestrator/contextBuilder';

interface MarkersPanelProps {
  markers: MarkerAnswer[];
}

const MarkersPanel: React.FC<MarkersPanelProps> = ({ markers }) => {
  const { t } = useTranslation();
  if (markers.length === 0) return null;

  // Group markers by their markerGroup, preserving first-seen order
  const groups = new Map<string, MarkerAnswer[]>();
  for (const m of markers) {
    if (!groups.has(m.markerGroup)) groups.set(m.markerGroup, []);
    groups.get(m.markerGroup)!.push(m);
  }

  return (
    <div className="ps-markers-panel">
      <div className="ps-markers-panel-title">
        {t('markersPanel.title')}
      </div>
      <div className="ps-markers-panel-grid">
        {[...groups.entries()].map(([groupName, fields]) => (
          <div key={groupName} className="ps-markers-panel-group">
            <div className="ps-markers-panel-group-title">
              {groupName}
            </div>
            {fields.map(f => (
              <div key={f.fieldId} className="ps-markers-panel-field">
                <span className="ps-markers-panel-field-label">{f.fieldLabel}</span>
                <span className="ps-markers-panel-field-value">{f.displayValue || '—'}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarkersPanel;
