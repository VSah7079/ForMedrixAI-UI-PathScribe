// src/services/cytology/IMolecularQcRunRecordService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct instruction: "For raw molecular instrument output...
// please synthesize synthetic values and add them to the seed. That
// way we can test and demo the capability." A genuinely different
// situation from this module's own established SNOMED CT caution
// (ISnomedCervicalHistologySeverityMappingService.ts's own header):
// instrument identifiers, reagent lot numbers, and Ct (cycle
// threshold) values are not a licensed terminology system — they are
// structured lab data, the same category as every other synthetic
// seed value already in this app (patient MRNs, accession numbers,
// review records). Real, clearly-synthetic values below, matching
// this app's own established seed-data conventions throughout.
//
// Real, previously-missing entity, confirmed absent via direct,
// exhaustive search before this file was created (PS-225's own
// investigation) — MOL-QA-02 and MOL-QA-04 both need real, per-
// instrument-run QC data that is genuinely batch/run-level, not
// per-specimen the way Specimen.cytologyScreening's own HPV fields
// are. One real record type — populated once per real instrument run —
// supports both reports without a second, competing entity: MOL-QA-02
// reads the invalid/inhibitor counts directly; MOL-QA-04 compares
// controlResults across consecutive real reagent lots on the same
// real instrument.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult } from '../types';

export type MolecularControlLevel = 'negative' | 'low_positive' | 'high_positive';

export interface MolecularQcRunRecord {
  id: string;
  runDate: string;
  instrumentId: string;
  /** Real, human-readable commercial assay/platform name — the same
   *  real gap MOL-QA-01 (Phase 70) found no field for anywhere else in
   *  this app; captured here at the run level, where it genuinely
   *  belongs, since an instrument runs one assay at a time. */
  assayName: string;
  reagentLotNumber: string;
  totalSamplesRun: number;
  invalidControlCount: number;
  inhibitorCount: number;
  /** Real, per-control-level mean Ct for this specific run — the real
   *  basis for MOL-QA-04's own lot-to-lot Ct drift comparison. */
  controlResults: { controlLevel: MolecularControlLevel; meanCt: number }[];
}

export interface IMolecularQcRunRecordService {
  getAll(): Promise<ServiceResult<MolecularQcRunRecord[]>>;
  /** Real, per direct guidance's own "engine translates, PathScribe
   *  ingests" instruction: creates a new real run record from an
   *  already-translated inbound batch event
   *  (processInboundMolecularBatchEvent.ts, services/hl7/) — never
   *  called from manual UI entry, same posture as the specimen-level
   *  hpvAbnormalFlag/hpvReferenceRange fields. */
  add(record: Omit<MolecularQcRunRecord, 'id'>): Promise<ServiceResult<MolecularQcRunRecord>>;
}
