// src/services/externalResources/mockExternalResourceService.ts
import type {
  ExternalResource,
  ExternalResourceCategory,
  ExternalResourceViewerContext,
  IExternalResourceService,
} from './IExternalResourceService';

const STORAGE_KEY = 'pathscribe_external_resources';
const delay = (ms = 60) => new Promise(res => setTimeout(res, ms));

let idCounter = 0;
function generateId(): string {
  idCounter += 1;
  return `ER-${Date.now().toString(36)}-${idCounter}`;
}

function loadResources(): ExternalResource[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to seed */ }
  return seedDefaults();
}

function saveResources(resources: ExternalResource[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(resources)); } catch { /* non-critical */ }
}

// Real migration off the hardcoded object that used to live directly in
// WorklistPage.tsx — same four demo organisations seeded elsewhere in
// this app (services/organisation/organisationService.ts), each getting
// its own enterprise-scoped copy of the same baseline set, not one
// shared global list. CAP Cancer Protocols already carries the
// corrected, verified URL (the original hardcoded one had been 404ing —
// CAP restructured their site).
function seedDefaults(): ExternalResource[] {
  const now = new Date().toISOString();
  const orgIds = ['ORG-DVMC', 'ORG-MFT', 'ORG-MPA', 'ORG-HFHS'];
  const baseline: Array<{ title: string; url: string; category: ExternalResourceCategory }> = [
    { title: 'CAP Cancer Protocols', url: 'https://www.cap.org/protocols-and-guidelines/cancer-reporting-tools/cancer-protocol-templates', category: 'protocols' },
    { title: 'WHO Classification', url: 'https://www.who.int/publications', category: 'protocols' },
    { title: 'PathologyOutlines', url: 'https://www.pathologyoutlines.com', category: 'references' },
    { title: 'UpToDate', url: 'https://www.uptodate.com', category: 'references' },
  ];
  const seeded: ExternalResource[] = [];
  orgIds.forEach(organisationId => {
    baseline.forEach(b => {
      seeded.push({
        id: generateId(),
        title: b.title,
        url: b.url,
        category: b.category,
        scope: 'enterprise',
        organisationId,
        createdAt: now,
        updatedAt: now,
      });
    });
  });
  saveResources(seeded);
  return seeded;
}

export const mockExternalResourceService: IExternalResourceService = {
  async listForOrganisation(organisationId: string): Promise<ExternalResource[]> {
    await delay();
    return loadResources().filter(r => r.organisationId === organisationId);
  },

  async resolveForViewer(context: ExternalResourceViewerContext): Promise<Record<ExternalResourceCategory, ExternalResource[]>> {
    await delay();
    const all = loadResources();
    // Real relevance filter, not a flat list: this viewer's own
    // organisation's enterprise set, plus — for each performing lab
    // actually relevant to them right now — that lab's own additions.
    // A resource belonging to a different organisation, or a lab this
    // viewer has no actual cases at, never surfaces here.
    const relevant = all.filter(r => {
      if (r.organisationId !== context.organisationId) return false;
      if (r.scope === 'enterprise') return true;
      return !!r.facilityId && !!context.performingLabFacilityIds?.includes(r.facilityId);
    });
    const grouped: Record<ExternalResourceCategory, ExternalResource[]> = { protocols: [], references: [], systems: [] };
    relevant.forEach(r => grouped[r.category].push(r));
    return grouped;
  },

  async create(input): Promise<ExternalResource> {
    await delay();
    const now = new Date().toISOString();
    const resource: ExternalResource = { ...input, id: generateId(), createdAt: now, updatedAt: now };
    const resources = loadResources();
    saveResources([...resources, resource]);
    return resource;
  },

  async update(id, changes): Promise<ExternalResource | null> {
    await delay();
    const resources = loadResources();
    const idx = resources.findIndex(r => r.id === id);
    if (idx === -1) return null;
    resources[idx] = { ...resources[idx], ...changes, updatedAt: new Date().toISOString() };
    saveResources(resources);
    return resources[idx];
  },

  async remove(id): Promise<void> {
    await delay();
    saveResources(loadResources().filter(r => r.id !== id));
  },
};
