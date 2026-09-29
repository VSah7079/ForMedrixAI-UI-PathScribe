// src/services/lisIngestion/adapters/hl7v2StatusAdapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// Push adapter: an HL7 v2 message from the LIS (or its interface engine)
// → NormalizedLisUpdate. Pure; parsing uses services/hl7/hl7Parser.ts.
//
// Accepted: ORU^R01 (results, including preliminary), ORM^O01 and OML^O21
// (order status). One update per OBR.
//   accession  OBR-3 filler order number, else OBR-2 placer, else ORC-3
//   status     the first non-empty of the configured fields, by default
//              ORC-5 (order status), then OBR-25 (result status). LISs
//              differ on where a workflow status like "GROSSED" goes, so
//              this is a per-site setting.
//   updatedAt  OBR-22 (status change time), else MSH-7
//   text       OBX-5 of the OBX segments under that OBR, by OBX-3 LOINC:
//              22634-0 gross, 22635-7 microscopic, 22637-3 final diagnosis
//
// HL7 timestamps without an offset are read as UTC; a site whose LIS sends
// local time should send the offset (e.g. 20260924142000-0700).
// ─────────────────────────────────────────────────────────────────────────────

import { parseHL7Message, getField, getComponent, type ParsedHL7Segment } from '@/services/hl7/hl7Parser';
import type { AdapterResult, LisPushAdapter, NormalizedLisUpdate } from '../types';

export type Hl7StatusField = 'ORC-5' | 'OBR-25';
export const DEFAULT_HL7_STATUS_FIELDS: readonly Hl7StatusField[] = ['ORC-5', 'OBR-25'];

const SUPPORTED_TYPES = new Set(['ORU^R01', 'ORM^O01', 'OML^O21']);

const LOINC_GROSS = '22634-0';
const LOINC_MICRO = '22635-7';
const LOINC_DIAGNOSIS = '22637-3';

/** HL7 v2 escape sequences in text fields. */
export function unescapeHl7Text(s: string): string {
  return s
    .replace(/\\\.br\\/g, '\n')
    .replace(/\\F\\/g, '|')
    .replace(/\\S\\/g, '^')
    .replace(/\\T\\/g, '&')
    .replace(/\\R\\/g, '~')
    .replace(/\\E\\/g, '\\');
}

/** HL7 TS (YYYY[MM[DD[HH[MM[SS[.S+]]]]]][+/-ZZZZ]) → ISO, or null. */
export function hl7TimestampToIso(ts: string): string | null {
  const m = ts.trim().match(/^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.\d+)?([+-]\d{4})?$/);
  if (!m) return null;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00', off] = m;
  const offset = off ? `${off.slice(0, 3)}:${off.slice(3)}` : 'Z';
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function statusFrom(field: Hl7StatusField, orc: ParsedHL7Segment | null, obr: ParsedHL7Segment): string {
  return field === 'ORC-5' ? getField(orc, 5) : getField(obr, 25);
}

export function createHl7v2StatusAdapter(opts: { statusFields?: readonly Hl7StatusField[] } = {}): LisPushAdapter {
  const statusFields = opts.statusFields ?? DEFAULT_HL7_STATUS_FIELDS;
  return {
    source: 'hl7v2',
    normalize(raw: string): AdapterResult {
      if (!raw.trim()) return { ok: false, error: 'EMPTY_MESSAGE' };
      const msg = parseHL7Message(raw);
      const msh = msg.getSegment('MSH');
      if (!msh || msg.segments[0]?.segmentId !== 'MSH') return { ok: false, error: 'NOT_HL7' };
      const msgType = getField(msh, 9).split('^').slice(0, 2).join('^');
      if (!SUPPORTED_TYPES.has(msgType)) return { ok: false, error: 'UNSUPPORTED_MESSAGE_TYPE' };
      const messageTime = hl7TimestampToIso(getField(msh, 7));

      // Walk segments in order so each OBX belongs to the OBR above it.
      const updates: NormalizedLisUpdate[] = [];
      let orc: ParsedHL7Segment | null = null;
      let current: { u: NormalizedLisUpdate; text: Record<string, string[]> } | null = null;
      const flush = () => {
        if (!current) return;
        const join = (k: string) => (current!.text[k]?.length ? current!.text[k].join('\n') : undefined);
        const gross = join(LOINC_GROSS), micro = join(LOINC_MICRO), dx = join(LOINC_DIAGNOSIS);
        updates.push({
          ...current.u,
          ...(gross !== undefined ? { grossText: gross } : {}),
          ...(micro !== undefined ? { microscopicText: micro } : {}),
          ...(dx !== undefined ? { diagnosisText: dx } : {}),
        });
        current = null;
      };

      for (const seg of msg.segments) {
        if (seg.segmentId === 'ORC') orc = seg;
        else if (seg.segmentId === 'OBR') {
          flush();
          const accession = getComponent(getField(seg, 3), 0) || getComponent(getField(seg, 2), 0) || getComponent(getField(orc, 3), 0);
          if (!accession) return { ok: false, error: 'MISSING_ACCESSION' };
          const lisStatus = statusFields.map(f => statusFrom(f, orc, seg)).find(v => v.trim()) ?? '';
          if (!lisStatus) return { ok: false, error: 'MISSING_STATUS' };
          const updatedAt = hl7TimestampToIso(getField(seg, 22)) ?? messageTime;
          if (!updatedAt) return { ok: false, error: 'INVALID_UPDATED_AT' };
          current = { u: { accession, lisStatus: lisStatus.trim(), updatedAt }, text: {} };
        } else if (seg.segmentId === 'OBX' && current) {
          const code = getComponent(getField(seg, 3), 0);
          const value = unescapeHl7Text(getField(seg, 5));
          (current.text[code] ??= []).push(value);
        }
      }
      flush();
      if (updates.length === 0) return { ok: false, error: 'MISSING_ACCESSION' };
      return { ok: true, updates };
    },
  };
}

export const hl7v2StatusAdapter = createHl7v2StatusAdapter();

/** A sample message for the admin screen's "Test an inbound message".
 *  Demo data: Gross Complete for the seeded Assist case S26-4416-BX-001. */
export const EXAMPLE_HL7_STATUS_MESSAGE = [
  'MSH|^~\\&|DEMO_LIS|DEMO_LAB|PATHSCRIBE|PATHSCRIBE|20260924150500||ORU^R01|MSG-DEMO-0001|P|2.5.1',
  'PID|1||100016^^^DEMO_LIS^MR',
  'ORC|SC|S26-4416-BX-001|S26-4416-BX-001||GROSSED',
  'OBR|1|S26-4416-BX-001|S26-4416-BX-001|88305^Surgical pathology^CPT||||||||||||||||||20260924150500|||P',
  'OBX|1|TX|22634-0^Path report.gross observation^LN||Received in formalin labeled "skin punch biopsy right forearm" is a punch biopsy measuring 0.4 cm in diameter and 0.3 cm deep.||||||P',
].join('\r');
