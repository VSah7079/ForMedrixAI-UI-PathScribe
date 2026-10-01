// src/services/cytology/resolveCytologyWorklistRouting.test.ts
import { describe, it, expect } from 'vitest';
import { resolveCytologyWorklistRouting } from './resolveCytologyWorklistRouting';

describe('resolveCytologyWorklistRouting', () => {
  it('GYN cytology always routes to the Cytology worklist, regardless of the non-GYN setting', () => {
    expect(resolveCytologyWorklistRouting(true, 'surgical_pathology_worklist')).toBe('cytology_worklist');
    expect(resolveCytologyWorklistRouting(true, 'cytology_worklist')).toBe('cytology_worklist');
  });

  it('non-GYN cytology follows the real, configured setting when it says Surgical Pathology', () => {
    expect(resolveCytologyWorklistRouting(false, 'surgical_pathology_worklist')).toBe('surgical_pathology_worklist');
  });

  it('non-GYN cytology follows the real, configured setting when it says Cytology', () => {
    expect(resolveCytologyWorklistRouting(false, 'cytology_worklist')).toBe('cytology_worklist');
  });
});
