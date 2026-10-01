/**
 * utils/csv.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Native (dependency-free) CSV parsing, generation, and file-picker helpers —
 * PS-48: standardizes every manual-maintenance dictionary import/export on
 * strict CSV, replacing the `xlsx` package everywhere it was used to read or
 * write spreadsheet files in the browser.
 *
 * Why: `xlsx`'s parser handles the full legacy Excel binary/formula format,
 * which is far more attack surface than this app's actual need — every real
 * use here is a human downloading a flat-row template, editing it in a
 * spreadsheet app, and re-uploading flat tabular data. A small RFC4180-style
 * CSV reader/writer covers that completely without carrying a general
 * spreadsheet-format parser (and its associated vulnerability surface) as a
 * dependency.
 *
 * Handles what plain `.split(',')`/`.join(',')` gets wrong: quoted fields
 * containing commas, quotes (escaped as ""), and embedded newlines — real
 * dictionary data (descriptions, notes fields) can contain any of these.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Parses raw CSV text into an array of string-cell rows (RFC4180: quoted
 * fields, "" escaping, embedded commas/newlines). Row 0 is the header row —
 * callers that want header-keyed objects should use `parseCsv` instead.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Normalize line endings so \r\n and lone \r behave the same as \n.
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // Flush a trailing field/row — the file may or may not end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parses CSV text into an array of row-objects keyed by the header row.
 * Mirrors the shape every call site already expects from
 * `XLSX.utils.sheet_to_json(sheet, { defval: '' })`: every row gets every
 * header key, defaulting to '' when a row has fewer cells than the header.
 * Fully-blank rows (a trailing blank line, e.g.) are skipped.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  return dataRows
    .filter(row => row.some(cell => cell.trim() !== ''))
    .map(row => {
      const obj: Record<string, string> = {};
      header.forEach((key, i) => { obj[key] = row[i] ?? ''; });
      return obj;
    });
}

/** One CSV field, quoted (with internal quotes escaped as "") only when the value actually contains a comma, quote, or newline. */
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serializes an array of row-objects into CSV text. Column order comes from
 * `columns` when given, otherwise the first row's own key order — mirrors
 * the shape every call site already expects from `XLSX.utils.json_to_sheet`.
 */
export function toCsv<T extends object>(rows: T[], columns?: string[]): string {
  const cols = columns ?? Object.keys(rows[0] ?? {});
  if (cols.length === 0) return '';
  const lines = [cols.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(cols.map(c => csvField((row as Record<string, unknown>)[c])).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Triggers a browser download of `text` as a .csv file — the direct
 * replacement for `XLSX.writeFile(wb, filename)` at every template/export
 * call site. Prepends a UTF-8 BOM so Excel (still the most common editor
 * these files get opened in) detects the encoding correctly instead of
 * mis-rendering non-ASCII text.
 */
export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Client-side guard for a manual-maintenance upload, checked before the
 * file is read at all. A renamed file still parses fine either way, so the
 * real value isn't a security boundary — it's catching the overwhelmingly
 * common mistake (picking the wrong file, or a stale .xlsx from before this
 * change) immediately, with a clear message, instead of failing deep inside
 * the CSV parser.
 */
export function isCsvFile(file: File): boolean {
  const nameOk = /\.csv$/i.test(file.name);
  const typeOk =
    file.type === '' || // many OSes/browsers leave this blank for .csv
    file.type === 'text/csv' ||
    file.type === 'application/vnd.ms-excel' || // some Windows/Excel setups report this for .csv
    file.type === 'text/plain';
  return nameOk && typeOk;
}

/** Reads a File as text via FileReader, wrapped as a Promise for use in async handlers. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
