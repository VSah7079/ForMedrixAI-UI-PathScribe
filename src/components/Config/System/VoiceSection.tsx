// src/components/Config/System/VoiceSection.tsx
// PathScribe admin toggle — enables or disables voice for a client deployment.
// One switch only. If the deployment has a Gemini key, users get AI + Local.
// If not, they get Local only. That's handled automatically — no config needed.

import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import '../../../pathscribe.css';
import { useSystemConfig } from '../../../contexts/SystemConfigContext';

export const VoiceSection: React.FC = () => {
  const { t } = useTranslation();
  const { config, updateConfig } = useSystemConfig();
  const enabled = config.voiceEnabled;

  return (
    <div className="config-section-container">
      <div className="config-section-header">
        <h2 className="config-section-title">🎙️ {t('voiceSection.title')}</h2>
        <p className="config-section-description">
          {t('voiceSection.description')}
        </p>
      </div>

      <div className="config-section-body">
        <div className="ps-form-row config-toggle-row">
          <div className="config-toggle-row__text">
            <div className="ps-conf-field-title">
              {t('voiceSection.fieldTitle')}
            </div>
            <div className="ps-conf-field-desc">
              {t('voiceSection.fieldDesc')}
            </div>
          </div>
          <label className="config-toggle-wrap">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => updateConfig({ voiceEnabled: e.target.checked })}
              style={{ display: 'none' }}
            />
            <div className={`config-toggle-track config-toggle-track--${enabled ? 'on' : 'off'}`}>
              <div className={`config-toggle-thumb${enabled ? ' config-toggle-thumb--on' : ''}`} />
            </div>
            <span className={`config-toggle-label config-toggle-label--${enabled ? 'on' : 'off'}`}>
              {enabled ? t('voiceSection.toggleOn') : t('voiceSection.toggleOff')}
            </span>
          </label>
        </div>

        <div className="config-staff-note">
          <strong>{t('voiceSection.staffNote.label')}</strong>{' '}
          <Trans
            i18nKey="voiceSection.staffNote.body"
            components={{ code: <code /> }}
          />
        </div>
      </div>
    </div>
  );
};
