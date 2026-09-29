// src/services/spellcheck/editorIntegration.test.ts
// PS-342 (Batch 338): the pure pieces behind the report-screen spell check —
// resolving a case's language and facility dictionary, mapping editor
// positions to checker text and back, and what the right-click menu offers —
// plus source-level guards that the report screens stay wired to it.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { customWordsFor, resolveCaseSpellingContext, type CaseSpellingDeps } from './resolveCaseSpellingContext';
import { buildEditorTextBlock, issueAt, issueAtOffset, issuesToRanges, offsetToPos, splitTextByIssues } from './editorTextBlocks';
import { buildSpellMenuModel, MENU_SUGGESTION_LIMIT } from './spellMenuModel';
import type { SpellIssue } from './spellCascade';
import type { CustomWordEntry } from './customDictionaryRules';

// ── resolveCaseSpellingContext ─────────────────────────────────────────────

const FACILITIES: Record<string, { id: string; name: string; jurisdiction?: any; lab?: string }> = {
  'fac-uk': { id: 'fac-uk', name: 'Fenwick Clinic', jurisdiction: 'GB_EW', lab: 'lab-uk' },
  'lab-uk': { id: 'lab-uk', name: 'Fenwick Pathology', jurisdiction: 'GB_EW', lab: 'lab-uk' },
  'fac-us': { id: 'fac-us', name: 'Metro General', jurisdiction: 'US', lab: 'fac-us' },
  'fac-nl': { id: 'fac-nl', name: 'Utrecht', jurisdiction: 'NL' },
};

const deps = (prefs: Record<string, string | null> = {}, overrides: Partial<CaseSpellingDeps> = {}): CaseSpellingDeps => ({
  getFacility: async id => FACILITIES[id] ?? null,
  getPerformingLabId: async id => FACILITIES[id]?.lab,
  getStaffSpellingPreference: async id => prefs[id],
  ...overrides,
});

describe('resolveCaseSpellingContext (PS-342)', () => {
  it('uses the ordering facility default when nothing else is set, and the performing lab dictionary', async () => {
    const ctx = await resolveCaseSpellingContext({ orderingFacilityId: 'fac-uk' }, deps());
    expect(ctx).toMatchObject({ locale: 'en-GB', source: 'facility', facilityDictionaryId: 'lab-uk', facilityDictionaryLabel: 'Fenwick Pathology' });
  });

  it("inherits the assigned pathologist's preference over the facility default (Pete, Sep 26)", async () => {
    const ctx = await resolveCaseSpellingContext({ orderingFacilityId: 'fac-uk', assignedPathologistId: 'p1' }, deps({ p1: 'en-US' }));
    expect(ctx).toMatchObject({ locale: 'en-US', source: 'pathologist' });
  });

  it("the case's own choice beats the pathologist's preference", async () => {
    const ctx = await resolveCaseSpellingContext({ orderingFacilityId: 'fac-us', assignedPathologistId: 'p1', caseOverride: 'en-AU' }, deps({ p1: 'en-GB' }));
    expect(ctx).toMatchObject({ locale: 'en-AU', source: 'case' });
  });

  it('a cleared preference (null) falls through to the facility', async () => {
    const ctx = await resolveCaseSpellingContext({ orderingFacilityId: 'fac-nl', assignedPathologistId: 'p1' }, deps({ p1: null }));
    expect(ctx).toMatchObject({ locale: 'nl-NL', source: 'facility' });
    expect(ctx.facilityDictionaryId).toBeUndefined();
  });

  it('reuses the ordering facility when it is its own lab', async () => {
    const ctx = await resolveCaseSpellingContext({ orderingFacilityId: 'fac-us' }, deps());
    expect(ctx).toMatchObject({ locale: 'en-US', facilityDictionaryId: 'fac-us', facilityDictionaryLabel: 'Metro General' });
  });

  it('never rejects: failed lookups fall back to the platform default', async () => {
    const boom = async () => { throw new Error('offline'); };
    const ctx = await resolveCaseSpellingContext(
      { orderingFacilityId: 'fac-uk', assignedPathologistId: 'p1' },
      deps({}, { getFacility: boom, getPerformingLabId: boom, getStaffSpellingPreference: boom }),
    );
    expect(ctx).toEqual({ locale: 'en-US', source: 'platform' });
  });

  it('no case facility at all → platform default, no facility dictionary', async () => {
    expect(await resolveCaseSpellingContext({}, deps())).toEqual({ locale: 'en-US', source: 'platform' });
  });
});

describe('customWordsFor', () => {
  const entry = (word: string): CustomWordEntry => ({ word, addedAt: '2026-09-26T00:00:00Z', addedBy: { userId: 'u1', userName: 'Dr One' } } as CustomWordEntry);
  it('sends session-ignored words with the personal list and keeps the facility list separate', () => {
    expect(customWordsFor([entry('Fenwick')], [entry('HPF')], ['xyzzy'])).toEqual({ personal: ['Fenwick', 'xyzzy'], facility: ['HPF'] });
  });
});

// ── editorTextBlocks ───────────────────────────────────────────────────────

const issue = (from: number, to: number, word: string, reason: SpellIssue['reason'] = 'misspelled'): SpellIssue => ({ from, to, word, reason });

describe('editorTextBlocks (PS-342)', () => {
  // "Tumour <br> margn" — a paragraph at doc position 1 with a line break node between two text runs.
  const block = buildEditorTextBlock('b0', [
    { text: 'Tumour', pos: 2 },
    { text: ' ', pos: 8 },
    { text: 'margn', pos: 9 },
  ]);

  it('joins runs into checker text', () => {
    expect(block.text).toBe('Tumour margn');
  });

  it('maps checker offsets back to document positions', () => {
    expect(offsetToPos(block, 0)).toBe(2);
    expect(offsetToPos(block, 7)).toBe(9);
    expect(offsetToPos(block, 12)).toBe(14);
  });

  it('turns issues into document ranges and finds the issue under a position', () => {
    const ranges = issuesToRanges(block, [issue(7, 12, 'margn')]);
    expect(ranges).toEqual([{ from: 9, to: 14, issue: issue(7, 12, 'margn') }]);
    expect(issueAt(ranges, 11)?.issue.word).toBe('margn');
    expect(issueAt(ranges, 3)).toBeUndefined();
  });

  it('drops an issue that would span a gap between runs rather than draw it in the wrong place', () => {
    const gappy = buildEditorTextBlock('b1', [{ text: 'ab', pos: 1 }, { text: 'cd', pos: 10 }]);
    expect(issuesToRanges(gappy, [issue(1, 3, 'bc')])).toEqual([]);
  });

  it('splits plain text into squiggle segments, first issue wins on overlap', () => {
    const segs = splitTextByIssues('the colour of haemorrhage', [issue(4, 10, 'colour', 'regionalVariant'), issue(14, 25, 'haemorrhage'), issue(5, 8, 'olo')]);
    expect(segs).toEqual([
      { text: 'the ' },
      { text: 'colour', issue: 0 },
      { text: ' of ' },
      { text: 'haemorrhage', issue: 1 },
    ]);
    expect(segs.map(s => s.text).join('')).toBe('the colour of haemorrhage');
  });

  it('finds the issue at a caret offset (keyboard-opened menu)', () => {
    const issues = [issue(4, 10, 'colour')];
    expect(issueAtOffset(issues, 6)).toBe(0);
    expect(issueAtOffset(issues, 2)).toBe(-1);
  });
});

// ── spellMenuModel ─────────────────────────────────────────────────────────

describe('buildSpellMenuModel (PS-342 AC5)', () => {
  it('leads with the convention form for a regional variant and de-duplicates', () => {
    const m = buildSpellMenuModel({ word: 'color', reason: 'regionalVariant', preferred: 'colour' }, ['colour', 'colon', 'color'], { role: 'pathologist' });
    expect(m.suggestions).toEqual(['colour', 'colon']);
    expect(m.preferred).toBe('colour');
  });

  it(`caps suggestions at ${MENU_SUGGESTION_LIMIT}`, () => {
    const m = buildSpellMenuModel({ word: 'x', reason: 'misspelled' }, ['a', 'b', 'c', 'd', 'e', 'f', 'g'], {});
    expect(m.suggestions).toHaveLength(MENU_SUGGESTION_LIMIT);
  });

  it('offers the facility dictionary only to admin roles, and only when the lab is known', () => {
    const base = { word: 'HPF', reason: 'misspelled' as const };
    expect(buildSpellMenuModel(base, [], { role: 'pathologist', facilityDictionaryId: 'lab-uk' }).canAddFacility).toBe(false);
    expect(buildSpellMenuModel(base, [], { role: 'admin' }).canAddFacility).toBe(false);
    const ok = buildSpellMenuModel(base, [], { role: 'admin', facilityDictionaryId: 'lab-uk', facilityDictionaryLabel: 'Fenwick Pathology' });
    expect(ok).toMatchObject({ canAddFacility: true, facilityLabel: 'Fenwick Pathology', canIgnore: true, canAddPersonal: true });
  });
});

// ── Source-level guards ────────────────────────────────────────────────────

const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('report free text stays on the spell checker (PS-342, Batch 338)', () => {
  const REPORT_TEXT_FILES = [
    'pages/SynopticReportPage/components/RightSynopticPanel.tsx',
    'pages/SynopticReportPage/modals/AmendmentModal.tsx',
    'pages/SynopticReportPage/modals/CaseSignOutModal.tsx',
    'pages/SynopticReportPage/modals/CaseHoldModal.tsx',
    'pages/SynopticReportPage/modals/RetentionHoldModal.tsx',
    'pages/SynopticReportPage/modals/DiscordanceReconciliationModal.tsx',
    'pages/SynopticReportPage/modals/AiNarrativeReviewModal.tsx',
    'pages/IntraopQueuePage.tsx',
    'pages/CytologyWorklistPage/CytologyScreeningPage.tsx',
    'pages/CytologyWorklistPage/components/CytologySynopticFormView.tsx',
    'pages/CytologyWorklistPage/components/CytologyRoseView.tsx',
  ];

  it.each(REPORT_TEXT_FILES)('%s uses SpellCheckedTextarea, not a bare <textarea>', file => {
    const code = src(file);
    expect(code).not.toMatch(/<textarea\b/);
    expect(code).toMatch(/<SpellCheckedTextarea\b/);
  });

  it.each([
    'pages/SynopticReportPage/SynopticReportPage.tsx',
    'pages/CytologyWorklistPage/CytologyScreeningPage.tsx',
    'pages/IntraopQueuePage.tsx',
  ])('%s provides the case spell-check context', file => {
    const code = src(file);
    expect(code).toMatch(/useCaseSpellCheck\(/);
    expect(code).toMatch(/<SpellCheckProvider value=/);
  });

  it('the retired AI spelling check is gone (Pete, Sep 26: "Retire it")', () => {
    expect(src('services/aiIntegration/PathScribeAIService.ts')).not.toMatch(/checkSpelling\s*\(/);
    const ose = src('pages/SynopticReportPage/components/OrchestratorSectionEditor.tsx');
    expect(ose).not.toMatch(/checkSpelling|SpellCheckPopover|spellCheckReview/);
    expect(ose).toMatch(/<SpellingLanguageControl\b/);
  });

  it('PathScribeEditor installs the spell-check extension and turns the browser check off inside a provider', () => {
    const code = src('components/Editor/PathScribeEditor.tsx');
    expect(code).toMatch(/createSpellCheckExtension\(/);
    expect(code).toMatch(/spellcheck: spellRef\.current \? 'false' : 'true'/);
    expect(code).not.toMatch(/<style>/);
  });
});
