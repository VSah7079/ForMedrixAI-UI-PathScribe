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
// ─────────────────────────────────────────────────────────────────────────────

export type FootPedalAction = 'pedal1_pushToTalk' | 'pedal2_nextField' | 'pedal3_pauseReplay';

export type FootPedalInputSource =
  | { kind: 'gamepad'; gamepadIndex: number; buttonIndex: number; gamepadId: string }
  | { kind: 'keyboard'; code: string; label: string };

export type FootPedalBindings = Partial<Record<FootPedalAction, FootPedalInputSource>>;

export const FOOT_PEDAL_ACTION_LABELS: Record<FootPedalAction, string> = {
  pedal1_pushToTalk:  'Pedal 1 — Primary Action (Push-to-Talk on Sign-Out · Confirm Piece Count on Embedding)',
  pedal2_nextField:   'Pedal 2 — Advance / Next (Next Field on Sign-Out · Print/Etch Next on Microtomy)',
  pedal3_pauseReplay: 'Pedal 3 — Pause / Replay Last Segment (Sign-Out dictation only)',
};

export function describeFootPedalInput(input: FootPedalInputSource): string {
  if (input.kind === 'keyboard') return `Keyboard: ${input.label}`;
  return `Pedal button ${input.buttonIndex + 1} (${input.gamepadId})`;
}
