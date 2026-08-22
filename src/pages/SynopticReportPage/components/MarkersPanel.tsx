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
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import type { MarkerAnswer } from '@/orchestrator/contextBuilder';

interface MarkersPanelProps {
  markers: MarkerAnswer[];
}

const MarkersPanel: React.FC<MarkersPanelProps> = ({ markers }) => {
  if (markers.length === 0) return null;

  // Group markers by their markerGroup, preserving first-seen order
  const groups = new Map<string, MarkerAnswer[]>();
  for (const m of markers) {
    if (!groups.has(m.markerGroup)) groups.set(m.markerGroup, []);
    groups.get(m.markerGroup)!.push(m);
  }

  return (
    <div style={{ background: 'rgba(8,145,178,0.06)', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px', border: '1px solid rgba(8,145,178,0.2)' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0891B2', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '10px' }}>
        Biomarkers
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
        {[...groups.entries()].map(([groupName, fields]) => (
          <div
            key={groupName}
            style={{ padding: '10px 14px', background: 'rgba(8,145,178,0.08)', borderRadius: '8px', border: '1px solid rgba(8,145,178,0.2)' }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0891B2', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid rgba(8,145,178,0.2)' }}>
              {groupName}
            </div>
            {fields.map(f => (
              <div key={f.fieldId} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', padding: '3px 0' }}>
                <span style={{ color: '#94a3b8' }}>{f.fieldLabel}</span>
                <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{f.displayValue || '—'}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarkersPanel;
