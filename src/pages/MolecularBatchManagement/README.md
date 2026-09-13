# pages/MolecularBatchManagement/

Real, pre-existing feature, per direct guidance: "I want a separate Batch
Management as it will need to associate QA to the specimens in their test
run locations. Using the engine to translate."

- **`MolecularBatchManagementPage.tsx`** — real, read-only view of molecular
  instrument QC runs and the real cytology specimens associated with each.
  Every real batch shown, and every real specimen's own association to
  one, comes from `processInboundMolecularBatchEvent.ts`
  (`services/hl7/`) — this page never writes anything, matching
  `hpvAbnormalFlag`/`hpvReferenceRange`'s own established "never set by
  manual UI entry" posture for molecular-platform-sourced data. Backed by
  `mockMolecularQcRunRecordService` (`services/cytology/`,
  `MolecularQcRunRecord`) — deliberately its own, separate real data model
  from this app's own `MolecularBatch` (`services/molecular/`), confirmed
  directly rather than assumed before either was built (see
  `services/molecular/README.md`'s own Phase 1 account): this pipeline's
  own real job is QC-run association feeding MOL-QA-02/04's
  `MolecularQcRunRecord` shape, a genuinely different real payload from
  `MolecularBatch`'s own §4.2 well-level Ct/RFU result reporting.

**Real, direct correction (Sep 2026)**: no longer its own standalone
home-page tile or route (`/molecular-batch-management`, removed). Now
rendered as the "QC & Specimen Association" tab of
`pages/MolecularWorkcenterPage/MolecularWorkcenterPage.tsx` — see that
folder's own README, and `services/molecular/README.md`'s own Phase 21,
for the full account of why these two real, related pipelines now share
one home while staying two, separate real data models.

**Real, found gap, fixed alongside this move**: this folder had no README
at all before this pass, despite being a real, working, pre-existing page
— found while updating `pages/README.md`'s own subfolder index for the
Phase 21 restructuring.
