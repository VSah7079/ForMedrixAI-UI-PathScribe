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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid rgba(148,163,184,0.3)',
  background: '#0f172a', color: '#e2e8f0', fontSize: 13,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  marginBottom: 6, display: 'block',
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
    <div style={{ maxWidth: 560, padding: '24px 0' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
        {isAdmin ? '🔧 AI Provider — Organisation Settings' : '🧪 AI Provider — Developer Override'}
      </h2>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 24 }}>
        {isAdmin
          ? 'Sets the AI provider for all users in this organisation. API keys are managed server-side and never entered here.'
          : 'Local override for development and testing. Takes priority over org settings. Never use in production.'}
      </p>

      {/* Real, per direct guidance's own priority follow-up on PHI
          handling ("will the data going to the LLM be encrypted, we
          have to be careful") - placed here, front and center, since
          this is the one screen an admin is actually making the
          provider decision this warning concerns. */}
      <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, padding: '12px 14px', marginBottom: 24, fontSize: 12, color: '#fbbf24', lineHeight: 1.5 }}>
        <strong>⚠ Data handling — read before selecting a provider:</strong>{' '}
        Case narrative text (Gross/Microscopic/Ancillary descriptions) is sent to whichever provider is configured here for real, live AI features (report generation, synoptic field suggestions, template assignment). Confirmed directly: no field on this app's own request templates structurally includes patient name, MRN, or date of birth — those are never automatically appended. This does not cover free text a pathologist types directly into a narrative field; avoid including direct patient identifiers there. Transit to the configured endpoint is TLS-encrypted; at-rest retention and any Business Associate Agreement are governed by that provider's own contract with your organisation, not by this application. Confirm a real BAA is in place before using a non-mock provider with real patient cases.
      </div>

      {/* Active config summary */}
      <div style={{ background: 'rgba(8,145,178,0.08)', border: '1px solid rgba(8,145,178,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 24, fontSize: 12, color: '#38bdf8' }}>
        <strong>Currently active:</strong>{' '}
        {PROVIDER_LABELS[current.providerId]} · {current.modelId}
        {isDevMode() && <span style={{ marginLeft: 8, color: '#fbbf24' }}>⚠ Dev mode — direct API calls enabled</span>}
      </div>

      {/* Demo mode banner */}
      {providerId === 'mock' && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 24, fontSize: 12, color: '#34d399' }}>
          <strong>Demo Mode active</strong> — AI responses are instant and simulated. No API calls are made. Safe for offline demos and testing. Switch to a real provider before clinical use.
        </div>
      )}

      {/* Provider selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>AI Provider</label>
        <select
          value={providerId}
          onChange={e => setProviderId(e.target.value as AiProviderId)}
          style={inputStyle}
        >
          {/* Real providers */}
          <optgroup label="Production Providers">
            {(['structured_messages', 'chat_completions', 'chat_completions_managed', 'model_gateway', 'structured_content', 'custom'] as AiProviderId[]).map(id => (
              <option key={id} value={id}>{PROVIDER_LABELS[id]}</option>
            ))}
          </optgroup>
          {/* Mock for demos */}
          <optgroup label="Development &amp; Demo">
            <option value="mock">{PROVIDER_LABELS.mock}</option>
          </optgroup>
        </select>
        <p style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
          {PROVIDER_NOTES[providerId]}
        </p>
      </div>

      {/* Model selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Model</label>
        <select value={modelId} onChange={e => setModelId(e.target.value)} style={inputStyle}>
          {(PROVIDER_MODELS[providerId] ?? PROVIDER_MODELS['structured_messages']).map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Managed-deployment-specific fields */}
      {providerId === 'chat_completions_managed' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Azure Resource Endpoint</label>
            <input
              type="url" value={managedEndpoint}
              onChange={e => setManagedEndpoint(e.target.value)}
              placeholder="https://my-org.openai.azure.com"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Deployment Name</label>
            <input
              type="text" value={managedDeployment}
              onChange={e => setManagedDeployment(e.target.value)}
              placeholder="my-gpt4-deployment"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* Model gateway region */}
      {providerId === 'model_gateway' && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>AWS Region</label>
          <input
            type="text" value={gatewayRegion}
            onChange={e => setGatewayRegion(e.target.value)}
            placeholder="us-east-1"
            style={inputStyle}
          />
        </div>
      )}

      {/* Custom endpoint */}
      {providerId === 'custom' && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Endpoint Base URL</label>
          <input
            type="url" value={customEndpoint}
            onChange={e => setCustomEndpoint(e.target.value)}
            placeholder="https://my-llm.hospital.internal/v1"
            style={inputStyle}
          />
          <p style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
            Must be OpenAI-compatible (POST /chat/completions).
          </p>
        </div>
      )}

      {/* Dev-only: API key field */}
      {devOnly && isDevMode() && (
        <div style={{ marginBottom: 20, padding: '12px 14px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8 }}>
          <label style={{ ...labelStyle, color: '#f59e0b' }}>
            ⚠ Dev API Key (local only — never commit this)
          </label>
          <input
            type="password" value={devApiKey}
            onChange={e => setDevApiKey(e.target.value)}
            placeholder="sk-ant-... or sk-..."
            style={{ ...inputStyle, borderColor: 'rgba(251,191,36,0.3)' }}
          />
          <p style={{ fontSize: 11, color: '#78350f', marginTop: 6 }}>
            Only used when VITE_AI_DEV_MODE=true. Set VITE_AI_API_KEY in .env instead to avoid entering this each session.
          </p>
        </div>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
        <button
          onClick={handleSave}
          className="ps-conf-btn-primary"
        >
          {saved ? '✓ Saved' : isAdmin ? 'Save Org Config' : 'Save Override'}
        </button>

        <button
          onClick={handleTest}
          disabled={testResult === 'testing'}
          className="ps-conf-btn-secondary"
          style={{
            border: `1.5px solid ${testResult === 'ok' ? '#10b981' : testResult === 'fail' ? '#f87171' : 'rgba(148,163,184,0.3)'}`,
            color: testResult === 'ok' ? '#10b981' : testResult === 'fail' ? '#f87171' : '#94a3b8',
            cursor: testResult === 'testing' ? 'wait' : 'pointer',
          }}
        >
          {testResult === 'testing' ? '⏳ Testing…'
           : testResult === 'ok'    ? '✓ Connection OK'
           : testResult === 'fail'  ? '✗ Failed'
           :                          'Test Connection'}
        </button>

        {devOnly && (
          <button
            onClick={handleClearOverride}
            className="ps-conf-btn-secondary"
            style={{ marginLeft: 'auto', fontSize: 12 }}
          >
            Clear Override
          </button>
        )}
      </div>

      {testResult === 'fail' && testError && (
        <p style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>
          Error: {testError}
        </p>
      )}
    </div>
  );
};

export default AiProviderSettings;
