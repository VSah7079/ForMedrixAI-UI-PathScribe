import { ServiceResult, ID } from '../types';
export type PermissionSet = Partial<Record<string, boolean>>;
export interface Role {
  id: ID;
  name: string;
  description: string;
  color: string;
  caseAccess: boolean;
  configAccess: boolean;
  /** Voice and keyboard commands this role may use (constants/systemActions.ts).
   *  Not access control: see `capabilities`. */
  permissions: PermissionSet;
  /** PS-355 (Batch 369): the catalog capabilities this role grants
   *  (services/authorization/capabilityCatalog.ts). These are enforced. */
  capabilities?: string[];
  /** Seed capabilities this built-in role has already been offered, so a
   *  capability an administrator removed isn't added back
   *  (services/authorization/capabilitySeeds.ts). */
  seededCapabilities?: string[];
  /** false: can't be given to a staff member (Superadmin, held only through
   *  a PathScribe support sign-in). Absent means assignable. */
  assignable?: boolean;
  builtIn: boolean;
  // PS-356 (Batch 370): canViewPediatric, canViewOrchestration and facilityIds
  // were removed from roles. None was ever enforced. Pediatric and
  // orchestration access are StaffUser flags, and facility scope is
  // StaffUser.facilityIds (the assignment, not the role).
  participationTypeIds?: string[];    // IDs from ParticipationTypesSection master list
}
export interface IRoleService {
  getAll(): Promise<ServiceResult<Role[]>>;
  getById(id: ID): Promise<ServiceResult<Role>>;
  add(role: Omit<Role, 'id'>): Promise<ServiceResult<Role>>;
  update(id: ID, changes: Partial<Omit<Role, 'id'>>): Promise<ServiceResult<Role>>;
  delete(id: ID): Promise<ServiceResult<void>>;
}
