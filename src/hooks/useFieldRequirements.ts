// src/hooks/useFieldRequirements.ts
// PS-359, Batch 380: a page's (or modal's) field requirements for the
// signed-in user's organisation. Starts from the page's defaults, so a check
// made before the organisation's settings load is never looser than the
// default; the decisions stay in services/fieldRequirements.
import { useEffect, useState } from 'react';
import { fieldRequirementService, resolveFieldRequirements, type FieldRequirementPageId, type ResolvedFieldRequirement } from '@/services';

export function useFieldRequirements(page: FieldRequirementPageId): ResolvedFieldRequirement[] {
  const [requirements, setRequirements] = useState<ResolvedFieldRequirement[]>(() => resolveFieldRequirements(page));
  useEffect(() => {
    let cancelled = false;
    void fieldRequirementService.forSession(page).then(r => { if (!cancelled) setRequirements(r); });
    return () => { cancelled = true; };
  }, [page]);
  return requirements;
}
