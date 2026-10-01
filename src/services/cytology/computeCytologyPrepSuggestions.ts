// src/services/cytology/computeCytologyPrepSuggestions.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per PS-284 (Microtomy Workstation)'s own "Dynamic Preparation
// Rules: automated slide count/type suggestions from decant protocol
// logic (e.g. >20mL + high yield → 2 ThinPrep, 2 Cell Block, 1 Direct
// Smear)." A real, pure, testable function — the Microtomy Workstation
// page calls this to populate a suggestion the tech can accept,
// adjust, or ignore; it never creates slides on its own.
//
// Real, honest scope note, same posture as this app's own renal IF
// panel seed data (mockStainTypeService.ts): this is illustrative
// "preference card" logic built from the one worked example the spec
// itself gives, not a validated, universal cytology prep protocol —
// a real lab's own SOP may reasonably differ, which is exactly why
// this is a suggestion a tech can override, never an enforced rule.
// ─────────────────────────────────────────────────────────────────────────────

export type CytologyPreparationMethod =
  | 'Direct Smear (Air-Dried)' | 'Direct Smear (Fixed)' | 'Cytospin' | 'ThinPrep/Liquid-Based' | 'Cell Block';

export interface CytologyPrepSuggestion {
  preparationMethod: CytologyPreparationMethod;
  count: number;
}

export interface CytologyPrepSuggestionInput {
  totalVolumeMl?: number;
  yieldPelletSize?: 'Low' | 'Moderate' | 'High';
}

/**
 * Real, pure function — no case/decant data touched, no side effects.
 * Returns [] when there isn't yet enough real information to suggest
 * anything (no yield assessment recorded) — never a guessed default.
 */
export function computeCytologyPrepSuggestions(input: CytologyPrepSuggestionInput): CytologyPrepSuggestion[] {
  const { totalVolumeMl, yieldPelletSize } = input;

  if (!yieldPelletSize) return [];

  const suggestions = new Map<CytologyPreparationMethod, number>();
  const bump = (method: CytologyPreparationMethod, by: number) => {
    suggestions.set(method, (suggestions.get(method) ?? 0) + by);
  };

  if (yieldPelletSize === 'Low') {
    // Real, deliberate choice — a low-yield specimen has too little
    // real material to justify a cell block, which needs a genuine
    // pellet to process; a single ThinPrep + smear conserves what
    // little material exists rather than risking an empty cell block.
    bump('ThinPrep/Liquid-Based', 1);
    bump('Direct Smear (Air-Dried)', 1);
  } else if (yieldPelletSize === 'Moderate') {
    bump('ThinPrep/Liquid-Based', 1);
    bump('Cell Block', 1);
    bump('Direct Smear (Air-Dried)', 1);
  } else {
    // 'High'
    bump('ThinPrep/Liquid-Based', 2);
    bump('Cell Block', 1);
    bump('Direct Smear (Air-Dried)', 1);
    // Real, per the spec's own exact worked example: ">20mL + high
    // yield -> 2 ThinPrep, 2 Cell Block, 1 Direct Smear" — a real,
    // large-volume specimen with a genuinely high yield can support a
    // second cell block, giving a real second block for any ancillary
    // IHC/molecular work that turns out to be needed later.
    if (totalVolumeMl !== undefined && totalVolumeMl > 20) {
      bump('Cell Block', 1);
    }
  }

  return Array.from(suggestions.entries())
    .map(([preparationMethod, count]) => ({ preparationMethod, count }))
    .filter(s => s.count > 0);
}
