// src/services/migration/IMigrationFieldMappingService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the RFP-APLIS-2026-GLOBAL Historical Data Migration
// Engine gap's own "field mapping" ask. A real, admin-editable
// dictionary — same real small-curated-dictionary, admin-editable
// posture as every other dictionary in this app — mapping one real
// legacy source field name to one real target field on
// MigrationCaseDraft. Scoped per sourceSystemName so a customer
// migrating from more than one legacy system (a real, likely
// scenario for "many institutions across many countries") keeps
// each system's own real mapping profile separate.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { MigrationFieldCategory } from '@/types/migration/MigrationCaseDraft';

export interface MigrationFieldMapping {
  id: ID;
  sourceSystemName: string;
  sourceFieldName: string;
  targetField: string;
  category: MigrationFieldCategory;
  /** Real, free-text note on any real, needed transform — e.g.
   *  "convert MM/DD/YYYY to ISO," "legacy system sends 'M'/'F' only."
   *  Same real, honest "site vocabulary varies too much for a closed
   *  enum" reasoning as elsewhere in this app — a genuine transform
   *  DSL is a real, separate, later engineering effort. */
  transformNote?: string;
  active: boolean;
}

export type NewMigrationFieldMapping = Omit<MigrationFieldMapping, 'id'>;

export interface IMigrationFieldMappingService {
  getAll(): Promise<ServiceResult<MigrationFieldMapping[]>>;
  getBySourceSystem(sourceSystemName: string): Promise<ServiceResult<MigrationFieldMapping[]>>;
  add(entry: NewMigrationFieldMapping): Promise<ServiceResult<MigrationFieldMapping>>;
  update(id: ID, changes: Partial<NewMigrationFieldMapping>): Promise<ServiceResult<MigrationFieldMapping>>;
  remove(id: ID): Promise<ServiceResult<void>>;
}
