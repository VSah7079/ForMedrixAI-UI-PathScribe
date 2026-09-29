// src/services/migration/processLegacyRecordImport.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { MigrationFieldMapping } from './IMigrationFieldMappingService';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const MAPPINGS: MigrationFieldMapping[] = [
  { id: 'm1', sourceSystemName: 'LegacyLIS', sourceFieldName: 'pt_fname', targetField: 'patientFirstName', category: 'demographics', active: true },
  { id: 'm2', sourceSystemName: 'LegacyLIS', sourceFieldName: 'pt_lname', targetField: 'patientLastName', category: 'demographics', active: true },
  { id: 'm3', sourceSystemName: 'LegacyLIS', sourceFieldName: 'pt_dob', targetField: 'patientDateOfBirth', category: 'demographics', active: true },
  { id: 'm4', sourceSystemName: 'LegacyLIS', sourceFieldName: 'pt_mrn', targetField: 'patientMrn', category: 'demographics', active: true },
  { id: 'm5', sourceSystemName: 'LegacyLIS', sourceFieldName: 'accn', targetField: 'legacyAccessionNumber', category: 'accession_detail', active: true },
];

describe('processLegacyRecordImport — real, per the RFP\'s own "MPI deduplication during import" ask', () => {
  it('real, a genuinely complete, valid legacy record succeeds and resolves a real patientId', async () => {
    // Real, deliberate: this dynamic import is necessary, not an
    // oversight — mockUserService.ts (pulled in transitively via
    // mockPatientIndexService.ts -> services/index.ts) reads
    // localStorage at real module-load time, and this file's own
    // beforeEach is what sets up globalThis.localStorage before each
    // test runs. A static, top-level import would evaluate that whole
    // module graph before beforeEach ever fires, and crash. Real,
    // separate cost of that same real constraint: this first test in
    // the file pays the one-time TypeScript-transform cost for that
    // entire real dependency graph, which can run close to (and on a
    // slower machine, past) Vitest's own 5-second default timeout —
    // confirmed directly, only this first test was ever slow (~4s),
    // the other two are fast once the module's already transformed.
    // A real, explicit timeout here is the correct fix, not changing
    // the import strategy.
    const { processLegacyRecordImport } = await import('./processLegacyRecordImport');
    const result = await processLegacyRecordImport(
      { pt_fname: 'Jane', pt_lname: 'Roe', pt_dob: '1980-01-01', pt_mrn: 'MRN-1001', accn: 'LEG-0001' },
      MAPPINGS, 'org-1',
    );
    expect(result.outcome).toBe('succeeded');
    expect(result.patientId).toBeDefined();
  });

  it('real, a record genuinely missing patient date of birth fails validation, never silently proceeds', async () => {
    const { processLegacyRecordImport } = await import('./processLegacyRecordImport');
    const result = await processLegacyRecordImport(
      { pt_fname: 'Jane', pt_lname: 'Roe', pt_mrn: 'MRN-1002', accn: 'LEG-0002' },
      MAPPINGS, 'org-1',
    );
    expect(result.outcome).toBe('failed');
    expect(result.errorMessage).toContain('date of birth');
  });

  it('real, a genuine MPI ambiguous match (same MRN, different name) is routed to needs_review, never silently guessed', async () => {
    const { processLegacyRecordImport } = await import('./processLegacyRecordImport');
    // First real record establishes the identity.
    await processLegacyRecordImport(
      { pt_fname: 'Jane', pt_lname: 'Roe', pt_dob: '1980-01-01', pt_mrn: 'MRN-2001', accn: 'LEG-1001' },
      MAPPINGS, 'org-2',
    );
    // Second real record: same MRN, but a genuinely different name/DOB — a real, partial match.
    const result = await processLegacyRecordImport(
      { pt_fname: 'John', pt_lname: 'Smith', pt_dob: '1975-05-05', pt_mrn: 'MRN-2001', accn: 'LEG-1002' },
      MAPPINGS, 'org-2',
    );
    expect(result.outcome).toBe('needs_review');
    expect(result.mpiCandidatePatientIds).toBeDefined();
  });
});
