// src/components/Voice/VoiceToggleButton.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { useVoice } from '../../contexts/VoiceProvider';

const IS_DEV = (import.meta as any).env?.DEV ?? false;

export const VoiceToggleButton: React.FC = () => {
  const { t } = useTranslation();
  const { phase, commandPhase, toggleVoice, aiAvailable, voiceEnabled } = useVoice();
  const [showTooltip, setShowTooltip] = useState(false);

  const isStandby = phase === 'standby';
  const isAi      = phase === 'ai'    || (phase === 'dictate' && commandPhase === 'ai');
  const isDictate = phase === 'dictate';

  const color = isStandby  ? '#475569'
              : isDictate  ? '#22c55e'
              : isAi       ? '#0891B2'
              :               '#f59e0b';  // local = amber

  const title = isStandby
    ? aiAvailable
      ? t('voiceToggleButton.aiClickToEnable')
      : IS_DEV
        ? t('voiceToggleButton.localOnlyDev')
        : t('voiceToggleButton.clickToEnable')
    : isAi
      ? t('voiceToggleButton.aiActiveClickForLocal')
      : isDictate
        ? t('voiceToggleButton.dictatingClickToStop')
        : t('voiceToggleButton.localClickToStop');

  // ── Disabled (master switch off) ──────────────────────────────────────────
  if (!voiceEnabled) {
    return (
      <div
        className="vtb-wrap"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <button disabled className="vtb-btn vtb-btn--disabled">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <rect x="9" y="2" width="6" height="12" rx="3"/>
            <path d="M5 10a7 7 0 0 0 14 0"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8"  y1="23" x2="16" y2="23"/>
            <line x1="3"  y1="3"  x2="21" y2="21" strokeWidth="2"/>
          </svg>
        </button>
        {showTooltip && (
          <div className="vtb-tooltip">
            {t('voiceToggleButton.disabledForDeployment')}
          </div>
        )}
      </div>
    );
  }

  // ── Active button ─────────────────────────────────────────────────────────
  return (
    <div
      className="vtb-wrap"
      onMouseEnter={() => { if (!aiAvailable && IS_DEV) setShowTooltip(true); }}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        onClick={toggleVoice}
        title={(!aiAvailable && IS_DEV) ? undefined : title}
        className="vtb-btn"
        style={{
          '--vtb-bg':     isStandby ? 'transparent' : `${color}18`,
          '--vtb-border': isStandby ? 'rgba(255,255,255,0.1)' : color,
          '--vtb-color':  color,
        } as React.CSSProperties}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <rect x="9" y="2" width="6" height="12" rx="3"/>
          <path d="M5 10a7 7 0 0 0 14 0"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8"  y1="23" x2="16" y2="23"/>
        </svg>

        {/* AI badge */}
        {isAi && (
          <span className="vtb-ai-badge" style={{ '--vtb-badge-bg': color } as React.CSSProperties}>
            {t('voiceToggleButton.aiBadge')}
          </span>
        )}

        {/* Dictating pulse dot */}
        {isDictate && (
          <span className="vtb-pulse-dot" style={{ '--vtb-dot-bg': color } as React.CSSProperties} />
        )}
      </button>

      {/* Dev-only tooltip when AI unavailable */}
      {showTooltip && !aiAvailable && IS_DEV && (
        <div className="vtb-tooltip vtb-tooltip--warn">
          {'⚠️ '}{t('voiceToggleButton.aiRefinementUnavailable')}
          <div className="vtb-tooltip-sub">
            {t('voiceToggleButton.noValidatedModel')}
          </div>
        </div>
      )}
    </div>
  );
};
