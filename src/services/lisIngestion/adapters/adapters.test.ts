// src/services/lisIngestion/adapters/adapters.test.ts — push adapters.
import { describe, it, expect } from 'vitest';
import {
  hl7v2StatusAdapter, createHl7v2StatusAdapter, hl7TimestampToIso, unescapeHl7Text, EXAMPLE_HL7_STATUS_MESSAGE,
} from './hl7v2StatusAdapter';
import { webhookJsonAdapter, EXAMPLE_WEBHOOK_BODY } from './webhookJsonAdapter';

const msg = (...segments: string[]) => ['MSH|^~\\&|LIS|LAB|PATHSCRIBE|PS|20260924150500||ORU^R01|M1|P|2.5.1', ...segments].join('\r');

describe('hl7v2StatusAdapter', () => {
  it('reads accession, status, time and the three text sections', () => {
    const res = hl7v2StatusAdapter.normalize(msg(
      'ORC|SC|P1|F1||MICRO_COMPLETE',
      'OBR|1|P1|F1^LIS|88307||||||||||||||||||20260924151000-0700',
      'OBX|1|TX|22634-0^Gross^LN||Line one\\.br\\line two',
      'OBX|2|TX|22635-7^Micro^LN||Invasive carcinoma \\T\\ LVI',
      'OBX|3|TX|22637-3^Dx^LN||Adenocarcinoma',
    ));
    expect(res).toEqual({ ok: true, updates: [{
      accession: 'F1', lisStatus: 'MICRO_COMPLETE', updatedAt: '2026-09-24T22:10:00.000Z',
      grossText: 'Line one\nline two', microscopicText: 'Invasive carcinoma & LVI', diagnosisText: 'Adenocarcinoma',
    }] });
  });

  it('falls back to OBR-25 for the status, OBR-2 for the accession and MSH-7 for the time', () => {
    const res = hl7v2StatusAdapter.normalize(msg('OBR|1|P9||88305|||||||||||||||||||||P'));
    expect(res).toEqual({ ok: true, updates: [{ accession: 'P9', lisStatus: 'P', updatedAt: '2026-09-24T15:05:00.000Z' }] });
  });

  it('can be set to read the status from OBR-25 first', () => {
    const adapter = createHl7v2StatusAdapter({ statusFields: ['OBR-25', 'ORC-5'] });
    const res = adapter.normalize(msg('ORC|SC|P1|F1||IP', 'OBR|1|P1|F1|88305|||||||||||||||||||||F'));
    expect(res.ok === true && res.updates[0].lisStatus).toBe('F');
  });

  it('produces one update per OBR', () => {
    const res = hl7v2StatusAdapter.normalize(msg('ORC|SC||||GROSSED', 'OBR|1||A1', 'OBX|1|TX|22634-0||g1', 'OBR|2||A2', 'OBX|1|TX|22634-0||g2'));
    expect(res.ok === true && res.updates.map(x => [x.accession, x.grossText])).toEqual([['A1', 'g1'], ['A2', 'g2']]);
  });

  it('refuses what it can\'t use', () => {
    expect(hl7v2StatusAdapter.normalize('  ')).toEqual({ ok: false, error: 'EMPTY_MESSAGE' });
    expect(hl7v2StatusAdapter.normalize('hello')).toEqual({ ok: false, error: 'NOT_HL7' });
    expect(hl7v2StatusAdapter.normalize(msg().replace('ORU^R01', 'ADT^A01'))).toEqual({ ok: false, error: 'UNSUPPORTED_MESSAGE_TYPE' });
    expect(hl7v2StatusAdapter.normalize(msg('OBR|1'))).toEqual({ ok: false, error: 'MISSING_ACCESSION' });
    expect(hl7v2StatusAdapter.normalize(msg('OBR|1||A1'))).toEqual({ ok: false, error: 'MISSING_STATUS' });
  });

  it('reads the built-in example message', () => {
    const res = hl7v2StatusAdapter.normalize(EXAMPLE_HL7_STATUS_MESSAGE);
    expect(res.ok === true && res.updates[0]).toMatchObject({ accession: 'S26-4416-BX-001', lisStatus: 'GROSSED' });
  });

  it('converts timestamps and escapes', () => {
    expect(hl7TimestampToIso('202609241510')).toBe('2026-09-24T15:10:00.000Z');
    expect(hl7TimestampToIso('garbage')).toBeNull();
    expect(unescapeHl7Text('a\\F\\b\\S\\c\\R\\d\\E\\e')).toBe('a|b^c~d\\e');
  });
});

describe('webhookJsonAdapter', () => {
  it('accepts one object or an array', () => {
    const one = webhookJsonAdapter.normalize(EXAMPLE_WEBHOOK_BODY);
    expect(one.ok === true && one.updates[0]).toMatchObject({ accession: 'S26-4416-BX-001', lisStatus: 'GROSSED', updatedAt: '2026-09-24T15:05:00.000Z' });
    const many = webhookJsonAdapter.normalize(JSON.stringify([
      { accession: 'A', status: 'X', updatedAt: '2026-09-24T01:00:00Z' },
      { accession: 'B', status: 'Y', updatedAt: '2026-09-24T02:00:00Z', diagnosisText: 'dx' },
    ]));
    expect(many.ok === true && many.updates.map(x => x.accession)).toEqual(['A', 'B']);
  });

  it('refuses invalid bodies with a code', () => {
    expect(webhookJsonAdapter.normalize('{')).toEqual({ ok: false, error: 'INVALID_JSON' });
    expect(webhookJsonAdapter.normalize('{"status":"X","updatedAt":"2026-01-01"}')).toEqual({ ok: false, error: 'MISSING_ACCESSION' });
    expect(webhookJsonAdapter.normalize('{"accession":"A","updatedAt":"2026-01-01"}')).toEqual({ ok: false, error: 'MISSING_STATUS' });
    expect(webhookJsonAdapter.normalize('{"accession":"A","status":"X","updatedAt":"soon"}')).toEqual({ ok: false, error: 'INVALID_UPDATED_AT' });
  });
});
