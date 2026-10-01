// src/components/Config/System/FootPedalSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Foot pedal support specifically
// (the one part confirmed to not exist at all)." Deliberately a
// per-workstation setting (see useFootPedal.ts's own header comment),
// not a per-deployment admin toggle like Voice Integration above it on
// this same page — grouped here for real, practical discoverability
// (this is the "Voice" config area a pathologist would actually think
// to look in for a voice-adjacent hardware setting), not because it's
// the same kind of setting.
//
// Real, per direct follow-up ("these foot pedals are ubiquitous and we
// must support them"): the 3 bindings below are no longer
// sign-out-dictation-only. Pedal 1 also confirms piece count on
// EmbeddingStationPage.tsx (PS-285's own "hands-free triggers for
// piece-count confirmation"); Pedal 2 also fires "Print/Etch Next" on
// MicrotomyWorkstationPage.tsx (PS-284's own named trigger). Pedal 3
// stays sign-out-dictation-only — see FootPedalConfig.ts's own doc
// comment for the full, real per-page mapping.
//
// i18n sweep (batch 39): all on-screen text (including the action
// labels and "what's bound" description, both previously hardcoded
// English in FootPedalConfig.ts) now goes through a new
// `footPedalSection` namespace — see that file's own updated header.
// Inline layout styles moved to a new `.config-footpedal-*` family
// (matching this file's own `.config-section-*` naming); the per-row
// wrapper reuses the existing `.ps-form-row` class (border-bottom
// matches exactly) combined with a `.config-footpedal-row` padding
// modifier, the same override-via-cascade approach used for
// `.config-toggle-row`/`.ps-form-row` in VoiceSection.tsx (batch 36).
// The footer note reuses the existing `.config-staff-note` class
// (added in batch 36) combined with a margin-top modifier — its
// `strong` sub-selector already matches this note's label styling
// exactly, so no extra class is needed there.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { useFootPedal } from '@/hooks/useFootPedal';
import {
  FOOT_PEDAL_ACTION_LABEL_KEYS, describeFootPedalInput,
  type FootPedalAction,
} from '@/types/footPedal/FootPedalConfig';

const ACTIONS: FootPedalAction[] = ['pedal1_pushToTalk', 'pedal2_nextField', 'pedal3_pauseReplay'];

export const FootPedalSection: React.FC = () => {
  const { t } = useTranslation();
  // No real actions wired here — this screen only binds inputs to
  // actions, it never fires them (that's Grossing's own use of this
  // same hook, with the same real bindings already saved).
  const { bindings, setBinding, clearBinding, captureNextInput, cancelCapture } = useFootPedal({ actions: {} });
  const [capturingAction, setCapturingAction] = useState<FootPedalAction | null>(null);

  const handleBind = async (action: FootPedalAction) => {
    setCapturingAction(action);
    const input = await captureNextInput();
    setBinding(action, input);
    setCapturingAction(null);
  };

  const handleCancelCapture = () => {
    cancelCapture();
    setCapturingAction(null);
  };

  return (
    <div className="config-section-container">
      <div className="config-section-header">
        <h2 className="config-section-title">🦶 {t('footPedalSection.title')}</h2>
        <p className="config-section-description">
          {t('footPedalSection.description')}
        </p>
      </div>

      <div className="config-section-body">
        {ACTIONS.map(action => {
          const binding = bindings[action];
          const isCapturing = capturingAction === action;
          return (
            <div key={action} className="ps-form-row config-footpedal-row">
              <div className="config-footpedal-row__text">
                <div className="config-footpedal-row__label">
                  {t(FOOT_PEDAL_ACTION_LABEL_KEYS[action])}
                </div>
                <div className={`config-footpedal-row__status config-footpedal-row__status--${isCapturing ? 'capturing' : 'idle'}`}>
                  {isCapturing
                    ? t('footPedalSection.capturingPrompt')
                    : binding
                      ? describeFootPedalInput(binding, t)
                      : t('footPedalSection.notBound')}
                </div>
              </div>
              <div className="config-footpedal-row__actions">
                {isCapturing ? (
                  <button className="ps-conf-btn-secondary" onClick={handleCancelCapture}>{t('footPedalSection.buttons.cancel')}</button>
                ) : (
                  <>
                    <button className="ps-conf-btn-secondary" onClick={() => handleBind(action)}>
                      {binding ? t('footPedalSection.buttons.rebind') : t('footPedalSection.buttons.bind')}
                    </button>
                    {binding && (
                      <button className="ps-conf-btn-secondary" onClick={() => clearBinding(action)}>{t('footPedalSection.buttons.clear')}</button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div className="config-staff-note config-footpedal-note">
          <strong>{t('footPedalSection.pedal3Note.label')}</strong>{' '}
          {t('footPedalSection.pedal3Note.body')}
        </div>
      </div>
    </div>
  );
};

export default FootPedalSection;
