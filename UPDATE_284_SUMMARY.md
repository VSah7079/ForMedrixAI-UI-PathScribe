# Update 284 — Favicon: dark tile instead of washing out on light tabs

## What changed

The browser tab icon was rendering pale/washed-out — the FA mark had no
background of its own, so on a light-colored tab it nearly disappeared
(matches your screenshot).

Gave it a dark rounded-square tile (`#0b1120` — the same dark navy already
used as the app's `theme-color` in `index.html`, so it matches the color
Android/mobile browsers already tint their chrome with) behind the FA/DNA
mark, at every size that gets used:

- `public/favicon.ico` — regenerated as a real multi-size ICO (16/32/48px),
  each with the dark tile.
- `public/favicon.svg` — this is the one modern browsers (Chrome, the one
  in your screenshot) actually use, since `index.html` lists it first. The
  old file was a ~250KB hand-traced vector path with no background at all.
  Replaced it with a small, simple SVG: a dark rounded rect drawn natively,
  plus your FA artwork embedded on top — same look, about 1/5th the file
  size, and no longer transparent-background-only.
- `public/pathscribe-icon-180.png` (the iOS/apple-touch-icon) — updated to
  match, so a saved home-screen icon looks consistent with the tab icon
  instead of the old white-background version.

**One honest limitation, not new — already called out in `index.html`'s own
comment before I touched anything**: at 16px (the smallest real tab size in
most browsers), the DNA-helix and circuit-trace fine detail is too fine to
read no matter what background it's on — it was already documented as
needing "a simplified mark... where fine detail cannot survive." I did not
have a simplified glyph to work from, so 16px still shows a soft colored
blob rather than crisp detail — just now a colored blob on dark instead of
a pale one on white, which is a real improvement but not full legibility.
If you want it sharper at that smallest size, the real fix is a genuinely
simplified mark (e.g., just the bold "F"/"A" letterforms, no DNA or circuit
lines) — that's a design task, not something I can safely auto-derive from
the detailed artwork without risking a worse result.

## Validation

- `npx tsc --noEmit -p .`: clean (no source files touched, only `public/`
  assets).
- No tests reference favicon files, so the full suite is unaffected.

## Files changed

- `public/favicon.ico` (replaced)
- `public/favicon.svg` (replaced)
- `public/pathscribe-icon-180.png` (replaced)
