// src/services/access/IAccessRequestService.ts
import { ServiceResult, ID } from '../types';
import type { AccessRequest, NewAccessRequest } from '@/types/access/AccessRequest';

export interface IAccessRequestService {
  /** Every real, pending request — the admin-facing queue. */
  getPending(): Promise<ServiceResult<AccessRequest[]>>;

  /** Every real request this user has ever made, any status — used to
   *  show "you already asked for this" instead of letting a user file
   *  a genuinely duplicate request for the same pool/facility. */
  getAllForUser(userId: ID): Promise<ServiceResult<AccessRequest[]>>;

  /** Every real request, any status — used for the real turnaround-
   *  time quality metric in the Quality Assurance tab. */
  getAll(): Promise<ServiceResult<AccessRequest[]>>;

  create(request: NewAccessRequest): Promise<ServiceResult<AccessRequest>>;

  grant(id: ID, resolvedByUserId: ID, resolvedByUserName: string): Promise<ServiceResult<AccessRequest>>;
  deny(id: ID, resolvedByUserId: ID, resolvedByUserName: string): Promise<ServiceResult<AccessRequest>>;
}
