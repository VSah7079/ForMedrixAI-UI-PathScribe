// ─────────────────────────────────────────────────────────────────────────────
// IActionRegistryService.ts
// ─────────────────────────────────────────────────────────────────────────────

import type { VoiceProfileLanguage } from '@/constants/voiceProfiles';

/**
 * Unique identifier for system actions. 
 * Matches IDs defined in MOCK_ACTIONS (e.g., 'DELEGATE_FULL_TRANSFER')
 */
export type SystemActionId = string;

export interface SystemAction {
  id: SystemActionId;
  label: string;
  category: string;
  shortcut: string;         // user-facing display string e.g. "Alt+W"
  internalKey: string;      // stable dispatch token e.g. "F13+PS002"
  voiceTriggers: string[];
  /** Real, per src/MULTILANG_VOICE_COMMANDS_PLAN.md's own scoped
   *  pieces 1–2: real, native-language trigger phrases for a
   *  non-English voice profile — additive, never replacing
   *  `voiceTriggers` above (which stays the real, implicit English
   *  set, completely unchanged). Deliberately optional and initially
   *  absent on every one of this registry's 191 real, existing
   *  entries — filling this in per action is real, separate content
   *  work (Phase 3 of that plan), not attempted as part of the
   *  data-model/matching-logic fix itself. `findActionByTrigger()`
   *  checks this real, language-specific set first when the current
   *  voice profile's own language isn't English, then falls back to
   *  the English `voiceTriggers` set — a deliberate, real design
   *  choice (not an oversight) since a bilingual user may naturally
   *  mix in an English technical term even on a non-English profile. */
  voiceTriggersByLanguage?: Partial<Record<Exclude<VoiceProfileLanguage, 'en'>, string[]>>;
  learnedTriggers: string[];
  requiredRole: string;
  isActive: boolean;
  /** Real, per PS-289's own comment thread ("Workstation Profiles &
   *  Station-Specific Default Actions") — real functionalArea values
   *  (services/workstationGroups/IWorkstationGroupService.ts's own
   *  FUNCTIONAL_AREAS_BY_DISCIPLINE, flattened across every real
   *  discipline — no current overlap between disciplines' own real
   *  area names, so a bare string list stays unambiguous), reusing
   *  that same real set rather than a separate tag vocabulary.
   *  Undefined means this action isn't scoped to any particular
   *  station profile at all — see getEligibleActions()'s own real
   *  eligibility rule for how this combines with GLOBAL_CATEGORIES
   *  and the current app context. */
  stationProfiles?: string[];
}

export interface PendingMiss {
  id: string;
  transcript: string;
  timestamp: number;
}

export interface LearnedMapping {
  transcript: string;
  actionId: SystemActionId;
  confirmedAt: number;
  confirmationMethod: 'shortcut' | 'repeat' | 'manual';
  useCount: number;
}

export interface IActionRegistryService {
  // ─── Core Action Management ──────────────────────────────────────────────
  getActions(): SystemAction[];
  getActionById(id: SystemActionId): SystemAction | undefined;
  findActionByTrigger(transcript: string, language?: VoiceProfileLanguage): SystemAction | undefined;
  updateAction(id: SystemActionId, updates: Partial<SystemAction>): Promise<void>;
  setCurrentContext(context: string): void;
  /** Real, per PS-289's own comment thread — set the moment a
   *  technician selects a station whose WorkstationGroup resolves to
   *  a real functionalArea (services/workstationGroups/). Undefined
   *  clears it — e.g. the station indicator returns to "No station."
   *  Deliberately separate from setCurrentContext above: app context
   *  is page/route-driven, station profile is hardware-driven, and a
   *  real action can be eligible via either signal independently. */
  setCurrentStationProfile(functionalArea: string | undefined): void;
  /** Real, per PS-289's own comment thread's "loading a specific
   *  action group" piece — the real action ids from a
   *  WorkstationGroup's own resolved defaultActionGroupId +
   *  allowedActionGroupIds (services/workstationGroups/), flattened.
   *  Set the moment a technician selects a station whose group
   *  resolves to one or more real ActionGroups; undefined/empty
   *  clears it. Deliberately separate from stationProfiles/
   *  functionalArea matching above — a curated, named bundle can cut
   *  across categories/functional areas on purpose, and a real
   *  action can be eligible via either signal independently, same
   *  "OR, never AND" posture as every other eligibility branch here. */
  setCurrentActionGroupActionIds(actionIds: string[] | undefined): void;
  executeAction(action: SystemAction, transcript?: string): void;
  /** Real feature: the same isActive + GLOBAL_CATEGORIES-or-current-
   *  context eligibility rule findActionByTrigger uses for voice —
   *  exposed so keyboard shortcut matching uses the identical rule,
   *  rather than a second, independently-maintained copy of it.
   *  Real, per PS-289's own comment thread — now ALSO eligible when
   *  the action's own stationProfiles includes the current station's
   *  real functionalArea (set via setCurrentStationProfile above),
   *  matching this same real "OR" posture, not a stricter AND. */
  getEligibleActions(): SystemAction[];

  // ─── Event Subscriptions ─────────────────────────────────────────────────
  /**
   * Listens for raw action triggers by ID. 
   * Primary hook for UI components like DelegateModal.
   * @returns Unsubscribe function
   */
  onAction(callback: (actionId: SystemActionId) => void): () => void;

  /**
   * Listens for full action execution metadata.
   */
  onActionExecuted(callback: (action: SystemAction) => void): () => void;
  
  onActionFailed(callback: (transcript: string) => void): () => void;

  // ─── Machine Learning / Voice Misses ─────────────────────────────────────
  recordMiss(transcript: string): PendingMiss;
  confirmMiss(missId: string, actionId: SystemActionId, method: LearnedMapping['confirmationMethod']): LearnedMapping;
  dismissMiss(missId: string): void;
  getPendingMisses(): PendingMiss[];
  getLearnedMappings(): LearnedMapping[];
  removeLearnedMapping(transcript: string): void;
  
  onMissRecorded(callback: (miss: PendingMiss, candidates: SystemAction[]) => void): () => void;
}