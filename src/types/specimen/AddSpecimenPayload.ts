// src/types/specimen/AddSpecimenPayload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Input shape for adding a specimen during accessioning/grossing. Deliberately
// does NOT carry hospitalId/siteId — a specimen can't belong to a different
// facility than its parent case, so ModeAInterfaceService derives that from
// Case.originHospitalId (-> Organisation) at dispatch time rather than
// trusting a redundant, potentially-inconsistent value on every specimen.
// ─────────────────────────────────────────────────────────────────────────────

export interface AddSpecimenPayload {
  /** Internal Case key — Case.id, e.g. 'O26-0029'. Never the mask-driven
   *  accessionNumber; see AccessionMetadata.fullAccession's doc comment
   *  for why these two must stay separate. */
  caseId: string;

  specimenLetter: string;              // 'A'
  /** References Department.id — real seeded ids look like
   *  'cat-surgical-tissue', not an invented constant like 'SURGICAL'. */
  departmentId: string;
  description: string;                 // 'Lung, right lower lobe, wedge resection'
  containerType: string;
  fixative: string;

  // Processing directives
  initialBlockCount?: number;
  requestedStains?: string[];
  /** Triggers a Mode A dispatch immediately on submit — see
   *  services/hardware/ModeAInterfaceService.ts. False just persists the
   *  specimen without emitting any event. */
  printImmediateLabel: boolean;
}
