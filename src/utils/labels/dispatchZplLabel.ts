// src/utils/labels/dispatchZplLabel.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Yes and should we update the req and
// container labels as well?" Extracted from
// printCassetteSlideLabel.ts's own dispatchViaConfiguredBridge —
// confirmed directly that this routing logic (given an already-built
// ZPL string and a PrinterProfile, dispatch via whichever real bridge
// is configured) was genuinely generic, not GS1/cassette-specific,
// before extracting it — the GS1 encoding and cassette/slide-specific
// payload shapes stay in printCassetteSlideLabel.ts; only the real,
// shared routing moves here, so container and molecular labels reuse
// the exact same real QZ Tray dispatch path rather than a second,
// duplicated copy of the same routing logic.
//
// Real, deliberate, narrower scope than the original: only qz_tray is
// handled here. direct_interface_engine needs its own, real, per-
// label-type payload shape (see printCassetteSlideLabel.ts's own
// header for why that path is handled separately by each real
// caller there) — container and molecular labels don't have that
// payload built, so a printer profile configured for
// direct_interface_engine here gets the same real, honest
// "not yet implemented" refusal as every other unimplemented bridge
// type, never a silent no-op or a fabricated success.
//
// Batch 346: the agent's port from the printer profile (agentPort) is
// passed through, so a custom port is tried first, and every message here
// is translated (printLabels.*). The "agent not found" message lists the
// ports actually tried.
// ─────────────────────────────────────────────────────────────────────────────

import i18n from '@/i18n/config';
import { printZplViaQzTray } from './qzTrayBridge';
import { getPathScribeAgentClient, type PathScribeAgentClient } from './pathscribeAgent/pathscribeAgentClient';
import type { PrinterProfile } from '@/services/printerProfiles/IPrinterProfileService';

export interface DispatchZplLabelResult {
  ok: true;
}
export interface DispatchZplLabelError {
  ok: false;
  message: string;
}

/** The printLabels.agent.* key for each agent error; the print callers
 *  show the message as-is. */
const AGENT_ERROR_KEY: Record<string, string> = {
  AGENT_NOT_FOUND:     'printLabels.agent.notFound',
  AGENT_TIMEOUT:       'printLabels.agent.timeout',
  AGENT_DISCONNECTED:  'printLabels.agent.disconnected',
  PRINTER_NOT_FOUND:   'printLabels.agent.printerNotFound',
  PRINTER_UNREACHABLE: 'printLabels.agent.printerUnreachable',
  PAPER_OUT:           'printLabels.agent.paperOut',
  RIBBON_OUT:          'printLabels.agent.ribbonOut',
  HEAD_OPEN:           'printLabels.agent.headOpen',
  MALFORMED_ZPL:       'printLabels.agent.malformedZpl',
  INVALID_GS1:         'printLabels.agent.invalidGs1',
  UNSUPPORTED_PROTOCOL_VERSION: 'printLabels.agent.unsupportedProtocol',
};

/**
 * Real, shared routing — given an already-built ZPL string and a real
 * PrinterProfile, dispatches via QZ Tray when that's the configured
 * bridge; refuses cleanly, with a real, specific message, for every
 * other bridge type this function doesn't have a working
 * implementation for.
 */
export async function dispatchZplLabel(
  printer: PrinterProfile,
  zpl: string,
  copies: number,
  agent: Pick<PathScribeAgentClient, 'printZpl' | 'portsTried'> = getPathScribeAgentClient(),
): Promise<DispatchZplLabelResult | DispatchZplLabelError> {
  if (printer.bridgeType === 'qz_tray') {
    const result = await printZplViaQzTray(printer.printerId, zpl, copies);
    // Real, deliberate cast — this project's own tsconfig.json has
    // strictNullChecks disabled, under which TypeScript cannot
    // reliably narrow a discriminated union to its `ok: false` branch.
    // Same real, established workaround printCassetteSlideLabel.ts's
    // own identical situation already uses.
    return result.ok ? { ok: true } : { ok: false, message: (result as { ok: false; message: string }).message };
  }
  if (printer.bridgeType === 'pathscribe_agent') {
    // PS-52: the workstation agent (utils/labels/pathscribeAgent/). The
    // agent queues jobs from every tab and reports this job's own outcome.
    const result = await agent.printZpl(printer.printerId, zpl, copies, { preferredPort: printer.agentPort ?? null });
    if (result.ok === true) return { ok: true };
    const key = AGENT_ERROR_KEY[result.error];
    if (key) return { ok: false, message: i18n.t(key, { ports: agent.portsTried(printer.agentPort ?? null).map(String) }) };
    return { ok: false, message: result.message ?? i18n.t('printLabels.agent.otherError', { code: result.error }) };
  }
  return { ok: false, message: i18n.t('printLabels.bridgeNotImplemented', { bridgeType: printer.bridgeType }) };
}
