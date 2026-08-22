import React, {
  createContext, useContext, useState, useRef, useEffect, useCallback,
} from 'react';
import { mockActionRegistryService } from '../services/actionRegistry/mockActionRegistryService';
import { useSystemConfig } from './SystemConfigContext';
import { callAi } from '../services/aiIntegration/aiProviderService';
import { resolveVoiceAiConfig } from '../components/Config/AI/resolveVoiceAiModel';

export type VoicePhase = 'standby' | 'ai' | 'local' | 'dictate';

export interface DictationTarget {
  fieldId: string;
  label: string;
  onText: (text: string, isInterim?: boolean) => void;
  onDone?: () => void;
  /** Called when user edits dictated text — enables AI learning from corrections */
  onCorrection?: (original: string, corrected: string) => void;
  /** Context hint for the AI refinement prompt (e.g. 'gross', 'micro', 'diagnosis') */
  context?: string;
}

export interface VoiceContextType {
  phase: VoicePhase;
  commandPhase: 'ai' | 'local';
  transcript: string;
  isFinal: boolean;
  isListening: boolean;
  isAiEnabled: boolean;
  isRefining: boolean;
  aiAvailable: boolean;
  voiceEnabled: boolean;
  accent: string;
  dictationTarget: DictationTarget | null;
  setAccent: (accent: string) => void;
  startListening: () => void;
  stopListening: () => void;
  toggleVoice: () => void;
  startDictation: (target: DictationTarget) => void;
  stopDictation: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

// __psRecordDictationCorrection is a genuine global side-channel (not a
// standard browser API like SpeechRecognition below, which really has no
// TS lib type) — declared properly here so the 3 use sites don't each need
// their own `as any`/`(window as any)` cast.
declare global {
  interface Window {
    __psRecordDictationCorrection?: (corrected: string) => void;
  }
}

const STOP_PHRASES = ['stop dictation', 'done', 'finish', 'cancel dictation'];
const MISS_CONFIRMATION_WINDOW_MS = 8000;
const STRUCTURED_CONTENT_TIMEOUT_MS = 2000; // fall back to local if the AI call takes longer

// ── AI-refinement availability ────────────────────────────────────────────────
// Cached in sessionStorage so the probe only fires once per browser session,
// not on every HMR reload or component mount.
// Real fix: previously hardcoded to the Gemini proxy path specifically —
// now resolves whichever model is actually configured as the active
// Voice Dictation model (see resolveVoiceAiModel.ts) and probes THAT,
// through the same multi-vendor callAi() the real refinement call uses
// below. Stays accurate if the active voice model is ever changed to a
// different vendor, rather than silently probing the wrong endpoint.
const STRUCTURED_CONTENT_SESSION_KEY = 'ps_voice_ai_available';

async function checkStructuredContentAvailable(): Promise<boolean> {
  // Return cached result if already probed this session
  const cached = sessionStorage.getItem(STRUCTURED_CONTENT_SESSION_KEY);
  if (cached !== null) return cached === 'true';

  let available = false;
  try {
    const configOverride = await resolveVoiceAiConfig();
    if (!configOverride) {
      // No validated voice model configured at all — genuinely
      // unavailable, not a network/proxy problem.
      sessionStorage.setItem(STRUCTURED_CONTENT_SESSION_KEY, 'false');
      return false;
    }
    await callAi({ system: 'Reply with: OK', prompt: 'ping', maxTokens: 10, configOverride });
    available = true;
  } catch (e: any) {
    // Distinguish "proxy/key genuinely missing" from "rate limited but
    // configured" the same way the original Gemini-specific check did —
    // a 429 means the model IS reachable, just busy right now.
    available = typeof e?.message === 'string' && e.message.includes('429');
  }

  sessionStorage.setItem(STRUCTURED_CONTENT_SESSION_KEY, String(available));
  return available;
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function parseShortcut(shortcut: string) {
  const parts = shortcut.split('+').map(p => p.trim().toLowerCase());
  return {
    ctrl:  parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt:   parts.includes('alt'),
    meta:  parts.includes('meta'),
    key:   parts.find(p => !['ctrl','shift','alt','meta'].includes(p)) ?? '',
  };
}

// ── Punctuation substitution map ──────────────────────────────────────────────
const PUNCT_MAP: Record<string, string> = {
  'period':              '. ',
  'comma':               ', ',
  'question mark':       '? ',
  'exclamation mark':    '! ',
  'exclamation point':   '! ',
  'colon':               ': ',
  'semicolon':           '; ',
  'new line':            '\n',
  'new paragraph':       '\n\n',
  'open paren':          '(',
  'close paren':         ') ',
  'open parenthesis':    '(',
  'close parenthesis':   ') ',
  'hyphen':              '-',
  'dash':                ' \u2014 ',
  'em dash':             ' \u2014 ',
  'percent':             '% ',
  'percent sign':        '% ',
  'slash':               '/',
  'backslash':           '\\',
  'open bracket':        '[',
  'close bracket':       '] ',
  'open brace':          '{',
  'close brace':         '} ',
  'equals':              ' = ',
  'plus':                ' + ',
  'asterisk':            '*',
  'at sign':             '@',
  'hash':                '#',
  'ampersand':           '&',
  'tab':                 '\t',
  'space':               ' ',
  'ellipsis':            '\u2026 ',
  'dot dot dot':         '\u2026 ',
};

/**
 * Apply punctuation substitution + smart capitalization.
 * - Capitalizes the first character of the segment
 * - Capitalizes the character after sentence-ending punctuation (. ? !)
 */
function applyPunctuation(text: string): string {
  const tokens = text.split(/\s+/);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const twoWord = tokens.slice(i, i + 2).join(' ').toLowerCase();
    if (PUNCT_MAP[twoWord] !== undefined) {
      out.push(PUNCT_MAP[twoWord]);
      i += 2;
      continue;
    }
    const oneWord = tokens[i].toLowerCase();
    if (PUNCT_MAP[oneWord] !== undefined) {
      out.push(PUNCT_MAP[oneWord]);
      i++;
      continue;
    }
    out.push(tokens[i]);
    i++;
  }

  let result = out.join(' ').replace(/ {2,}/g, ' ').replace(/ (\n)/g, '$1').replace(/(\n) /g, '$1');
  result = result.charAt(0).toUpperCase() + result.slice(1);
  result = result.replace(/([.?!])\s+([a-z])/g, (_, punct, letter) => `${punct} ${letter.toUpperCase()}`);
  return result;
}

// ── Dictation learning store ───────────────────────────────────────────────────
const DICTATION_LEARN_KEY = 'ps_dictation_corrections';

function loadDictationCorrections(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DICTATION_LEARN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveDictationCorrections(map: Record<string, string>) {
  try { localStorage.setItem(DICTATION_LEARN_KEY, JSON.stringify(map)); } catch {}
}

const dictationCorrections: Record<string, string> = loadDictationCorrections();

function applyDictationLearning(rawTranscript: string, localText: string): string {
  const key = norm(rawTranscript);
  return dictationCorrections[key] ?? localText;
}

function recordDictationCorrection(rawTranscript: string, corrected: string) {
  const key = norm(rawTranscript);
  if (!key || !corrected.trim()) return;
  dictationCorrections[key] = corrected;
  saveDictationCorrections(dictationCorrections);
}

// ── Voice-dictation AI refinement ─────────────────────────────────────────────
// Real fix: previously called Gemini directly via a hardcoded model
// string and its own raw fetch, completely bypassing the same
// multi-vendor callAi() the rest of the app's AI calls already go
// through. Now resolves whichever model is actually configured as the
// active Voice Dictation model (see resolveVoiceAiModel.ts — org-wide
// default, hard-blocked to only ever be a model with a passing,
// reported validation study behind it) and calls it through that same
// shared path, so voice genuinely isn't locked to any one vendor.

const VOICE_REFINEMENT_SYSTEM =
  'You are an expert Pathology Transcription Assistant. Refine raw voice ' +
  'transcripts into professional medical text.\n\n' +
  'RULES:\n' +
  '1. Correct phonetic errors (e.g. "Rose" \u2192 "Gross", "Serial" \u2192 "Ciliary").\n' +
  '2. Format measurements using \'x\' (e.g. "3 x 2 x 1 cm").\n' +
  '3. Use proper pathology staging capitalization (pT2b, pN0, pM0).\n' +
  '4. Capitalize the first word and after sentence-ending punctuation.\n' +
  '5. Preserve punctuation symbols already present (commas, periods etc.).\n' +
  '6. Return ONLY the refined text. No explanation, no quotes.';

async function refineWithStructuredContent(
  text: string,
  context: string,
  learnedCorrections: Record<string, string>
): Promise<string | null> {
  const examples = Object.entries(learnedCorrections)
    .slice(0, 5)
    .map(([raw, corrected]) => `  Raw: "${raw}"\n  Corrected: "${corrected}"`)
    .join('\n');

  const fewShot = examples
    ? `Learned corrections from this user (apply similar patterns):\n${examples}\n\n`
    : '';

  const prompt = `${fewShot}Context: ${context}\nRaw: "${text}"`;

  try {
    const configOverride = await resolveVoiceAiConfig();
    if (!configOverride) {
      console.warn('[VoiceProvider] No validated voice AI model configured');
      return null;
    }
    const result = await callAi({ system: VOICE_REFINEMENT_SYSTEM, prompt, configOverride });
    return result.text?.trim() || null;
  } catch (e) {
    console.warn('[VoiceProvider] AI refinement failed:', e);
    return null;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useSystemConfig();
  const voiceEnabled = config.voiceEnabled ?? true;

  // Probe voice AI refinement availability once on mount
  const [aiAvailable, setAiAvailable] = useState(false);
  useEffect(() => {
    checkStructuredContentAvailable().then(setAiAvailable);
  }, []);

  const [phase, setPhase]                       = useState<VoicePhase>('standby');
  const [commandPhase, setCommandPhase]         = useState<'ai' | 'local'>('ai');
  const [transcript, setTranscript]             = useState('');
  const [isFinal, setIsFinal]                   = useState(false);
  // Real fix, per direct follow-up: persist the user's chosen voice
  // accent/locale across reloads. Confirmed directly: this genuinely
  // drives the real SpeechRecognition engine (recognition.lang =
  // accent, below) — not a cosmetic setting — but had zero
  // persistence, resetting to 'en-US' on every reload regardless of
  // what the user had actually picked. Client-side only (no real
  // server-side user-profile store exists in this mock app to persist
  // to instead).
  const [accent, setAccentState] = useState(() => {
    try { return localStorage.getItem('pathscribe_voice_accent') || 'en-US'; } catch { return 'en-US'; }
  });
  const setAccent = useCallback((next: string) => {
    setAccentState(next);
    try { localStorage.setItem('pathscribe_voice_accent', next); } catch { /* persistence is an optimisation, not a requirement */ }
  }, []);
  const [dictationTarget, setDictationTarget]   = useState<DictationTarget | null>(null);
  const [isRefining, setIsRefining]             = useState(false);
  const [justHeardLiteral, setJustHeardLiteral] = useState(false);
  const justHeardLiteralRef = useRef(false);

  const recognitionRef     = useRef<any>(null);
  const streamRef          = useRef<MediaStream | null>(null);
  const dictationTargetRef = useRef<DictationTarget | null>(null);
  const phaseRef           = useRef<VoicePhase>('standby');
  const commandPhaseRef    = useRef<'ai' | 'local'>('ai');
  const pendingMissRef     = useRef<{ id: string; expiresAt: number } | null>(null);
  const lastRawRef         = useRef<string>('');
  const lastLocalTextRef   = useRef<string>('');
  const aiAvailableRef     = useRef(false);

  useEffect(() => { dictationTargetRef.current  = dictationTarget; }, [dictationTarget]);
  useEffect(() => { justHeardLiteralRef.current = justHeardLiteral; }, [justHeardLiteral]);
  useEffect(() => { phaseRef.current            = phase; },           [phase]);
  useEffect(() => { commandPhaseRef.current     = commandPhase; },    [commandPhase]);
  useEffect(() => { aiAvailableRef.current      = aiAvailable; },     [aiAvailable]);

  const killMic = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) { try { recognition.stop(); } catch {} }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // If admin disables voice mid-session, stop immediately
  useEffect(() => {
    if (!voiceEnabled) {
      killMic();
      setPhase('standby');
      setDictationTarget(null);
      setTranscript('');
    }
  }, [voiceEnabled, killMic]);

  // ── Real, missing keyboard shortcut dispatcher ──────────────────────────────
  // Per direct follow-up: "are we not mapping keyboard commands in the
  // Action Registry?" Confirmed directly, after a genuinely thorough
  // trace (every real keydown listener in the app, every use of
  // parseShortcut, every caller of executeAction): the shortcut field
  // was real, stored, admin-editable data that never actually fired
  // anything on a real, physical key press — only voice commands ever
  // called executeAction. This is the real, missing receiving half.
  // Shares mockActionRegistryService's own getEligibleActions() — the
  // exact same isActive + GLOBAL_CATEGORIES-or-current-context rule
  // voice matching already uses — so keyboard and voice can never
  // silently drift apart on which actions are eligible right now.
  useEffect(() => {
    const handleGlobalShortcut = (e: KeyboardEvent) => {
      // Real, deliberate rule: ignore while genuinely typing into a
      // real field — a bare-key shortcut (e.g. 'S', 'Escape') that
      // happens to collide with normal typing must never fire
      // mid-keystroke. Modifier-bearing combos (Alt/Ctrl/Meta) are
      // exempt — normal typing never holds those down.
      const hasModifier = e.altKey || e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping && !hasModifier) return;

      const eligible = mockActionRegistryService.getEligibleActions();
      const matched = eligible.find(a => {
        if (!a.shortcut) return false;
        const sc = parseShortcut(a.shortcut);
        return (
          e.ctrlKey  === sc.ctrl  && e.shiftKey === sc.shift &&
          e.altKey   === sc.alt   && e.metaKey  === sc.meta  &&
          e.key.toLowerCase() === sc.key
        );
      });
      if (matched) {
        e.preventDefault();
        mockActionRegistryService.executeAction(matched);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

  // ── Shortcut confirmation for missed voice commands ────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const miss = pendingMissRef.current;
      if (!miss || Date.now() > miss.expiresAt) return;
      if (phaseRef.current === 'standby') return;
      const matched = mockActionRegistryService.getActions().find(a => {
        if (!a.shortcut) return false;
        const sc = parseShortcut(a.shortcut);
        return (
          e.ctrlKey  === sc.ctrl  && e.shiftKey === sc.shift &&
          e.altKey   === sc.alt   && e.metaKey  === sc.meta  &&
          e.key.toLowerCase() === sc.key
        );
      });
      if (matched) {
        mockActionRegistryService.confirmMiss(miss.id, matched.id, 'shortcut');
        pendingMissRef.current = null;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // ── Core dictation handler ─────────────────────────────────────────────────
  const handleDictationSegment = useCallback(async (text: string) => {
    const normed = norm(text);

    // Stop phrases exit dictation mode
    if (STOP_PHRASES.some(p => normed.includes(p))) {
      dictationTargetRef.current?.onDone?.();
      setDictationTarget(null);
      setJustHeardLiteral(false);
      setPhase(commandPhaseRef.current);
      setTranscript('');
      return;
    }

    // "literal" one-shot flag
    if (normed === 'literal') {
      setJustHeardLiteral(true);
      setTranscript('\uD83D\uDD24 Literal\u2026');
      setTimeout(() => setTranscript(''), 1500);
      return;
    }

    // One-shot literal: pass through raw
    if (justHeardLiteralRef.current) {
      setJustHeardLiteral(false);
      dictationTargetRef.current?.onText(text + ' ');
      lastRawRef.current       = text;
      lastLocalTextRef.current = text + ' ';
      setTranscript('');
      return;
    }

    // Apply local punctuation + capitalization + learned corrections
    const localExpanded     = applyPunctuation(text);
    const localWithLearning = applyDictationLearning(text, localExpanded);

    lastRawRef.current       = text;
    lastLocalTextRef.current = localWithLearning;

    if (commandPhaseRef.current === 'ai' && aiAvailableRef.current) {
      // ── AI PATH ────────────────────────────────────────────────────────────
      dictationTargetRef.current?.onText(localWithLearning, true); // interim
      setIsRefining(true);
      setTranscript('\u2728 Refining\u2026');

      const context       = dictationTargetRef.current?.context ?? 'Pathology Report';
      const structuredContentPromise = refineWithStructuredContent(text, context, dictationCorrections);
      const timeoutPromise = new Promise<null>(r => setTimeout(() => r(null), STRUCTURED_CONTENT_TIMEOUT_MS));
      const refined        = await Promise.race([structuredContentPromise, timeoutPromise]);

      setIsRefining(false);
      setTranscript('');

      if (refined && refined !== localWithLearning) {
        dictationTargetRef.current?.onText(refined, false);
        lastLocalTextRef.current = refined;
      } else {
        dictationTargetRef.current?.onText(localWithLearning, false);
      }
    } else {
      // ── LOCAL PATH ─────────────────────────────────────────────────────────
      dictationTargetRef.current?.onText(localWithLearning);
      setTranscript('');
    }
  }, []);

  // ── Speech recognition lifecycle ───────────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (phase === 'standby') { killMic(); return; }

    const recognition           = new SpeechRecognition();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.lang            = accent;

    recognition.onend = () => {
      if (recognitionRef.current === recognition && phaseRef.current !== 'standby') {
        try { recognition.start(); } catch {}
      }
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      setIsFinal(false);

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text  = event.results[i][0].transcript.trim();
        const final = event.results[i].isFinal;

        if (!final) {
          interim += text + ' ';
          setTranscript(interim.trim());
          continue;
        }

        setIsFinal(true);
        setTranscript(text);
        const currentPhase = phaseRef.current;

        if (currentPhase === 'dictate') {
          void handleDictationSegment(text);
          continue;
        }

        // ── COMMAND ──────────────────────────────────────────────────────────
        const action = mockActionRegistryService.findActionByTrigger(text);
        if (action) {
          pendingMissRef.current = null;
          mockActionRegistryService.executeAction(action, text);
          setTranscript(`\u2714\uFE0F ${action.label}`);
          setTimeout(() => setTranscript(''), 1200);
        } else {
          const miss = mockActionRegistryService.recordMiss(text);
          pendingMissRef.current = { id: miss.id, expiresAt: Date.now() + MISS_CONFIRMATION_WINDOW_MS };
          setTimeout(() => {
            if (pendingMissRef.current?.id === miss.id) {
              mockActionRegistryService.dismissMiss(miss.id);
              pendingMissRef.current = null;
            }
          }, MISS_CONFIRMATION_WINDOW_MS);
          setTimeout(() => setTranscript(''), 2000);
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error !== 'aborted') console.warn('[VoiceProvider] error:', e.error);
    };

    recognitionRef.current = recognition;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(s => {
        streamRef.current = s;
        setTimeout(() => {
          if (recognitionRef.current === recognition) recognition.start();
        }, 400);
      })
      .catch(() => { recognitionRef.current = null; setPhase('standby'); });

    return () => killMic();
  }, [phase, accent, killMic, handleDictationSegment]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const toggleVoice = useCallback(() => {
    if (!voiceEnabled) return;
    setPhase(current => {
      if (current === 'standby') {
        // If AI refinement is available, prefer AI phase
        if (aiAvailableRef.current) { setCommandPhase('ai'); return 'ai'; }
        else                        { setCommandPhase('local'); return 'local'; }
      }
      if (current === 'ai')    { setCommandPhase('local'); return 'local';   }
      if (current === 'local') {                            return 'standby'; }
      // dictate bail-out
      dictationTargetRef.current?.onDone?.();
      setDictationTarget(null);
      setTranscript('');
      return commandPhaseRef.current;
    });
  }, [voiceEnabled]);

  const startDictation = useCallback((target: DictationTarget) => {
    setDictationTarget(target);
    setTranscript('');
    setPhase('dictate');
  }, []);

  const stopDictation = useCallback(() => {
    dictationTargetRef.current?.onDone?.();
    setDictationTarget(null);
    setTranscript('');
    setIsRefining(false);
    setPhase(commandPhaseRef.current);
  }, []);

  // ── Correction learning ────────────────────────────────────────────────────
  useEffect(() => {
    window.__psRecordDictationCorrection = (corrected: string) => {
      if (!lastRawRef.current || !corrected) return;
      if (norm(corrected) === norm(lastLocalTextRef.current)) return;
      recordDictationCorrection(lastRawRef.current, corrected);
      dictationTargetRef.current?.onCorrection?.(lastRawRef.current, corrected);
    };
    return () => { delete window.__psRecordDictationCorrection; };
  }, []);

  const value: VoiceContextType = {
    phase, commandPhase, transcript, isFinal,
    isListening:  phase !== 'standby',
    isAiEnabled:  phase === 'ai' || (phase === 'dictate' && commandPhase === 'ai'),
    isRefining,
    aiAvailable,
    voiceEnabled,
    accent, dictationTarget,
    setAccent,
    startListening:  () => { setCommandPhase('ai'); setPhase('ai'); },
    stopListening:   () => { setDictationTarget(null); setPhase('standby'); },
    toggleVoice, startDictation, stopDictation,
  };

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
};

export const useVoice = () => useContext(VoiceContext)!;

// ── Utility: call from any field's onBlur to teach the system ─────────────────
export function reportDictationCorrection(correctedText: string) {
  window.__psRecordDictationCorrection?.(correctedText);
}
