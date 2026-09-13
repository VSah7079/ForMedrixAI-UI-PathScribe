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

import React, { useState, useEffect } from 'react';
import '../../pathscribe.css';
import { getMockInterfaceEngineSettings, setMockInterfaceEngineSettings } from '../../services/mockInterfaceEngine/mockInterfaceEngineSettings';
import type { MockInterfaceEngineMode, MockInterfaceEngineSettings } from '../../services/mockInterfaceEngine/mockInterfaceEngineSettings';

const MODE_DESCRIPTIONS: Record<MockInterfaceEngineMode, string> = {
  always_succeed: 'Every real dispatch call receives an immediate HTTP 200 — the real "Worklist dispatched successfully" path.',
  always_fail: 'Every real dispatch call receives the HTTP status below — exercises the real "PathScribe\'s own backend rejected this worklist dispatch" error path.',
  timeout: 'Every real dispatch call hangs forever — exercises the real, indefinite "Dispatching…" state a genuinely unreachable Interface Engine would produce.',
};

const MockInterfaceEnginePage: React.FC = () => {
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
      <div style={{ padding: 14, marginBottom: 22, borderRadius: 8, background: '#f59e0b18', border: '1px solid #f59e0b33', color: '#f59e0b', fontSize: 13, fontWeight: 600 }}>
        ⚠ Developer tool — not real functionality. This fakes the response PathScribe's own backend would eventually send at <code>POST /api/v1/events/molecular-worklist</code> (PS-239). It never touches real case data or any real batch logic — it only answers the real network call in place of a real backend that doesn't exist yet.
      </div>

      <h1 className="ps-page-title">Mock Interface Engine (PS-239)</h1>
      <p className="ps-page-subtitle" style={{ marginBottom: 22 }}>
        Lets you click "Dispatch Worklist" on a real molecular batch and see a real, realistic response — success, a specific rejection, or a hung connection — without PS-239's own real backend endpoint existing yet.
      </p>

      <div className="ps-panel-box" style={{ marginBottom: 20 }}>
        <div className="ps-flex-row-gap-8" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>{settings.enabled ? 'Enabled' : 'Disabled'}</strong>
            <span className="ps-helper-text" style={{ marginLeft: 8 }}>
              {workerStatus === 'running' ? '● intercepting real dispatch calls' : workerStatus === 'starting' ? '● starting…' : '○ not intercepting'}
            </span>
          </div>
          <button className="ps-conf-btn-secondary" onClick={handleToggleEnabled}>
            {settings.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      <div className="ps-panel-box">
        <h3 className="ps-panel-heading">Response Mode</h3>
        {(['always_succeed', 'always_fail', 'timeout'] as MockInterfaceEngineMode[]).map(mode => (
          <label key={mode} style={{ display: 'block', marginBottom: 10, cursor: 'pointer' }}>
            <input type="radio" name="mie-mode" checked={settings.mode === mode} onChange={() => updateSettings({ mode })} style={{ marginRight: 8 }} />
            <strong>{mode.replace(/_/g, ' ')}</strong>
            <div className="ps-helper-text" style={{ marginLeft: 22 }}>{MODE_DESCRIPTIONS[mode]}</div>
          </label>
        ))}

        {settings.mode === 'always_fail' && (
          <div style={{ marginTop: 12 }}>
            <label className="ps-label" htmlFor="mie-failure-status">Failure HTTP Status</label>
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
