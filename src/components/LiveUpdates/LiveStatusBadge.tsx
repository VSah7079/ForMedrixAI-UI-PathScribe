// src/components/LiveUpdates/LiveStatusBadge.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-262: shows whether an intraoperative screen is receiving live updates
// (the hub), only local ones (no hub configured), or is reconnecting /
// offline and polling meanwhile. Visual only (no sound in the OR).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FALLBACK_POLL_MS, type LiveConnectionState } from '@/services/liveUpdates/liveUpdatePolicy';

export const LiveStatusBadge: React.FC<{ state: LiveConnectionState; className?: string }> = ({ state, className }) => {
  const { t } = useTranslation();
  if (state === 'idle') return null;
  const seconds = Math.round(FALLBACK_POLL_MS / 1000);
  return (
    <span
      className={`ps-live-badge ps-live-badge--${state}${className ? ` ${className}` : ''}`}
      title={t(`liveUpdates.hint.${state}`, { seconds })}
      role="status"
      aria-live="polite"
    >
      <span className="ps-live-badge__dot" aria-hidden="true" />
      {t(`liveUpdates.status.${state}`)}
    </span>
  );
};
