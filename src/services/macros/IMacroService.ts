import { ServiceResult, ID } from '../types';

export type MacroCategory = 'Diagnosis' | 'Gross Description' | 'Microscopic' | 'Comment' | 'Addendum' | 'Custom';

export interface Macro {
  id: ID;
  name: string;
  shortcut: string;          // e.g. ".norm" — typed in editor to expand
  category: MacroCategory;
  content: string;           // Rich text / plain text body
  subspecialtyIds: string[]; // Empty = available to all
  snomedCodes: string[];     // Associated SNOMED codes
  icdCodes: string[];        // Associated ICD-10 codes
  createdBy: string;         // userId
  status: 'Active' | 'Inactive';
  /**
   * Real, per direct guidance ("My Macros - Organize under Facility"):
   * which real performing lab this macro belongs to — same Global/
   * scoped convention as everywhere else in this app. Undefined means
   * Enterprise-wide (visible at every facility); set means visible
   * only at that specific facility. Independent of ownerUserId below —
   * a facility-scoped macro is still shared with everyone AT that
   * facility, not personal to one person.
   */
  performingLabFacilityId?: string;
  /**
   * Real, per direct guidance: when set, this macro is personal —
   * visible and usable only by this one real user (getSessionUser().id),
   * regardless of performingLabFacilityId. The real three-tier
   * visibility model this enables: Enterprise (both fields undefined),
   * Facility (performingLabFacilityId set, ownerUserId undefined),
   * Staff/Personal (ownerUserId set — see isMacroVisibleTo() below for
   * the real, single resolution rule). Real fix, found in the same
   * pass: MacroPanel.tsx's own "My Macros" title implied this always
   * existed — it didn't; createdBy was a hardcoded literal
   * ('current-user') for every macro ever saved, and getAll() applied
   * no ownership filtering at all.
   */
  ownerUserId?: string;
}

/**
 * Real, per direct guidance: the single, shared resolution rule for
 * which macros a given user can see/use, given their own id and the
 * real performing lab of whatever case/context they're currently in
 * (resolved via resolvePerformingLabFacilityId elsewhere — never
 * guessed here). A union of all three real tiers, not a
 * most-specific-wins override: a real user should see every Enterprise
 * macro, every macro scoped to their own current facility, AND their
 * own personal macros, all at once — unlike Print Settings/Case Mask's
 * own "one winning value" resolution, multiple macros can and should
 * be simultaneously visible.
 */
export function isMacroVisibleTo(macro: Macro, userId: string, performingLabFacilityId?: string): boolean {
  if (macro.ownerUserId) return macro.ownerUserId === userId;
  if (macro.performingLabFacilityId) return macro.performingLabFacilityId === performingLabFacilityId;
  return true; // Enterprise-wide — no owner, no facility scope
}

export interface IMacroService {
  getAll(): Promise<ServiceResult<Macro[]>>;
  getById(id: ID): Promise<ServiceResult<Macro>>;
  getByShortcut(shortcut: string): Promise<ServiceResult<Macro | null>>;
  getForSubspecialty(subspecialtyId: string): Promise<ServiceResult<Macro[]>>;
  add(macro: Omit<Macro, 'id'>): Promise<ServiceResult<Macro>>;
  update(id: ID, changes: Partial<Omit<Macro, 'id'>>): Promise<ServiceResult<Macro>>;
  deactivate(id: ID): Promise<ServiceResult<Macro>>;
  reactivate(id: ID): Promise<ServiceResult<Macro>>;
}
