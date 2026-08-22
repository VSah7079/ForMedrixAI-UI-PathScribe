// src/types/footPedal/FootPedalConfig.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Foot pedal support specifically
// (the one part confirmed to not exist at all)" — the Grossing spec's
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
// ─────────────────────────────────────────────────────────────────────────────

export type FootPedalAction = 'pedal1_pushToTalk' | 'pedal2_nextField' | 'pedal3_pauseReplay';

export type FootPedalInputSource =
  | { kind: 'gamepad'; gamepadIndex: number; buttonIndex: number; gamepadId: string }
  | { kind: 'keyboard'; code: string; label: string };

export type FootPedalBindings = Partial<Record<FootPedalAction, FootPedalInputSource>>;

export const FOOT_PEDAL_ACTION_LABELS: Record<FootPedalAction, string> = {
  pedal1_pushToTalk:  'Pedal 1 — Push-to-Talk / Mute Toggle',
  pedal2_nextField:   'Pedal 2 — Advance to Next Field',
  pedal3_pauseReplay: 'Pedal 3 — Pause / Replay Last Segment',
};

export function describeFootPedalInput(input: FootPedalInputSource): string {
  if (input.kind === 'keyboard') return `Keyboard: ${input.label}`;
  return `Pedal button ${input.buttonIndex + 1} (${input.gamepadId})`;
}
