// src/types/footPedal/FootPedalConfig.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Foot pedal support specifically
// (the one part confirmed to not exist at all)" — the sign-out spec's
// own "Peripheral Integration (Hands-Free Control)" section:
//   Pedal 1: Push-to-Talk / Mute Toggle
//   Pedal 2: Advance to Next Synoptic Field / Confirm
//   Pedal 3: Pause Audio / Replay Last Segment
//
// Real medical foot pedals vary in how they present to a computer —
// some are genuine HID/Gamepad-class devices, many others (a very
// common, simpler vendor approach) emulate keyboard keys instead.
// Since the spec explicitly calls for "configurable" actions, a
// binding is deliberately either a real Gamepad button OR a real
// keyboard key, captured live from whatever hardware is actually
// connected — never a hardcoded assumption about a specific pedal
// model's button index or keycode, since that's genuinely unknowable
// in advance.
//
// Real, per direct follow-up ("these foot pedals are ubiquitous and we
// must support them"): a physical 3-pedal desk unit is bound to a
// workstation once (useFootPedal.ts), not to one page — so the same
// 3 real pedal-position bindings are now reused, contextually, across
// every real page that wires up real actions for them
// (SynopticReportPage.tsx for dictation, MicrotomyWorkstationPage.tsx
// for "Print/Etch Next," EmbeddingStationPage.tsx for piece-count
// confirmation — see each page's own useFootPedal() call for which
// action keys it actually uses). The action KEYS below stay stable so
// an already-bound pedal never silently loses its binding; only the
// LABELS were generalized away from dictation-only wording, since a
// tech at the Embedding bench configuring "Pedal 1" needs to
// recognize it as the same real physical trigger regardless of which
// page happens to be open when they press it.
//
// i18n sweep (batch 39): the labels/description below are only ever
// actually rendered in one place — FootPedalSection.tsx (the other two
// real consumers, MicrotomyWorkstationPage.tsx and
// EmbeddingStationPage.tsx, only reference this file in a doc comment,
// confirmed via grep). So instead of hardcoded English strings, this
// exports i18n KEYS (FOOT_PEDAL_ACTION_LABEL_KEYS) resolved via t() at
// the one real render site, and describeFootPedalInput() now takes the
// same t() function to build its live "what's bound" text — matching
// the established `t: (key, options?) => string` utility-function
// pattern used elsewhere (e.g. BillingLogsSection.tsx's
// summarizeFilters()).
// ─────────────────────────────────────────────────────────────────────────────

export type FootPedalAction = 'pedal1_pushToTalk' | 'pedal2_nextField' | 'pedal3_pauseReplay';

export type FootPedalInputSource =
  | { kind: 'gamepad'; gamepadIndex: number; buttonIndex: number; gamepadId: string }
  | { kind: 'keyboard'; code: string; label: string };

export type FootPedalBindings = Partial<Record<FootPedalAction, FootPedalInputSource>>;

export const FOOT_PEDAL_ACTION_LABEL_KEYS: Record<FootPedalAction, string> = {
  pedal1_pushToTalk:  'footPedalSection.actions.pedal1',
  pedal2_nextField:   'footPedalSection.actions.pedal2',
  pedal3_pauseReplay: 'footPedalSection.actions.pedal3',
};

export function describeFootPedalInput(
  input: FootPedalInputSource,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (input.kind === 'keyboard') return t('footPedalSection.input.keyboard', { label: input.label });
  return t('footPedalSection.input.gamepadButton', { index: input.buttonIndex + 1, gamepadId: input.gamepadId });
}
