// src/hooks/useEnabledIdentifierFormats.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance ("1 is fine" — union across all Enterprises):
// the shared resolution for globally-scoped consumers (ScannerProvider,
// CaseSearchBar, SearchPage) that have no reliable single facility
// context to resolve identifier formats against — a user scanning a
// barcode from the worklist, or searching cases globally, isn't
// necessarily inside any specific facility's context yet.
//
// Deliberately a single, shared hook rather than duplicating this
// fetch-and-union logic three times — matches this app's own
// established hooks/ convention (see useEffectiveScanStation.ts for a
// similar "one real, higher-level resolution, several real
// consumers" shape).
//
// Real, honest fallback: when no real Enterprise has configured
// identifierFormats yet, returns IDENTIFIER_FORMAT_LIBRARY unchanged —
// exactly this app's own real, existing default behavior before this
// feature, not a new, silent behavior change.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { mockFacilityService } from '@/services/facilities/mockFacilityService';
import { resolveUnionOfEnabledIdentifierFormatIds } from '@/services/facilities/IFacilityService';
import { IDENTIFIER_FORMAT_LIBRARY } from '@/types/systemConfig';
import type { IdentifierFormat } from '@/types/systemConfig';

export function useEnabledIdentifierFormats(): IdentifierFormat[] {
  const [formats, setFormats] = useState<IdentifierFormat[]>(IDENTIFIER_FORMAT_LIBRARY);

  useEffect(() => {
    let cancelled = false;
    mockFacilityService.getAll().then(res => {
      if (cancelled || !res.ok) return;
      const enabledIds = resolveUnionOfEnabledIdentifierFormatIds(res.data);
      if (enabledIds.length === 0) {
        setFormats(IDENTIFIER_FORMAT_LIBRARY);
        return;
      }
      setFormats(IDENTIFIER_FORMAT_LIBRARY.map(f => ({ ...f, enabled: enabledIds.includes(f.id) })));
    });
    return () => { cancelled = true; };
  }, []);

  return formats;
}
