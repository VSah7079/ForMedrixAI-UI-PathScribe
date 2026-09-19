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
// stays sign-out-dictation-only — see FOOT_PEDAL_ACTION_LABELS's own
// doc comment for the full, real per-page mapping.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import '../../../pathscribe.css';
import { useFootPedal } from '@/hooks/useFootPedal';
import {
  FOOT_PEDAL_ACTION_LABELS, describeFootPedalInput,
  type FootPedalAction,
} from '@/types/footPedal/FootPedalConfig';

const ACTIONS: FootPedalAction[] = ['pedal1_pushToTalk', 'pedal2_nextField', 'pedal3_pauseReplay'];

export const FootPedalSection: React.FC = () => {
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
        <h2 className="config-section-title">🦶 Foot Pedal (This Workstation)</h2>
        <p className="config-section-description">
          Bind a real, connected foot pedal's buttons to the 3 real actions
          below. Works with both true HID-class pedals and the more common
          keyboard-emulating kind — press the real pedal you want to bind and
          PathScribe learns whatever it actually sends, no manual keycode
          entry needed. Bound to this browser/workstation, not your account —
          the physical pedal doesn't change when a different pathologist or
          tech logs in on the same machine. Each pedal's real action depends
          on which page is open when you press it — see each label below.
        </p>
      </div>

      <div className="config-section-body">
        {ACTIONS.map(action => {
          const binding = bindings[action];
          const isCapturing = capturingAction === action;
          return (
            <div key={action} className="ps-form-row" style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', marginBottom: '3px' }}>
                  {FOOT_PEDAL_ACTION_LABELS[action]}
                </div>
                <div style={{ fontSize: '12px', color: isCapturing ? '#0891B2' : '#64748b' }}>
                  {isCapturing
                    ? 'Press the real pedal button now…'
                    : binding
                      ? describeFootPedalInput(binding)
                      : 'Not bound'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '24px' }}>
                {isCapturing ? (
                  <button className="ps-conf-btn-secondary" onClick={handleCancelCapture}>Cancel</button>
                ) : (
                  <>
                    <button className="ps-conf-btn-secondary" onClick={() => handleBind(action)}>
                      {binding ? 'Rebind' : 'Bind'}
                    </button>
                    {binding && (
                      <button className="ps-conf-btn-secondary" onClick={() => clearBinding(action)}>Clear</button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div style={{
          marginTop: '16px', padding: '12px 16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '10px',
          fontSize: '12px', color: '#64748b', lineHeight: 1.6,
        }}>
          <strong style={{ color: '#94a3b8', fontWeight: 600 }}>Pedal 3 note:</strong>{' '}
          Sign-out dictation only. "Pause" always works once bound. "Replay"
          additionally needs microphone access — the first sign-out session
          after binding may prompt for it.
        </div>
      </div>
    </div>
  );
};

export default FootPedalSection;
