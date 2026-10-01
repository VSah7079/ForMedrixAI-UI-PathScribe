// src/utils/fetchCassetteRoutingData.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, extracted while adding block-level cassette color routing
// (resolveBlockCassetteColor.ts) alongside the existing decant-level
// one (resolveDecantCassetteColor.ts) — both need the exact same real
// rules/colors/protocols fetch; this is the one, shared place for it
// rather than two, separately-maintained copies of the same
// Promise.all.
// ─────────────────────────────────────────────────────────────────────────────

import { mockCassetteRoutingRuleService } from '@/services/cassetteRouting/mockCassetteRoutingRuleService';
import { mockCassetteColorService } from '@/services/cassetteColors/mockCassetteColorService';
import { mockProtocolService } from '@/services/protocols/mockProtocolService';
import type { CassetteRoutingRule } from '@/services/cassetteRouting/ICassetteRoutingRuleService';
import type { CassetteColorDefinition } from '@/services/cassetteColors/ICassetteColorService';
import type { Protocol } from '@/services/protocols/IProtocolService';

export interface CassetteRoutingData {
  rules: CassetteRoutingRule[];
  colors: CassetteColorDefinition[];
  protocols: Protocol[];
}

/** Returns undefined (never a partial result) if any one of the three
 *  real services fails to load — callers should treat that the same
 *  as "no rule matched," never guess with incomplete data. */
export async function fetchCassetteRoutingData(): Promise<CassetteRoutingData | undefined> {
  const [rulesRes, colorsRes, protocolsRes] = await Promise.all([
    mockCassetteRoutingRuleService.getAll(),
    mockCassetteColorService.getAll(),
    mockProtocolService.getAll(),
  ]);
  if (!rulesRes.ok || !colorsRes.ok || !protocolsRes.ok) return undefined;
  return { rules: rulesRes.data, colors: colorsRes.data, protocols: protocolsRes.data };
}
