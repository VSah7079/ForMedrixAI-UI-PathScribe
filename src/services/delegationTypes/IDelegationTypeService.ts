import { ServiceResult, ID } from '../types';

export interface DelegationType {
  id:                 ID;
  label:              string;
  description:        string;
  transfersOwnership: boolean;
  requiresNote:       boolean;
  /** When true the delegate modal allows selecting multiple recipients */
  multiAssign:        boolean;
  color:              string;
  active:             boolean;
  isSystem:           boolean;   // system types can be toggled but never deleted
  sortOrder:          number;
  cptHint?:           string;
  /** Real, per direct request: "Include Performing Lab." Same
   *  field-name convention and same null/undefined = inherit/global
   *  shape as ContainerType.performingLabFacilityId (see
   *  services/containerTypes/README.md and PS-75 for the full,
   *  standard account of this pattern) — a real Facility id, scoped to
   *  facilities with the 'performing_lab' role. label and id
   *  uniqueness are both scoped by this field as a compound key: two
   *  different labs' own types may share a label/id; two entries
   *  within the same lab (including two global entries) may not. */
  performingLabFacilityId?: string;
}

export interface IDelegationTypeService {
  getAll():                                                    Promise<ServiceResult<DelegationType[]>>;
  getActive():                                                 Promise<ServiceResult<DelegationType[]>>;
  getById(id: ID):                                             Promise<ServiceResult<DelegationType>>;
  /** Real fix, found and fixed while adding Performing Lab + real
   *  uniqueness: `id` used to be silently discarded and replaced with
   *  `'CUSTOM_' + Date.now()`, regardless of the real, validated,
   *  label-derived id the admin saw and could edit on screen — the
   *  on-screen "ID already exists" check was validating a value that
   *  then never actually got saved. `id` is now a real, optional
   *  override: the caller's real, validated id is used when given;
   *  auto-derived from label only as a fallback for callers that
   *  don't provide one. */
  add(dt: Omit<DelegationType, 'id' | 'isSystem' | 'sortOrder'> & { id?: string }): Promise<ServiceResult<DelegationType>>;
  update(id: ID, changes: Partial<Omit<DelegationType, 'id' | 'isSystem'>>): Promise<ServiceResult<DelegationType>>;
  deactivate(id: ID):                                          Promise<ServiceResult<DelegationType>>;
  reactivate(id: ID):                                          Promise<ServiceResult<DelegationType>>;
  /** Permanently removes a custom type. Rejects system types. */
  remove(id: ID):                                              Promise<ServiceResult<void>>;
}
