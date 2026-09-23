import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { VoiceSection } from '../Config/System/VoiceSection';
import { FootPedalSection } from '../Config/System/FootPedalSection';
import { useVoice } from '../../contexts/VoiceProvider';
import { VOICE_PROFILES, VoiceProfile, VoiceProfileId } from '../../constants/voiceProfiles';
import SpeechConfigTab from './SpeechConfigTab';

const VoiceSettings: React.FC = () => {
  const { t } = useTranslation();
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

  return (
    <div className="vset-root">

      {/* Deployment-level voice toggle — PathScribe staff */}
      <VoiceSection />

      {/* Divider */}
      <div className="vset-divider">
        <p className="vset-divider-label">{t('voiceSettings.userSettings')}</p>
      </div>

      {/* Persistence / Cloud Sync Indicator */}
      <div className="vset-sync-row">
        {isSaving  && <span className="vset-syncing">{t('voiceSettings.syncing')}</span>}
        {showSaved && <span className="vset-saved">{'✓ '}{t('voiceSettings.settingsSaved')}</span>}
      </div>

      {/* Top Row: Side-by-Side Hardware Widgets */}
      <div className="vset-hardware-row">

        {/* Accent Profile Card */}
        <div className="vset-card">
          <div>
            <h4 className="vset-card-label">{t('voiceSettings.accentProfileTitle')}</h4>
            <p className="vset-card-desc">
              {t('voiceSettings.accentProfileDesc')}
            </p>
          </div>
          <select
            value={accent || 'EN-US'}
            onChange={handleAccentChange}
            className="vset-select"
          >
            {VOICE_PROFILES.map((profile: VoiceProfile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </div>

        {/* Mic Sensitivity Card */}
        <div className="vset-card">
          <div>
            <div className="vset-mic-header">
              <h4 className="vset-card-label vset-card-label--tight">{t('voiceSettings.micSensitivityTitle')}</h4>
              <span className="vset-mic-value">85%</span>
            </div>
            <p className="vset-card-desc">
              {t('voiceSettings.agcDesc')}
            </p>
          </div>
          <input
            type="range"
            defaultValue={85}
            className="vset-range"
          />
        </div>
      </div>

      {/* Full Width: Speech Processing Rules */}
      <div className="vset-full-section">
        <div className="vset-full-section-header">
          <h3 className="vset-card-label vset-full-section-title">{t('voiceSettings.speechProcessingRulesTitle')}</h3>
          <p className="vset-full-section-desc">
            {t('voiceSettings.speechProcessingRulesDesc')}
          </p>
        </div>
        <SpeechConfigTab />
      </div>

      {/* Full Width: Foot Pedal binding — real feature, per direct
          follow-up: "Foot pedal support specifically." */}
      <div className="vset-full-section">
        <FootPedalSection />
      </div>

    </div>
  );
};

export default VoiceSettings;
