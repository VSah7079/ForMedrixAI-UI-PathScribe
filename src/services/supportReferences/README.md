# services/supportReferences/

Support references (Batch 364; PS-349, PS-350): non-identifying IDs that support staff use instead of case numbers.

## The idea

A support analyst must never need a patient's case number. Instead they quote a **support reference**, such as `SR-7K2Q-9MXD`. The lab's own staff, who may see patient data, look it up in PathScribe and see which case, audit entry, error or interface exception it names.

## Files

- **`ISupportReferenceService.ts`**:
  - `forRecord(kind, recordId)` returns the record's reference, creating it the first time it's asked for.
  - `resolve(ref, actor)` returns what a reference names, and audits the lookup (`support_reference.resolved`).
  - Kinds: `case`, `auditEntry`, `errorEntry`, `interfaceException`.
- **`supportReferenceRules.ts`**: the format.
  - `SR-` plus eight Crockford base-32 characters: 40 random bits, with no I, L, O or U, so it reads aloud and copies cleanly.
  - `normaliseSupportReference` accepts what people type: lower case, spaces, missing dashes, and I/L/O for 1/1/0.
- **Random, never derived.** A reference is random and stored beside the record. It is never a hash of the case number: case numbers follow a pattern, so a hash of one could be reversed by hashing every possible number. HIPAA's de-identification rule asks the same of a re-identification code.
- **`mockSupportReferenceService.ts`**: the browser store (`support_references`, cleared by Demo Reset). In production the API server issues and resolves references.
- **`supportReferenceTargets.ts`**: `describeSupportTarget` describes what a resolved reference names, for the Audit Log's lookup.
- **`supportTicketRules.ts`**: what a support ticket may say.
  - `supportPageOf(pathname)` reports the route pattern (`/report/:caseId`), never the address, and hands back the case id so the ticket can send its reference. The query string is dropped. A test keeps `SUPPORT_ROUTE_PATTERNS` in step with `App.tsx`.
  - `findIdentifiersInText` finds case numbers, MRNs and other identifiers in typed text using every format in `IDENTIFIER_FORMAT_LIBRARY`, enabled for the lab or not: a false alarm costs a warning, a miss sends patient data.
  - `replaceIdentifiers` swaps them for references.

## Where it's used

- **Case header:** a "Support reference" chip; click to create or reveal the reference and copy it.
- **Audit Log:** the same chip on audit, error and interface-exception rows, and a "Find a support reference" box. `?supportRef=` deep-links into it.
- **Case search box:** typing a reference opens the case, or the Audit Log lookup for other kinds.
- **Support tickets** (`enhancementRequestService.ts`):
  - the system details carry the page pattern and the case's reference;
  - the modal warns about identifiers in the text and can replace case numbers with references.

## Not covered yet

- **Patient names in typed text:** they can't be recognised by pattern.
- **Attachments** the user adds.
- **Interface messages** carry their own `messageId` from the Engine; this adds a reference for the exception record, not the message.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
