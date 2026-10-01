// vitest.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix for a real, long-standing gap: no vitest config existed at
// all, so vitest ran with zero alias resolution while tsc (and
// whatever real bundler builds this app) both already read
// tsconfig.json's own "paths" (@/*, @components/*, @pages/*, etc.).
// Any test file — or any source file a test transitively imports —
// using a "@/..." import failed under vitest with "Cannot find
// package" or "Failed to resolve import", even though the same code
// was genuinely correct and tsc-clean.
//
// resolve.tsconfigPaths reads tsconfig.json's own real "paths"
// directly (native to this Vite version — no extra plugin dependency
// needed), so the alias list lives in exactly one place — adding or
// changing an alias in tsconfig.json is automatically picked up here
// too, never needing a second, hand-maintained list kept in sync by
// hand.
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Real fix for a real, local problem: a leftover staging folder from
    // an old update extraction (update-267-277/) sitting inside the
    // project root has its own *.test.ts files, but not every file those
    // tests import — so vitest was picking them up as if they were live
    // source and failing with "Cannot find module." That folder was never
    // part of the app; it's just where an old zip got unpacked. Rather
    // than rely on it being deleted or moved by hand (which can fail if
    // something has a file in it open/locked), exclude it here — plus
    // vitest's own normal defaults, which setting this list overrides
    // rather than extends.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'update-267-277/**',
    ],

    // Real fix for a real, reported flake — not a code regression.
    // A full-suite run reported 5 unrelated files (mockCytologyQaReportService,
    // mockIntraoperativeService, processInboundStainingInstrumentStatusEvent,
    // resolveStaffByQuickAuthPin, processLegacyRecordImport) failing on
    // vitest's own default hook/test timeouts (10000ms/5000ms) under full
    // parallel load. Verified directly, not assumed: every one of those
    // same files passes cleanly and quickly (42/42 tests, ~9.6s total) when
    // run in isolation — so this is real worker/CPU contention as the suite
    // has grown past 500 files and 4600+ tests, each running its own async
    // beforeAll (mock-service seeding, dynamic imports), not a logic bug in
    // any of the affected files. Raising the global defaults gives real
    // headroom under parallel load without masking a genuine hang — a test
    // that's actually stuck still times out, just at a threshold that
    // matches this suite's real current size instead of vitest's own
    // one-size-fits-all default from when the suite was much smaller.
    //
    // Batch 370 follow-up: raised again to 30 s. On a Windows laptop running
    // the full suite (Pete, Sep 28, 2026), six tests timed out at 15 s,
    // always the FIRST test in a file that imports the whole services
    // barrel or scans every source file. Measured here with only those six
    // files running, the slowest took 11.4 s (templateService governance), so
    // 15 s left no headroom on a slower machine under full parallel load.
    // Seven test files also set their own 10–20 s limits per test, which
    // override this one; those were removed so the 30 s limit applies.
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
