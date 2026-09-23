import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { mockActionRegistryService } from '../../services/actionRegistry/mockActionRegistryService';
import { SystemAction, PendingMiss } from '../../services/actionRegistry/IActionRegistryService';
import { useVoice } from '../../contexts/VoiceProvider';

/**
 * Appears briefly when a voice command isn't recognised.
 * Shows up to 3 fuzzy candidates passed by the registry.
 * If the user clicks one, the miss is confirmed and that transcript is
 * learned for next time.
 *
 * If the user ignores it, it auto-dismisses after 6 seconds.
 * If the user fires a keyboard shortcut within 8 seconds, VoiceProvider
 * confirms the miss automatically (no UI needed).
 *
 * Not shown during dictate phase — word misses in dictation are not
 * command misses and should never surface this prompt.
 */
export const VoiceMissPrompt: React.FC = () => {
  const { t } = useTranslation();
  const { phase } = useVoice();

  const [miss,       setMiss]       = useState<PendingMiss | null>(null);
  const [candidates, setCandidates] = useState<SystemAction[]>([]);
  const [visible,    setVisible]    = useState(false);

  useEffect(() => {
    const unsub = mockActionRegistryService.onMissRecorded((m: PendingMiss, c: SystemAction[]) => {
      // Suppress during dictation — word misses are not command misses
      if (phase === 'dictate') return;
      setMiss(m);
      setCandidates(c);
      setVisible(true);
    });
    return unsub;
  }, [phase]);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [visible, miss]);

  const confirm = (actionId: string) => {
    if (!miss) return;
    mockActionRegistryService.confirmMiss(miss.id, actionId, 'manual');
    setVisible(false);
  };

  const dismiss = () => {
    if (miss) mockActionRegistryService.dismissMiss(miss.id);
    setVisible(false);
  };

  if (!visible || !miss) return null;

  return (
    <div className="vmp-toast">
      <div className="vmp-header">
        <div>
          <div className="vmp-eyebrow">
            {t('voiceMissPrompt.notRecognised')}
          </div>
          <div className="vmp-transcript">
            "{miss.transcript}"
          </div>
        </div>
        <button onClick={dismiss} className="vmp-dismiss-btn">x</button>
      </div>

      {candidates.length > 0 ? (
        <>
          <div className="vmp-candidates-label">
            {t('voiceMissPrompt.didYouMean')}
          </div>
          <div className="vmp-candidates-list">
            {candidates.map(c => (
              <button
                key={c.id}
                onClick={() => confirm(c.id)}
                className="vmp-candidate-btn"
              >
                <span>{c.label}</span>
                <span className="vmp-candidate-hint">{t('voiceMissPrompt.tapToLearn')}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="vmp-no-candidates">
          {t('voiceMissPrompt.noSimilarCommands')}
        </div>
      )}

      <style>{`
        @keyframes missIn {
          from { transform: translate(-50%, 12px); opacity: 0; }
          to   { transform: translate(-50%, 0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};
