// ─────────────────────────────────────────────────────────────────────────────
// IActionRegistryService.ts
// ─────────────────────────────────────────────────────────────────────────────

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
  learnedTriggers: string[];
  requiredRole: string;
  isActive: boolean;
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
  findActionByTrigger(transcript: string): SystemAction | undefined;
  updateAction(id: SystemActionId, updates: Partial<SystemAction>): Promise<void>;
  setCurrentContext(context: string): void;
  executeAction(action: SystemAction, transcript?: string): void;
  /** Real feature: the same isActive + GLOBAL_CATEGORIES-or-current-
   *  context eligibility rule findActionByTrigger uses for voice —
   *  exposed so keyboard shortcut matching uses the identical rule,
   *  rather than a second, independently-maintained copy of it. */
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