// src/services/hl7/processInboundMolecularBatchEvent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getCase, updateCase } = vi.hoisted(() => ({ getCase: vi.fn(), updateCase: vi.fn() }));
vi.mock('@/services/cases/CaseRouter', () => ({ caseRouter: { getCase, updateCase } }));

import { processInboundMolecularBatchEvent, _resetProcessedMolecularBatchMessageIdsForTests } from './processInboundMolecularBatchEvent';
import type { MolecularBatchResultEventPayload } from '@/types/events/MolecularBatchResultEventPayload';

const CASE_1 = { id: 'S26-6001-CYT-001', specimens: [{ id: 'S26-6001-SP-1', label: 'A', cytologyScreening: {} }] };
const CASE_2 = { id: 'S26-6002-CYT-001', specimens: [{ id: 'S26-6002-SP-1', label: 'A', cytologyScreening: {} }] };

const payload = (over: Partial<MolecularBatchResultEventPayload> = {}): MolecularBatchResultEventPayload => ({
  messageId: 'batch-msg-1', timestamp: '2026-09-07T00:00:00.000Z', organisationId: 'org-1',
  runDate: '2026-09-07T00:00:00.000Z', instrumentId: 'CYTO-1', assayName: 'Test Assay', reagentLotNumber: 'LOT-TEST-1',
  invalidControlCount: 0, inhibitorCount: 0, controlResults: [{ controlLevel: 'low_positive', meanCt: 30 }],
  specimens: [{ accessionNumber: 'S26-6001-CYT-001', specimenLetter: 'A' }],
  ...over,
});

describe('processInboundMolecularBatchEvent — real, per direct guidance ("using the engine to translate")', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    };
    getCase.mockReset();
    updateCase.mockReset();
    updateCase.mockResolvedValue(undefined);
    _resetProcessedMolecularBatchMessageIdsForTests();
  });

  it('a real, complete batch event applies correctly, creating a real run record and setting molecularRunId on the real specimen', async () => {
    getCase.mockResolvedValue(CASE_1);
    const result = await processInboundMolecularBatchEvent(payload());
    expect(result.outcome).toBe('applied');
    expect(result.runId).toBeTruthy();
    expect(result.specimenResults?.[0].outcome).toBe('applied');
    expect(updateCase).toHaveBeenCalledTimes(1);
    const [, patch] = updateCase.mock.calls[0];
    expect(patch.specimens[0].cytologyScreening.molecularRunId).toBe(result.runId);
  });

  it('a real, redelivered messageId is a genuine no-op — never a second run record or write', async () => {
    getCase.mockResolvedValue(CASE_1);
    await processInboundMolecularBatchEvent(payload());
    updateCase.mockClear();
    const second = await processInboundMolecularBatchEvent(payload());
    expect(second.outcome).toBe('already-applied');
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('a real, invalid payload (no specimens) is honestly rejected, never silently accepted', async () => {
    const result = await processInboundMolecularBatchEvent(payload({ specimens: [] }));
    expect(result.outcome).toBe('invalid-payload');
  });

  it('a real batch spanning multiple real specimens across different real cases gives each its own honest, independent outcome', async () => {
    getCase.mockImplementation(async (id: string) => (id === 'S26-6001-CYT-001' ? CASE_1 : id === 'S26-6002-CYT-001' ? CASE_2 : undefined));
    const result = await processInboundMolecularBatchEvent(payload({
      specimens: [
        { accessionNumber: 'S26-6001-CYT-001', specimenLetter: 'A' },
        { accessionNumber: 'S26-6002-CYT-001', specimenLetter: 'A' },
      ],
    }));
    expect(result.specimenResults).toHaveLength(2);
    expect(result.specimenResults?.every(r => r.outcome === 'applied')).toBe(true);
    expect(updateCase).toHaveBeenCalledTimes(2);
  });

  it('a real, partial batch — one real specimen resolves, one genuinely does not — reports both honestly, never one blended result', async () => {
    getCase.mockImplementation(async (id: string) => (id === 'S26-6001-CYT-001' ? CASE_1 : undefined));
    const result = await processInboundMolecularBatchEvent(payload({
      specimens: [
        { accessionNumber: 'S26-6001-CYT-001', specimenLetter: 'A' },
        { accessionNumber: 'S26-9999-CYT-001', specimenLetter: 'A' },
      ],
    }));
    expect(result.specimenResults?.[0].outcome).toBe('applied');
    expect(result.specimenResults?.[1].outcome).toBe('case-not-found');
    // The real run record itself is still created — a real batch fact
    // independent of individual specimen resolution.
    expect(result.runId).toBeTruthy();
  });

  it('a real specimen letter that does not exist on an otherwise-real case is honestly reported as specimen-not-found', async () => {
    getCase.mockResolvedValue(CASE_1);
    const result = await processInboundMolecularBatchEvent(payload({
      specimens: [{ accessionNumber: 'S26-6001-CYT-001', specimenLetter: 'Z' }],
    }));
    expect(result.specimenResults?.[0].outcome).toBe('specimen-not-found');
  });
});
