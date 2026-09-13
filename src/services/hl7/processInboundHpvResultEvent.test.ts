// src/services/hl7/processInboundHpvResultEvent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getCase, updateCase } = vi.hoisted(() => ({ getCase: vi.fn(), updateCase: vi.fn() }));
vi.mock('@/services/cases/CaseRouter', () => ({ caseRouter: { getCase, updateCase } }));

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock('../molecularOrders/mockMolecularOrderOutboundQueueService', () => ({ mockMolecularOrderOutboundQueueService: { enqueue } }));

import { processInboundHpvResultEvent, _resetProcessedHpvMessageIdsForTests } from './processInboundHpvResultEvent';
import type { HpvResultEventPayload } from '@/types/events/HpvResultEventPayload';

const CASE = { id: 'S26-5001-CYT-001', specimens: [{ id: 'S26-5001-SP-1', label: 'A', cytologyScreening: {} }], order: { priority: 'Routine' } };

const payload = (over: Partial<HpvResultEventPayload> = {}): HpvResultEventPayload => ({
  messageId: 'msg-1', timestamp: '2026-09-04T00:00:00.000Z', organisationId: 'org-1',
  accessionNumber: 'S26-5001-CYT-001', specimenLetter: 'A', hrHpvResult: 'Positive', abnormalFlag: 'A',
  ...over,
});

describe('processInboundHpvResultEvent — real, "ingest our own specification" inbound HPV result', () => {
  beforeEach(() => {
    getCase.mockReset();
    updateCase.mockReset();
    enqueue.mockReset();
    getCase.mockResolvedValue(CASE);
    updateCase.mockResolvedValue(undefined);
    enqueue.mockResolvedValue({ ok: true, data: {} });
    _resetProcessedHpvMessageIdsForTests();
  });

  it('a real, complete Positive event applies correctly, writing hrHpvResult and the real ref range/flag onto the correct specimen', async () => {
    const result = await processInboundHpvResultEvent(payload({ referenceRange: 'Not Detected', genotypeDetail: { hpv16: true, hpv18Or45: false, otherHighRisk: false } }));
    expect(result.outcome).toBe('applied');
    expect(result.caseId).toBe('S26-5001-CYT-001');
    expect(result.specimenId).toBe('S26-5001-SP-1');
    expect(updateCase).toHaveBeenCalledTimes(1);
    const [, patch] = updateCase.mock.calls[0];
    const updatedSpecimen = patch.specimens[0];
    expect(updatedSpecimen.cytologyScreening.hpvResult).toBe('Positive');
    expect(updatedSpecimen.cytologyScreening.hpvAbnormalFlag).toBe('A');
    expect(updatedSpecimen.cytologyScreening.hpvReferenceRange).toBe('Not Detected');
    expect(updatedSpecimen.cytologyScreening.hpvGenotypeDetail).toEqual({ hpv16: true, hpv18Or45: false, otherHighRisk: false });
  });

  it('a real, redelivered messageId is a genuine no-op — never a second write', async () => {
    await processInboundHpvResultEvent(payload());
    updateCase.mockClear();
    const second = await processInboundHpvResultEvent(payload());
    expect(second.outcome).toBe('already-applied');
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('a real, missing required field is an honest invalid-payload outcome, not a silent partial write', async () => {
    const result = await processInboundHpvResultEvent(payload({ accessionNumber: '' }));
    expect(result.outcome).toBe('invalid-payload');
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('a real, contradictory flag (Positive with flag N) is rejected as invalid-payload — the flag is validated, never blindly trusted', async () => {
    const result = await processInboundHpvResultEvent(payload({ hrHpvResult: 'Positive', abnormalFlag: 'N' }));
    expect(result.outcome).toBe('invalid-payload');
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('a real, consistent Negative/N pairing is accepted', async () => {
    const result = await processInboundHpvResultEvent(payload({ hrHpvResult: 'Negative', abnormalFlag: 'N' }));
    expect(result.outcome).toBe('applied');
  });

  it('a real event with no abnormalFlag at all is still accepted — the field is genuinely optional', async () => {
    const result = await processInboundHpvResultEvent(payload({ abnormalFlag: undefined }));
    expect(result.outcome).toBe('applied');
  });

  it('a real case-not-found outcome when the accession does not resolve', async () => {
    getCase.mockResolvedValue(null);
    const result = await processInboundHpvResultEvent(payload());
    expect(result.outcome).toBe('case-not-found');
    expect(updateCase).not.toHaveBeenCalled();
  });

  it('a real specimen-not-found outcome when the specimen letter does not exist on the case', async () => {
    const result = await processInboundHpvResultEvent(payload({ specimenLetter: 'Z' }));
    expect(result.outcome).toBe('specimen-not-found');
    expect(updateCase).not.toHaveBeenCalled();
  });

  describe('Part 2b reflex trigger — closes the documented st-hpv-reflex gap', () => {
    it('a Positive result from the standalone st-hpv-highrisk-screen assay enqueues a real genotyping reflex order', async () => {
      await processInboundHpvResultEvent(payload({ hrHpvResult: 'Positive', abnormalFlag: 'A', assayStainTypeId: 'st-hpv-highrisk-screen' }));
      expect(enqueue).toHaveBeenCalledTimes(1);
      const [entry] = enqueue.mock.calls[0];
      expect(entry.caseId).toBe('S26-5001-CYT-001');
      expect(entry.eventType).toBe('order.molecular');
      expect(entry.payload).toMatchObject({
        accessionNumber: 'S26-5001-CYT-001', specimenLetter: 'A', assayCode: 'st-hpv-genotyping',
        orderReason: 'hpv_reflex_genotyping', priority: 'Routine', reflexFromMessageId: 'msg-1',
      });
    });

    it('a Positive result from the bundled st-hpv-reflex assay does NOT fire the standalone reflex trigger — that assay already implies reflex on its own', async () => {
      await processInboundHpvResultEvent(payload({ hrHpvResult: 'Positive', abnormalFlag: 'A', assayStainTypeId: 'st-hpv-reflex' }));
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('a Negative result never fires the reflex trigger, even from the standalone screen assay', async () => {
      await processInboundHpvResultEvent(payload({ hrHpvResult: 'Negative', abnormalFlag: 'N', assayStainTypeId: 'st-hpv-highrisk-screen' }));
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('a real event with no assayStainTypeId at all (existing sending systems, pre-Part-2b) never fires the reflex trigger', async () => {
      await processInboundHpvResultEvent(payload({ hrHpvResult: 'Positive', abnormalFlag: 'A' }));
      expect(enqueue).not.toHaveBeenCalled();
    });
  });
});
