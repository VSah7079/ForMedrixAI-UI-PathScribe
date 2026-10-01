// Batch 368 (PS-353): what the report change log records for a save.
import { describe, expect, it } from 'vitest';
import { changeLogRows, diffCaseChanges, isLongText, wordDiff } from './reportChangeRules';

const diff = (before: object, after: object, keys = Object.keys(after)) =>
  diffCaseChanges(before as Record<string, unknown>, after as Record<string, unknown>, keys);

describe('diffCaseChanges', () => {
  it('records a synoptic answer changed, old → new, under the report instance name', () => {
    const before = { synopticReports: [{ instanceId: 'i1', templateName: 'Lung Resection', answers: { tumor_size: '2.1', margins: 'Negative' } }] };
    const after = { synopticReports: [{ instanceId: 'i1', templateName: 'Lung Resection', answers: { tumor_size: '2.4', margins: 'Negative' } }] };
    expect(diff(before, after)).toEqual([
      { area: 'synoptic', path: ['synopticReports', 'Lung Resection', 'answers', 'tumor_size'], kind: 'changed', before: '2.1', after: '2.4' },
    ]);
  });

  it('matches records by id, so a reordered list is not a change', () => {
    const a = { id: 'A', label: 'Right upper lobe' }, b = { id: 'B', label: 'Station 4R' };
    expect(diff({ specimens: [a, b] }, { specimens: [b, a] })).toEqual([]);
  });

  it('records specimens and blocks added and removed by their labels', () => {
    const before = { specimens: [{ id: 'A', label: 'Right upper lobe', blocks: [{ id: 'A1', label: 'A1' }] }] };
    const after = { specimens: [{ id: 'A', label: 'Right upper lobe', blocks: [{ id: 'A1', label: 'A1' }, { id: 'A2', label: 'A2' }] }, { id: 'B', label: 'Station 4R' }] };
    expect(diff(before, after)).toEqual([
      { area: 'specimens', path: ['specimens', 'Right upper lobe', 'blocks', 'A2'], kind: 'added', before: null, after: 'A2' },
      { area: 'specimens', path: ['specimens', 'Station 4R'], kind: 'added', before: null, after: 'Station 4R' },
    ]);
  });

  it('files codes under Codes wherever they sit, as a list', () => {
    const before = { specimens: [{ id: 'A', label: 'Lung', snomed: ['T-28000'] }] };
    const after = { specimens: [{ id: 'A', label: 'Lung', snomed: ['T-28000', 'M-81403'] }] };
    expect(diff(before, after)).toEqual([
      { area: 'codes', path: ['specimens', 'Lung', 'snomed'], kind: 'changed', before: 'T-28000', after: 'T-28000, M-81403' },
    ]);
  });

  it('records narrative text in full, and case-level changes such as status', () => {
    const before = { diagnostic: { finalDiagnosis: 'Adenocarcinoma.' }, status: 'in-progress' };
    const after = { diagnostic: { finalDiagnosis: 'Invasive adenocarcinoma, acinar predominant.' }, status: 'pending-review' };
    expect(diff(before, after).map(c => [c.area, c.path.join('.'), c.before, c.after])).toEqual([
      ['narrative', 'diagnostic.finalDiagnosis', 'Adenocarcinoma.', 'Invasive adenocarcinoma, acinar predominant.'],
      ['case', 'status', 'in-progress', 'pending-review'],
    ]);
  });

  it('ignores bookkeeping the store writes on every save, and fields the save did not write', () => {
    expect(diff({ version: 3, updatedAt: 'x', lastUpdatedFromStation: null, status: 'a' }, { version: 4, updatedAt: 'y', lastUpdatedFromStation: 'ST-1', status: 'a' })).toEqual([]);
    expect(diff({ status: 'a', priority: 'Routine' }, { status: 'a', priority: 'STAT' }, ['status'])).toEqual([]);
  });

  it('ignores a record\'s own timestamps', () => {
    const before = { synopticReports: [{ instanceId: 'i1', templateName: 'Lung', updatedAt: '1', answers: { a: 'x' } }] };
    const after = { synopticReports: [{ instanceId: 'i1', templateName: 'Lung', updatedAt: '2', answers: { a: 'x' } }] };
    expect(diff(before, after)).toEqual([]);
  });

  it('treats empty and missing as the same, so saving an untouched blank field logs nothing', () => {
    expect(diff({ diagnostic: { comment: '' } }, { diagnostic: {} })).toEqual([]);
  });
});

describe('wordDiff', () => {
  it('marks the words removed and added, keeping the rest', () => {
    expect(wordDiff('Tumour size 2.1 cm, margins negative.', 'Tumour size 2.4 cm, margins negative.')).toEqual([
      { op: 'same', text: 'Tumour size ' }, { op: 'removed', text: '2.1' }, { op: 'added', text: '2.4' }, { op: 'same', text: ' cm, margins negative.' },
    ]);
  });
  it('rebuilds both texts exactly', () => {
    const a = 'The specimen consists of a lobe of lung, 12 x 8 x 4 cm.';
    const b = 'The specimen consists of a right upper lobe of lung, 12 x 9 x 4 cm, received fresh.';
    const parts = wordDiff(a, b);
    expect(parts.filter(p => p.op !== 'added').map(p => p.text).join('')).toBe(a);
    expect(parts.filter(p => p.op !== 'removed').map(p => p.text).join('')).toBe(b);
  });
  it('decides when a value is long text', () => {
    expect(isLongText('2.1', '2.4')).toBe(false);
    expect(isLongText('Option 3', 'Option 3, Option 1')).toBe(false);
    expect(isLongText('Adenocarcinoma.', 'Invasive adenocarcinoma of the right upper lobe, acinar predominant.')).toBe(true);
  });
});

describe('export', () => {
  it('one row per changed field, and a value that starts like a formula is neutralised', () => {
    const rows = changeLogRows([{ id: 'e', caseId: 'c', at: '2026-09-28T10:14:00Z', userId: 'u', userName: 'Dr A', stationId: 'ST-1', changes: [
      { area: 'synoptic', path: ['synopticReports', 'Lung', 'answers', 'x'], kind: 'changed', before: '=1+1', after: '2' },
    ] }], { area: a => a.toUpperCase(), kind: k => k });
    expect(rows).toEqual([{ savedAt: '2026-09-28T10:14:00Z', user: 'Dr A', workstation: 'ST-1', area: 'SYNOPTIC', field: 'synopticReports › Lung › answers › x', change: 'changed', before: "'=1+1", after: '2' }]);
  });
});

describe('exportChangeLog', async () => {
  const { exportChangeLog } = await import('./exportChangeLog');
  const labels = {
    columns: { savedAt: 'Saved', user: 'User', workstation: 'Workstation', area: 'Area', field: 'Field', change: 'Change', before: 'Before', after: 'After' },
    area: (a: string) => a, kind: (k: string) => k,
  };
  const entries = [{ id: 'e', caseId: 'C1', at: 't', userId: 'u', userName: 'Dr A', stationId: null, changes: [
    { area: 'case' as const, path: ['status'], kind: 'changed' as const, before: 'a', after: 'b' },
  ] }];

  const decide = (allowed: boolean) => ({
    enforce: async (capability: string, context: { caseId?: string | null } = {}) => {
      checks.push({ capability, context });
      return { capability, allowed, grantedBy: allowed ? [{ id: 'admin', name: 'Admin' }] : [], missingRequirements: [], context, ...(allowed ? {} : { reason: 'notGranted' as const }) };
    },
  });
  let checks: { capability: string; context: unknown }[] = [];

  it('checks report:change-history:export for the case, builds the CSV with translated headings and audits the export', async () => {
    checks = [];
    const logged: unknown[] = [];
    const res = await exportChangeLog('C1', entries, { name: 'Admin' }, labels as any, { authorization: decide(true), auditService: { logEvent: async e => { logged.push(e); return { ok: true, data: e as any }; } } });
    expect(checks).toEqual([{ capability: 'report:change-history:export', context: { caseId: 'C1', facilityId: null } }]);
    expect(res).toMatchObject({ ok: true, rowCount: 1 });
    expect(res.ok && res.csv.split('\r\n')[0]).toBe('Saved,User,Workstation,Area,Field,Change,Before,After');
    expect(logged).toEqual([expect.objectContaining({ event: 'Report change history exported', caseId: 'C1', user: 'Admin' })]);
  });

  it('refuses when the capability is not held, and builds nothing', async () => {
    checks = [];
    const logged: unknown[] = [];
    const res = await exportChangeLog('C1', entries, { name: 'Dr B' }, labels as any, { authorization: decide(false), auditService: { logEvent: async e => { logged.push(e); return { ok: true, data: e as any }; } } });
    expect(res).toEqual({ ok: false, reason: 'notPermitted' });
    expect(logged).toEqual([]);
  });
});

describe('labelSynopticChanges', async () => {
  const { labelSynopticChanges } = await import('./reportChangeRules');
  it('replaces field and option ids with the template labels', () => {
    const template = { sections: [{ fields: [{ id: 'procedure', label: 'Procedure', options: [{ id: 'p1', label: 'Lobectomy' }, { id: 'p2', label: 'Wedge resection' }] }] }] };
    const out = labelSynopticChanges([
      { area: 'synoptic', path: ['synopticReports', 'Lung Resection', 'answers', 'procedure'], kind: 'changed', before: 'p1', after: 'p2' },
      { area: 'case', path: ['status'], kind: 'changed', before: 'a', after: 'b' },
    ], new Map([['Lung Resection', template]]));
    expect(out[0]).toEqual({ area: 'synoptic', path: ['synopticReports', 'Lung Resection', 'Procedure'], kind: 'changed', before: 'Lobectomy', after: 'Wedge resection' });
    expect(out[1].path).toEqual(['status']);
  });
  it('keeps the ids when the template or field is unknown', () => {
    const c = { area: 'synoptic' as const, path: ['synopticReports', 'X', 'answers', 'f'], kind: 'changed' as const, before: 'a', after: 'b' };
    expect(labelSynopticChanges([c], new Map())).toEqual([c]);
  });
});
