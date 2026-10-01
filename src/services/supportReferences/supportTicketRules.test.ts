// Batch 364 (PS-349): what a support ticket says about the page and the text.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findIdentifiersInText, replaceIdentifiers, SUPPORT_ROUTE_PATTERNS, supportPageOf } from './supportTicketRules';
import { IDENTIFIER_FORMAT_LIBRARY } from '@/types/systemConfig';

describe('supportPageOf', () => {
  it('reports the route pattern, never the case number, and returns the case separately', () => {
    expect(supportPageOf('/report/S26-4403')).toEqual({ pattern: '/report/:caseId', caseId: 'S26-4403' });
    expect(supportPageOf('/case/MPA26-1001-BR/synoptic')).toEqual({ pattern: '/case/:caseId/synoptic', caseId: 'MPA26-1001-BR' });
  });
  it('drops the query string and hides other ids and tokens', () => {
    expect(supportPageOf('/worklist?filter=urgent&q=S26-4403')).toEqual({ pattern: '/worklist' });
    expect(supportPageOf('/consult/abc123secret').pattern).toBe('/consult/:token');
    expect(supportPageOf('/molecular-batch/batch-77').pattern).toBe('/molecular-batch/:batchId');
  });
  it('prefers a literal route over a parameter', () => {
    expect(supportPageOf('/admin/parts/new').pattern).toBe('/admin/parts/new');
    expect(supportPageOf('/template-editor/new').pattern).toBe('/template-editor/new');
  });
  it('an unknown address is reported as "(other page)", not echoed', () => {
    expect(supportPageOf('/whatever/S26-4403')).toEqual({ pattern: '(other page)' });
  });
  it('knows every route in App.tsx', () => {
    const app = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../App.tsx'), 'utf8');
    const routes = [...app.matchAll(/path="([^"]+)"/g)].map(m => m[1]).filter(p => p !== '*');
    expect(routes.filter(r => !SUPPORT_ROUTE_PATTERNS.includes(r))).toEqual([]);
  });
});

describe('findIdentifiersInText', () => {
  const formats = IDENTIFIER_FORMAT_LIBRARY;
  it('finds case numbers and MRNs the lab\'s enabled formats recognise', () => {
    const found = findIdentifiersInText('Case S26-4403 froze. Patient MRN 1234567 was open.', formats);
    expect(found).toEqual(expect.arrayContaining([{ text: 'S26-4403', kind: 'accession' }, { text: '1234567', kind: 'mrn' }]));
  });
  it('ignores support references and ordinary words', () => {
    expect(findIdentifiersInText('See SR-7K2Q-9MXD. The page froze at 3pm.', formats)).toEqual([]);
  });
  it('checks every known format, even ones this lab has switched off (a miss would send patient data)', () => {
    const disabled = formats.map(f => ({ ...f, enabled: false }));
    expect(findIdentifiersInText('Case S26-4403, MRN 1234567', disabled).map(f => f.kind).sort()).toEqual(['accession', 'mrn']);
    expect(findIdentifiersInText('NHS 943 476 5919').length + findIdentifiersInText('NHS 9434765919').length).toBeGreaterThan(0);
  });
  it('replaceIdentifiers swaps each identifier for its replacement, whole words only', () => {
    expect(replaceIdentifiers('Case S26-4403 and s26-4403, not S26-44031.', new Map([['S26-4403', 'SR-7K2Q-9MXD']])))
      .toBe('Case SR-7K2Q-9MXD and SR-7K2Q-9MXD, not S26-44031.');
  });
});
