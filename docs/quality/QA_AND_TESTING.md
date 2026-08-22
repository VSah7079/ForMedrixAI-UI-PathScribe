# PathScribe — Quality Assurance & Testing Guide

**Last verified:** August 2026. Covers two distinct things this folder
name could mean: how the *application itself* tracks clinical/
compliance quality (a real, built feature), and how *this codebase* is
tested (engineering QA). Both are real and both matter — kept together
here since "quality" means both to different readers of this folder.

## Part 1 — The application's own Quality Assurance feature

`/quality-assurance` — eight distinct compliance report groups, each
with a real, group-specific status vocabulary (not one fake shared
set) and a compliance-grade CSV export (notice/filters/requester/
record-count header, PHI-safe by construction — no patient name/MRN/
DOB, only case/accession identifiers):

| Group | Real status values |
|---|---|
| Deficiencies | Open, Pending Verification, Closed |
| Intraoperative Linkage | Pending, Merged |
| Discordance & Reconciliation | Concordant, Discordant |
| Countersign Turnaround | Pending, Countersigned |
| Credentialing Review (FPPE) | Active, Completed |
| Post-Finalization Drift | 4 real event names, audit-log-backed |
| Patient Match Review (MPI) | Needs Review |
| Management Reviews | Completed |

The permanent, complete historical record (every event, not just
open ones — the record meant to hold up under a CAP or similar
inspection) lives separately, at `/audit`, distinct from this working
queue.

Deficiencies specifically distinguish case-level from specimen-level
scope (`DeficiencyType.level: 'case' | 'specimen' | 'both'`) — not
every deficiency type applies at both levels, and the admin dictionary
enforces that.

## Part 2 — Testing this codebase

```bash
npm test              # Full suite (excludes firestore.rules.test.ts)
npm run test:rules    # Firestore security rules, run separately
npm run type-check    # Real strict-mode compile check, run separately from tests
```

See `../developer/GETTING_STARTED.md` for why `type-check` and `test`
need to run separately (esbuild's transform used by `vitest` is more
lenient than the project's real `tsconfig.json`), and for the specific
gotcha around React-hook tests needing the local `vitest` binary
directly.

### What "tested" means in this codebase

Real, working regression tests exist and are actively relied on — e.g.
`useDraftCache.test.ts` specifically covers rendering inside
`React.StrictMode`, because that's the exact condition that exposed a
real, confirmed bug (a redundant guard silently discarding a
successfully-fetched draft on every re-entry). Test count and pass
rate are tracked per-folder in each folder's own `README.md`, not
centrally — check the specific folder you're working in.

### Accessibility

WCAG 2.1 AA is a real, enforced standard in this codebase, not
aspirational — extensive remediation work has been done and verified
via live `axe` checks (not just static analysis) across most of the
app. Known, deliberately-deferred exceptions (mostly a specific
muted-gray color-contrast issue, `#6b7280`/`#475569`-class text) are
tracked as real Jira items, not silently ignored.

## Bug and gap tracking

**Bugs, dead-code findings, and open architectural questions are
tracked in Jira** (project `PS`, `formedrixai.atlassian.net`) — not in
a markdown file in this repo. If you find something during review that
needs a decision or a fix, check Jira for an existing ticket before
creating a new one; several past findings turned out to already have a
tracked ticket, or to already be fixed with the ticket just never
closed.

## Where to go next

- `../architecture/SYSTEM_ARCHITECTURE.md` — the real shape of the
  system this is testing.
- `../developer/GETTING_STARTED.md` — setup and coding conventions.
- `src/pages/README.md` and `src/services/deficiencies/README.md` —
  file-level detail for the QA feature itself.
