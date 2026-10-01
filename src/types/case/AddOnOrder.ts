// src/types/case/AddOnOrder.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-287 (Pathologist-Initiated Add-On Orders — Recuts, Special Stains,
// IHC, and Molecular). Shared constants/small types for the Add-On
// Order Builder — the StainOrder-level fields this ticket actually adds
// (addOnPriority, exception, etc.) live directly on StainOrder in
// Specimen.ts, next to every other real field a StainOrder already has;
// this file holds only the runtime-iterable constants (dropdown/picker
// option lists) and the one genuinely new, freestanding concept this
// ticket introduces — the IHC panel preset. See
// utils/addOnOrderOperations.ts for the real creation/routing/exception
// logic built against these, and pages/AddOnOrderPage/README.md for the
// full investigation this was built against.
// ─────────────────────────────────────────────────────────────────────────────

export const ADD_ON_ORDER_PRIORITIES = ['STAT/Urgent', 'Routine Sign-Out', 'Research/Protocol'] as const;
export type AddOnOrderPriority = typeof ADD_ON_ORDER_PRIORITIES[number];

export const SLIDE_MEDIA_TYPES = ['Standard Charged', 'Uncharged', 'Plus Glass'] as const;
export type SlideMediaType = typeof SLIDE_MEDIA_TYPES[number];

/** Real, per the spec's own §3 "Automatic Order Splitting." A real,
 *  closed set — resolveAddOnRouting (utils/addOnOrderOperations.ts) is
 *  the one place that ever assigns one of these, from the ordered
 *  StainType's own real category, never free text. */
export const ADD_ON_ROUTE_QUEUES = [
  'Histology Cutting Queue', 'Special Stains Bench Queue',
  'IHC/Special Histochemistry Queue', 'Reference/Send-Out Lab Queue',
] as const;
export type AddOnRouteQueue = typeof ADD_ON_ROUTE_QUEUES[number];

export const BLOCK_EXCEPTION_REASONS = ['Block exhausted', 'Insufficient tissue for panel', 'Requires re-grossing'] as const;
export type BlockExceptionReason = typeof BLOCK_EXCEPTION_REASONS[number];

export const ADD_ON_ORDER_KINDS = ['recut', 'special_stain', 'ihc', 'molecular'] as const;
export type AddOnOrderKind = typeof ADD_ON_ORDER_KINDS[number];

export const CONTROL_MODES = ['none', 'on_slide', 'separate_slide'] as const;
export type ControlMode = typeof CONTROL_MODES[number];

/** Real, per the spec's own "IHC panel picker... panel search (e.g.
 *  Breast Panel: ER/PR/HER2/Ki-67)." A genuinely missing concept
 *  before this pass — confirmed by direct investigation: the existing
 *  StainOrderMacro (services/stains/IStainService.ts) is a real,
 *  adjacent-but-different thing (ONE stain + ONE sectioning protocol,
 *  a single-click preset), never a multi-stain grouping. This is a
 *  real, small, honest starter set — every stainTypeId below is a
 *  real, existing seed StainType (confirmed directly against
 *  mockStainTypeService.ts), not a fabricated catalog — rather than a
 *  full, admin-manageable panel dictionary, which is real, separate
 *  follow-up work (a whole new Config/System section, its own
 *  service/mock/README triplet) not attempted in this pass. */
export interface IhcPanelDefinition {
  id: string;
  name: string;
  stainTypeIds: string[];
}

export const IHC_PANEL_PRESETS: IhcPanelDefinition[] = [
  { id: 'panel-breast', name: 'Breast Panel (ER/PR/HER2/Ki-67)', stainTypeIds: ['st-er', 'st-pr', 'st-her2', 'st-ki67'] },
  { id: 'panel-lynch-mmr', name: 'Lynch/MMR Panel (MLH1/MSH2/MSH6/PMS2)', stainTypeIds: ['st-mlh1', 'st-msh2', 'st-msh6', 'st-pms2'] },
  { id: 'panel-renal-if', name: 'Renal IF Panel (IgG/IgA/IgM/C3/C1q/Kappa/Lambda)', stainTypeIds: ['st-igg', 'st-iga', 'st-igm', 'st-c3', 'st-c1q', 'st-kappa', 'st-lambda'] },
];
