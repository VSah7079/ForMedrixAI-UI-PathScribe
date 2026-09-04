import { ServiceResult, ID } from '../types';
export type PermissionSet = Partial<Record<string, boolean>>;
export interface Role {
  id: ID;
  name: string;
  description: string;
  color: string;
  caseAccess: boolean;
  configAccess: boolean;
  /** When true, pathologists with this role may open cases where the patient
   *  age is below the submitting facility's pediatricAgeThreshold.
   *  Defaults to false — must be explicitly granted by an administrator. */
  canViewPediatric: boolean;
  /**
   * When true, this role may see Orchestration/Outreach cases (O26- prefix,
   * routed by CaseRouter to the PathScribe Firestore service) in Search and
   * any other cross-source case views. Unlike canViewPediatric — which
   * redacts sensitive fields within an otherwise-visible case from the SAME
   * data controller — this gates visibility of an entire DIFFERENT data
   * controller's cases (PathScribe vs. the NHS Trust LIS), so the intended
   * behavior on false is full exclusion from results, not field redaction.
   * Defaults to false — must be explicitly granted by an administrator.
   */
  canViewOrchestration: boolean;
  permissions: PermissionSet;
  builtIn: boolean;
  facilityIds?: string[];             // undefined / empty = all facilities
  participationTypeIds?: string[];    // IDs from ParticipationTypesSection master list
}
export interface IRoleService {
  getAll(): Promise<ServiceResult<Role[]>>;
  getById(id: ID): Promise<ServiceResult<Role>>;
  add(role: Omit<Role, 'id'>): Promise<ServiceResult<Role>>;
  update(id: ID, changes: Partial<Omit<Role, 'id'>>): Promise<ServiceResult<Role>>;
  delete(id: ID): Promise<ServiceResult<void>>;
}
