// ─────────────────────────────────────────────────────────────────────────────
// systemActions.ts
// Single source of truth for ALL system actions in PathScribe AI.
//
// INTERNAL KEY DESIGN
// ───────────────────
// Each action has a stable internalKey (F13–F24 + PSxxx) that the keyboard
// handler dispatches. This key NEVER changes and is never a real browser
// shortcut. The user-facing shortcut string is separate and user-assignable.
//
// CONTEXT DESIGN
// ──────────────
// Actions belong to a context tier:
//   SYSTEM    — always available app-wide (open messages, go back/forward)
//   NAVIGATION — always available (open worklist, open config etc.)
//   WORKLIST  — only when worklist view is active
//   CASE_VIEW — only when a case is open
//   REPORTING — only when the reporting editor is active
//   MESSAGES  — only when the messages drawer is open
//   SEARCH    — only when the search page is active
//   CONFIGURATION — only when the config page is active
//
// Components call mockActionRegistryService.setCurrentContext('WORKLIST')
// on mount so only the right commands are eligible at any time.
//
// ADDING NEW ACTIONS
// ──────────────────
// Append to the relevant group. Pick the next PSxxx number in that Fnn block.
// Never reuse or reassign an internalKey even if an action is removed.
// ─────────────────────────────────────────────────────────────────────────────

export type ActionId =
  // ── System (always available) ────────────────────────────────────────────
  | 'system.openMessages' | 'system.openWorklist'
  | 'system.openConfiguration' | 'system.openSearch'
  | 'system.openAudit' | 'system.openContribution'
  | 'system.goBack' | 'system.goForward'
  | 'system.saveDraft' | 'system.signOut'
  // ── Global navigation (always available) ─────────────────────────────────
  | 'nav.nextCase' | 'nav.previousCase'
  | 'nav.nextTab' | 'nav.previousTab'
  // ── Table / list navigation (context-specific) ───────────────────────────
  | 'table.next' | 'table.previous'
  | 'table.pageDown' | 'table.pageUp'
  | 'table.first' | 'table.last'
  | 'table.select' | 'table.selectAll' | 'table.deselectAll'
  | 'table.openSelected'
  | 'table.refresh'
  | 'table.sortByDate' | 'table.sortByPriority' | 'table.sortByStatus'
  | 'table.filterUrgent' | 'table.clearFilter'
  | 'table.search' | 'table.clearSearch' | 'table.refineSearch'
  // ── Reporting editor ─────────────────────────────────────────────────────
  | 'editor.nextField' | 'editor.previousField'
  | 'editor.nextSection' | 'editor.previousSection'
  | 'editor.insertMacro' | 'editor.insertTable' | 'editor.insertSignature'
  | 'editor.bold' | 'editor.italic' | 'editor.underline'
  | 'editor.bullets' | 'editor.numbering'
  | 'editor.increaseIndent' | 'editor.decreaseIndent'
  | 'editor.find' | 'editor.replace' | 'editor.selectAll'
  | 'editor.showRuler' | 'editor.toggleFormatting'
  // ── Diagnosis & dictation ─────────────────────────────────────────────────
  | 'diagnosis.grossDescription' | 'diagnosis.microscopicDescription'
  | 'diagnosis.enterDiagnosis' | 'diagnosis.enterAddendum'
  | 'diagnosis.signOut' | 'diagnosis.coSign'
  | 'diagnosis.amend' | 'diagnosis.revokeSignOut'
  | 'diagnosis.saveRevision' | 'diagnosis.recordCriticalNotification' | 'diagnosis.recordDiscordance'
  // ── Messages ──────────────────────────────────────────────────────────────
  | 'messages.next' | 'messages.previous'
  | 'messages.reply' | 'messages.delete'
  | 'messages.markRead' | 'messages.markUnread' | 'messages.markUrgent'
  | 'messages.compose' | 'messages.send' | 'messages.close'
  | 'messages.secureEmail' | 'messages.recipientSearch' | 'messages.recipientAdd'
  | 'messages.search' | 'messages.edit' | 'messages.restore'
  | 'messages.viewDeleted' | 'messages.deleteAll'
  | 'messages.gotoSubject' | 'messages.gotoBody'
  | 'messages.clearSubject' | 'messages.clearBody'
  // ── Case management ───────────────────────────────────────────────────────
  | 'case.viewWorklist' | 'case.open' | 'case.create' | 'case.editDemographics'
  | 'case.assign' | 'case.reassign' | 'case.prioritize' | 'case.hold'
  | 'case.releaseHold' | 'case.archive' | 'case.delete' | 'case.viewPediatric' | 'case.postComment'
  // ── Accession (only when the Accession page is active) ─────────────────────
  | 'accession.importOrder' | 'accession.caseComment'
  | 'accession.clinicalHistoryCategory1' | 'accession.clinicalHistoryCategory2' | 'accession.clinicalHistoryCategory3'
  | 'accession.clinicalHistoryCategory4' | 'accession.clinicalHistoryCategory5' | 'accession.clinicalHistoryCategory6'
  // ── Grossing (reachable from the same Synoptic Report page/context as
  // regular reporting work — grossing isn't a separate page, so these
  // share the SYNOPTIC category rather than needing their own
  // context-switch) ───────────────────────────────────────────────────────
  | 'grossing.nextBlock' | 'grossing.previousBlock' | 'grossing.markGrossed' | 'grossing.confirmTriage' | 'grossing.complete'
  | 'grossing.completeConfirm' | 'grossing.completeCancel'
  // ── Specimen ──────────────────────────────────────────────────────────────
  | 'specimen.add' | 'specimen.edit' | 'specimen.remove' | 'specimen.saveEdit' | 'specimen.saveBiopsyArray'
  | 'specimen.applyFlag' | 'specimen.removeFlag' | 'specimen.assignSubspecialty'
  // ── Reports ───────────────────────────────────────────────────────────────
  | 'report.preview' | 'report.generate' | 'report.deliver'
  | 'report.redeliver' | 'report.viewHistory' | 'report.download'
  // ── AI Assistance ─────────────────────────────────────────────────────────
  | 'ai.diagnosisSuggest' | 'ai.grossAssist' | 'ai.macroSuggest'
  | 'ai.viewConfidence' | 'ai.override'
  | 'ai.reviewTriage' | 'ai.codeSuggest' | 'ai.narrativeGenerate'
  // ── Delegation ────────────────────────────────────────────────────────────
  | 'delegation.open' | 'delegation.reassign' | 'delegation.pool'
  | 'delegation.secondOpinion' | 'delegation.casualReview'
  | 'delegation.tumorBoard' | 'delegation.teaching'
  | 'delegation.externalConsult' | 'delegation.assignSynoptic'
  | 'delegation.countersign'
  // ── Pool ──────────────────────────────────────────────────────────────────
  | 'pool.viewCases' | 'pool.acceptCase' | 'pool.passCase'
  // ── Synoptic ──────────────────────────────────────────────────────────────
  | 'synoptic.jumpNextUnanswered' | 'synoptic.jumpNextRequired'
  | 'synoptic.markDeferred' | 'synoptic.confirmField' | 'synoptic.overrideField'
  // ── Facility & Physician ────────────────────────────────────────────────────
  | 'facility.view' | 'facility.edit'
  | 'physician.view' | 'physician.edit' | 'physician.verify'
  // ── Configuration ─────────────────────────────────────────────────────────
  | 'config.access' | 'config.staff' | 'config.roles' | 'config.subspecialties'
  | 'config.specimens' | 'config.flags' | 'config.ai' | 'config.macros'
  | 'config.shortcuts' | 'config.lis' | 'config.auditLog'
  | 'config.reportTemplates' | 'config.routingRules' | 'config.validationStudies'
  // ── QC ────────────────────────────────────────────────────────────────────
  | 'qc.configure' | 'qc.viewQueue' | 'qc.claimReview'
  | 'qc.submitReview' | 'qc.escalateDiscordance' | 'qc.viewDashboard' | 'qc.exportReport'
  // ── Billing (prebuilt) ────────────────────────────────────────────────────
  | 'billing.viewCodes' | 'billing.editCodes' | 'billing.submitClaim'
  | 'billing.viewHistory' | 'billing.exportBatch'
  | 'billing.confirmPostSignoutChange' | 'billing.correctAppliedCode'
  // ── Admin ─────────────────────────────────────────────────────────────────
  | 'admin.dashboard' | 'admin.reports' | 'admin.export'
  | 'admin.backups' | 'admin.eventLog' | 'admin.impersonate'
  | 'admin.validationStudies'
  // ── AI narrative / orchestration ──────────────────────────────────────────
  | 'ai.changeReportTemplate' | 'ai.acceptNarrativeSection' | 'ai.regenerateSection'
  // ── Report template ───────────────────────────────────────────────────────
  | 'report.selectTemplate' | 'report.overrideTemplate'
  // ── Specimen LIS ──────────────────────────────────────────────────────────
  | 'specimen.syncLIS' | 'specimen.editLISStatus';

export interface SystemAction {
  id: ActionId;
  label: string;
  description?: string;
  /**
   * Stable internal dispatch key — never a real browser shortcut.
   * Format: F{13-24}+PS{001-999}. Fixed at build time, never reassigned.
   * The keyboard handler listens for this, not the user-facing shortcut.
   */
  internalKey: string;
  shortcutable?: boolean;
  prebuilt?: boolean;
}

export interface ActionGroup {
  id: string;
  title: string;
  actions: SystemAction[];
}

export const ACTION_GROUPS: ActionGroup[] = [

  // ── F13: System — always available ───────────────────────────────────────
  {
    id: 'system',
    title: 'System',
    actions: [
      { id: 'system.openMessages',       label: 'Open Messages',           internalKey: 'F13+PS001', shortcutable: true },
      { id: 'system.openWorklist',       label: 'Open Worklist',           internalKey: 'F13+PS002', shortcutable: true },
      { id: 'system.goBack',             label: 'Go Back',                 internalKey: 'F13+PS003', shortcutable: true },
      { id: 'system.goForward',          label: 'Go Forward',              internalKey: 'F13+PS004', shortcutable: true },
      { id: 'system.saveDraft',          label: 'Save Draft',              internalKey: 'F13+PS005', shortcutable: true },
      { id: 'system.signOut',            label: 'Sign Out Case',           internalKey: 'F13+PS006', shortcutable: true },
      { id: 'system.openConfiguration', label: 'Open Configuration',      internalKey: 'F13+PS007', shortcutable: true },
      { id: 'system.openSearch',         label: 'Open Search',             internalKey: 'F13+PS008', shortcutable: true },
      { id: 'system.openAudit',          label: 'System Audit',            internalKey: 'F13+PS009', shortcutable: true },
      { id: 'system.openContribution',   label: 'My Contribution',         internalKey: 'F13+PS010', shortcutable: true },
    ],
  },

  // ── F14: Global navigation — always available ─────────────────────────────
  {
    id: 'nav',
    title: 'Navigation',
    actions: [
      { id: 'nav.nextCase',      label: 'Next Case',      internalKey: 'F14+PS001', shortcutable: true },
      { id: 'nav.previousCase',  label: 'Previous Case',  internalKey: 'F14+PS002', shortcutable: true },
      { id: 'nav.nextTab',       label: 'Next Tab',       internalKey: 'F14+PS003', shortcutable: true },
      { id: 'nav.previousTab',   label: 'Previous Tab',   internalKey: 'F14+PS004', shortcutable: true },
    ],
  },

  // ── F15: Table / list navigation — context-specific ──────────────────────
  {
    id: 'table',
    title: 'Table & List Navigation',
    actions: [
      { id: 'table.next',          label: 'Next Row',            internalKey: 'F15+PS001', shortcutable: true },
      { id: 'table.previous',      label: 'Previous Row',        internalKey: 'F15+PS002', shortcutable: true },
      { id: 'table.pageDown',      label: 'Page Down',           internalKey: 'F15+PS003', shortcutable: true },
      { id: 'table.pageUp',        label: 'Page Up',             internalKey: 'F15+PS004', shortcutable: true },
      { id: 'table.first',         label: 'First Row',           internalKey: 'F15+PS005', shortcutable: true },
      { id: 'table.last',          label: 'Last Row',            internalKey: 'F15+PS006', shortcutable: true },
      { id: 'table.select',        label: 'Select Row',          internalKey: 'F15+PS007', shortcutable: true },
      { id: 'table.selectAll',     label: 'Select All',          internalKey: 'F15+PS008', shortcutable: true },
      { id: 'table.deselectAll',   label: 'Deselect All',        internalKey: 'F15+PS009', shortcutable: true },
      { id: 'table.openSelected',  label: 'Open Selected',       internalKey: 'F15+PS010', shortcutable: true },
      { id: 'table.refresh',       label: 'Refresh',             internalKey: 'F15+PS011', shortcutable: true },
      { id: 'table.sortByDate',    label: 'Sort by Date',        internalKey: 'F15+PS012' },
      { id: 'table.sortByPriority',label: 'Sort by Priority',    internalKey: 'F15+PS013' },
      { id: 'table.sortByStatus',  label: 'Sort by Status',      internalKey: 'F15+PS014' },
      { id: 'table.filterUrgent',  label: 'Filter Urgent',       internalKey: 'F15+PS015' },
      { id: 'table.clearFilter',   label: 'Clear Filter',        internalKey: 'F15+PS016' },
      { id: 'table.search',        label: 'Search',              internalKey: 'F15+PS017', shortcutable: true },
      { id: 'table.clearSearch',   label: 'Clear Search',        internalKey: 'F15+PS018' },
      { id: 'table.refineSearch',  label: 'Refine Search',       internalKey: 'F15+PS019' },
    ],
  },

  // ── F16: Reporting editor ─────────────────────────────────────────────────
  {
    id: 'editor',
    title: 'Reporting Editor',
    actions: [
      { id: 'editor.nextField',        label: 'Next Field',                   internalKey: 'F16+PS001', shortcutable: true },
      { id: 'editor.previousField',    label: 'Previous Field',               internalKey: 'F16+PS002', shortcutable: true },
      { id: 'editor.nextSection',      label: 'Next Section',                 internalKey: 'F16+PS003', shortcutable: true },
      { id: 'editor.previousSection',  label: 'Previous Section',             internalKey: 'F16+PS004', shortcutable: true },
      { id: 'editor.insertMacro',      label: 'Insert Macro',                 internalKey: 'F16+PS005', shortcutable: true },
      { id: 'editor.insertTable',      label: 'Insert Table',                 internalKey: 'F16+PS006', shortcutable: true },
      { id: 'editor.insertSignature',  label: 'Insert Signature Line',        internalKey: 'F16+PS007', shortcutable: true },
      { id: 'editor.bold',             label: 'Bold',                         internalKey: 'F16+PS008', shortcutable: true },
      { id: 'editor.italic',           label: 'Italic',                       internalKey: 'F16+PS009', shortcutable: true },
      { id: 'editor.underline',        label: 'Underline',                    internalKey: 'F16+PS010', shortcutable: true },
      { id: 'editor.bullets',          label: 'Bullets',                      internalKey: 'F16+PS011', shortcutable: true },
      { id: 'editor.numbering',        label: 'Numbered List',                internalKey: 'F16+PS012', shortcutable: true },
      { id: 'editor.increaseIndent',   label: 'Increase Indent',              internalKey: 'F16+PS013', shortcutable: true },
      { id: 'editor.decreaseIndent',   label: 'Decrease Indent',              internalKey: 'F16+PS014', shortcutable: true },
      { id: 'editor.find',             label: 'Find',                         internalKey: 'F16+PS015', shortcutable: true },
      { id: 'editor.replace',          label: 'Replace',                      internalKey: 'F16+PS016', shortcutable: true },
      { id: 'editor.selectAll',        label: 'Select All',                   internalKey: 'F16+PS017', shortcutable: true },
      { id: 'editor.showRuler',        label: 'Show / Hide Ruler',            internalKey: 'F16+PS018', shortcutable: true },
      { id: 'editor.toggleFormatting', label: 'Show / Hide Formatting Marks', internalKey: 'F16+PS019', shortcutable: true },
    ],
  },

  // ── F17: Diagnosis & dictation ────────────────────────────────────────────
  {
    id: 'diagnosis',
    title: 'Diagnosis & Sign-Out',
    // Real fix (PS-66, Sep 2026): this group's own F17+PS001-PS008 keys are
    // the ones kept as canonical below — the ai_assist group further down
    // had silently reused this exact range for 5 of its own, unrelated
    // actions (renumbered there instead), and enterAddendum specifically is
    // now the shared, aliased key for mockActionRegistryService.ts's
    // ENTER_ADDENDUM (previously an independent, colliding literal there).
    actions: [
      { id: 'diagnosis.grossDescription',       label: 'Enter Gross Description',       internalKey: 'F17+PS001', shortcutable: true },
      { id: 'diagnosis.microscopicDescription', label: 'Enter Microscopic Description', internalKey: 'F17+PS002', shortcutable: true },
      { id: 'diagnosis.enterDiagnosis',         label: 'Enter Diagnosis',               internalKey: 'F17+PS003', shortcutable: true },
      { id: 'diagnosis.enterAddendum',          label: 'Enter Addendum',                internalKey: 'F17+PS004', shortcutable: true },
      { id: 'diagnosis.signOut',                label: 'Sign Out Case (Primary)',        internalKey: 'F17+PS005', shortcutable: true },
      { id: 'diagnosis.coSign',                 label: 'Co-Sign Case',                  internalKey: 'F17+PS006', description: 'Resident / Fellow' },
      { id: 'diagnosis.amend',                  label: 'Amend Signed-Out Case',         internalKey: 'F17+PS007' },
      { id: 'diagnosis.revokeSignOut',          label: 'Revoke Sign-Out',               internalKey: 'F17+PS008' },
      // Batch 380: the report page's save buttons (amendment/correction/addendum; critical-result notification).
      { id: 'diagnosis.saveRevision',           label: 'Save Amendment or Addendum',    internalKey: 'F17+PS057' },
      { id: 'diagnosis.recordCriticalNotification', label: 'Record Critical Notification', internalKey: 'F17+PS058' },
      // Batch 382: the frozen-versus-final reconciliation modal's Record.
      { id: 'diagnosis.recordDiscordance',      label: 'Record Frozen-Final Reconciliation', internalKey: 'F17+PS059' },
    ],
  },

  // ── F18: Messages context ─────────────────────────────────────────────────
  {
    id: 'messages',
    title: 'Messages',
    actions: [
      // ── Navigation ────────────────────────────────────────────────────────
      { id: 'messages.next',            label: 'Next Message',           internalKey: 'F18+PS001', shortcutable: true },
      { id: 'messages.previous',        label: 'Previous Message',       internalKey: 'F18+PS002', shortcutable: true },
      // ── Core actions ──────────────────────────────────────────────────────
      { id: 'messages.reply',           label: 'Reply',                  internalKey: 'F18+PS003', shortcutable: true },
      { id: 'messages.delete',          label: 'Delete Message',         internalKey: 'F18+PS004', shortcutable: true, description: 'Soft delete; permanent when in Recently Deleted view' },
      { id: 'messages.markRead',        label: 'Mark as Read',           internalKey: 'F18+PS005' },
      { id: 'messages.markUnread',      label: 'Mark as Unread',         internalKey: 'F18+PS014', description: 'Available via ⋯ thread menu' },
      { id: 'messages.markUrgent',      label: 'Toggle Urgent Flag',     internalKey: 'F18+PS006', description: 'Toggles urgent on compose' },
      // ── Compose ───────────────────────────────────────────────────────────
      { id: 'messages.compose',         label: 'New Internal Message',   internalKey: 'F18+PS007', shortcutable: true },
      { id: 'messages.send',            label: 'Send Message',           internalKey: 'F18+PS008', shortcutable: true },
      { id: 'messages.secureEmail',     label: 'Send Secure Email',      internalKey: 'F18+PS015', shortcutable: true, description: 'Routes to secure external email gateway (Paubox / Virtru)' },
      // ── To: field — recipient management ─────────────────────────────────
      { id: 'messages.recipientSearch', label: 'Search Recipients',      internalKey: 'F18+PS016', description: 'Opens full user-search modal from the To: field' },
      { id: 'messages.recipientAdd',    label: 'Add Recipient',          internalKey: 'F18+PS017', description: 'Confirms inline suggestion from To: field dropdown' },
      // ── Compose field helpers ─────────────────────────────────────────────
      { id: 'messages.gotoSubject',     label: 'Go to Subject',          internalKey: 'F18+PS010' },
      { id: 'messages.gotoBody',        label: 'Go to Message Body',     internalKey: 'F18+PS011' },
      { id: 'messages.clearSubject',    label: 'Clear Subject',          internalKey: 'F18+PS012' },
      { id: 'messages.clearBody',       label: 'Clear Message Body',     internalKey: 'F18+PS013' },
      // ── View & management ─────────────────────────────────────────────────
      { id: 'messages.close',           label: 'Close Messages',         internalKey: 'F18+PS009', shortcutable: true },
      { id: 'messages.search',          label: 'Search Messages',        internalKey: 'F18+PS018' },
      { id: 'messages.edit',            label: 'Toggle Edit Mode',       internalKey: 'F18+PS019', description: 'Enables multi-select checkboxes' },
      { id: 'messages.restore',         label: 'Restore Message',        internalKey: 'F18+PS020', description: 'Restores from Recently Deleted' },
      { id: 'messages.viewDeleted',     label: 'View Recently Deleted',  internalKey: 'F18+PS021' },
      { id: 'messages.deleteAll',       label: 'Delete All Selected',    internalKey: 'F18+PS022', description: 'Bulk soft-delete; permanent when in Recently Deleted view' },
    ],
  },

  // ── F19: Case management ──────────────────────────────────────────────────
  {
    id: 'case',
    title: 'Case Management',
    actions: [
      { id: 'case.viewWorklist',     label: 'View Case Worklist',         internalKey: 'F19+PS001' },
      { id: 'case.open',             label: 'Open / View Case',           internalKey: 'F19+PS002' },
      { id: 'case.create',           label: 'Create New Case',            internalKey: 'F19+PS003', description: 'Manual accession', prebuilt: true },
      { id: 'case.editDemographics', label: 'Edit Case Demographics',     internalKey: 'F19+PS004' },
      { id: 'case.assign',           label: 'Assign Case',                internalKey: 'F19+PS005' },
      { id: 'case.reassign',         label: 'Reassign Case',              internalKey: 'F19+PS006' },
      { id: 'case.prioritize',       label: 'Prioritize / Escalate Case', internalKey: 'F19+PS007' },
      { id: 'case.hold',             label: 'Place Case On Hold',         internalKey: 'F19+PS008' },
      { id: 'case.releaseHold',      label: 'Release Case From Hold',     internalKey: 'F19+PS009' },
      { id: 'case.archive',          label: 'Archive Case',               internalKey: 'F19+PS010' },
      { id: 'case.delete',           label: 'Delete Case',                internalKey: 'F19+PS011', description: 'Admin only' },
      { id: 'case.viewPediatric',    label: 'View Pediatric Cases',       internalKey: 'F19+PS012', description: 'Requires client authorization' },
      // Batch 381: the case and report comment modals' Post.
      { id: 'case.postComment',      label: 'Post Comment',               internalKey: 'F19+PS013' },
    ],
  },

  // Accession — specimen.add (F20+PS001) and case.create (F19+PS003) were
  // already reserved above/elsewhere but never wired to a live action;
  // reused here rather than assigned fresh keys. importOrder/caseComment
  // are genuinely new, continuing the F24 block per this file's own
  // convention of reusing F24 with higher PS numbers for anything added
  // after the original per-Fkey allocation was exhausted.
  {
    id: 'accession',
    title: 'Accession',
    actions: [
      { id: 'accession.importOrder',  label: 'Import From Order',     internalKey: 'F24+PS034' },
      { id: 'accession.caseComment',  label: 'Add Case Comment',      internalKey: 'F24+PS035' },
      // Real, per the uploaded "Structured Clinical History Dictionary
      // & Accessioning Integration" spec's own User Story 4,
      // Acceptance Criteria 1 ("Alt+1 through Alt+6 jump directly to
      // categories 1-6 in the history panel") — six new, genuinely new
      // keys, continuing the same F24 block this file's own comment
      // above already establishes.
      { id: 'accession.clinicalHistoryCategory1', label: 'Clinical History — Jump to Category 1 (SCR)',       internalKey: 'F24+PS044' },
      { id: 'accession.clinicalHistoryCategory2', label: 'Clinical History — Jump to Category 2 (SYM)',       internalKey: 'F24+PS045' },
      { id: 'accession.clinicalHistoryCategory3', label: 'Clinical History — Jump to Category 3 (RAD_LAB)',   internalKey: 'F24+PS046' },
      { id: 'accession.clinicalHistoryCategory4', label: 'Clinical History — Jump to Category 4 (PRIOR_PATH)', internalKey: 'F24+PS047' },
      { id: 'accession.clinicalHistoryCategory5', label: 'Clinical History — Jump to Category 5 (MAL_STAGE)', internalKey: 'F24+PS048' },
      { id: 'accession.clinicalHistoryCategory6', label: 'Clinical History — Jump to Category 6 (HIGH_RISK)', internalKey: 'F24+PS049' },
    ],
  },

  // Grossing — reachable from the same Synoptic Report page/context as
  // regular reporting work, not a separate page. "Mark grossed" and
  // "confirm triage" needed real underlying actions built alongside
  // these voice triggers — neither existed anywhere before this pass
  // (no UI advanced a block's status, no state tracked triage
  // confirmation), so this isn't just a voice-layer addition.
  {
    id: 'grossing',
    title: 'Grossing',
    actions: [
      { id: 'grossing.nextBlock',      label: 'Next Block',            internalKey: 'F24+PS036' },
      { id: 'grossing.previousBlock',  label: 'Previous Block',        internalKey: 'F24+PS037' },
      { id: 'grossing.markGrossed',    label: 'Mark Block Grossed',    internalKey: 'F24+PS038' },
      { id: 'grossing.confirmTriage',  label: 'Confirm Triage',        internalKey: 'F24+PS039' },
      // Batch 378: the Grossing screen's Complete grossing (checks the required fields first).
      { id: 'grossing.complete',       label: 'Complete Grossing',     internalKey: 'F24+PS050' },
      // Batch 379: answer the "complete without a protocol?" confirmation.
      { id: 'grossing.completeConfirm', label: 'Confirm Complete Grossing', internalKey: 'F24+PS051' },
      { id: 'grossing.completeCancel',  label: 'Cancel Complete Grossing',  internalKey: 'F24+PS052' },
    ],
  },

  // ── F20: Specimen ─────────────────────────────────────────────────────────
  {
    id: 'specimen',
    title: 'Specimen',
    actions: [
      { id: 'specimen.add',                label: 'Add Specimen',              internalKey: 'F20+PS001' },
      { id: 'specimen.edit',               label: 'Edit Specimen Details',     internalKey: 'F20+PS002' },
      { id: 'specimen.remove',             label: 'Remove Specimen',           internalKey: 'F20+PS003' },
      { id: 'specimen.applyFlag',          label: 'Apply Flag to Specimen',    internalKey: 'F20+PS004' },
      { id: 'specimen.removeFlag',         label: 'Remove Flag from Specimen', internalKey: 'F20+PS005' },
      { id: 'specimen.assignSubspecialty', label: 'Assign to Subspecialty',    internalKey: 'F20+PS006' },
      { id: 'specimen.syncLIS',           label: 'Sync Specimen to LIS',       internalKey: 'F20+PS007', description: 'Request LIS sync for a locally-created specimen' },
      { id: 'specimen.editLISStatus',     label: 'Edit LIS Sync Status',       internalKey: 'F20+PS008', description: 'View and update the LIS synchronisation status of a specimen' },
      // Batch 380: the Add/Edit specimen modal's Save.
      { id: 'specimen.saveEdit',          label: 'Save Specimen',              internalKey: 'F20+PS009' },
      // Batch 381: the biopsy array modal's Save.
      { id: 'specimen.saveBiopsyArray',   label: 'Save Biopsy Array',          internalKey: 'F20+PS010' },
    ],
  },

  // ── F21: Reports ──────────────────────────────────────────────────────────
  {
    id: 'report',
    title: 'Reports',
    actions: [
      { id: 'report.preview',     label: 'Preview Report',               internalKey: 'F21+PS001' },
      { id: 'report.generate',    label: 'Generate / Print Report',      internalKey: 'F21+PS002' },
      { id: 'report.deliver',     label: 'Deliver Report to Physician',  internalKey: 'F21+PS003', description: 'Fax or email' },
      { id: 'report.redeliver',   label: 'Re-Deliver Report',            internalKey: 'F21+PS004' },
      { id: 'report.viewHistory', label: 'View Report History',          internalKey: 'F21+PS005' },
      { id: 'report.download',         label: 'Download Report PDF',               internalKey: 'F21+PS006' },
      { id: 'report.selectTemplate',   label: 'Select Report Template',            internalKey: 'F21+PS007', description: 'View the report template resolved for this case' },
      { id: 'report.overrideTemplate', label: 'Override Report Template',          internalKey: 'F21+PS008', description: 'Pathologist override of system-resolved report template' },
    ],
  },

  // ── F22: AI Assistance ────────────────────────────────────────────────────
  {
    id: 'ai',
    title: 'AI Assistance',
    actions: [
      { id: 'ai.diagnosisSuggest', label: 'Use AI Diagnosis Suggestion',      internalKey: 'F22+PS001' },
      { id: 'ai.grossAssist',      label: 'Use AI Gross Description Assist',  internalKey: 'F22+PS002' },
      { id: 'ai.macroSuggest',     label: 'Use AI Macro Suggestion',          internalKey: 'F22+PS003' },
      { id: 'ai.viewConfidence',   label: 'View AI Confidence Scores',        internalKey: 'F22+PS004' },
      { id: 'ai.override',              label: 'Override AI Suggestion',           internalKey: 'F22+PS005' },
      { id: 'ai.changeReportTemplate',  label: 'Change Report Template',           internalKey: 'F22+PS006', shortcutable: true, description: 'Override the system-resolved report template for this case' },
      { id: 'ai.acceptNarrativeSection',label: 'Accept Narrative Section',         internalKey: 'F22+PS007', shortcutable: true, description: 'Accept AI-generated narrative section without edits' },
      { id: 'ai.regenerateSection',     label: 'Regenerate Narrative Section',     internalKey: 'F22+PS008', shortcutable: true, description: 'Trigger AI regeneration of a single narrative section' },
    ],
  },

  // ── F23: Facility & Physician ───────────────────────────────────────────────
  {
    id: 'facilityPhysician',
    title: 'Facility & Physician',
    actions: [
      { id: 'facility.view',    label: 'View Facility List',       internalKey: 'F23+PS001' },
      { id: 'facility.edit',    label: 'Add / Edit Facility',      internalKey: 'F23+PS002' },
      { id: 'physician.view',   label: 'View Physician Directory', internalKey: 'F23+PS003' },
      { id: 'physician.edit',   label: 'Add / Edit Physician',     internalKey: 'F23+PS004' },
      { id: 'physician.verify', label: 'Verify Physician Record',  internalKey: 'F23+PS005' },
    ],
  },

  // ── F24: Configuration & Admin ────────────────────────────────────────────
  {
    id: 'config',
    title: 'Configuration',
    actions: [
      { id: 'config.access',         label: 'Access Configuration Module',     internalKey: 'F24+PS001' },
      { id: 'config.staff',          label: 'Manage Staff',                    internalKey: 'F24+PS002' },
      { id: 'config.roles',          label: 'Manage Roles',                    internalKey: 'F24+PS003' },
      { id: 'config.subspecialties', label: 'Manage Subspecialties',           internalKey: 'F24+PS004' },
      { id: 'config.specimens',      label: 'Manage Specimen Dictionary',      internalKey: 'F24+PS005' },
      { id: 'config.flags',          label: 'Manage Flags',                    internalKey: 'F24+PS006' },
      { id: 'config.ai',             label: 'Manage AI Behavior Settings',     internalKey: 'F24+PS007' },
      { id: 'config.macros',         label: 'Manage Macros',                   internalKey: 'F24+PS008' },
      { id: 'config.shortcuts',      label: 'Manage Keyboard Shortcuts',       internalKey: 'F24+PS009' },
      { id: 'config.lis',            label: 'Manage LIS Integration Settings', internalKey: 'F24+PS010' },
      { id: 'config.auditLog',          label: 'View Audit Log',                  internalKey: 'F24+PS011' },
      { id: 'config.reportTemplates',   label: 'Manage Report Templates',         internalKey: 'F24+PS030' },
      { id: 'config.routingRules',      label: 'Manage Template Routing Rules',   internalKey: 'F24+PS031', description: 'Facility and physician overrides for report template resolution' },
      { id: 'config.validationStudies', label: 'Manage Validation Studies',       internalKey: 'F24+PS032', description: 'Admin and superadmin only' },
    ],
  },

  // QC, Billing, Admin reuse F24 block with higher PS numbers
  {
    id: 'qc',
    title: 'Quality Control',
    actions: [
      { id: 'qc.configure',           label: 'Configure QC Rules',   internalKey: 'F24+PS012' },
      { id: 'qc.viewQueue',           label: 'View QC Queue',        internalKey: 'F24+PS013' },
      { id: 'qc.claimReview',         label: 'Claim QC Review',      internalKey: 'F24+PS014' },
      { id: 'qc.submitReview',        label: 'Submit QC Review',     internalKey: 'F24+PS015' },
      { id: 'qc.escalateDiscordance', label: 'Escalate Discordance', internalKey: 'F24+PS016' },
      { id: 'qc.viewDashboard',       label: 'View QC Dashboard',    internalKey: 'F24+PS017' },
      { id: 'qc.exportReport',        label: 'Export QC Report',     internalKey: 'F24+PS018' },
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    actions: [
      { id: 'billing.viewCodes',   label: 'View Billing Codes on Case', internalKey: 'F24+PS019', prebuilt: true },
      { id: 'billing.editCodes',   label: 'Edit Billing Codes',         internalKey: 'F24+PS020', prebuilt: true },
      { id: 'billing.submitClaim', label: 'Submit Claim',               internalKey: 'F24+PS021', prebuilt: true },
      { id: 'billing.viewHistory', label: 'View Billing History',       internalKey: 'F24+PS022', prebuilt: true },
      { id: 'billing.exportBatch', label: 'Export Billing Batch',       internalKey: 'F24+PS023', prebuilt: true },
      // Batch 382: the post-sign-out billing reason modal's Confirm and the
      // applied-code correction modal's Correct.
      { id: 'billing.confirmPostSignoutChange', label: 'Confirm Post-Sign-Out Billing Change', internalKey: 'F24+PS053' },
      { id: 'billing.correctAppliedCode',       label: 'Correct Applied Billing Code',         internalKey: 'F24+PS054' },
    ],
  },
  {
    id: 'admin',
    title: 'System / Admin',
    actions: [
      { id: 'admin.dashboard',   label: 'View System Dashboard',  internalKey: 'F24+PS024' },
      { id: 'admin.reports',     label: 'Run System Reports',     internalKey: 'F24+PS025' },
      { id: 'admin.export',      label: 'Export Data',            internalKey: 'F24+PS026' },
      { id: 'admin.backups',     label: 'Manage Backups',         internalKey: 'F24+PS027' },
      { id: 'admin.eventLog',    label: 'View Error / Event Log', internalKey: 'F24+PS028' },
      { id: 'admin.impersonate',        label: 'Impersonate User',              internalKey: 'F24+PS029', description: 'Super admin only' },
      { id: 'admin.validationStudies',  label: 'View Validation Study Data',    internalKey: 'F24+PS033', description: 'Access aggregate validation study metrics and reports — superadmin only' },
    ],
  },


  // ── AI Assist ────────────────────────────────────────────────────────────
  {
    id: 'ai_assist',
    title: 'AI Assist',
    actions: [
      { id: 'ai.diagnosisSuggest',   label: 'AI Diagnosis Suggestions',      description: 'View and interact with AI-suggested synoptic field values', internalKey: 'F17+PS001', shortcutable: true },
      { id: 'ai.grossAssist',        label: 'AI Gross Description Assist',   description: 'AI assistance when entering gross description', internalKey: 'F17+PS002' },
      { id: 'ai.macroSuggest',       label: 'AI Macro Suggestions',          description: 'AI suggests relevant macros based on diagnosis context', internalKey: 'F17+PS003' },
      // Real fix (PS-66, Sep 2026): this whole ai_assist group was seeded
      // with F17+PS001-PS008, silently reusing the diagnosis group's own
      // F17+PS001-PS008 range instead of continuing from this file's
      // combined real high-water mark. viewConfidence/override/reviewTriage/
      // codeSuggest/narrativeGenerate renumbered below to fresh, never-used
      // F17+PS047-PS051 — diagnosisSuggest/grossAssist/macroSuggest (PS001-
      // PS003 above) are a SEPARATE, larger, still-open finding from the
      // same investigation (they collide with diagnosis.grossDescription/
      // microscopicDescription/enterDiagnosis) — deliberately left
      // unrenumbered here since nothing in mockActionRegistryService.ts
      // collides with them, so fixing them wasn't required to close this
      // ticket's own actual scope (real collisions involving
      // mockActionRegistryService.ts) — see PS-66's Jira comment for the
      // full, disclosed account of this separate F17/F18 internal-only
      // duplication and why it wasn't fixed in the same pass.
      { id: 'ai.viewConfidence',     label: 'View AI Confidence Scores',     description: 'See confidence percentages on AI field suggestions', internalKey: 'F17+PS047' },
      { id: 'ai.override',           label: 'Override AI Suggestion',        description: 'Mark an AI suggestion as disputed and enter own value', internalKey: 'F17+PS048', shortcutable: true },
      { id: 'ai.reviewTriage',       label: 'AI Review Triage Modal',        description: 'Step through uncertain AI findings before finalization using keyboard/voice', internalKey: 'F17+PS049', shortcutable: true },
      { id: 'ai.codeSuggest',        label: 'AI Code Suggestions',           description: 'AI suggests ICD-10, SNOMED, ICD-O, and CPT codes from case text', internalKey: 'F17+PS050' },
      { id: 'ai.narrativeGenerate',  label: 'AI Narrative Generation',       description: 'Orchestrator mode — AI drafts the narrative report from synoptic answers', internalKey: 'F17+PS051' },
    ],
  },
  // ── Delegation ────────────────────────────────────────────────────────────
  {
    id: 'delegation',
    title: 'Delegation & Handoff',
    actions: [
      { id: 'delegation.open',           label: 'Open Delegate Modal',           description: 'Open the case delegation workflow (Alt+D, voice: "delegate case")', internalKey: 'F18+PS001', shortcutable: true },
      { id: 'delegation.reassign',       label: 'Case Reassignment',             description: 'Full transfer of case ownership to another pathologist', internalKey: 'F18+PS002' },
      { id: 'delegation.pool',           label: 'Move Case to Pool',             description: 'Transfer case to a workgroup pool queue for any available pathologist', internalKey: 'F18+PS003' },
      { id: 'delegation.secondOpinion',  label: 'Request Second Opinion',        description: 'Formal consultation — original pathologist retains ownership. CPT 88321-88325 may apply.', internalKey: 'F18+PS004' },
      { id: 'delegation.casualReview',   label: 'Request Casual Review',         description: 'Informal peer review with no formal obligation for reviewer', internalKey: 'F18+PS005' },
      { id: 'delegation.tumorBoard',     label: 'Submit to Tumor Board',         description: 'Submit case for multidisciplinary team discussion — not a sign-out', internalKey: 'F18+PS006' },
      { id: 'delegation.teaching',       label: 'Assign as Teaching Case',       description: 'Assign to resident or fellow for educational review', internalKey: 'F18+PS007' },
      { id: 'delegation.externalConsult',label: 'External Consultation',         description: 'Send to outside institution or specialist. CPT 88321-88325 may apply.', internalKey: 'F18+PS008' },
      { id: 'delegation.assignSynoptic', label: 'Assign Synoptic to Pathologist',description: 'Assign a specific specimen synoptic to another pathologist — they finalise, attending countersigns', internalKey: 'F18+PS009' },
      { id: 'delegation.countersign',    label: 'Countersign Synoptic',          description: 'Attending countersigns a synoptic finalised by an assigned resident/fellow', internalKey: 'F18+PS010' },
    ],
  },
  // ── Pool Cases ────────────────────────────────────────────────────────────
  {
    id: 'pool',
    title: 'Pool Cases',
    actions: [
      { id: 'pool.viewCases',   label: 'View Pool Cases',   description: 'Access the Pool Cases tile and filtered worklist view', internalKey: 'F18+PS011', shortcutable: true },
      { id: 'pool.acceptCase',  label: 'Accept Pool Case',  description: 'Claim and accept a case from a workgroup pool (Alt+A, voice: "accept case")', internalKey: 'F18+PS012', shortcutable: true },
      { id: 'pool.passCase',    label: 'Pass Pool Case',    description: 'Decline a pool case and return it to the queue (Alt+P, voice: "pass case")', internalKey: 'F18+PS013', shortcutable: true },
    ],
  },
  // ── Synoptic Navigation ───────────────────────────────────────────────────
  {
    id: 'synoptic_nav',
    title: 'Synoptic Navigation',
    actions: [
      // Real fix (PS-66, Sep 2026): jumpNextUnanswered/jumpNextRequired keep
      // their existing F17+PS009/PS010 — confirmed via matching voice
      // trigger ("next unanswered"/"next required") and shortcut that
      // mockActionRegistryService.ts's NEXT_UNANSWERED/NEXT_REQUIRED are
      // real, independent registrations of these exact same two actions,
      // previously colliding with the WRONG keys (F17+PS005/PS006) purely
      // by accident. Those two mock entries now alias this key via
      // ACTION_MAP[...]?.internalKey instead. markDeferred keeps F17+PS011 —
      // mockActionRegistryService.ts's TABBED_VIEW, which used to collide
      // with it, is a genuinely different, unrelated action and was
      // renumbered away instead (see that file's own comment).
      { id: 'synoptic.jumpNextUnanswered', label: 'Jump to Next Unanswered Field', description: 'Scroll to, highlight, and focus the next blank field (Alt+U, voice: "next unanswered")', internalKey: 'F17+PS009', shortcutable: true },
      { id: 'synoptic.jumpNextRequired',   label: 'Jump to Next Required Field',   description: 'Scroll to, highlight, and focus the next required blank field (Alt+R, voice: "next required")', internalKey: 'F17+PS010', shortcutable: true },
      { id: 'synoptic.markDeferred',       label: 'Mark Synoptic as Deferred',     description: 'Mark synoptic as pending ancillary results — bypasses required field check at sign-out', internalKey: 'F17+PS011' },
      // Real fix (PS-66, Sep 2026): confirmField/overrideField each carried
      // an internalKey that collided both with a diagnosis.* entry above
      // AND with mockActionRegistryService.ts's own separately-defined
      // CONFIRM_FIELD/EDIT_FIELD (same real action, independently
      // registered on both sides — confirmed via matching label/shortcut/
      // voice trigger, not guessed). Given fresh, dedicated keys here;
      // mockActionRegistryService.ts's CONFIRM_FIELD/EDIT_FIELD now alias
      // these via ACTION_MAP[...]?.internalKey, the same established
      // pattern already used for ENTER_GROSS/ENTER_MICRO/ENTER_DIAGNOSIS —
      // so the two files can never silently drift apart on this key again.
      { id: 'synoptic.confirmField',       label: 'Confirm Field',                 description: 'Explicitly confirm an AI suggestion (Alt+C, voice: "confirm field")', internalKey: 'F17+PS052', shortcutable: true },
      { id: 'synoptic.overrideField',      label: 'Override Field',                description: 'Mark AI suggestion as disputed and enter own value (Alt+E, voice: "override field")', internalKey: 'F17+PS053', shortcutable: true },
    ],
  },
];

// ─── Flat lookup maps ─────────────────────────────────────────────────────────
export const ACTION_MAP: Record<ActionId, SystemAction> =
  {} as Record<ActionId, SystemAction>;

/** internalKey → action — used by keyboard handler to dispatch */
const INTERNAL_KEY_MAP: Record<string, SystemAction> = {};

ACTION_GROUPS.forEach(g =>
  g.actions.forEach(a => {
    ACTION_MAP[a.id] = a;
    INTERNAL_KEY_MAP[a.internalKey] = a;
  })
);

// ─── Shortcutable actions only (for KeyboardShortcutsModal) ──────────────────
export const SHORTCUT_GROUPS = ACTION_GROUPS
  .map(g => ({ ...g, actions: g.actions.filter(a => a.shortcutable) }))
  .filter(g => g.actions.length > 0);

// ─── Voice context names — use these constants when calling setCurrentContext ─
// Real, per direct follow-up ("the actions list is out of sync...
// voice control... has to be flawless"): REPORTING removed here —
// confirmed genuinely dead after this pass's fix (every action that
// used it recategorized to SYNOPTIC, which is the real context
// SynopticReportPage.tsx actually sets; zero pages ever set
// REPORTING). Left in place, it would have been a real, standing
// invitation to reintroduce the exact orphaned-category bug this
// whole pass exists to fix. AUDIT added — a new, genuinely needed
// context, since AuditLogPage.tsx never had one of its own before
// (confirmed directly), leaving its own real actions with no way to
// ever become eligible.
export const VOICE_CONTEXT = {
  WORKLIST:      'WORKLIST',
  CASE_VIEW:     'CASE_VIEW',
  SYNOPTIC:      'SYNOPTIC',
  MESSAGES:      'MESSAGES',
  SEARCH:        'SEARCH',
  CONFIGURATION: 'CONFIGURATION',
  ACCESSION:     'ACCESSION',
  CONTRIBUTION:  'CONTRIBUTION',
  INTRAOP:       'INTRAOP',
  AUDIT:         'AUDIT',
  /** Real, per direct guidance's own confirmed voice-wiring request
   *  for the Cytology Material/Synoptic drawers — a genuinely
   *  separate context from Surgical's own SYNOPTIC above. Eligibility
   *  is scoped by exact category match (mockActionRegistryService.ts's
   *  own getEligibleActions/findActionByTrigger), so a shared context
   *  would make Surgical's own "open synoptic"-style triggers and
   *  Cytology's own simultaneously eligible on the wrong page — a
   *  genuine collision risk, not just a naming preference. */
  CYTOLOGY:      'CYTOLOGY',
  /** Batch 378: the Grossing screen (/case/:id/grossing), a page of its own. */
  GROSSING:      'GROSSING',
} as const;

export type VoiceContextName = typeof VOICE_CONTEXT[keyof typeof VOICE_CONTEXT];

// ─── Default role permission sets ────────────────────────────────────────────
export type PermissionSet = Partial<Record<ActionId, boolean>>;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionSet> = {
  Pathologist: {
    'system.openMessages': true, 'system.openWorklist': true,
    'system.goBack': true, 'system.goForward': true,
    'system.saveDraft': true, 'system.signOut': true,
    'nav.nextCase': true, 'nav.previousCase': true,
    'nav.nextTab': true, 'nav.previousTab': true,
    'table.next': true, 'table.previous': true, 'table.pageDown': true, 'table.pageUp': true,
    'table.first': true, 'table.last': true, 'table.select': true,
    'table.selectAll': true, 'table.deselectAll': true, 'table.openSelected': true,
    'table.refresh': true, 'table.search': true, 'table.clearSearch': true,
    'case.viewWorklist': true, 'case.open': true, 'case.editDemographics': true,
    'case.assign': true, 'case.reassign': true, 'case.prioritize': true,
    'case.hold': true, 'case.releaseHold': true, 'case.archive': true,
    'specimen.add': true, 'specimen.edit': true, 'specimen.remove': true,
    'specimen.applyFlag': true, 'specimen.removeFlag': true, 'specimen.assignSubspecialty': true,
    'diagnosis.grossDescription': true, 'diagnosis.microscopicDescription': true,
    'diagnosis.enterDiagnosis': true, 'diagnosis.enterAddendum': true,
    'diagnosis.signOut': true, 'diagnosis.amend': true, 'diagnosis.revokeSignOut': true,
    'report.preview': true, 'report.generate': true, 'report.deliver': true,
    'report.redeliver': true, 'report.viewHistory': true, 'report.download': true,
    'ai.diagnosisSuggest': true, 'ai.grossAssist': true, 'ai.macroSuggest': true,
    'ai.viewConfidence': true, 'ai.override': true,
    'editor.nextField': true, 'editor.previousField': true,
    'editor.nextSection': true, 'editor.previousSection': true,
    'editor.insertMacro': true, 'editor.insertTable': true, 'editor.insertSignature': true,
    'editor.bold': true, 'editor.italic': true, 'editor.underline': true,
    'editor.bullets': true, 'editor.numbering': true,
    'editor.increaseIndent': true, 'editor.decreaseIndent': true,
    'editor.find': true, 'editor.replace': true, 'editor.selectAll': true,
    'editor.showRuler': true, 'editor.toggleFormatting': true,
    'messages.next': true, 'messages.previous': true, 'messages.reply': true,
    'messages.delete': true, 'messages.markRead': true, 'messages.markUnread': true,
    'messages.compose': true, 'messages.send': true, 'messages.close': true,
    'messages.secureEmail': true, 'messages.recipientSearch': true, 'messages.recipientAdd': true,
    'messages.search': true, 'messages.edit': true, 'messages.restore': true,
    'messages.viewDeleted': true, 'messages.deleteAll': true,
    'messages.gotoSubject': true, 'messages.gotoBody': true,
    'messages.clearSubject': true, 'messages.clearBody': true,
    'messages.markUrgent': true,
    'physician.view': true, 'facility.view': true,
    'qc.viewQueue': true, 'qc.claimReview': true, 'qc.submitReview': true,
    'qc.escalateDiscordance': true, 'qc.viewDashboard': true,
    // AI Assist
    'ai.reviewTriage': true, 'ai.codeSuggest': true, 'ai.narrativeGenerate': true,
    // Orchestration — narrative template selection and section management
    'ai.changeReportTemplate': true, 'ai.acceptNarrativeSection': true, 'ai.regenerateSection': true,
    'report.selectTemplate': true, 'report.overrideTemplate': true,
    // Specimen LIS sync
    'specimen.syncLIS': true, 'specimen.editLISStatus': true,
    // Delegation
    'delegation.open': true, 'delegation.reassign': true, 'delegation.pool': true,
    'delegation.secondOpinion': true, 'delegation.casualReview': true,
    'delegation.tumorBoard': true, 'delegation.teaching': true,
    'delegation.externalConsult': true, 'delegation.assignSynoptic': true,
    'delegation.countersign': true,
    // Pool
    'pool.viewCases': true, 'pool.acceptCase': true, 'pool.passCase': true,
    // Synoptic Navigation
    'synoptic.jumpNextUnanswered': true, 'synoptic.jumpNextRequired': true,
    'synoptic.markDeferred': true, 'synoptic.confirmField': true, 'synoptic.overrideField': true,
    // Pediatric access — off by default, enabled per role by admin
    'case.viewPediatric': false,
  },
  Resident: {
    'system.openMessages': true, 'system.openWorklist': true,
    'system.goBack': true, 'system.goForward': true,
    'nav.nextCase': true, 'nav.previousCase': true,
    'nav.nextTab': true, 'nav.previousTab': true,
    'table.next': true, 'table.previous': true, 'table.pageDown': true, 'table.pageUp': true,
    'table.first': true, 'table.last': true, 'table.select': true,
    'table.openSelected': true, 'table.refresh': true, 'table.search': true,
    'case.viewWorklist': true, 'case.open': true, 'case.editDemographics': true,
    'case.prioritize': true, 'case.hold': true, 'case.releaseHold': true,
    'specimen.add': true, 'specimen.edit': true, 'specimen.applyFlag': true,
    'specimen.removeFlag': true, 'specimen.assignSubspecialty': true,
    'diagnosis.grossDescription': true, 'diagnosis.microscopicDescription': true,
    'diagnosis.enterDiagnosis': true, 'diagnosis.enterAddendum': true, 'diagnosis.coSign': true,
    'report.preview': true, 'report.viewHistory': true, 'report.download': true,
    'ai.diagnosisSuggest': true, 'ai.grossAssist': true, 'ai.macroSuggest': true,
    'ai.viewConfidence': true, 'ai.override': true,
    'editor.nextField': true, 'editor.previousField': true,
    'editor.insertMacro': true, 'editor.insertTable': true,
    'editor.bold': true, 'editor.italic': true, 'editor.underline': true,
    'editor.bullets': true, 'editor.numbering': true,
    'editor.find': true, 'editor.replace': true, 'editor.selectAll': true,
    'messages.next': true, 'messages.previous': true, 'messages.reply': true,
    'messages.delete': true, 'messages.markRead': true, 'messages.markUnread': true,
    'messages.compose': true, 'messages.send': true, 'messages.close': true,
    'messages.secureEmail': true, 'messages.recipientSearch': true, 'messages.recipientAdd': true,
    'messages.search': true, 'messages.edit': true, 'messages.restore': true,
    'messages.viewDeleted': true, 'messages.deleteAll': true,
    'messages.gotoSubject': true, 'messages.gotoBody': true,
    'messages.clearSubject': true, 'messages.clearBody': true,
    'messages.markUrgent': true,
    'physician.view': true, 'facility.view': true,
    'qc.viewQueue': true, 'qc.viewDashboard': true,
    // AI Assist — residents can use AI but not narrative generation
    'ai.reviewTriage': true, 'ai.codeSuggest': true,
    // Delegation — residents can request review but not reassign or countersign
    'delegation.open': true, 'delegation.secondOpinion': true,
    'delegation.casualReview': true, 'delegation.tumorBoard': true,
    // Pool
    'pool.viewCases': true, 'pool.acceptCase': true, 'pool.passCase': true,
    // Synoptic Navigation
    'synoptic.jumpNextUnanswered': true, 'synoptic.jumpNextRequired': true,
    'synoptic.markDeferred': true, 'synoptic.confirmField': true, 'synoptic.overrideField': true,
  },
  Admin: {
    'system.openMessages': true, 'system.openWorklist': true,
    'system.goBack': true, 'system.goForward': true,
    'system.openConfiguration': true, 'system.openAudit': true,
    'nav.nextTab': true, 'nav.previousTab': true,
    'table.next': true, 'table.previous': true, 'table.pageDown': true, 'table.pageUp': true,
    'table.select': true, 'table.selectAll': true, 'table.refresh': true, 'table.search': true,
    'case.viewWorklist': true, 'case.assign': true, 'case.reassign': true,
    'case.archive': true, 'case.delete': true,
    'facility.view': true, 'facility.edit': true,
    'physician.view': true, 'physician.edit': true, 'physician.verify': true,
    'config.access': true, 'config.staff': true, 'config.roles': true,
    'config.subspecialties': true, 'config.specimens': true, 'config.flags': true,
    'config.ai': true, 'config.macros': true, 'config.shortcuts': true,
    'config.lis': true, 'config.auditLog': true,
    'config.reportTemplates': true, 'config.routingRules': true,
    'config.validationStudies': true,
    'messages.next': true, 'messages.previous': true, 'messages.reply': true,
    'messages.delete': true, 'messages.markRead': true, 'messages.markUnread': true,
    'messages.compose': true, 'messages.send': true, 'messages.close': true,
    'messages.secureEmail': true, 'messages.recipientSearch': true, 'messages.recipientAdd': true,
    'messages.search': true, 'messages.edit': true, 'messages.restore': true,
    'messages.viewDeleted': true, 'messages.deleteAll': true,
    'messages.gotoSubject': true, 'messages.gotoBody': true,
    'messages.clearSubject': true, 'messages.clearBody': true,
    'messages.markUrgent': true,
    'qc.configure': true, 'qc.viewDashboard': true, 'qc.exportReport': true,
    'admin.dashboard': true, 'admin.reports': true, 'admin.export': true,
    'admin.backups': true, 'admin.eventLog': true,
    'admin.validationStudies': true,
  },
  /**
   * Pathology Fellow — subspecialty-focused, near-attending autonomy.
   * Built by deliberate delta from Resident based on four dimensions:
   * scope/breadth, sign-out autonomy, gross-room involvement, and teaching/
   * leadership responsibility. Key differences from Resident, not just
   * "more of everything":
   *   - Full diagnostic entry + report drafting (enterDiagnosis,
   *     microscopicDescription, report.generate, template selection,
   *     narrative accept/regenerate) — manages a case end-to-end through
   *     a complete draft, consistent with "pre-sign-out" autonomy.
   *   - Still NO diagnosis.signOut/amend/revokeSignOut or
   *     report.deliver/redeliver — the attending still officially
   *     signs/releases, same line Resident already draws.
   *   - FEWER gross-room permissions than Resident, not more: no
   *     specimen.add/remove (routine hands-on registration a Fellow is
   *     "minimally involved" in) — kept edit/flag/subspecialty for
   *     supervisory correction on complex cases.
   *   - delegation.teaching added (Resident doesn't have this) — running
   *     tumor boards, overseeing resident rotations.
   *   - delegation.countersign deliberately NOT granted — debatable; the
   *     "attending officially signs" framing reads as resident→attending,
   *     not resident→fellow→attending, but this is institution-dependent.
   *   - case.assign added beyond Resident's set, specifically tied to
   *     overseeing resident rotations, not general case authority.
   */
  Fellow: {
    'system.openMessages': true, 'system.openWorklist': true,
    'system.goBack': true, 'system.goForward': true,
    'nav.nextCase': true, 'nav.previousCase': true,
    'nav.nextTab': true, 'nav.previousTab': true,
    'table.next': true, 'table.previous': true, 'table.pageDown': true, 'table.pageUp': true,
    'table.first': true, 'table.last': true, 'table.select': true,
    'table.selectAll': true, 'table.deselectAll': true, 'table.openSelected': true,
    'table.refresh': true, 'table.search': true, 'table.clearSearch': true,
    'case.viewWorklist': true, 'case.open': true, 'case.editDemographics': true,
    'case.assign': true, 'case.prioritize': true, 'case.hold': true, 'case.releaseHold': true,
    'specimen.edit': true, 'specimen.applyFlag': true, 'specimen.removeFlag': true,
    'specimen.assignSubspecialty': true,
    'diagnosis.grossDescription': true, 'diagnosis.microscopicDescription': true,
    'diagnosis.enterDiagnosis': true, 'diagnosis.enterAddendum': true, 'diagnosis.coSign': true,
    'report.preview': true, 'report.generate': true, 'report.viewHistory': true, 'report.download': true,
    'ai.diagnosisSuggest': true, 'ai.grossAssist': true, 'ai.macroSuggest': true,
    'ai.viewConfidence': true, 'ai.override': true,
    'ai.reviewTriage': true, 'ai.codeSuggest': true, 'ai.narrativeGenerate': true,
    'ai.changeReportTemplate': true, 'ai.acceptNarrativeSection': true, 'ai.regenerateSection': true,
    'report.selectTemplate': true, 'report.overrideTemplate': true,
    // Full editor tier — same as Pathologist, NOT Resident's restricted
    // subset. A Fellow drafting a complete pre-sign-out report needs
    // signature-block and section-navigation access, not just basic text.
    'editor.nextField': true, 'editor.previousField': true,
    'editor.nextSection': true, 'editor.previousSection': true,
    'editor.insertMacro': true, 'editor.insertTable': true, 'editor.insertSignature': true,
    'editor.bold': true, 'editor.italic': true, 'editor.underline': true,
    'editor.bullets': true, 'editor.numbering': true,
    'editor.increaseIndent': true, 'editor.decreaseIndent': true,
    'editor.find': true, 'editor.replace': true, 'editor.selectAll': true,
    'editor.showRuler': true, 'editor.toggleFormatting': true,
    'messages.next': true, 'messages.previous': true, 'messages.reply': true,
    'messages.delete': true, 'messages.markRead': true, 'messages.markUnread': true,
    'messages.compose': true, 'messages.send': true, 'messages.close': true,
    'messages.secureEmail': true, 'messages.recipientSearch': true, 'messages.recipientAdd': true,
    'messages.search': true, 'messages.edit': true, 'messages.restore': true,
    'messages.viewDeleted': true, 'messages.deleteAll': true,
    'messages.gotoSubject': true, 'messages.gotoBody': true,
    'messages.clearSubject': true, 'messages.clearBody': true,
    'messages.markUrgent': true,
    'physician.view': true, 'facility.view': true,
    'qc.viewQueue': true, 'qc.claimReview': true, 'qc.submitReview': true,
    'qc.escalateDiscordance': true, 'qc.viewDashboard': true,
    // Teaching/leadership — the real differentiator from Resident.
    'delegation.open': true, 'delegation.secondOpinion': true,
    'delegation.casualReview': true, 'delegation.tumorBoard': true,
    'delegation.teaching': true, 'delegation.externalConsult': true,
    // Pool — subspecialty-bound, same as Resident.
    'pool.viewCases': true, 'pool.acceptCase': true, 'pool.passCase': true,
    'synoptic.jumpNextUnanswered': true, 'synoptic.jumpNextRequired': true,
    'synoptic.markDeferred': true, 'synoptic.confirmField': true, 'synoptic.overrideField': true,
    // Pediatric access — off by default, same as every other clinical role.
    'case.viewPediatric': false,
  },
  /**
   * Pathologists' Assistant (PA) — grossing-bench role. Note: "PA" here
   * means Pathologists' Assistant (PA(ASCP)/AAPA certified profession),
   * NOT the general-healthcare "Physician Assistant" — a completely
   * different role with prescribing authority. This system already has a
   * separate Physician role; the naming overlap is a real, common
   * confusion worth flagging explicitly rather than letting it surface
   * later as a support ticket or, worse, a misconfigured permission.
   *
   * Built primarily by analogy to Resident (closest existing case-access-
   * without-sign-out role), narrowed to grossing-bench scope: no
   * microscopic/diagnosis/sign-out access, no delegation (PA has no
   * occasion to request a second opinion or tumor board), no pool access
   * (grossing assignment is intentionally NOT routed through the existing
   * subspecialty pool-claim mechanism — see Worklist discussion), no QC
   * (Computational Sidecar review is diagnostic ancillary-test review,
   * not grossing). Has case.hold/releaseHold specifically to support the
   * SOP's identification-verification reject/hold gate.
   */
  'Pathologists Assistant': {
    'system.openMessages': true, 'system.openWorklist': true,
    'system.goBack': true, 'system.goForward': true,
    'nav.nextCase': true, 'nav.previousCase': true,
    'nav.nextTab': true, 'nav.previousTab': true,
    'table.next': true, 'table.previous': true, 'table.pageDown': true, 'table.pageUp': true,
    'table.first': true, 'table.last': true, 'table.select': true,
    'table.openSelected': true, 'table.refresh': true, 'table.search': true,
    'case.viewWorklist': true, 'case.open': true,
    'case.hold': true, 'case.releaseHold': true,
    'specimen.add': true, 'specimen.edit': true, 'specimen.remove': true,
    'specimen.applyFlag': true, 'specimen.removeFlag': true,
    'diagnosis.grossDescription': true,
    'report.preview': true, 'report.viewHistory': true, 'report.download': true,
    'ai.grossAssist': true, 'ai.macroSuggest': true,
    'ai.viewConfidence': true, 'ai.override': true,
    'editor.nextField': true, 'editor.previousField': true,
    'editor.insertMacro': true, 'editor.insertTable': true,
    'editor.bold': true, 'editor.italic': true, 'editor.underline': true,
    'editor.bullets': true, 'editor.numbering': true,
    'editor.find': true, 'editor.replace': true, 'editor.selectAll': true,
    'messages.next': true, 'messages.previous': true, 'messages.reply': true,
    'messages.delete': true, 'messages.markRead': true, 'messages.markUnread': true,
    'messages.compose': true, 'messages.send': true, 'messages.close': true,
    'messages.secureEmail': true, 'messages.recipientSearch': true, 'messages.recipientAdd': true,
    'messages.search': true, 'messages.edit': true, 'messages.restore': true,
    'messages.viewDeleted': true, 'messages.deleteAll': true,
    'messages.gotoSubject': true, 'messages.gotoBody': true,
    'messages.clearSubject': true, 'messages.clearBody': true,
    'messages.markUrgent': true,
    'physician.view': true, 'facility.view': true,
    // Synoptic Navigation — same as Resident/Pathologist; this is how a PA
    // navigates the Grossing checklist itself, same schema-driven panel
    // diagnostic synoptics use.
    'synoptic.jumpNextUnanswered': true, 'synoptic.jumpNextRequired': true,
    'synoptic.markDeferred': true, 'synoptic.confirmField': true, 'synoptic.overrideField': true,
    // Pediatric access — off by default, enabled per role by admin, same
    // as every other clinical role's default.
    'case.viewPediatric': false,
  },
  Physician: {},
  // Real, per direct follow-up on the RFP-APLIS-2026-GLOBAL
  // Intraoperative/Frozen Section Dashboard — same real, empty
  // permission set as Physician above: OR staff are directory-only,
  // real people this app needs to be able to look up and attribute a
  // quick action to (badge tap/PIN), never a real, general-app login.
  'Or Staff': {},
  // Built-in template governance roles (Batch 329, PS-63). What they may do
  // with templates is decided by role id in
  // services/templates/templatePublishingRules.ts; these sets give them the
  // Configuration access they need to reach the Synoptic Library.
  'Template Author': {
    'system.openMessages': true, 'system.goBack': true, 'system.goForward': true,
    'system.openConfiguration': true, 'config.access': true, 'config.reportTemplates': true,
  },
  'Template Approver': {
    'system.openMessages': true, 'system.goBack': true, 'system.goForward': true,
    'system.openConfiguration': true, 'config.access': true, 'config.reportTemplates': true,
  },
  'Lab Director': {
    'system.openMessages': true, 'system.goBack': true, 'system.goForward': true,
    'system.openConfiguration': true, 'config.access': true, 'config.reportTemplates': true,
    'config.auditLog': true,
  },
  // Built-in PS-355 roles (Batch 369). What they may export is decided by
  // their capabilities (services/authorization/), not by these commands.
  'QA Reviewer': {
    'system.openMessages': true, 'system.goBack': true, 'system.goForward': true,
  },
  // Batch 374: bench roles. Which screens they reach is decided by their
  // capabilities (services/authorization/capabilitySeeds.ts); these are
  // only the basic navigation commands.
  Accessioner: {
    'system.openMessages': true, 'system.openWorklist': true, 'system.goBack': true, 'system.goForward': true,
  },
  Histotechnologist: {
    'system.openMessages': true, 'system.goBack': true, 'system.goForward': true,
  },
  Cytotechnologist: {
    'system.openMessages': true, 'system.goBack': true, 'system.goForward': true,
  },
  'Molecular Technologist': {
    'system.openMessages': true, 'system.goBack': true, 'system.goForward': true,
  },
  Superadmin: Object.fromEntries(ACTION_GROUPS.flatMap(g => g.actions.map(a => [a.id, true]))) as PermissionSet,
};
