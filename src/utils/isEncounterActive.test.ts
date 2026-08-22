// src/utils/isEncounterActive.test.ts
import { describe, it, expect } from 'vitest';
import { isEncounterActive, ENCOUNTER_ACTIVE_WINDOW_MS } from './isEncounterActive';
import type { Encounter } from '@/services/encounters/IEncounterService';

const NOW = new Date('2026-08-12T12:00:00.000Z').getTime();

function makeEncounter(overrides: Partial<Encounter> = {}): Encounter {
  return {
    id: 'enc-1',
    organisationId: 'ENT-DEFAULT',
    patientId: 'pat-1',
    encounterNumber: 'ENC-001',
    encounterClass: 'Inpatient',
    status: 'In-Progress',
    admitTime: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    createdAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe('isEncounterActive — real safety safeguard, per direct specification: "Strict Matching & Active Status Constraints"', () => {
  it('is true for a recent In-Progress encounter', () => {
    expect(isEncounterActive(makeEncounter({ status: 'In-Progress' }), NOW)).toBe(true);
  });

  it('is true for a recent Arrived encounter', () => {
    expect(isEncounterActive(makeEncounter({ status: 'Arrived' }), NOW)).toBe(true);
  });

  it('is false for Planned — the patient has not arrived yet, nothing real to auto-fill from', () => {
    expect(isEncounterActive(makeEncounter({ status: 'Planned' }), NOW)).toBe(false);
  });

  it('is false for Discharged — the real, explicit "historical, do not auto-load" case the spec\'s own worked example names directly', () => {
    expect(isEncounterActive(makeEncounter({ status: 'Discharged' }), NOW)).toBe(false);
  });

  it('is false for Cancelled', () => {
    expect(isEncounterActive(makeEncounter({ status: 'Cancelled' }), NOW)).toBe(false);
  });

  it('is false for a Discharged encounter from 6 months ago even though it is the patient\'s only encounter — the exact scenario the spec\'s own example calls out', () => {
    const sixMonthsAgo = new Date(NOW - 180 * 24 * 60 * 60 * 1000).toISOString();
    expect(isEncounterActive(makeEncounter({ status: 'Discharged', admitTime: sixMonthsAgo }), NOW)).toBe(false);
  });

  it('is false for an In-Progress encounter outside the 48-hour window, even though the status is genuinely active', () => {
    const threeDaysAgo = new Date(NOW - 72 * 60 * 60 * 1000).toISOString();
    expect(isEncounterActive(makeEncounter({ status: 'In-Progress', admitTime: threeDaysAgo }), NOW)).toBe(false);
  });

  it('is true right at the 48-hour boundary, false just past it', () => {
    const exactlyAtWindow = new Date(NOW - ENCOUNTER_ACTIVE_WINDOW_MS).toISOString();
    const justPastWindow = new Date(NOW - ENCOUNTER_ACTIVE_WINDOW_MS - 1000).toISOString();
    expect(isEncounterActive(makeEncounter({ admitTime: exactlyAtWindow }), NOW)).toBe(true);
    expect(isEncounterActive(makeEncounter({ admitTime: justPastWindow }), NOW)).toBe(false);
  });

  it('prefers lastEventAt over admitTime when both are present — the true, source-system time of the most recent real ADT update', () => {
    // admitTime is old (would fail the window on its own), but a real,
    // recent ADT update (lastEventAt) means the encounter is still
    // genuinely current.
    const oldAdmit = new Date(NOW - 72 * 60 * 60 * 1000).toISOString();
    const recentEvent = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
    expect(isEncounterActive(makeEncounter({ admitTime: oldAdmit, lastEventAt: recentEvent }), NOW)).toBe(true);
  });

  it('falls back to admitTime when lastEventAt is absent', () => {
    const recentAdmit = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
    expect(isEncounterActive(makeEncounter({ admitTime: recentAdmit, lastEventAt: undefined }), NOW)).toBe(true);
  });

  it('is false when neither admitTime nor lastEventAt is present — no real timestamp to judge recency against', () => {
    expect(isEncounterActive(makeEncounter({ admitTime: undefined, lastEventAt: undefined }), NOW)).toBe(false);
  });

  it('is false for a future-dated timestamp — a genuine data anomaly should not be treated as "very recent"', () => {
    const future = new Date(NOW + 60 * 60 * 1000).toISOString();
    expect(isEncounterActive(makeEncounter({ admitTime: future }), NOW)).toBe(false);
  });
});
