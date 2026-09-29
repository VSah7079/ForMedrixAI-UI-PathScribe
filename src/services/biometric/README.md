# services/biometric/

WebAuthn-based biometric e-signature (fingerprint/face) for report sign-out.

**Pattern:** Standard interface/mock/firestore pattern.

## Notes

- Real WebAuthn architecture documented inline: enrollBiometric challenge/attestation flow, verifyEnrolment server-side verification.

**Batch 344:**
- **Barrel export:** the module is exported from `@/services` as `biometricService`, so `PreFinalisationModal` no longer imports the mock file.
- **Signing:** the check is still simulated (`verifyBiometric` always succeeds after enrolment). So signing with it is offered only in demo builds, through `services/auth/signerConfirmation.ts`.
- **Still to do:** a real WebAuthn challenge issued and verified by the API server.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*