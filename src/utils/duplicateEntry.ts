// src/utils/duplicateEntry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared helper for the "duplicate this entry, edit it slightly,
// save as new" pattern used across PathScribe's config dictionaries
// (Stain Types, Sectioning Protocols, Physicians, Specimen Categories,
// and others following the same shape). Confirmed directly before
// building this: every dictionary's own add() method already takes
// Omit<T, 'id' | ...system fields> — never a raw T — so the real,
// existing add() call sites don't need to change at all; only each
// section's own modal-open state needs a way to say "prefill from this
// entry, but the eventual save is an add(), not an update()".
//
// This helper handles the prefill half: given an existing entry, return
// a copy with its display-name field suffixed, so two entries never
// look silently identical in a list right after duplicating — the
// whole point of "edit it slightly" is that the person notices
// something changed before saving. No dictionary enforces name
// uniqueness today (confirmed directly against several), so this is a
// real UX nudge, not a workaround for a validation error.
// ─────────────────────────────────────────────────────────────────────────────

export function prepareDuplicate<T extends object>(
  source: T,
  nameKey: keyof T = 'name' as keyof T,
): T {
  const currentName = source[nameKey];
  if (typeof currentName !== 'string' || !currentName.trim()) return { ...source };
  return { ...source, [nameKey]: `${currentName} (Copy)` };
}

// ─────────────────────────────────────────────────────────────────────────────
// preparePersonDuplicate — companion to prepareDuplicate() for
// person-shaped dictionary entries (currently: Physicians, PS-73).
// Confirmed directly before building this as a separate function
// rather than a prepareDuplicate option: a physician record is a real
// individual, not a reusable config item. prepareDuplicate's
// "(Copy)"-suffix-the-name default doesn't fit — a physician clone
// suffixed onto a full copy would just be the same person with a fake
// name (nonsensical), and would immediately collide with the section's
// own NPI/physicianCode uniqueness validation since those would be
// copied verbatim too. What's actually useful when duplicating a
// physician is a starting TEMPLATE: keep the organizational context
// (specialty, facility affiliations, contact preference) so staff
// aren't re-picking that per physician, but clear every
// person-specific/identity field so nothing in the clone is ever
// silently attributed to the wrong real person.
//
// `personFields` is explicit and required, not inferred — this is a
// deliberate, narrow exception for person-shaped records, not a
// generalized "clear some fields" mechanism other dictionaries should
// reach for. Only string fields are ever cleared (to '' — matching
// every dictionary's own "" convention for an absent optional value,
// e.g. Physician.npi); non-string fields (arrays, booleans, other
// scalars) are left exactly as prepareDuplicate leaves them — callers
// needing to reset e.g. a status enum do that explicitly at the call
// site, same as PhysiciansSection.tsx's own handleClonePhysician does
// for `status`/`autoCreated`.
// ─────────────────────────────────────────────────────────────────────────────
export function preparePersonDuplicate<T extends object>(
  source: T,
  personFields: readonly (keyof T)[],
): T {
  const clone: T = { ...source };
  for (const key of personFields) {
    if (typeof clone[key] === 'string') {
      (clone as Record<keyof T, unknown>)[key] = '';
    }
  }
  return clone;
}
