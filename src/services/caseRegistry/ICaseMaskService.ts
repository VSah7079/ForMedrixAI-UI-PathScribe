// src/services/caseRegistry/ICaseMaskService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance: replaces ICaseRegistryService (one
// CaseMaskConfig per organisationId, with override merging baked into
// allocateNextCaseNumber itself). This service now only ever deals in
// real, individually-scoped CaseMask records — the "which one applies
// to this case" decision is the caller's job, via
// resolveCaseMaskScopeCandidates.ts, not this service's.
// ─────────────────────────────────────────────────────────────────────────────
import { ServiceResult } from '../types';
import { CaseMask, CaseMaskScopeType } from '@/types/config/CaseMask';
import type { CaseMaskScopeCandidate } from './resolveCaseMaskScopeCandidates';

export interface ICaseMaskService {
  /** Returns the CaseMask defined for one specific, real scope point,
   *  or null if that scope has never had one defined — a real,
   *  ordinary state (it simply falls through to the next real
   *  candidate at allocation time), never an error. */
  getMask(scopeType: CaseMaskScopeType, scopeId: string): Promise<ServiceResult<CaseMask | null>>;

  /** Every real, currently-defined CaseMask across every scope — for
   *  the admin UI's own list view, grouped by scope type. */
  getAllMasks(): Promise<ServiceResult<CaseMask[]>>;

  /** Creates or fully replaces the CaseMask at one real scope point.
   *  Does NOT reset currentSequence unless the caller explicitly
   *  includes it — changing the mask pattern shouldn't silently
   *  restart numbering. */
  saveMask(mask: CaseMask): Promise<ServiceResult<CaseMask>>;

  /** Removes a scope's own CaseMask entirely. Cases at that exact
   *  scope fall back to the next real candidate in
   *  resolveCaseMaskScopeCandidates' own order (or the default
   *  fallback scheme if none exists) from that point on — this does
   *  NOT retroactively touch any accession number already issued. */
  deleteMask(scopeType: CaseMaskScopeType, scopeId: string): Promise<ServiceResult<void>>;

  /** Allocates and formats the next case number. candidates is the
   *  real, ordered list of scope points this specific case could draw
   *  from (see resolveCaseMaskScopeCandidates.ts) — the first
   *  candidate with a real, defined CaseMask is used whole, no
   *  merging with any other scope. Falls back to the default
   *  {PREFIX}{YEAR:2}-{SEQ:4}/'O' scheme (logging, not throwing) when
   *  none of the candidates has a real CaseMask defined yet, so an
   *  unconfigured case never blocks accessioning.
   *
   *  Real, high-priority requirement, unchanged from the prior
   *  system: timezone is required, not optional/defaulted. An
   *  accession number is a permanent, legally-binding clinical
   *  identifier tied to physical tissue and chain of custody — its
   *  real {YEAR} component (and whether the annual sequence counter
   *  resets) must be derived from the real facility's own timezone,
   *  never the browser/device generating it. See utils/facilityTime.ts. */
  allocateNextCaseNumber(candidates: CaseMaskScopeCandidate[], timezone: string): Promise<ServiceResult<string>>;

  /** Renders what allocateNextCaseNumber would currently produce
   *  WITHOUT consuming a sequence number — for the admin config
   *  screen's live preview and for the Department/Facility editors'
   *  own inline preview. Same candidates/timezone contract as
   *  allocateNextCaseNumber. */
  previewNextCaseNumber(candidates: CaseMaskScopeCandidate[], timezone: string): Promise<ServiceResult<string>>;
}
