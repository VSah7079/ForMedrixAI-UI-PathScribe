// src/services/access/mockAccessRequestService.ts
import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { AccessRequest, NewAccessRequest } from '@/types/access/AccessRequest';
import type { IAccessRequestService } from './IAccessRequestService';

const STORAGE_KEY = 'access_requests';

const load    = (): AccessRequest[] => storageGet<AccessRequest[]>(STORAGE_KEY, []);
const persist = (data: AccessRequest[]) => storageSet(STORAGE_KEY, data);

const ok  = <T>(data: T):     ServiceResult<T> => ({ ok: true,  data  });
const err = <T>(msg: string): ServiceResult<T> => ({ ok: false, error: msg });

function resolve(id: string, status: 'granted' | 'denied', resolvedByUserId: string, resolvedByUserName: string): ServiceResult<AccessRequest> {
  const requests = load();
  const idx = requests.findIndex(r => r.id === id);
  if (idx === -1) return err(`Access request ${id} not found`);
  requests[idx] = {
    ...requests[idx],
    status,
    resolvedAt: new Date().toISOString(),
    resolvedByUserId,
    resolvedByUserName,
  };
  persist(requests);
  return ok({ ...requests[idx] });
}

export const mockAccessRequestService: IAccessRequestService = {
  async getPending() {
    return ok(load().filter(r => r.status === 'pending'));
  },

  async getAllForUser(userId) {
    return ok(load().filter(r => r.requestingUserId === userId));
  },

  async getAll() {
    return ok(load());
  },

  async create(request: NewAccessRequest) {
    const newRequest: AccessRequest = {
      ...request,
      id: `accessreq-${Date.now().toString(36)}`,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    persist([...load(), newRequest]);
    return ok(newRequest);
  },

  async grant(id, resolvedByUserId, resolvedByUserName) {
    return resolve(id, 'granted', resolvedByUserId, resolvedByUserName);
  },

  async deny(id, resolvedByUserId, resolvedByUserName) {
    return resolve(id, 'denied', resolvedByUserId, resolvedByUserName);
  },
};
