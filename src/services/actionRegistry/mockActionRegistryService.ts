import { IActionRegistryService, SystemAction } from './IActionRegistryService';
import { ACTION_MAP, VOICE_CONTEXT } from '../../constants/systemActions';
import type { VoiceProfileLanguage } from '../../constants/voiceProfiles';

// ─────────────────────────────────────────────────────────────────────────────
// Categories always eligible regardless of current context
// ─────────────────────────────────────────────────────────────────────────────
const GLOBAL_CATEGORIES = new Set(['SYSTEM', 'NAVIGATION']);

// ─────────────────────────────────────────────────────────────────────────────
// Actions dispatched via custom DOM events rather than internalKey keyboard
// events — either React state targets, browser-reserved keys, or dictation.
// Pattern: PATHSCRIBE_<ACTION_ID>
// ─────────────────────────────────────────────────────────────────────────────
const CUSTOM_EVENT_ACTIONS = new Set([
  //Delegation Module
  'DELEGATE_PEER_REVIEW', 
  'DELEGATE_FORMAL_CONSULT', 
  'DELEGATE_FULL_TRANSFER',
  'DELEGATE_CONFIRM',
  'OPEN_DELEGATE_MODAL',
  // Page navigation (React Router)
  'OPEN_MESSAGES', 'OPEN_WORKLIST', 'OPEN_CONFIGURATION',
  'OPEN_SEARCH', 'OPEN_AUDIT', 'OPEN_CONTRIBUTION', 'OPEN_HOME',
  'GO_BACK', 'GO_FORWARD',
  // Case navigation (React Router)
  'NEXT_CASE', 'PREVIOUS_CASE',
  // Tab switching (component state)
  'NEXT_TAB', 'PREVIOUS_TAB',
  // Table navigation (component state)
  'TABLE_NEXT', 'TABLE_PREVIOUS', 'TABLE_PAGE_DOWN', 'TABLE_PAGE_UP',
  'TABLE_FIRST', 'TABLE_LAST', 'TABLE_SELECT', 'TABLE_SELECT_ALL',
  'TABLE_DESELECT_ALL', 'TABLE_OPEN_SELECTED', 'TABLE_REFRESH',
  'TABLE_SORT_DATE', 'TABLE_SORT_PRIORITY', 'TABLE_SORT_STATUS',
  'TABLE_FILTER_URGENT', 'TABLE_FILTER_COMPLETED', 'TABLE_FILTER_PHYSICIAN', 'TABLE_CLEAR_FILTER', 'TABLE_CLEAR_SORT',
  'TABLE_SEARCH', 'TABLE_CLEAR_SEARCH', 'TABLE_REFINE_SEARCH',
  'READ_FLAGS', 'READ_SPECIMEN',
  'TABLE_SORT_BY_COLUMN',
  'TABLE_DELETE',
  // Labels — Step 6 of the label-printing build plan
  'PRINT_CURRENT_CASSETTE', 'BATCH_PRINT_CASE_LABELS',
  // Messages (component state in AppShell)
  'MSG_NEXT', 'MSG_PREVIOUS', 'MSG_REPLY', 'MSG_DELETE',
  'MSG_MARK_READ', 'MSG_MARK_READ_ALL', 'MSG_MARK_UNREAD', 'MSG_MARK_URGENT',
  'MSG_COMPOSE', 'MSG_SEND', 'MSG_CLOSE', 'MSG_SEARCH', 'MSG_EDIT',
  'MSG_VIEW_DELETED', 'MSG_VIEW_MESSAGES', 'MSG_RESTORE',
  'MSG_DELETE_ALL', 'MSG_URGENT',
  'MSG_CLEAR_SUBJECT', 'MSG_CLEAR_BODY',
  'MSG_GOTO_SUBJECT', 'MSG_GOTO_BODY',
  'MSG_RECIPIENT_SEARCH', 'MSG_RECIPIENT_ADD', 'MSG_SECURE_EMAIL',
  // Home page
  'OPEN_ENHANCEMENT_REQUEST', 'OPEN_TESTING_FEEDBACK',
  'VIEW_HELP', 'OPEN_RESOURCES', 'SYSTEM_LOGOUT',
  // Dictation (VoiceProvider)
  'ENTER_GROSS', 'ENTER_MICRO', 'ENTER_DIAGNOSIS', 'ENTER_ADDENDUM',
  // Synoptic field navigation
  'NEXT_UNANSWERED', 'NEXT_REQUIRED', 'CONFIRM_FIELD', 'EDIT_FIELD', 'SKIP_FIELD',
  // Synoptic view toggles
  'FULL_VIEW', 'TABBED_VIEW', 'MAX_VIEW', 'MIN_VIEW', 'PREVIEW_REPORT',
  // Synoptic modal openers
  'VOICE_CASE_COMMENT', 'VOICE_SPECIMEN_COMMENT', 'VOICE_INTERNAL_NOTE', 'VOICE_ADD_SYNOPTIC', 'VOICE_FLAGS',
  // Internal notes drawer actions
  'NOTE_ADD', 'NOTE_DICTATE', 'NOTE_VISIBILITY_PRIVATE', 'NOTE_VISIBILITY_SHARED', 'NOTE_SAVE', 'NOTE_CANCEL', 'NOTE_CLOSE',
  // Finalisation flow
  'OPEN_PRE_FINALISE', 'FINALISE_AND_NEXT', 'FINALISE_CONFIRM', 'FINALISE_CANCEL',
  // Post-finalization
  'ADD_ADDENDUM', 'ADD_AMENDMENT', 'SIGNOUT_NEXT',
  // Navigation + cancel
  'GOTO_CODES', 'SELECT_SPECIMEN', 'OPEN_HISTORY', 'CLOSE_HISTORY', 'VOICE_CANCEL',
  // Codes panel
  'VOICE_ADD_CODE',
  // AI Review Mode (triage before finalize)
  'AI_REVIEW_CONFIRM', 'AI_REVIEW_OVERRIDE', 'AI_REVIEW_SKIP', 'AI_REVIEW_NEXT', 'AI_REVIEW_CANCEL',
  // Pool Case actions
  'POOL_ACCEPT_CASE', 'POOL_PASS_CASE', 'INTRAOP_LOG_SURGEON_REPORT',
  // Case Team actions
  'OPEN_CASE_TEAM', 'CASE_TEAM_ADD', 'CASE_TEAM_ASSIGN',
  // Worklist participation filters
  'TABLE_FILTER_PARTICIPATING', 'TABLE_FILTER_COUNTERSIGN', 'TABLE_FILTER_POOL',
  // Config navigation
  'OPEN_ROUTING_RULES', 'TEST_ROUTING', 'OPEN_PARTICIPATION_TYPES',
  'COMP_OPEN_SIDECAR', 'COMP_ORDER_OPEN', 'COMP_ORDER_PLACE', 'COMP_ORDER_CANCEL',
  'FLAG_OPEN_MANAGER', 'FLAG_APPLY_STAT',
  'TAT_SHOW_FIRST_TOUCH', 'TAT_SHOW_TOTAL_CASE', 'TAT_SHOW_FROZEN_SECTION',
  'TAT_SHOW_GROSSING', 'TAT_SHOW_SIGN_OUT', 'TAT_SHOW_COLD_ISCHEMIA',
  'TAT_SHOW_CONSULT_RESPONSE', 'TAT_SHOW_CONSULT_AWAITING',
  'FOCUS_CASE_SEARCH', 'DELEGATE_CONSULTATION',
  'SAVE_DRAFT', 'DISCARD_CHANGES', 'TEMPLATE_SELECT',
  // Search page
  'SEARCH_EXECUTE', 'SEARCH_CLEAR', 'SEARCH_LOAD_SAVED',
  // Flag manager
  'FLAG_SELECT_CASE', 'FLAG_SELECT_ALL_SPECIMENS', 'FLAG_DESELECT_ALL', 'FLAG_SAVE', 'FLAG_CANCEL',
  // Real, per direct guidance's own confirmed "fully voice ready"
  // request — the Cytology Material/Synoptic drawers and Narrative
  // Compilation engine have no real, pre-existing keyboard/pedal
  // mapping for these actions' own F26 internalKey group, so a real,
  // listenable custom event (not a simulated, unmapped keydown) is
  // the only way any of these can actually do anything.
  'CYTOLOGY_OPEN_MATERIAL', 'CYTOLOGY_ADD_RESIDUAL_FLUID', 'CYTOLOGY_ADD_CELL_BLOCK',
  'CYTOLOGY_OPEN_SYNOPTIC', 'CYTOLOGY_SAVE_SYNOPTIC', 'CYTOLOGY_INSERT_NARRATIVE',
  'CYTOLOGY_SELECT_TEMPLATE_THYROID', 'CYTOLOGY_SELECT_TEMPLATE_PANCREATICOBILIARY',
  'CYTOLOGY_SELECT_TEMPLATE_SALIVARY_GLAND', 'CYTOLOGY_SELECT_TEMPLATE_LYMPH_NODE',
  'CYTOLOGY_SELECT_TEMPLATE_URINE',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Full action registry
//
// VOICE TRIGGER RULES
// ───────────────────
// · Minimum two words for most triggers (prevents mid-sentence false fires)
// · Single-word exceptions: unambiguous domain words in narrow contexts
//   e.g. 'worklist', 'reply', 'restore' — unlikely in normal speech for that context
// · Compound words include both joined and split variants for Web Speech API
// · SIGN_OUT requires 'case' qualifier to avoid collision with system logout
// · 'save' alone removed — fires too easily mid-sentence
// · 'macro' alone removed — appears naturally in clinical dictation
//
// DELETE DISAMBIGUATION (Messages)
// ──────────────────────────────────
// "delete" means different things depending on UI state:
//   Normal view  → MSG_DELETE   (soft delete focused message)
//   Edit mode    → MSG_DELETE   (soft delete selected messages — same action, UI handles state)
//   Deleted view → MSG_DELETE   (permanent delete — AppShell checks filterType)
//   "delete all" → MSG_DELETE_ALL (always explicit)
// The AppShell listener checks filterType/isEditing to route correctly.
// ─────────────────────────────────────────────────────────────────────────────

const SEED_ACTIONS: SystemAction[] = [

// ── LABELS — Step 6 of the label-printing build plan ────────────────────
  {
    id: 'PRINT_CURRENT_CASSETTE',
    label: 'Print Current Cassette',
    category: 'SYNOPTIC',
    shortcut: 'Alt+P',
    internalKey: 'F13+PS276',
    voiceTriggers: ['print current cassette', 'print this cassette', 'print cassette'],
    voiceTriggersByLanguage: {
      fr: ["imprimer la cassette actuelle", "imprimer cette cassette", "imprimer la cassette"],
      de: ["aktuelle kassette drucken", "diese kassette drucken", "kassette drucken"],
      nl: ["huidige cassette afdrukken", "deze cassette afdrukken", "cassette afdrukken"],
      ko: ["현재 카세트 인쇄", "이 카세트 인쇄", "카세트 인쇄"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'BATCH_PRINT_CASE_LABELS',
    label: 'Batch Print Case Slides',
    category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+P',
    internalKey: 'F13+PS277',
    voiceTriggers: ['batch print case slides', 'print all cassettes', 'print all cassettes for case'],
    voiceTriggersByLanguage: {
      fr: ["imprimer toutes les lames", "imprimer toutes les cassettes", "imprimer toutes les cassettes du dossier"],
      de: ["alle objektträger drucken", "alle kassetten drucken", "alle kassetten für den fall drucken"],
      nl: ["alle objectglaasjes afdrukken", "alle cassettes afdrukken", "alle cassettes voor deze zaak afdrukken"],
      ko: ["모든 슬라이드 인쇄", "모든 카세트 인쇄", "증례의 모든 카세트 인쇄"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },

// ── DELEGATION — Case Hand-off & Review ────────────────────────────────────
  {
    id: 'OPEN_DELEGATE_MODAL', 
    label: 'Open Delegation Menu', 
    category: 'SYNOPTIC',
    shortcut: 'Alt+D', 
    internalKey: 'F13+PS150',
    voiceTriggers: ['open delegation', 'delegate case', 'transfer case', 'show handoff'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir la délégation", "déléguer le dossier", "transférer le dossier"],
      de: ["delegation öffnen", "fall delegieren", "fall übertragen"],
      nl: ["delegatie openen", "zaak delegeren", "zaak overdragen"],
      ko: ["위임 열기", "증례 위임", "증례 이전"],
    },
    learnedTriggers: [], 
    requiredRole: 'Pathologist', 
    isActive: true,
  },
  {
    id: 'DELEGATE_PEER_REVIEW', 
    label: 'Select Peer Review', 
    category: 'SYNOPTIC',
    shortcut: 'Alt+1', 
    internalKey: 'F13+PS151',
    voiceTriggers: ['request peer review', 'internal review', 'informal opinion'],
    voiceTriggersByLanguage: {
      fr: ["demander une revue par les pairs", "revue interne", "avis informel"],
      de: ["kollegiale überprüfung anfordern", "interne überprüfung", "informelle meinung"],
      nl: ["collegiale toetsing aanvragen", "interne toetsing", "informele mening"],
      ko: ["동료 검토 요청", "내부 검토", "비공식 의견"],
    },
    learnedTriggers: [], 
    requiredRole: 'Pathologist', 
    isActive: true,
  },
  {
    id: 'DELEGATE_FORMAL_CONSULT', 
    label: 'Select Formal Consult', 
    category: 'SYNOPTIC',
    shortcut: 'Alt+2', 
    internalKey: 'F13+PS152',
    voiceTriggers: ['formal consultation', 'add consultant', 'official consult'],
    voiceTriggersByLanguage: {
      fr: ["consultation formelle", "ajouter un consultant", "consultation officielle"],
      de: ["formelle konsultation", "berater hinzufügen", "offizielle konsultation"],
      nl: ["formele consultatie", "adviseur toevoegen", "officiële consultatie"],
      ko: ["공식 자문", "자문의 추가", "공식 협진"],
    },
    learnedTriggers: [], 
    requiredRole: 'Pathologist', 
    isActive: true,
  },
  {
    id: 'DELEGATE_FULL_TRANSFER', 
    label: 'Select Full Transfer', 
    category: 'SYNOPTIC',
    shortcut: 'Alt+3', 
    internalKey: 'F13+PS153',
    voiceTriggers: ['full transfer', 'transfer ownership', 'assign to pool'],
    voiceTriggersByLanguage: {
      fr: ["transfert complet", "transférer la propriété", "affecter au pool"],
      de: ["vollständige übertragung", "eigentum übertragen", "dem pool zuweisen"],
      nl: ["volledige overdracht", "eigendom overdragen", "toewijzen aan pool"],
      ko: ["완전 이전", "소유권 이전", "풀에 배정"],
    },
    learnedTriggers: [], 
    requiredRole: 'Pathologist', 
    isActive: true,
  },
  {
    id: 'DELEGATE_CONFIRM', 
    label: 'Confirm Delegation', 
    category: 'SYNOPTIC',
    shortcut: 'Ctrl+Enter', 
    internalKey: 'F13+PS154',
    voiceTriggers: ['confirm delegation', 'send case', 'complete transfer'],
    voiceTriggersByLanguage: {
      fr: ["confirmer la délégation", "envoyer le dossier", "terminer le transfert"],
      de: ["delegation bestätigen", "fall senden", "übertragung abschließen"],
      nl: ["delegatie bevestigen", "zaak verzenden", "overdracht voltooien"],
      ko: ["위임 확인", "증례 전송", "이전 완료"],
    },
    learnedTriggers: [], 
    requiredRole: 'Pathologist', 
    isActive: true,
  },

  // ── AI REVIEW MODE — Triage before finalize ──────────────────────────────
  {
    id: 'AI_REVIEW_CONFIRM',
    label: 'Confirm AI Finding',
    category: 'SYNOPTIC',
    shortcut: 'Space',
    internalKey: 'F13+PS160',
    voiceTriggers: ['confirm', 'accept', 'agree', 'correct', 'confirm finding', 'accept finding'],
    voiceTriggersByLanguage: {
      fr: ['confirmer', 'accepter', 'd\u2019accord', 'correct', 'confirmer le résultat'],
      de: ['bestätigen', 'akzeptieren', 'einverstanden', 'korrekt', 'befund bestätigen'],
      nl: ['bevestigen', 'accepteren', 'akkoord', 'correct', 'bevinding bevestigen'],
      ko: ['확인', '수락', '동의', '맞음', '소견 확인'],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'AI_REVIEW_OVERRIDE',
    label: 'Override AI Finding',
    category: 'SYNOPTIC',
    shortcut: 'O',
    internalKey: 'F13+PS161',
    voiceTriggers: ['override', 'incorrect', 'wrong', 'override finding', 'ai is wrong', 'change this'],
    voiceTriggersByLanguage: {
      fr: ['annuler', 'incorrect', 'faux', 'annuler le résultat', 'l\u2019ia se trompe'],
      de: ['überschreiben', 'falsch', 'inkorrekt', 'befund überschreiben', 'ki liegt falsch'],
      nl: ['overschrijven', 'onjuist', 'fout', 'bevinding overschrijven', 'ai heeft het mis'],
      ko: ['재정의', '틀림', '오류', '소견 재정의', 'AI가 틀렸어요'],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'AI_REVIEW_SKIP',
    label: 'Skip AI Finding',
    category: 'SYNOPTIC',
    shortcut: 'S',
    internalKey: 'F13+PS162',
    voiceTriggers: ['skip', 'skip this', 'skip finding'],
    voiceTriggersByLanguage: {
      fr: ['passer', 'passer ceci', 'passer le résultat'],
      de: ['überspringen', 'dies überspringen', 'befund überspringen'],
      nl: ['overslaan', 'dit overslaan', 'bevinding overslaan'],
      ko: ['건너뛰기', '이것 건너뛰기', '소견 건너뛰기'],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'AI_REVIEW_CANCEL',
    label: 'Cancel AI Review',
    category: 'SYNOPTIC',
    shortcut: 'Escape',
    internalKey: 'F13+PS163',
    voiceTriggers: ['cancel review', 'exit review', 'stop review'],
    voiceTriggersByLanguage: {
      fr: ["annuler la revue", "quitter la revue", "arrêter la revue"],
      de: ["überprüfung abbrechen", "überprüfung verlassen", "überprüfung stoppen"],
      nl: ["beoordeling annuleren", "beoordeling verlaten", "beoordeling stoppen"],
      ko: ["검토 취소", "검토 종료", "검토 중지"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },

  // ── POOL CASES ────────────────────────────────────────────────────────────
  {
    id: 'POOL_ACCEPT_CASE',
    label: 'Accept Pool Case',
    category: 'SYNOPTIC',
    shortcut: 'Alt+A',
    internalKey: 'F13+PS165',
    voiceTriggers: ['accept case', 'take this case', 'assign to me'],
    voiceTriggersByLanguage: {
      fr: ["accepter le dossier", "prendre ce dossier", "m'assigner"],
      de: ["fall annehmen", "diesen fall übernehmen", "mir zuweisen"],
      nl: ["zaak accepteren", "deze zaak overnemen", "aan mij toewijzen"],
      ko: ["증례 수락", "이 증례 맡기", "나에게 배정"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'INTRAOP_LOG_SURGEON_REPORT',
    label: 'Log Surgeon Report',
    category: 'SYNOPTIC',
    shortcut: 'Alt+L',
    internalKey: 'F13+PS275',
    // Only meaningful — and only listened for — while a single entry's
    // "Report to Surgeon" note field is already open (see
    // IntraopQueuePage.tsx), the same way POOL_ACCEPT_CASE is only
    // listened for while its modal is open. There's never more than one
    // possible target, so no separate "which entry" selection step is
    // needed.
    voiceTriggers: ['report logged', 'surgeon notified', 'log the report', 'confirm report'],
    voiceTriggersByLanguage: {
      fr: ["rapport enregistré", "chirurgien informé", "enregistrer le rapport"],
      de: ["bericht protokolliert", "chirurg benachrichtigt", "bericht protokollieren"],
      nl: ["rapport gelogd", "chirurg geïnformeerd", "rapport loggen"],
      ko: ["보고 기록됨", "집도의에게 통보됨", "보고 기록"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'POOL_PASS_CASE',
    label: 'Pass Pool Case',
    category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+P',
    internalKey: 'F13+PS166',
    voiceTriggers: ['pass case', 'skip case', 'return to pool', 'pass'],
    voiceTriggersByLanguage: {
      fr: ["passer le dossier", "ignorer le dossier", "retourner au pool"],
      de: ["fall weitergeben", "fall überspringen", "zurück zum pool"],
      nl: ["zaak doorgeven", "zaak overslaan", "terug naar pool"],
      ko: ["증례 넘기기", "증례 건너뛰기", "풀로 반환"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },

  // ── SYSTEM — always available ─────────────────────────────────────────────
  {
    id: 'OPEN_HOME', label: 'Go Home', category: 'SYSTEM',
    shortcut: 'Alt+H', internalKey: 'F13+PS300',
    voiceTriggers: ['go home', 'home page', 'go to home', 'open home'],
    voiceTriggersByLanguage: {
      fr: ['aller à l\u2019accueil', 'page d\u2019accueil', 'accueil', 'ouvrir l\u2019accueil'],
      de: ['zur startseite', 'startseite', 'startseite öffnen'],
      nl: ['naar start', 'startpagina', 'start openen', 'naar startpagina'],
      ko: ['홈으로', '홈 화면', '홈 열기', '메인으로'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_MESSAGES', label: 'Open Messages', category: 'SYSTEM',
    shortcut: 'Alt+I', internalKey: ACTION_MAP['system.openMessages']?.internalKey ?? 'F13+PS001',
    voiceTriggers: ['open messages', 'open message', 'show messages', 'messages'],
    voiceTriggersByLanguage: {
      fr: ['ouvrir les messages', 'afficher les messages', 'messages'],
      de: ['nachrichten öffnen', 'nachrichten anzeigen', 'nachrichten'],
      nl: ['berichten openen', 'berichten tonen', 'berichten'],
      ko: ['메시지 열기', '메시지 보기', '메시지'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_WORKLIST', label: 'Open Worklist', category: 'NAVIGATION',
    shortcut: 'Alt+W', internalKey: ACTION_MAP['system.openWorklist']?.internalKey ?? 'F13+PS002',
    voiceTriggers: [
      'open worklist', 'go to worklist', 'show worklist', 'worklist',
      'open work list', 'go to work list', 'show work list', 'work list',
    ],
    voiceTriggersByLanguage: {
      fr: ['ouvrir la liste de travail', 'aller à la liste de travail', 'afficher la liste de travail', 'liste de travail'],
      de: ['arbeitsliste öffnen', 'zur arbeitsliste', 'arbeitsliste anzeigen', 'arbeitsliste'],
      nl: ['werklijst openen', 'naar werklijst', 'werklijst tonen', 'werklijst'],
      ko: ['작업 목록 열기', '작업 목록으로', '작업 목록 보기', '작업 목록'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_INTRAOP_QUEUE', label: 'Open Intraop Queue', category: 'NAVIGATION',
    shortcut: 'Alt+O', internalKey: 'F13+PS270',
    voiceTriggers: [
      'open intraop queue', 'show intraop queue', 'open intraoperative queue',
      'unlinked intraoperative entries', 'intraop queue',
    ],
    voiceTriggersByLanguage: {
      fr: ["ouvrir la file peropératoire", "afficher la file peropératoire", "file peropératoire"],
      de: ["intraoperative warteschlange öffnen", "intraoperative warteschlange anzeigen", "intraoperative warteschlange"],
      nl: ["intraoperatieve wachtrij openen", "intraoperatieve wachtrij tonen", "intraoperatieve wachtrij"],
      ko: ["수술중 대기열 열기", "수술중 대기열 보기", "수술중 대기열"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'INTRAOP_START_NEW_ENTRY', label: 'Start New Intraop Entry', category: 'NAVIGATION',
    shortcut: 'Alt+S', internalKey: 'F13+PS271',
    voiceTriggers: ['start new intraop entry', 'start intraop entry', 'new intraop entry', 'start entry'],
    voiceTriggersByLanguage: {
      fr: ["démarrer une nouvelle entrée peropératoire", "nouvelle entrée peropératoire"],
      de: ["neuen intraoperativen eintrag starten", "neuer intraoperativer eintrag"],
      nl: ["nieuwe intraoperatieve invoer starten", "nieuwe intraoperatieve invoer"],
      ko: ["새 수술중 항목 시작", "새 수술중 항목"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'INTRAOP_TOUCH_PREP_PERFORMED', label: 'Log Touch Prep Performed', category: 'NAVIGATION',
    shortcut: 'Alt+L', internalKey: 'F13+PS272',
    voiceTriggers: ['log touch prep performed', 'touch prep performed', 'touch prep done'],
    voiceTriggersByLanguage: {
      fr: ["préparation par apposition effectuée", "apposition effectuée"],
      de: ["touch-prep durchgeführt", "tupfpräparat durchgeführt"],
      nl: ["touch-prep uitgevoerd", "afdrukpreparaat uitgevoerd"],
      ko: ["압인도말 시행 기록", "압인도말 완료"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'INTRAOP_TOUCH_PREP_SKIP', label: 'Skip Touch Prep', category: 'NAVIGATION',
    shortcut: 'Alt+T', internalKey: 'F13+PS273',
    voiceTriggers: ['skip touch prep', 'no touch prep', 'direct to frozen'],
    voiceTriggersByLanguage: {
      fr: ["ignorer l'apposition", "pas d'apposition", "directement à la coupe congelée"],
      de: ["touch-prep überspringen", "kein touch-prep", "direkt zum gefrierschnitt"],
      nl: ["touch-prep overslaan", "geen touch-prep", "direct naar vriescoupe"],
      ko: ["압인도말 생략", "압인도말 없음", "동결절편으로 직행"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'INTRAOP_FROZEN_SECTION_CUT', label: 'Log Frozen Section Cut', category: 'NAVIGATION',
    shortcut: 'Alt+Shift+L', internalKey: 'F13+PS274',
    voiceTriggers: ['log frozen section cut', 'frozen section cut', 'frozen cut logged'],
    voiceTriggersByLanguage: {
      fr: ["coupe congelée effectuée", "coupe congelée enregistrée"],
      de: ["gefrierschnitt durchgeführt", "gefrierschnitt protokolliert"],
      nl: ["vriescoupe gesneden", "vriescoupe gelogd"],
      ko: ["동결절편 절단 기록", "동결절편 절단 완료"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    // Real, new — per direct guidance on wiring the intraop workflow
    // for voice: reuses INTRAOP_FROZEN_SECTION_CUT above and
    // INTRAOP_TOUCH_PREP_PERFORMED for the two preparation types with
    // an existing analog; these three cover the remaining types with
    // no prior action id at all. Each logs exactly ONE real
    // PreparationOutput per utterance — never a spoken count — repeat
    // the phrase to log another, same as pressing the button again.
    id: 'INTRAOP_LOG_SQUASH_PREP', label: 'Log Squash Prep', category: 'NAVIGATION',
    shortcut: 'Alt+Shift+S', internalKey: 'F13+PS279',
    voiceTriggers: ['log squash prep', 'squash prep', 'squash prep done'],
    voiceTriggersByLanguage: {
      fr: ["préparation par écrasement effectuée", "préparation par écrasement"],
      de: ["squash-präparat durchgeführt", "squash-präparat"],
      nl: ["kneuspreparaat uitgevoerd", "kneuspreparaat"],
      ko: ["압착도말 시행 기록", "압착도말"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'INTRAOP_LOG_CYTOLOGY_FLUID', label: 'Log Cytology / Fluid Evaluation', category: 'NAVIGATION',
    shortcut: 'Alt+Shift+C', internalKey: 'F13+PS280',
    voiceTriggers: ['log cytology', 'cytology evaluation', 'log fluid evaluation', 'fluid evaluation done'],
    voiceTriggersByLanguage: {
      fr: ["cytologie enregistrée", "évaluation cytologique", "évaluation du liquide effectuée"],
      de: ["zytologie protokolliert", "zytologische auswertung", "flüssigkeitsauswertung durchgeführt"],
      nl: ["cytologie gelogd", "cytologische evaluatie", "vloeistofevaluatie uitgevoerd"],
      ko: ["세포검사 기록", "세포검사 평가", "체액 평가 완료"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'INTRAOP_LOG_GROSS_ONLY', label: 'Log Gross Only / Intraoperative Consultation', category: 'NAVIGATION',
    shortcut: 'Alt+Shift+G', internalKey: 'F13+PS281',
    voiceTriggers: ['log gross only', 'gross only', 'intraoperative consultation only'],
    voiceTriggersByLanguage: {
      fr: ["macroscopie seule enregistrée", "macroscopie seule"],
      de: ["nur makroskopie protokolliert", "nur makroskopie"],
      nl: ["alleen macroscopie gelogd", "alleen macroscopie"],
      ko: ["육안검사만 기록", "육안검사만"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'GO_BACK', label: 'Go Back', category: 'SYSTEM',
    shortcut: 'Alt+ArrowLeft', internalKey: ACTION_MAP['system.goBack']?.internalKey ?? 'F13+PS003',
    voiceTriggers: ['go back', 'back', 'previous page', 'go to previous page'],
    voiceTriggersByLanguage: {
      fr: ['retour', 'reculer', 'page précédente', 'revenir en arrière'],
      de: ['zurück', 'zurückgehen', 'vorherige seite'],
      nl: ['terug', 'ga terug', 'vorige pagina'],
      ko: ['뒤로', '뒤로 가기', '이전 페이지'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'GO_FORWARD', label: 'Go Forward', category: 'SYSTEM',
    shortcut: 'Alt+ArrowRight', internalKey: ACTION_MAP['system.goForward']?.internalKey ?? 'F13+PS004',
    voiceTriggers: ['go forward', 'forward', 'next page', 'go to next page'],
    voiceTriggersByLanguage: {
      fr: ['avancer', 'suivant', 'page suivante'],
      de: ['vorwärts', 'weiter', 'nächste seite'],
      nl: ['vooruit', 'verder', 'volgende pagina'],
      ko: ['앞으로', '다음 페이지', '다음으로'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_CONFIGURATION', label: 'Open Configuration', category: 'NAVIGATION',
    shortcut: 'Alt+C', internalKey: ACTION_MAP['system.openConfiguration']?.internalKey ?? 'F13+PS007',
    voiceTriggers: [
      'open configuration', 'go to configuration', 'configuration',
      'open config', 'go to config', 'config', 'open settings', 'settings',
    ],
    voiceTriggersByLanguage: {
      fr: ['ouvrir la configuration', 'aller à la configuration', 'configuration', 'ouvrir les paramètres', 'paramètres'],
      de: ['konfiguration öffnen', 'zur konfiguration', 'konfiguration', 'einstellungen öffnen', 'einstellungen'],
      nl: ['configuratie openen', 'naar configuratie', 'configuratie', 'instellingen openen', 'instellingen'],
      ko: ['설정 열기', '설정으로', '환경설정', '설정'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_SEARCH', label: 'Open Search', category: 'NAVIGATION',
    shortcut: 'Alt+F', internalKey: ACTION_MAP['system.openSearch']?.internalKey ?? 'F13+PS008',
    voiceTriggers: ['open search', 'go to search', 'search cases', 'find case', 'search'],
    voiceTriggersByLanguage: {
      fr: ['ouvrir la recherche', 'aller à la recherche', 'rechercher des dossiers', 'trouver un dossier', 'rechercher'],
      de: ['suche öffnen', 'zur suche', 'fälle suchen', 'fall finden', 'suchen'],
      nl: ['zoeken openen', 'naar zoeken', 'zaken zoeken', 'zaak vinden', 'zoeken'],
      ko: ['검색 열기', '검색으로', '증례 검색', '증례 찾기', '검색'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_AUDIT', label: 'System Audit', category: 'NAVIGATION',
    shortcut: 'Alt+U', internalKey: ACTION_MAP['system.openAudit']?.internalKey ?? 'F13+PS009',
    voiceTriggers: ['open audit', 'system audit', 'open system audit', 'go to audit', 'audit log', 'audit'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir l'audit", "audit système", "journal d'audit"],
      de: ["audit öffnen", "systemaudit", "prüfprotokoll"],
      nl: ["audit openen", "systeemaudit", "auditlogboek"],
      ko: ["감사 열기", "시스템 감사", "감사 로그"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_CONTRIBUTION', label: 'My Contribution', category: 'NAVIGATION',
    shortcut: 'Alt+K', internalKey: ACTION_MAP['system.openContribution']?.internalKey ?? 'F13+PS010',
    voiceTriggers: ['my contribution', 'open my contribution', 'go to my contribution', 'contribution'],
    voiceTriggersByLanguage: {
      fr: ["ma contribution", "ouvrir ma contribution"],
      de: ["mein beitrag", "meinen beitrag öffnen"],
      nl: ["mijn bijdrage", "mijn bijdrage openen"],
      ko: ["내 기여도", "내 기여도 열기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── HOME page actions — SYSTEM category (available from home screen) ───────
  {
    id: 'OPEN_ENHANCEMENT_REQUEST', label: 'Open Enhancement Request', category: 'SYSTEM',
    shortcut: 'Alt+O', internalKey: 'F13+PS301',
    voiceTriggers: ['open enhancement request', 'enhancement request', 'open enhancement'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir la demande d'amélioration", "demande d'amélioration"],
      de: ["verbesserungsanfrage öffnen", "verbesserungsanfrage"],
      nl: ["verbeteringsverzoek openen", "verbeteringsverzoek"],
      ko: ["개선 요청 열기", "개선 요청"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_TESTING_FEEDBACK', label: 'Open Testing Feedback', category: 'SYSTEM',
    shortcut: 'Alt+T', internalKey: 'F13+PS302',
    voiceTriggers: ['open testing feedback', 'testing feedback', 'QA feedback', 'open feedback'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir les retours de test", "retours de test"],
      de: ["test-feedback öffnen", "test-feedback"],
      nl: ["testfeedback openen", "testfeedback"],
      ko: ["테스트 피드백 열기", "테스트 피드백"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'VIEW_HELP', label: 'View System Help', category: 'SYSTEM',
    shortcut: 'Alt+V', internalKey: 'F13+PS303',
    voiceTriggers: ['view help', 'open help', 'system help', 'show help', 'help'],
    voiceTriggersByLanguage: {
      fr: ["afficher l'aide", "ouvrir l'aide", "aide"],
      de: ["hilfe anzeigen", "hilfe öffnen", "hilfe"],
      nl: ["help tonen", "help openen", "help"],
      ko: ["도움말 보기", "도움말 열기", "도움말"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_RESOURCES', label: 'Open Clinical Resources', category: 'SYSTEM',
    shortcut: 'Alt+C', internalKey: 'F13+PS304',
    voiceTriggers: ['open resources', 'clinical resources', 'open clinical resources', 'quick links', 'open quick links'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir les ressources", "ressources cliniques"],
      de: ["ressourcen öffnen", "klinische ressourcen"],
      nl: ["bronnen openen", "klinische bronnen"],
      ko: ["자료 열기", "임상 자료"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    // "log out" used as trigger — avoids collision with "sign out case" in reporting context
    id: 'SYSTEM_LOGOUT', label: 'Log Out', category: 'SYSTEM',
    shortcut: 'Alt+L', internalKey: 'F13+PS308',
    voiceTriggers: ['log out', 'sign out system', 'logout', 'log me out'],
    voiceTriggersByLanguage: {
      fr: ['déconnexion', 'se déconnecter', 'déconnecter le système'],
      de: ['abmelden', 'ausloggen', 'system abmelden'],
      nl: ['afmelden', 'uitloggen', 'systeem afmelden'],
      ko: ['로그아웃', '시스템 로그아웃'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── CASE NAVIGATION — always available ────────────────────────────────────
  {
    id: 'NEXT_CASE', label: 'Next Case', category: 'NAVIGATION',
    shortcut: 'Alt+N', internalKey: ACTION_MAP['nav.nextCase']?.internalKey ?? 'F14+PS001',
    voiceTriggers: ['next case', 'go to next case', 'next patient', 'open next case'],
    voiceTriggersByLanguage: {
      fr: ['dossier suivant', 'aller au dossier suivant', 'patient suivant'],
      de: ['nächster fall', 'zum nächsten fall', 'nächster patient'],
      nl: ['volgende zaak', 'naar volgende zaak', 'volgende patiënt'],
      ko: ['다음 증례', '다음 환자', '다음 증례 열기'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'PREVIOUS_CASE', label: 'Previous Case', category: 'NAVIGATION',
    shortcut: 'Alt+P', internalKey: ACTION_MAP['nav.previousCase']?.internalKey ?? 'F14+PS002',
    voiceTriggers: ['previous case', 'go to previous case', 'prior case', 'last case', 'open previous case'],
    voiceTriggersByLanguage: {
      fr: ['dossier précédent', 'aller au dossier précédent', 'dernier dossier'],
      de: ['vorheriger fall', 'zum vorherigen fall', 'letzter fall'],
      nl: ['vorige zaak', 'naar vorige zaak', 'laatste zaak'],
      ko: ['이전 증례', '이전 증례로', '지난 증례'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'NEXT_TAB', label: 'Next Tab / Section', category: 'NAVIGATION',
    shortcut: 'Alt+.', internalKey: ACTION_MAP['nav.nextTab']?.internalKey ?? 'F14+PS003',
    voiceTriggers: ['next tab', 'go to next tab', 'tab right', 'next section', 'go to next section'],
    voiceTriggersByLanguage: {
      fr: ['onglet suivant', 'aller à l\u2019onglet suivant', 'section suivante'],
      de: ['nächster tab', 'zum nächsten tab', 'nächster abschnitt'],
      nl: ['volgend tabblad', 'naar volgend tabblad', 'volgende sectie'],
      ko: ['다음 탭', '다음 탭으로', '다음 섹션'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'PREVIOUS_TAB', label: 'Previous Tab / Section', category: 'NAVIGATION',
    shortcut: 'Alt+,', internalKey: ACTION_MAP['nav.previousTab']?.internalKey ?? 'F14+PS004',
    voiceTriggers: ['previous tab', 'go to previous tab', 'tab left', 'prior tab', 'previous section', 'go to previous section', 'prior section'],
    voiceTriggersByLanguage: {
      fr: ['onglet précédent', 'aller à l\u2019onglet précédent', 'section précédente'],
      de: ['vorheriger tab', 'zum vorherigen tab', 'vorheriger abschnitt'],
      nl: ['vorig tabblad', 'naar vorig tabblad', 'vorige sectie'],
      ko: ['이전 탭', '이전 탭으로', '이전 섹션'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── ACCESSION — only when the Accession page is active. NEXT_TAB/
  // PREVIOUS_TAB above already work here for free (NAVIGATION is a
  // GLOBAL_CATEGORIES member, eligible everywhere) — AccessionPage.tsx
  // just needs to listen for those two ids alongside the ones below.
  // ADD_SPECIMEN and SUBMIT_ACCESSION reuse internalKeys reserved in
  // systemActions.ts (specimen.add, case.create) that were cataloged but
  // never wired to a live action until now.
  {
    id: 'ADD_SPECIMEN', label: 'Add Specimen', category: 'ACCESSION',
    shortcut: 'Alt+N', internalKey: ACTION_MAP['specimen.add']?.internalKey ?? 'F20+PS001',
    voiceTriggers: ['add specimen', 'add another specimen', 'new specimen', 'add a specimen'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un prélèvement", "ajouter un autre prélèvement", "nouveau prélèvement"],
      de: ["probe hinzufügen", "weitere probe hinzufügen", "neue probe"],
      nl: ["specimen toevoegen", "nog een specimen toevoegen", "nieuw specimen"],
      ko: ["검체 추가", "검체 추가하기", "새 검체"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'SUBMIT_ACCESSION', label: 'Submit Case', category: 'ACCESSION',
    shortcut: 'Alt+Enter', internalKey: ACTION_MAP['case.create']?.internalKey ?? 'F19+PS003',
    voiceTriggers: ['submit case', 'submit accession', 'complete accession', 'finish accession'],
    voiceTriggersByLanguage: {
      fr: ["soumettre le dossier", "soumettre l'accession", "terminer l'accession"],
      de: ["fall einreichen", "accession einreichen", "accession abschließen"],
      nl: ["zaak indienen", "accessie indienen", "accessie voltooien"],
      ko: ["증례 제출", "접수 제출", "접수 완료"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'ACCESSION_IMPORT_ORDER', label: 'Import From Order', category: 'ACCESSION',
    shortcut: 'Alt+I', internalKey: ACTION_MAP['accession.importOrder']?.internalKey ?? 'F24+PS034',
    voiceTriggers: ['import order', 'import from order', 'search orders', 'find order'],
    voiceTriggersByLanguage: {
      fr: ["importer la commande", "importer depuis la commande", "rechercher des commandes"],
      de: ["auftrag importieren", "aus auftrag importieren", "aufträge suchen"],
      nl: ["order importeren", "importeren vanuit order", "orders zoeken"],
      ko: ["오더 가져오기", "오더에서 가져오기", "오더 검색"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'ACCESSION_CASE_COMMENT', label: 'Add Case Comment', category: 'ACCESSION',
    shortcut: 'Alt+Shift+C', internalKey: ACTION_MAP['accession.caseComment']?.internalKey ?? 'F24+PS035',
    voiceTriggers: ['add case comment', 'open case comment', 'case comment'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un commentaire de dossier", "ouvrir le commentaire de dossier"],
      de: ["fallkommentar hinzufügen", "fallkommentar öffnen"],
      nl: ["zaakopmerking toevoegen", "zaakopmerking openen"],
      ko: ["증례 코멘트 추가", "증례 코멘트 열기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // Real, per the uploaded "Structured Clinical History Dictionary &
  // Accessioning Integration" spec's own User Story 4, Acceptance
  // Criteria 1 ("Alt+1 through Alt+6 jump directly to categories 1-6
  // in the history panel") — same real ACCESSION-scoped pattern as
  // the four entries above; only eligible while the Accession page's
  // own context is active (VOICE_CONTEXT.ACCESSION).
  {
    id: 'CLINHIST_CATEGORY_1', label: 'Clinical History — Category 1 (SCR)', category: 'ACCESSION',
    shortcut: 'Alt+1', internalKey: ACTION_MAP['accession.clinicalHistoryCategory1']?.internalKey ?? 'F24+PS044',
    voiceTriggers: ['category one', 'screening category', 'jump to screening'],
    voiceTriggersByLanguage: {
      fr: ["catégorie un", "catégorie dépistage"],
      de: ["kategorie eins", "kategorie screening"],
      nl: ["categorie een", "categorie screening"],
      ko: ["카테고리 1", "선별 카테고리"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CLINHIST_CATEGORY_2', label: 'Clinical History — Category 2 (SYM)', category: 'ACCESSION',
    shortcut: 'Alt+2', internalKey: ACTION_MAP['accession.clinicalHistoryCategory2']?.internalKey ?? 'F24+PS045',
    voiceTriggers: ['category two', 'symptoms category', 'jump to symptoms'],
    voiceTriggersByLanguage: {
      fr: ["catégorie deux", "catégorie symptômes"],
      de: ["kategorie zwei", "kategorie symptome"],
      nl: ["categorie twee", "categorie symptomen"],
      ko: ["카테고리 2", "증상 카테고리"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CLINHIST_CATEGORY_3', label: 'Clinical History — Category 3 (RAD_LAB)', category: 'ACCESSION',
    shortcut: 'Alt+3', internalKey: ACTION_MAP['accession.clinicalHistoryCategory3']?.internalKey ?? 'F24+PS046',
    voiceTriggers: ['category three', 'radiology lab category', 'jump to radiology'],
    voiceTriggersByLanguage: {
      fr: ["catégorie trois", "catégorie radiologie"],
      de: ["kategorie drei", "kategorie radiologie"],
      nl: ["categorie drie", "categorie radiologie"],
      ko: ["카테고리 3", "영상검사 카테고리"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CLINHIST_CATEGORY_4', label: 'Clinical History — Category 4 (PRIOR_PATH)', category: 'ACCESSION',
    shortcut: 'Alt+4', internalKey: ACTION_MAP['accession.clinicalHistoryCategory4']?.internalKey ?? 'F24+PS047',
    voiceTriggers: ['category four', 'prior pathology category', 'jump to prior pathology'],
    voiceTriggersByLanguage: {
      fr: ["catégorie quatre", "catégorie pathologie antérieure"],
      de: ["kategorie vier", "kategorie vorherige pathologie"],
      nl: ["categorie vier", "categorie eerdere pathologie"],
      ko: ["카테고리 4", "이전 병리 카테고리"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CLINHIST_CATEGORY_5', label: 'Clinical History — Category 5 (MAL_STAGE)', category: 'ACCESSION',
    shortcut: 'Alt+5', internalKey: ACTION_MAP['accession.clinicalHistoryCategory5']?.internalKey ?? 'F24+PS048',
    voiceTriggers: ['category five', 'malignancy staging category', 'jump to staging'],
    voiceTriggersByLanguage: {
      fr: ["catégorie cinq", "catégorie stadification"],
      de: ["kategorie fünf", "kategorie staging"],
      nl: ["categorie vijf", "categorie stadiëring"],
      ko: ["카테고리 5", "병기 카테고리"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CLINHIST_CATEGORY_6', label: 'Clinical History — Category 6 (HIGH_RISK)', category: 'ACCESSION',
    shortcut: 'Alt+6', internalKey: ACTION_MAP['accession.clinicalHistoryCategory6']?.internalKey ?? 'F24+PS049',
    voiceTriggers: ['category six', 'high risk category', 'jump to high risk'],
    voiceTriggersByLanguage: {
      fr: ["catégorie six", "catégorie haut risque"],
      de: ["kategorie sechs", "kategorie hochrisiko"],
      nl: ["categorie zes", "categorie hoog risico"],
      ko: ["카테고리 6", "고위험 카테고리"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── TABLE / LIST NAVIGATION — WORKLIST + SEARCH contexts ─────────────────
  {
    id: 'TABLE_NEXT', label: 'Next Row', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+ArrowDown', internalKey: ACTION_MAP['table.next']?.internalKey ?? 'F15+PS001',
    voiceTriggers: ['next', 'next row', 'move down', 'down one'],
    voiceTriggersByLanguage: {
      fr: ["suivant", "ligne suivante", "descendre"],
      de: ["nächste", "nächste zeile", "nach unten"],
      nl: ["volgende", "volgende rij", "omlaag"],
      ko: ["다음", "다음 행", "아래로"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_PREVIOUS', label: 'Previous Row', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+ArrowUp', internalKey: ACTION_MAP['table.previous']?.internalKey ?? 'F15+PS002',
    voiceTriggers: ['previous', 'previous row', 'move up', 'up one', 'prior row'],
    voiceTriggersByLanguage: {
      fr: ["précédent", "ligne précédente", "monter"],
      de: ["vorherige", "vorherige zeile", "nach oben"],
      nl: ["vorige", "vorige rij", "omhoog"],
      ko: ["이전", "이전 행", "위로"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_PAGE_DOWN', label: 'Page Down', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+PageDown', internalKey: ACTION_MAP['table.pageDown']?.internalKey ?? 'F15+PS003',
    voiceTriggers: ['page down', 'scroll down', 'more results'],
    voiceTriggersByLanguage: {
      fr: ["page suivante", "défiler vers le bas"],
      de: ["seite runter", "nach unten scrollen"],
      nl: ["pagina omlaag", "omlaag scrollen"],
      ko: ["페이지 다운", "아래로 스크롤"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_PAGE_UP', label: 'Page Up', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+PageUp', internalKey: ACTION_MAP['table.pageUp']?.internalKey ?? 'F15+PS004',
    voiceTriggers: ['page up', 'scroll up', 'back to top'],
    voiceTriggersByLanguage: {
      fr: ["page précédente", "défiler vers le haut"],
      de: ["seite hoch", "nach oben scrollen"],
      nl: ["pagina omhoog", "omhoog scrollen"],
      ko: ["페이지 업", "위로 스크롤"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_FIRST', label: 'First Row', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Home', internalKey: ACTION_MAP['table.first']?.internalKey ?? 'F15+PS005',
    voiceTriggers: ['first', 'go to first', 'top of list', 'first row', 'beginning'],
    voiceTriggersByLanguage: {
      fr: ["premier", "aller au premier", "haut de la liste"],
      de: ["erste", "zum ersten", "anfang der liste"],
      nl: ["eerste", "naar eerste", "boven aan lijst"],
      ko: ["첫 번째", "처음으로", "목록 맨 위"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_LAST', label: 'Last Row', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+End', internalKey: ACTION_MAP['table.last']?.internalKey ?? 'F15+PS006',
    voiceTriggers: ['last', 'go to last', 'end of list', 'last row', 'bottom'],
    voiceTriggersByLanguage: {
      fr: ["dernier", "aller au dernier", "fin de la liste"],
      de: ["letzte", "zum letzten", "ende der liste"],
      nl: ["laatste", "naar laatste", "einde van lijst"],
      ko: ["마지막", "끝으로", "목록 맨 아래"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_SELECT', label: 'Select Row', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Space', internalKey: ACTION_MAP['table.select']?.internalKey ?? 'F15+PS007',
    voiceTriggers: ['select', 'select this', 'select row', 'check this', 'tick this'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner", "sélectionner ceci", "sélectionner la ligne"],
      de: ["auswählen", "dies auswählen", "zeile auswählen"],
      nl: ["selecteren", "dit selecteren", "rij selecteren"],
      ko: ["선택", "이것 선택", "행 선택"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_SELECT_ALL', label: 'Select All', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Shift+A', internalKey: ACTION_MAP['table.selectAll']?.internalKey ?? 'F15+PS008',
    voiceTriggers: ['select all', 'check all', 'tick all', 'select everything'],
    voiceTriggersByLanguage: {
      fr: ["tout sélectionner", "tout cocher"],
      de: ["alles auswählen", "alles markieren"],
      nl: ["alles selecteren", "alles aanvinken"],
      ko: ["전체 선택", "모두 선택"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_DESELECT_ALL', label: 'Deselect All', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Shift+D', internalKey: ACTION_MAP['table.deselectAll']?.internalKey ?? 'F15+PS009',
    voiceTriggers: ['deselect all', 'clear selection', 'uncheck all', 'deselect everything'],
    voiceTriggersByLanguage: {
      fr: ["tout désélectionner", "effacer la sélection"],
      de: ["alles abwählen", "auswahl aufheben"],
      nl: ["alles deselecteren", "selectie wissen"],
      ko: ["전체 선택 해제", "선택 해제"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_OPEN_SELECTED', label: 'Open Selected', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Enter', internalKey: ACTION_MAP['table.openSelected']?.internalKey ?? 'F15+PS010',
    voiceTriggers: ['open', 'open selected', 'open case', 'open this case', 'select this case'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir", "ouvrir la sélection", "ouvrir le dossier"],
      de: ["öffnen", "auswahl öffnen", "fall öffnen"],
      nl: ["openen", "selectie openen", "zaak openen"],
      ko: ["열기", "선택 항목 열기", "증례 열기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_REFRESH', label: 'Refresh', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+R', internalKey: ACTION_MAP['table.refresh']?.internalKey ?? 'F15+PS011',
    voiceTriggers: ['refresh', 'reload', 'refresh list', 'refresh worklist', 'update list'],
    voiceTriggersByLanguage: {
      fr: ["actualiser", "recharger", "actualiser la liste"],
      de: ["aktualisieren", "neu laden", "liste aktualisieren"],
      nl: ["vernieuwen", "herladen", "lijst vernieuwen"],
      ko: ["새로고침", "다시 불러오기", "목록 새로고침"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_SORT_DATE', label: 'Sort by Date', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+S', internalKey: ACTION_MAP['table.sortByDate']?.internalKey ?? 'F15+PS012',
    voiceTriggers: ['sort by date', 'sort by time', 'order by date', 'newest first'],
    voiceTriggersByLanguage: {
      fr: ["trier par date", "trier par heure", "plus récent en premier"],
      de: ["nach datum sortieren", "nach zeit sortieren", "neueste zuerst"],
      nl: ["sorteren op datum", "sorteren op tijd", "nieuwste eerst"],
      ko: ["날짜순 정렬", "시간순 정렬", "최신순"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_SORT_PRIORITY', label: 'Sort by Priority', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+P', internalKey: ACTION_MAP['table.sortByPriority']?.internalKey ?? 'F15+PS013',
    voiceTriggers: ['sort by priority', 'urgent first', 'show urgent first', 'order by priority'],
    voiceTriggersByLanguage: {
      fr: ["trier par priorité", "urgent en premier"],
      de: ["nach priorität sortieren", "dringend zuerst"],
      nl: ["sorteren op prioriteit", "urgent eerst"],
      ko: ["우선순위순 정렬", "긴급 우선"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_SORT_STATUS', label: 'Sort by Status', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Shift+S', internalKey: ACTION_MAP['table.sortByStatus']?.internalKey ?? 'F15+PS014',
    voiceTriggers: ['sort by status', 'order by status', 'group by status'],
    voiceTriggersByLanguage: {
      fr: ["trier par statut", "grouper par statut"],
      de: ["nach status sortieren", "nach status gruppieren"],
      nl: ["sorteren op status", "groeperen op status"],
      ko: ["상태순 정렬", "상태별 그룹화"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_FILTER_URGENT', label: 'Filter Urgent', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+F', internalKey: ACTION_MAP['table.filterUrgent']?.internalKey ?? 'F15+PS015',
    voiceTriggers: ['filter urgent', 'urgent cases', 'filter stat', 'stat cases', 'show urgent'],
    voiceTriggersByLanguage: {
      fr: ["filtrer urgent", "dossiers urgents", "afficher urgent"],
      de: ["dringend filtern", "dringende fälle", "dringend anzeigen"],
      nl: ["urgent filteren", "urgente zaken", "urgent tonen"],
      ko: ["긴급 필터", "긴급 증례", "긴급 표시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_FILTER_PHYSICIAN', label: 'Filter by Physician', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Shift+F', internalKey: 'F15+PS034',
    voiceTriggers: ['filter by', 'cases by', 'show cases by', 'physician filter'],
    voiceTriggersByLanguage: {
      fr: ["filtrer par", "dossiers par", "filtre médecin"],
      de: ["filtern nach", "fälle von", "arztfilter"],
      nl: ["filteren op", "zaken van", "artsfilter"],
      ko: ["필터 기준", "의사별 증례", "의사 필터"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'READ_FLAGS', label: 'Read Flags', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Shift+R', internalKey: 'F15+PS035',
    voiceTriggers: ['read flags', 'what are the flags', 'case flags', 'list flags'],
    voiceTriggersByLanguage: {
      fr: ["lire les indicateurs", "quels sont les indicateurs", "indicateurs du dossier"],
      de: ["markierungen vorlesen", "welche markierungen", "fallmarkierungen"],
      nl: ["vlaggen voorlezen", "welke vlaggen", "zaakvlaggen"],
      ko: ["플래그 읽기", "플래그가 뭐야", "증례 플래그"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'READ_SPECIMEN', label: 'Read Specimen', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Ctrl+Alt+R', internalKey: 'F15+PS036',
    voiceTriggers: ['read specimen', 'what is the specimen', 'specimen type', 'confirm specimen'],
    voiceTriggersByLanguage: {
      fr: ["lire le prélèvement", "quel est le prélèvement", "type de prélèvement"],
      de: ["probe vorlesen", "was ist die probe", "probentyp"],
      nl: ["specimen voorlezen", "wat is het specimen", "specimentype"],
      ko: ["검체 읽기", "검체가 뭐야", "검체 종류"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // Real, per direct follow-up ("some cases will have DP, others may
  // not") — same real, established READ_FLAGS/READ_SPECIMEN pattern,
  // never a separate, parallel voice system for DP-relevant rows.
  {
    id: 'READ_DIGITAL_READINESS', label: 'Read Digital Readiness', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Ctrl+Alt+V', internalKey: 'F15+PS040',
    voiceTriggers: ['read digital readiness', 'slide status', 'scan status', 'read scan status'],
    voiceTriggersByLanguage: {
      fr: ["lire la disponibilité numérique", "statut de la lame", "statut du scan"],
      de: ["digitale bereitschaft vorlesen", "objektträger status", "scan status"],
      nl: ["digitale gereedheid voorlezen", "objectglaasje status", "scan status"],
      ko: ["디지털 준비 상태 읽기", "슬라이드 상태", "스캔 상태"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'READ_DP_TRIAGE', label: 'Read AI Triage', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Ctrl+Alt+W', internalKey: 'F15+PS041',
    voiceTriggers: ['read ai triage', 'ai result', 'read ai result', 'what is the ai finding'],
    voiceTriggersByLanguage: {
      fr: ["lire le triage ia", "résultat ia", "quel est le résultat ia"],
      de: ["ki triage vorlesen", "ki ergebnis", "wie lautet das ki ergebnis"],
      nl: ["ai triage voorlezen", "ai resultaat", "wat is het ai resultaat"],
      ko: ["AI 트리아지 읽기", "AI 결과", "AI 결과가 뭐야"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_SLIDE_DETAILS', label: 'Open Slide Details', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Ctrl+Alt+X', internalKey: 'F15+PS042',
    voiceTriggers: ['open slide details', 'show slide details', 'slide details'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir les détails de la lame", "afficher les détails de la lame"],
      de: ["objektträger details öffnen", "objektträger details anzeigen"],
      nl: ["objectglaasje details openen", "objectglaasje details tonen"],
      ko: ["슬라이드 상세 정보 열기", "슬라이드 상세 정보 보기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_FILTER_DP', label: 'Filter Digital Pathology', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Ctrl+Alt+Y', internalKey: 'F15+PS043',
    voiceTriggers: ['filter dp', 'filter digital pathology', 'dp cases', 'show dp cases', 'digital pathology cases'],
    voiceTriggersByLanguage: {
      fr: ["filtrer dp", "cas de pathologie numérique", "afficher les cas dp"],
      de: ["dp filtern", "digitale pathologie fälle", "dp fälle anzeigen"],
      nl: ["dp filteren", "digitale pathologie zaken", "dp zaken tonen"],
      ko: ["DP 필터", "디지털 병리 증례", "DP 증례 표시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // Real, per direct follow-up recalling a real, prior requirement
  // ("I do not want to send the Pathologist to multiple worklist").
  {
    id: 'TABLE_FILTER_GYNCYTO', label: 'Filter GYN Cytology', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Ctrl+Alt+Z', internalKey: 'F15+PS044',
    voiceTriggers: ['filter gyn cytology', 'gyn cytology cases', 'show gyn cytology', 'filter gyn'],
    voiceTriggersByLanguage: {
      fr: ["filtrer cytologie gyn", "cas de cytologie gyn"],
      de: ["gyn zytologie filtern", "gyn zytologie fälle"],
      nl: ["gyn cytologie filteren", "gyn cytologie zaken"],
      ko: ["부인과 세포 검사 필터", "부인과 세포 검사 증례"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_FILTER_NONGYNCYTO', label: 'Filter Non-GYN Cytology / FNA', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Shift+K', internalKey: 'F15+PS045',
    voiceTriggers: ['filter non gyn cytology', 'non gyn cytology cases', 'filter fna', 'fna cases', 'show fna'],
    voiceTriggersByLanguage: {
      fr: ["filtrer cytologie non gyn", "cas de cytologie non gyn", "filtrer fna"],
      de: ["nicht gyn zytologie filtern", "fna fälle filtern"],
      nl: ["niet gyn cytologie filteren", "fna zaken filteren"],
      ko: ["비부인과 세포 검사 필터", "FNA 증례 필터"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_FILTER_AUTOPSY', label: 'Filter Autopsy', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Shift+Q', internalKey: 'F15+PS046',
    voiceTriggers: ['filter autopsy', 'autopsy cases', 'show autopsy cases'],
    voiceTriggersByLanguage: {
      fr: ["filtrer autopsie", "cas d'autopsie", "afficher les cas d'autopsie"],
      de: ["autopsie filtern", "autopsie fälle", "autopsie fälle anzeigen"],
      nl: ["autopsie filteren", "autopsie zaken", "autopsie zaken tonen"],
      ko: ["부검 필터", "부검 증례", "부검 증례 표시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // Real, per direct follow-up recalling the messaging system's own
  // unread pattern.
  {
    id: 'TABLE_FILTER_NEWCASES', label: 'Filter New Cases', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Shift+U', internalKey: 'F15+PS047',
    voiceTriggers: ['filter new cases', 'new cases', 'show new cases', 'unopened cases'],
    voiceTriggersByLanguage: {
      fr: ["filtrer les nouveaux cas", "nouveaux cas", "afficher les nouveaux cas"],
      de: ["neue fälle filtern", "neue fälle", "neue fälle anzeigen"],
      nl: ["nieuwe zaken filteren", "nieuwe zaken", "nieuwe zaken tonen"],
      ko: ["새 증례 필터", "새 증례", "새 증례 표시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
{
    id: 'TABLE_FILTER_COMPLETED',
    label: 'Filter Completed',
    category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+C', 
    internalKey: 'F15+PS037',
    voiceTriggers: ['filter completed', 'show completed', 'completed cases', 'show completed cases'],
    voiceTriggersByLanguage: {
      fr: ["filtrer terminé", "afficher terminé", "dossiers terminés"],
      de: ["abgeschlossen filtern", "abgeschlossen anzeigen", "abgeschlossene fälle"],
      nl: ["voltooid filteren", "voltooid tonen", "voltooide zaken"],
      ko: ["완료 필터", "완료 표시", "완료된 증례"],
    },
    learnedTriggers: [], 
    requiredRole: 'All Staff', 
    isActive: true,
  },
  {
    id: 'TABLE_CLEAR_FILTER', label: 'Clear Filter', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+Shift+C', internalKey: ACTION_MAP['table.clearFilter']?.internalKey ?? 'F15+PS016',
    voiceTriggers: ['clear filter', 'remove filter', 'show all', 'reset filter', 'clear filters', 'show all cases'],
    voiceTriggersByLanguage: {
      fr: ["effacer le filtre", "supprimer le filtre", "tout afficher"],
      de: ["filter löschen", "filter entfernen", "alle anzeigen"],
      nl: ["filter wissen", "filter verwijderen", "alles tonen"],
      ko: ["필터 지우기", "필터 제거", "전체 표시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_SORT_BY_COLUMN', label: 'Sort By Column', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Ctrl+Alt+S', internalKey: 'F15+PS038',
    voiceTriggers: ['sort by', 'sort column', 'order by'],
    voiceTriggersByLanguage: {
      fr: ["trier par", "trier la colonne"],
      de: ["sortieren nach", "spalte sortieren"],
      nl: ["sorteren op", "kolom sorteren"],
      ko: ["정렬 기준", "열 정렬"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_CLEAR_SORT', label: 'Clear Sort', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Ctrl+Alt+C', internalKey: 'F15+PS033',
    voiceTriggers: ['clear sort', 'remove sort', 'reset sort', 'clear sorting'],
    voiceTriggersByLanguage: {
      fr: ["effacer le tri", "supprimer le tri"],
      de: ["sortierung löschen", "sortierung entfernen"],
      nl: ["sortering wissen", "sortering verwijderen"],
      ko: ["정렬 지우기", "정렬 제거"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_SEARCH', label: 'Search', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+/', internalKey: ACTION_MAP['table.search']?.internalKey ?? 'F15+PS017',
    voiceTriggers: ['search worklist', 'find in list', 'search the list'],
    voiceTriggersByLanguage: {
      fr: ["rechercher dans la liste de travail", "rechercher dans la liste"],
      de: ["arbeitsliste durchsuchen", "liste durchsuchen"],
      nl: ["werklijst doorzoeken", "lijst doorzoeken"],
      ko: ["작업 목록 검색", "목록에서 찾기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABLE_CLEAR_SEARCH', label: 'Clear Search', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Ctrl+Alt+A', internalKey: ACTION_MAP['table.clearSearch']?.internalKey ?? 'F15+PS018',
    voiceTriggers: ['clear search', 'clear the search', 'remove search', 'reset search'],
    voiceTriggersByLanguage: {
      fr: ["effacer la recherche", "supprimer la recherche"],
      de: ["suche löschen", "suche entfernen"],
      nl: ["zoekopdracht wissen", "zoekopdracht verwijderen"],
      ko: ["검색 지우기", "검색 제거"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    // Delete a row in a table — context guards which tables support this
    id: 'TABLE_DELETE', label: 'Delete Row', category: VOICE_CONTEXT.WORKLIST,
    shortcut: 'Alt+D', internalKey: 'F15+PS039',
    voiceTriggers: ['delete row', 'delete this row', 'remove row', 'delete entry'],
    voiceTriggersByLanguage: {
      fr: ["supprimer la ligne", "supprimer cette ligne"],
      de: ["zeile löschen", "diese zeile löschen"],
      nl: ["rij verwijderen", "deze rij verwijderen"],
      ko: ["행 삭제", "이 행 삭제"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── REPORTING ACTIONS ─────────────────────────────────────────────────────
  {
    id: 'INSERT_MACRO', label: 'Insert Macro', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+I', internalKey: ACTION_MAP['editor.insertMacro']?.internalKey ?? 'F16+PS005',
    voiceTriggers: ['insert macro', 'add macro'],
    voiceTriggersByLanguage: {
      fr: ["insérer une macro", "ajouter une macro"],
      de: ["makro einfügen", "makro hinzufügen"],
      nl: ["macro invoegen", "macro toevoegen"],
      ko: ["매크로 삽입", "매크로 추가"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },
  {
    id: 'SIGN_OUT', label: 'Sign Out Case', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+X', internalKey: ACTION_MAP['system.signOut']?.internalKey ?? 'F13+PS006',
    voiceTriggers: ['sign out case', 'sign out the case', 'case sign out'],
    voiceTriggersByLanguage: {
      fr: ['signer le dossier', 'signer le cas', 'validation du dossier'],
      de: ['fall abzeichnen', 'fall signieren', 'fallabschluss'],
      nl: ['zaak ondertekenen', 'zaak afsluiten'],
      ko: ['증례 서명', '증례 사인아웃', '판독 완료'],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },
  {
    id: 'OPEN_PRE_FINALISE', label: 'Finalise Report', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+F', internalKey: 'F17+PS043',
    voiceTriggers: [
      'finalise', 'finalize', 'finalise report', 'finalize report',
      'finalise case', 'finalize case', 'sign off', 'sign off report',
      'submit report', 'complete report',
    ],
    voiceTriggersByLanguage: {
      fr: ["finaliser", "finaliser le rapport", "finaliser le dossier", "valider"],
      de: ["finalisieren", "bericht finalisieren", "fall finalisieren", "abzeichnen"],
      nl: ["finaliseren", "rapport finaliseren", "zaak finaliseren", "aftekenen"],
      ko: ["최종 확정", "보고서 최종화", "증례 최종화", "서명"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },
  {
    id: 'FINALISE_CONFIRM', label: 'Confirm Finalise', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+C', internalKey: 'F17+PS044',
    voiceTriggers: ['confirm finalise', 'confirm finalize', 'confirm sign off', 'yes finalise', 'yes finalize'],
    voiceTriggersByLanguage: {
      fr: ["confirmer la finalisation", "confirmer la validation"],
      de: ["finalisierung bestätigen", "abzeichnung bestätigen"],
      nl: ["finalisatie bevestigen", "aftekening bevestigen"],
      ko: ["최종화 확인", "서명 확인"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },
  {
    id: 'FINALISE_CANCEL', label: 'Cancel Finalise', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Escape', internalKey: 'F17+PS045',
    voiceTriggers: ['cancel finalise', 'cancel finalize', 'cancel sign off'],
    voiceTriggersByLanguage: {
      fr: ["annuler la finalisation", "annuler la validation"],
      de: ["finalisierung abbrechen", "abzeichnung abbrechen"],
      nl: ["finalisatie annuleren", "aftekening annuleren"],
      ko: ["최종화 취소", "서명 취소"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },
  {
    id: 'NEXT_FIELD', label: 'Next Field', category: 'SYNOPTIC',
    shortcut: 'Tab', internalKey: ACTION_MAP['editor.nextField']?.internalKey ?? 'F16+PS001',
    voiceTriggers: [
      'next field', 'next question', 'go forward', 'forward',
      'tab forward', 'move to next field', 'move forward', 'next item',
    ],
    voiceTriggersByLanguage: {
      fr: ["champ suivant", "question suivante", "avancer"],
      de: ["nächstes feld", "nächste frage", "vorwärts"],
      nl: ["volgend veld", "volgende vraag", "vooruit"],
      ko: ["다음 필드", "다음 질문", "앞으로"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },
  {
    id: 'PREVIOUS_FIELD', label: 'Previous Field', category: 'SYNOPTIC',
    shortcut: 'Shift+Tab', internalKey: ACTION_MAP['editor.previousField']?.internalKey ?? 'F16+PS002',
    voiceTriggers: [
      'previous field', 'previous question', 'go back', 'back',
      'tab back', 'move to previous field', 'go back one field', 'back one', 'prior field',
    ],
    voiceTriggersByLanguage: {
      fr: ["champ précédent", "question précédente", "reculer"],
      de: ["vorheriges feld", "vorherige frage", "zurück"],
      nl: ["vorig veld", "vorige vraag", "terug"],
      ko: ["이전 필드", "이전 질문", "뒤로"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },

  // ── DICTATION TARGETS ─────────────────────────────────────────────────────
  {
    id: 'ENTER_GROSS', label: 'Enter Gross Description', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+G', internalKey: ACTION_MAP['diagnosis.grossDescription']?.internalKey ?? 'F17+PS001',
    voiceTriggers: [
      'enter gross', 'start gross', 'dictate gross',
      'gross description', 'enter gross description', 'start gross description',
    ],
    voiceTriggersByLanguage: {
      fr: ["saisir la macroscopie", "commencer la macroscopie", "dicter la macroscopie"],
      de: ["makroskopie eingeben", "makroskopie beginnen", "makroskopie diktieren"],
      nl: ["macroscopie invoeren", "macroscopie starten", "macroscopie dicteren"],
      ko: ["육안소견 입력", "육안소견 시작", "육안소견 구술"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },
  {
    id: 'ENTER_MICRO', label: 'Enter Microscopic Description', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+G', internalKey: ACTION_MAP['diagnosis.microscopicDescription']?.internalKey ?? 'F17+PS002',
    voiceTriggers: [
      'enter micro', 'start micro', 'dictate micro',
      'microscopic description', 'enter microscopic description',
      'micro scopic description', 'my croscopic description',
      'enter micro scopic', 'start micro scopic',
    ],
    voiceTriggersByLanguage: {
      fr: ["saisir la microscopie", "commencer la microscopie", "dicter la microscopie"],
      de: ["mikroskopie eingeben", "mikroskopie beginnen", "mikroskopie diktieren"],
      nl: ["microscopie invoeren", "microscopie starten", "microscopie dicteren"],
      ko: ["현미경소견 입력", "현미경소견 시작", "현미경소견 구술"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },
  {
    id: 'ENTER_DIAGNOSIS', label: 'Enter Diagnosis', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+D', internalKey: ACTION_MAP['diagnosis.enterDiagnosis']?.internalKey ?? 'F17+PS003',
    voiceTriggers: ['enter diagnosis', 'start diagnosis', 'dictate diagnosis', 'add diagnosis'],
    voiceTriggersByLanguage: {
      fr: ["saisir le diagnostic", "commencer le diagnostic", "dicter le diagnostic"],
      de: ["diagnose eingeben", "diagnose beginnen", "diagnose diktieren"],
      nl: ["diagnose invoeren", "diagnose starten", "diagnose dicteren"],
      ko: ["진단 입력", "진단 시작", "진단 구술"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },
  {
    id: 'ENTER_ADDENDUM', label: 'Enter Addendum', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+D', internalKey: 'F17+PS004',
    voiceTriggers: ['enter addendum', 'start addendum', 'dictate addendum'],
    voiceTriggersByLanguage: {
      fr: ["saisir l'addendum", "commencer l'addendum", "dicter l'addendum"],
      de: ["nachtrag eingeben", "nachtrag beginnen", "nachtrag diktieren"],
      nl: ["addendum invoeren", "addendum starten", "addendum dicteren"],
      ko: ["추가소견 입력", "추가소견 시작", "추가소견 구술"],
    },
    learnedTriggers: [], requiredRole: 'Pathologist', isActive: true,
  },

  // ── Synoptic field navigation ──────────────────────────────────────────────
  {
    id: 'NEXT_UNANSWERED', label: 'Next Unanswered Field', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+U', internalKey: 'F17+PS005',
    voiceTriggers: ['next unanswered', 'go to next unanswered', 'next empty field', 'next blank'],
    voiceTriggersByLanguage: {
      fr: ["prochain sans réponse", "prochain champ vide"],
      de: ["nächstes unbeantwortete", "nächstes leeres feld"],
      nl: ["volgende onbeantwoorde", "volgend leeg veld"],
      ko: ["다음 미응답", "다음 빈 필드"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'NEXT_REQUIRED', label: 'Next Required Field', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+R', internalKey: 'F17+PS006',
    voiceTriggers: ['next required', 'go to next required', 'next required field', 'show required'],
    voiceTriggersByLanguage: {
      fr: ["prochain obligatoire", "prochain champ obligatoire"],
      de: ["nächstes erforderliche", "nächstes erforderliches feld"],
      nl: ["volgende verplichte", "volgend verplicht veld"],
      ko: ["다음 필수", "다음 필수 필드"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CONFIRM_FIELD', label: 'Confirm Field', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+A', internalKey: 'F17+PS007',
    // Kept distinct from AI_REVIEW_CONFIRM — this fires in REPORTING context (normal work),
    // AI_REVIEW_CONFIRM fires in SYNOPTIC context (triage modal only)
    voiceTriggers: ['confirm field', 'accept field', 'approve field', 'confirm answer', 'accept answer'],
    voiceTriggersByLanguage: {
      fr: ["confirmer le champ", "accepter le champ", "confirmer la réponse"],
      de: ["feld bestätigen", "feld akzeptieren", "antwort bestätigen"],
      nl: ["veld bevestigen", "veld accepteren", "antwoord bevestigen"],
      ko: ["필드 확인", "필드 수락", "답변 확인"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'EDIT_FIELD', label: 'Edit Field', category: 'SYNOPTIC',
    shortcut: 'Alt+E', internalKey: 'F17+PS008',
    voiceTriggers: ['edit field', 'change field', 'correct field', 'modify field', 'override field'],
    voiceTriggersByLanguage: {
      fr: ["modifier le champ", "changer le champ", "corriger le champ"],
      de: ["feld bearbeiten", "feld ändern", "feld korrigieren"],
      nl: ["veld bewerken", "veld wijzigen", "veld corrigeren"],
      ko: ["필드 편집", "필드 변경", "필드 수정"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'SKIP_FIELD', label: 'Skip Field', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Q', internalKey: 'F17+PS009',
    voiceTriggers: ['skip field', 'skip this field', 'move on', 'leave blank'],
    voiceTriggersByLanguage: {
      fr: ["passer le champ", "passer ce champ", "laisser vide"],
      de: ["feld überspringen", "dieses feld überspringen", "leer lassen"],
      nl: ["veld overslaan", "dit veld overslaan", "leeg laten"],
      ko: ["필드 건너뛰기", "이 필드 건너뛰기", "비워두기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'FULL_VIEW', label: 'Full View', category: 'SYNOPTIC',
    shortcut: 'Alt+V', internalKey: 'F17+PS010',
    voiceTriggers: ['full view', 'show full view', 'expand view', 'all sections'],
    voiceTriggersByLanguage: {
      fr: ["vue complète", "développer la vue"],
      de: ["vollansicht", "ansicht erweitern"],
      nl: ["volledige weergave", "weergave uitklappen"],
      ko: ["전체 보기", "보기 확장"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'TABBED_VIEW', label: 'Tabbed View', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+T', internalKey: 'F17+PS011',
    voiceTriggers: ['tabbed view', 'show tabbed view', 'tab view', 'collapse view'],
    voiceTriggersByLanguage: {
      fr: ["vue par onglets", "réduire la vue"],
      de: ["registeransicht", "ansicht reduzieren"],
      nl: ["tabweergave", "weergave inklappen"],
      ko: ["탭 보기", "보기 축소"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MAX_VIEW', label: 'Maximise View', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+M', internalKey: 'F17+PS012',
    voiceTriggers: ['max', 'maximise', 'maximize', 'full screen', 'expand screen'],
    voiceTriggersByLanguage: {
      fr: ["maximiser", "plein écran"],
      de: ["maximieren", "vollbild"],
      nl: ["maximaliseren", "volledig scherm"],
      ko: ["최대화", "전체 화면"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MIN_VIEW', label: 'Minimise View', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+V', internalKey: 'F17+PS013',
    voiceTriggers: ['min', 'minimise', 'minimize', 'exit full screen', 'restore view'],
    voiceTriggersByLanguage: {
      fr: ["minimiser", "quitter le plein écran"],
      de: ["minimieren", "vollbild verlassen"],
      nl: ["minimaliseren", "volledig scherm verlaten"],
      ko: ["최소화", "전체 화면 종료"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'PREVIEW_REPORT', label: 'Preview Report', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+P', internalKey: 'F17+PS014',
    voiceTriggers: ['preview report', 'show preview', 'report preview', 'preview'],
    voiceTriggersByLanguage: {
      fr: ["aperçu du rapport", "afficher l'aperçu"],
      de: ["berichtsvorschau", "vorschau anzeigen"],
      nl: ["rapportvoorbeeld", "voorbeeld tonen"],
      ko: ["보고서 미리보기", "미리보기 표시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'VOICE_CASE_COMMENT', label: 'Case Comment', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+C', internalKey: 'F17+PS015',
    voiceTriggers: ['case comment', 'open case comment', 'add case comment', 'dictate case comment'],
    voiceTriggersByLanguage: {
      fr: ["commentaire du dossier", "ajouter un commentaire de dossier"],
      de: ["fallkommentar", "fallkommentar hinzufügen"],
      nl: ["zaakopmerking", "zaakopmerking toevoegen"],
      ko: ["증례 코멘트", "증례 코멘트 추가"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'VOICE_SPECIMEN_COMMENT', label: 'Specimen Comment', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+S', internalKey: 'F17+PS016',
    voiceTriggers: ['specimen comment', 'open specimen comment', 'add specimen comment', 'dictate specimen comment'],
    voiceTriggersByLanguage: {
      fr: ["commentaire de prélèvement", "ajouter un commentaire de prélèvement"],
      de: ["probenkommentar", "probenkommentar hinzufügen"],
      nl: ["specimenopmerking", "specimenopmerking toevoegen"],
      ko: ["검체 코멘트", "검체 코멘트 추가"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'VOICE_INTERNAL_NOTE', label: 'Internal Note', category: 'SYNOPTIC',
    shortcut: 'Alt+I', internalKey: 'F17+PS017',
    voiceTriggers: ['internal note', 'open internal note', 'open notes'],
    voiceTriggersByLanguage: {
      fr: ["note interne", "ouvrir la note interne"],
      de: ["interne notiz", "interne notiz öffnen"],
      nl: ["interne notitie", "interne notitie openen"],
      ko: ["내부 메모", "내부 메모 열기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'VOICE_ADD_SYNOPTIC', label: 'Add Synoptic', category: 'SYNOPTIC',
    shortcut: 'Alt+Z', internalKey: 'F17+PS018',
    voiceTriggers: ['add synoptic', 'open add synoptic', 'add report', 'new synoptic'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un rapport synoptique", "nouveau rapport synoptique"],
      de: ["synoptischen bericht hinzufügen", "neuer synoptischer bericht"],
      nl: ["synoptisch rapport toevoegen", "nieuw synoptisch rapport"],
      ko: ["정형보고서 추가", "새 정형보고서"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'NOTE_ADD', label: 'Add Note', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+N', internalKey: 'F17+PS020',
    voiceTriggers: ['add note', 'new note', 'open add note'],
    voiceTriggersByLanguage: {
      fr: ["ajouter une note", "nouvelle note"],
      de: ["notiz hinzufügen", "neue notiz"],
      nl: ["notitie toevoegen", "nieuwe notitie"],
      ko: ["메모 추가", "새 메모"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'NOTE_DICTATE', label: 'Dictate Note', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+N', internalKey: 'F17+PS021',
    voiceTriggers: ['dictate note', 'dictate', 'dictate into note'],
    voiceTriggersByLanguage: {
      fr: ["dicter la note", "dicter"],
      de: ["notiz diktieren", "diktieren"],
      nl: ["notitie dicteren", "dicteren"],
      ko: ["메모 구술", "구술"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'NOTE_VISIBILITY_PRIVATE', label: 'Note Visibility Private', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+J', internalKey: 'F17+PS022',
    voiceTriggers: ['visibility private', 'set private', 'private note', 'make private'],
    voiceTriggersByLanguage: {
      fr: ["visibilité privée", "rendre privé"],
      de: ["sichtbarkeit privat", "privat machen"],
      nl: ["zichtbaarheid privé", "privé maken"],
      ko: ["비공개 설정", "비공개로 전환"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'NOTE_VISIBILITY_SHARED', label: 'Note Visibility Shared', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+N', internalKey: 'F17+PS023',
    voiceTriggers: ['visibility shared', 'set shared', 'shared note', 'make shared'],
    voiceTriggersByLanguage: {
      fr: ["visibilité partagée", "rendre partagé"],
      de: ["sichtbarkeit geteilt", "teilen"],
      nl: ["zichtbaarheid gedeeld", "delen"],
      ko: ["공유 설정", "공유로 전환"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'NOTE_SAVE', label: 'Save Note', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+S', internalKey: 'F17+PS024',
    voiceTriggers: ['save note', 'submit note', 'save'],
    voiceTriggersByLanguage: {
      fr: ["enregistrer la note", "soumettre la note"],
      de: ["notiz speichern", "notiz einreichen"],
      nl: ["notitie opslaan", "notitie indienen"],
      ko: ["메모 저장", "메모 제출"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'NOTE_CANCEL', label: 'Cancel Note', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+B', internalKey: 'F17+PS025',
    voiceTriggers: ['cancel note', 'discard note'],
    voiceTriggersByLanguage: {
      fr: ["annuler la note", "abandonner la note"],
      de: ["notiz abbrechen", "notiz verwerfen"],
      nl: ["notitie annuleren", "notitie weggooien"],
      ko: ["메모 취소", "메모 폐기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'NOTE_CLOSE', label: 'Close Notes', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+D', internalKey: 'F17+PS026',
    voiceTriggers: ['close notes', 'close drawer', 'close internal notes'],
    voiceTriggersByLanguage: {
      fr: ["fermer les notes", "fermer le tiroir"],
      de: ["notizen schließen", "schublade schließen"],
      nl: ["notities sluiten", "lade sluiten"],
      ko: ["메모 닫기", "서랍 닫기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'ADD_ADDENDUM', label: 'Add Addendum', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+B', internalKey: 'F17+PS027',
    voiceTriggers: ['add addendum', 'open addendum', 'addendum request', 'request addendum'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un addendum", "demande d'addendum"],
      de: ["nachtrag hinzufügen", "nachtragsanfrage"],
      nl: ["addendum toevoegen", "addendumverzoek"],
      ko: ["추가소견 추가", "추가소견 요청"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'ADD_AMENDMENT', label: 'Add Amendment', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+E', internalKey: 'F17+PS028',
    voiceTriggers: ['add amendment', 'open amendment', 'request amendment', 'amendment'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un amendement", "demande de modification"],
      de: ["änderung hinzufügen", "änderungsanfrage"],
      nl: ["wijziging toevoegen", "wijzigingsverzoek"],
      ko: ["정정 추가", "정정 요청"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'SIGNOUT_NEXT', label: 'Sign Out and Next', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+O', internalKey: 'F17+PS029',
    voiceTriggers: ['signout next', 'sign out next', 'finalize and next', 'sign out and next', 'next case sign out'],
    voiceTriggersByLanguage: {
      fr: ['signer et suivant', 'finaliser et suivant'],
      de: ['abzeichnen und weiter', 'abschließen und weiter'],
      nl: ['ondertekenen en volgende', 'afronden en volgende'],
      ko: ['서명 후 다음', '완료 후 다음'],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'GOTO_CODES', label: 'Go to Codes', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+G', internalKey: 'F17+PS030',
    voiceTriggers: ['goto codes', 'go to codes', 'codes tab', 'open codes'],
    voiceTriggersByLanguage: {
      fr: ["aller aux codes", "onglet codes"],
      de: ["zu codes", "code-registerkarte"],
      nl: ["naar codes", "codetabblad"],
      ko: ["코드로 이동", "코드 탭"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'VOICE_ADD_CODE', label: 'Add Code', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+H', internalKey: 'F17+PS040',
    voiceTriggers: ['add code', 'open add code', 'new code', 'add medical code'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un code", "nouveau code"],
      de: ["code hinzufügen", "neuer code"],
      nl: ["code toevoegen", "nieuwe code"],
      ko: ["코드 추가", "새 코드"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'SELECT_SPECIMEN', label: 'Select Specimen', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+I', internalKey: 'F17+PS031',
    voiceTriggers: ['select specimen', 'goto specimen', 'go to specimen', 'specimen one', 'specimen two', 'specimen three', 'specimen 1', 'specimen 2', 'specimen 3'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner le prélèvement", "prélèvement un", "prélèvement deux", "prélèvement trois"],
      de: ["probe auswählen", "probe eins", "probe zwei", "probe drei"],
      nl: ["specimen selecteren", "specimen een", "specimen twee", "specimen drie"],
      ko: ["검체 선택", "검체 1", "검체 2", "검체 3"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'OPEN_HISTORY', label: 'Open History', category: 'SYNOPTIC',
    shortcut: 'Alt+H', internalKey: 'F17+PS032',
    voiceTriggers: ['open history', 'show history', 'prior cases', 'similar cases', 'open similar cases'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir l'historique", "dossiers antérieurs", "dossiers similaires"],
      de: ["verlauf öffnen", "frühere fälle", "ähnliche fälle"],
      nl: ["geschiedenis openen", "eerdere zaken", "vergelijkbare zaken"],
      ko: ["이력 열기", "이전 증례", "유사 증례"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CLOSE_HISTORY', label: 'Close History', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+H', internalKey: 'F17+PS033',
    voiceTriggers: ['close history', 'close similar cases', 'close prior cases'],
    voiceTriggersByLanguage: {
      fr: ["fermer l'historique", "fermer les dossiers similaires"],
      de: ["verlauf schließen", "ähnliche fälle schließen"],
      nl: ["geschiedenis sluiten", "vergelijkbare zaken sluiten"],
      ko: ["이력 닫기", "유사 증례 닫기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'VOICE_CANCEL', label: 'Cancel', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+J', internalKey: 'F17+PS034',
    voiceTriggers: ['cancel', 'close modal', 'dismiss', 'go back to report'],
    voiceTriggersByLanguage: {
      fr: ["annuler", "fermer la fenêtre", "ignorer"],
      de: ["abbrechen", "fenster schließen", "verwerfen"],
      nl: ["annuleren", "venster sluiten", "negeren"],
      ko: ["취소", "창 닫기", "무시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── SEARCH context ─────────────────────────────────────────────────────
  {
    id: 'SEARCH_EXECUTE', label: 'Execute Search', category: VOICE_CONTEXT.SEARCH,
    shortcut: 'Alt+E', internalKey: 'F13+PS305',
    voiceTriggers: ['execute search', 'run search', 'search now', 'go', 'find'],
    voiceTriggersByLanguage: {
      fr: ["exécuter la recherche", "rechercher maintenant"],
      de: ["suche ausführen", "jetzt suchen"],
      nl: ["zoekopdracht uitvoeren", "nu zoeken"],
      ko: ["검색 실행", "지금 검색"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'SEARCH_CLEAR', label: 'Clear Search', category: VOICE_CONTEXT.SEARCH,
    shortcut: 'Alt+C', internalKey: 'F13+PS306',
    voiceTriggers: ['clear search', 'reset search', 'clear all', 'new search'],
    voiceTriggersByLanguage: {
      fr: ["effacer la recherche", "réinitialiser la recherche"],
      de: ["suche löschen", "suche zurücksetzen"],
      nl: ["zoekopdracht wissen", "zoekopdracht resetten"],
      ko: ["검색 지우기", "검색 초기화"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'SEARCH_LOAD_SAVED', label: 'Load Saved Search', category: VOICE_CONTEXT.SEARCH,
    shortcut: 'Alt+L', internalKey: 'F13+PS307',
    voiceTriggers: ['load search', 'open saved search', 'search protocol', 'saved search'],
    voiceTriggersByLanguage: {
      fr: ["charger la recherche", "ouvrir la recherche enregistrée"],
      de: ["suche laden", "gespeicherte suche öffnen"],
      nl: ["zoekopdracht laden", "opgeslagen zoekopdracht openen"],
      ko: ["검색 불러오기", "저장된 검색 열기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── FLAG MANAGER context (REPORTING) ────────────────────────────────
  {
    id: 'FLAG_SELECT_CASE', label: 'Select Case', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+K', internalKey: 'F17+PS035',
    voiceTriggers: ['select case', 'flag case', 'case flag'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner le dossier", "marquer le dossier"],
      de: ["fall auswählen", "fall markieren"],
      nl: ["zaak selecteren", "zaak markeren"],
      ko: ["증례 선택", "증례 플래그"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'FLAG_SELECT_ALL_SPECIMENS', label: 'Select All Specimens', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+L', internalKey: 'F17+PS036',
    voiceTriggers: ['select all specimens', 'all specimens', 'flag all specimens'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner tous les prélèvements", "marquer tous les prélèvements"],
      de: ["alle proben auswählen", "alle proben markieren"],
      nl: ["alle specimens selecteren", "alle specimens markeren"],
      ko: ["모든 검체 선택", "모든 검체 플래그"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'FLAG_DESELECT_ALL', label: 'Deselect All', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+M', internalKey: 'F17+PS037',
    voiceTriggers: ['deselect all', 'clear selection', 'deselect all specimens'],
    voiceTriggersByLanguage: {
      fr: ["tout désélectionner", "effacer la sélection"],
      de: ["alles abwählen", "auswahl aufheben"],
      nl: ["alles deselecteren", "selectie wissen"],
      ko: ["전체 선택 해제"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'FLAG_SAVE', label: 'Save Flags', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+O', internalKey: 'F17+PS038',
    voiceTriggers: ['save flags', 'apply flags'],
    voiceTriggersByLanguage: {
      fr: ["enregistrer les indicateurs", "appliquer les indicateurs"],
      de: ["markierungen speichern", "markierungen anwenden"],
      nl: ["vlaggen opslaan", "vlaggen toepassen"],
      ko: ["플래그 저장", "플래그 적용"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'FLAG_CANCEL', label: 'Cancel Flags', category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+X', internalKey: 'F17+PS039',
    voiceTriggers: ['cancel flags', 'discard flag changes', 'close flag manager'],
    voiceTriggersByLanguage: {
      fr: ["annuler les indicateurs", "fermer le gestionnaire"],
      de: ["markierungen abbrechen", "markierungsverwaltung schließen"],
      nl: ["vlaggen annuleren", "vlagbeheer sluiten"],
      ko: ["플래그 취소", "플래그 관리자 닫기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── MESSAGES context ──────────────────────────────────────────────────────
  // Navigation
  {
    id: 'MSG_NEXT', label: 'Next Message', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+ArrowDown', internalKey: ACTION_MAP['messages.next']?.internalKey ?? 'F18+PS001',
    voiceTriggers: ['next message', 'next', 'move to next message'],
    voiceTriggersByLanguage: {
      fr: ["message suivant", "suivant"],
      de: ["nächste nachricht", "nächste"],
      nl: ["volgend bericht", "volgende"],
      ko: ["다음 메시지", "다음"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_PREVIOUS', label: 'Previous Message', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+ArrowUp', internalKey: ACTION_MAP['messages.previous']?.internalKey ?? 'F18+PS002',
    voiceTriggers: ['previous message', 'previous', 'prior message'],
    voiceTriggersByLanguage: {
      fr: ["message précédent", "précédent"],
      de: ["vorherige nachricht", "vorherige"],
      nl: ["vorig bericht", "vorige"],
      ko: ["이전 메시지", "이전"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // Core actions
  {
    id: 'MSG_REPLY', label: 'Reply', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+Shift+R', internalKey: ACTION_MAP['messages.reply']?.internalKey ?? 'F18+PS003',
    voiceTriggers: ['reply', 'reply to message', 'respond', 'respond to message'],
    voiceTriggersByLanguage: {
      fr: ["répondre", "répondre au message"],
      de: ["antworten", "auf nachricht antworten"],
      nl: ["beantwoorden", "bericht beantwoorden"],
      ko: ["답장", "메시지에 답장"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    // Disambiguated: AppShell listener checks filterType/isEditing to decide
    // soft delete vs permanent delete. Single trigger covers all UI states.
    id: 'MSG_DELETE', label: 'Delete Message', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+Delete', internalKey: ACTION_MAP['messages.delete']?.internalKey ?? 'F18+PS004',
    voiceTriggers: ['delete message', 'delete this message', 'remove message', 'delete'],
    voiceTriggersByLanguage: {
      fr: ["supprimer le message", "supprimer ce message"],
      de: ["nachricht löschen", "diese nachricht löschen"],
      nl: ["bericht verwijderen", "dit bericht verwijderen"],
      ko: ["메시지 삭제", "이 메시지 삭제"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_MARK_READ', label: 'Mark as Read', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+M', internalKey: ACTION_MAP['messages.markRead']?.internalKey ?? 'F18+PS005',
    voiceTriggers: ['mark as read', 'mark read', 'read this message'],
    voiceTriggersByLanguage: {
      fr: ["marquer comme lu", "marquer lu"],
      de: ["als gelesen markieren", "gelesen markieren"],
      nl: ["markeren als gelezen", "gelezen markeren"],
      ko: ["읽음으로 표시", "읽음 처리"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_MARK_READ_ALL', label: 'Mark All as Read', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+A', internalKey: 'F18+PS024',
    voiceTriggers: ['read all', 'mark all read', 'mark all as read', 'read all messages'],
    voiceTriggersByLanguage: {
      fr: ["tout marquer comme lu", "tout lire"],
      de: ["alle als gelesen markieren", "alle lesen"],
      nl: ["alles markeren als gelezen", "alles lezen"],
      ko: ["모두 읽음으로 표시", "전체 읽음"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    // Marks the currently open thread message as unread — available via ⋯ menu or voice
    id: 'MSG_MARK_UNREAD', label: 'Mark as Unread', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+U', internalKey: ACTION_MAP['messages.markUnread']?.internalKey ?? 'F18+PS014',
    voiceTriggers: ['mark as unread', 'mark unread', 'unread', 'set as unread'],
    voiceTriggersByLanguage: {
      fr: ["marquer comme non lu", "marquer non lu"],
      de: ["als ungelesen markieren", "ungelesen markieren"],
      nl: ["markeren als ongelezen", "ongelezen markeren"],
      ko: ["안읽음으로 표시", "안읽음 처리"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // Compose
  {
    id: 'MSG_COMPOSE', label: 'New Internal Message', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+Shift+C', internalKey: ACTION_MAP['messages.compose']?.internalKey ?? 'F18+PS007',
    voiceTriggers: ['compose', 'compose message', 'new message', 'write message', 'create message', 'internal message'],
    voiceTriggersByLanguage: {
      fr: ["rédiger", "nouveau message", "écrire un message"],
      de: ["verfassen", "neue nachricht", "nachricht schreiben"],
      nl: ["opstellen", "nieuw bericht", "bericht schrijven"],
      ko: ["작성", "새 메시지", "메시지 쓰기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_SEND', label: 'Send Message', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+Shift+Enter', internalKey: ACTION_MAP['messages.send']?.internalKey ?? 'F18+PS008',
    voiceTriggers: ['send', 'send message', 'send this message', 'submit message', 'send internally'],
    voiceTriggersByLanguage: {
      fr: ["envoyer", "envoyer le message"],
      de: ["senden", "nachricht senden"],
      nl: ["verzenden", "bericht verzenden"],
      ko: ["보내기", "메시지 보내기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    // Routes to external secure email gateway (Paubox / Virtru / Zix).
    // Requires at least one recipient and a subject/body to be active.
    id: 'MSG_SECURE_EMAIL', label: 'Send Secure Email', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+Shift+E', internalKey: ACTION_MAP['messages.secureEmail']?.internalKey ?? 'F18+PS015',
    voiceTriggers: ['secure email', 'send secure email', 'send email', 'external email', 'secure message'],
    voiceTriggersByLanguage: {
      fr: ["e-mail sécurisé", "envoyer un e-mail sécurisé"],
      de: ["sichere e-mail", "sichere e-mail senden"],
      nl: ["beveiligde e-mail", "beveiligde e-mail verzenden"],
      ko: ["보안 이메일", "보안 이메일 발송"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // To: field — recipient management
  {
    // Opens full UserSearchOverlay from the To: field spyglass button
    id: 'MSG_RECIPIENT_SEARCH', label: 'Search Recipients', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+S', internalKey: ACTION_MAP['messages.recipientSearch']?.internalKey ?? 'F18+PS016',
    voiceTriggers: ['search recipients', 'find user', 'search for user', 'browse users', 'open recipient search'],
    voiceTriggersByLanguage: {
      fr: ["rechercher des destinataires", "rechercher un utilisateur"],
      de: ["empfänger suchen", "benutzer suchen"],
      nl: ["ontvangers zoeken", "gebruiker zoeken"],
      ko: ["수신자 검색", "사용자 검색"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    // Confirms the highlighted suggestion in the To: inline dropdown (same as Enter/Tab key)
    id: 'MSG_RECIPIENT_ADD', label: 'Add Recipient', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+R', internalKey: ACTION_MAP['messages.recipientAdd']?.internalKey ?? 'F18+PS017',
    voiceTriggers: ['add recipient', 'add this person', 'select recipient', 'confirm recipient'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un destinataire", "sélectionner le destinataire"],
      de: ["empfänger hinzufügen", "empfänger auswählen"],
      nl: ["ontvanger toevoegen", "ontvanger selecteren"],
      ko: ["수신자 추가", "수신자 선택"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // Compose field helpers
  {
    id: 'MSG_GOTO_SUBJECT', label: 'Go to Subject', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+G', internalKey: ACTION_MAP['messages.gotoSubject']?.internalKey ?? 'F18+PS010',
    voiceTriggers: ['goto subject', 'go to subject', 'enter subject', 'type subject', 'subject field'],
    voiceTriggersByLanguage: {
      fr: ["aller à l'objet", "saisir l'objet"],
      de: ["zum betreff", "betreff eingeben"],
      nl: ["naar onderwerp", "onderwerp invoeren"],
      ko: ["제목으로 이동", "제목 입력"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_GOTO_BODY', label: 'Go to Message Body', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+B', internalKey: ACTION_MAP['messages.gotoBody']?.internalKey ?? 'F18+PS011',
    voiceTriggers: ['goto message', 'go to message', 'enter message', 'type message', 'message body', 'message field'],
    voiceTriggersByLanguage: {
      fr: ["aller au message", "saisir le message"],
      de: ["zur nachricht", "nachricht eingeben"],
      nl: ["naar bericht", "bericht invoeren"],
      ko: ["본문으로 이동", "본문 입력"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_CLEAR_SUBJECT', label: 'Clear Subject', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+C', internalKey: ACTION_MAP['messages.clearSubject']?.internalKey ?? 'F18+PS012',
    voiceTriggers: ['clear subject', 'erase subject', 'delete subject', 'remove subject'],
    voiceTriggersByLanguage: {
      fr: ["effacer l'objet", "supprimer l'objet"],
      de: ["betreff löschen", "betreff entfernen"],
      nl: ["onderwerp wissen", "onderwerp verwijderen"],
      ko: ["제목 지우기", "제목 삭제"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_CLEAR_BODY', label: 'Clear Message Body', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+Shift+M', internalKey: ACTION_MAP['messages.clearBody']?.internalKey ?? 'F18+PS013',
    voiceTriggers: ['clear message', 'erase message', 'delete message body', 'start over', 'clear body'],
    voiceTriggersByLanguage: {
      fr: ["effacer le message", "recommencer"],
      de: ["nachricht löschen", "von vorne beginnen"],
      nl: ["bericht wissen", "opnieuw beginnen"],
      ko: ["본문 지우기", "다시 시작"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // Urgent toggle — in compose panel
  {
    id: 'MSG_URGENT', label: 'Toggle Urgent', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+T', internalKey: ACTION_MAP['messages.markUrgent']?.internalKey ?? 'F18+PS006',
    voiceTriggers: ['urgent', 'mark urgent', 'toggle urgent', 'set urgent', 'mark as urgent'],
    voiceTriggersByLanguage: {
      fr: ["urgent", "marquer urgent"],
      de: ["dringend", "als dringend markieren"],
      nl: ["urgent", "markeren als urgent"],
      ko: ["긴급", "긴급으로 표시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  // View and management
  {
    id: 'MSG_CLOSE', label: 'Close Messages', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Escape', internalKey: ACTION_MAP['messages.close']?.internalKey ?? 'F18+PS009',
    voiceTriggers: ['close messages', 'close', 'dismiss messages', 'hide messages', 'close drawer'],
    voiceTriggersByLanguage: {
      fr: ["fermer les messages", "fermer"],
      de: ["nachrichten schließen", "schließen"],
      nl: ["berichten sluiten", "sluiten"],
      ko: ["메시지 닫기", "닫기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_SEARCH', label: 'Search Messages', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+Shift+S', internalKey: ACTION_MAP['messages.search']?.internalKey ?? 'F18+PS018',
    voiceTriggers: ['search messages', 'search', 'find message', 'filter messages'],
    voiceTriggersByLanguage: {
      fr: ["rechercher des messages", "rechercher"],
      de: ["nachrichten durchsuchen", "suchen"],
      nl: ["berichten doorzoeken", "zoeken"],
      ko: ["메시지 검색", "검색"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_EDIT', label: 'Toggle Edit Mode', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+E', internalKey: ACTION_MAP['messages.edit']?.internalKey ?? 'F18+PS019',
    voiceTriggers: ['edit', 'edit messages', 'select messages', 'manage messages', 'edit mode'],
    voiceTriggersByLanguage: {
      fr: ["modifier", "gérer les messages"],
      de: ["bearbeiten", "nachrichten verwalten"],
      nl: ["bewerken", "berichten beheren"],
      ko: ["편집", "메시지 관리"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_VIEW_DELETED', label: 'View Recently Deleted', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+V', internalKey: ACTION_MAP['messages.viewDeleted']?.internalKey ?? 'F18+PS021',
    voiceTriggers: ['view deleted', 'show deleted', 'recently deleted', 'deleted messages'],
    voiceTriggersByLanguage: {
      fr: ["voir les supprimés", "messages supprimés"],
      de: ["gelöschte anzeigen", "gelöschte nachrichten"],
      nl: ["verwijderde tonen", "verwijderde berichten"],
      ko: ["삭제됨 보기", "삭제된 메시지"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_VIEW_MESSAGES', label: 'View Messages', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+Shift+V', internalKey: 'F18+PS023',
    voiceTriggers: ['view messages', 'show messages list', 'back to messages', 'inbox'],
    voiceTriggersByLanguage: {
      fr: ["voir les messages", "retour aux messages", "boîte de réception"],
      de: ["nachrichten anzeigen", "zurück zu nachrichten", "posteingang"],
      nl: ["berichten tonen", "terug naar berichten", "postvak"],
      ko: ["메시지 보기", "메시지로 돌아가기", "받은편지함"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_RESTORE', label: 'Restore Message', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Ctrl+Alt+R', internalKey: ACTION_MAP['messages.restore']?.internalKey ?? 'F18+PS020',
    voiceTriggers: ['restore', 'restore message', 'undelete', 'undelete message', 'recover message'],
    voiceTriggersByLanguage: {
      fr: ["restaurer", "restaurer le message"],
      de: ["wiederherstellen", "nachricht wiederherstellen"],
      nl: ["herstellen", "bericht herstellen"],
      ko: ["복원", "메시지 복원"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'MSG_DELETE_ALL', label: 'Delete All Selected', category: VOICE_CONTEXT.MESSAGES,
    shortcut: 'Alt+D', internalKey: ACTION_MAP['messages.deleteAll']?.internalKey ?? 'F18+PS022',
    voiceTriggers: ['delete all', 'delete all selected', 'delete all messages', 'empty deleted'],
    voiceTriggersByLanguage: {
      fr: ["tout supprimer", "vider les supprimés"],
      de: ["alle löschen", "gelöschte leeren"],
      nl: ["alles verwijderen", "verwijderde leegmaken"],
      ko: ["전체 삭제", "삭제함 비우기"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── CASE TEAM ─────────────────────────────────────────────────────────────
  {
    id: 'OPEN_CASE_TEAM',
    label: 'Open Case Team',
    category: 'SYNOPTIC',
    shortcut: 'Alt+T',
    internalKey: 'F13+PS200',
    voiceTriggers: ['open case team', 'case team', 'manage team', 'show team', 'team members'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir l'équipe du dossier", "équipe du dossier", "gérer l'équipe"],
      de: ["fallteam öffnen", "fallteam", "team verwalten"],
      nl: ["zaakteam openen", "zaakteam", "team beheren"],
      ko: ["증례 팀 열기", "증례 팀", "팀 관리"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'CASE_TEAM_ADD',
    label: 'Add Team Member',
    category: 'SYNOPTIC',
    shortcut: 'Alt+M',
    internalKey: 'F13+PS201',
    voiceTriggers: ['add team member', 'add participant', 'add to team', 'assign participant'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un membre", "ajouter un participant"],
      de: ["teammitglied hinzufügen", "teilnehmer hinzufügen"],
      nl: ["teamlid toevoegen", "deelnemer toevoegen"],
      ko: ["팀원 추가", "참여자 추가"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'CASE_TEAM_ASSIGN',
    label: 'Assign to Participation Type',
    category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+A',
    internalKey: 'F13+PS202',
    voiceTriggers: ['assign as', 'assign to', 'set as primary', 'set as consultant', 'set as grossing'],
    voiceTriggersByLanguage: {
      fr: ["assigner comme", "définir comme principal"],
      de: ["zuweisen als", "als hauptverantwortlich festlegen"],
      nl: ["toewijzen als", "instellen als primair"],
      ko: ["역할 지정", "주치의로 지정"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },

  // ── WORKLIST — participation filters ──────────────────────────────────────
  {
    id: 'TABLE_FILTER_PARTICIPATING',
    label: 'Filter My Cases',
    category: 'WORKLIST',
    shortcut: 'Ctrl+Alt+F',
    internalKey: 'F15+PS030',
    voiceTriggers: ['my cases', 'cases i am on', 'my participating cases', 'filter my cases', 'show my cases'],
    voiceTriggersByLanguage: {
      fr: ["mes dossiers", "afficher mes dossiers"],
      de: ["meine fälle", "meine fälle anzeigen"],
      nl: ["mijn zaken", "mijn zaken tonen"],
      ko: ["내 증례", "내 증례 표시"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'TABLE_FILTER_COUNTERSIGN',
    label: 'Filter Awaiting Countersign',
    category: 'WORKLIST',
    shortcut: 'Alt+A',
    internalKey: 'F15+PS031',
    voiceTriggers: ['awaiting countersign', 'needs countersign', 'pending countersign', 'countersign cases'],
    voiceTriggersByLanguage: {
      fr: ["en attente de contresignature", "à contresigner"],
      de: ["gegenzeichnung ausstehend", "zu gegenzeichnen"],
      nl: ["wacht op medeondertekening", "te medeondertekenen"],
      ko: ["부서명 대기", "부서명 필요"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'TABLE_FILTER_POOL',
    label: 'Filter Pool Cases',
    category: 'WORKLIST',
    shortcut: 'Alt+Shift+P',
    internalKey: 'F15+PS032',
    voiceTriggers: ['pool cases', 'show pool', 'unassigned cases', 'filter pool'],
    voiceTriggersByLanguage: {
      fr: ["dossiers du pool", "dossiers non assignés"],
      de: ["pool-fälle", "nicht zugewiesene fälle"],
      nl: ["poolzaken", "niet-toegewezen zaken"],
      ko: ["풀 증례", "미배정 증례"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },

  // ── ROUTING (Config context) ───────────────────────────────────────────────
  {
    id: 'OPEN_ROUTING_RULES',
    label: 'Open Routing Rules',
    category: 'SYSTEM',
    shortcut: 'Alt+R',
    internalKey: 'F13+PS210',
    voiceTriggers: ['open routing rules', 'routing rules', 'case routing', 'open case routing'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir les règles de routage", "règles de routage"],
      de: ["routing-regeln öffnen", "routing-regeln"],
      nl: ["routeringsregels openen", "routeringsregels"],
      ko: ["라우팅 규칙 열기", "라우팅 규칙"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'TEST_ROUTING',
    label: 'Test Routing Rule',
    category: 'SYSTEM',
    shortcut: 'Alt+Shift+T',
    internalKey: 'F13+PS211',
    voiceTriggers: ['test routing', 'test rule', 'check routing', 'route this specimen'],
    voiceTriggersByLanguage: {
      fr: ["tester le routage", "tester la règle"],
      de: ["routing testen", "regel testen"],
      nl: ["routering testen", "regel testen"],
      ko: ["라우팅 테스트", "규칙 테스트"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },

  // ── PARTICIPATION TYPES (Config context) ──────────────────────────────────
  {
    id: 'OPEN_PARTICIPATION_TYPES',
    label: 'Open Participation Types',
    category: 'SYSTEM',
    shortcut: 'Alt+P',
    internalKey: 'F13+PS220',
    voiceTriggers: ['participation types', 'open participation types', 'case participation', 'manage participation types'],
    voiceTriggersByLanguage: {
      fr: ["types de participation", "gérer les types de participation"],
      de: ["teilnahmearten", "teilnahmearten verwalten"],
      nl: ["deelnametypes", "deelnametypes beheren"],
      ko: ["참여 유형", "참여 유형 관리"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },

  // ── Computational Sidecar ───────────────────────────────────────────────────
  {
    id: 'COMP_OPEN_SIDECAR',
    label: 'Open Computational Panel',
    category: 'SYNOPTIC',
    shortcut: 'Alt+O',
    internalKey: 'F13+PS230',
    voiceTriggers: ['open computational', 'show computationals', 'open results panel', 'lab results', 'show lab panel'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir les résultats de laboratoire", "panneau de résultats"],
      de: ["laborergebnisse öffnen", "ergebnispanel"],
      nl: ["laboratoriumresultaten openen", "resultatenpaneel"],
      ko: ["검사 결과 열기", "결과 패널"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'COMP_ORDER_OPEN',
    label: 'Order Additional Test',
    category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+O',
    internalKey: 'F13+PS231',
    voiceTriggers: ['order test', 'order additional test', 'add test', 'order panel', 'order lab test'],
    voiceTriggersByLanguage: {
      fr: ["commander un test", "ajouter un test"],
      de: ["test bestellen", "test hinzufügen"],
      nl: ["test bestellen", "test toevoegen"],
      ko: ["검사 오더", "검사 추가"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'COMP_ORDER_PLACE',
    label: 'Place Computational Orders',
    category: 'SYNOPTIC',
    shortcut: 'Alt+C',
    internalKey: 'F13+PS232',
    voiceTriggers: ['place order', 'place orders', 'confirm order', 'submit order', 'send order'],
    voiceTriggersByLanguage: {
      fr: ["passer la commande", "confirmer la commande"],
      de: ["bestellung aufgeben", "bestellung bestätigen"],
      nl: ["order plaatsen", "order bevestigen"],
      ko: ["오더 접수", "오더 확인"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'COMP_ORDER_CANCEL',
    label: 'Cancel Computational Order',
    category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+C',
    internalKey: 'F13+PS233',
    voiceTriggers: ['cancel order', 'cancel test', 'cancel lab order', 'remove order'],
    voiceTriggersByLanguage: {
      fr: ["annuler la commande", "annuler le test"],
      de: ["bestellung stornieren", "test stornieren"],
      nl: ["order annuleren", "test annuleren"],
      ko: ["오더 취소", "검사 취소"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },

  // ── Flag Management ─────────────────────────────────────────────────────────
  {
    id: 'FLAG_OPEN_MANAGER',
    label: 'Open Flag Manager',
    category: 'SYNOPTIC',
    shortcut: 'Alt+F',
    internalKey: 'F13+PS240',
    voiceTriggers: ['open flags', 'manage flags', 'show flags', 'add flag'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir les indicateurs", "gérer les indicateurs"],
      de: ["markierungen öffnen", "markierungen verwalten"],
      nl: ["vlaggen openen", "vlaggen beheren"],
      ko: ["플래그 열기", "플래그 관리"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'FLAG_APPLY_STAT',
    label: 'Apply STAT Flag',
    category: 'SYNOPTIC',
    shortcut: 'Alt+S',
    internalKey: 'F13+PS241',
    voiceTriggers: ['flag stat', 'mark stat', 'stat flag', 'urgent stat', 'rush processing'],
    voiceTriggersByLanguage: {
      fr: ["marquer stat", "traitement urgent"],
      de: ["als stat markieren", "dringende bearbeitung"],
      nl: ["markeren als stat", "spoedbehandeling"],
      ko: ["STAT 표시", "긴급 처리"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },

  // ── Add Orders — Block/Recut, Specimen, Stain tiers ─────────────────────────
  // Four separate actions, not one generic "add orders" plus manual tab
  // clicks — someone saying "add block" already knows which tier they
  // mean, and landing them straight on that tab is the whole point of
  // having the tiers be distinct in the first place. ADD_ORDERS alone
  // (no tier specified) opens to whichever tab the case's current
  // status puts first, matching the button's own default.
  {
    id: 'ADD_ORDERS',
    label: 'Add Orders',
    category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+A',
    internalKey: 'F24+PS040',
    voiceTriggers: ['add orders', 'open add orders', 'new order'],
    voiceTriggersByLanguage: {
      fr: ["ajouter des commandes", "nouvelle commande"],
      de: ["aufträge hinzufügen", "neuer auftrag"],
      nl: ["orders toevoegen", "nieuwe order"],
      ko: ["오더 추가", "새 오더"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'ADD_ORDERS_BLOCK',
    label: 'Add Block / Recut',
    category: 'SYNOPTIC',
    shortcut: 'Alt+B',
    internalKey: 'F24+PS041',
    voiceTriggers: ['add block', 'add recut', 'add cassette', 'order deeper levels', 'recut block'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un bloc", "ajouter une recoupe", "ajouter une cassette"],
      de: ["block hinzufügen", "nachschnitt hinzufügen", "kassette hinzufügen"],
      nl: ["blok toevoegen", "hersnede toevoegen", "cassette toevoegen"],
      ko: ["블록 추가", "재절단 추가", "카세트 추가"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'ADD_ORDERS_STAIN',
    label: 'Order Stain / Sectioning',
    category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+S',
    internalKey: 'F24+PS042',
    voiceTriggers: ['order stain', 'order sectioning', 'add stain', 'order ihc', 'order levels'],
    voiceTriggersByLanguage: {
      fr: ["commander une coloration", "ajouter une coloration", "commander ihc"],
      de: ["färbung bestellen", "färbung hinzufügen", "ihc bestellen"],
      nl: ["kleuring bestellen", "kleuring toevoegen", "ihc bestellen"],
      ko: ["염색 오더", "염색 추가", "IHC 오더"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'ADD_ORDERS_SPECIMEN',
    label: 'Add New Specimen',
    category: 'SYNOPTIC',
    shortcut: 'Alt+N',
    internalKey: 'F24+PS043',
    voiceTriggers: ['add new specimen', 'add specimen container', 'new tissue container'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un nouveau prélèvement", "nouveau contenant de tissu"],
      de: ["neue probe hinzufügen", "neuer gewebebehälter"],
      nl: ["nieuw specimen toevoegen", "nieuwe weefselcontainer"],
      ko: ["새 검체 추가", "새 조직 용기"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },

  // ── Report / Dirty State ────────────────────────────────────────────────────
  {
    id: 'SAVE_DRAFT',
    label: 'Save Report Draft',
    category: 'SYNOPTIC',
    shortcut: 'Alt+R',
    internalKey: 'F13+PS250',
    voiceTriggers: ['save draft', 'save report', 'save changes', 'save my work'],
    voiceTriggersByLanguage: {
      fr: ['enregistrer le brouillon', 'enregistrer le rapport', 'enregistrer les modifications'],
      de: ['entwurf speichern', 'bericht speichern', 'änderungen speichern'],
      nl: ['concept opslaan', 'rapport opslaan', 'wijzigingen opslaan'],
      ko: ['초안 저장', '보고서 저장', '변경사항 저장'],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'DISCARD_CHANGES',
    label: 'Discard Unsaved Changes',
    category: 'SYNOPTIC',
    shortcut: 'Alt+U',
    internalKey: 'F13+PS251',
    voiceTriggers: ['discard changes', 'undo all changes', 'revert changes', 'cancel changes'],
    voiceTriggersByLanguage: {
      fr: ["annuler les modifications", "annuler toutes les modifications"],
      de: ["änderungen verwerfen", "alle änderungen rückgängig machen"],
      nl: ["wijzigingen weggooien", "alle wijzigingen ongedaan maken"],
      ko: ["변경 취소", "모든 변경 취소"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },

  // ── Report Template ─────────────────────────────────────────────────────────
  {
    id: 'TEMPLATE_SELECT',
    label: 'Select Report Template',
    category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+R',
    internalKey: 'F13+PS260',
    voiceTriggers: ['select template', 'change template', 'choose template', 'switch template'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner un modèle", "changer de modèle"],
      de: ["vorlage auswählen", "vorlage ändern"],
      nl: ["sjabloon selecteren", "sjabloon wijzigen"],
      ko: ["템플릿 선택", "템플릿 변경"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },



  // ── Case Search — NavBar identifier search bar ──────────────────────────────
  {
    id: 'FOCUS_CASE_SEARCH',
    label: 'Focus Case Search',
    category: 'SYSTEM',
    shortcut: 'Alt+F',
    internalKey: 'F13+PS011',
    voiceTriggers: ['search case', 'find case', 'look up case', 'case search', 'search identifier', 'open case search'],
    voiceTriggersByLanguage: {
      fr: ["rechercher un dossier", "trouver un dossier"],
      de: ["fall suchen", "fall finden"],
      nl: ["zaak zoeken", "zaak vinden"],
      ko: ["증례 검색", "증례 찾기"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },

  // ── Consultation delegation ───────────────────────────────────────────────────
  {
    id: 'DELEGATE_CONSULTATION',
    label: 'Request Consultation',
    category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+R',
    internalKey: 'F17+PS046',
    voiceTriggers: ['request consultation', 'request review', 'send for review', 'consult colleague', 'second opinion', 'peer review'],
    voiceTriggersByLanguage: {
      fr: ["demander une consultation", "demander un second avis"],
      de: ["konsultation anfordern", "zweitmeinung anfordern"],
      nl: ["consultatie aanvragen", "tweede mening aanvragen"],
      ko: ["협진 요청", "세컨드 오피니언"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },

  // ── Attending sign-out decisions — real, per direct follow-up ("the
  // actions list is out of sync... actions that have yet to be
  // recorded"): both added here, real features built this session,
  // neither had ever been registered. Both genuinely restricted to
  // Pathologist — the same real, attending-only actions
  // useSignOutWorkflow.ts's own handleReturnToTrainee()/
  // ReleaseBufferBanner.tsx's own handleRecall() already gate to.
  {
    id: 'RETURN_TO_TRAINEE',
    label: 'Return to Trainee',
    category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+T',
    internalKey: 'F17+PS041',
    voiceTriggers: ['return to trainee', 'reject with notes', 'send back to resident', 'return case to resident'],
    voiceTriggersByLanguage: {
      fr: ["retourner au stagiaire", "renvoyer au résident"],
      de: ["an assistenzarzt zurückgeben", "an resident zurücksenden"],
      nl: ["terugsturen naar arts-assistent", "terugsturen naar resident"],
      ko: ["전공의에게 반환", "레지던트에게 반송"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },
  {
    id: 'RECALL_REPORT',
    label: 'Recall Report',
    category: 'SYNOPTIC',
    shortcut: 'Ctrl+Alt+Shift+V',
    internalKey: 'F17+PS042',
    voiceTriggers: ['recall report', 'pull back report', 'recall the report'],
    voiceTriggersByLanguage: {
      fr: ["rappeler le rapport", "retirer le rapport"],
      de: ["bericht zurückrufen", "bericht zurückziehen"],
      nl: ["rapport terugroepen", "rapport terugtrekken"],
      ko: ["보고서 회수", "보고서 철회"],
    },
    learnedTriggers: [],
    requiredRole: 'Pathologist',
    isActive: true,
  },

  // ── GROSSING — reachable from the same page as the SYNOPTIC actions
  // above, not a separate context; grossing isn't a separate page.
  // "Mark grossed" and "confirm triage" are the two that actually
  // change real case state (block status, specimen triage
  // confirmation) — built alongside these triggers since neither
  // existed anywhere before this pass (no UI advanced a block's
  // status, no state tracked triage confirmation).
  {
    id: 'GROSSING_NEXT_BLOCK', label: 'Next Block', category: 'SYNOPTIC',
    shortcut: 'Alt+.', internalKey: 'F24+PS036',
    voiceTriggers: ['next block', 'go to next block'],
    voiceTriggersByLanguage: {
      fr: ["bloc suivant", "aller au bloc suivant"],
      de: ["nächster block", "zum nächsten block"],
      nl: ["volgend blok", "naar volgend blok"],
      ko: ["다음 블록", "다음 블록으로"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'GROSSING_PREVIOUS_BLOCK', label: 'Previous Block', category: 'SYNOPTIC',
    shortcut: 'Alt+,', internalKey: 'F24+PS037',
    voiceTriggers: ['previous block', 'go to previous block', 'prior block'],
    voiceTriggersByLanguage: {
      fr: ["bloc précédent", "aller au bloc précédent"],
      de: ["vorheriger block", "zum vorherigen block"],
      nl: ["vorig blok", "naar vorig blok"],
      ko: ["이전 블록", "이전 블록으로"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'GROSSING_MARK_GROSSED', label: 'Mark Block Grossed', category: 'SYNOPTIC',
    shortcut: 'Alt+G', internalKey: 'F24+PS038',
    voiceTriggers: ['mark grossed', 'block grossed', 'block complete', 'grossing complete'],
    voiceTriggersByLanguage: {
      fr: ["marquer macroscopie faite", "bloc terminé"],
      de: ["makroskopie erledigt markieren", "block abgeschlossen"],
      nl: ["macroscopie voltooid markeren", "blok voltooid"],
      ko: ["육안검사 완료 표시", "블록 완료"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'GROSSING_CONFIRM_TRIAGE', label: 'Confirm Triage', category: 'SYNOPTIC',
    shortcut: 'Alt+Shift+T', internalKey: 'F24+PS039',
    voiceTriggers: ['confirm triage', 'triage complete', 'triage confirmed'],
    voiceTriggersByLanguage: {
      fr: ["confirmer le triage", "triage terminé"],
      de: ["triage bestätigen", "triage abgeschlossen"],
      nl: ["triage bevestigen", "triage voltooid"],
      ko: ["분류 확인", "분류 완료"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

  // ── TAT Trend tile switching — Contribution Dashboard ────────────────────────
  {
    id: 'TAT_SHOW_FIRST_TOUCH',
    label: 'Show First Touch TAT Trend',
    category: 'CONTRIBUTION',
    shortcut: 'Alt+S',
    internalKey: 'F25+PS001',
    voiceTriggers: ['show first touch', 'first touch trend', 'first touch tat'],
    voiceTriggersByLanguage: {
      fr: ["afficher premier contact", "tendance premier contact"],
      de: ["ersten kontakt anzeigen", "trend erster kontakt"],
      nl: ["eerste contact tonen", "trend eerste contact"],
      ko: ["최초 접촉 표시", "최초 접촉 추세"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'TAT_SHOW_TOTAL_CASE',
    label: 'Show Total Case TAT Trend',
    category: 'CONTRIBUTION',
    shortcut: 'Alt+T',
    internalKey: 'F25+PS002',
    voiceTriggers: ['show total case', 'total case trend', 'total tat'],
    voiceTriggersByLanguage: {
      fr: ["afficher le total du dossier", "tendance totale"],
      de: ["gesamtfall anzeigen", "gesamttrend"],
      nl: ["totale zaak tonen", "totale trend"],
      ko: ["전체 증례 표시", "전체 추세"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'TAT_SHOW_FROZEN_SECTION',
    label: 'Show Frozen Section TAT Trend',
    category: 'CONTRIBUTION',
    shortcut: 'Alt+F',
    internalKey: 'F25+PS003',
    voiceTriggers: ['show frozen section', 'frozen section trend', 'frozen section tat', 'intraop trend'],
    voiceTriggersByLanguage: {
      fr: ["afficher coupe congelée", "tendance coupe congelée"],
      de: ["gefrierschnitt anzeigen", "gefrierschnitt-trend"],
      nl: ["vriescoupe tonen", "vriescoupe-trend"],
      ko: ["동결절편 표시", "동결절편 추세"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'TAT_SHOW_GROSSING',
    label: 'Show Grossing TAT Trend',
    category: 'CONTRIBUTION',
    shortcut: 'Alt+G',
    internalKey: 'F25+PS004',
    voiceTriggers: ['show grossing', 'grossing trend', 'grossing tat'],
    voiceTriggersByLanguage: {
      fr: ["afficher macroscopie", "tendance macroscopie"],
      de: ["makroskopie anzeigen", "makroskopie-trend"],
      nl: ["macroscopie tonen", "macroscopie-trend"],
      ko: ["육안검사 표시", "육안검사 추세"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'TAT_SHOW_SIGN_OUT',
    label: 'Show Sign-Out TAT Trend',
    category: 'CONTRIBUTION',
    shortcut: 'Alt+Shift+S',
    internalKey: 'F25+PS005',
    voiceTriggers: ['show sign out', 'sign out trend', 'sign out tat', 'signout trend'],
    voiceTriggersByLanguage: {
      fr: ["afficher validation", "tendance validation"],
      de: ["abzeichnung anzeigen", "abzeichnungs-trend"],
      nl: ["aftekening tonen", "aftekening-trend"],
      ko: ["서명 표시", "서명 추세"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'TAT_SHOW_COLD_ISCHEMIA',
    label: 'Show Cold Ischaemia TAT Trend',
    category: 'CONTRIBUTION',
    shortcut: 'Alt+C',
    internalKey: 'F25+PS006',
    voiceTriggers: ['show cold ischemia', 'cold ischemia trend', 'cold ischaemia', 'ischemia trend'],
    voiceTriggersByLanguage: {
      fr: ["afficher ischémie froide", "tendance ischémie froide"],
      de: ["kalte ischämie anzeigen", "trend kalte ischämie"],
      nl: ["koude ischemie tonen", "trend koude ischemie"],
      ko: ["저온허혈 표시", "저온허혈 추세"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'TAT_SHOW_CONSULT_RESPONSE',
    label: 'Show My Response Time Trend',
    category: 'CONTRIBUTION',
    shortcut: 'Alt+R',
    internalKey: 'F25+PS007',
    voiceTriggers: ['show my response time', 'response time trend', 'consultation response trend', 'how fast do i respond'],
    voiceTriggersByLanguage: {
      fr: ["afficher mon temps de réponse", "tendance temps de réponse"],
      de: ["meine antwortzeit anzeigen", "trend antwortzeit"],
      nl: ["mijn reactietijd tonen", "trend reactietijd"],
      ko: ["응답 시간 표시", "응답 시간 추세"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },
  {
    id: 'TAT_SHOW_CONSULT_AWAITING',
    label: 'Show Awaiting Response Trend',
    category: 'CONTRIBUTION',
    shortcut: 'Alt+A',
    internalKey: 'F25+PS008',
    voiceTriggers: ['show awaiting response', 'awaiting response trend', 'how long am i waiting', 'consultation awaiting'],
    voiceTriggersByLanguage: {
      fr: ["afficher en attente de réponse", "tendance attente de réponse"],
      de: ["warten auf antwort anzeigen", "trend wartezeit"],
      nl: ["wachten op reactie tonen", "trend wachttijd"],
      ko: ["응답 대기 표시", "대기 추세"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: true,
  },

  // ── AUDIT — real, per direct follow-up ("the actions list is out
  // of sync... actions that have yet to be recorded"): both real
  // features, neither had ever been registered, and the page itself
  // (AuditLogPage.tsx) never even had its own voice context before
  // this same pass — see that page's own new setCurrentContext call.
  // No pre-existing shortcuts/triggers to collide with in this
  // context, since it's genuinely new.
  //
  // isActive: false on both, per direct follow-up: each real button
  // (OutboundInterfaceDlqSection.tsx's own onClick={() =>
  // retryDispatch(e)} / dispatchNow(e)) is genuinely per-row — one
  // specific queue entry, sending a real payload to a real receiving
  // endpoint. There's no reliable, safe default for "which entry"
  // a bare voice/keyboard trigger would mean, and a wrong guess here
  // isn't a cosmetic miss, it's the real risk of re-dispatching the
  // wrong message. Kept registered rather than deleted — so the
  // catalog stays accurate about what real actions this page has —
  // just deliberately never eligible for voice or keyboard dispatch.
  {
    id: 'DISPATCH_NOW',
    label: 'Dispatch Now',
    category: 'AUDIT',
    shortcut: 'Alt+D',
    internalKey: 'F25+PS009',
    voiceTriggers: ['dispatch now', 'send now', 'dispatch this message'],
    voiceTriggersByLanguage: {
      fr: ["envoyer maintenant", "transmettre maintenant"],
      de: ["jetzt senden", "jetzt übermitteln"],
      nl: ["nu verzenden", "nu versturen"],
      ko: ["지금 전송", "지금 발송"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: false,
  },
  {
    id: 'RETRY_DISPATCH',
    label: 'Retry Dispatch',
    category: 'AUDIT',
    shortcut: 'Alt+R',
    internalKey: 'F25+PS010',
    voiceTriggers: ['retry dispatch', 'retry send', 'resend'],
    voiceTriggersByLanguage: {
      fr: ["réessayer l'envoi", "renvoyer"],
      de: ["erneut senden", "wiederholen"],
      nl: ["opnieuw verzenden", "opnieuw proberen"],
      ko: ["재전송", "다시 보내기"],
    },
    learnedTriggers: [],
    requiredRole: 'All Staff',
    isActive: false,
  },

// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct guidance's own confirmed "fully voice ready"
// request for the Cytology Material/Synoptic drawers and Narrative
// Compilation engine — category: 'CYTOLOGY' throughout (see
// VOICE_CONTEXT.CYTOLOGY's own doc comment in constants/
// systemActions.ts for why this is a genuinely separate context from
// Surgical's own SYNOPTIC, not just a naming choice). Deliberately
// excludes the translation-validation acknowledgment checkbox and
// sign-out itself — both real, attributable, safety-relevant actions
// a misrecognized voice command shouldn't be able to trigger.
  {
    id: 'CYTOLOGY_OPEN_MATERIAL', label: 'Open Material', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+E', internalKey: 'F26+PS001',
    voiceTriggers: ['open material', 'show material', 'open material drawer'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir le matériel", "afficher le matériel"],
      de: ["material öffnen", "material anzeigen"],
      nl: ["materiaal openen", "materiaal weergeven"],
      ko: ["재료 열기", "재료 표시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_ADD_RESIDUAL_FLUID', label: 'Add Residual Fluid', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+H', internalKey: 'F26+PS002',
    voiceTriggers: ['add residual fluid', 'new residual fluid'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un liquide résiduel", "nouveau liquide résiduel"],
      de: ["restflüssigkeit hinzufügen", "neue restflüssigkeit"],
      nl: ["restvloeistof toevoegen", "nieuwe restvloeistof"],
      ko: ["잔여 액체 추가", "새 잔여 액체"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_ADD_CELL_BLOCK', label: 'Add Cell Block', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+I', internalKey: 'F26+PS003',
    voiceTriggers: ['add cell block', 'new cell block'],
    voiceTriggersByLanguage: {
      fr: ["ajouter un bloc cellulaire", "nouveau bloc cellulaire"],
      de: ["zellblock hinzufügen", "neuer zellblock"],
      nl: ["celblok toevoegen", "nieuw celblok"],
      ko: ["세포 블록 추가", "새 세포 블록"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_OPEN_SYNOPTIC', label: 'Open Cytology Synoptic', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+J', internalKey: 'F26+PS004',
    voiceTriggers: ['open synoptic', 'show synoptic', 'open synoptic form'],
    voiceTriggersByLanguage: {
      fr: ["ouvrir le rapport synoptique", "afficher le rapport synoptique"],
      de: ["synoptischen bericht öffnen", "synoptischen bericht anzeigen"],
      nl: ["synoptisch rapport openen", "synoptisch rapport weergeven"],
      ko: ["정형보고서 열기", "정형보고서 표시"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_SAVE_SYNOPTIC', label: 'Save Cytology Synoptic', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+K', internalKey: 'F26+PS005',
    voiceTriggers: ['save synoptic', 'save template', 'save synoptic report'],
    voiceTriggersByLanguage: {
      fr: ["enregistrer le rapport synoptique", "enregistrer le modèle"],
      de: ["synoptischen bericht speichern", "vorlage speichern"],
      nl: ["synoptisch rapport opslaan", "sjabloon opslaan"],
      ko: ["정형보고서 저장", "템플릿 저장"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_INSERT_NARRATIVE', label: 'Insert Generated Narrative', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+L', internalKey: 'F26+PS006',
    voiceTriggers: ['insert narrative', 'insert into notes', 'insert generated narrative'],
    voiceTriggersByLanguage: {
      fr: ["insérer le récit", "insérer dans les notes"],
      de: ["bericht einfügen", "in notizen einfügen"],
      nl: ["tekst invoegen", "invoegen in notities"],
      ko: ["서술 삽입", "노트에 삽입"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_SELECT_TEMPLATE_THYROID', label: 'Select Thyroid Template', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+M', internalKey: 'F26+PS007',
    voiceTriggers: ['select thyroid template', 'thyroid template', 'use thyroid template'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner le modèle thyroïde", "modèle thyroïde"],
      de: ["schilddrüsen-vorlage auswählen", "schilddrüsen-vorlage"],
      nl: ["schildkliersjabloon selecteren", "schildkliersjabloon"],
      ko: ["갑상선 템플릿 선택", "갑상선 템플릿"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_SELECT_TEMPLATE_PANCREATICOBILIARY', label: 'Select Pancreaticobiliary Template', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+Q', internalKey: 'F26+PS008',
    voiceTriggers: ['select pancreaticobiliary template', 'pancreaticobiliary template'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner le modèle pancréatobiliaire", "modèle pancréatobiliaire"],
      de: ["pankreatikobiliäre vorlage auswählen", "pankreatikobiliäre vorlage"],
      nl: ["pancreatobiliair sjabloon selecteren", "pancreatobiliair sjabloon"],
      ko: ["췌담도 템플릿 선택", "췌담도 템플릿"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_SELECT_TEMPLATE_SALIVARY_GLAND', label: 'Select Salivary Gland Template', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+U', internalKey: 'F26+PS009',
    voiceTriggers: ['select salivary gland template', 'salivary gland template'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner le modèle glande salivaire", "modèle glande salivaire"],
      de: ["speicheldrüsen-vorlage auswählen", "speicheldrüsen-vorlage"],
      nl: ["speekselkliersjabloon selecteren", "speekselkliersjabloon"],
      ko: ["침샘 템플릿 선택", "침샘 템플릿"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_SELECT_TEMPLATE_LYMPH_NODE', label: 'Select Lymph Node Template', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+W', internalKey: 'F26+PS010',
    voiceTriggers: ['select lymph node template', 'lymph node template'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner le modèle ganglion lymphatique", "modèle ganglion lymphatique"],
      de: ["lymphknoten-vorlage auswählen", "lymphknoten-vorlage"],
      nl: ["lymfeklier sjabloon selecteren", "lymfeklier sjabloon"],
      ko: ["림프절 템플릿 선택", "림프절 템플릿"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },
  {
    id: 'CYTOLOGY_SELECT_TEMPLATE_URINE', label: 'Select Urine Template', category: 'CYTOLOGY',
    shortcut: 'Ctrl+Alt+Shift+Y', internalKey: 'F26+PS011',
    voiceTriggers: ['select urine template', 'urine template'],
    voiceTriggersByLanguage: {
      fr: ["sélectionner le modèle urinaire", "modèle urinaire"],
      de: ["urin-vorlage auswählen", "urin-vorlage"],
      nl: ["urinesjabloon selecteren", "urinesjabloon"],
      ko: ["소변 템플릿 선택", "소변 템플릿"],
    },
    learnedTriggers: [], requiredRole: 'All Staff', isActive: true,
  },

// ─────────────────────────────────────────────────────────────────────────────
];

// Action registry persistence
// Admins edit shortcuts + voice triggers in the UI — these must survive deploys.
// Pattern: seed from SEED_ACTIONS, load from localStorage, write back on updateAction.
// New actions added to SEED_ACTIONS are merged in on load (migration guard).
// ─────────────────────────────────────────────────────────────────────────────

const ACTIONS_STORAGE_KEY = 'ps_action_registry';

// Real, critical fix, per direct follow-up ("the actions list is out
// of sync... it has to be flawless"): loadActions() below only ever
// ADDS genuinely new-by-id seed actions on top of whatever's already
// in localStorage — it never re-applies an existing id's own updated
// fields. That meant every real fix this whole pass made (49 actions
// recategorized off the orphaned REPORTING context, 45 internalKey
// collisions resolved, 10 voice-trigger overlaps de-duplicated, the
// two confirmed stale ActionId references, the new AUDIT context
// actions, RETURN_TO_TRAINEE/RECALL_REPORT) would have been silently
// invisible to any real browser that already had prior
// ps_action_registry data stored — which, for anyone who's been
// actively using this app, is the common case, not an edge one. Same
// real version-bump pattern services/users/mockUserService.ts's own
// USERS_VERSION already uses for this identical problem — increment
// ACTIONS_VERSION whenever SEED_ACTIONS changes meaningfully.
const ACTIONS_VERSION = '2'; // bumped: the whole "flawless" action-registry pass
const ACTIONS_VERSION_KEY = 'pathscribe_actions_version';
try {
  if (localStorage.getItem(ACTIONS_VERSION_KEY) !== ACTIONS_VERSION) {
    localStorage.removeItem(ACTIONS_STORAGE_KEY);
    localStorage.setItem(ACTIONS_VERSION_KEY, ACTIONS_VERSION);
  }
} catch {
  // localStorage unavailable (e.g. test environment) — degrade
  // gracefully, matching loadActions()'s own established pattern
  // just below; loadActions() falls back to SEED_ACTIONS directly
  // in that case anyway, so there's nothing stale to clear.
}

function loadActions(): SystemAction[] {
  try {
    const raw = localStorage.getItem(ACTIONS_STORAGE_KEY);
    if (!raw) return SEED_ACTIONS.map(a => ({ ...a }));
    const stored: SystemAction[] = JSON.parse(raw);
    const storedIds = new Set(stored.map(a => a.id));
    // Migration: add any new seed actions not yet in storage
    const newActions = SEED_ACTIONS.filter(a => !storedIds.has(a.id));
    return [...stored, ...newActions];
  } catch {
    return SEED_ACTIONS.map(a => ({ ...a }));
  }
}

function persistActions(actions: SystemAction[]) {
  try {
    localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(actions));
  } catch {
    // localStorage unavailable — degrade gracefully
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text helpers
// ─────────────────────────────────────────────────────────────────────────────

export function norm(s: string | undefined | null): string {
  if (!s) return '';
  // Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL Multi-
  // Language UI & Localization Framework gap — confirmed directly:
  // the previous ASCII-only regex ([^a-z0-9 ]) didn't just fail to
  // match non-English voice triggers, it actively destroyed non-
  // Latin-script transcripts entirely (any real Korean phrase
  // normalized to an empty string, since Hangul characters aren't in
  // the a-z/0-9 range at all) and mangled accented Latin text (French
  // "café" → "caf", German "größe" → "gre"). \p{L} (Unicode "Letter"
  // property, real ES2018+ support) keeps any real letter from any
  // real script; \p{N} keeps any real digit. NFKC normalization first
  // so a composed vs. decomposed accent (é vs. e + combining accent)
  // doesn't produce two different real match keys for the same real
  // spoken word.
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
}

function phraseMatch(transcript: string | undefined | null, trigger: string | undefined | null): boolean {
  if (!transcript || !trigger) return false;
  const t  = norm(transcript);
  const tr = norm(trigger);
  if (t === tr) return true;
  const escaped = tr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(t);
}

function fuzzyScore(transcript: string, trigger: string): number {
  const tWords  = new Set(norm(transcript).split(' ').filter(Boolean));
  const trWords = norm(trigger).split(' ').filter(Boolean);
  if (!trWords.length) return 0;
  const overlap = trWords.filter(w => tWords.has(w)).length;
  const score   = overlap / trWords.length;
  return score >= 0.6 ? score : 0;
}

function dispatchInternalKey(internalKey: string) {
  const fnKey = internalKey.split('+')[0];
  const cfg: KeyboardEventInit = {
    key: fnKey, code: fnKey,
    ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    bubbles: true, cancelable: true, composed: true,
  };
  [window, document, document.body].forEach(
    t => t.dispatchEvent(new KeyboardEvent('keydown', cfg))
  );
}


let currentAppContext: string = VOICE_CONTEXT.WORKLIST;
// Real, per PS-289's own comment thread — separate from
// currentAppContext above: hardware-driven (which station a
// technician has selected), not page/route-driven. Undefined means
// no station selected, same real "No station" state
// NavBarScanStation.tsx's own indicator already shows.
let currentStationProfile: string | undefined = undefined;
// Real, per PS-289's own comment thread — see
// IActionRegistryService.ts's own doc comment for the full reasoning.
let currentActionGroupActionIds: Set<string> = new Set();

// ─── Live registry — loaded from storage, mutated by updateAction ─────────────
const LIVE_ACTIONS: SystemAction[] = loadActions();

// ─────────────────────────────────────────────────────────────────────────────
// Learning layer — persisted to localStorage so mappings survive page refresh
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ps_learned_triggers';

// Local types — shapes match IActionRegistryService exactly
interface LocalLearnedMapping {
  transcript:         string;   // normalised transcript (acts as unique key)
  actionId:           string;
  confirmedAt:        number;
  confirmationMethod: 'shortcut' | 'repeat' | 'manual';
  useCount:           number;
}

interface LocalPendingMiss {
  id:         string;
  transcript: string;
  timestamp:  number;
}

// ── Candidate scoring — top 3 fuzzy matches for VoiceMissPrompt ──────────
function computeCandidates(transcript: string, actions: SystemAction[]): SystemAction[] {
  const scored: { action: SystemAction; score: number }[] = [];
  for (const action of actions) {
    if (!action.isActive) continue;
    let best = 0;
    for (const t of [...action.voiceTriggers, ...(action.learnedTriggers ?? [])]) {
      const s = fuzzyScore(transcript, t);
      if (s > best) best = s;
    }
    if (best > 0) scored.push({ action, score: best });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.action);
}

// ── localStorage helpers ──────────────────────────────────────────────────
function loadMappings(): LocalLearnedMapping[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalLearnedMapping[]) : [];
  } catch {
    return [];
  }
}

function saveMappings(mappings: LocalLearnedMapping[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch {
    // localStorage unavailable — degrade gracefully, in-memory still works
  }
}

// Sync learnedTriggers from storage into LIVE_ACTIONS so findActionByTrigger
// picks them up immediately on first load (e.g. after a page refresh).
function syncLearnedTriggersToActions(mappings: LocalLearnedMapping[]) {
  for (const action of LIVE_ACTIONS) {
    action.learnedTriggers = mappings
      .filter(m => m.actionId === action.id)
      .map(m => m.transcript);
  }
}

const learnedMappings: LocalLearnedMapping[] = loadMappings().filter(m => !!m.transcript && !!m.actionId);
syncLearnedTriggersToActions(learnedMappings);

// ── Pending miss window ───────────────────────────────────────────────────
const pendingMisses: LocalPendingMiss[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────
export const mockActionRegistryService: IActionRegistryService = {

  getActions: () => LIVE_ACTIONS,

  getActionById: (id: string) => LIVE_ACTIONS.find(a => a.id === id),

  updateAction: async (id: string, updates: Partial<SystemAction>) => {
    const index = LIVE_ACTIONS.findIndex(a => a.id === id);
    if (index !== -1) {
      LIVE_ACTIONS[index] = { ...LIVE_ACTIONS[index], ...updates };
      persistActions(LIVE_ACTIONS);
    }
  },

  setCurrentContext: (c: string) => {
    currentAppContext = c;
  },
  // Real, per PS-289's own comment thread.
  setCurrentStationProfile: (functionalArea: string | undefined) => {
    currentStationProfile = functionalArea;
  },
  // Real, per PS-289's own comment thread — see
  // IActionRegistryService.ts's own doc comment for the full reasoning.
  setCurrentActionGroupActionIds: (actionIds: string[] | undefined) => {
    currentActionGroupActionIds = new Set(actionIds ?? []);
  },
  // Real feature, per direct follow-up: "are we not mapping keyboard
  // commands in the Action Registry?" — the real, missing piece was a
  // live keydown listener that actually executes an action when its
  // shortcut is pressed (VoiceProvider.tsx now has one). Shares the
  // exact same isActive + GLOBAL_CATEGORIES-or-current-context
  // eligibility rule findActionByTrigger already used for voice, so
  // keyboard and voice matching can never silently drift apart.
  // Real, per PS-289's own comment thread — extended with a THIRD,
  // independent "OR" branch: an action whose own stationProfiles
  // includes the current, real station's functionalArea is eligible
  // too, on top of (never instead of) the existing app-context rule.
  // Real, per PS-289's own comment thread — extended again with a
  // FOURTH, independent "OR" branch: an action whose own id is a
  // member of the current station's resolved action group bundle is
  // eligible too. See setCurrentActionGroupActionIds's own doc
  // comment for why this is genuinely separate from stationProfiles
  // matching, not a duplicate of it.
  getEligibleActions: (): SystemAction[] =>
    LIVE_ACTIONS.filter(a => a.isActive && (
      GLOBAL_CATEGORIES.has(a.category)
      || a.category === currentAppContext
      || (!!currentStationProfile && !!a.stationProfiles?.includes(currentStationProfile))
      || currentActionGroupActionIds.has(a.id)
    )),
onAction: (callback: (actionId: string) => void) => {
    const handler = (e: any) => {
      if (e.detail?.id) callback(e.detail.id);
    };
    window.addEventListener('VOICE_ACTION_TRIGGERED', handler);
    return () => window.removeEventListener('VOICE_ACTION_TRIGGERED', handler);
  },
  findActionByTrigger: (transcript: string, language: VoiceProfileLanguage = 'en'): SystemAction | undefined => {
    const eligible = LIVE_ACTIONS.filter(
      a => a.isActive && (
        GLOBAL_CATEGORIES.has(a.category) ||
        a.category === currentAppContext
      )
    );

    // Real, per src/MULTILANG_VOICE_COMMANDS_PLAN.md's own scoped
    // pieces 1-2 fix: the real, language-specific trigger set for
    // this action (when the current profile isn't English and one
    // actually exists), checked BEFORE the real, always-present
    // English set — checking English first would make a real,
    // non-English trigger set pointless, since an English phrase
    // would always win. Every one of this registry's 191 real,
    // existing entries has no voiceTriggersByLanguage yet, so this
    // resolves to exactly the original, English-only behavior until
    // real translated content (Phase 3 of that plan) is added.
    const realTriggersFor = (a: SystemAction): string[] =>
      language !== 'en' && a.voiceTriggersByLanguage?.[language]?.length
        ? [...a.voiceTriggersByLanguage[language]!, ...a.voiceTriggers]
        : a.voiceTriggers;

    // 1. Exact phrase — canonical
    for (const a of eligible) {
      if (realTriggersFor(a).some(t => phraseMatch(transcript, t))) return a;
    }
    // 2. Exact phrase — learned
    for (const a of eligible) {
      if ((a.learnedTriggers ?? []).some(t => phraseMatch(transcript, t))) return a;
    }
    // 3. Fuzzy fallback
    let best: { action: SystemAction; score: number } | null = null;
    for (const a of eligible) {
      for (const t of [...realTriggersFor(a), ...(a.learnedTriggers ?? [])].filter(Boolean)) {
        const score = fuzzyScore(transcript, t);
        if (score > 0 && (!best || score > best.score)) best = { action: a, score };
      }
    }
    return best?.action ?? undefined;
  },

  executeAction: (action: SystemAction, transcript?: string) => {
    console.log('[VoiceRegistry] Executing:', action.id, '->', action.internalKey);
    window.dispatchEvent(new CustomEvent('VOICE_ACTION_TRIGGERED', { detail: action }));
    const notify = () =>
      window.dispatchEvent(new CustomEvent('VOICE_ACTION_TRIGGERED', { detail: action }));

    // Special case: TABLE_SORT_BY_COLUMN — pass transcript so WorklistPage can extract column name
    if (action.id === 'TABLE_SORT_BY_COLUMN' && transcript) {
      window.dispatchEvent(new CustomEvent('PATHSCRIBE_TABLE_SORT_BY_COLUMN', { detail: { transcript } }));
      notify();
      return;
    }

    // Special case: TABLE_FILTER_PHYSICIAN — pass transcript as detail so WorklistPage can extract the name
    if (action.id === 'TABLE_FILTER_PHYSICIAN' && transcript) {
      window.dispatchEvent(new CustomEvent('PATHSCRIBE_TABLE_FILTER_PHYSICIAN', { detail: { transcript } }));
      notify();
      return;
    }

    // Special case: SELECT_SPECIMEN — extract the number from the transcript
    if (action.id === 'SELECT_SPECIMEN' && transcript) {
      const match = norm(transcript).match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
      const wordToNum: Record<string, number> = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
      const n = match ? (wordToNum[match[1]] ?? parseInt(match[1], 10)) : 1;
      window.dispatchEvent(new CustomEvent('PATHSCRIBE_SELECT_SPECIMEN', { detail: { index: n - 1 } }));
      notify();
      return;
    }

    if (CUSTOM_EVENT_ACTIONS.has(action.id)) {
      window.dispatchEvent(new CustomEvent(`PATHSCRIBE_${action.id}`, { detail: action }));
      notify();
      return;
    }

    dispatchInternalKey(action.internalKey);
    notify();
  },

  onActionExecuted: (cb) => {
    const h = (e: any) => cb(e.detail);
    window.addEventListener('VOICE_ACTION_TRIGGERED', h);
    return () => window.removeEventListener('VOICE_ACTION_TRIGGERED', h);
  },

  onActionFailed: (cb) => {
    const h = (e: any) => cb(e.detail);
    window.addEventListener('VOICE_COMMAND_NOT_FOUND', h);
    return () => window.removeEventListener('VOICE_COMMAND_NOT_FOUND', h);
  },

  // ── Miss recording ────────────────────────────────────────────────────────
  recordMiss: (transcript: string): LocalPendingMiss => {
    const miss: LocalPendingMiss = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      transcript,
      timestamp: Date.now(),
    };
    pendingMisses.push(miss);
    // Compute candidates now so onMissRecorded subscribers receive them
    const candidates = computeCandidates(transcript, LIVE_ACTIONS);
    window.dispatchEvent(new CustomEvent('VOICE_COMMAND_NOT_FOUND', { detail: transcript }));
    window.dispatchEvent(new CustomEvent('VOICE_MISS_RECORDED', { detail: { miss, candidates } }));
    return miss;
  },

  dismissMiss: (missId: string) => {
    const idx = pendingMisses.findIndex(m => m.id === missId);
    if (idx !== -1) pendingMisses.splice(idx, 1);
  },

  getPendingMisses: () => [...pendingMisses],

  // ── Learning ──────────────────────────────────────────────────────────────
  // Called when the user confirms what they meant — via keyboard shortcut,
  // repeat utterance, or the VoiceMissPrompt UI tap.
  // Stores the transcript as a learned trigger so it fires next time.
  confirmMiss: (missId: string, actionId: string, method: 'shortcut' | 'repeat' | 'manual'): LocalLearnedMapping => {
    // Find and remove from pending window
    const missIdx = pendingMisses.findIndex(m => m.id === missId);
    if (missIdx === -1) {
      // Miss already expired — still record the learning
      const mapping = learnedMappings.find(m => m.actionId === actionId);
      return mapping ?? { transcript: '', actionId, confirmedAt: Date.now(), confirmationMethod: method, useCount: 1 };
    }
    const miss = pendingMisses[missIdx];
    pendingMisses.splice(missIdx, 1);

    const trigger = norm(miss.transcript);
    if (!trigger) {
      return { transcript: trigger, actionId, confirmedAt: Date.now(), confirmationMethod: method, useCount: 1 };
    }

    // If already learned, just increment useCount
    const existing = learnedMappings.find(
      m => m.actionId === actionId && m.transcript === trigger
    );
    if (existing) {
      existing.useCount++;
      saveMappings(learnedMappings);
      return existing;
    }

    // Persist new mapping
    const mapping: LocalLearnedMapping = {
      transcript: trigger,
      actionId,
      confirmedAt: Date.now(),
      confirmationMethod: method,
      useCount: 1,
    };
    learnedMappings.push(mapping);
    saveMappings(learnedMappings);

    // Sync onto the live action so it works immediately (no reload needed)
    const action = LIVE_ACTIONS.find(a => a.id === actionId);
    if (action) {
      action.learnedTriggers = [...(action.learnedTriggers ?? []), trigger];
    }

    console.log(`[VoiceRegistry] Learned: "${trigger}" -> ${actionId} (via ${method})`);
    window.dispatchEvent(new CustomEvent('VOICE_MAPPING_LEARNED', { detail: { mapping, action } }));

    // Execute the action so the user's original intent is carried out
    if (action) mockActionRegistryService.executeAction(action, miss.transcript);

    return mapping;
  },

  getLearnedMappings: () => [...learnedMappings],

  // removeLearnedMapping takes transcript (the unique key) per interface
  removeLearnedMapping: (transcript: string) => {
    const t = norm(transcript);
    const idx = learnedMappings.findIndex(m => m.transcript === t);
    if (idx === -1) return;
    const { actionId } = learnedMappings[idx];
    learnedMappings.splice(idx, 1);
    saveMappings(learnedMappings);

    // Remove from the live action's learnedTriggers
    const action = LIVE_ACTIONS.find(a => a.id === actionId);
    if (action) {
      action.learnedTriggers = (action.learnedTriggers ?? []).filter(tr => tr !== t);
    }
    console.log(`[VoiceRegistry] Removed learned mapping: "${t}" -> ${actionId}`);
  },

  // onMissRecorded — passes both miss and candidates to the callback
  onMissRecorded: (cb) => {
    const h = (e: any) => cb(e.detail.miss, e.detail.candidates);
    window.addEventListener('VOICE_MISS_RECORDED', h);
    return () => window.removeEventListener('VOICE_MISS_RECORDED', h);
  },
};
