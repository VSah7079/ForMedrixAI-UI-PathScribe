import React, { useState } from 'react';
import { VoiceSection } from '../Config/System/VoiceSection';
import { FootPedalSection } from '../Config/System/FootPedalSection';
import { useVoice } from '../../contexts/VoiceProvider';
import { VOICE_PROFILES, VoiceProfile, VoiceProfileId } from '../../constants/voiceProfiles';
import SpeechConfigTab from './SpeechConfigTab';

const VoiceSettings: React.FC = () => {
  const { accent, setAccent } = useVoice();
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const handleAccentChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAccent = e.target.value as VoiceProfileId;
    setIsSaving(true);
    setShowSaved(false);

    await setAccent(newAccent);

    setIsSaving(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 3000);
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(30, 41, 59, 0.5)',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  };

  const labelStyle: React.CSSProperties = {
    color: '#f1f5f9',
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '4px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Deployment-level voice toggle — PathScribe staff */}
      <VoiceSection />

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '8px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '20px' }}>User Settings</p>
      </div>

      {/* Persistence / Cloud Sync Indicator */}
      <div style={{ height: '20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
        {isSaving  && <span style={{ color: '#0891b2', fontSize: '12px' }}>Syncing...</span>}
        {showSaved && <span style={{ color: '#22c55e', fontSize: '12px' }}>✓ Settings saved to cloud</span>}
      </div>

      {/* Top Row: Side-by-Side Hardware Widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

        {/* Accent Profile Card */}
        <div style={cardStyle}>
          <div>
            <h4 style={labelStyle}>Regional Accent Profile</h4>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
              Optimizes phoneme mapping for specific medical dictation styles.
            </p>
          </div>
          <select
            value={accent || 'EN-US'}
            onChange={handleAccentChange}
            style={{
              width: '100%', padding: '12px',
              background: '#0f172a', border: '1px solid #334155',
              borderRadius: '8px', color: '#f1f5f9',
              fontSize: '14px', outline: 'none', cursor: 'pointer',
            }}
          >
            {VOICE_PROFILES.map((profile: VoiceProfile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </div>

        {/* Mic Sensitivity Card */}
        <div style={cardStyle}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h4 style={{ ...labelStyle, marginBottom: 0 }}>Mic Sensitivity</h4>
              <span style={{ color: '#0891b2', fontWeight: 700, fontFamily: 'monospace' }}>85%</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
              Automatic Gain Control (AGC) is managed by the browser engine.
            </p>
          </div>
          <input
            type="range"
            defaultValue={85}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#0891b2' }}
          />
        </div>
      </div>

      {/* Full Width: Speech Processing Rules */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ marginBottom: '16px', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
          <h3 style={{ ...labelStyle, fontSize: '18px', marginBottom: '4px' }}>Speech Processing Rules</h3>
          <p style={{ color: '#64748b', fontSize: '14px' }}>
            Configure how the voice engine interprets triggers and expands clinical shorthand.
          </p>
        </div>
        <SpeechConfigTab />
      </div>

      {/* Full Width: Foot Pedal binding — real feature, per direct
          follow-up: "Foot pedal support specifically." */}
      <div style={{ marginTop: '8px' }}>
        <FootPedalSection />
      </div>

    </div>
  );
};

export default VoiceSettings;
