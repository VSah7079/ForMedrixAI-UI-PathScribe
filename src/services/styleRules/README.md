# services/styleRules/

Batch 367 (PS-74): the check behind standing rule 1, **no inline CSS**.

- **`inlineStyleAudit.ts`** reads a `.tsx` file's structure (TypeScript's parser) and reports:
  - a `style={{ … }}` key that isn't a custom property (`--name`), or a spread of an unnamed object;
  - on a DOM element, `style={x}` / `style={f(…)}` unless the name ends in `Vars`/`Var`, the convention for helpers that return only custom properties (it looks through `?:`, `&&`, `??` and `as`);
  - a helper named `…Vars` whose returned object sets a real CSS property;
  - a colour built from a string: `${c}22`, `c + '18'`, `rgba(${…})`.

  A `style` prop on a component that isn't an object literal is left to that component; its own DOM elements are checked.
- **`inlineStyleAudit.test.ts`**: what it finds and what it accepts.
- **`inlineCss.guard.test.ts`**: runs the check over every `.tsx` file in `src/`, with no exception list, and checks it would catch an inline style coming back.

**How to comply:**
- Put the look in a `pathscribe.css` class.
- Pass per-instance values as custom properties.
- For a colour, pass `--ps-hue` and derive tints with `color-mix(in srgb, var(--ps-hue) N%, transparent)`. N is the old hex alpha as a percentage (`18` ≈ 9.4%, `22` ≈ 13.3%, `33` = 20%, `66` = 40%).

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
