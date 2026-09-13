// src/services/cytology/mockPathologyLexiconService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed "controlled, versioned
// dictionary" design. Real, honest starting state: EMPTY — no real,
// clinically-validated translation exists for any term yet, since
// that requires real, attributed clinical/linguistic review this app
// cannot fabricate. An empty lexicon is the correct, honest starting
// point — every clinical term correctly falls back to its own real,
// canonical (English) form for every non-English locale until a real
// validator populates an entry here, exactly matching direct
// guidance's own "default to the canonical source term... rather than
// guessing" rule. Real admins/validators would extend this over real
// time via a real, future admin screen — not built here, since this
// phase's own scope is the resolution/enforcement mechanism, not a
// populated dictionary.
// ─────────────────────────────────────────────────────────────────────────────

import type { PathologyLexiconEntry } from '@/types/cytology/PathologyLexicon';
import type { ServiceResult } from '../types';

let _lexicon: PathologyLexiconEntry[] = [];

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

export const mockPathologyLexiconService = {
  async getAll(): Promise<ServiceResult<PathologyLexiconEntry[]>> {
    return ok([..._lexicon]);
  },
};
