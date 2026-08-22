# Workload Tracking & Charge Capture — Scoping Notes

Not started. Written up for a future session, per the decision to scope
this out now rather than build it while cleanup work and the legal query
are still in flight.

This covers two related but genuinely separate threads. Pete's own
framing, worth repeating here since it's the reason they're split:
*"the RVU has to be solved regardless of the billing."*

---

## Thread 1 — Real workload (wRVU) tracking, independent of billing

**Why this is separate from Thread 2**: RVU/workload numbers have real,
standalone value for the Contribution dashboard (accurate productivity
metrics, institutional targets, honest peer comparison — see the
`showPeerAveragesToPathologists` toggle already built) regardless of
whether AI-driven charge capture ever ships. This thread has **no AI
involved and no billing-adjacent liability** — it's a real data lookup,
not an inference.

**Current state**: `ProductivityTab.tsx`'s RVU numbers are still 100%
demo data (`demoRvuByMonth`, `demoRvuTile`), clearly labeled
(`DemoDataBadge`) since the earlier real-data-audit pass. Case counts
are real; RVU is not.

**Why RVU is harder than case counts**: it requires knowing which CPT
code(s) apply to a case, which case counts alone don't need.

**Proposed approach, roughly in order of how fast each is to build safely**:

1. **A real, small, curated `Code_Map_Table`** — CPT code → wRVU weight,
   starting with the handful of codes that cover most anatomic pathology
   work (88302–88309 surgical pathology levels, 88312–88319 special
   stains, 88341/88342 IHC). Manually curated and versioned, not
   AI-maintained — matches the schema shape already sketched in the
   original spec (`code_id`, `procedure_code`, `work_rvu`,
   `effective_date`/`expiration_date`).
2. **Manual code selection at sign-off** — a pathologist or coder picks
   the applicable code(s) when finalizing a case, same as most labs
   already do without AI today. Zero inference risk, fastest to build,
   good first real data source.
3. **Optional, later enhancement**: deterministic *rule-based* suggestions
   from data PathScribe already has structured, not free text — specimen
   count, block count, stains/IHC actually ordered. E.g. "1 specimen +
   2 special stains ordered" suggests a specific code combination for the
   pathologist to confirm. This is meaningfully different from Thread 2's
   AI/NLP approach — it's simple counting logic against structured order
   data, not language-model inference from narrative report text — but
   it's still a suggestion a human confirms, never automatic.
4. Wire the real wRVU total into `ProductivityTab.tsx`'s `RvuTile`,
   replacing `demoRvuByMonth`/`demoRvuTile` — same pattern as
   `computeMonthlyCaseCounts()`, summing real wRVU values per month
   instead of just counting cases.

**Not gated on the attorney/compliance review** — this is real data
lookup against a known table, not AI-suggested billing codes. Worth
confirming that read is still correct once actual legal feedback comes
back, but nothing here should need to wait on it to *start*.

---

## Thread 2 — Smart Capture Layer prototype (AI-assisted, billing-adjacent)

Pete's refined scope, replacing the original spec's broader "Automated
Mode" idea:

- AI-driven suggestion drawer, shown at sign-off.
- **Mandatory** pathologist sign-off — no automated/bypass mode at all.
  This removes the single riskiest piece of the original spec (current
  research specifically flags AI-assisted claims as facing higher payer
  audit scrutiny right now).
- Outputs a structured HL7/FHIR payload to the institution's own LIS/RCM
  — PathScribe never submits a claim or touches financial settlement.
- Product positioning: "Intelligent Charge Capture & Workload
  Assistant," explicitly not a billing platform.

**Gated on, before any real build work starts**:
1. IP attorney's response to the compliance query already sent
   (vendor liability, False Claims Act exposure, the 2026 AI-augmented
   CPT documentation requirement, BAA/PHI handling for the extraction
   pipeline, contract language).
2. Input from Pete's sister-in-law (recently retired Medical Claims
   Specialist) — real-world claims-processing perspective the attorney
   won't necessarily have (how claims actually get denied in practice,
   what documentation payers actually scrutinize).
3. The attorney may also refer out to healthcare-specific regulatory
   counsel if this falls outside their usual scope — worth asking
   directly rather than assuming either way.

**If/when this does get built**: a prototype demonstrating the process
doesn't require a real payer or a real claim to be genuinely useful — it
can run entirely on Pete's own decision to build a *demonstrable*
version first ("we can always pull it out, or hibernate it"). Any
prototype UI should carry clear, visible **"Prototype — not yet
compliance-reviewed"** labeling throughout, same honest-disclosure
pattern as the `DemoDataBadge` used elsewhere in this codebase — so
there's no risk of this looking finished/production-ready before it
actually is.

**Real architectural synergy with Thread 1**: both threads need a real
CPT-to-wRVU mapping. Building Thread 1's `Code_Map_Table` first isn't
wasted work if Thread 2 later ships — it's the same table, reused.

---

## Suggested order, when picked back up

1. Thread 1, steps 1–2 (real table + manual code selection) — safe,
   fast, immediately valuable, unblocks honest RVU numbers on the
   dashboard regardless of anything else.
2. Wait for attorney + sister-in-law input before touching Thread 2 at
   all.
3. Thread 1, step 3 (rule-based suggestions) and Thread 2's suggestion
   drawer could plausibly be designed together later, once Thread 2 is
   actually cleared to start — they're architecturally related (both are
   "suggest, human confirms" patterns) even though only one of them is
   billing-adjacent.
