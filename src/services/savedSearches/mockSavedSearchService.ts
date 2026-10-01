import { ISavedSearchService, SavedSearch, SearchContext } from './ISavedSearchService';
import { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { emptyCaseSearchDraft } from '../caseSearch/caseSearchTypes';

// Seed data — realistic examples across all three contexts for user '1'
const SEED_SEARCHES: SavedSearch[] = [
  {
    id: 'ss1', userId: '1', name: 'My Active GI Cases', context: 'worklist',
    filters: { status: ['Active'], subspecialtyIds: ['gi'], assignedTo: ['1'] },
    createdAt: '2026-02-01', lastUsedAt: '2026-03-04', useCount: 34,
  },
  {
    id: 'ss2', userId: '1', name: 'STAT Cases Today', context: 'worklist',
    filters: { priority: ['STAT'], dateRange: { from: '2026-03-04', to: '2026-03-04' } },
    createdAt: '2026-02-15', lastUsedAt: '2026-03-04', useCount: 12,
  },
  {
    id: 'ss3', userId: '1', name: 'On Hold — Awaiting Clinicals', context: 'worklist',
    filters: { status: ['On Hold'] },
    createdAt: '2026-01-20', lastUsedAt: '2026-03-02', useCount: 8,
  },
  // Batch 350: Search page saved searches store the page's draft (CaseSearchDraft).
  {
    id: 'ss4', userId: '1', name: 'Malignant Colon Cases', context: 'caseSearch',
    filters: {
      ...emptyCaseSearchDraft('', ''), datesChosen: true, diagnosisTerms: ['adenocarcinoma'],
      snomedCodes: [{ code: '363346000', display: 'Malignant neoplastic disease', system: 'SNOMED', jurisdiction: 'ALL', active: true }],
    },
    createdAt: '2026-02-10', lastUsedAt: '2026-03-01', useCount: 5,
  },
  {
    id: 'ss5', userId: '1', name: 'Breast — Dr. Williams', context: 'caseSearch',
    filters: { ...emptyCaseSearchDraft('', ''), datesChosen: true, specimenTerms: ['breast'], orderingPhysicianIds: ['ph1'] },
    createdAt: '2026-02-20', lastUsedAt: '2026-02-28', useCount: 3,
  },
  {
    id: 'ss6', userId: '1', name: 'High Confidence Skin — Last 30 Days', context: 'refinedSearch',
    filters: { subspecialtyIds: ['derm'], minConfidenceScore: 90, dateRange: { from: '2026-02-03', to: '2026-03-04' } },
    createdAt: '2026-02-25', lastUsedAt: '2026-03-03', useCount: 2,
  },
  // Seed searches for user '2' (Resident)
  {
    id: 'ss7', userId: '2', name: 'My Pending Co-signs', context: 'worklist',
    filters: { status: ['Pending Co-sign'], assignedTo: ['2'] },
    createdAt: '2026-02-01', lastUsedAt: '2026-03-04', useCount: 28,
  },
];

const load    = () => storageGet<SavedSearch[]>('pathscribe_savedSearches', SEED_SEARCHES);
const persist = (data: SavedSearch[]) => storageSet('pathscribe_savedSearches', data);
let MOCK_SEARCHES: SavedSearch[] = load();

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err   = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const delay = () => new Promise(r => setTimeout(r, 80));

export const mockSavedSearchService: ISavedSearchService = {
  async getForUser(userId: string) {
    await delay();
    return ok(MOCK_SEARCHES.filter(s => s.userId === userId).map(s => ({ ...s })));
  },

  async getForUserByContext(userId: string, context: SearchContext) {
    await delay();
    return ok(MOCK_SEARCHES.filter(s => s.userId === userId && s.context === context).map(s => ({ ...s })));
  },

  async save(search) {
    await delay();
    const newSearch: SavedSearch = {
      ...search,
      id: 'ss' + Date.now(),
      createdAt: new Date().toISOString().split('T')[0],
      useCount: 0,
    };
    MOCK_SEARCHES = [...MOCK_SEARCHES, newSearch];
    persist(MOCK_SEARCHES);
    return ok({ ...newSearch });
  },

  async rename(id: ID, name: string) {
    await delay();
    const idx = MOCK_SEARCHES.findIndex(s => s.id === id);
    if (idx === -1) return err(`Saved search ${id} not found`);
    MOCK_SEARCHES = MOCK_SEARCHES.map(s => s.id === id ? { ...s, name } : s);
    persist(MOCK_SEARCHES);
    return ok({ ...MOCK_SEARCHES[idx], name });
  },

  async delete(id: ID) {
    await delay();
    if (!MOCK_SEARCHES.find(s => s.id === id)) return err(`Saved search ${id} not found`);
    MOCK_SEARCHES = MOCK_SEARCHES.filter(s => s.id !== id);
    persist(MOCK_SEARCHES);
    return ok(undefined);
  },

  async recordUse(id: ID) {
    await delay();
    const idx = MOCK_SEARCHES.findIndex(s => s.id === id);
    if (idx === -1) return err(`Saved search ${id} not found`);
    const updated = {
      ...MOCK_SEARCHES[idx],
      useCount: MOCK_SEARCHES[idx].useCount + 1,
      lastUsedAt: new Date().toISOString().split('T')[0],
    };
    MOCK_SEARCHES = MOCK_SEARCHES.map(s => s.id === id ? updated : s);
    persist(MOCK_SEARCHES);
    return ok({ ...updated });
  },
};
