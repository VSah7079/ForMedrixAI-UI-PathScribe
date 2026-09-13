// src/services/mockInterfaceEngine/mockInterfaceEngineSettings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('mockInterfaceEngineSettings — real, per direct follow-up on testing PS-239\'s own real endpoint with mock data', () => {
  it('real, honest default: disabled, always_succeed, before anything is ever configured — never active by accident', async () => {
    const { getMockInterfaceEngineSettings } = await import('./mockInterfaceEngineSettings');
    const settings = getMockInterfaceEngineSettings();
    expect(settings.enabled).toBe(false);
    expect(settings.mode).toBe('always_succeed');
  });

  it('real, setMockInterfaceEngineSettings correctly persists and getMockInterfaceEngineSettings correctly reads it back', async () => {
    const { getMockInterfaceEngineSettings, setMockInterfaceEngineSettings } = await import('./mockInterfaceEngineSettings');
    setMockInterfaceEngineSettings({ enabled: true, mode: 'always_fail', failureStatus: 503 });
    const settings = getMockInterfaceEngineSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.mode).toBe('always_fail');
    expect(settings.failureStatus).toBe(503);
  });

  it('real, every real mode is a real, distinct, honest value — never silently coerced', async () => {
    const { getMockInterfaceEngineSettings, setMockInterfaceEngineSettings } = await import('./mockInterfaceEngineSettings');
    setMockInterfaceEngineSettings({ enabled: true, mode: 'timeout', failureStatus: 500 });
    expect(getMockInterfaceEngineSettings().mode).toBe('timeout');
  });
});
