// src/utils/facilityTime.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, clinical-informatics best practice (Pete's direct guidance):
// events belong to the facility/practice where the work occurred, not the
// viewer's device and not raw UTC. Storage stays UTC ISO 8601 always -
// this module is the single, real place a stored UTC timestamp gets
// bucketed into a real calendar year/month/day (and now, real HH:MM:SS +
// real UTC offset, for HL7) using Intl.DateTimeFormat's real, native
// timeZone support (no external library needed, no dependency added).
//
// Before this: computeMonthlyCaseCounts/computeMonthlyRvu/computeRvuSummary
// (and QualityAssurancePage.tsx's own, separate month-bucketing loop) all used
// raw new Date(iso).getMonth()/.getFullYear() - the VIEWING DEVICE's own
// local timezone, not a real, fixed facility timezone. Two real problems
// this caused: (1) a test using midnight-UTC fixtures silently misattributed
// a case to the wrong month depending on which timezone the test happened to
// run in (caught on Pete's own machine, Arizona); (2) more importantly, a
// real, live problem this predates the test: a pathologist genuinely
// traveling, or a browser genuinely set to a different system timezone,
// would see the SAME real case shift which month it counted toward,
// depending on nothing but the viewing device - never stable, never
// matching the real shift/billing-cycle reality of when the work actually
// happened.
//
// Phase 2 addition (HL7 timestamps, segmentBuilders.ts): HL7 v2.x TS
// fields require YYYYMMDDHHMMSS[+/-ZZZZ] - the real, signed facility UTC
// offset, per HL7 spec, not the sending browser's own offset. Added
// getFacilityDateTimeParts (full Y/M/D/H/M/S, not just Y/M/D) and
// getFacilityUtcOffsetString (the real, signed "+HHMM"/"-HHMM" string).
// Real fix, not just an addition: getFacilityDateParts and
// getFacilityMidnightUtc are now both implemented IN TERMS OF this same,
// single, shared date-time extraction and offset computation - the old,
// separate Y/M/D-only formatter/cache and the offset math duplicated
// inline inside getFacilityMidnightUtc are both removed rather than left
// sitting alongside the new, more general versions.
// ─────────────────────────────────────────────────────────────────────────────

export interface FacilityMonthRange {
  /** e.g. 'Jan 26' - matches the real display format these callers
   *  already used before this fix. */
  label: string;
  year: number;
  month: number; // 0-indexed
}

/** Real, shared helper for the "trailing N months, in facility time"
 *  pattern found identically duplicated across QualityAssurancePage.tsx,
 *  ReconciliationTab.tsx, CountersignTurnaroundTab.tsx, and
 *  IntraopLinkageTab.tsx - each had built this via
 *  d.setMonth(d.getMonth() - i) on a raw, viewing-device-local Date.
 *  Real, pure integer arithmetic on the real, facility-derived starting
 *  {year, month} - no further Date-object timezone ambiguity once that
 *  real starting point is resolved. */
export function getTrailingFacilityMonths(count: number, timezone: string, now: Date = new Date()): FacilityMonthRange[] {
  const { year: startYear, month: startMonth } = getFacilityDateParts(now, timezone);
  const months: FacilityMonthRange[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const totalMonths = startYear * 12 + startMonth - i;
    const year = Math.floor(totalMonths / 12);
    const month = ((totalMonths % 12) + 12) % 12;
    const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
    months.push({ label, year, month });
  }
  return months;
}

/** Real, honest check: does a real, stored event's own timestamp fall
 *  within a given real facility-calendar month? Replaces the real,
 *  duplicated millisecond-range (monthStart/monthEnd) comparisons these
 *  same four files each built independently - direct {year, month}
 *  comparison of the real, facility-derived components is simpler and
 *  avoids constructing yet another local-time Date for the range
 *  boundaries themselves. */
export function isInFacilityMonth(isoDate: string | undefined | null, range: FacilityMonthRange, timezone: string): boolean {
  if (!isoDate) return false;
  if (isNaN(new Date(isoDate).getTime())) return false;
  const parts = getFacilityDateParts(isoDate, timezone);
  return parts.year === range.year && parts.month === range.month;
}

export interface FacilityDateTimeParts {
  year: number;
  /** 0-indexed, matching native Date.getMonth()'s own convention, so
   *  every real caller already written against that convention (e.g.
   *  MONTH_LABELS[idx] in productivityCalculations.ts) keeps working
   *  unchanged. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timezone: string): Intl.DateTimeFormat {
  let fmt = dateTimeFormatterCache.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    dateTimeFormatterCache.set(timezone, fmt);
  }
  return fmt;
}

/** Real, full year/month/day/hour/minute/second for a given real UTC
 *  timestamp (or Date), evaluated against the real, configured facility
 *  timezone - the same real stability already verified for
 *  getFacilityDateParts (identical result regardless of which timezone
 *  the calling process itself runs in), extended with real time-of-day
 *  components for HL7 timestamp formatting. Same real, honest UTC
 *  fallback for a genuinely invalid timezone string. A formatter quirk,
 *  handled directly: Intl can report hour 24 for midnight in
 *  hour12:false mode in some environments - normalized to 0. */
export function getFacilityDateTimeParts(input: string | Date, timezone: string): FacilityDateTimeParts {
  const d = typeof input === 'string' ? new Date(input) : input;
  try {
    const parts = getDateTimeFormatter(timezone).formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value;
    const year = Number(get('year'));
    const month = Number(get('month')) - 1; // Intl gives 1-indexed; normalize to 0-indexed
    const day = Number(get('day'));
    const rawHour = Number(get('hour'));
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = Number(get('minute'));
    const second = Number(get('second'));
    if ([year, month, day, hour, minute, second].some(Number.isNaN)) {
      throw new Error('unparseable parts');
    }
    return { year, month, day, hour, minute, second };
  } catch {
    return {
      year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(),
      hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
    };
  }
}

export interface FacilityDateParts {
  year: number;
  month: number; // 0-indexed
  day: number;
}

/** Real, timezone-stable year/month/day - implemented in terms of
 *  getFacilityDateTimeParts above rather than its own, separate
 *  Y/M/D-only Intl.DateTimeFormat/cache, so there is exactly one real
 *  place this extraction happens, not two. */
export function getFacilityDateParts(input: string | Date, timezone: string): FacilityDateParts {
  const { year, month, day } = getFacilityDateTimeParts(input, timezone);
  return { year, month, day };
}

/** Batch 360: the facility's calendar date as 'YYYY-MM-DD' (e.g. "today" for due dates). */
export function getFacilityIsoDate(input: string | Date, timezone: string): string {
  const { year, month, day } = getFacilityDateParts(input, timezone);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Real, shared UTC-offset computation (milliseconds), reused by both
 *  getFacilityMidnightUtc and getFacilityUtcOffsetString below - not
 *  duplicated inline in each. Compares the real, facility-local
 *  wall-clock reading of a given real UTC instant against that same
 *  instant reinterpreted as if it were itself UTC; the real difference
 *  is the real, current offset. Correct even for a timezone whose
 *  offset varies by date (DST), since it's derived at the real,
 *  specific instant given, never assumed constant. */
function getTimezoneOffsetMs(instant: Date, timezone: string): number {
  const { year, month, day, hour, minute, second } = getFacilityDateTimeParts(instant, timezone);
  const asIfUtc = Date.UTC(year, month, day, hour, minute, second);
  return asIfUtc - instant.getTime();
}

/** Real, correct facility-timezone-midnight-as-UTC-instant. NOT the same
 *  as Date.UTC(year, month, day) - verified directly that's a real,
 *  different, wrong instant (Date.UTC(2026,1,1) is 5pm Jan 31 in
 *  Arizona, not midnight Feb 1). */
export function getFacilityMidnightUtc(year: number, month: number, day: number, timezone: string): Date {
  const approxGuess = new Date(Date.UTC(year, month, day));
  const offsetMs = getTimezoneOffsetMs(approxGuess, timezone);
  return new Date(approxGuess.getTime() - offsetMs);
}

/** Real, signed HL7-style UTC offset string ("+0530"/"-0700") for the
 *  real, configured facility timezone at a given real instant - per
 *  Pete's direct HL7 v2.x guidance: a TS field's offset must reflect the
 *  real, originating facility, never the sending browser's own offset.
 *  Sign convention matches HL7/ISO 8601: negative for timezones behind
 *  UTC (e.g. Arizona, -0700), positive for timezones ahead (e.g. India,
 *  +0530). Verified directly, numerically, before trusting it: an
 *  earlier version of this function added an extra sign flip here,
 *  reasoning (wrongly) that getTimezoneOffsetMs's raw output was
 *  inverted from the standard convention - a direct, numeric check
 *  (Arizona instant -> raw offset -420 min) showed the raw value
 *  already IS the standard, correct, signed offset. The flip was a
 *  real bug, caught and removed before shipping, not a design choice. */
export function getFacilityUtcOffsetString(instant: Date, timezone: string): string {
  const offsetMinutesRaw = getTimezoneOffsetMs(instant, timezone) / 60000;
  const sign = offsetMinutesRaw < 0 ? '-' : '+';
  const abs = Math.round(Math.abs(offsetMinutesRaw));
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}${mm}`;
}
