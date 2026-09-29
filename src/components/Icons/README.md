# components/Icons/

Shared SVG icon components, barrel-exported.

## Files

- **`Icons.tsx`** — Icon components (Sun, etc.), shared `IconProps` type
  (color/size/style). No issues.
- **`index.ts`** — Barrel export (`export * from './Icons'`). No issues.

## Notes

- No issues. Correctly the single shared home for icons — confirmed no
  other file defines its own local icon set duplicating this.

## Batch 367 (PS-74): no inline CSS

`Icons.tsx`: the remaining inline styles moved into `pathscribe.css` classes. Per-instance values (sizes, positions, a colour) are passed as custom properties, and colours are derived with `color-mix()` from `--ps-hue` instead of hex strings built in JSX. The browser checks are listed in the Batch 367 changelog (`src/i18n/README.md`). The app-wide check is `services/styleRules/inlineCss.guard.test.ts`.

The icons no longer take a `style` prop (no caller passed one); colour and size stay attributes.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
