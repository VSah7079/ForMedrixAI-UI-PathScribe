// src/services/cytology/mockCytologySignOutRecordService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mockCytologySignOutRecordService } from './mockCytologySignOutRecordService';
import type { CytologyReportContent } from '@/types/cytology/CytologyReportContent';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const REPORT_CONTENT: CytologyReportContent = {
  patientName: 'Angela Torres', accessionNumber: 'S26-5002-CYT-001',
  specimenTypeDescription: 'Cervical/Vaginal Pap Smear, liquid-based',
  specimenAdequacy: ['Satisfactory for evaluation.'],
  primaryInterpretation: 'Negative for Intraepithelial Lesion or Malignancy (NILM).',
  additionalInterpretations: [], recommendations: [],
  signedBy: { name: 'Dr. Second', isPathologist: true }, signedAt: '2026-09-03T10:00:00.000Z',
};

const draft = () => ({
  caseId: 'S26-5002-CYT-001', specimenId: 'S26-5002-SP-1', reviewRecordId: 'cyto-review-seed-002-primary',
  reportContent: REPORT_CONTENT, signedBy: { userId: 'PATH-002', userName: 'Dr. Second', isPathologist: true },
});

describe('mockCytologySignOutRecordService — real, "always written" sign-out history', () => {
  it('starts empty — no real sign-outs exist until one genuinely happens', async () => {
    const res = await mockCytologySignOutRecordService.getByCaseId('S26-5002-CYT-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data).toEqual([]);
  });

  it('a real create() genuinely persists and is visible on the next getByCaseId', async () => {
    await mockCytologySignOutRecordService.create(draft());
    const res = await mockCytologySignOutRecordService.getByCaseId('S26-5002-CYT-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.length).toBe(1);
    expect(res.data[0].reviewRecordId).toBe('cyto-review-seed-002-primary');
  });

  it('getBySpecimenId correctly isolates by specimen, not just case', async () => {
    await mockCytologySignOutRecordService.create(draft());
    const res = await mockCytologySignOutRecordService.getBySpecimenId('S26-5002-SP-1');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.length).toBe(1);
    const other = await mockCytologySignOutRecordService.getBySpecimenId('S26-9999-SP-1');
    if (!other.ok) throw new Error('setup failed');
    expect(other.data).toEqual([]);
  });

  it('a real, complete sign-out round-trips its full report content faithfully', async () => {
    const created = await mockCytologySignOutRecordService.create(draft());
    if (!created.ok) throw new Error('setup failed');
    expect(created.data.reportContent.patientName).toBe('Angela Torres');
    expect(created.data.reportContent.signedBy.isPathologist).toBe(true);
    expect(created.data.id).toBeTruthy();
    expect(created.data.signedAt).toBeTruthy();
  });

  it('multiple real sign-outs on the same case (e.g. a later amendment) are each preserved, never overwritten', async () => {
    await mockCytologySignOutRecordService.create(draft());
    await mockCytologySignOutRecordService.create(draft());
    const res = await mockCytologySignOutRecordService.getByCaseId('S26-5002-CYT-001');
    if (!res.ok) throw new Error('setup failed');
    expect(res.data.length).toBe(2);
  });
});
