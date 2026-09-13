// src/services/intraopDashboard/resolveActiveIntraopRequestsForLocations.test.ts
import { describe, it, expect } from 'vitest';
import { resolveActiveIntraopRequestsForLocations } from './resolveActiveIntraopRequestsForLocations';
import type { IntraoperativeEntry } from '@/types/intraop/IntraoperativeEntry';

const baseEntry = (over: Partial<IntraoperativeEntry>): IntraoperativeEntry => ({
  id: 'intraop-1', patientMatch: { source: 'barcode', patientName: 'Jane Roe', mrn: '12345' },
  performedBy: { userId: 'u1', userName: 'Dr. Smith' }, orNumber: 'OR-04', surgeon: 'Dr. Jones',
  specimens: [], createdAt: '2026-09-09T00:00:00.000Z',
  ...over,
} as IntraoperativeEntry);

describe('resolveActiveIntraopRequestsForLocations — real, per the RFP\'s own "active OR requests" dashboard ask', () => {
  const NOW = new Date('2026-09-09T12:00:00.000Z');

  it('real, a genuine session at the requested location, with a real specimen, is included with its own real TAT', () => {
    const entries = [baseEntry({
      locationId: 'loc-or-04',
      specimens: [{ id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-09T11:55:00.000Z', milestones: [] }] as any,
    })];
    const result = resolveActiveIntraopRequestsForLocations(entries, ['loc-or-04'], 20, 5, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].tat.status).toBe('normal');
    expect(result[0].pathologistName).toBe('Dr. Smith');
  });

  it('real, a session at a genuinely different location is correctly excluded — no cross-suite/cross-facility leakage', () => {
    const entries = [baseEntry({
      locationId: 'loc-or-05',
      specimens: [{ id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-09T11:55:00.000Z', milestones: [] }] as any,
    })];
    const result = resolveActiveIntraopRequestsForLocations(entries, ['loc-or-04'], 20, 5, NOW);
    expect(result).toHaveLength(0);
  });

  it('real, a session already merged into a real case is excluded, even if its own locationId matches', () => {
    const entries = [baseEntry({
      locationId: 'loc-or-04', mergedIntoCaseId: 'S26-1000',
      specimens: [{ id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-09T11:55:00.000Z', milestones: [] }] as any,
    })];
    const result = resolveActiveIntraopRequestsForLocations(entries, ['loc-or-04'], 20, 5, NOW);
    expect(result).toHaveLength(0);
  });

  it('real, multi-suite view (per the given design brief\'s own "Multi-Suite Overview") correctly includes several real locations at once', () => {
    const entries = [
      baseEntry({ id: 'intraop-1', locationId: 'loc-or-04', specimens: [{ id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-09T11:55:00.000Z', milestones: [] }] as any }),
      baseEntry({ id: 'intraop-2', locationId: 'loc-or-05', specimens: [{ id: 'sp-2', specimenLabel: 'A', arrivalTimestamp: '2026-09-09T11:55:00.000Z', milestones: [] }] as any }),
    ];
    const result = resolveActiveIntraopRequestsForLocations(entries, ['loc-or-04', 'loc-or-05'], 20, 5, NOW);
    expect(result).toHaveLength(2);
  });

  it('real, a specimen with a real, already-rendered frozen diagnosis is still shown, but flagged as no longer needing an active clock', () => {
    const entries = [baseEntry({
      locationId: 'loc-or-04',
      specimens: [{ id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-09T11:55:00.000Z', milestones: [], frozenDiagnosisRenderedAt: '2026-09-09T11:59:00.000Z' }] as any,
    })];
    const result = resolveActiveIntraopRequestsForLocations(entries, ['loc-or-04'], 20, 5, NOW);
    expect(result[0].diagnosisRendered).toBe(true);
  });

  it('real, exposes orNumber and the real frozenSectionDiagnosis text once rendered — per the OR Live Board\'s own dismissal workflow spec', () => {
    const entries = [baseEntry({
      locationId: 'loc-or-04', orNumber: 'OR-07',
      specimens: [{
        id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-09T11:55:00.000Z', milestones: [],
        frozenDiagnosisRenderedAt: '2026-09-09T11:59:00.000Z', frozenSectionDiagnosis: 'Invasive carcinoma, margins negative',
      }] as any,
    })];
    const result = resolveActiveIntraopRequestsForLocations(entries, ['loc-or-04'], 20, 5, NOW);
    expect(result[0].orNumber).toBe('OR-07');
    expect(result[0].frozenSectionDiagnosis).toBe('Invasive carcinoma, margins negative');
  });

  it('real, a genuinely dismissed specimen is excluded from the active board entirely', () => {
    const entries = [baseEntry({
      locationId: 'loc-or-04',
      specimens: [{
        id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-09T11:55:00.000Z', milestones: [],
        frozenDiagnosisRenderedAt: '2026-09-09T11:59:00.000Z', dismissedFromBoardAt: '2026-09-09T12:01:00.000Z',
      }] as any,
    })];
    const result = resolveActiveIntraopRequestsForLocations(entries, ['loc-or-04'], 20, 5, NOW);
    expect(result).toHaveLength(0);
  });

  it('real, derives the current workflow step from real milestones, per the board\'s own State 1 display ask', () => {
    const step = (milestones: string[]) => resolveActiveIntraopRequestsForLocations(
      [baseEntry({ locationId: 'loc-or-04', specimens: [{ id: 'sp-1', specimenLabel: 'A', arrivalTimestamp: '2026-09-09T11:55:00.000Z', milestones: milestones.map(m => ({ milestone: m })) }] as any })],
      ['loc-or-04'], 20, 5, NOW,
    )[0].currentWorkflowStep;

    expect(step([])).toBe('Grossing');
    expect(step(['gross_logged'])).toBe('Touch Prep');
    expect(step(['gross_logged', 'touch_prep_performed'])).toBe('Sectioning');
    expect(step(['gross_logged', 'touch_prep_skipped'])).toBe('Sectioning');
    expect(step(['gross_logged', 'touch_prep_performed', 'frozen_section_cut'])).toBe('Pathologist Review');
  });
});
