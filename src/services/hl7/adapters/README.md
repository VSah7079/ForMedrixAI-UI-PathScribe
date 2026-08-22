# services/hl7/adapters/

Vendor-specific HL7 message adapters — the whole point of the seam is that the standard core (`ormBuilder.ts`, `segmentBuilders.ts`, one level up in `services/hl7/`) can be built and tested against real HL7 semantics without needing to guess at any one vendor's real, specific deviations from the standard.

## Files

- **`IHL7VendorAdapter.ts`** — the contract every adapter implements: takes a standard message, returns a vendor-adapted one.
- **`identityAdapter.ts`** — the default adapter: passes the standard message through unchanged. Genuinely usable as-is for any receiving system that accepts standard HL7 for the base segments (many do), and the real fallback while no vendor-specific adapter exists yet.
- **`cerebroAdapter.ts`** — **deliberately not implemented**, but with real, valuable, directional context already documented in the file itself: Cerebro runs on MS SQL Server, typically integrates via Mirth Connect (NextGen Connect) or a Java/IIS broker, HL7 v2.x over MLLP; the real message shape is known (inbound ADT/ORM/OML, outbound ORU for workflow status and chain-of-custody). Real reason to believe PathScribe may not need to drive cassette/slide printing itself where CEREBRO-ID/CEREBRO-ID+ already does, natively, on real named hardware (Leica IP C/IP S, HistoCore LIGHTNING, Cognitive Cxi).
- **`vantageAdapter.ts`** — **deliberately not implemented**, and for a more cautious reason than `cerebroAdapter`: some Vantage-specific segment details were provided secondhand and flagged as unverifiable — one detail (a CPT billing code used as a stain-protocol identifier in OBR-4) read as inconsistent with how CPT codes actually function, which was reason enough not to build toward it as if confirmed. This stub throws rather than silently producing a message that looks correct but might not be, until a genuine, verified Vantage integration guide exists.

---
*See [services/README.md](../../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*
