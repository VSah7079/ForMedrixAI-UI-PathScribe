# pages/LabelDesignerPage/

- **`LabelDesignerPage.tsx`** — the real, working drag-and-drop label
  designer. See `services/labelDesigner/README.md` for the full
  architectural account (why this is a new, parallel data model rather
  than a reuse of `components/TemplateBuilder/`'s own report-oriented
  node system; the real Enterprise/facility hierarchy and per-group
  lockdown policy).

**Real, direct correction — this file physically lives here but is no
longer a standalone, routed page.** First built with its own real route
(`/label-designer`) and a home-page tile; per direct follow-up ("Label
Designer isn't a tile, its a tab in configuration"), both were removed.
The component is now registered directly as the `'label_designer'` tab
inside `components/Config/System/index.tsx` — see that folder's own
`README.md` for the registration details. Left physically in `pages/`
rather than moved into `components/Config/System/` itself, since it is
still a real, complete page-level component (its own data fetching,
canvas, full layout), not a small, config-form-shaped section like its
sibling tabs — a real, deliberate judgment call, not an oversight.

**Real, honest, flagged convention gap**: uses inline `style={{...}}`
throughout, not this app's own established "no inline CSS, named classes
only" convention for Config-registered UI (see
`components/Config/System/README.md`'s own header). Found while auditing
README coverage, not yet reconciled.
