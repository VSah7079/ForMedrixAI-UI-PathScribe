// src/services/externalResources/IExternalResourceService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real admin-managed replacement for the hardcoded quickLinks object that
// used to live directly in pages/WorklistPage/WorklistPage.tsx (CAP
// Cancer Protocols, WHO Classification, PathologyOutlines, UpToDate,
// Hospital LIS, Lab Management) — found broken when the CAP URL 404'd
// and there was no way for anyone to fix it without a code change.
//
// Two real scope levels, matching the same org-default + per-client
// -override pattern already established for idle-session-timeout
// (services/session/) and the AI orchestrator toggle
// (Client.internalAiOrchestratorEnabled):
//   - 'enterprise' — visible to everyone in the organisation.
//   - 'lab'        — visible only at the specific performing lab
//                     (Client) it's tied to, layered ON TOP of the
//                     enterprise set, not replacing it.
//
// Always scoped to a real organisationId — never a flat, global list.
// A resource created for one organisation must never surface for a
// different, unrelated one, the same MPI-not-EMPI reasoning already
// applied in services/patients/. And per a direct requirement: the
// viewer only ever sees what's actually RELEVANT to them — their own
// organisation's enterprise set, plus their own performing lab's
// lab-scoped set — never every resource any admin anywhere has ever
// created.
// ─────────────────────────────────────────────────────────────────────────────

export type ExternalResourceCategory = 'protocols' | 'references' | 'systems';
export type ExternalResourceScope = 'enterprise' | 'lab';

export interface ExternalResource {
  id: string;
  title: string;
  url: string;
  category: ExternalResourceCategory;
  scope: ExternalResourceScope;
  organisationId: string;
  /** Only set (and only meaningful) when scope === 'lab' — the specific
   *  performing lab Facility this resource belongs to. */
  facilityId?: string;
  createdAt: string;
  updatedAt: string;
}

/** What a viewer is actually relevant to — resolved once by the caller
 *  (from session + whichever performing labs their actually-visible
 *  cases belong to) and passed in, rather than this service reaching
 *  into session/case state itself. Keeps the resolution logic testable
 *  and matches the "pure, data-only" pattern already used by
 *  resolvePerformingLabFacilityId(). */
export interface ExternalResourceViewerContext {
  organisationId: string;
  /** Every performing-lab Facility actually relevant to this viewer right
   *  now — e.g. on the Worklist, every lab their currently-visible cases
   *  (including pool cases, which can span multiple hospitals) actually
   *  belong to, not a single fixed "current lab." A viewer working
   *  across several labs' pools sees each of those labs' own resources,
   *  not just the first one or none at all. Absent or empty means no
   *  lab-scoped resources surface, only the enterprise set. */
  performingLabFacilityIds?: string[];
}

export interface IExternalResourceService {
  /** Admin-facing — every resource for one organisation, regardless of
   *  scope, for the management screen. Never used for the viewer-facing
   *  resolution below. */
  listForOrganisation(organisationId: string): Promise<ExternalResource[]>;

  /** The real viewer-facing entry point — returns only what's relevant
   *  to this specific viewer, grouped by category the same shape the
   *  existing ResourcesModal.tsx already expects. */
  resolveForViewer(context: ExternalResourceViewerContext): Promise<Record<ExternalResourceCategory, ExternalResource[]>>;

  create(input: Omit<ExternalResource, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExternalResource>;
  update(id: string, changes: Partial<Omit<ExternalResource, 'id' | 'organisationId' | 'createdAt' | 'updatedAt'>>): Promise<ExternalResource | null>;
  remove(id: string): Promise<void>;
}
