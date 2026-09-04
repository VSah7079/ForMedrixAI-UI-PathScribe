// src/services/subspecialties/ISubspecialtyService.ts
import { ServiceResult, ID } from '../types';

export interface Subspecialty {
  id: ID;
  name: string;
  description?: string;        // Administrative notes
  userIds: string[];           // Members / assigned physicians
  specimenIds: string[];
  clientIds: string[];         // Linked institutions/clients
  isWorkgroup: boolean;        // false = Standard, true = Pool/Workgroup
  isWorkgroupEnabled: boolean;
  active: boolean;             // replaces status for consistency with UI
  status: 'Active' | 'Inactive';
  // Real feature, per direct product decision: the automatic fallback
  // pool (casePoolAssignmentService.ts's own config.fallbackPoolId,
  // 'general') needs a real, visible record here so an admin can see
  // it exists and understand its purpose — but it isn't a normal,
  // admin-created pool, and shouldn't be editable, deactivatable, or
  // deletable the way one is. True only for that one, real, seeded
  // entry; absent (not merely false) on every ordinary subspecialty.
  isSystemManaged?: boolean;
  /**
   * Real, per direct guidance: different performing labs get their own
   * pools (e.g. Lab A's own "General Pathology" is a separate pool
   * from Lab B's). Same Global/scoped convention as ContainerType/
   * DelegationType's own performingLabFacilityId — undefined = Global,
   * visible and matchable for every lab; set = only for that one
   * performing lab. Only meaningful on a real pool (isWorkgroup:
   * true) — a Standard subspecialty isn't lab-scoped. Resolve a
   * case's own lab via resolvePerformingLabFacilityId(), never a
   * direct field read on the case.
   */
  performingLabFacilityId?: string;
  /**
   * Real, per FEAT-ROUT-01 section 5 ("Toggle switch to designate a
   * specific pool as the Default/Catch-All Pool for the facility") —
   * the real, primary source of truth for which pool an unmapped
   * specimen falls through to, resolved in routeCase() with the same
   * lab-specific-then-Global precedence as everything else here. Only
   * meaningful on a real pool (isWorkgroup: true). At most one
   * catch-all pool should be active per lab (and at most one Global) —
   * enforced in the admin UI, not this type.
   */
  isCatchAll?: boolean;
}

export interface ISubspecialtyService {
  getAll(): Promise<ServiceResult<Subspecialty[]>>;
  getById(id: ID): Promise<ServiceResult<Subspecialty>>;
  add(subspecialty: Omit<Subspecialty, 'id'>): Promise<ServiceResult<Subspecialty>>;
  update(id: ID, changes: Partial<Omit<Subspecialty, 'id'>>): Promise<ServiceResult<Subspecialty>>;
  deactivate(id: ID): Promise<ServiceResult<Subspecialty>>;
  reactivate(id: ID): Promise<ServiceResult<Subspecialty>>;
  assignUser(subspecialtyId: ID, userId: ID): Promise<ServiceResult<Subspecialty>>;
  removeUser(subspecialtyId: ID, userId: ID): Promise<ServiceResult<Subspecialty>>;
  assignSpecimen(subspecialtyId: ID, specimenId: ID): Promise<ServiceResult<Subspecialty>>;
  removeSpecimen(subspecialtyId: ID, specimenId: ID): Promise<ServiceResult<Subspecialty>>;
}
