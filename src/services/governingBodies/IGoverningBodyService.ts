// src/services/governingBodies/IGoverningBodyService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real persistence for Governing Bodies (CAP, RCPath, ICCR, RCPA, and any
// custom bodies a super-admin adds) — found via a direct audit that
// components/Config/System/GoverningBodiesSection.tsx's handleSave was
// a bare `/* TODO: persist */` comment: every toggle, edit, add, and
// remove only ever touched React state, never saved anywhere. A refresh
// silently discarded every change, while the UI's own "unsaved changes"
// indicator cleared as if the save had genuinely succeeded.
//
// firestore.rules already has a real /governingBodies/{docId} collection
// defined (platform-level, ForMedrix-staff-only write access) — the
// backend schema already anticipated this data existing; the frontend
// just never actually wrote to it.
//
// Global, not organisation-scoped — CAP/RCPath/ICCR/RCPA are platform-
// wide standards bodies, the same "platform-level admin config" concept
// firestore.rules' own comment describes for this collection, distinct
// from anything org-scoped elsewhere in this app.
//
// Real, architectural fix, per direct follow-up: "if CAP or RCPath or
// some other governmental agency changes their rule, then we need to
// actually release software in order to stay compliant." Confirmed
// directly: RetentionPolicy.ts's own JURISDICTION_RETENTION_DEFAULTS
// was a hardcoded TypeScript constant — updating it for a real,
// published guidance change (like RCPath's own October 2025 update)
// meant a real code change and a real release. retentionPolicyVersions
// below moves that data here instead — a real, live, Firestore-backed
// record only ForMedrix staff can write.
//
// Real, second architectural fix, per direct follow-up: "it depends
// entirely on whether the regulation lengthens or shortens the
// retention period, as well as statutory grandfathering clauses." The
// first version of this file modeled retentionDefaults as a single,
// mutable record — editing it in place would have RETROACTIVELY
// applied every real change to every real case, correct for a
// lengthening change but a genuine compliance trap for a shortening
// one (material signed out under an older, longer-retention legal
// framework can carry a real, legal obligation to that framework's
// own terms, not whatever figure happens to be configured today).
// retentionPolicyVersions is the real fix: an append-only, immutable
// history of real, dated versions, each with its own real
// applyToExistingInventory choice — see resolveRetentionEligibility.ts's
// own resolveApplicableRetentionVersion for the real resolution logic
// this enables.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

/**
 * Real, single, dated version of a governing body's own retention
 * figures — the real, versioned replacement for what used to be a
 * single, mutable GoverningBodyRetentionDefaults record. Immutable
 * once created: a real policy change is always a NEW version, never
 * an edit to an existing one, the same real "append, never mutate
 * history" discipline this app already uses for ReportVersionRecord
 * PDF snapshots at sign-out.
 */
export interface RetentionPolicyVersion {
  /** Real, sequential, human-facing version id — e.g. "v1", "v2" —
   *  shown directly in the admin UI's own version history. */
  version: string;
  /** ISO date — when this version's own figures take effect. The
   *  real anchor resolveApplicableRetentionVersion compares both
   *  "today" and a specific case's own finalizedAt against. */
  effectiveDate: string;
  block: number;
  slide: number;
  wet_tissue: number;
  /** Real, honest provenance — required, not optional. Every real
   *  figure in this app traces to a real, named, dated source (or is
   *  explicitly marked as an unverified placeholder) — never a bare
   *  number with no citation. */
  sourceNote: string;
  /**
   * Real, deliberate per-version choice, per direct follow-up's own
   * two, distinct rules:
   *   true  — "Longer Retention Rules... Applies immediately to all
   *           materials currently in physical storage... You cannot
   *           dispose of a 12-year-old block today simply because it
   *           met the old 10-year rule when it was accessioned." This
   *           version's own figures apply to EVERY real case once
   *           effectiveDate has passed, regardless of that case's own
   *           finalizedAt.
   *   false — "Shorter Retention Rules... Typically applies
   *           prospectively from the enactment date... Material
   *           collected under older, stricter legal frameworks...
   *           often carries a legal obligation to adhere to the terms
   *           active at the time of accessioning." This version only
   *           applies to a real case whose own finalizedAt is on or
   *           after effectiveDate — an earlier case keeps using
   *           whichever version was genuinely active at ITS OWN
   *           finalizedAt (grandfathered).
   * Real, deliberate default posture for a NEW version: false — a
   * super-admin publishing a shorter figure must explicitly opt into
   * retroactive application, never get it by accident from an
   * unchecked default.
   */
  applyToExistingInventory: boolean;
  createdAt: string;
  createdBy: string;
}

export interface GoverningBody {
  id:          string;
  label:       string;
  fullName:    string;
  region:      string;
  website:     string;
  enabled:     boolean;
  syncEnabled: boolean;
  isCustom:    boolean;
  /** Real, deliberate mapping — which of this app's own, deployment-
   *  locked Jurisdiction values this body's retention versions
   *  govern. RCPath covers all three real UK jurisdictions at once
   *  (same guidance, three Jurisdiction entries); CAP covers only
   *  'US'. Undefined/empty is real and valid — a body can exist here
   *  (cited, real, ready) without yet being wired into automatic
   *  getCurrentJurisdiction()-driven resolution, e.g. a body covering
   *  a real region that isn't yet one of this app's own Jurisdiction
   *  values (see RetentionPolicy.ts's own header for the EU/Korea
   *  case this covers). */
  jurisdictions?: Jurisdiction[];
  /** Real, append-only version history — undefined/empty for a body
   *  that genuinely doesn't publish specimen-retention guidance at
   *  all (ICCR is a cancer-reporting-protocol body, not a retention-
   *  policy one) rather than a fabricated zero/default. See
   *  resolveRetentionEligibility.ts's own resolveApplicableRetentionVersion
   *  for how a real case's own retention figure is resolved from
   *  this history. */
  retentionPolicyVersions?: RetentionPolicyVersion[];
}

export interface IGoverningBodyService {
  getAll(): Promise<GoverningBody[]>;
  /** Real, whole-list save — matches how GoverningBodiesSection.tsx
   *  already manages this as one in-memory array with a single
   *  Save button, rather than per-row autosave. */
  saveAll(bodies: GoverningBody[]): Promise<void>;
}
