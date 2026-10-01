// src/services/authorization/capabilityCatalog.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-355 (Batch 369): the catalog of capabilities, the one list of things a
// role can be granted that PathScribe actually enforces.
//
//   • Keys are `domain:object:verb`, verb last: `qa:fppe-tracking:export`.
//   • Every capability here is checked by a service (the authorization
//     guard test fails the build otherwise), so there are no dead flags.
//   • A capability is added when its check is added, never before. Actions
//     not yet identified are simply not in the catalog yet.
//   • `requires` lists capabilities this one can't be used without. The
//     Role Dictionary offers to turn them on with it, the role service
//     refuses a role that has one without the other, and the check denies
//     it. Use it when one capability exposes the data of another (the
//     evidence binder exports the records the QA dashboard totals).
//   • `group` is how administrators see the list in Staff → Roles.
//   • Risk 'high' means every check of it at an action is written to the
//     audit log, allowed or denied. Every export is high risk.
//
// Labels and descriptions are UI text: `capabilities.items.<labelId>` in the
// locale files. The key itself is what's stored on a role and audited.
//
// Not to be confused with constants/systemActions.ts (ACTION_GROUPS): those
// are the voice and keyboard commands, which are not access control.
// ─────────────────────────────────────────────────────────────────────────────

export type CapabilityRisk = 'high' | 'standard';

export type CapabilityGroupId =
  | 'screens'
  | 'casework'
  | 'billing'
  | 'reportHistory'
  | 'qaOperations'
  | 'qaCapa'
  | 'qaFinancials'
  | 'qaCytology'
  | 'qaOversight'
  | 'administration'
  | 'supportAccess'
  | 'platform';

export interface CapabilityDefinition {
  /** Stored on roles and written to the audit log. Never change a published key. */
  readonly key: string;
  /** Locale key under capabilities.items. */
  readonly labelId: string;
  readonly group: CapabilityGroupId;
  readonly risk: CapabilityRisk;
  /** Capabilities that must be granted too for this one to work. */
  readonly requires: readonly string[];
  /** Batch 371 (Pete): ForMedrixAI platform support only. Held only through
   *  a role staff can't be given (Superadmin); a hospital role can never
   *  hold it, and a hospital administrator can't grant it. */
  readonly platformOnly?: boolean;
}

/** The order groups are shown in. */
export const CAPABILITY_GROUPS: readonly CapabilityGroupId[] = [
  'screens', 'casework', 'billing', 'reportHistory', 'qaOperations', 'qaCapa', 'qaFinancials', 'qaCytology', 'qaOversight', 'administration', 'supportAccess', 'platform',
];

export const CAPABILITY_CATALOG = [
  // ── Screens (Batch 374) ───────────────────────────────────────────────────
  // Pete: "Home Page should only show tiles that the User has access to."
  // One capability per screen. The Home page and the two hubs show only the
  // tiles whose screen the user may open, and the route itself checks again
  // (services/screens/screenAccess.ts). Standard risk: opening a screen
  // isn't audited; what is done there is checked by its own capabilities.
  { key: 'screen:accession:open',            labelId: 'screenAccessionOpen',           group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:worklist:open',             labelId: 'screenWorklistOpen',            group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:search:open',               labelId: 'screenSearchOpen',              group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:add-on-orders:open',        labelId: 'screenAddOnOrdersOpen',         group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:intraop-queue:open',        labelId: 'screenIntraopQueueOpen',        group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:cytology-qc-queue:open',    labelId: 'screenCytologyQcQueueOpen',     group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:surgical-qa-worklist:open', labelId: 'screenSurgicalQaWorklistOpen',  group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:my-contributions:open',     labelId: 'screenMyContributionsOpen',     group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:batch-management:open',     labelId: 'screenBatchManagementOpen',     group: 'screens', risk: 'standard', requires: [] },
  // Pathology Workspace hub
  { key: 'screen:cytology-workspace:open',   labelId: 'screenCytologyWorkspaceOpen',   group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:microtomy:open',            labelId: 'screenMicrotomyOpen',           group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:embedding:open',            labelId: 'screenEmbeddingOpen',           group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:slide-distribution:open',   labelId: 'screenSlideDistributionOpen',   group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:molecular:open',            labelId: 'screenMolecularOpen',           group: 'screens', risk: 'standard', requires: [] },
  // Quality & Compliance hub
  { key: 'screen:audit-log:open',            labelId: 'screenAuditLogOpen',            group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:quality-assurance:open',    labelId: 'screenQualityAssuranceOpen',    group: 'screens', risk: 'standard', requires: [] },
  { key: 'screen:configuration:open',        labelId: 'screenConfigurationOpen',       group: 'screens', risk: 'standard', requires: [] },

  // ── Case work (Batch 378) ─────────────────────────────────────────────────
  // Completing grossing moves a case to Gross Complete after checking the
  // organisation's Grossing field requirements (services/grossing).
  { key: 'case:grossing:complete', labelId: 'caseGrossingComplete', group: 'casework', risk: 'high', requires: [] },
  // Batch 381 (Pete: "Add, keep today's users"): holds and delegation had no
  // permission check. Checked in services/cases/caseHolds.ts and
  // delegations/mockDelegationService.ts; seeded to every role that could
  // open a case report before, so nobody loses them.
  { key: 'case:hold:place',             labelId: 'caseHoldPlace',             group: 'casework', risk: 'high', requires: [] },
  { key: 'case:hold:release',           labelId: 'caseHoldRelease',           group: 'casework', risk: 'high', requires: [] },
  { key: 'case:retention-hold:place',   labelId: 'caseRetentionHoldPlace',    group: 'casework', risk: 'high', requires: [] },
  { key: 'case:retention-hold:release', labelId: 'caseRetentionHoldRelease',  group: 'casework', risk: 'high', requires: [] },
  { key: 'case:delegation:create',      labelId: 'caseDelegationCreate',      group: 'casework', risk: 'high', requires: [] },

  // ── Billing (Batch 382) ───────────────────────────────────────────────────
  // Correcting an applied billing code credits the original charge and bills
  // the new one. Pete: keep today's users, but as a permission of its own,
  // apart from case access, so a hospital can later take it off its clinical
  // roles without changing the service. Checked in services/billing/
  // correctServiceCharge.ts (enforceAppliedCodeCorrection).
  { key: 'billing:applied-code:correct', labelId: 'billingAppliedCodeCorrect', group: 'billing', risk: 'high', requires: [] },

  // ── Report history ────────────────────────────────────────────────────────
  { key: 'report:change-history:export', labelId: 'reportChangeHistoryExport', group: 'reportHistory', risk: 'high', requires: [] },

  // ── Quality assurance: Operations pillar ─────────────────────────────────
  { key: 'qa:deficiencies:export',            labelId: 'qaDeficienciesExport',           group: 'qaOperations', risk: 'high', requires: [] },
  { key: 'qa:intraop-linkage:export',         labelId: 'qaIntraopLinkageExport',         group: 'qaOperations', risk: 'high', requires: [] },
  { key: 'qa:reconciliation:export',          labelId: 'qaReconciliationExport',         group: 'qaOperations', risk: 'high', requires: [] },
  { key: 'qa:countersign-turnaround:export',  labelId: 'qaCountersignTurnaroundExport',  group: 'qaOperations', risk: 'high', requires: [] },
  { key: 'qa:fppe-tracking:export',           labelId: 'qaFppeTrackingExport',           group: 'qaOperations', risk: 'high', requires: [] },
  { key: 'qa:drift-correction:export',        labelId: 'qaDriftCorrectionExport',        group: 'qaOperations', risk: 'high', requires: [] },
  { key: 'qa:patient-match-review:export',    labelId: 'qaPatientMatchReviewExport',     group: 'qaOperations', risk: 'high', requires: [] },
  { key: 'qa:access-request-response:export', labelId: 'qaAccessRequestResponseExport', group: 'qaOperations', risk: 'high', requires: [] },

  // ── Quality assurance: CAPA pillar ────────────────────────────────────────
  { key: 'qa:management-reviews:export', labelId: 'qaManagementReviewsExport', group: 'qaCapa', risk: 'high', requires: [] },

  // ── Quality assurance: Financials pillar ─────────────────────────────────
  { key: 'qa:billing-deficiencies:export', labelId: 'qaBillingDeficienciesExport', group: 'qaFinancials', risk: 'high', requires: [] },

  // ── Quality assurance: Cytology pillar ───────────────────────────────────
  { key: 'qa:cytology-histology-correlation:export', labelId: 'qaCytologyHistologyCorrelationExport', group: 'qaCytology', risk: 'high', requires: [] },

  // ── Quality assurance: dashboards, inspection and enterprise ─────────────
  { key: 'qa:activity-dashboard:export', labelId: 'qaActivityDashboardExport', group: 'qaOversight', risk: 'high', requires: [] },
  // The binder lists, case by case, the same QA review records the dashboard
  // totals, so anyone who can export it can export the dashboard's figures.
  { key: 'qa:inspection-evidence:export', labelId: 'qaInspectionEvidenceExport', group: 'qaOversight', risk: 'high', requires: ['qa:activity-dashboard:export'] },
  { key: 'qa:enterprise-rollup:export',   labelId: 'qaEnterpriseRollupExport',   group: 'qaOversight', risk: 'high', requires: [] },

  // ── Administration (PS-356, Batch 370) ───────────────────────────────────
  // Before these, anyone signed in could edit roles (their own capabilities
  // included) and staff role assignments: the self-escalation path.
  { key: 'config:roles:manage',        labelId: 'configRolesManage',        group: 'administration', risk: 'high', requires: [] },
  { key: 'config:staff:edit',          labelId: 'configStaffEdit',          group: 'administration', risk: 'high', requires: [] },
  // Roles, facility assignments, pediatric/orchestration/cross-tenant flags
  // and jurisdictional credentials: what someone is allowed to do or see.
  { key: 'config:staff-access:assign', labelId: 'configStaffAccessAssign',  group: 'administration', risk: 'high', requires: ['config:staff:edit'] },
  { key: 'config:demo-data:reset',     labelId: 'configDemoDataReset',      group: 'administration', risk: 'high', requires: [] },
  // PS-359 (Batch 376): which fields each page requires, for the person's own organisation.
  { key: 'config:field-requirements:manage', labelId: 'configFieldRequirementsManage', group: 'administration', risk: 'high', requires: [] },

  // ── Support access (Batch 372) ───────────────────────────────────────────
  // The hospital's control over ForMedrixAI support reaching its data (Pete's
  // specification). Held by the hospital's IT/security administrators; seeded
  // to Admin. Superadmin holds them too, but they act only on the person's
  // own organisation and never on their own request
  // (services/supportAccess/supportAccessRules.ts).
  { key: 'config:support-access:policy',  labelId: 'configSupportAccessPolicy',  group: 'supportAccess', risk: 'high', requires: [] },
  { key: 'config:support-access:approve', labelId: 'configSupportAccessApprove', group: 'supportAccess', risk: 'high', requires: [] },
  { key: 'config:support-audit:view',     labelId: 'configSupportAuditView',     group: 'supportAccess', risk: 'high', requires: [] },

  // ── ForMedrixAI platform support (Batch 371) ──────────────────────────────
  // Pete: Superadmin is reserved for ForMedrixAI support staff, and hospital
  // administrators have no control over it. These are held only through the
  // Superadmin role.
  // Opening a case from another organisation (support access). Every such
  // open is checked and written to the audit log.
  { key: 'platform:cross-tenant-cases:view', labelId: 'platformCrossTenantCasesView', group: 'platform', risk: 'high', requires: [], platformOnly: true },
  // Which governing bodies' content (CAP, RCPath, ICCR, RCPA) syncs into the
  // platform's synoptic library: a platform-wide setting, not a hospital's.
  { key: 'platform:governing-bodies:manage', labelId: 'platformGoverningBodiesManage', group: 'platform', risk: 'high', requires: [], platformOnly: true },
] as const satisfies readonly CapabilityDefinition[];

/** A key that is in the catalog. */
export type CapabilityKey = (typeof CAPABILITY_CATALOG)[number]['key'];

/** The QA report exports (every capability whose key starts `qa:` and ends `:export`). */
export type QaExportCapability = Extract<CapabilityKey, `qa:${string}:export`>;

const BY_KEY = new Map<string, CapabilityDefinition>(CAPABILITY_CATALOG.map(c => [c.key, c]));

export function capabilityDefinition(key: string): CapabilityDefinition | undefined {
  return BY_KEY.get(key);
}

/** Whether a capability is reserved for ForMedrixAI platform support (Batch 371). */
export function isPlatformOnly(key: string): boolean {
  return !!BY_KEY.get(key)?.platformOnly;
}

export function isCapabilityKey(key: string): key is CapabilityKey {
  return BY_KEY.has(key);
}

export const ALL_CAPABILITY_KEYS: readonly CapabilityKey[] = CAPABILITY_CATALOG.map(c => c.key);

/** The catalog grouped for display, groups in CAPABILITY_GROUPS order, empty groups left out. */
export function capabilitiesByGroup(catalog: readonly CapabilityDefinition[] = CAPABILITY_CATALOG): { group: CapabilityGroupId; capabilities: CapabilityDefinition[] }[] {
  return CAPABILITY_GROUPS
    .map(group => ({ group, capabilities: catalog.filter(c => c.group === group) }))
    .filter(g => g.capabilities.length > 0);
}

/** The locale keys for a capability's name and description. */
export const capabilityLabelKey = (c: Pick<CapabilityDefinition, 'labelId'>) => `capabilities.items.${c.labelId}.label`;
export const capabilityDescriptionKey = (c: Pick<CapabilityDefinition, 'labelId'>) => `capabilities.items.${c.labelId}.description`;
export const capabilityGroupKey = (g: CapabilityGroupId) => `capabilities.groups.${g}`;

/** Problems with a catalog: bad key shape, duplicates, unknown requirements, cycles. Empty when sound. */
export function catalogProblems(catalog: readonly CapabilityDefinition[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const labelIds = new Set<string>();
  for (const c of catalog) {
    if (!/^[a-z]+(-[a-z]+)*:[a-z]+(-[a-z]+)*:[a-z]+(-[a-z]+)*$/.test(c.key)) problems.push(`${c.key}: key is not domain:object:verb`);
    if (keys.has(c.key)) problems.push(`${c.key}: duplicate key`);
    if (labelIds.has(c.labelId)) problems.push(`${c.key}: duplicate labelId ${c.labelId}`);
    if (!CAPABILITY_GROUPS.includes(c.group)) problems.push(`${c.key}: unknown group ${c.group}`);
    keys.add(c.key);
    labelIds.add(c.labelId);
  }
  const byKey = new Map(catalog.map(c => [c.key, c]));
  for (const c of catalog) {
    for (const r of c.requires) {
      if (!byKey.has(r)) problems.push(`${c.key}: requires unknown ${r}`);
      if (r === c.key) problems.push(`${c.key}: requires itself`);
    }
  }
  // Cycle check (depth-first, three colours).
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (key: string, path: string[]): void => {
    if (state.get(key) === 'done') return;
    if (state.get(key) === 'visiting') { problems.push(`requirement cycle: ${[...path, key].join(' → ')}`); return; }
    state.set(key, 'visiting');
    for (const r of byKey.get(key)?.requires ?? []) if (byKey.has(r)) visit(r, [...path, key]);
    state.set(key, 'done');
  };
  for (const c of catalog) visit(c.key, []);
  return problems;
}
