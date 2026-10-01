# services/signatures/

Batch 345 (PS-60 follow-up). **The signature records: one per signature applied to a case.** Each record holds:
- who signed;
- what the signature did: `signed`, `finalized` or `released_for_countersign`;
- what it was for: case sign-out, countersignature, synoptic or report finalisation, cytology sign-out, autopsy PAD/FAD;
- when;
- how the signer was confirmed. The `evidence` comes from `services/auth/signatureEvidence.ts`: method, confirmation time and, for SSO, the account and a SHA-256 of the provider's ID token. The token itself is never stored.

**Append-only:** records are never edited or deleted.

| File | What it is |
|---|---|
| `ISignatureRecordService.ts` | `SignatureRecord`, `SignatureOutcome`, `SignatureRecordLink` (report version, autopsy snapshot + tier, cytology sign-out record), the service interface |
| `mockSignatureRecordService.ts` | Browser-storage stand-in. Exported from `@/services` as `signatureRecordService`. |

**Who writes records:** `signatureGate.commit()` (`services/auth/signatureEvidence.ts`), once the signed state is saved. Nothing else does.

**Production:** a SQL Server table owned by the API server, written in the same transaction as the signed change, with `verifiedBy: 'server'` (`docs/architecture/AUTHENTICATION_OIDC.md` §5.4–§5.5).

**Not yet:** no screen lists these records. The case's audit trail has a matching *Signature recorded* entry.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
