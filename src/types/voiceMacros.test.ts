import { describe, it, expect } from 'vitest';
import { isVoiceMacroVisibleTo, applyVoiceMacroSubstitutions, type VoiceMacro } from './voiceMacros';

const base: Omit<VoiceMacro, 'performingLabFacilityId' | 'ownerUserId'> = {
  id: 'vm1', spoken: 'normal colon', written: 'Sections show colonic mucosa...', isActive: true,
};

describe('isVoiceMacroVisibleTo — real three-tier resolution, identical rule to isMacroVisibleTo', () => {
  it('Enterprise tier is visible to every real user', () => {
    const macro: VoiceMacro = { ...base };
    expect(isVoiceMacroVisibleTo(macro, 'PATH-002', 'FAC-A')).toBe(true);
    expect(isVoiceMacroVisibleTo(macro, 'PATH-002', undefined)).toBe(true);
  });

  it('Facility tier is visible only at the matching real facility', () => {
    const macro: VoiceMacro = { ...base, performingLabFacilityId: 'FAC-A' };
    expect(isVoiceMacroVisibleTo(macro, 'PATH-002', 'FAC-A')).toBe(true);
    expect(isVoiceMacroVisibleTo(macro, 'PATH-002', 'FAC-B')).toBe(false);
  });

  it('Personal tier (a real Personal Quick Text entry) is visible only to its real owner', () => {
    const macro: VoiceMacro = { ...base, ownerUserId: 'PATH-001', sourceCaseId: 'O26-0001' };
    expect(isVoiceMacroVisibleTo(macro, 'PATH-001', 'FAC-A')).toBe(true);
    expect(isVoiceMacroVisibleTo(macro, 'PATH-002', 'FAC-A')).toBe(false);
  });
});

describe('applyVoiceMacroSubstitutions — real, per direct guidance (voice-trigger recognition wiring)', () => {
  it('replaces a real spoken trigger with its written text, word-boundary safe', () => {
    const macros: VoiceMacro[] = [{ id: 'v1', spoken: 'normal colon', written: 'Sections show colonic mucosa with normal crypt architecture.', isActive: true }];
    const result = applyVoiceMacroSubstitutions('The impression is normal colon mucosa.', macros);
    expect(result).toBe('The impression is Sections show colonic mucosa with normal crypt architecture. mucosa.');
  });

  it('never matches a partial word — word boundaries are real, not incidental', () => {
    const macros: VoiceMacro[] = [{ id: 'v1', spoken: 'normal', written: 'REPLACED', isActive: true }];
    const result = applyVoiceMacroSubstitutions('abnormal findings', macros);
    expect(result).toBe('abnormal findings');
  });

  it('longest real match wins first, so a shorter trigger never partially eats a longer one', () => {
    const macros: VoiceMacro[] = [
      { id: 'v1', spoken: 'normal colon', written: 'LONG_MATCH', isActive: true },
      { id: 'v2', spoken: 'normal', written: 'SHORT_MATCH', isActive: true },
    ];
    const result = applyVoiceMacroSubstitutions('normal colon mucosa', macros);
    expect(result).toBe('LONG_MATCH mucosa');
  });

  it('an inactive macro never fires, even with an otherwise-matching real trigger', () => {
    const macros: VoiceMacro[] = [{ id: 'v1', spoken: 'normal colon', written: 'REPLACED', isActive: false }];
    const result = applyVoiceMacroSubstitutions('normal colon mucosa', macros);
    expect(result).toBe('normal colon mucosa');
  });

  it('is the same real algorithm mockVoiceMacroService.refineTranscript() now delegates to — never a second, independent implementation', async () => {
    const { MockVoiceMacroService } = await import('../services/voicemacro/mockVoiceMacroService');
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    };
    const svc = new MockVoiceMacroService();
    await svc.addMacro({ spoken: 'normal colon', written: 'Sections show colonic mucosa.', isActive: true });
    const result = await svc.refineTranscript('The finding is normal colon today.');
    expect(result.data).toBe('The finding is Sections show colonic mucosa. today.');
  });
});
