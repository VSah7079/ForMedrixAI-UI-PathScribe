// src/services/molecular/resolveMolecularControlRequirementValidation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the given specification's own §3.2 "Dynamic Control
// Rules" / "Position Enforcements" — see
// IMolecularAssayControlRuleService.ts's own header for the full
// account of why this exists.
// ─────────────────────────────────────────────────────────────────────────────

import type { MolecularWell } from './IMolecularBatchService';
import type { MolecularAssayControlRule } from './IMolecularAssayControlRuleService';

export type MolecularControlRequirementViolationReason = 'missing' | 'wrong_fixed_position';

export interface MolecularControlRequirementViolation {
  sampleType: string;
  reason: MolecularControlRequirementViolationReason;
  expectedPosition?: string;
  actualPosition?: string;
}

export interface MolecularControlRequirementResult {
  satisfied: boolean;
  violations: MolecularControlRequirementViolation[];
}

/**
 * Real, per the given specification's own §3.2: checks a real batch's
 * own wells against the real, admin-defined control rule for its own
 * assay code — real, honest "absence means no constraint" convention
 * (same one this app already uses elsewhere, e.g.
 * FacilityInterfaceEngineConnection): an assay with no real rule
 * defined for it has nothing to satisfy, not an automatic failure.
 * When a rule does exist, every real required control must genuinely
 * be present, and — for a 'fixed' position control — at the exact
 * real required well; a 'random' control only needs to be present
 * somewhere, deliberately never checked against a specific position,
 * per the spec's own "to prevent cross-contamination patterns"
 * reasoning for that mode.
 */
export function resolveMolecularControlRequirementValidation(
  assayCode: string,
  wells: MolecularWell[],
  rules: MolecularAssayControlRule[],
): MolecularControlRequirementResult {
  const rule = rules.find(r => r.assayCode === assayCode);
  if (!rule) return { satisfied: true, violations: [] };

  const violations: MolecularControlRequirementViolation[] = [];

  for (const required of rule.requiredControls) {
    const matchingWells = wells.filter(w => w.sampleType === required.sampleType);
    if (matchingWells.length === 0) {
      violations.push({ sampleType: required.sampleType, reason: 'missing' });
      continue;
    }
    if (required.positionMode === 'fixed' && required.fixedWellPosition) {
      const atFixedPosition = matchingWells.some(w => w.wellPosition === required.fixedWellPosition);
      if (!atFixedPosition) {
        violations.push({
          sampleType: required.sampleType, reason: 'wrong_fixed_position',
          expectedPosition: required.fixedWellPosition, actualPosition: matchingWells[0].wellPosition,
        });
      }
    }
  }

  return { satisfied: violations.length === 0, violations };
}
