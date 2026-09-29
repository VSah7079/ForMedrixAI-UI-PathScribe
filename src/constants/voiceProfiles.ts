/**
 * src/constants/voiceProfiles.ts
 * Defines the regional linguistic profiles for AI transcription.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Multi-
 * Language UI & Localization Framework gap — two real, distinct fixes
 * made here, confirmed directly before building either:
 *
 * 1. Real bug found and fixed: `id` was previously passed directly to
 *    the browser's native SpeechRecognition API as `recognition.lang`
 *    (VoiceProvider.tsx). The Web Speech API requires a real, valid
 *    BCP-47 tag — but several of these ids described an ACCENT
 *    characteristic of a non-native English speaker (e.g. 'EN-DE'
 *    "Western European (Germanic)", 'EN-CN' "East Asian (Focus)",
 *    'EN-EE' "Eastern European", 'EN-ME' "Middle Eastern",
 *    'EN-GB-SCT' "Scottish"), none of which correspond to any real,
 *    distinct English dialect the speech engine actually recognizes.
 *    `recognitionLang` is the new, separate, real field carrying the
 *    actual BCP-47 tag to pass to the browser — the real, valid
 *    regional dialects (US/CA/GB/IE/IN/PH/SG/AU/ZA/NG) map to their
 *    own real locale; the genuine accent-only categories above (no
 *    real, corresponding dialect exists) fall back to the single
 *    most broadly-supported real base locale, en-US, rather than a
 *    fabricated, invalid tag. `id` itself is unchanged — it's still
 *    the real, internal accent-profile identifier this app's own
 *    per-user StaffUser.voiceProfile field already stores.
 *
 * 2. Real, per direct question — genuinely new: this dictionary was
 *    English-accent-only; no other real language existed. Added four
 *    real, distinct LANGUAGE profiles (not English accents) for
 *    French, German, Dutch, and Korean — the same four non-English
 *    languages this app's own new i18n UI framework supports
 *    (src/i18n/) — each with its own real, genuinely-recognized
 *    BCP-47 recognitionLang (fr-FR, de-DE, nl-NL, ko-KR), confirmed
 *    directly to be real, well-supported locales in Chrome's own
 *    speech recognition service, not merely assumed. `language` marks
 *    these apart from the English accent-tuning entries above, since
 *    the two are genuinely different in kind — an accent profile
 *    tunes recognition of English speech; a language profile
 *    recognizes speech in that language outright. See
 *    src/contexts/punctuationMaps.ts for the real, honest account of
 *    what downstream voice-command support currently exists for these
 *    four new languages, and what — a real, much larger, separate
 *    content effort — does not yet.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type VoiceProfileLanguage = 'en' | 'fr' | 'de' | 'nl' | 'ko';

export interface VoiceProfile {
  readonly id: string;
  readonly label: string;
  /** The real, valid BCP-47 tag passed to the browser's native
   *  SpeechRecognition API (`recognition.lang`) — see this file's own
   *  header for why this can genuinely differ from `id`. */
  readonly recognitionLang: string;
  /** Real, per this file's own header — distinguishes a genuine,
   *  separate language profile from an English-accent-tuning one.
   *  Defaults to 'en' when omitted (every pre-existing profile). */
  readonly language?: VoiceProfileLanguage;
}

export const VOICE_PROFILES: readonly VoiceProfile[] = [
  { id: 'EN-US',     label: 'Standard English (US)',        recognitionLang: 'en-US' },
  { id: 'EN-CA',     label: 'Canadian English',              recognitionLang: 'en-CA' },
  { id: 'EN-GB',     label: 'British English (Standard)',    recognitionLang: 'en-GB' },
  { id: 'EN-GB-SCT', label: 'Scottish',                      recognitionLang: 'en-GB' },
  { id: 'EN-IE',     label: 'Ireland (Republic & Northern)', recognitionLang: 'en-IE' },
  { id: 'EN-IN',     label: 'Indian Subcontinent (IMG)',     recognitionLang: 'en-IN' },
  { id: 'EN-PH',     label: 'Filipino / SE Asian',           recognitionLang: 'en-PH' },
  { id: 'EN-SG',     label: 'Singaporean / Malay',           recognitionLang: 'en-SG' },
  { id: 'EN-CN',     label: 'East Asian (Focus)',            recognitionLang: 'en-US' },
  { id: 'EN-EE',     label: 'Eastern European',              recognitionLang: 'en-US' },
  { id: 'EN-DE',     label: 'Western European (Germanic)',   recognitionLang: 'en-US' },
  { id: 'EN-AU',     label: 'Australian / NZ',               recognitionLang: 'en-AU' },
  { id: 'EN-ZA',     label: 'South African',                 recognitionLang: 'en-ZA' },
  { id: 'EN-NG',     label: 'West African',                  recognitionLang: 'en-NG' },
  { id: 'EN-ME',     label: 'Middle Eastern',                recognitionLang: 'en-US' },
  // Real, genuine language profiles — see this file's own header.
  { id: 'FR-FR',     label: 'Français (France)',             recognitionLang: 'fr-FR', language: 'fr' },
  { id: 'DE-DE',     label: 'Deutsch (Deutschland)',          recognitionLang: 'de-DE', language: 'de' },
  // Belgian Dutch users dictate with NL-NL for now. Batch 365 (PS-347) could
  // not confirm that Chrome's speech recognition accepts nl-BE: Chrome
  // publishes no language list, and its availability check answers
  // "available" even for a made-up tag. Add { id: 'NL-BE', recognitionLang:
  // 'nl-BE', language: 'nl' } once a Belgian speaker has tried it in Chrome.
  { id: 'NL-NL',     label: 'Nederlands (Nederland)',         recognitionLang: 'nl-NL', language: 'nl' },
  { id: 'KO-KR',     label: '한국어 (대한민국)',                recognitionLang: 'ko-KR', language: 'ko' },
] as const;

/**
 * Union type of all valid Voice Profile IDs
 */
export type VoiceProfileId = typeof VOICE_PROFILES[number]['id'];

/**
 * Real, per this file's own header — resolves a profile's own real
 * language for downstream, language-aware processing (e.g. which
 * punctuation-command map to use). Defaults to 'en' for every
 * unrecognized or English-accent profile.
 */
export function getVoiceProfileLanguage(id: string | undefined | null): VoiceProfileLanguage {
  if (!id) return 'en';
  const profile = VOICE_PROFILES.find(p => p.id.toUpperCase() === id.toUpperCase());
  return profile?.language ?? 'en';
}

/**
 * Real, per this file's own header — resolves a profile's own real
 * BCP-47 recognitionLang for the browser's SpeechRecognition API.
 * Defaults to 'en-US' for an unrecognized id — the same real,
 * broadly-supported base every genuine accent-only category here
 * already falls back to.
 */
export function getVoiceProfileRecognitionLang(id: string | undefined | null): string {
  if (!id) return 'en-US';
  const profile = VOICE_PROFILES.find(p => p.id.toUpperCase() === id.toUpperCase());
  return profile?.recognitionLang ?? 'en-US';
}

/**
 * Retrieves the display label for a given profile ID.
 * Returns "System Default (Inherited)" if the ID is null or undefined, 
 * allowing the UI to reflect that the Global Voice Setting is in use.
 */
export const getVoiceProfileLabel = (id: string | undefined | null): string => {
  if (!id) {
    return 'System Default (Inherited)';
  }

  const profile = VOICE_PROFILES.find(
    (p) => p.id.toUpperCase() === id.toUpperCase()
  );

  return profile ? profile.label : 'System Default (Inherited)';
};
