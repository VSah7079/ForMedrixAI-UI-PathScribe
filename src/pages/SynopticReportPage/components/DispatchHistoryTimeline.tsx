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

//
// i18n note: `payload.message` (CassetteDispatchOutcomeEventPayload)
// and `payload.note` (BlockExceptionEventPayload) are both real, free
// text from an external system/middleware or a user's own manual
// entry — shown as-is per those types' own header comments, never
// translated. `payload.outcome`/`payload.status` are real, persisted
// enum values, so OUTCOME_BADGE/BLOCK_STATUS_BADGE carry a `labelKey`
// per entry instead of a literal `label`, resolved with `t()` at each
// render site.

import React from 'react';
import { useTranslation } from 'react-i18next';
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

const OUTCOME_BADGE: Record<string, { labelKey: string; color: string }> = {
  dispatched: { labelKey: 'dispatchHistoryTimeline.outcomeLabels.dispatched', color: '#34d399' },
  fallback_used: { labelKey: 'dispatchHistoryTimeline.outcomeLabels.fallbackUsed', color: '#f59e0b' },
  prompted: { labelKey: 'dispatchHistoryTimeline.outcomeLabels.prompted', color: '#f59e0b' },
  error: { labelKey: 'dispatchHistoryTimeline.outcomeLabels.error', color: '#f87171' },
};

const BLOCK_STATUS_BADGE: Record<string, { labelKey: string; color: string }> = {
  Lost: { labelKey: 'dispatchHistoryTimeline.blockStatusLabels.lost', color: '#f87171' },
  Damaged: { labelKey: 'dispatchHistoryTimeline.blockStatusLabels.damaged', color: '#f87171' },
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="ps-dht-badge" style={{ background: `${color}22`, color }}>
      {label}
    </span>
  );
}

const DispatchHistoryTimeline: React.FC<Props> = ({ entries, colorNames }) => {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return <div className="ps-mth-empty">{t('dispatchHistoryTimeline.emptyState')}</div>;
  }

  return (
    <div className="ps-dht-list">
      {entries.map((entry, i) => {
        if (entry.eventType === 'cassette-dispatch-outcome') {
          const { payload } = entry;
          const badge: { labelKey?: string; color: string } = OUTCOME_BADGE[payload.outcome] ?? { color: '#8899aa' };
          const badgeLabel = badge.labelKey ? t(badge.labelKey) : payload.outcome;
          const requested = resolveColor(payload.requestedColorKey, colorNames);
          const actual = resolveColor(payload.actualColorKey, colorNames);
          return (
            <div key={i} className="ps-dht-entry" style={{ borderLeftColor: badge.color }}>
              <div className="ps-dht-entry-row">
                <span className="ps-dht-entry-title">
                  {payload.specimenLabel ? t('dispatchHistoryTimeline.specimenLabel', { label: payload.specimenLabel }) : t('dispatchHistoryTimeline.cassetteDispatch')}
                </span>
                <Badge label={badgeLabel} color={badge.color} />
              </div>
              <div className="ps-dht-entry-detail">
                {t('dispatchHistoryTimeline.requestedColor', { color: requested })}
                {actual && actual !== requested ? ` \u2192 ${t('dispatchHistoryTimeline.usedColor', { color: actual })}` : ''}
                {payload.message ? ` \u2014 ${payload.message}` : ''}
              </div>
              <div className="ps-dht-entry-timestamp">{formatTimestamp(entry.createdAt)}</div>
            </div>
          );
        }

        const { payload } = entry;
        const badge: { labelKey?: string; color: string } = BLOCK_STATUS_BADGE[payload.status] ?? { color: '#8899aa' };
        const badgeLabel = badge.labelKey ? t(badge.labelKey) : payload.status;
        return (
          <div key={i} className="ps-dht-entry" style={{ borderLeftColor: badge.color }}>
            <div className="ps-dht-entry-row">
              <span className="ps-dht-entry-title">
                {payload.specimenLetter}{payload.blockNumber}
              </span>
              <Badge label={badgeLabel} color={badge.color} />
            </div>
            {payload.note && <div className="ps-dht-entry-detail">{payload.note}</div>}
            <div className="ps-dht-entry-timestamp">{formatTimestamp(entry.createdAt)}</div>
          </div>
        );
      })}
    </div>
  );
};

export default DispatchHistoryTimeline;
