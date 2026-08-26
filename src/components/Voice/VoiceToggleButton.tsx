// src/components/Voice/VoiceToggleButton.tsx
import React, { useState } from 'react';
import { useVoice } from '../../contexts/VoiceProvider';

const IS_DEV = (import.meta as any).env?.DEV ?? false;

export const VoiceToggleButton: React.FC = () => {
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
      ? 'Voice AI — click to enable'
      : IS_DEV
        ? 'Voice Local only (active voice model unavailable — check its provider API key)'
        : 'Click to enable voice'
    : isAi
      ? 'Voice AI active — click for Local'
      : isDictate
        ? 'Dictating — click to stop'
        : 'Voice Local — click to stop';

  // ── Disabled (master switch off) ──────────────────────────────────────────
  if (!voiceEnabled) {
    return (
      <div
        style={{ position: 'relative', display: 'inline-flex' }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <button
          disabled
          style={{
            background: 'transparent', border: 'none',
            color: '#334155', cursor: 'not-allowed',
            width: '40px', height: '40px', borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0.4,
          }}
        >
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
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', padding: '8px 12px',
            fontSize: '11px', color: '#94a3b8',
            whiteSpace: 'nowrap', zIndex: 10000, pointerEvents: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            Voice is disabled for this deployment
          </div>
        )}
      </div>
    );
  }

  // ── Active button ─────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => { if (!aiAvailable && IS_DEV) setShowTooltip(true); }}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        onClick={toggleVoice}
        title={(!aiAvailable && IS_DEV) ? undefined : title}
        style={{
          background:   isStandby ? 'transparent' : `${color}18`,
          border:       `1.5px solid ${isStandby ? 'rgba(255,255,255,0.1)' : color}`,
          color,
          cursor:       'pointer',
          width:        '40px', height: '40px', borderRadius: '10px',
          display:      'flex', alignItems: 'center', justifyContent: 'center',
          transition:   'all 0.15s', position: 'relative',
        }}
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
          <span style={{
            position: 'absolute', top: '-5px', right: '-5px',
            fontSize: '8px', fontWeight: 800,
            padding: '1px 4px', borderRadius: '99px',
            background: color, color: '#fff',
            letterSpacing: '0.04em', lineHeight: 1.4,
            border: '1.5px solid #0f172a',
          }}>
            AI
          </span>
        )}

        {/* Dictating pulse dot */}
        {isDictate && (
          <span style={{
            position: 'absolute', bottom: '-3px', right: '-3px',
            width: '8px', height: '8px', borderRadius: '50%',
            background: color, border: '1.5px solid #0f172a',
            animation: 'dictPulse 1s ease-in-out infinite',
          }} />
        )}
      </button>

      {/* Dev-only tooltip when AI unavailable */}
      {showTooltip && !aiAvailable && IS_DEV && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: '#0f172a', border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: '8px', padding: '8px 12px',
          fontSize: '11px', color: '#fbbf24',
          whiteSpace: 'nowrap', zIndex: 10000, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          ⚠️ AI refinement unavailable
          <div style={{ color: '#94a3b8', marginTop: '2px', fontSize: '10px' }}>
            No validated voice model configured, or its provider API key isn't set
          </div>
        </div>
      )}
    </div>
  );
};
