// src/hooks/useFootPedal.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "Foot pedal support specifically
// (the one part confirmed to not exist at all)." Detects both real
// HID/Gamepad-class pedals (via the Gamepad API, which has no
// "button pressed" event — an animation-frame poll loop is the
// standard, only way to read live button state) and keyboard-
// emulating pedals (a common, simpler approach many pedal vendors
// use instead of true HID). Bindings are captured live from whatever
// hardware is actually connected — never a hardcoded guess at a
// specific pedal model's button index or keycode.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback, useState } from 'react';
import type { FootPedalAction, FootPedalBindings, FootPedalInputSource } from '@/types/footPedal/FootPedalConfig';

// Real, deliberate scope: bound to this browser/workstation, not the
// logged-in user. A physical pedal is attached to a machine, not an
// account — a different pathologist logging into the same shared
// workstation later shouldn't have to re-bind the same, physical
// pedal that's still plugged into the same computer.
const STORAGE_KEY = 'pathscribe_footpedal_bindings';

function loadBindings(): FootPedalBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveBindings(bindings: FootPedalBindings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch { /* persistence is an optimisation, not a requirement */ }
}

interface UseFootPedalOptions {
  /** Real callback per action — omit an action to leave its binding
   *  inert even if one is saved (e.g. a page that only cares about
   *  Pedal 2). */
  actions: Partial<Record<FootPedalAction, () => void>>;
  enabled?: boolean;
}

export function useFootPedal({ actions, enabled = true }: UseFootPedalOptions) {
  const [bindings, setBindingsState] = useState<FootPedalBindings>(() => loadBindings());
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Real, live capture for the binding UI — resolves with whatever
  // real input the user actually presses next (gamepad button or
  // keyboard key), rather than guessing at any specific pedal model's
  // codes ahead of time.
  const captureResolverRef = useRef<((input: FootPedalInputSource) => void) | null>(null);

  const captureNextInput = useCallback((): Promise<FootPedalInputSource> => {
    return new Promise(resolve => { captureResolverRef.current = resolve; });
  }, []);

  const cancelCapture = useCallback(() => { captureResolverRef.current = null; }, []);

  const setBinding = useCallback((action: FootPedalAction, input: FootPedalInputSource) => {
    setBindingsState(prev => {
      const next = { ...prev, [action]: input };
      saveBindings(next);
      return next;
    });
  }, []);

  const clearBinding = useCallback((action: FootPedalAction) => {
    setBindingsState(prev => {
      const next = { ...prev };
      delete next[action];
      saveBindings(next);
      return next;
    });
  }, []);

  // ── Keyboard-emulating pedals ────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Real, deliberate rule: ignore keys while the user is
      // genuinely typing into a real field — a pedal-bound key that
      // happens to collide with normal typing must never fire mid-
      // keystroke. Function keys F13+ are exempt: real keyboards
      // don't have them, so they're never genuine typing input — the
      // exact range many pedal vendors default to for this reason.
      const isRealFunctionKey = /^F\d+$/.test(e.code) && parseInt(e.code.slice(1), 10) >= 13;
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping && !isRealFunctionKey) return;

      if (captureResolverRef.current) {
        e.preventDefault();
        captureResolverRef.current({ kind: 'keyboard', code: e.code, label: e.code });
        captureResolverRef.current = null;
        return;
      }

      for (const [action, binding] of Object.entries(bindingsRef.current) as [FootPedalAction, FootPedalInputSource][]) {
        if (binding.kind === 'keyboard' && binding.code === e.code) {
          e.preventDefault();
          actionsRef.current[action]?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);

  // ── Real HID/Gamepad-class pedals ────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    let rafId: number;
    const prevPressed: Record<string, boolean> = {};

    const poll = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad) continue;
        pad.buttons.forEach((button, buttonIndex) => {
          const key = `${pad.index}:${buttonIndex}`;
          const wasPressed = prevPressed[key] ?? false;
          const isPressed = button.pressed;
          // Edge-detect: fire only on the real press transition, not
          // every frame the pedal stays held down.
          if (isPressed && !wasPressed) {
            if (captureResolverRef.current) {
              captureResolverRef.current({ kind: 'gamepad', gamepadIndex: pad.index, buttonIndex, gamepadId: pad.id });
              captureResolverRef.current = null;
            } else {
              for (const [action, binding] of Object.entries(bindingsRef.current) as [FootPedalAction, FootPedalInputSource][]) {
                if (binding.kind === 'gamepad' && binding.gamepadIndex === pad.index && binding.buttonIndex === buttonIndex) {
                  actionsRef.current[action]?.();
                }
              }
            }
          }
          prevPressed[key] = isPressed;
        });
      }
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);

  return { bindings, setBinding, clearBinding, captureNextInput, cancelCapture };
}
