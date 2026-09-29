// @vitest-environment happy-dom
// Batch 350: the Search page's helpers (request building, summary, CSV,
// date shortcuts, session state, suggestions, picker filtering).
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyCaseSearchDraft, type CaseSearchDraft } from '@/services/caseSearch/caseSearchTypes';
import {
  addTerm, applyIdentifierToDraft, buildCaseSearchRequest, countDraftFilters, draftToCriteria,
  normalizeCaseSearchDraft, toggleInList,
} from './buildCaseSearchRequest';
import { describeCaseSearch, pageRange } from './describeCaseSearch';
import { buildCaseSearchCsv, formatCalendarDate } from './caseSearchCsv';
import { matchDateShortcut, shortcutDateRange } from './searchDateShortcuts';
import {
  clearLastCaseSearch, consumeReturnToSearch, getCaseOpenedFrom, loadLastCaseSearch, markReturnToSearch,
  saveLastCaseSearch, setCaseOpenedFrom,
} from './searchSession';
import { suggestSpecimens } from './suggestSpecimens';
import { filterLookup, groupLookup } from './lookupFilter';
import type { SpecimenEntry } from '@/services/specimenDictionary/specimenTypes';

const draft = (over: Partial<CaseSearchDraft> = {}): CaseSearchDraft => ({ ...emptyCaseSearchDraft('2026-08-28', '2026-09-27'), ...over });
const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}${JSON.stringify(opts)}` : key);

describe('buildCaseSearchRequest', () => {
  it('sends only the filters that are set', () => {
    const criteria = draftToCriteria(draft({ statuses: ['finalized'], datesChosen: true }));
    expect(criteria).toEqual({ statuses: ['finalized'], dateFrom: '2026-08-28', dateTo: '2026-09-27' });
  });

  it('an identifier search with untouched dates covers every date (PS-101)', () => {
    const criteria = draftToCriteria(draft({ mrn: '100001' }));
    expect(criteria.dateFrom).toBeUndefined();
    expect(criteria.mrn).toBe('100001');
  });

  it('codes are sent as codes, ages as whole numbers, bad ages dropped', () => {
    const c = draftToCriteria(draft({
      snomedCodes: [{ code: '1', display: 'x', system: 'SNOMED', jurisdiction: 'ALL', active: true }],
      ageMin: '40', ageMax: 'abc',
    }));
    expect(c.snomedCodes).toEqual(['1']);
    expect(c.ageMin).toBe(40);
    expect(c.ageMax).toBeUndefined();
  });

  it('carries page, size, sort and time zone', () => {
    const r = buildCaseSearchRequest(draft(), { page: 3, pageSize: 50, sort: { key: 'patientName', direction: 'asc' }, timeZone: 'Europe/London' });
    expect(r).toMatchObject({ page: 3, pageSize: 50, sort: { key: 'patientName', direction: 'asc' }, timeZone: 'Europe/London' });
  });

  it('normalises an old or partial stored draft; one saved without datesChosen keeps its dates', () => {
    const d = normalizeCaseSearchDraft({ statuses: ['draft'], dateFrom: '2026-01-01', bogus: 1 }, 'a', 'b');
    expect(d.statuses).toEqual(['draft']);
    expect(d.dateFrom).toBe('2026-01-01');
    expect(d.dateTo).toBe('b');
    expect(d.datesChosen).toBe(true);
    expect(d.caseFlagIds).toEqual([]);
    expect(normalizeCaseSearchDraft(null, 'a', 'b').dateFrom).toBe('a');
  });

  it('a requisition number goes to the order-number filter', () => {
    const d = applyIdentifierToDraft(draft(), 'REQ-1', { action: 'setFilters', patientName: '', hospitalId: '', patientId: '', accessionNo: '', orderNo: 'REQ-1', anyIdentifier: '' });
    expect(d.orderNo).toBe('REQ-1');
    expect(d.identifierText).toBe('REQ-1');
  });

  it('counts set filters, the date range once', () => {
    expect(countDraftFilters(draft())).toBe(1);
    expect(countDraftFilters(draft({ statuses: ['draft', 'pool'], identifierText: 'x' }))).toBe(4);
    // A name search with untouched dates searches every date: the range doesn't count.
    expect(countDraftFilters(draft({ identifierText: 'Williams', patientName: 'Williams' }))).toBe(1);
  });

  it('Batch 351: date basis and role are sent only when they differ from the default; new filters pass through', () => {
    const c = draftToCriteria(draft({
      datesChosen: true, dateBasis: 'signedOut', pathologistIds: ['P1'], pathologistRole: 'resident',
      caseTypes: ['autopsy'], pastTatTarget: true, payer: ' Aetna ', cptCodes: ['88307'],
    }));
    expect(c).toMatchObject({ dateBasis: 'signedOut', pathologistRole: 'resident', caseTypes: ['autopsy'], pastTatTarget: true, payer: 'Aetna', cptCodes: ['88307'] });
    expect(draftToCriteria(draft({ datesChosen: true })).dateBasis).toBeUndefined();
    expect(draftToCriteria(draft({ pathologistRole: 'resident' })).pathologistRole).toBeUndefined(); // no pathologist chosen
  });

  it('Batch 351: a stored draft with an unknown date basis or role falls back to the default', () => {
    const d = normalizeCaseSearchDraft({ dateBasis: 'bogus', pathologistRole: 'nope', pastTatTarget: true }, 'a', 'b');
    expect(d.dateBasis).toBe('accessioned');
    expect(d.pathologistRole).toBe('any');
    expect(d.pastTatTarget).toBe(true);
  });

  it('list helpers', () => {
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
    expect(addTerm(['a'], '  a ')).toEqual(['a']);
    expect(addTerm(['a'], ' b ')).toEqual(['a', 'b']);
  });
});

describe('describeCaseSearch', () => {
  const names = { pathologist: () => 'Ann Lee', physician: () => undefined, facility: () => 'Metro', flag: () => 'Malignant', template: () => 'Breast', subspecialty: () => 'GI', performingLab: () => 'Central Lab', location: () => 'Ward 4' };

  it('shows names, not ids, and translated statuses', () => {
    const parts = describeCaseSearch(draft({ datesChosen: true, statuses: ['finalized'], pathologistIds: ['P1'], caseFlagIds: ['f1'] }), names, t, d => d);
    expect(parts[0]).toContain('accessionRange');
    expect(parts.some(p => p.includes('statusLabelKey.finalized'))).toBe(true);
    expect(parts.some(p => p.includes('Ann Lee'))).toBe(true);
    expect(parts.some(p => p.includes('Malignant'))).toBe(true);
  });

  it('says "all accession dates" for an identifier search without chosen dates', () => {
    expect(describeCaseSearch(draft({ mrn: '1' }), names, t, d => d)[0]).toBe('searchPage.summaryParts.allDates');
  });

  it('Batch 351: the date wording follows the basis; role, new filters and names appear', () => {
    const parts = describeCaseSearch(draft({
      datesChosen: true, dateBasis: 'signedOut', pathologistIds: ['P1'], pathologistRole: 'resident',
      caseTypes: ['autopsy'], pastTatTarget: true, subspecialtyIds: ['gi'], autopsyJurisdictions: ['GB_EW'],
    }), names, t, d => d);
    expect(parts[0]).toContain('signedOutRange');
    expect(parts.some(p => p.includes('pathologistInRole') && p.includes('pathologistRole.resident'))).toBe(true);
    expect(parts.some(p => p.includes('caseType.autopsy'))).toBe(true);
    expect(parts).toContain('searchPage.summaryParts.pastTat');
    expect(parts.some(p => p.includes('GI'))).toBe(true);
    expect(parts.some(p => p.includes('jurisdictionNames.GB_EW'))).toBe(true);
  });

  it('page range', () => {
    expect(pageRange(2, 25, 60)).toEqual({ from: 26, to: 50 });
    expect(pageRange(3, 25, 60)).toEqual({ from: 51, to: 60 });
    expect(pageRange(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe('caseSearchCsv', () => {
  it('translated headings, translated values, quoted fields', () => {
    const csv = buildCaseSearchCsv([{
      accession: 'S26-1', patientName: 'Lee, "Ann"', mrn: '1', sex: 'F', dateOfBirth: '1970-06-15',
      specimens: ['A', 'B'], accessionDate: '2026-09-21T02:00:00Z', signedOutDate: '', orderingPhysician: 'Dr. X',
      priority: 'STAT', status: 'finalized', flags: ['Malignant'],
    }], { t, locale: 'en-GB', timeZone: 'America/Phoenix' });
    const [header, row] = csv.split('\r\n');
    expect(header.startsWith('"searchPage.csv.accession"')).toBe(true);
    expect(row).toContain('"Lee, ""Ann"""');
    expect(row).toContain('"15/06/1970"');
    expect(row).toContain('"20/09/2026"'); // the facility's date, not UTC's
    expect(row).toContain('"searchPage.statusLabelKey.finalized"');
    expect(row).toContain('"A; B"');
  });

  it('a date of birth never shifts by a day, whatever the zone', () => {
    expect(formatCalendarDate('1970-06-15', 'en-US', 'Pacific/Honolulu')).toBe('06/15/1970');
  });
});

describe('searchDateShortcuts', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  it('ranges end today in the facility time zone', () => {
    expect(shortcutDateRange('7d', 'America/Phoenix', now)).toEqual({ dateFrom: '2026-09-20', dateTo: '2026-09-27' });
    expect(shortcutDateRange('all', 'America/Phoenix', now)).toEqual({ dateFrom: '', dateTo: '' });
  });
  it('recognises a range as its shortcut', () => {
    expect(matchDateShortcut('2026-08-28', '2026-09-27', 'America/Phoenix', now)).toBe('30d');
    expect(matchDateShortcut('', '', 'UTC', now)).toBe('all');
    expect(matchDateShortcut('2026-01-01', '2026-09-27', 'UTC', now)).toBeNull();
  });
});

describe('searchSession', () => {
  beforeEach(() => { clearLastCaseSearch(); consumeReturnToSearch(); });

  it('remembers the search but not results', () => {
    saveLastCaseSearch({ draft: draft({ mrn: '1' }), page: 2, pageSize: 50, sort: { key: 'lastUpdated', direction: 'desc' } });
    const last = loadLastCaseSearch();
    expect(last?.page).toBe(2);
    expect((last?.draft as CaseSearchDraft).mrn).toBe('1');
    expect(JSON.stringify(last)).not.toContain('results');
  });

  it('the return mark is read once', () => {
    markReturnToSearch();
    expect(consumeReturnToSearch()).toBe(true);
    expect(consumeReturnToSearch()).toBe(false);
  });

  it('remembers where a case was opened from', () => {
    setCaseOpenedFrom('search');
    expect(getCaseOpenedFrom()).toBe('search');
    setCaseOpenedFrom('worklist');
    expect(getCaseOpenedFrom()).toBe('worklist');
  });
});

describe('suggestions and pickers', () => {
  const dict = [
    { id: '1', name: 'Left Breast Mastectomy', active: true, synonyms: ['LBM'] },
    { id: '2', name: 'Right Breast Lumpectomy', active: true },
    { id: '3', name: 'Breast Old', active: false },
  ] as unknown as SpecimenEntry[];

  it('suggests active dictionary specimens only, excluding ones already added', () => {
    expect(suggestSpecimens(dict, 'breast', ['Right Breast Lumpectomy'])).toEqual(['Left Breast Mastectomy']);
    expect(suggestSpecimens(dict, 'lbm', [])).toEqual(['Left Breast Mastectomy']);
    expect(suggestSpecimens(dict, 'b', [])).toEqual([]);
  });

  it('filters and groups picker options', () => {
    const items = [{ name: 'B', cat: 'X' }, { name: 'A', cat: 'X' }, { name: 'C', cat: 'W' }];
    expect(filterLookup(items, 'a', i => [i.name]).map(i => i.name)).toEqual(['A']);
    expect(groupLookup(items, i => i.cat).map(([k, xs]) => [k, xs.map(x => x.name)])).toEqual([['W', ['C']], ['X', ['A', 'B']]]);
  });
});
