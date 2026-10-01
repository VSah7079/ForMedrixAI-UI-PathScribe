// src/utils/validateUnique.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, shared helper for name/code uniqueness checks across PathScribe's
// config dictionaries and crosswalk-style mapping tables. Two real,
// confirmed needs this serves:
//
// 1. Simple dictionary name uniqueness (Stain Types, Sectioning
//    Protocols, Quick-Order Macros, and others following the same
//    shape) — per direct request: two entries with the same name
//    genuinely confuses staff picking from a list. Case-insensitive,
//    matching the comparison convention already established elsewhere
//    in this codebase (e.g. the stain/protocol spreadsheet import's own
//    name-match logic, services/orderIntake's own crosswalk lookup).
//
// 2. Crosswalk entry uniqueness — clientId + externalCode together, not
//    externalCode alone, since two different client feeds can validly
//    use the same code string to mean different things. This closes a
//    real, live risk: mockOrderIntakeService.ts's own resolveOrder()
//    logic does `CROSSWALK.find(x => x.clientId === ... && x.externalCode
//    ... === ...)` — .find() silently returns whichever colliding entry
//    happens to come first, which can mis-map a real incoming specimen
//    to the wrong dictionary entry. This validator uses the exact same
//    case-insensitive comparison as that real lookup, so what's blocked
//    here matches what would have been ambiguous there.
//
// Excludes the entry's own id when editing, so saving an existing entry
// without changing its name/code never falsely flags itself.
// ─────────────────────────────────────────────────────────────────────────────

export function findDuplicate<T extends object>(
  entries: T[],
  candidate: Partial<T>,
  keys: (keyof T)[],
  excludeId?: string,
  idKey: keyof T = 'id' as keyof T,
): T | undefined {
  return entries.find(existing => {
    if (excludeId && existing[idKey] === excludeId) return false;
    return keys.every(key => {
      const a = candidate[key];
      const b = existing[key];
      if (typeof a === 'string' && typeof b === 'string') {
        return a.trim().toLowerCase() === b.trim().toLowerCase();
      }
      return a === b;
    });
  });
}
