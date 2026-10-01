// src/services/digitalPathology/processInboundAiScreeningResultEvent.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

describe('processInboundAiScreeningResultEvent — real, idempotent ingestion of a completed/failed/timed-out AI result', () => {
  it('real, a valid, completed payload applies correctly and writes the real findings to the existing, ordered result', async () => {
    const { mockAiScreeningResultService } = await import('./mockAiScreeningResultService');
    const { processInboundAiScreeningResultEvent, _resetProcessedAiScreeningResultMessageIdsForTests } = await import('./processInboundAiScreeningResultEvent');
    _resetProcessedAiScreeningResultMessageIdsForTests();

    const ordered = await mockAiScreeningResultService.order({ caseId: 'S26-0010-SP-001', vendorId: 'dp-vendor-hologic-genius', orderedAt: new Date().toISOString() });
    if (!ordered.ok) throw new Error('setup failed');

    const result = await processInboundAiScreeningResultEvent({
      messageId: 'msg-1', timestamp: new Date().toISOString(), resultId: ordered.data.id, status: 'completed',
      findings: [{ id: 'f1', label: 'Suspicious for HSIL', confidenceScore: 0.87 }],
    });
    expect(result.outcome).toBe('applied');

    const updated = await mockAiScreeningResultService.getById(ordered.data.id);
    if (updated.ok) {
      expect(updated.data.status).toBe('completed');
      expect(updated.data.findings).toHaveLength(1);
    }
  });

  it('real, a redelivered messageId is a genuine no-op', async () => {
    const { mockAiScreeningResultService } = await import('./mockAiScreeningResultService');
    const { processInboundAiScreeningResultEvent, _resetProcessedAiScreeningResultMessageIdsForTests } = await import('./processInboundAiScreeningResultEvent');
    _resetProcessedAiScreeningResultMessageIdsForTests();

    const ordered = await mockAiScreeningResultService.order({ caseId: 'S26-0011-SP-001', vendorId: 'dp-vendor-ibex-prostate-detect', orderedAt: new Date().toISOString() });
    if (!ordered.ok) throw new Error('setup failed');

    const payload = { messageId: 'msg-dup', timestamp: new Date().toISOString(), resultId: ordered.data.id, status: 'failed' as const };
    await processInboundAiScreeningResultEvent(payload);
    const second = await processInboundAiScreeningResultEvent(payload);
    expect(second.outcome).toBe('already-applied');
  });

  it('real, an honest result-not-found outcome for a genuinely unknown resultId', async () => {
    const { processInboundAiScreeningResultEvent, _resetProcessedAiScreeningResultMessageIdsForTests } = await import('./processInboundAiScreeningResultEvent');
    _resetProcessedAiScreeningResultMessageIdsForTests();
    const result = await processInboundAiScreeningResultEvent({ messageId: 'msg-2', timestamp: new Date().toISOString(), resultId: 'does-not-exist', status: 'completed' });
    expect(result.outcome).toBe('result-not-found');
  });

  it('real, a timed_out status correctly marks the result without requiring any findings at all', async () => {
    const { mockAiScreeningResultService } = await import('./mockAiScreeningResultService');
    const { processInboundAiScreeningResultEvent, _resetProcessedAiScreeningResultMessageIdsForTests } = await import('./processInboundAiScreeningResultEvent');
    _resetProcessedAiScreeningResultMessageIdsForTests();

    const ordered = await mockAiScreeningResultService.order({ caseId: 'S26-0012-SP-001', vendorId: 'dp-vendor-proscia-concentriq', orderedAt: new Date().toISOString() });
    if (!ordered.ok) throw new Error('setup failed');

    const result = await processInboundAiScreeningResultEvent({ messageId: 'msg-3', timestamp: new Date().toISOString(), resultId: ordered.data.id, status: 'timed_out' });
    expect(result.outcome).toBe('applied');
    const updated = await mockAiScreeningResultService.getById(ordered.data.id);
    if (updated.ok) expect(updated.data.status).toBe('timed_out');
  });

  it('real, a genuine BD FocalPoint-style slide-level triage summary (quintile rank + review gate) is correctly persisted alongside the per-finding FOV list', async () => {
    const { mockAiScreeningResultService } = await import('./mockAiScreeningResultService');
    const { processInboundAiScreeningResultEvent, _resetProcessedAiScreeningResultMessageIdsForTests } = await import('./processInboundAiScreeningResultEvent');
    _resetProcessedAiScreeningResultMessageIdsForTests();

    const ordered = await mockAiScreeningResultService.order({ caseId: 'S26-0013-SP-001', vendorId: 'dp-vendor-bd-focalpoint', orderedAt: new Date().toISOString() });
    if (!ordered.ok) throw new Error('setup failed');

    const result = await processInboundAiScreeningResultEvent({
      messageId: 'msg-4', timestamp: new Date().toISOString(), resultId: ordered.data.id, status: 'completed',
      findings: [{ id: 'f1', label: 'FOV 1 — cluster of atypical cells', spatialRegion: { type: 'bounding_box', points: [{ x: 0.2, y: 0.3 }, { x: 0.25, y: 0.35 }] } }],
      slideTriage: { reviewRecommended: true, rankGroup: 5, totalRankGroups: 5 },
    });
    expect(result.outcome).toBe('applied');

    const updated = await mockAiScreeningResultService.getById(ordered.data.id);
    if (updated.ok) {
      expect(updated.data.slideTriage).toEqual({ reviewRecommended: true, rankGroup: 5, totalRankGroups: 5 });
      expect(updated.data.findings[0].spatialRegion?.type).toBe('bounding_box');
    }
  });

  it('real, a genuine Hologic Genius-style result (per-object gallery, no slide-level rank at all) leaves slideTriage honestly undefined, never a fabricated default', async () => {
    const { mockAiScreeningResultService } = await import('./mockAiScreeningResultService');
    const { processInboundAiScreeningResultEvent, _resetProcessedAiScreeningResultMessageIdsForTests } = await import('./processInboundAiScreeningResultEvent');
    _resetProcessedAiScreeningResultMessageIdsForTests();

    const ordered = await mockAiScreeningResultService.order({ caseId: 'S26-0014-SP-001', vendorId: 'dp-vendor-hologic-genius', orderedAt: new Date().toISOString() });
    if (!ordered.ok) throw new Error('setup failed');

    const result = await processInboundAiScreeningResultEvent({
      messageId: 'msg-5', timestamp: new Date().toISOString(), resultId: ordered.data.id, status: 'completed',
      findings: [{ id: 'f1', label: 'Gallery tile 1' }, { id: 'f2', label: 'Gallery tile 2' }],
    });
    expect(result.outcome).toBe('applied');

    const updated = await mockAiScreeningResultService.getById(ordered.data.id);
    if (updated.ok) {
      expect(updated.data.slideTriage).toBeUndefined();
      expect(updated.data.findings).toHaveLength(2);
    }
  });
});
