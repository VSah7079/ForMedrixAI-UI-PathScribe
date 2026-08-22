// src/services/hardware/ModeAInterfaceService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Dispatches a ModeAOrderPayload through the EXISTING HL7 seam
// (ormBuilder.ts -> segmentBuilders.ts for the standard core, then
// IHL7VendorAdapter for vendor-specific transformation) rather than a new,
// parallel, incompatible pipeline. This is deliberate: services/hl7/ already
// has the "build a verified-standard message first, apply vendor quirks
// only as a transformation on top of it" discipline, specifically so
// nothing here ever needs to guess at Vantage/Cerebro-specific field
// layouts without a real integration guide. See vantageAdapter.ts's own
// comment for the full history of why that discipline exists.
//
// Only BLOCK_ORDER is actually wired today, because that's the only event
// type the real ormBuilder.ts currently knows how to build
// (buildOrmO01ForBlock — one message per block's stain orders, the real
// orderable unit). SLIDE_ORDER and SPECIMEN_LABEL throw a clear
// "not yet supported" error rather than silently faking a message-building
// path that doesn't exist — same standard as the adapter layer itself.
// ─────────────────────────────────────────────────────────────────────────────
import type { Case } from '@/types/case/Case';
import type { Specimen, HistologyBlock } from '@/types/case/Specimen';
import type { HL7MessageContext } from '../hl7/types';
import { buildOrmO01ForBlock } from '../hl7/ormBuilder';
import { vantageAdapter } from '../hl7/adapters/vantageAdapter';
import { cerebroAdapter } from '../hl7/adapters/cerebroAdapter';
import { identityAdapter } from '../hl7/adapters/identityAdapter';
import type { IHL7VendorAdapter } from '../hl7/adapters/IHL7VendorAdapter';
import type { ModeAOrderPayload } from '@/types/events/ModeAOrderPayload';
import { getOrganisationByHospitalId } from '../organisation/organisationService';

export interface ModeADispatchResult {
  ok: boolean;
  /** The real, standard ORM^O01 message this dispatch produced — present
   *  even on failure, since a vendor-adapter rejection (unverified spec)
   *  doesn't mean the standard core itself failed to build. Useful for
   *  logging/debugging what WOULD have been sent. */
  standardMessage?: string;
  /** Set when the vendor adapter transformation succeeded — the actual
   *  wire-format message ready to send. Absent while the target adapter
   *  is still stubbed (e.g. vantageAdapter today). */
  vendorMessage?: string;
  error?: string;
}

/** Resolves organisationId + siteId from a Case for hardware-routing
 *  purposes. organisationId comes from the real, existing
 *  originHospitalId field. siteId prefers an explicit order.siteId if
 *  one was captured at accessioning (Case.ts's OrderMetadata.siteId),
 *  and otherwise falls back to the organisation's first seeded site
 *  (Organisation.sites[0].id) — never an invented "primary site"
 *  designation, since Organisation has no such field. Does NOT resolve
 *  an endpointUrl: no site-to-hardware-endpoint mapping exists anywhere
 *  in this codebase yet, and fabricating one here would repeat exactly
 *  the "guess at data that was never actually verified" mistake this
 *  whole feature exists to avoid. That's real follow-up work, not
 *  something to paper over with a plausible-looking function. */
export function resolveModeAOrgContext(caseData: Pick<Case, 'originHospitalId' | 'order'>): { organisationId: string | undefined; siteId: string | undefined } {
  const org = caseData.originHospitalId ? getOrganisationByHospitalId(caseData.originHospitalId) : null;
  const siteId = caseData.order?.siteId ?? org?.sites?.[0]?.id;
  return { organisationId: org?.id, siteId };
}

/** name -> adapter lookup. Add new vendors here as their adapters are
 *  built — identityAdapter is the safe no-op default for anything not
 *  yet a real vendor integration. */
const ADAPTERS: Record<string, IHL7VendorAdapter> = {
  vantage: vantageAdapter,
  cerebro: cerebroAdapter,
  identity: identityAdapter,
};

export const ModeAInterfaceService = {
  /** The one event type actually wired today. Builds a real, standard
   *  ORM^O01 message via the existing verified core, then hands it to
   *  the named vendor adapter for transformation. adapterName defaults
   *  to 'identity' (safe no-op passthrough) — callers must opt into a
   *  real vendor explicitly, never silently. */
  async dispatchBlockOrder(
    payload: ModeAOrderPayload,
    hl7Context: HL7MessageContext,
    caseData: Pick<Case, 'id' | 'patient'>,
    specimen: Pick<Specimen, 'id' | 'label' | 'collection' | 'container'>,
    block: HistologyBlock,
    timezone: string,
    adapterName: keyof typeof ADAPTERS = 'identity',
  ): Promise<ModeADispatchResult> {
    if (payload.eventType !== 'BLOCK_ORDER') {
      return { ok: false, error: `dispatchBlockOrder called with eventType '${payload.eventType}' — expected 'BLOCK_ORDER'.` };
    }

    const built = buildOrmO01ForBlock(hl7Context, caseData, specimen, block, timezone);
    const adapter = ADAPTERS[adapterName];

    try {
      const vendorMessage = adapter.adapt(built.message, {
        caseId: caseData.id,
        specimenLabel: specimen.label,
        blockLabel: block.label,
      });
      return { ok: true, standardMessage: built.message, vendorMessage };
    } catch (e) {
      // Expected, not exceptional, while an adapter is still stubbed
      // (vantageAdapter today) — the standard message is still real and
      // useful to surface, even though nothing could actually be sent.
      return { ok: false, standardMessage: built.message, error: (e as Error).message };
    }
  },

  /** Not yet supported — ormBuilder.ts has no slide-level message builder
   *  today (only buildOrmO01ForBlock, one message per block's stain
   *  orders). Throws rather than fabricating a message shape that was
   *  never actually verified against the standard, same discipline as
   *  the adapter layer itself. */
  async dispatchSlideOrder(_payload: ModeAOrderPayload): Promise<ModeADispatchResult> {
    return { ok: false, error: 'dispatchSlideOrder is not yet implemented — ormBuilder.ts has no slide-level ORM builder today. Extend buildOrmO01ForBlock or add a slide-level builder before wiring this.' };
  },

  /** Not yet supported — a specimen container label isn't a stain/lab
   *  order at all (no OBR is meaningful for it), so it doesn't fit
   *  ormBuilder's existing model. Needs its own real design, not a
   *  forced fit into the ORM^O01 shape. */
  async dispatchSpecimenLabel(_payload: ModeAOrderPayload): Promise<ModeADispatchResult> {
    return { ok: false, error: 'dispatchSpecimenLabel is not yet implemented — a specimen container label is not a lab order and does not fit the ORM^O01 model ormBuilder.ts builds today.' };
  },
};
