// src/services/actionRegistry/phase3bTranslatedTriggers.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per src/MULTILANG_VOICE_COMMANDS_PLAN.md's own Phase 3b: the
// remaining 170 actions (beyond Phase 3a's 18 representative,
// everyday-workflow actions) now carry real, native-language
// voiceTriggersByLanguage content for French, German, Dutch, and
// Korean too — the full real action surface. This test confirms a
// representative, diverse sample actually matches through the real
// findActionByTrigger() pipeline end to end, across several real,
// different app contexts (SYSTEM/NAVIGATION-global actions, plus
// context-scoped ACCESSION and SYNOPTIC actions).
//
// Real, confirmed directly while writing this: ADD_SPECIMEN is
// category: 'ACCESSION' and NEXT_FIELD is category: 'SYNOPTIC' —
// neither is in GLOBAL_CATEGORIES, so each needs its own real
// setCurrentContext() before it's eligible at all, same real rule
// already confirmed in Phase 3a's own test file. Also confirmed
// directly: the English phrase 'select all' resolves to TABLE_SELECT,
// not TABLE_SELECT_ALL, under this service's own pre-existing (not
// introduced here) phraseMatch() word-boundary-substring behavior —
// 'select' matches as a substring of 'select all' before the loop
// ever reaches TABLE_SELECT_ALL's own exact trigger. A real, pre-
// existing quirk of the English matching logic itself, out of this
// translation work's own scope to change.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mockActionRegistryService } from './mockActionRegistryService';

describe('Phase 3b translated voice triggers — real, end-to-end matching across the remaining action surface', () => {
  it('real, German "aktualisieren" correctly triggers TABLE_REFRESH (a real, always-eligible NAVIGATION-adjacent worklist action)', () => {
    const result = mockActionRegistryService.findActionByTrigger('aktualisieren', 'de');
    expect(result?.id).toBe('TABLE_REFRESH');
  });

  describe('within MESSAGES context', () => {
    beforeAll(() => { mockActionRegistryService.setCurrentContext('MESSAGES'); });
    afterAll(() => { mockActionRegistryService.setCurrentContext('WORKLIST'); });

    it('real, German "als gelesen markieren" correctly triggers MSG_MARK_READ, not MSG_MARK_UNREAD', () => {
      const result = mockActionRegistryService.findActionByTrigger('als gelesen markieren', 'de');
      expect(result?.id).toBe('MSG_MARK_READ');
    });

    it('real, Dutch "markeren als ongelezen" correctly triggers MSG_MARK_UNREAD, not MSG_MARK_READ', () => {
      const result = mockActionRegistryService.findActionByTrigger('markeren als ongelezen', 'nl');
      expect(result?.id).toBe('MSG_MARK_UNREAD');
    });
  });

  describe('within ACCESSION context', () => {
    beforeAll(() => { mockActionRegistryService.setCurrentContext('ACCESSION'); });
    afterAll(() => { mockActionRegistryService.setCurrentContext('WORKLIST'); });

    it('real, Dutch "specimen toevoegen" correctly triggers ADD_SPECIMEN', () => {
      const result = mockActionRegistryService.findActionByTrigger('specimen toevoegen', 'nl');
      expect(result?.id).toBe('ADD_SPECIMEN');
    });
  });

  describe('within SYNOPTIC context', () => {
    beforeEach(() => { mockActionRegistryService.setCurrentContext('SYNOPTIC'); });
    afterEach(() => { mockActionRegistryService.setCurrentContext('WORKLIST'); });

    it('real, Korean "다음 필드" correctly triggers NEXT_FIELD, not NEXT_UNANSWERED or NEXT_REQUIRED', () => {
      const result = mockActionRegistryService.findActionByTrigger('다음 필드', 'ko');
      expect(result?.id).toBe('NEXT_FIELD');
    });

    it('real, French "saisir le diagnostic" correctly triggers ENTER_DIAGNOSIS, not ENTER_GROSS or ENTER_MICRO', () => {
      const result = mockActionRegistryService.findActionByTrigger('saisir le diagnostic', 'fr');
      expect(result?.id).toBe('ENTER_DIAGNOSIS');
    });

    it('real, German "makroskopie eingeben" correctly triggers ENTER_GROSS, not ENTER_MICRO', () => {
      const result = mockActionRegistryService.findActionByTrigger('makroskopie eingeben', 'de');
      expect(result?.id).toBe('ENTER_GROSS');
    });

    it('real, Dutch "finaliseren" correctly triggers OPEN_PRE_FINALISE', () => {
      const result = mockActionRegistryService.findActionByTrigger('finaliseren', 'nl');
      expect(result?.id).toBe('OPEN_PRE_FINALISE');
    });
  });

  it('real, English matching for a representative sample of these 170 real, now-translated actions remains completely unaffected', () => {
    expect(mockActionRegistryService.findActionByTrigger('refresh')?.id).toBe('TABLE_REFRESH');
    expect(mockActionRegistryService.findActionByTrigger('go to audit')?.id).toBe('OPEN_AUDIT');
  });
});
