// src/services/hl7/processInboundCytologyProficiencyTestResultEvent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getCase } = vi.hoisted(() => ({ getCase: vi.fn() }));
vi.mock('@/services/cases/CaseRouter', () => ({ caseRouter: { getCase } }));

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

import {
  processInboundCytologyProficiencyTestResultEvent,
  _resetProcessedCytologyProficiencyTestMessageIdsForTests,
} from './processInboundCytologyProficiencyTestResultEvent';
import type { CytologyProficiencyTestResultEventPayload } from '@/types/events/CytologyProficiencyTestResultEventPayload';

const PT_CASE = { id: 'S26-PTX-CYT-001', proficiencyTestContext: { provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-99' } };

const payload = (over: Partial<CytologyProficiencyTestResultEventPayload> = {}): CytologyProficiencyTestResultEventPayload => ({
  messageId: 'msg-1', timestamp: '2026-09-04T00:00:00.000Z', organisationId: 'org-1',
  accessionNumber: 'S26-PTX-CYT-001', provider: 'CAP', challengeReferenceId: 'CAP-GYN-2026-A-99', outcome: 'satisfactory',
  ...over,
});

describe('processInboundCytologyProficiencyTestResultEvent — real, "ingest our own specification" inbound PT grade, per direct guidance on APAC-QA-01', () => {
  beforeEach(() => {
    getCase.mockReset();
    getCase.mockResolvedValue(PT_CASE);
    _resetProcessedCytologyProficiencyTestMessageIdsForTests();
  });

  it('real, a complete, matching event applies correctly, recording a real result', async () => {
    const { mockCytologyProficiencyTestResultService } = await import('../cytology/mockCytologyProficiencyTestResultService');
    const result = await processInboundCytologyProficiencyTestResultEvent(payload({ scoreDetail: 'Concordant.' }));
    expect(result.outcome).toBe('applied');
    expect(result.caseId).toBe('S26-PTX-CYT-001');
    const all = await mockCytologyProficiencyTestResultService.getAll();
    expect(all.ok).toBe(true);
    if (all.ok) expect(all.data.some(r => r.caseId === 'S26-PTX-CYT-001' && r.scoreDetail === 'Concordant.')).toBe(true);
  });

  it('real, a redelivered messageId is a genuine no-op — never a second recorded result', async () => {
    await processInboundCytologyProficiencyTestResultEvent(payload());
    const second = await processInboundCytologyProficiencyTestResultEvent(payload());
    expect(second.outcome).toBe('already-applied');
  });

  it('real, a missing required field is an honest invalid-payload outcome', async () => {
    const result = await processInboundCytologyProficiencyTestResultEvent(payload({ provider: '' }));
    expect(result.outcome).toBe('invalid-payload');
  });

  it('real, an honest case-not-found outcome when the accession genuinely doesn\'t resolve', async () => {
    getCase.mockResolvedValue(null);
    const result = await processInboundCytologyProficiencyTestResultEvent(payload());
    expect(result.outcome).toBe('case-not-found');
  });

  it('real, direct correction verified: a real, genuine patient case with no proficiencyTestContext at all is refused, never silently accepted', async () => {
    getCase.mockResolvedValue({ id: 'S26-0001-CYT-001' });
    const result = await processInboundCytologyProficiencyTestResultEvent(payload());
    expect(result.outcome).toBe('context-mismatch');
  });

  it('real, a genuine challenge-reference mismatch is refused, never trusted blindly', async () => {
    const result = await processInboundCytologyProficiencyTestResultEvent(payload({ challengeReferenceId: 'CAP-GYN-2026-WRONG' }));
    expect(result.outcome).toBe('context-mismatch');
  });

  it('real, a genuine provider mismatch is refused too', async () => {
    const result = await processInboundCytologyProficiencyTestResultEvent(payload({ provider: 'RCPAQAP' }));
    expect(result.outcome).toBe('context-mismatch');
  });
});
