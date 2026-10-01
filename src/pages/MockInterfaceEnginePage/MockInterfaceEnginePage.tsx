// src/pages/MockInterfaceEnginePage/MockInterfaceEnginePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Is there a way to test the [PS-239]
// endpoint using mock data since the back end isn't finished?" — see
// services/mockInterfaceEngine/mockInterfaceEngineSettings.ts's own
// header for the full account of what this is, why it's safely gated,
// and exactly what it does and doesn't affect.
//
// Real, deliberate placement: NOT linked from Config, the home page,
// or any real navigation — a real admin/clinical user should never
// stumble onto a dev tool that fakes a backend response. Reachable
// only via its own direct route, told to the person who asked for it.
// ─────────────────────────────────────────────────────────────────────────────

//
// i18n note: `mode` itself ('always_succeed'/'always_fail'/'timeout')
// is a real, persisted settings enum value — MODE_LABEL_KEY/
// MODE_DESCRIPTION_KEY carry a translation key per entry, resolved
// with `t()` at each render site, rather than the raw
// `mode.replace(/_/g, ' ')` display used before. The literal API path
// (`POST /api/v1/events/molecular-worklist`) and ticket reference
// (PS-239) are real, internal identifiers, left as-is inside their
// own `<Trans>` component slots.

import React, { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { getMockInterfaceEngineSettings, setMockInterfaceEngineSettings } from '../../services/mockInterfaceEngine/mockInterfaceEngineSettings';
import type { MockInterfaceEngineMode, MockInterfaceEngineSettings } from '../../services/mockInterfaceEngine/mockInterfaceEngineSettings';

const MODE_LABEL_KEY: Record<MockInterfaceEngineMode, string> = {
  always_succeed: 'mockInterfaceEnginePage.modeLabels.alwaysSucceed',
  always_fail: 'mockInterfaceEnginePage.modeLabels.alwaysFail',
  timeout: 'mockInterfaceEnginePage.modeLabels.timeout',
};

const MODE_DESCRIPTION_KEY: Record<MockInterfaceEngineMode, string> = {
  always_succeed: 'mockInterfaceEnginePage.modeDescriptions.alwaysSucceed',
  always_fail: 'mockInterfaceEnginePage.modeDescriptions.alwaysFail',
  timeout: 'mockInterfaceEnginePage.modeDescriptions.timeout',
};

const MockInterfaceEnginePage: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<MockInterfaceEngineSettings>(getMockInterfaceEngineSettings());
  const [workerStatus, setWorkerStatus] = useState<'stopped' | 'starting' | 'running'>('stopped');

  useEffect(() => {
    if (settings.enabled) startWorker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startWorker = async () => {
    setWorkerStatus('starting');
    const { mockInterfaceEngineWorker } = await import('../../mocks/browser');
    await mockInterfaceEngineWorker.start({ onUnhandledRequest: 'bypass' });
    setWorkerStatus('running');
  };

  const stopWorker = async () => {
    const { mockInterfaceEngineWorker } = await import('../../mocks/browser');
    mockInterfaceEngineWorker.stop();
    setWorkerStatus('stopped');
  };

  const updateSettings = (patch: Partial<MockInterfaceEngineSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setMockInterfaceEngineSettings(next);
  };

  const handleToggleEnabled = async () => {
    const nextEnabled = !settings.enabled;
    updateSettings({ enabled: nextEnabled });
    if (nextEnabled) await startWorker();
    else await stopWorker();
  };

  return (
    <div className="ps-app-root ps-page-container ps-page-container--narrow">
      <div className="ps-mie-banner">
        <Trans
          i18nKey="mockInterfaceEnginePage.devToolBanner"
          components={{ code: <code /> }}
        />
      </div>

      <h1 className="ps-page-title">{t('mockInterfaceEnginePage.title')}</h1>
      <p className="ps-page-subtitle ps-mie-subtitle">
        {t('mockInterfaceEnginePage.subtitle')}
      </p>

      <div className="ps-panel-box ps-mb-20">
        <div className="ps-flex-row-gap-8 ps-flex-row-gap-8--between">
          <div>
            <strong>{settings.enabled ? t('aiTab.enabledLabel') : t('actionsTab.table.disabled')}</strong>
            <span className="ps-helper-text ps-ml-8">
              {workerStatus === 'running' ? t('mockInterfaceEnginePage.status.intercepting') : workerStatus === 'starting' ? t('mockInterfaceEnginePage.status.starting') : t('mockInterfaceEnginePage.status.notIntercepting')}
            </span>
          </div>
          <button className="ps-conf-btn-secondary" onClick={handleToggleEnabled}>
            {settings.enabled ? t('templateAssemblyPage.disableTooltip') : t('templateAssemblyPage.enableTooltip')}
          </button>
        </div>
      </div>

      <div className="ps-panel-box">
        <h3 className="ps-panel-heading">{t('mockInterfaceEnginePage.responseModeHeading')}</h3>
        {(['always_succeed', 'always_fail', 'timeout'] as MockInterfaceEngineMode[]).map(mode => (
          <label key={mode} className="ps-mie-radio-label">
            <input type="radio" name="mie-mode" checked={settings.mode === mode} onChange={() => updateSettings({ mode })} className="ps-mr-8" />
            <strong>{t(MODE_LABEL_KEY[mode])}</strong>
            <div className="ps-helper-text ps-ml-22">{t(MODE_DESCRIPTION_KEY[mode])}</div>
          </label>
        ))}

        {settings.mode === 'always_fail' && (
          <div className="ps-mt-12">
            <label className="ps-label" htmlFor="mie-failure-status">{t('mockInterfaceEnginePage.failureHttpStatusLabel')}</label>
            <input
              id="mie-failure-status"
              className="ps-input-dark"
              type="number"
              value={settings.failureStatus}
              onChange={e => updateSettings({ failureStatus: Number(e.target.value) || 500 })}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MockInterfaceEnginePage;
