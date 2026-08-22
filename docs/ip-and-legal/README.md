# PathScribe — IP & Legal

This folder is for formal IP inventory, copyright notices, software
asset disclosures, third-party license audits (SBOM), and patent
drafting references.

**What's deliberately not in this document:** specific IP strategy,
copyright registration status, equity structure, or contract terms.
That content belongs with Pete and ForMedrixAI LLC's own attorney, not
drafted here with false authority — this is a placeholder and index,
not a substitute for real legal counsel.

## What's real and already done, for context

Substantial pre-copyright-deposit codebase hardening was completed
this session, specifically because it matters for a clean deposit:

- A comprehensive dead-code sweep across `services/` and `components/`
  (two confirmed-dead files removed: `ClaudeProvider.ts`, a near-
  verbatim duplicate never actually used; `PatientMatchReviewSection.tsx`,
  a stale copy left behind by an incomplete move).
- A hardcoded third-party API key (UMLS) found and removed from source,
  with the key itself rotated.
- Every folder in `src/` now has its own `README.md` — 169 folders,
  programmatically verified for coverage.

## What's a real, concrete, buildable task if wanted

A software bill of materials (SBOM) / third-party license audit is a
genuinely mechanical, checkable task against the real `package.json` —
ask directly if this would help, rather than leaving it as an
unaddressed gap in this folder indefinitely.

## Legal entity name

**ForMedrixAI LLC** — one word, no space, capital M. This exact form
applies in code, copyright notices, and legal/IP filings.
