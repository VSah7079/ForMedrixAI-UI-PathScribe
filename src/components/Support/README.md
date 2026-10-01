# components/Support/

Batch 364 (PS-350): support references in the UI. See [services/supportReferences/](../../services/supportReferences/README.md).

- **`SupportReferenceChip.tsx`**: a record's reference.
  - Clicking creates the reference (the first time) or reveals it, and copies it to the clipboard.
  - It isn't created just by showing a list.
  - Used on the case header and on Audit Log rows.
- **`SupportReferenceLookup.tsx`**: "Find a support reference" on the Audit Log.
  - It shows what a reference names: the entry's time, title and detail (tagged `data-phi`), and an "Open case" button.
  - Each lookup is audited by the service.

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
