// src/components/Config/AI/AiProviderSettings.tsx
// ─────────────────────────────────────────────────────────────
// Admin UI for configuring the org-level AI provider.
// Accessible from Settings → AI Provider.
//
// Admins select the provider and model; API keys are configured
// in the backend secrets manager and never entered here.
// Developers can set a personal override (with key) for local testing.
//
// Labels/notes below deliberately show real vendor and model names —
// unlike the internal AiProviderId type (protocol-shape-named, see
// aiProviderConfig.ts), an admin picking a provider here needs to know
// which real vendor account/contract they're actually configuring.
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  resolveAiConfig,
  setOrgAiConfig,
  setUserAiConfig,
  clearUserAiConfig,
  isDevMode,
  PROVIDER_MODELS,
  type AiProviderId,
  type AiProviderConfig,
} from '@/components/Config/AI/aiProviderConfig';

// Real, per this file's own header — these vendor/model labels and their
// notes deliberately show real, literal vendor and product names (proper
// nouns), same as any other real, fixed brand vocabulary in this app —
// never translated in any locale, the same way CAP/RCPath/SNOMED CT etc.
// stay literal. "Mock — Demo Mode" and "Self-hosted / Custom endpoint" are
// kept alongside them for the same reason: this whole map is deliberately
// literal, real reference text an admin needs verbatim to identify which
// real vendor account/contract they're configuring.
const PROVIDER_LABELS: Record<AiProviderId, string> = {
  structured_messages:      'Anthropic (Claude)',
  chat_completions:         'OpenAI (GPT-4)',
  chat_completions_managed: 'Azure OpenAI',
  model_gateway:            'AWS Bedrock',
  structured_content:       'Google (Gemini)',
  mock:                     'Mock — Demo Mode',
  custom:                   'Self-hosted / Custom endpoint',
};

const PROVIDER_NOTES: Record<AiProviderId, string> = {
  structured_messages:      'API key managed server-side. Contact PathScribe support to rotate keys.',
  chat_completions:         'API key managed server-side. Contact PathScribe support to rotate keys.',
  chat_completions_managed: 'Requires Azure deployment name and endpoint. Key managed server-side.',
  model_gateway:            'Uses IAM role credentials on the server. No API key needed here.',
  structured_content:       'API key managed server-side. Contact PathScribe support to rotate keys.',
  mock:                     'No API connection. Returns instant deterministic responses. Use for demos and offline testing only.',
  custom:                   'Must be an OpenAI-compatible endpoint. Auth managed server-side.',
};

interface AiProviderSettingsProps {
  /** true = org admin view (saves org config), false = dev override view */
  isAdmin?: boolean;
  onSaved?: () => void;
}

const AiProviderSettings: React.FC<AiProviderSettingsProps> = ({
  isAdmin = false,
  onSaved,
}) => {
  const { t } = useTranslation();
  const rawConfig = resolveAiConfig();
  // Guard: if the stored providerId isn't a known key (e.g. after a host
  // migration corrupted / cleared localStorage), fall back to
  // 'structured_messages' so PROVIDER_MODELS[providerId] is never undefined.
  const current = PROVIDER_MODELS[rawConfig.providerId]
    ? rawConfig
    : { ...rawConfig, providerId: 'structured_messages' as AiProviderId, modelId: PROVIDER_MODELS['structured_messages'][0].id };

  const [providerId,    setProviderId]    = useState<AiProviderId>(current.providerId);
  const [modelId,       setModelId]       = useState(current.modelId);
  const [managedEndpoint, setManagedEndpoint] = useState(current.managedEndpoint ?? '');
  const [managedDeployment, setManagedDeployment] = useState(current.managedDeploymentName ?? '');
  const [gatewayRegion, setGatewayRegion] = useState(current.gatewayRegion ?? 'us-east-1');
  const [customEndpoint,setCustomEndpoint]= useState(current.customEndpoint ?? '');
  const [devApiKey,     setDevApiKey]     = useState('');
  const [saved,         setSaved]         = useState(false);
  const [testResult,    setTestResult]    = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testError,     setTestError]     = useState('');

  // When provider changes, reset model to first available
  useEffect(() => {
    const models = PROVIDER_MODELS[providerId];
    if (models?.length) setModelId(models[0].id);
  }, [providerId]);

  const handleSave = () => {
    const config = {
      providerId,
      modelId,
      managedDeploymentName: managedEndpoint ? managedDeployment : undefined,
      managedEndpoint:       managedEndpoint || undefined,
      gatewayRegion:         gatewayRegion || undefined,
      customEndpoint:        customEndpoint || undefined,
    };

    if (isAdmin) {
      setOrgAiConfig(config);
    } else {
      // Dev override — include API key if provided
      const devConfig: Partial<AiProviderConfig> = { ...config };
      if (devApiKey) devConfig.apiKey = devApiKey;
      setUserAiConfig(devConfig);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved?.();
  };

  const handleTest = async () => {
    setTestResult('testing');
    setTestError('');
    try {
      // Dynamic import to avoid pulling the service into admin bundles unnecessarily
      const { callAi } = await import('@/services/aiIntegration/aiProviderService');
      const { text } = await callAi({
        system: 'You are a test assistant.',
        prompt: 'Reply with exactly: PathScribe AI connection OK',
        maxTokens: 20,
      });
      setTestResult(text.includes('OK') || text.length > 0 ? 'ok' : 'fail');
    } catch (e: any) {
      setTestResult('fail');
      setTestError(e?.message ?? 'Unknown error');
    }
  };

  const handleClearOverride = () => {
    clearUserAiConfig();
    const refreshed = resolveAiConfig();
    setProviderId(refreshed.providerId);
    setModelId(refreshed.modelId);
    setManagedEndpoint(refreshed.managedEndpoint ?? '');
    setManagedDeployment(refreshed.managedDeploymentName ?? '');
    setGatewayRegion(refreshed.gatewayRegion ?? 'us-east-1');
    setCustomEndpoint(refreshed.customEndpoint ?? '');
    setDevApiKey('');
  };

  const devOnly = !isAdmin;

  return (
    <div className="ps-aiprovider-page">
      <h2 className="ps-aiprovider-heading">
        {isAdmin ? `🔧 ${t('aiProviderSettings.adminHeading')}` : `🧪 ${t('aiProviderSettings.devHeading')}`}
      </h2>
      <p className="ps-aiprovider-subtitle">
        {isAdmin ? t('aiProviderSettings.adminSubtitle') : t('aiProviderSettings.devSubtitle')}
      </p>

      {/* Real, per direct guidance's own priority follow-up on PHI
          handling ("will the data going to the LLM be encrypted, we
          have to be careful") - placed here, front and center, since
          this is the one screen an admin is actually making the
          provider decision this warning concerns. */}
      <div className="ps-aiprovider-warning-box">
        <strong>{t('aiProviderSettings.dataHandlingWarningTitle')}</strong>{' '}
        {t('aiProviderSettings.dataHandlingWarningBody')}
      </div>

      {/* Active config summary */}
      <div className="ps-aiprovider-active-box">
        <strong>{t('aiProviderSettings.currentlyActive')}</strong>{' '}
        {PROVIDER_LABELS[current.providerId]} · {current.modelId}
        {isDevMode() && <span className="ps-aiprovider-devmode-flag">⚠ {t('aiProviderSettings.devModeFlag')}</span>}
      </div>

      {/* Demo mode banner */}
      {providerId === 'mock' && (
        <div className="ps-aiprovider-demo-box">
          <strong>{t('aiProviderSettings.demoModeActive')}</strong> — {t('aiProviderSettings.demoModeBody')}
        </div>
      )}

      {/* Provider selector */}
      <div className="ps-aiprovider-field-group">
        <label className="ps-aiprovider-label">{t('aiProviderSettings.providerLabel')}</label>
        <select
          value={providerId}
          onChange={e => setProviderId(e.target.value as AiProviderId)}
          className="ps-aiprovider-input"
        >
          {/* Real providers */}
          <optgroup label={t('aiProviderSettings.productionProvidersGroup')}>
            {(['structured_messages', 'chat_completions', 'chat_completions_managed', 'model_gateway', 'structured_content', 'custom'] as AiProviderId[]).map(id => (
              <option key={id} value={id}>{PROVIDER_LABELS[id]}</option>
            ))}
          </optgroup>
          {/* Mock for demos */}
          <optgroup label={t('aiProviderSettings.developmentDemoGroup')}>
            <option value="mock">{PROVIDER_LABELS.mock}</option>
          </optgroup>
        </select>
        <p className="ps-aiprovider-hint">
          {PROVIDER_NOTES[providerId]}
        </p>
      </div>

      {/* Model selector */}
      <div className="ps-aiprovider-field-group">
        <label className="ps-aiprovider-label">{t('aiProviderSettings.modelLabel')}</label>
        <select value={modelId} onChange={e => setModelId(e.target.value)} className="ps-aiprovider-input">
          {(PROVIDER_MODELS[providerId] ?? PROVIDER_MODELS['structured_messages']).map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Managed-deployment-specific fields */}
      {providerId === 'chat_completions_managed' && (
        <>
          <div className="ps-aiprovider-field-group ps-aiprovider-field-group--sm">
            <label className="ps-aiprovider-label">{t('aiProviderSettings.azureEndpointLabel')}</label>
            <input
              type="url" value={managedEndpoint}
              onChange={e => setManagedEndpoint(e.target.value)}
              placeholder="https://my-org.openai.azure.com"
              className="ps-aiprovider-input"
            />
          </div>
          <div className="ps-aiprovider-field-group ps-aiprovider-field-group--sm">
            <label className="ps-aiprovider-label">{t('aiProviderSettings.deploymentNameLabel')}</label>
            <input
              type="text" value={managedDeployment}
              onChange={e => setManagedDeployment(e.target.value)}
              placeholder="my-gpt4-deployment"
              className="ps-aiprovider-input"
            />
          </div>
        </>
      )}

      {/* Model gateway region */}
      {providerId === 'model_gateway' && (
        <div className="ps-aiprovider-field-group ps-aiprovider-field-group--sm">
          <label className="ps-aiprovider-label">{t('aiProviderSettings.awsRegionLabel')}</label>
          <input
            type="text" value={gatewayRegion}
            onChange={e => setGatewayRegion(e.target.value)}
            placeholder="us-east-1"
            className="ps-aiprovider-input"
          />
        </div>
      )}

      {/* Custom endpoint */}
      {providerId === 'custom' && (
        <div className="ps-aiprovider-field-group ps-aiprovider-field-group--sm">
          <label className="ps-aiprovider-label">{t('aiProviderSettings.customEndpointLabel')}</label>
          <input
            type="url" value={customEndpoint}
            onChange={e => setCustomEndpoint(e.target.value)}
            placeholder="https://my-llm.hospital.internal/v1"
            className="ps-aiprovider-input"
          />
          <p className="ps-aiprovider-hint">
            {t('aiProviderSettings.customEndpointHint')}
          </p>
        </div>
      )}

      {/* Dev-only: API key field */}
      {devOnly && isDevMode() && (
        <div className="ps-aiprovider-devkey-box">
          <label className="ps-aiprovider-label ps-aiprovider-label--warn">
            ⚠ {t('aiProviderSettings.devApiKeyLabel')}
          </label>
          <input
            type="password" value={devApiKey}
            onChange={e => setDevApiKey(e.target.value)}
            placeholder="sk-ant-... or sk-..."
            className="ps-aiprovider-input ps-aiprovider-input--warn"
          />
          <p className="ps-aiprovider-devkey-hint">
            {t('aiProviderSettings.devApiKeyHint')}
          </p>
        </div>
      )}

      {/* Action row */}
      <div className="ps-aiprovider-action-row">
        <button
          onClick={handleSave}
          className="ps-conf-btn-primary"
        >
          {saved ? `✓ ${t('aiProviderSettings.savedButton')}` : isAdmin ? t('aiProviderSettings.saveOrgConfigButton') : t('aiProviderSettings.saveOverrideButton')}
        </button>

        <button
          onClick={handleTest}
          disabled={testResult === 'testing'}
          className={`ps-conf-btn-secondary ps-aiprovider-test-btn${testResult === 'ok' ? ' ps-aiprovider-test-btn--ok' : testResult === 'fail' ? ' ps-aiprovider-test-btn--fail' : ''}${testResult === 'testing' ? ' ps-aiprovider-test-btn--testing' : ''}`}
        >
          {testResult === 'testing' ? `⏳ ${t('aiProviderSettings.testingButton')}`
           : testResult === 'ok'    ? `✓ ${t('aiProviderSettings.connectionOkButton')}`
           : testResult === 'fail'  ? `✗ ${t('aiProviderSettings.failedButton')}`
           :                          t('aiProviderSettings.testConnectionButton')}
        </button>

        {devOnly && (
          <button
            onClick={handleClearOverride}
            className="ps-conf-btn-secondary ps-aiprovider-clear-btn"
          >
            {t('aiProviderSettings.clearOverrideButton')}
          </button>
        )}
      </div>

      {testResult === 'fail' && testError && (
        <p className="ps-aiprovider-error-text">
          {t('aiProviderSettings.errorPrefix', { message: testError })}
        </p>
      )}
    </div>
  );
};

export default AiProviderSettings;
