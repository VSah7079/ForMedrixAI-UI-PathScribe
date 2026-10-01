// src/utils/personName.ts
// ─────────────────────────────────────────────────────────────
// Medical-grade name field model — Prefix / Given Name(s) / Family
// Name(s) / Preferred Name / Suffix — replacing rigid First/Middle/Last
// boxes that break for Spanish double surnames, Hungarian name order,
// patients with no middle name, Mc/Mac variants, etc.
//
// Used by Patient, Physician, and Facility contact name fields. Each of
// those types keeps `firstName`/`lastName` (or `contactName`) as
// backward-compatible derived fields — always mirroring givenNames/
// familyNames — so the ~15 existing consumers across Worklist, report
// rendering, letterheads etc. that haven't migrated yet keep working
// unchanged. New code should read/write givenNames/familyNames directly.
// ─────────────────────────────────────────────────────────────

import type { Patient } from '@/types/case/Patient';

export interface PersonNameValue {
  namePrefix?: string;
  givenNames: string;
  familyNames: string;
  preferredName?: string;
  nameSuffix?: string;
}

/** Common US/UK/EU generational suffixes for the dropdown. "Other…" in
 *  the UI reveals free text for anything not on this list (professional
 *  credentials, less common generational markers, etc.) — never a
 *  restriction, just a shortcut for the common case. */
export const SUFFIX_PRESETS = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

/** True if a suffix value is empty or one of the preset options — i.e.
 *  the dropdown (not the free-text fallback) should be shown for it. */
export function isPresetSuffix(value?: string): boolean {
  return !value || SUFFIX_PRESETS.includes(value);
}

/**
 * Builds the display string used on wristbands/labels/report headers per
 * the medical-grade formatting rules: family name in caps, leads;
 * prefix/suffix dropped entirely (not clinically useful at the point of
 * identification, and wristbands have no room for them).
 */
export function formatIdentificationName(name: PersonNameValue): string {
  const family = name.familyNames.trim().toUpperCase();
  const given = name.givenNames.trim();
  return family && given ? `${family}, ${given}` : (family || given);
}

/** Ordinary display string — "Dr. Juan Carlos García López Jr." — for
 *  anywhere prefix/suffix should actually show (chart headers, staff
 *  directories), as opposed to the identification-only format above. */
export function formatFullDisplayName(name: PersonNameValue): string {
  return [name.namePrefix, name.givenNames, name.familyNames, name.nameSuffix]
    .map(p => p?.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Backward-compat bridge: given only legacy firstName/lastName (e.g. an
 * existing record created before this model existed), produces a
 * PersonNameValue with givenNames/familyNames populated from them. Used
 * when a form opens in "edit" mode against an old record — never loses
 * data, just maps it into the richer shape so the form has something to
 * show.
 */
export function fromLegacyName(firstName: string, lastName: string, opts?: { middleName?: string }): PersonNameValue {
  const given = opts?.middleName ? `${firstName} ${opts.middleName}`.trim() : firstName;
  return { givenNames: given, familyNames: lastName };
}

/**
 * Shared "which name fields does this patient actually have" resolver —
 * prefers the real givenNames/familyNames fields, falls back to the legacy
 * firstName/lastName bridge above, using the ordinary (not identification)
 * display format. File-by-file cleanup sweep: consolidates a duplicated
 * inline implementation that had been copy-pasted into both
 * CytologyQcQueuePage.tsx and SurgicalQaWorklistPage.tsx. Returns null for
 * a missing patient — never a fabricated placeholder; callers decide their
 * own fallback (e.g. the case id).
 */
export function resolvePatientFullDisplayName(patient: Patient | undefined | null): string | null {
  if (!patient) return null;
  if (patient.givenNames && patient.familyNames) {
    return formatFullDisplayName({ ...patient, givenNames: patient.givenNames, familyNames: patient.familyNames });
  }
  return formatFullDisplayName(fromLegacyName(patient.firstName, patient.lastName));
}
