// src/services/printing/resolvePrintPresentationOptions.test.ts
import { describe, it, expect } from 'vitest';
import { resolvePrintPresentationOptions, REPORT_TYPE_DEFAULT_PRESENTATION } from './resolvePrintPresentationOptions';

describe('REPORT_TYPE_DEFAULT_PRESENTATION', () => {
  it('covers all four real PrintJobReportType values', () => {
    expect(Object.keys(REPORT_TYPE_DEFAULT_PRESENTATION).sort()).toEqual(['ADDENDUM', 'CORRECTED', 'FINAL', 'PRELIMINARY']);
  });
});

describe('resolvePrintPresentationOptions', () => {
  it('FINAL defaults to real Tray 1 letterhead, duplex — the definitive, client-facing record', () => {
    expect(resolvePrintPresentationOptions('FINAL')).toEqual({ paperSource: 'TRAY_1_LETTERHEAD', duplexMode: 'DUPLEX' });
  });

  it('CORRECTED defaults the same as FINAL — still the official, client-facing record', () => {
    expect(resolvePrintPresentationOptions('CORRECTED')).toEqual({ paperSource: 'TRAY_1_LETTERHEAD', duplexMode: 'DUPLEX' });
  });

  it('ADDENDUM defaults to letterhead but simplex — a real, typically short supplement', () => {
    expect(resolvePrintPresentationOptions('ADDENDUM')).toEqual({ paperSource: 'TRAY_1_LETTERHEAD', duplexMode: 'SIMPLEX' });
  });

  it('PRELIMINARY defaults to real Tray 2 plain, simplex — an internal/interim notification, never letterhead', () => {
    expect(resolvePrintPresentationOptions('PRELIMINARY')).toEqual({ paperSource: 'TRAY_2_PLAIN', duplexMode: 'SIMPLEX' });
  });

  it('a real, per-client paperSource override wins over the report-type default', () => {
    const result = resolvePrintPresentationOptions('PRELIMINARY', { paperSource: 'TRAY_1_LETTERHEAD' });
    expect(result.paperSource).toBe('TRAY_1_LETTERHEAD');
    expect(result.duplexMode).toBe('SIMPLEX'); // unset field still falls back to the real default
  });

  it('a real, per-client duplexMode override wins over the report-type default, independently of paperSource', () => {
    const result = resolvePrintPresentationOptions('FINAL', { duplexMode: 'SIMPLEX' });
    expect(result.duplexMode).toBe('SIMPLEX');
    expect(result.paperSource).toBe('TRAY_1_LETTERHEAD'); // unset field still falls back to the real default
  });

  it('a real client preference setting BOTH fields wins on both, independently', () => {
    const result = resolvePrintPresentationOptions('FINAL', { paperSource: 'TRAY_2_PLAIN', duplexMode: 'SIMPLEX' });
    expect(result).toEqual({ paperSource: 'TRAY_2_PLAIN', duplexMode: 'SIMPLEX' });
  });

  it('no real client preference at all falls back entirely to the report-type default', () => {
    expect(resolvePrintPresentationOptions('FINAL', undefined)).toEqual(REPORT_TYPE_DEFAULT_PRESENTATION.FINAL);
    expect(resolvePrintPresentationOptions('FINAL', {})).toEqual(REPORT_TYPE_DEFAULT_PRESENTATION.FINAL);
  });
});
