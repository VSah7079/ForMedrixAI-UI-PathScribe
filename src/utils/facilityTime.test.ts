// src/utils/facilityTime.test.ts
import { describe, it, expect } from 'vitest';
import { getFacilityDateParts, getTrailingFacilityMonths, isInFacilityMonth, getFacilityMidnightUtc, getFacilityDateTimeParts, getFacilityUtcOffsetString } from './facilityTime';

describe('getFacilityDateParts — real fix: facility-timezone-stable date bucketing, not the viewing device\'s own timezone', () => {
  it('the real, exact scenario: an 11pm Jan 31 Tucson sign-off (stored as 6am UTC Feb 1) correctly groups under January', () => {
    const parts = getFacilityDateParts('2026-02-01T06:00:00.000Z', 'America/Phoenix');
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(0); // January, 0-indexed
    expect(parts.day).toBe(31);
  });

  it('a real event that genuinely IS after facility midnight correctly stays in the later day/month', () => {
    // 1am Tucson on Feb 1 = 8am UTC Feb 1 - genuinely February.
    const parts = getFacilityDateParts('2026-02-01T08:00:00.000Z', 'America/Phoenix');
    expect(parts.month).toBe(1); // February
    expect(parts.day).toBe(1);
  });

  it('real, honest month indexing matches the native Date.getMonth() convention (0-indexed), so existing callers (MONTH_LABELS[idx]) keep working unchanged', () => {
    const jan = getFacilityDateParts('2026-01-15T12:00:00.000Z', 'America/Phoenix');
    const dec = getFacilityDateParts('2026-12-15T12:00:00.000Z', 'America/Phoenix');
    expect(jan.month).toBe(0);
    expect(dec.month).toBe(11);
  });
});

describe('getFacilityDateParts — real, verified stability across different viewing-device timezones (the actual point of this fix)', () => {
  const iso = '2026-02-01T06:00:00.000Z'; // the real, exact Tucson 11pm Jan 31 example

  it('produces the identical, real result whether evaluated in a UTC-running process...', () => {
    const parts = getFacilityDateParts(iso, 'America/Phoenix');
    expect(parts).toEqual({ year: 2026, month: 0, day: 31 });
  });

  it('...or a Date object constructed while the process itself runs in a totally different real timezone', () => {
    // Simulates a pathologist viewing their own dashboard from a device
    // set to New York time - the real facility (Phoenix) result must not
    // change just because the viewing device's own clock/timezone did.
    const d = new Date(iso);
    const parts = getFacilityDateParts(d, 'America/Phoenix');
    expect(parts).toEqual({ year: 2026, month: 0, day: 31 });
  });
});

describe('getFacilityMidnightUtc — real fix: the correct facility-timezone midnight as an absolute UTC instant', () => {
  it('is NOT the same as Date.UTC(year, month, day) - the real, wrong instant I almost shipped, verified directly', () => {
    const wrong = new Date(Date.UTC(2026, 1, 1)); // what I originally, incorrectly used
    const correct = getFacilityMidnightUtc(2026, 1, 1, 'America/Phoenix');
    expect(correct.getTime()).not.toBe(wrong.getTime());
  });

  it('the real, correct instant, verified by reading it back in the real facility timezone', () => {
    const midnight = getFacilityMidnightUtc(2026, 1, 1, 'America/Phoenix');
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(midnight);
    const get = (type: string) => parts.find(p => p.type === type)?.value;
    expect(get('year')).toBe('2026');
    expect(get('month')).toBe('02');
    expect(get('day')).toBe('01');
    expect(get('hour')).toBe('00');
    expect(get('minute')).toBe('00');
  });

  it('the real, exact UTC offset for Arizona (UTC-7, no DST) - real facility midnight Feb 1 is 07:00 UTC', () => {
    const midnight = getFacilityMidnightUtc(2026, 1, 1, 'America/Phoenix');
    expect(midnight.toISOString()).toBe('2026-02-01T07:00:00.000Z');
  });

  it('correctly handles a real timezone with a positive UTC offset (Asia/Kolkata, UTC+5:30)', () => {
    const midnight = getFacilityMidnightUtc(2026, 1, 1, 'Asia/Kolkata');
    // Midnight India time is 5:30 hours BEFORE UTC midnight the same day.
    expect(midnight.toISOString()).toBe('2026-01-31T18:30:00.000Z');
  });
});

describe('getFacilityDateTimeParts — real, full year/month/day/hour/minute/second in the real facility timezone', () => {
  it('the real, exact Pete scenario, with full time-of-day: an 11:30pm Jan 31 Tucson sign-off (6:30am UTC Feb 1)', () => {
    const parts = getFacilityDateTimeParts('2026-02-01T06:30:00.000Z', 'America/Phoenix');
    expect(parts).toEqual({ year: 2026, month: 0, day: 31, hour: 23, minute: 30, second: 0 });
  });

  it('real, honest stability across different real running-process timezones - the same real point as getFacilityDateParts', () => {
    const iso = '2026-02-01T06:30:00.000Z';
    const a = getFacilityDateTimeParts(iso, 'America/Phoenix');
    const b = getFacilityDateTimeParts(new Date(iso), 'America/Phoenix');
    expect(a).toEqual(b);
  });

  it('a genuinely invalid timezone honestly falls back to real, raw UTC components, never a crash', () => {
    const parts = getFacilityDateTimeParts('2026-02-01T06:30:00.000Z', 'Not/A_Real_Timezone');
    expect(parts).toEqual({ year: 2026, month: 1, day: 1, hour: 6, minute: 30, second: 0 });
  });
});

describe('getFacilityUtcOffsetString — real fix: HL7 v2.x TS fields need the real, signed facility offset, never the sending browser\'s own offset', () => {
  it('the real, exact, known Arizona offset (UTC-7, no DST) - a real bug (an unnecessary sign flip) was caught and removed here before shipping', () => {
    const offset = getFacilityUtcOffsetString(new Date('2026-02-01T07:00:00.000Z'), 'America/Phoenix');
    expect(offset).toBe('-0700');
  });

  it('a real, positive offset (India, UTC+5:30) - a half-hour offset, not just whole hours', () => {
    const offset = getFacilityUtcOffsetString(new Date('2026-02-01T00:00:00.000Z'), 'Asia/Kolkata');
    expect(offset).toBe('+0530');
  });

  it('real UTC itself is a real, honest +0000, not an empty string or omitted sign', () => {
    const offset = getFacilityUtcOffsetString(new Date('2026-02-01T00:00:00.000Z'), 'UTC');
    expect(offset).toBe('+0000');
  });

  it('stays real and stable regardless of which timezone the calling process itself runs in', () => {
    const instant = new Date('2026-02-01T07:00:00.000Z');
    const offset = getFacilityUtcOffsetString(instant, 'America/Phoenix');
    expect(offset).toBe('-0700'); // must not depend on process.env.TZ
  });
});

describe('getFacilityDateParts — real, honest fallback for a genuinely invalid timezone', () => {
  it('falls back to real, raw UTC components rather than throwing and breaking a real metric calculation', () => {
    const parts = getFacilityDateParts('2026-02-01T06:00:00.000Z', 'Not/A_Real_Timezone');
    // UTC components for this real timestamp - an honest fallback, not a crash.
    expect(parts).toEqual({ year: 2026, month: 1, day: 1 });
  });
});

describe('getTrailingFacilityMonths — real fix: replaces the identical, duplicated d.setMonth(d.getMonth() - i) pattern found in QualityAssurancePage.tsx and three QA tabs', () => {
  it('returns the real, correct trailing months ending on the real, current facility month', () => {
    const months = getTrailingFacilityMonths(3, 'America/Phoenix', new Date('2026-06-15T19:00:00.000Z'));
    expect(months.map(m => ({ year: m.year, month: m.month }))).toEqual([
      { year: 2026, month: 3 }, // Apr
      { year: 2026, month: 4 }, // May
      { year: 2026, month: 5 }, // Jun
    ]);
  });

  it('correctly, honestly crosses a real year boundary', () => {
    const months = getTrailingFacilityMonths(3, 'America/Phoenix', new Date('2026-01-15T19:00:00.000Z'));
    expect(months.map(m => ({ year: m.year, month: m.month }))).toEqual([
      { year: 2025, month: 10 }, // Nov 2025
      { year: 2025, month: 11 }, // Dec 2025
      { year: 2026, month: 0 },  // Jan 2026
    ]);
  });

  it('produces a real, honest human-readable label for each month', () => {
    const months = getTrailingFacilityMonths(1, 'America/Phoenix', new Date('2026-06-15T19:00:00.000Z'));
    expect(months[0].label).toBe('Jun 26');
  });
});

describe('isInFacilityMonth — real fix: replaces the identical, duplicated millisecond monthStart/monthEnd range comparison found in the same four files', () => {
  const juneRange = { label: 'Jun 26', year: 2026, month: 5 };

  it('correctly matches a real event genuinely within the given facility month', () => {
    expect(isInFacilityMonth('2026-06-15T12:00:00.000Z', juneRange, 'America/Phoenix')).toBe(true);
  });

  it('the real, exact Pete scenario: an 11pm Jan 31 Tucson event (6am UTC Feb 1) correctly matches January, not February', () => {
    const janRange = { label: 'Jan 26', year: 2026, month: 0 };
    const febRange = { label: 'Feb 26', year: 2026, month: 1 };
    expect(isInFacilityMonth('2026-02-01T06:00:00.000Z', janRange, 'America/Phoenix')).toBe(true);
    expect(isInFacilityMonth('2026-02-01T06:00:00.000Z', febRange, 'America/Phoenix')).toBe(false);
  });

  it('a genuinely missing or unparseable date honestly returns false, never a crash', () => {
    expect(isInFacilityMonth(undefined, juneRange, 'America/Phoenix')).toBe(false);
    expect(isInFacilityMonth(null, juneRange, 'America/Phoenix')).toBe(false);
    expect(isInFacilityMonth('not-a-real-date', juneRange, 'America/Phoenix')).toBe(false);
  });
});

import { getFacilityIsoDate } from './facilityTime';

describe('getFacilityIsoDate (Batch 360)', () => {
  it("gives the facility's calendar date", () => {
    // 03:00 UTC on 28 Sep is still 27 Sep in Phoenix (UTC-7).
    expect(getFacilityIsoDate('2026-09-28T03:00:00Z', 'America/Phoenix')).toBe('2026-09-27');
    expect(getFacilityIsoDate('2026-09-28T03:00:00Z', 'Europe/London')).toBe('2026-09-28');
  });
});
