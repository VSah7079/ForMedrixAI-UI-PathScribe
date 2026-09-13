// src/services/digitalPathology/mockAiScreeningResultService.ts
import type { IAiScreeningResultService, NewAiScreeningResult } from './IAiScreeningResultService';
import type { AiScreeningResult, AiScreeningFinding } from '@/types/digitalPathology/AiScreeningResult';
import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';

const STORAGE_KEY = 'aiScreeningResults';

const load = (): AiScreeningResult[] => storageGet(STORAGE_KEY, []);
const persist = (data: AiScreeningResult[]) => storageSet(STORAGE_KEY, data);
let _cache: AiScreeningResult[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = (message: string): ServiceResult<never> => ({ ok: false, error: message });
const delay = () => new Promise(res => setTimeout(res, 30));

const setStatus = async (id: ID, changes: Partial<AiScreeningResult>): Promise<ServiceResult<AiScreeningResult>> => {
  await delay();
  const idx = _cache.findIndex(r => r.id === id);
  if (idx === -1) return err(`AiScreeningResult ${id} not found`);
  _cache = _cache.map(r => r.id === id ? { ...r, ...changes } : r);
  persist(_cache);
  return ok({ ..._cache.find(r => r.id === id)! });
};

export const mockAiScreeningResultService: IAiScreeningResultService = {
  async getAll() {
    await delay();
    return ok([..._cache]);
  },

  async getByCaseId(caseId: string) {
    await delay();
    return ok(_cache.filter(r => r.caseId === caseId));
  },

  async getById(id: ID) {
    await delay();
    const found = _cache.find(r => r.id === id);
    return found ? ok({ ...found }) : err(`AiScreeningResult ${id} not found`);
  },

  async order(entry: NewAiScreeningResult) {
    await delay();
    const created: AiScreeningResult = { ...entry, id: crypto.randomUUID(), status: 'ordered', findings: [] };
    _cache = [..._cache, created];
    persist(_cache);
    return ok({ ...created });
  },

  async markCompleted(id: ID, findings: AiScreeningFinding[], slideTriage?: import('@/types/digitalPathology/AiScreeningResult').AiSlideTriageSummary) {
    return setStatus(id, { status: 'completed', findings, slideTriage, completedAt: new Date().toISOString() });
  },

  async markFailed(id: ID) {
    return setStatus(id, { status: 'failed', completedAt: new Date().toISOString() });
  },

  async markTimedOut(id: ID) {
    return setStatus(id, { status: 'timed_out', completedAt: new Date().toISOString() });
  },

  async recordHumanConcordance(id: ID, concordant: boolean) {
    return setStatus(id, { humanConcordant: concordant });
  },
};
