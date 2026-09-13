// src/services/users/IUserService.ts
import { VoiceProfileId } from '../../constants/voiceProfiles';
import { ServiceResult, ID } from '../types';

export interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: string[];
  npi: string;
  license: string;
  phone: string;
  signatureUrl?: string;
  status: 'Active' | 'Inactive';
  /** The personal linguistic override.
   * If undefined/null, the system falls back to the Global Facility Profile.
   */
  voiceProfile?: VoiceProfileId | null;
  /** Professional credentials suffix (e.g. MD, FCAP, MBChB, FRCPath) */
  credentials?: string;
  /** Real, per direct guidance's own explicit design — sign-out
   *  permissions stored as real, scoped credentials/sub-capabilities
   *  on the user record, not a dynamic top-level role. Deliberately a
   *  separate field from `credentials` above (a formatted display
   *  suffix) — same word, genuinely different real meaning. Real,
   *  honest note: this app has two, separate, pre-existing StaffUser
   *  definitions (this one and types/index.ts's own) — this field is
   *  added to both for consistency, not a sign either has been
   *  unified into the other. */
  providerCredentials?: import('@/types/staff/ProviderCredential').ProviderCredential[];
  /** Option C — user-level pediatric qualification flag.
   * Must also be on the facility's authorizedPediatricPathologistIds list. */
  canViewPediatric?: boolean;
  /** Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL
   *  Intraoperative/Frozen Section Dashboard's own Location-First +
   *  Quick Auth design ("Proximity Badge Tap (RFID/NFC) or 4-digit
   *  PIN"). Real, honest mock scope: a genuine RFID/NFC badge reader
   *  is real hardware integration this codebase cannot build — the
   *  PIN half is real and fully working today, standing in for
   *  whichever real credential a real deployment actually wires up.
   *  Only meaningful for a real 'or-staff' role — lab staff keep
   *  using the existing, real login. */
  quickAuthPin?: string;
  /**
   * User-level flag granting visibility into Orchestration/Outreach cases
   * (O26- prefix, routed by CaseRouter to the PathScribe Firestore service)
   * across Search and Worklist. Unlike canViewPediatric, this is a single
   * flag with no second authorization layer — Orchestration cases aren't
   * tied to a per-facility list, so there's no equivalent of "Option C" here.
   * Defaults to false/undefined — must be explicitly granted.
   */
  canViewOrchestration?: boolean;
  /**
   * Real, granular permission distinct from role: 'superadmin' — grants
   * cross-tenant visibility specifically for QA/compliance reporting
   * views (see qaReportUtils.ts's QaScope 'enterprise' level and the QA
   * tabs in components/QualityAssurance/), without granting the broader
   * platform-admin case-access bypass superadmin implies. Least-
   * privilege: an enterprise compliance officer who legitimately needs
   * cross-tenant QA reports shouldn't also need full superadmin case
   * access as a side effect of that. Matches the design spec's
   * SYSTEM_QA_CROSS_TENANT permission. Defaults to false/undefined —
   * must be explicitly granted, same as canViewOrchestration.
   */
  canAccessCrossTenantQa?: boolean;
  /**
   * The Organisation (services/organisation/organisationService.ts) this
   * staff member belongs to — the actual tenant/enterprise boundary.
   * Added June 2026 to close a real access-control gap: before this,
   * NOTHING tied a user to an organisation at all. The only "hospital
   * scoping" that existed was a hardcoded USER_HOSPITAL_MAP buried inside
   * mockCaseService.ts's listCasesForUser(), which only filtered which
   * pool cases appeared in a worklist list view — it was never enforced
   * on getCase()/getAll(), meaning any user with a case ID (via search,
   * a shared link, etc.) could open a case from any hospital regardless
   * of that map. That map is retired; this field plus
   * services/auth/caseAccessControl.ts is the real enforcement,
   * applied in getCase()/getAll()/listCasesForUser() on both case
   * services, not just one list view.
   *
   * Undefined/null = no organisation = no case access (deny by default),
   * except for role: 'superadmin' sessions, which bypass this check
   * entirely — the standard "platform admin" pattern for a genuine
   * PathScribe-internal support role that legitimately needs cross-tenant
   * visibility, as opposed to an ordinary user's home organisation.
   *
   * Case data today only carries Organisation-level granularity
   * (Case.originHospitalId legacy-maps 1:1 to an Organisation, not a
   * specific Site — see getOrganisationByHospitalId's own comment) — so
   * "can this user see this case" currently is exactly "does the case's
   * organisation match the user's organisation." A user with access to
   * their organisation sees all of that organisation's cases, which is
   * the correct default per the enterprise-wide-within-your-own-org
   * requirement. True sub-organisation (single-site-only) restriction
   * would need Case to carry a real Site.id instead of the legacy
   * Organisation-granularity hospital ID — a separate, deeper migration,
   * not built here; flagged so this isn't mistaken for finer-grained
   * access control than actually exists.
   */
  organisationId?: string;
  /** GMC number for UK users */
  gmcNumber?: string;
  /** Middle name or initial */
  middleName?: string;
  /**
   * Real feature, per direct follow-up building a real fallback chain
   * for session station init: "Fallback to User Profile: If no
   * device-level ID exists, pull the logged-in user's
   * default_station_id." A real, admin-assigned home station for
   * roaming staff — distinct from the device-level, localStorage-
   * backed sticky station (useCurrentScanStation.ts), which still
   * takes priority when it exists (a fixed workstation's own identity
   * always wins over whichever user happens to log in there).
   */
  defaultScanStationId?: string;
}

export interface IUserService {
  getAll(): Promise<ServiceResult<StaffUser[]>>;
  getById(id: ID): Promise<ServiceResult<StaffUser>>;
  add(user: Omit<StaffUser, 'id'>): Promise<ServiceResult<StaffUser>>;
  update(id: ID, changes: Partial<Omit<StaffUser, 'id'>>): Promise<ServiceResult<StaffUser>>;
  deactivate(id: ID): Promise<ServiceResult<StaffUser>>;
  reactivate(id: ID): Promise<ServiceResult<StaffUser>>;
}
