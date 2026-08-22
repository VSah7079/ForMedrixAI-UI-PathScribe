// src/pages/SynopticReportPage/modals/CassetteColorControl.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Additional Requirements for
// Batch Management: cell blocks... Dedicated Hopper Assignment: Cell
// blocks frequently use distinct cassette colors... Specimen Protocol
// Overrides: the hopper control widget lets them manually override
// Auto-Route [Hopper 3] to Hopper 1 with a single click."
//
// Real, confirmed scope boundary — per direct confirmation: PathScribe
// resolves and lets a real person override which LOGICAL COLOR a
// cassette uses; it never models hopper NUMBERS, hardware state, or
// real-time availability (evaluateCassetteRouting.ts's own header has
// the full, confirmed two-layer architecture this respects). This
// component is deliberately named "color," never "hopper" — the
// override here changes resolveDecantCassetteColor's own real output
// (a colorId), not a physical bin assignment PathScribe has no way to
// know or control.
//
// No business logic here — this component only displays real,
// already-resolved data and reports a real person's own choice via
// onChange; every real decision (which color a NEW decant starts
// with) already happened in resolveDecantCassetteColor.ts, before
// this component ever renders.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import type { CassetteColorDefinition } from '@/services/cassetteColors/ICassetteColorService';

interface CassetteColorControlProps {
  colorId?: string;
  overridden?: boolean;
  colors: CassetteColorDefinition[];
  onChange: (colorId: string) => void;
}

const CassetteColorControl: React.FC<CassetteColorControlProps> = ({ colorId, overridden, colors, onChange }) => {
  const resolvedColor = colors.find(c => c.id === colorId);
  const activeColors = colors.filter(c => c.active);

  return (
    <div className="ps-cassette-color-control">
      <label className="ps-conf-label">Cassette Color</label>
      <div className="ps-cassette-color-row">
        {resolvedColor ? (
          <>
            {/* Real, justified exception to "no inline css" — see this
                file's own header and the shared CSS class's own
                comment in pathscribe.css: a color swatch's background
                is genuinely dynamic, admin-configured data, not a
                fixed styling choice. */}
            <span className="ps-cassette-color-swatch" style={{ background: resolvedColor.hexCode }} />
            <span className="ps-cassette-color-name">{resolvedColor.displayName}</span>
            {overridden && <span className="ps-cassette-color-overridden-badge">Overridden</span>}
          </>
        ) : (
          <span className="ps-cassette-color-unresolved">Not yet resolved</span>
        )}
        <select
          className="ps-conf-select"
          value={colorId ?? ''}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">— Select a color —</option>
          {activeColors.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select>
      </div>
    </div>
  );
};

export default CassetteColorControl;
