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
  },
});
