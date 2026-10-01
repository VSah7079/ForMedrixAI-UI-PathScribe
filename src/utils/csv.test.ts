import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvRows, toCsv, isCsvFile } from './csv';

describe('parseCsvRows — RFC4180 tokenizing', () => {
  it('splits plain comma-separated fields', () => {
    expect(parseCsvRows('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('keeps a comma inside a quoted field intact', () => {
    expect(parseCsvRows('name,note\nJane,"Smith, Jane"')).toEqual([
      ['name', 'note'],
      ['Jane', 'Smith, Jane'],
    ]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseCsvRows('note\n"She said ""hi"""')).toEqual([['note'], ['She said "hi"']]);
  });

  it('keeps an embedded newline inside a quoted field intact', () => {
    expect(parseCsvRows('note\n"line one\nline two"')).toEqual([['note'], ['line one\nline two']]);
  });

  it('handles CRLF line endings the same as LF', () => {
    expect(parseCsvRows('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles a file with no trailing newline', () => {
    expect(parseCsvRows('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseCsv — header-keyed rows (mirrors XLSX.utils.sheet_to_json defval behaviour)', () => {
  it('keys each row by the header, defaulting short rows to empty string', () => {
    const rows = parseCsv('name,code,note\nAlpha,A1,\nBeta,B2');
    expect(rows).toEqual([
      { name: 'Alpha', code: 'A1', note: '' },
      { name: 'Beta', code: 'B2', note: '' },
    ]);
  });

  it('skips fully-blank rows', () => {
    const rows = parseCsv('name,code\nAlpha,A1\n,\nBeta,B2\n');
    expect(rows).toEqual([
      { name: 'Alpha', code: 'A1' },
      { name: 'Beta', code: 'B2' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('toCsv — generation, and round-trip through parseCsv', () => {
  it('quotes a field containing a comma, quote, or newline; leaves plain fields bare', () => {
    const csv = toCsv([
      { name: 'Smith, Jane', note: 'She said "hi"', multiline: 'a\nb' },
    ]);
    expect(csv).toBe('name,note,multiline\r\n"Smith, Jane","She said ""hi""","a\nb"');
  });

  it('round-trips arbitrary values through toCsv → parseCsv unchanged', () => {
    const original = [
      { name: 'Alpha', code: 'A1', note: 'plain' },
      { name: 'O\'Brien, Sean', code: 'B2', note: 'has "quotes" and, a comma' },
      { name: 'Multi\nLine', code: 'C3', note: '' },
    ];
    const rows = parseCsv(toCsv(original));
    expect(rows).toEqual(original);
  });

  it('respects an explicit column order, including columns absent from a given row', () => {
    const csv = toCsv([{ b: '2', a: '1' }], ['a', 'b', 'c']);
    expect(csv).toBe('a,b,c\r\n1,2,');
  });

  it('returns an empty string for no rows and no columns', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('isCsvFile', () => {
  it('accepts a .csv file with a text/csv MIME type', () => {
    expect(isCsvFile(new File(['a,b'], 'data.csv', { type: 'text/csv' }))).toBe(true);
  });

  it('accepts a .csv file with a blank MIME type (common on some OSes)', () => {
    expect(isCsvFile(new File(['a,b'], 'data.csv', { type: '' }))).toBe(true);
  });

  it('rejects a .xlsx file even if mislabeled as text/csv', () => {
    expect(isCsvFile(new File(['x'], 'data.xlsx', { type: 'text/csv' }))).toBe(false);
  });

  it('rejects a .csv-named file with an unrelated MIME type', () => {
    expect(isCsvFile(new File(['x'], 'data.csv', { type: 'image/png' }))).toBe(false);
  });
});
