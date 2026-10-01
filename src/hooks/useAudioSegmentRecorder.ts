// src/hooks/useAudioSegmentRecorder.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: Foot Pedal 3 — "Pause Audio /
// Replay Last Segment." The existing dictation system (VoiceProvider,
// via the Web Speech API's SpeechRecognition) only ever returns
// transcribed TEXT — genuinely never the raw audio back, so "replay"
// had no real audio to replay from anywhere in this codebase.
//
// Real, deliberate scope: a self-contained MediaRecorder-based
// recorder, kept independent from VoiceProvider's own SpeechRecognition
// internals rather than deeply interleaved with them — lower-risk than
// modifying that existing, working system, at the real cost of a
// second, separate microphone stream request (browsers handle this
// fine; may prompt for mic permission a second time on first use).
//
// A "segment" is real, dictated audio since the last natural pause —
// each time the recorder is told a new segment has started (the
// caller's own signal, driven by VoiceProvider's real isFinal speech-
// recognition boundary), the previous segment's real audio blob
// becomes "the last segment" available to replay.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useCallback, useState } from 'react';

interface UseAudioSegmentRecorderResult {
  /** Starts real mic capture for a new segment. Call again to close
   *  the current segment and start the next — the just-closed
   *  segment's real audio becomes replayable. */
  startSegment: () => Promise<void>;
  /** Stops all real capture (e.g. dictation paused/ended). The
   *  in-progress segment still becomes replayable. */
  stopCapture: () => void;
  /** Plays back the real, last completed segment's audio, if one
   *  exists. Resolves true if playback actually started. */
  replayLastSegment: () => Promise<boolean>;
  hasSegmentToReplay: boolean;
  isReplaying: boolean;
}

export function useAudioSegmentRecorder(): UseAudioSegmentRecorderResult {
  const streamRef       = useRef<MediaStream | null>(null);
  const recorderRef     = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const lastSegmentUrlRef = useRef<string | null>(null);
  const audioElRef       = useRef<HTMLAudioElement | null>(null);

  const [hasSegmentToReplay, setHasSegmentToReplay] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  const closeCurrentSegment = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop(); // fires 'stop' below, which finalizes the blob
  }, []);

  const beginRecorder = useCallback((stream: MediaStream) => {
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      if (chunksRef.current.length === 0) return;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (lastSegmentUrlRef.current) URL.revokeObjectURL(lastSegmentUrlRef.current);
      lastSegmentUrlRef.current = URL.createObjectURL(blob);
      setHasSegmentToReplay(true);
    };
    recorder.start();
    recorderRef.current = recorder;
  }, []);

  const startSegment = useCallback(async () => {
    // Close the segment currently in progress (if any) — its real
    // audio becomes "the last segment" the moment this happens.
    closeCurrentSegment();
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      beginRecorder(streamRef.current);
    } catch {
      // Real, honest fallback: mic permission denied or unavailable —
      // Pedal 3's "Pause Audio" half (mapped to VoiceProvider's own
      // stopListening) still works either way; only the "Replay"
      // half depends on this succeeding.
    }
  }, [beginRecorder, closeCurrentSegment]);

  const stopCapture = useCallback(() => {
    closeCurrentSegment();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, [closeCurrentSegment]);

  const replayLastSegment = useCallback(async (): Promise<boolean> => {
    if (!lastSegmentUrlRef.current) return false;
    if (!audioElRef.current) audioElRef.current = new Audio();
    const audioEl = audioElRef.current;
    audioEl.src = lastSegmentUrlRef.current;
    setIsReplaying(true);
    audioEl.onended = () => setIsReplaying(false);
    try {
      await audioEl.play();
      return true;
    } catch {
      setIsReplaying(false);
      return false;
    }
  }, []);

  return { startSegment, stopCapture, replayLastSegment, hasSegmentToReplay, isReplaying };
}
