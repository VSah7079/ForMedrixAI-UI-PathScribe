// src/services/models/mockModelStoreService.ts
// ─────────────────────────────────────────────────────────────
// The "ForMedrixAI store" — the customer-facing half of the
// verify-then-publish workflow discussed at length: ForMedrixAI's own
// team tests a new model internally, then publishes it here; a
// customer admin browses this catalog and downloads whichever
// version they want to bring into their own system and validate for
// themselves. This is deliberately a SEPARATE catalog from
// mockModelService's local AIModel list — the store represents
// what's AVAILABLE from ForMedrixAI, not what THIS customer has
// actually adopted. A model only ever appears in one list at a time:
// present here until downloaded, then it moves to the local list and
// disappears from here.
//
// Real, honest scope note: this is the store catalog and the
// download action. It does not include ForMedrixAI's own internal
// verification/regression-testing step that would precede publishing
// something here — that's a separate, ForMedrixAI-side tool, not
// something a customer-facing screen would show.
// ─────────────────────────────────────────────────────────────

import type { ServiceResult, ID } from '../types';
import type { AIModel } from './IModelService';
import { modelService } from '../index';

export interface StoreListing {
  /** Stable store-catalog id — distinct from the local AIModel id
   *  this becomes once downloaded, since it doesn't have one yet. */
  storeId: string;
  name: string;
  version: string;
  vendor: AIModel['vendor'];
  requestFormat: AIModel['requestFormat'];
  apiModelId: string;
  type: AIModel['type'];
  releaseDate: string;
  /** ForMedrixAI's own internal benchmark accuracy — clearly a claim
   *  from the vendor's own testing, not a promise about this specific
   *  customer's data. The whole reason the Validation Study workflow
   *  exists is that this number alone was never meant to be trusted
   *  as-is; it seeds the AIModel record's own accuracy field on
   *  download, purely as a starting point pending real validation. */
  benchmarkAccuracy: number;
  releaseNotes: string;
  subspecialtyIds: string[];
}

const STORE_CATALOG: StoreListing[] = [
  {
    storeId: 'store-claude-opus-5',
    name: 'pathscribe', version: 'v4.0',
    vendor: 'anthropic', requestFormat: 'structured_messages', apiModelId: 'claude-opus-5',
    type: 'Gross + Micro',
    releaseDate: '2026-07-24',
    benchmarkAccuracy: 97.8,
    releaseNotes: 'ForMedrixAI internal benchmark: improved microscopic-description reasoning and fewer low-confidence flags on borderline Gleason grading. Published following ForMedrixAI\u2019s own regression-suite pass — still requires your own Validation Study before adoption.',
    subspecialtyIds: [],
  },
  {
    storeId: 'store-gemini-2-5-pro',
    name: 'pathscribe', version: 'v4.0-alt',
    vendor: 'google', requestFormat: 'structured_content', apiModelId: 'gemini-2.5-pro',
    type: 'Gross + Micro',
    releaseDate: '2026-06-01',
    benchmarkAccuracy: 94.1,
    releaseNotes: 'Cross-vendor candidate — same ForMedrixAI regression suite, alternate provider. Useful if you want vendor diversity for a specific subspecialty rather than switching your default entirely.',
    subspecialtyIds: [],
  },
  {
    storeId: 'store-gemini-2-5-flash-lite-voice',
    name: 'pathscribe-voice', version: '2.5-flash-lite',
    vendor: 'google', requestFormat: 'structured_content', apiModelId: 'gemini-2.5-flash-lite',
    type: 'Voice Dictation',
    releaseDate: '2026-07-10',
    benchmarkAccuracy: 95.4,
    releaseNotes: 'Newer voice-dictation refinement model — ForMedrixAI benchmark shows improved handling of multi-accent phonetic correction and fewer dropped words on long dictation runs. Same "requires your own Validation Study before adoption" rule applies here as any other model — downloading does not make this the active voice model on its own.',
    subspecialtyIds: [],
  },
];

const delay = () => new Promise(r => setTimeout(r, 120));
const ok  = <T>(data: T): ServiceResult<T> => ({ ok: true, data });
const err = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

// ─────────────────────────────────────────────────────────────
// MOCK AUTHORIZATION — replace when the real store exists.
//
// There is no real ForMedrixAI store yet, so there's nothing to
// authenticate against — this stands in for what a real check would
// be: does THIS ORGANIZATION (not just this user's role within
// PathScribe — that's a separate, already-existing isAdmin gate) have
// an active ForMedrixAI license/subscription entitling it to browse
// and download published models. A real implementation would call an
// authenticated ForMedrixAI API here (API key, OAuth, or similar) and
// likely gate WHICH listings are visible by subscription tier, not
// just whether the store opens at all.
//
// Defaults to authorized so the demo keeps working out of the box.
// Flip to false to see the locked state, or wire a real org-level
// flag through once one exists.
// ─────────────────────────────────────────────────────────────
const MOCK_ORG_HAS_STORE_LICENSE = true;

async function checkStoreAuthorization(): Promise<ServiceResult<true>> {
  await delay();
  if (!MOCK_ORG_HAS_STORE_LICENSE) {
    return err('Your organization does not have an active ForMedrixAI store license. Contact your ForMedrixAI account representative to enable this.');
  }
  return ok(true as const);
}

export interface IModelStoreService {
  checkAuthorization(): Promise<ServiceResult<true>>;
  getAvailable(): Promise<ServiceResult<StoreListing[]>>;
  download(storeId: ID): Promise<ServiceResult<AIModel>>;
}

export const mockModelStoreService: IModelStoreService = {
  checkAuthorization: checkStoreAuthorization,

  /** Store listings not already present locally — matched by
   *  (vendor, apiModelId), not name/version, since that's the actual
   *  identity of "which real model is this" once downloaded. */
  async getAvailable(): Promise<ServiceResult<StoreListing[]>> {
    await delay();
    const authRes = await checkStoreAuthorization();
    // Real, direct follow-up (PS-69): this used to need
    // `as { ok: false; error: string }` here — confirmed unnecessary, see
    // services/types.ts's own header comment on ServiceResult.
    if (authRes.ok === false) return err(authRes.error);
    const localRes = await modelService.getAll();
    const local = localRes.ok ? localRes.data : [];
    const available = STORE_CATALOG.filter(listing =>
      !local.some(m => m.vendor === listing.vendor && m.apiModelId === listing.apiModelId)
    );
    return ok(available);
  },

  /** Downloads a store listing into the local AIModel catalog —
   *  always as Beta status, never the default, with zero cases
   *  processed regardless of the store's own benchmark claim. That
   *  claim seeds the new record's accuracy field as a labeled
   *  starting point, not because it's treated as validated. */
  async download(storeId: ID): Promise<ServiceResult<AIModel>> {
    await delay();
    const authRes = await checkStoreAuthorization();
    if (authRes.ok === false) return err(authRes.error);
    const listing = STORE_CATALOG.find(l => l.storeId === storeId);
    if (!listing) return err<AIModel>(`Store listing ${storeId} not found`);
    const createRes = await modelService.create({
      name: listing.name,
      version: listing.version,
      type: listing.type,
      accuracy: listing.benchmarkAccuracy,
      releaseDate: listing.releaseDate,
      status: 'Beta',
      subspecialtyIds: listing.subspecialtyIds,
      notes: `Downloaded from ForMedrixAI store ${new Date().toISOString().slice(0, 10)}. ${listing.releaseNotes}`,
      vendor: listing.vendor,
      requestFormat: listing.requestFormat,
      apiModelId: listing.apiModelId,
    });
    return createRes;
  },
};
