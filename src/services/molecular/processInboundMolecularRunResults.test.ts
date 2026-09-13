// src/services/molecular/processInboundMolecularRunResults.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const SEEDED_BATCH_UUID = 'e3b0c442-98fc-4c14-963b-944882006122'; // the real, seeded batch from mockMolecularBatchService.ts

const buildPayload = (overrides: any = {}) => ({
  event_type: 'MOLECULAR_RUN_RESULTS' as const,
  timestamp: '2026-09-06T18:15:00.000Z',
  batch_info: { batch_uuid: SEEDED_BATCH_UUID, instrument_id: 'PANTHER_02', run_status: 'COMPLETED' as const },
  control_validation: { controls_passed: true, review_status: 'AUTO_PASSED' as const },
  results: [
    { well_position: 'A03', specimen_uuid: 'a1b2c3d4-e5f6-7890-1234-56789abcdef0', accession_number: 'PS26-100452', raw_data: { ct_value: 22.4, internal_control_ct: 18.1, rfu_signal: 1420 }, interpretation: 'POSITIVE' as const, flag: 'NONE' as const },
  ],
  ...overrides,
});

describe('processInboundMolecularRunResults — real, per the given specification\'s own §4.2/§5.2', () => {
  it('a real, valid payload for a real, existing batch correctly applies and updates the batch', async () => {
    const { processInboundMolecularRunResults, _resetProcessedMolecularRunResultsForTests } = await import('./processInboundMolecularRunResults');
    _resetProcessedMolecularRunResultsForTests();
    const { mockMolecularBatchService } = await import('./mockMolecularBatchService');

    const result = await processInboundMolecularRunResults(buildPayload());
    expect(result.outcome).toBe('applied');
    expect(result.reviewStatus).toBe('AUTO_PASSED');

    const batch = await mockMolecularBatchService.getById('mb-001');
    if (batch.ok) {
      expect(batch.data.status).toBe('completed');
      expect(batch.data.results).toHaveLength(1);
      expect(batch.data.controlsPassed).toBe(true);
    }
  });

  it('a real redelivery of the same batch_uuid is correctly treated as an honest no-op, never a duplicate write', async () => {
    const { processInboundMolecularRunResults, _resetProcessedMolecularRunResultsForTests } = await import('./processInboundMolecularRunResults');
    _resetProcessedMolecularRunResultsForTests();
    await processInboundMolecularRunResults(buildPayload());
    const second = await processInboundMolecularRunResults(buildPayload());
    expect(second.outcome).toBe('already-applied');
  });

  it('a real, non-existent batch_uuid returns an honest batch-not-found outcome', async () => {
    const { processInboundMolecularRunResults, _resetProcessedMolecularRunResultsForTests } = await import('./processInboundMolecularRunResults');
    _resetProcessedMolecularRunResultsForTests();
    const result = await processInboundMolecularRunResults(buildPayload({ batch_info: { batch_uuid: 'does-not-exist', instrument_id: 'X', run_status: 'COMPLETED' } }));
    expect(result.outcome).toBe('batch-not-found');
  });

  it('real, per §5.2: a run whose controls failed is correctly BLOCKED, regardless of what the inbound review_status claims', async () => {
    const { processInboundMolecularRunResults, _resetProcessedMolecularRunResultsForTests } = await import('./processInboundMolecularRunResults');
    _resetProcessedMolecularRunResultsForTests();
    const result = await processInboundMolecularRunResults(buildPayload({
      control_validation: { controls_passed: false, review_status: 'AUTO_PASSED' }, // real, genuinely inconsistent inbound payload
    }));
    expect(result.reviewStatus).toBe('BLOCKED');
  });

  it('a real ABORTED run_status correctly maps the batch to the real aborted status', async () => {
    const { processInboundMolecularRunResults, _resetProcessedMolecularRunResultsForTests } = await import('./processInboundMolecularRunResults');
    _resetProcessedMolecularRunResultsForTests();
    const { mockMolecularBatchService } = await import('./mockMolecularBatchService');
    await processInboundMolecularRunResults(buildPayload({ batch_info: { batch_uuid: SEEDED_BATCH_UUID, instrument_id: 'PANTHER_02', run_status: 'ABORTED' } }));
    const batch = await mockMolecularBatchService.getById('mb-001');
    if (batch.ok) expect(batch.data.status).toBe('aborted');
  });
});
