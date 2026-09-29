# components/Signing/

Batch 344 (PS-60 follow-up): confirming who is signing, at the moment of signing. Before this, the sign-out and finalize screens asked for a password and never checked it. The pre-finalisation panel accepted any three characters, and cytology sign-out and the autopsy PAD/FAD signatures asked for nothing.

| File | What it does |
|---|---|
| `SignerConfirmationFields.tsx` | The fields: "Signing as …", then username + password (demo password sessions; the username only on the first signature of a sign-in session), or a note that the organisation's sign-in page will open (SSO sessions), or why signing isn't available. Shows the error from the last attempt. `variant="inline"` for the pre-finalisation signing bar. |
| `SignatureConfirmModal.tsx` | A small modal around the fields, for actions that had no confirmation: cytology sign-out, autopsy PAD and FAD. |

**Where the logic lives:**
- **State:** in `hooks/useSignerConfirmation.ts`.
- **Decisions:** in `services/auth/signerConfirmation.ts`:
  - the method;
  - the two-component rule;
  - five failures lock signing for 15 minutes;
  - the SSO popup's same-account and freshness checks;
  - audit.

**Used by:**
- `CaseSignOutModal` (sign-out and countersign);
- `FinalizeSynopticModal`;
- `PreFinalisationModal`;
- `CytologyScreeningPage`;
- the autopsy PAD/FAD buttons on `SynopticReportPage`.

**Checked by:** `services/auth/signingScreens.guard.test.ts`.

**Server side:** the API server must also verify each signature when it receives it; see `docs/architecture/AUTHENTICATION_OIDC.md` §5.4.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
