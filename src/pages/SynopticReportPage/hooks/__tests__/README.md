# Testing the SynopticReportPage hooks

192 tests across 8 of the 10 hooks in this directory (`useMicroscopicEntry.ts`
and `useReleaseBufferCountdown.ts` — both new, Aug 2026 — don't yet have a
dedicated test file; see "Test files" below). This is the first React-hook
test coverage in this codebase — the existing suite (~520 tests before
this) is entirely non-React: services, utilities, calculations, running in
Node with no DOM. Setting these up required real, non-obvious
infrastructure work, documented here so it isn't rediscovered the hard way.

## Test files

- `useAmendmentWorkflow.test.ts`
- `useCassetteScanVerification.test.ts`
- `useGrossingCompletion.test.ts` (referenced below, "gotchas" section)
- `useLisIntegration.test.ts` (has an integration test — see below)
- `useOrchestratorDraft.test.ts`
- `useReportGeneration.test.ts` (referenced below, "gotchas" section)
- `useSignOutWorkflow.test.ts`
- `useSpecimenBlockManagement.test.ts` (has an integration test — see below)

## Running the tests

**Use the local `vitest` binary directly, not `npx vitest` or `npm test`
alone if you're running just this folder:**

```bash
node node_modules/vitest/dist/cli.js run src/pages/SynopticReportPage/hooks/__tests__/useLisIntegration.test.ts
```

`npx vitest` resolves to a **globally-installed** `vitest` on at least one
real dev machine this was built against, which can't see locally-installed
dependencies like `happy-dom`. `node node_modules/vitest/dist/cli.js`
sidesteps that entirely, since it's an explicit path into the project's
own `node_modules`.

**Always run the actual type-check separately from the test run:**

```bash
npm run type-check
```

`vitest run` uses esbuild's TypeScript transform, which is more lenient
about `lib`/`target` settings than the project's real `tsconfig.json`.
`Array.prototype.at()` passed `vitest run` cleanly every time in this
codebase's dev sandbox but failed the real `tsc --noEmit` on a machine
with an older `lib` target — twice, in two different test files, before
this became a hard rule. **A green `vitest run` is not proof a test file
compiles under the project's real settings.** Run both.

## Setup

`@testing-library/react`, `@testing-library/jest-dom`, and `happy-dom`
were added as new dev dependencies. `happy-dom` is enabled **per test
file**, not globally:

```ts
// @vitest-environment happy-dom
```

at the very top of the file, above the imports. This is deliberate — the
existing ~520 tests are pure Node-environment tests with no DOM
dependency, and switching the global `vitest` config to a DOM environment
would have been an unverified risk to a suite that already worked. The
per-file override touches nothing outside the files that actually need it.

**`renderHook` does not auto-unmount between tests.** Without a global
`setupFiles` entry registering cleanup (none exists in this project),
every `renderHook()` call in a test file stays mounted until the file
finishes. For most hooks this doesn't matter. It matters a lot for any
hook that registers a real `window.addEventListener` inside a `useEffect`
(`useOrchestratorDraft` is the one hook in this directory that does) —
every earlier test's listener stays attached and fires again on the next
`dispatchEvent`, and the count on your assertion silently becomes "how
many tests ran before this one," not "1." If a hook under test touches
`window`/`document` listeners, add:

```ts
afterEach(() => { cleanup(); });
```

(`cleanup` imported from `@testing-library/react`.)

## The unit / integration split

Every test file follows the same two-part structure:

**Unit tests** mock every external service the hook touches
(`vi.mock('@/services/...')`), and verify the hook's *own* logic in
isolation — argument shapes, conditional branches, state transitions. Fast,
deterministic, no dependency on what a mock service happens to do today.

**Integration tests** use the *real*, unmocked mock services
(`mockCaseService`, `mockLisAmendmentNoticeService`, etc. — these are the
app's actual data layer in this frontend-only demo, not test doubles) to
verify the hook genuinely wires into the app's service layer, not just
that it calls a function with the right name. `useLisIntegration.test.ts`
and `useSpecimenBlockManagement.test.ts` both have one — the latter's
integration test operates on a real, existing mock case
(`S26-4402-COLON-RES`) and explicitly restores its original state
afterward, so repeated runs don't leave shared mock data mutated.

Not every hook has an integration test. `useReportGeneration`
deliberately doesn't — there's no real, safe-to-call-in-CI service behind
`OrchestratorEngine` (it makes real AI calls), so there's nothing to
integration-test against; the file's header explains this explicitly.

## A few real mistakes, left visible rather than quietly fixed

These are documented in the relevant test files' comments, not just this
README, because they're exactly the kind of thing worth knowing before
you hit them yourself:

- **Mocking a class used with `new`** requires a `function`, not an arrow
  function — `vi.fn().mockImplementation(() => ...)` cannot be
  constructed with `new` (a JavaScript rule, not a `vitest` quirk).
  `useReportGeneration.test.ts`'s `OrchestratorEngine` mock hit this on
  the first attempt; every single test failed with the same root cause
  before it was found.
- **`window.prompt` isn't implemented by `happy-dom`.** `vi.spyOn(window,
  'prompt')` requires the property to already exist as a function; direct
  assignment (`window.prompt = vi.fn()`) is what actually works.
  (`useGrossingCompletion.test.ts`)
- **`ConcurrencyConflictError`'s real constructor** is
  `(caseId, expectedVersion, actualVersion)`, not just `(actualVersion)` —
  checked against the actual class before writing more than one test
  using it wrong.
- **Test fixtures can invent fields that don't exist on the real type.**
  `handleUpdateBlock`'s `changes` parameter was originally typed
  `Partial<any>`; once properly typed as `Partial<HistologyBlock>` during
  the type-safety pass, `tsc` immediately flagged a made-up field
  (`priorityOverride`) in an existing test that had never actually
  existed on the real data model. This is exactly the value proper typing
  adds to test fixtures, not just production code — it catches drift
  between what a test asserts and what the real object can actually be.
- **`setCaseData`'s argument isn't always the raw patch.** Some call
  sites use `setCaseData({ ...caseData, ...patch })` (a merged object);
  others use the `prev => ({ ...prev, ... })` updater-function form.
  Asserting against `setCaseData.mock.calls[0][0]` gives a different
  shape depending on which pattern the real code uses — check the actual
  source before writing the assertion, not after debugging why it's
  wrong.

## Batch 363 (PS-72): patient data tagged for screenshot redaction

`useSignOutWorkflow.test.ts` and `useSpecimenBlockManagement.test.ts` expect `showToast(message, 'info', { containsPhi: true })` for toasts that name the case.
