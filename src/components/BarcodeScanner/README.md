# components/BarcodeScanner/

Real, camera-based barcode capture.

## Files

- **`BarcodeScanner.tsx`** — replaces `IntraopQueuePage.tsx`'s previous `simulateScan()` (a random-MRN generator with no real camera read at all). Uses `@zxing/browser`'s `BrowserMultiFormatReader`, restricted to exactly the five barcode formats this app already models elsewhere (`utils/` — kept consistent rather than accepting every format the library supports).

---
*See [components/README.md](../README.md) for how this folder fits the whole components/ layer.*
*When this folder's contents change meaningfully, update THIS file.*
