// src/services/molecular/IMolecularBatchService.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up expanding real plate format support
// beyond the given specification's own three named formats (24/96/384-
// well) to the fuller set of real, standard ANSI/SLAS microplate
// formats supplied directly.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { MOLECULAR_PLATE_LAYOUTS } from './IMolecularBatchService';

describe('MOLECULAR_PLATE_LAYOUTS — real, per direct guidance on ANSI/SLAS standard microplate formats', () => {
  it('every real, supported format has the real, correct rows × columns dimensions', () => {
    expect(MOLECULAR_PLATE_LAYOUTS['6_well']).toEqual({ rows: 2, columns: 3 });
    expect(MOLECULAR_PLATE_LAYOUTS['12_well']).toEqual({ rows: 3, columns: 4 });
    expect(MOLECULAR_PLATE_LAYOUTS['24_well']).toEqual({ rows: 4, columns: 6 });
    expect(MOLECULAR_PLATE_LAYOUTS['48_well']).toEqual({ rows: 6, columns: 8 });
    expect(MOLECULAR_PLATE_LAYOUTS['96_well']).toEqual({ rows: 8, columns: 12 });
    expect(MOLECULAR_PLATE_LAYOUTS['384_well']).toEqual({ rows: 16, columns: 24 });
    expect(MOLECULAR_PLATE_LAYOUTS['1536_well']).toEqual({ rows: 32, columns: 48 });
  });

  it('every real, named format\'s own rows × columns product equals its own real, stated well count', () => {
    for (const [name, dims] of Object.entries(MOLECULAR_PLATE_LAYOUTS)) {
      if (name.endsWith('_strip')) continue; // real, deliberately not a "well count" name
      const statedCount = Number(name.split('_')[0]);
      expect(dims.rows * dims.columns).toBe(statedCount);
    }
  });

  it('real, low-density strip formats are modeled as a genuine, single real row, not approximated into an existing grid shape', () => {
    expect(MOLECULAR_PLATE_LAYOUTS['8_strip']).toEqual({ rows: 1, columns: 8 });
    expect(MOLECULAR_PLATE_LAYOUTS['12_strip']).toEqual({ rows: 1, columns: 12 });
  });
});
