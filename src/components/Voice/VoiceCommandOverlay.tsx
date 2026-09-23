import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { mockActionRegistryService } from '../../services/actionRegistry/mockActionRegistryService';
import { SystemAction } from '../../services/actionRegistry/IActionRegistryService';
import { useVoice } from '../../contexts/VoiceProvider';

interface VoiceCommandOverlayProps {
  /**
   * Show the success flash when a command is recognised.
   * Default: false (production behaviour — the UI change is confirmation enough).
   * Set to true during development/testing for visibility.
   */
  showSuccess?: boolean;
}

export const VoiceCommandOverlay: React.FC<VoiceCommandOverlayProps> = ({
  showSuccess = false,
}) => {
  const { t } = useTranslation();
  const { phase, transcript, dictationTarget, stopDictation, isRefining } = useVoice();

  const [status, setStatus]   = useState<'success' | 'fail' | null>(null);
  const [data, setData]       = useState<{ label?: string; shortcut?: string; transcript?: string } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showSuccessToast = (action: SystemAction) => {
      if (!showSuccess) return;
      setData({ label: action.label, shortcut: action.shortcut });
      setStatus('success');
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    };

    const showFailToast = (transcript: string) => {
      // Failure feedback is always shown — it's actionable, not noise.
      // VoiceMissPrompt handles the "did you mean?" candidates above this.
      setData({ transcript });
      setStatus('fail');
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    };

    const unSubSuccess = mockActionRegistryService.onActionExecuted(showSuccessToast);
    const unSubFail    = mockActionRegistryService.onActionFailed(showFailToast);

    return () => { unSubSuccess(); unSubFail(); };
  }, [showSuccess]);

  // ── Dictation banner — always shown while dictating ───────────────────────
  if (phase === 'dictate' && dictationTarget) {
    return (
      <div className="vco-dictation-banner" style={{ '--vco-border': isRefining ? '#38bdf8' : '#22c55e' } as React.CSSProperties}>
        <div className="vco-dictation-dot" style={{ '--vco-dot-bg': isRefining ? '#38bdf8' : '#22c55e' } as React.CSSProperties} />
        <div className="vco-dictation-body">
          <div className="vco-dictation-eyebrow">
            {t('voiceCommandOverlay.dictatingInto')}
          </div>
          <div className="vco-dictation-target">
            {dictationTarget.label}
          </div>
          {isRefining ? (
            <div className="vco-refining-row">
              <div className="vco-refining-dot vco-refining-dot--1" />
              <div className="vco-refining-dot vco-refining-dot--2" />
              <div className="vco-refining-dot vco-refining-dot--3" />
              <span className="vco-refining-label">
                {t('voiceCommandOverlay.refining')}
              </span>
            </div>
          ) : transcript ? (
            <div className="vco-transcript">
              "{transcript}"
            </div>
          ) : null}
        </div>
        <button
          onClick={stopDictation}
          title={t('voiceCommandOverlay.sayDoneOrClick')}
          className="vco-done-btn"
        >
          {t('voiceCommandOverlay.done')}
        </button>
        <style>{`
          @keyframes popIn {
            from { transform: translate(-50%, 16px); opacity: 0; }
            to   { transform: translate(-50%, 0);    opacity: 1; }
          }
          @keyframes dictPulse {
            0%, 100% { opacity: 1;   transform: scale(1);   }
            50%       { opacity: 0.3; transform: scale(1.5); }
          }
        `}</style>
      </div>
    );
  }

  // ── Command feedback flash ────────────────────────────────────────────────
  if (!visible || !data) return null;

  const isSuccess = status === 'success';

  return (
    <div
      className="vco-flash"
      style={{
        '--vco-flash-border': isSuccess ? '#38bdf8' : '#f59e0b',
        '--vco-flash-shadow': isSuccess ? '#38bdf844' : '#f59e0b44',
      } as React.CSSProperties}
    >
      <span className="vco-flash-icon">{isSuccess ? '⚡' : '❓'}</span>
      <div className="vco-flash-text">
        <div className="vco-flash-eyebrow">
          {isSuccess ? t('voiceCommandOverlay.commandExecuted') : t('voiceCommandOverlay.unrecognisedCommand')}
        </div>
        <div className="vco-flash-label">
          {isSuccess ? data.label : `"${data.transcript}"`}
        </div>
      </div>
      {isSuccess && data.shortcut && (
        <div className="vco-flash-shortcut">
          {data.shortcut}
        </div>
      )}
      <style>{`
        @keyframes popIn {
          from { transform: translate(-50%, 20px); opacity: 0; }
          to   { transform: translate(-50%, 0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};
