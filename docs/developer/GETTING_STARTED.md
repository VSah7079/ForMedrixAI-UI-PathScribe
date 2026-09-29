# PathScribe — Developer Getting Started

**Last verified:** September 2026. For the full setup steps (install,
`npm run dev`, build, every npm script), see the root
[`README.md`](../../README.md) — not duplicated here.
This doc is what the root README doesn't cover: conventions, testing
discipline, and the gotchas that aren't obvious from reading the code
cold.

## Read this first

Every folder in `src/` has its own `README.md`. Before touching a
folder you haven't worked in, read its README — it documents real,
non-obvious decisions (why something is structured the way it is, what
was tried and rejected, what's deliberately incomplete and why) that
you will not reliably infer from the code alone. `src/README.md` is
the index into all of them.

## Core conventions

> **Standing rules** (full text, examples, and the pre-delivery
> checklist in the repo-root [`CLAUDE.md`](../../CLAUDE.md)): no inline
> CSS, no business logic in components, and full international support
> on every change. The three bullets below are the short form; updated
> Sep 2026 to match, since earlier wording here was looser than the rule.

- **CSS**: real classes in `pathscribe.css` (`ps-*` naming). **No inline
  CSS declarations.** A genuinely per-instance value (a colour from
  props, a calculated dimension) is passed only as a CSS custom property
  that a real rule consumes: `style={{ '--ps-hue': color }}` with
  `.x { color: var(--ps-hue); background: color-mix(in srgb, var(--ps-hue) 9%, transparent); }`.
  Never `style={{ background: color }}`, and never colour strings built
  in JSX.
- **Service layer**: `I<Domain>Service.ts` interface +
  `mock<Domain>Service.ts` implementation. New domains should follow
  this pattern unless there's a real, specific reason not to (see
  `docs/architecture/SYSTEM_ARCHITECTURE.md` for when the pattern
  legitimately doesn't fit).
- **No business logic in components** (not just "not inline in JSX").
  Components render and dispatch. Filtering, resolution, permission
  checks, default-seeding, diffing, and save or audit sequencing belong
  in `src/services/` or `src/utils/`, pure where possible and tested
  directly, with dependencies passed in. This has been a recurring real
  fix, not a style nitpick: type-narrowing in particular can break
  silently when logic stays inline.
- **International support**: every user-facing string goes through
  `t()`, and every key goes into all five locale files
  (`src/i18n/locales/{en,fr,de,nl,ko}.json`) in the same change.
  `src/i18n/localeParity.test.ts` enforces parity project-wide; see
  [`src/i18n/README.md`](../../src/i18n/README.md) → "Setup,
  conventions, and enforcement".
- **Real errors, not silent failures**. `ConcurrencyConflictError` and
  similar are meant to be thrown and handled visibly, not swallowed.

## TypeScript — a real, deliberate setting worth knowing up front

`tsconfig.json` has `"strict": false`, and every individual strict
sub-flag (`strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`,
`strictPropertyInitialization`) is explicitly disabled too, not just
inherited as off. TypeScript is **not** catching null/undefined or
implicit-`any` issues in this codebase — don't assume it is.
`noUnusedLocals`/`noUnusedParameters` **are** enabled, and are real
checks worth running (`npm run type-check`) — they catch a
surprising amount on their own.

## Testing

```bash
npm test              # Full suite (excludes firestore.rules.test.ts)
npm run test:rules    # Firestore security rules tests, run separately
npm run type-check    # Always run separately from tests — see below
```

**Run `type-check` separately from `test`.** `vitest run` uses
esbuild's TypeScript transform, which is more lenient about
`lib`/`target` settings than the project's real `tsconfig.json`. A
green `vitest run` is not proof a file compiles under the project's
real settings — this has caused real, confirmed false negatives before.

**React-hook tests** (in `src/pages/SynopticReportPage/hooks/__tests__/`)
need the local `vitest` binary directly
(`node node_modules/vitest/dist/cli.js run <path>`), not `npx vitest`
— `npx` can resolve to a globally-installed vitest that can't see
`happy-dom`. See that folder's own `README.md` for the full
unit/integration split and several real, documented gotchas
(mocking classes used with `new`, `window.prompt` in `happy-dom`,
test fixtures that can silently drift from the real type).

## Skills / build tooling for generated files

If you're generating Word docs, PDFs, PowerPoint, or Excel files as
part of a task, check for a matching skill first (`docs`, `pdf`,
`pptx`, `xlsx` conventions) rather than hand-rolling generation —
this project has established, working patterns for each.

## Real, known gaps worth knowing about before you hit them

- **Concurrency control exists but isn't universal** — most save paths
  correctly pass a version for conflict detection; a few don't. See
  `docs/architecture/SYSTEM_ARCHITECTURE.md` and Jira PS-71.
- **Two `ServiceResult` conventions coexist** — an older
  `{success, data, error}` shape (the `aiIntegration/` subsystem only)
  and a newer `{ok, data, meta, error}` shape (everything else).
  Jira PS-67.
- **Bug/gap tracking lives in Jira**, project key `PS`
  (`formedrixai.atlassian.net`) — not in a markdown file in this repo.

## Where to go next

- `../architecture/SYSTEM_ARCHITECTURE.md` — the real shape of the
  system.
- `../quality/` — testing philosophy and QA workflows in more depth.
- `src/README.md` — the full, per-folder documentation index.
