// src/components/Config/System/TemplateGovernanceSection.tsx
// ─────────────────────────────────────────────────────────────────────────────
// PS-63 (Batch 328): Configuration → System → Administration & Compliance →
// Template Review. The site's two template review settings:
//
//   Allow Template Self-Approval   default Disabled (Block)
//   Required Reviewers             default 1 independent reviewer
//
// Rules: services/templates/templatePublishingRules.ts. Storage and the
// audit entry: services/templates/templateGovernanceSettings.ts. Uses the
// shared ps-rbuf-* setting-row styles (see ReleaseBufferSection.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../pathscribe.css';
import { auditService } from '../../../services';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getTemplateGovernanceSettings, saveTemplateGovernanceWithAudit,
} from '../../../services/templates/templateGovernanceSettings';
import {
  REQUIRED_REVIEWERS_MIN, REQUIRED_REVIEWERS_MAX, SNOMED_PUBLISH_THRESHOLD,
  type TemplateGovernanceSettings,
} from '../../../services/templates/templatePublishingRules';

const REVIEWER_CHOICES = Array.from(
  { length: REQUIRED_REVIEWERS_MAX - REQUIRED_REVIEWERS_MIN + 1 },
  (_, i) => REQUIRED_REVIEWERS_MIN + i,
);

const TemplateGovernanceSection: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [settings, setSettings] = useState<TemplateGovernanceSettings>(() => getTemplateGovernanceSettings());
  const [saved, setSaved] = useState(false);

  const persist = async (next: Partial<TemplateGovernanceSettings>) => {
    const result = await saveTemplateGovernanceWithAudit(next, { auditService, userName: user?.name ?? 'Unknown User' });
    setSettings(result);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div className="ps-rbuf-header">
        <h2 className="ps-rbuf-title">{t('templateGovernanceSection.title')}</h2>
        <p className="ps-rbuf-subtitle">{t('templateGovernanceSection.subtitle', { threshold: SNOMED_PUBLISH_THRESHOLD })}</p>
      </div>

      <div className="ps-rbuf-setting-row">
        <div className="ps-rbuf-setting-row-text">
          <div className="ps-rbuf-setting-row-label">{t('templateGovernanceSection.selfApproval.label')}</div>
          <div className="ps-rbuf-setting-row-desc">{t('templateGovernanceSection.selfApproval.description')}</div>
        </div>
        <div className="ps-rbuf-setting-row-control">
          <button
            role="switch"
            aria-checked={settings.allowSelfApproval}
            aria-label={t('templateGovernanceSection.selfApproval.label')}
            onClick={() => persist({ allowSelfApproval: !settings.allowSelfApproval })}
            className={`ps-rbuf-toggle ${settings.allowSelfApproval ? 'ps-rbuf-toggle--on' : 'ps-rbuf-toggle--off'}`}
          >
            <span className={`ps-rbuf-toggle-thumb ${settings.allowSelfApproval ? 'ps-rbuf-toggle-thumb--on' : 'ps-rbuf-toggle-thumb--off'}`} />
          </button>
        </div>
      </div>

      <div className="ps-rbuf-setting-row">
        <div className="ps-rbuf-setting-row-text">
          <div className="ps-rbuf-setting-row-label">{t('templateGovernanceSection.requiredReviewers.label')}</div>
          <div className="ps-rbuf-setting-row-desc">{t('templateGovernanceSection.requiredReviewers.description')}</div>
        </div>
        <div className="ps-rbuf-setting-row-control">
          <select
            aria-label={t('templateGovernanceSection.requiredReviewers.label')}
            value={settings.requiredReviewers}
            onChange={e => persist({ requiredReviewers: Number(e.target.value) })}
            className="ps-rbuf-input ps-rbuf-input--enabled"
          >
            {REVIEWER_CHOICES.map(n => (
              <option key={n} value={n}>{t('templateGovernanceSection.requiredReviewers.option', { count: n })}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="ps-tgov-roles-note">{t('templateGovernanceSection.rolesNote')}</p>

      {saved && <div className="ps-rbuf-saved">{t('templateGovernanceSection.saved')}</div>}
    </div>
  );
};

export default TemplateGovernanceSection;
