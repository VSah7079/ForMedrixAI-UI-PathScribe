// src/pages/SynopticReportPage/hooks/useEffectiveSpecimenComplexity.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own design discussion: getEffectiveComplexity
// is a pure function (services/billing/shouldAutoUpgradeComplexity.ts) that
// takes already-resolved synoptic instance data - it never fetches
// anything itself. This hook is the one, real place that async
// resolution (which SynopticReportInstance(s) belong to which specimen,
// and whether each one's own template is genuinely diagnostic via
// getTemplate()/isTemplateDiagnostic()) actually happens, kept
// deliberately isolated from both the pure function itself and from
// AddCodeModal.tsx's own synchronous useState initializer (which cannot
// await, and was the real reason this couldn't just be computed inline
// there).
//
// Deliberately its own, dedicated hook rather than folded into
// SynopticReportPage.tsx's own already-very-large body - same reasoning
// as every other hook in this directory (useMicroscopicEntry.ts, etc.):
// a genuinely separate real concern with its own real async lifecycle,
// easier to reason about and test in isolation.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import type { Case } from '@/types/case/Case';
import { getTemplate, isTemplateDiagnostic } from '@/services/templates/templateService';
import { getEffectiveComplexity } from '@/services/billing/shouldAutoUpgradeComplexity';

/** Real, per specimen id - the effective complexity
 *  (getEffectiveComplexity's own real result: the specimen's explicit
 *  declaration if one exists, else GROSS_AND_MICRO if real diagnostic
 *  synoptic evidence exists, else undefined - never a fabricated
 *  default). Specimens with neither an explicit value nor real
 *  evidence are simply absent from this map, not present with an
 *  undefined value - callers should treat a missing key the same as
 *  an explicit undefined result. */
export type EffectiveComplexityMap = Record<string, 'GROSS_ONLY' | 'GROSS_AND_MICRO'>;

/** Real, per direct guidance - resolves the real, effective complexity
 *  for every specimen on the case, re-computed whenever the case's own
 *  specimens or synoptic reports change. Caches getTemplate() lookups
 *  by templateId within a single resolution pass (same real
 *  "specimens commonly share one template" reasoning
 *  useSignOutWorkflow.ts's own templateCache already established) -
 *  never re-fetches the same real template twice in one pass. */
export function useEffectiveSpecimenComplexity(caseData: Case | null): EffectiveComplexityMap {
  const [result, setResult] = useState<EffectiveComplexityMap>({});

  const specimens = caseData?.specimens ?? [];
  const synopticReports = caseData?.synopticReports ?? [];

  // Real, stable dependency signal - re-runs only when the actual real
  // complexity-relevant data changes (specimen ids/declared complexity,
  // instance answers/template links), not on every unrelated case
  // update this page makes.
  const depsSignal = JSON.stringify({
    specimens: specimens.map(s => ({ id: s.id, complexity: s.complexity })),
    instances: synopticReports.map(r => ({ specimenId: r.specimenId, templateId: r.templateId, answers: r.answers })),
  });

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const templateDiagnosticCache = new Map<string, boolean>();
      const getDiagnosticFlag = async (templateId: string): Promise<boolean> => {
        if (templateDiagnosticCache.has(templateId)) return templateDiagnosticCache.get(templateId)!;
        try {
          const detail = await getTemplate(templateId);
          const flag = isTemplateDiagnostic(detail);
          templateDiagnosticCache.set(templateId, flag);
          return flag;
        } catch {
          // Real, honest fallback: a template that fails to load is
          // never treated as diagnostic evidence - same "never
          // fabricate" posture as everywhere else in this feature.
          templateDiagnosticCache.set(templateId, false);
          return false;
        }
      };

      const next: EffectiveComplexityMap = {};
      for (const specimen of specimens) {
        const relevantInstances = synopticReports.filter(r => r.specimenId === specimen.id);
        const resolvedInstances = await Promise.all(
          relevantInstances.map(async inst => ({
            instance: { answers: inst.answers },
            templateIsDiagnostic: await getDiagnosticFlag(inst.templateId),
          }))
        );
        const effective = getEffectiveComplexity({ complexity: specimen.complexity }, resolvedInstances);
        if (effective) next[specimen.id] = effective;
      }

      if (!cancelled) setResult(next);
    }

    resolve();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsSignal]);

  return result;
}
