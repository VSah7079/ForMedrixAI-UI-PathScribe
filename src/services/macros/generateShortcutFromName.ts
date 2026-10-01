// src/services/macros/generateShortcutFromName.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct reminder: "no business logic in the UI code."
// Extracted out of MacroPanel.tsx's own Word-import adapter.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Real, per direct guidance ("load them into personal macros"): a
 * real, imported AutoText entry's own name (e.g. "Normal Colon") isn't
 * a valid ;shortcut on its own — MacroPanel's own save validation
 * requires a real ';'-prefixed, non-colliding trigger. Sanitizes and
 * deduplicates against every real, currently-existing shortcut, so an
 * import never silently creates two macros sharing the same trigger
 * (which would make ;-expansion in the editor genuinely ambiguous).
 */
export function generateShortcutFromName(name: string, existingShortcuts: Set<string>): string {
  const base = ';' + name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  let candidate = base.length > 1 ? base : ';imported';
  let n = 2;
  while (existingShortcuts.has(candidate)) {
    candidate = `${base}${n}`;
    n++;
  }
  return candidate;
}
