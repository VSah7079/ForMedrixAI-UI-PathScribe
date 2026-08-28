// src/pages/SynopticReportPage/components/DispatchHistoryTimeline.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own Clinical Job History spec - a
// case-level (not per-block) timeline of every cassette dispatch
// outcome and block exception ever recorded, fed by
// fetchDispatchHistoryForCase.ts. See that file's own header for why
// this is case-level rather than attached to a specific tree node in
// MaterialTrackingHistoryModal.tsx: CassetteDispatchOutcomeEventPayload
// only ever carries an optional specimenLabel, never a block-level
// identifier, so there's no real, honest way to attach a dispatch
// entry to one specific block/slide node the way MaterialLocation
// history already is.
//
// Real, deliberate per-type rendering: the two real event types this
// shows have genuinely different payload shapes (cassette-dispatch-
// outcome carries requestedColorKey/actualColorKey/message;
// block-exception carries specimenLetter/blockNumber/status/note) -
// this renders each type's own real fields, not a generic, lowest-
// common-denominator row.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import type { DispatchHistoryEntry } from '@/services/engravers/fetchDispatchHistoryForCase';

interface Props {
  entries: DispatchHistoryEntry[];
  colorNames: Record<string, string>;
}

function resolveColor(colorKey: string | undefined, colorNames: Record<string, string>): string | undefined {
  if (!colorKey) return undefined;
  return colorNames[colorKey] ?? colorKey;
}

function formatTimestamp(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }); }
  catch { return iso; }
}

const OUTCOME_BADGE: Record<string, { label: string; color: string }> = {
  dispatched: { label: 'Dispatched Cleanly', color: '#34d399' },
  fallback_used: { label: 'Fallback Used', color: '#f59e0b' },
  prompted: { label: 'Needs Decision', color: '#f59e0b' },
  error: { label: 'Dispatch Failed', color: '#f87171' },
};

const BLOCK_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  Lost: { label: 'Block Lost', color: '#f87171' },
  Damaged: { label: 'Block Damaged', color: '#f87171' },
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
      background: `${color}22`, color, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

const DispatchHistoryTimeline: React.FC<Props> = ({ entries, colorNames }) => {
  if (entries.length === 0) {
    return <div className="ps-mth-empty">No cassette dispatch or block exception events recorded yet for this case.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map((entry, i) => {
        if (entry.eventType === 'cassette-dispatch-outcome') {
          const { payload } = entry;
          const badge = OUTCOME_BADGE[payload.outcome] ?? { label: payload.outcome, color: '#8899aa' };
          const requested = resolveColor(payload.requestedColorKey, colorNames);
          const actual = resolveColor(payload.actualColorKey, colorNames);
          return (
            <div key={i} style={{ borderLeft: `3px solid ${badge.color}`, paddingLeft: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {payload.specimenLabel ? `Specimen ${payload.specimenLabel}` : 'Cassette dispatch'}
                </span>
                <Badge label={badge.label} color={badge.color} />
              </div>
              <div style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }}>
                Requested {requested}
                {actual && actual !== requested ? ` \u2192 Used ${actual}` : ''}
                {payload.message ? ` \u2014 ${payload.message}` : ''}
              </div>
              <div style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{formatTimestamp(entry.createdAt)}</div>
            </div>
          );
        }

        const { payload } = entry;
        const badge = BLOCK_STATUS_BADGE[payload.status] ?? { label: payload.status, color: '#8899aa' };
        return (
          <div key={i} style={{ borderLeft: `3px solid ${badge.color}`, paddingLeft: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {payload.specimenLetter}{payload.blockNumber}
              </span>
              <Badge label={badge.label} color={badge.color} />
            </div>
            {payload.note && <div style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }}>{payload.note}</div>}
            <div style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{formatTimestamp(entry.createdAt)}</div>
          </div>
        );
      })}
    </div>
  );
};

export default DispatchHistoryTimeline;
