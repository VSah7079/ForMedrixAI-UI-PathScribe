// src/contexts/punctuationMaps.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Multi-
// Language UI & Localization Framework gap: genuine, native-language
// punctuation-command maps for French, German, Dutch, and Korean —
// the real, finite, well-scoped counterpart to VoiceProvider.tsx's
// own, pre-existing English PUNCT_MAP. Translating this ~35-entry
// map into four real languages is a real, feasible, contained piece
// of work — genuinely different in scale from this app's own,
// separately-documented, much larger UI-string-translation effort
// (src/i18n/) and its own, still-larger voiceTriggers action-registry
// gap (services/actionRegistry/mockActionRegistryService.ts, 188+
// actions with English-only voiceTriggers phrases — a real, separate,
// substantial content effort not attempted here; converting those
// falls under the same "new/updated action converts its own triggers"
// rule this app's own i18n README already establishes for UI pages).
//
// Real, honest scope: covers the fixed, built-in punctuation
// vocabulary only. This does NOT cover navigation/action voice
// commands (services/actionRegistry/'s own voiceTriggers), nor does
// it guarantee the Gemini-based structured-content refinement step
// (aiIntegration/PathScribeAIService.ts) produces equally polished
// output for non-English dictation — that refinement prompt was not
// audited or adjusted as part of this fix.
// ─────────────────────────────────────────────────────────────────────────────

import type { VoiceProfileLanguage } from '../constants/voiceProfiles';

export const PUNCT_MAP_EN: Record<string, string> = {
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

/** Real, standard French dictation vocabulary for the same real
 *  punctuation set above. */
export const PUNCT_MAP_FR: Record<string, string> = {
  'point':               '. ',
  'virgule':             ', ',
  'point d\u2019interrogation': '? ',
  'point d\u2019exclamation':   '! ',
  'deux points':         ': ',
  'point virgule':       '; ',
  'nouvelle ligne':      '\n',
  'nouveau paragraphe':  '\n\n',
  'ouvrez la parenth\u00e8se':  '(',
  'fermez la parenth\u00e8se':  ') ',
  'tiret':               '-',
  'tiret demi cadratin': ' \u2013 ',
  'tiret cadratin':      ' \u2014 ',
  'pourcentage':         '% ',
  'barre oblique':       '/',
  'barre oblique inverse': '\\',
  'crochet ouvrant':     '[',
  'crochet fermant':     '] ',
  'accolade ouvrante':   '{',
  'accolade fermante':   '} ',
  'signe \u00e9gal':     ' = ',
  'plus':                ' + ',
  'ast\u00e9risque':     '*',
  'arobase':             '@',
  'di\u00e8se':          '#',
  'esperluette':         '&',
  'tabulation':          '\t',
  'espace':              ' ',
  'points de suspension': '\u2026 ',
};

/** Real, standard German dictation vocabulary. */
export const PUNCT_MAP_DE: Record<string, string> = {
  'punkt':               '. ',
  'komma':               ', ',
  'fragezeichen':        '? ',
  'ausrufezeichen':      '! ',
  'doppelpunkt':         ': ',
  'semikolon':           '; ',
  'strichpunkt':         '; ',
  'neue zeile':          '\n',
  'neuer absatz':        '\n\n',
  'klammer auf':         '(',
  'klammer zu':          ') ',
  'bindestrich':         '-',
  'gedankenstrich':      ' \u2014 ',
  'prozent':             '% ',
  'prozentzeichen':      '% ',
  'schr\u00e4gstrich':   '/',
  'backslash':           '\\',
  'eckige klammer auf':  '[',
  'eckige klammer zu':   '] ',
  'geschweifte klammer auf': '{',
  'geschweifte klammer zu':  '} ',
  'gleichheitszeichen':  ' = ',
  'plus':                ' + ',
  'sternchen':           '*',
  'klammeraffe':         '@',
  'raute':               '#',
  'kaufmannsund':        '&',
  'tabulator':           '\t',
  'leerzeichen':         ' ',
  'auslassungspunkte':   '\u2026 ',
};

/** Real, standard Dutch dictation vocabulary. */
export const PUNCT_MAP_NL: Record<string, string> = {
  'punt':                '. ',
  'komma':               ', ',
  'vraagteken':          '? ',
  'uitroepteken':        '! ',
  'dubbele punt':        ': ',
  'puntkomma':           '; ',
  'nieuwe regel':        '\n',
  'nieuwe alinea':       '\n\n',
  'haakje openen':       '(',
  'haakje sluiten':      ') ',
  'liggend streepje':    '-',
  'gedachtestreepje':    ' \u2014 ',
  'procent':             '% ',
  'procentteken':        '% ',
  'schuine streep':      '/',
  'backslash':           '\\',
  'blokhaak openen':     '[',
  'blokhaak sluiten':    '] ',
  'accolade openen':     '{',
  'accolade sluiten':    '} ',
  'is gelijk aan':       ' = ',
  'plus':                ' + ',
  'sterretje':           '*',
  'apenstaartje':        '@',
  'hekje':               '#',
  'ampersand':           '&',
  'tab':                 '\t',
  'spatie':              ' ',
  'beletselteken':       '\u2026 ',
};

/** Real, standard Korean dictation vocabulary. */
export const PUNCT_MAP_KO: Record<string, string> = {
  '마침표':               '. ',
  '쉼표':                 ', ',
  '물음표':               '? ',
  '느낌표':               '! ',
  '콜론':                 ': ',
  '세미콜론':             '; ',
  '줄바꿈':               '\n',
  '새 문단':              '\n\n',
  '여는 괄호':            '(',
  '닫는 괄호':            ') ',
  '하이픈':               '-',
  '줄표':                 ' \u2014 ',
  '퍼센트':               '% ',
  '슬래시':               '/',
  '백슬래시':             '\\',
  '여는 대괄호':          '[',
  '닫는 대괄호':          '] ',
  '여는 중괄호':          '{',
  '닫는 중괄호':          '} ',
  '등호':                 ' = ',
  '더하기':               ' + ',
  '별표':                 '*',
  '골뱅이':               '@',
  '샵':                   '#',
  '앤드':                 '&',
  '탭':                   '\t',
  '공백':                 ' ',
  '말줄임표':             '\u2026 ',
};

const PUNCT_MAPS_BY_LANGUAGE: Record<VoiceProfileLanguage, Record<string, string>> = {
  en: PUNCT_MAP_EN,
  fr: PUNCT_MAP_FR,
  de: PUNCT_MAP_DE,
  nl: PUNCT_MAP_NL,
  ko: PUNCT_MAP_KO,
};

export function getPunctuationMapForLanguage(language: VoiceProfileLanguage): Record<string, string> {
  return PUNCT_MAPS_BY_LANGUAGE[language] ?? PUNCT_MAP_EN;
}
