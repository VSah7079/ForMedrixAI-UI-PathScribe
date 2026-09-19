# PathScribe Update 263 — PS-288: Close the device-binding gap

Direct follow-up, per "the monitors showing related work... to be done
after the individual workstations were built" — confirming PS-288
(Enterprise Laboratory Operations Dashboard Engine, the five wall-mounted
department dashboards, fifth and final of the confirmed PS-284→288
sequence) as the right target, and closing the one concrete gap in its
own device-registry disclosure: `DisplayProfile.deviceToken` was
admin-settable in `DisplayProfilesSection.tsx` but was never once
consulted anywhere in the actual kiosk binding flow — any browser could
bind to any wall display purely by picking its friendly name from a
dropdown, so a token an admin deliberately recorded for a specific
physical display did nothing at all.

## What was closed

`pages/FacilityOpsDashboard/FacilityOpsDashboardPage.tsx`'s own
`ProfileSetup` (the unbound "Bind This Display" screen) now consults the
selected profile's own `deviceToken`:

- A profile with a `deviceToken` recorded now shows a second, real
  confirmation step — the operator must type that exact token before
  the bind completes. A wrong entry shows an inline error and blocks
  binding; "Back" returns to the dropdown without binding.
- A profile with **no** `deviceToken` set still binds straight from the
  dropdown, exactly as before — no regression for admins who chose not
  to record one.

## What this is — and, just as importantly, isn't

This is **not** real physical hardware verification. No MAC/IP a
browser can actually read is ever compared — this environment has no
way to do that, and never claims to. What it closes is narrower and
concrete: the recorded `deviceToken` field went from "captured but
completely unused" to "the one thing a person binding a kiosk to this
profile now has to actually know." That's the real, disclosed gap
worth closing here — the larger "no real device binding exists"
limitation (`services/facilityOpsDashboard/README.md`'s own honest
scope-cut list) remains true and remains disclosed.

## Files changed

- `src/pages/FacilityOpsDashboard/FacilityOpsDashboardPage.tsx` —
  `ProfileSetup`'s new token-confirmation step.
- `src/pathscribe.css` — `.ps-opsdash-setup-token-error`,
  `.ps-opsdash-setup-token-actions`, `.ps-opsdash-btn-secondary`,
  `.ps-opsdash-btn-primary`.
- `src/i18n/locales/{en,fr,de,nl,ko}.json` — 5 new
  `facilityOpsDashboard.confirmToken*` keys, verified identical across
  all five locales (854 leaf keys each, +5).
- `src/i18n/README.md` — new running-log entry.
- `src/services/facilityOpsDashboard/README.md`,
  `src/pages/FacilityOpsDashboard/README.md` — documented the closed
  gap in both places.
- `src/pages/FacilityOpsDashboard/FacilityOpsDashboardPage.test.tsx`
  (new, 3 tests) — no render test existed for this page's binding step
  before this pass. Covers: no-token profiles bind unchanged,
  token-bearing profiles block on a wrong token and bind on the right
  one, and "Back" returns to the dropdown without binding.

## Validation

- **`npx tsc --noEmit -p .`**: clean, zero errors.
- **`npx vitest run --exclude firestore.rules.test.ts`**: **474/474
  test files (+1), 4145/4145 tests (+3) passing, zero failures.**

## Next

This closes the disclosed device-binding gap on PS-288 to the scope
above. Real, hardware-verified device binding (MAC/IP-based kiosk
assignment enforced server-side) remains blocked on the same
still-unbuilt Interface Engine backend (PS-291) that PS-290's own
consult-token work is blocked on.
