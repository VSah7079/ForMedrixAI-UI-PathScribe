// src/services/actionGroups/IActionGroupService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-289's own comment thread ("Workstation Profiles &
// Station-Specific Default Actions") — a real, named, reusable
// bundle of actions. Nothing like this exists anywhere in this
// codebase today: SystemAction (services/actionRegistry/) has a
// single `category` string per action, no grouping concept above it.
// A WorkstationGroup's own defaultActionGroupId/allowedActionGroupIds
// (services/workstationGroups/) reference this entity's own id.
// ─────────────────────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';

export interface ActionGroup {
  id: ID;
  name: string;
  /** Real FKs to SystemAction.id (services/actionRegistry/) — never
   *  free text. An action can belong to more than one group; this is
   *  a real, many-to-many bundle, not an exclusive assignment. */
  actionIds: string[];
  status: 'Active' | 'Inactive';
  createdAt: string;
  createdBy: string;
}

export interface IActionGroupService {
  getAll(): Promise<ServiceResult<ActionGroup[]>>;
  getById(id: ID): Promise<ServiceResult<ActionGroup>>;
  create(draft: Omit<ActionGroup, 'id' | 'createdAt' | 'status'>): Promise<ServiceResult<ActionGroup>>;
  update(id: ID, changes: Partial<Omit<ActionGroup, 'id' | 'createdAt' | 'createdBy'>>): Promise<ServiceResult<ActionGroup>>;
  deactivate(id: ID): Promise<ServiceResult<ActionGroup>>;
  reactivate(id: ID): Promise<ServiceResult<ActionGroup>>;
}
