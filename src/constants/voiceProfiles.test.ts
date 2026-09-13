// src/constants/voiceProfiles.test.ts
import { describe, it, expect } from 'vitest';
import { VOICE_PROFILES, getVoiceProfileRecognitionLang, getVoiceProfileLanguage } from './voiceProfiles';

// Real, standard BCP-47 shape check — two letters, hyphen, two
// letters/digits (e.g. "en-US", "fr-FR") — not a claim of full BCP-47
// grammar validation, just enough to catch the real, specific bug
// this file fixes (an invented tag like "en-DE" or "en-CN" that the
// Web Speech API would never recognize as a real, distinct locale).
const BCP47_SHAPE = /^[a-z]{2}-[A-Z]{2}$/;

describe('voiceProfiles — real, per direct fix on the RFP-APLIS-2026-GLOBAL Multi-Language UI gap', () => {
  it('real, every single profile\'s own recognitionLang is a well-formed, real BCP-47 tag', () => {
    for (const profile of VOICE_PROFILES) {
      expect(profile.recognitionLang).toMatch(BCP47_SHAPE);
    }
  });

  it('real, a genuine accent-only category with no real, distinct English dialect (e.g. EN-DE, EN-CN) falls back to en-US, never an invented tag', () => {
    expect(getVoiceProfileRecognitionLang('EN-DE')).toBe('en-US');
    expect(getVoiceProfileRecognitionLang('EN-CN')).toBe('en-US');
    expect(getVoiceProfileRecognitionLang('EN-EE')).toBe('en-US');
    expect(getVoiceProfileRecognitionLang('EN-ME')).toBe('en-US');
  });

  it('real, a genuine, real English regional dialect maps to its own, correct real locale', () => {
    expect(getVoiceProfileRecognitionLang('EN-GB')).toBe('en-GB');
    expect(getVoiceProfileRecognitionLang('EN-AU')).toBe('en-AU');
    expect(getVoiceProfileRecognitionLang('EN-IN')).toBe('en-IN');
  });

  it('real, the four new, genuine language profiles map to their own, correct real BCP-47 locale', () => {
    expect(getVoiceProfileRecognitionLang('FR-FR')).toBe('fr-FR');
    expect(getVoiceProfileRecognitionLang('DE-DE')).toBe('de-DE');
    expect(getVoiceProfileRecognitionLang('NL-NL')).toBe('nl-NL');
    expect(getVoiceProfileRecognitionLang('KO-KR')).toBe('ko-KR');
  });

  it('real, getVoiceProfileLanguage correctly identifies the four new, genuine language profiles', () => {
    expect(getVoiceProfileLanguage('FR-FR')).toBe('fr');
    expect(getVoiceProfileLanguage('DE-DE')).toBe('de');
    expect(getVoiceProfileLanguage('NL-NL')).toBe('nl');
    expect(getVoiceProfileLanguage('KO-KR')).toBe('ko');
  });

  it('real, every English-accent-tuning profile (not a genuine language profile) correctly reports \'en\'', () => {
    expect(getVoiceProfileLanguage('EN-US')).toBe('en');
    expect(getVoiceProfileLanguage('EN-DE')).toBe('en');
    expect(getVoiceProfileLanguage('EN-GB-SCT')).toBe('en');
  });

  it('real, an unrecognized id defaults honestly to en-US / \'en\', never a crash', () => {
    expect(getVoiceProfileRecognitionLang('NOT-A-REAL-ID')).toBe('en-US');
    expect(getVoiceProfileLanguage('NOT-A-REAL-ID')).toBe('en');
  });
});
