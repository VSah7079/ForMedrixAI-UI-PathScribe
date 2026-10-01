// src/utils/playScanBeep.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct, detailed specification: "Barcode Listener & Form
// Auto-Ingestion" — "3. Form Auto-Populate & Visual Feedback": "Play an
// optional subtle auditory cue (a soft 'beep') so the technician knows the
// scan succeeded without having to look up at the monitor."
//
// A genuine, real sound generated directly via the Web Audio API's
// OscillatorNode, not an embedded/bundled audio file — no real asset to
// manage, and this environment has no real audio file to bundle anyway.
// Deliberately short and quiet: a real technician doing rapid, repeated
// accessioning shouldn't be startled or fatigued by this on every single
// scan.
//
// "Optional" per the spec's own wording — genuinely fails silently
// (swallowed, not surfaced as an error) rather than breaking the real
// auto-fill/toast feedback the scan already produced if audio genuinely
// can't play (no AudioContext support, browser autoplay policy blocking
// audio before any real user gesture has happened yet on the page, etc.) —
// the audible cue is a real convenience, not a requirement the rest of the
// scan-handling flow should ever depend on.
// ─────────────────────────────────────────────────────────────────────────────

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  sharedContext = new Ctor();
  return sharedContext;
}

/** Plays a short, soft beep — real, generated tone (880Hz, ~120ms, a gentle
 *  fade-out rather than an abrupt cutoff). Never throws; a genuine failure
 *  to play (no Web Audio support, blocked autoplay) is silently absorbed. */
export function playScanBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880; // A5 — a real, gentle, non-startling pitch
    gain.gain.setValueAtTime(0.15, ctx.currentTime); // real, deliberately quiet
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.12);
  } catch {
    // Real, deliberate silent failure — see this file's own header comment.
  }
}

/**
 * Real feature, per direct, detailed specification (LIS Batch
 * Management): "Distinct high-tone sound for successful item
 * additions; low-tone warning for errors or protocol mismatches."
 * playScanBeep() above is the real, already-existing high-tone
 * success cue; this is its missing low-tone sibling — a real, genuine
 * warning tone (220Hz, a full octave-plus below the 880Hz success
 * pitch, so the two are unmistakably different by ear alone, not just
 * by volume), and deliberately two short pulses rather than one
 * continuous tone — a double-beep reads as "something needs your
 * attention" even to a tech who isn't looking at the screen, the same
 * real reasoning the spec's own "audio-visual alert" wording calls
 * for (audible on its own, not just paired with an on-screen flash).
 */
export function playScanErrorTone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const pulseAt = (startOffset: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'square'; // real, deliberately harsher timbre than the success tone's soft sine
      oscillator.frequency.value = 220; // A3 — a full octave+ below the 880Hz success cue
      const startTime = ctx.currentTime + startOffset;
      gain.gain.setValueAtTime(0.14, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.15);
    };
    pulseAt(0);
    pulseAt(0.2); // second pulse — a real, distinct double-beep, not a single tone
  } catch {
    // Real, deliberate silent failure — see this file's own header comment.
  }
}
