// PathScribe — DemoResetTab
// Two-level mock data reset for guest testing rounds.
//
//   Full reset    — clears everything, restores seed data for all users
//   My data only  — clears only data belonging to the current user's hospital,
//                   preserving other testers' work
//
// Both paths require a confirmation step before executing.

import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { IS_MOCK_BACKEND } from '@/services/index';

// ─── Reset utilities ──────────────────────────────────────────────────────────

const MOCK_PREFIX   = 'pathscribe_mock_';
const SESSION_KEY   = 'pathscribe-user';
// Real fix, per direct report: "reset the demo data, logged back in,
// got an 'Already signed in elsewhere' message." That marker
// (services/session/sessionSupersedeService.ts) is deliberately its
// own key namespace, not under MOCK_PREFIX and not in SESSION_KEY —
// so neither existing cleanup path ever touched it. A reset cleared
// the user's own session but left the stale active-session marker
// from before the reset sitting in localStorage; the very next login
// found that stale marker and incorrectly concluded the account was
// already signed in elsewhere. clearActiveSessionId()'s own doc
// comment already warned about exactly this failure mode ("without
// this, a perfectly normal future login would incorrectly detect a
// conflict against a stale marker nobody ever cleared") — this reset
// flow was the gap that comment was warning about.
const ACTIVE_SESSION_KEY_PREFIX = 'pathscribe_active_session_';

const VERSIONED_KEYS = [
  'pathscribe_users_version',
  'pathscribe_messages_version',
  'pathscribe_mock_cases_version',
  'pathscribe_flags_version',
  // Real fix, per direct follow-up: "make sure the demo reset is
  // covering everything." Found via a full, systematic audit of
  // every real localStorage key literal used anywhere in src/ (both
  // via mockStorage.ts's storageGet/storageSet — already covered by
  // the MOCK_PREFIX sweep below, regardless of this list — and every
  // raw localStorage.getItem/setItem call with its own, independent
  // key), cross-referenced against this file's own reset lists.
  // pathscribe_orders_seed_version is this app's own, newest example
  // of the exact failure mode this audit was looking for: a real key
  // added alongside a real feature, genuinely missed here until
  // checked directly.
  'pathscribe_orders_seed_version',
];

const SETTINGS_KEYS = [
  'specimen_dictionary',
  'container_types',
  'pathscribe_delegation_types_v2',
  'pathscribe_internal_notes_v2',
  'pathscribe_subspecialties',
  'pathscribe_report_templates',
  'pathscribe_participation_types_v2', // the real, canonical key (services/participationTypes/mockParticipationTypeService.ts)
  'pathscribe_participation_types',    // orphaned old key from ParticipationTypesSection.tsx's now-removed separate local list -- included so any stale leftover data gets cleared too
  // Added after a full audit of every storageGet/storageSet key across
  // services/ against this list -- these 16 real service storage keys
  // were previously missing entirely, meaning this data silently
  // survived a "Demo Reset". Deliberately NOT included:
  // pathscribe_audit_logs / pathscribe_error_logs (shouldn't reset with
  // demo data -- an audit trail and error log surviving a demo reset is
  // the correct behavior, not a gap). Same real reasoning, found and
  // deliberately excluded during the later, full audit below:
  // ps_ai_audit_log_v1 (a genuine AI-decision audit trail, not demo
  // state).
  'pathscribe_roles',
  'pathscribe_users',
  'pathscribe_clients',
  'pathscribe_physicians',
  'pathscribe_protocols',
  'pathscribe_macros',
  'pathscribe_fonts',
  'pathscribe_models',
  'pathscribe_deficiency_types',
  'pathscribe_resolution_types',
  'pathscribe_specimen_categories',
  'pathscribe_specimen_crosswalk',
  'pathscribe_specimen_deficiencies',
  'pathscribe_grossing_routing_overrides',
  'pathscribe_incoming_orders',
  'pathscribe_management_reviews',

  // ── Real fix, per direct follow-up: "make sure the demo reset is
  //    covering everything." Every key below was found via the same
  //    full, systematic audit as VERSIONED_KEYS's own new entry —
  //    real, live, mutable app/admin/demo state with no existing
  //    reset coverage at all until now. Grouped by real feature area
  //    for readability, not because the reset logic treats them any
  //    differently — remove() runs the exact same way for all of
  //    them. ──
  // AI config/learning
  'pathscribe_ai_org_config', 'pathscribe_ai_user_config',
  'pathscribe_narrative_signals_v2', 'pathscribe_template_suggestion_signals_v1',
  'ps_ai_behavior_config_v1', 'ps_dictation_corrections',
  // Scan station selection/prompt state — real, per-device demo state
  // (which physical bench a tester is "at" right now), not a genuine
  // user preference worth surviving a reset.
  'pathscribe_current_scan_station_id', 'pathscribe_scan_station_prompted',
  // MPI (Master Patient Index) demo records
  'pathscribe_mpi_identifiers', 'pathscribe_mpi_links', 'pathscribe_mpi_records',
  // Template/case routing config
  'pathscribe_routing_rules_v1', 'pathscribe_routing_config', 'pathscribe_routing_rules',
  'ps_registry_overrides_v1', 'ps_case_registries_v1', 'ps_case_number_series_v1',
  // Validation studies, research feed
  'pathscribe_validation_studies_v1',
  'pathscribe_pubmed_ticker_backoff', 'pathscribe_pubmed_ticker_cache', 'pathscribe_research_feed_config', 'pathscribe_research_feed_health',
  // Org-level config toggles/settings
  'pathscribe_orchestrator_mode', 'pathscribe_idle_timeout_minutes',
  'pathscribe_release_buffer_org_config',
  'pathscribe_org_document_style_footer', 'pathscribe_org_document_style_header', 'pathscribe_org_document_style_body',
  'pathscribe_governing_bodies', 'pathscribe_tat_entries_v2', 'pathscribe_retention_policy',
  'pathscribe_external_resources', 'pathscribe_encounters',
  // Real feature, per direct follow-up: dispatched-event log for the
  // Interface Engine STUB (no real engine wired yet, per that
  // module's own header) — simulated dispatch history, not a genuine
  // compliance audit trail, so it resets like any other demo data.
  'pathscribe_interface_engine_dispatched_events',
  'pathscribe_ai_feedback',
  // Action registry, claims, delegation
  'ps_action_registry', 'ps_claims_v1', 'ps_delegations_v1', 'ps_enhancement_config_v1', 'ps_editor_store_v1',
  // Biometric demo credentials/policy/session — same real "clears
  // like SESSION_KEY" reasoning, not real production auth data.
  'ps_biometric_credentials', 'ps_biometric_policy', 'ps_biometric_session', 'ps_biometric_wizard_dismissed',
  'pathscribe_own_session_id',
  // Real, system-wide config (jurisdiction and related settings —
  // RetentionPolicy.ts's own getCurrentJurisdiction()) and a second,
  // separate current-user cache (Config/AI/index.tsx) distinct from
  // the real SESSION_KEY this file already clears below.
  'pathscribe_system_config_v2', 'pathscribe_current_user',
];

const CASE_KEYS = [
  'cases', // CRITICAL FIX: was 'ps_cases', which mockCaseService.ts never actually wrote to — Demo Reset had never actually been clearing primary case data
  'orch_cases_v3',
  // Found via a full storageGet/storageSet audit across services/ that
  // wasn't limited to the pathscribe_ prefix (that earlier, narrower
  // search is exactly how 'cases' and everything below was missed):
  'discordance_records',
  'amendment_records',
  'report_version_records',
  'lis_amendment_notices',
  'intraop_entries',
  'pathscribe_drafts',
];

const FLAG_KEYS = [
  'pathscribe_flags',
  'pathscribe_flags_v2',
];

const STATE_KEYS = [
  'pathscribe_ped_requested',
  'pathscribe_orch_requested',
  'ps_learned_triggers',
  // Real fix, per direct follow-up: "make sure the demo reset is
  // covering everything." Minor, UI-level preference/state keys —
  // included anyway for a genuinely clean, predictable baseline
  // (per direct follow-up's own "returns everything to a test ready
  // position"), not because any one of these is high-stakes on its
  // own.
  'pathscribe-tab-width', 'pathscribe_header_compact_manual', 'pathscribe_voice_accent',
  'pathscribe:desktopViewOverride', 'ps_sidebar_collapsed', 'ps_preview_margins', 'ps_preview_page_size',
  'pathscribe:savedSearches', 'pathscribe:lastSearch', 'ps_post_signout_pref',
  'pathscribe_show_superseded_notice', 'pathscribe_footpedal_bindings', 'ps_voice_ai_available',
];

// Hospital → user mapping (mirrors mockCaseService USER_HOSPITAL_MAP)
const HOSPITAL_MAP: Record<string, string> = {
  'PATH-001':    'HOSP-001',   // Pete Nimmo — US demo
  'PATH-UK-001': 'HOSP-MFT',  // Paul Carter   — UK
  'PATH-UK-002': 'HOSP-MFT',
  'PATH-US-001': 'HOSP-MPA',  // Amber Fehrs-Battey — US
  'PATH-US-002': 'HOSP-HFHS',  // J. Mark Tuthill
  'PATH-RB-001': 'HOSP-RB',    // Rossana Babakhani
};

/** Read current user id from localStorage session */
function getCurrentUserId(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id ?? parsed?.userId ?? null;
  } catch {
    return null;
  }
}

/** Full reset — clears all mock data for all users */
function executeFullReset(): string[] {
  // Real, critical, defense-in-depth safety check — per direct
  // follow-up: "The system cannot ever delete/reset a customer's
  // actual database entries." Never trust the UI's own disabled-button
  // state alone (a real, separate future entry point — a dev console
  // call, a different, unguarded UI surface — could bypass that);
  // this function itself refuses outright the moment this app is ever
  // cut over to a real, production backend. See services/index.ts's
  // own IS_MOCK_BACKEND doc comment for the full reasoning.
  if (!IS_MOCK_BACKEND) {
    throw new Error('Demo Reset is disabled — this app is connected to a real, non-mock backend. Refusing to risk deleting real customer data.');
  }
  const cleared: string[] = [];
  const remove = (k: string) => {
    if (localStorage.getItem(k) !== null) {
      localStorage.removeItem(k);
      cleared.push(k);
    }
  };

  VERSIONED_KEYS.forEach(remove);
  SETTINGS_KEYS.forEach(remove);
  CASE_KEYS.forEach(remove);
  FLAG_KEYS.forEach(remove);
  STATE_KEYS.forEach(remove);
  remove(SESSION_KEY);

  Object.keys(localStorage)
    .filter(k => k.startsWith(MOCK_PREFIX))
    .forEach(k => { localStorage.removeItem(k); cleared.push(k); });

  // Real fix — see ACTIVE_SESSION_KEY_PREFIX's own comment above for
  // why this needs its own sweep, separate from the MOCK_PREFIX one.
  Object.keys(localStorage)
    .filter(k => k.startsWith(ACTIVE_SESSION_KEY_PREFIX))
    .forEach(k => { localStorage.removeItem(k); cleared.push(k); });

  // Real fix, per direct follow-up: "make sure the demo reset is
  // covering everything." Same real reasoning as the
  // ACTIVE_SESSION_KEY_PREFIX sweep immediately above — these two
  // real key families are built per-case/per-report at runtime
  // (ps_rpart_ — Report Part Builder's own per-part draft storage;
  // ps_orch_sections_ — Orchestrator draft sections, keyed by real
  // caseId), never a single, fixed key name a literal list could
  // ever fully enumerate.
  Object.keys(localStorage)
    .filter(k => k.startsWith('ps_rpart_') || k.startsWith('ps_orch_sections_'))
    .forEach(k => { localStorage.removeItem(k); cleared.push(k); });

  sessionStorage.clear();
  return cleared;
}

/**
 * Partial reset — removes only the current user's cases from the mock case
 * store, then forces a version bump so their cases re-seed from defaults.
 * Other users' work is preserved.
 */
function executeUserReset(userId: string): string[] {
  // Same real, critical, defense-in-depth guard as executeFullReset —
  // see that function's own comment for the full reasoning.
  if (!IS_MOCK_BACKEND) {
    throw new Error('Demo Reset is disabled — this app is connected to a real, non-mock backend. Refusing to risk deleting real customer data.');
  }
  const cleared: string[] = [];
  const hospitalId = HOSPITAL_MAP[userId];

  // Load and filter the cases store
  const casesKey = `${MOCK_PREFIX}cases`;
  const raw = localStorage.getItem(casesKey);
  if (raw) {
    try {
      const cases = JSON.parse(raw);
      const filtered = cases.filter(
        (c: any) => c.originHospitalId !== hospitalId && c.hospitalId !== hospitalId
      );
      if (filtered.length !== cases.length) {
        localStorage.setItem(casesKey, JSON.stringify(filtered));
        cleared.push(`${casesKey} (removed ${cases.length - filtered.length} cases)`);
      }
    } catch {
      // If corrupt, remove the whole store — it will re-seed
      localStorage.removeItem(casesKey);
      cleared.push(casesKey);
    }
  }

  // Clear the cases version so the full seed re-runs on next load
  // (seed data is additive — it won't duplicate cases already present)
  localStorage.removeItem('pathscribe_mock_cases_version');
  cleared.push('pathscribe_mock_cases_version (version reset)');

  // Real fix — same gap as executeFullReset above, scoped correctly
  // here: only this user's own marker, since other testers' sessions
  // must survive a "my data only" reset.
  const ownActiveSessionKey = `${ACTIVE_SESSION_KEY_PREFIX}${userId}`;
  if (localStorage.getItem(ownActiveSessionKey) !== null) {
    localStorage.removeItem(ownActiveSessionKey);
    cleared.push(ownActiveSessionKey);
  }

  // Clear any user-specific session state
  sessionStorage.clear();
  cleared.push('sessionStorage');

  return cleared;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Mode    = 'full' | 'user';
type UIState = 'idle' | 'confirm-full' | 'confirm-user' | 'done';

interface ResetResult { mode: Mode; cleared: string[]; }

const DemoResetTab: React.FC = () => {
  const [uiState,    setUiState]    = useState<UIState>('idle');
  const [result,     setResult]     = useState<ResetResult | null>(null);
  const [userId,     setUserId]     = useState<string | null>(null);
  const [countdown,  setCountdown]  = useState(3);

  useEffect(() => {
    setUserId(getCurrentUserId());
  }, []);

  // Countdown before redirect after reset
  useEffect(() => {
    if (uiState !== 'done') return;
    if (countdown <= 0) { window.location.href = '/worklist'; return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [uiState, countdown]);

  const handleFullReset = () => {
    const cleared = executeFullReset();
    setResult({ mode: 'full', cleared });
    setUiState('done');
  };

  const handleUserReset = () => {
    if (!userId) return;
    const cleared = executeUserReset(userId);
    setResult({ mode: 'user', cleared });
    setUiState('done');
    setCountdown(3);
  };

  const hospitalId = userId ? HOSPITAL_MAP[userId] : null;
  const hospitalLabel: Record<string, string> = {
    'HOSP-001': 'PathScribe Demo (Pete Nimmo)',
    'HOSP-MFT': 'Manchester Foundation Trust (Paul Carter)',
    'HOSP-MPA': 'Midwest Pathology Associates (Amber Fehrs-Battey)',
    'HOSP-HFHS': 'Henry Ford Health System (J. Mark Tuthill)',
    'HOSP-RB':    'PathScribe Review (Rossana Babakhani)',
  };

  // ── Confirmation dialogs ──────────────────────────────────────────────────
  const ConfirmDialog = ({
    title, description, warning, onConfirm, onCancel, confirmLabel, confirmColor,
  }: {
    title: string; description: string; warning: string;
    onConfirm: () => void; onCancel: () => void;
    confirmLabel: string; confirmColor: string;
  }) => (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" style={{
      background: 'rgba(0,0,0,0.2)', border: '1px solid var(--ps-conf-border)',
      borderRadius: 8, padding: '20px 24px', marginTop: 16,
    }}>
      <h4 id="confirm-dialog-title" style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>{title}</h4>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--ps-conf-text-3)', lineHeight: 1.6 }}>
        {description}
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#f87171', lineHeight: 1.6 }}>
        ⚠ {warning}
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="ps-conf-btn-secondary" onClick={onCancel}>Cancel</button>
        <button
          onClick={onConfirm}
          className={confirmColor === '#dc2626' ? 'ps-btn-danger-solid' : 'ps-btn-primary'}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );

  // ── Done state ────────────────────────────────────────────────────────────
  // ── Real, critical safety gate — per direct follow-up: "The system
  //    cannot ever delete/reset a customer's actual database
  //    entries." Takes precedence over every other UI state in this
  //    component, including an in-progress confirmation dialog — if
  //    this app is ever connected to a real, non-mock backend, no
  //    path through this component should ever reach a destructive
  //    action. See services/index.ts's own IS_MOCK_BACKEND doc
  //    comment for the full reasoning. ──
  if (!IS_MOCK_BACKEND) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 0' }}>
        <div className="ps-reset-disabled">
          <div className="ps-reset-disabled__title">⛔ Demo Reset is disabled</div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ps-conf-text-3)', lineHeight: 1.6 }}>
            This app is connected to a real, non-mock backend. Demo Reset only ever operates on
            ForMedrixAI's own local verification/validation test data — it refuses to run at all
            once real customer data could exist, rather than risk deleting it.
          </p>
        </div>
      </div>
    );
  }

  if (uiState === 'done' && result) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 0' }}>
        <div className="ps-reset-success">
          <div className="ps-reset-success__title">
            ✓ {result.mode === 'full' ? 'Full reset complete' : 'Your data has been reset'}
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ps-conf-text-3)' }}>
            {result.cleared.length} item{result.cleared.length !== 1 ? 's' : ''} cleared.
            Redirecting to Worklist in {countdown}s…
          </p>
          <div style={{ fontSize: 11, color: 'var(--ps-conf-text-3)', fontFamily: 'monospace', lineHeight: 1.8 }}>
            {result.cleared.map(k => <div key={k}>✓ {k}</div>)}
          </div>
        </div>
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 0' }}>

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>Demo Data Reset</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ps-conf-text-3)', lineHeight: 1.6 }}>
          Restore mock data to a clean baseline without requiring developer access.
          Choose between resetting only your data or performing a full system reset.
        </p>
      </div>

      {/* ── Option 1: My data only ── */}
      <div className="comp-reset-card comp-reset-card--user">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div className="comp-reset-card-title">
              Reset my data only
            </div>
            <div className="comp-reset-card-desc">
              Removes your cases and restores your seed data. Other testers' work is preserved.
            </div>
            {hospitalId && (
              <div className="comp-reset-hospital-label">
                Your hospital: {hospitalLabel[hospitalId] ?? hospitalId}
              </div>
            )}
          </div>
          <button
            className="ps-conf-btn-secondary"
            disabled={!userId || uiState === 'confirm-full'}
            onClick={() => { setUiState('confirm-user'); setCountdown(3); }}
            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            Reset my data…
          </button>
        </div>

        {uiState === 'confirm-user' && (
          <ConfirmDialog
            title="Reset your data?"
            description={`This will remove all cases for ${hospitalLabel[hospitalId ?? ''] ?? 'your hospital'} and restore them to the demo seed. Your flag configurations are not affected.`}
            warning="This cannot be undone. The page will reload automatically."
            confirmLabel="Yes, reset my data"
            confirmColor="#0891B2"
            onConfirm={handleUserReset}
            onCancel={() => setUiState('idle')}
          />
        )}
      </div>

      {/* ── Option 2: Full reset ── */}
      <div className="comp-reset-card comp-reset-card--full">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div className="comp-reset-card-title">
              Full reset
            </div>
            <div className="comp-reset-card-desc">
              Clears all mock data for all users — cases, flags, messages, session, and UI state.
              Use this to restore a completely clean baseline before a new testing session.
            </div>
            <div className="comp-reset-card-warning">
              Affects all testers. Use sparingly.
            </div>
          </div>
          <button
            disabled={uiState === 'confirm-user'}
            onClick={() => setUiState('confirm-full')}
            style={{
              flexShrink: 0, whiteSpace: 'nowrap',
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: 6, color: '#f87171', cursor: 'pointer',
              opacity: uiState === 'confirm-user' ? 0.4 : 1,
            }}
          >
            Full reset…
          </button>
        </div>

        {uiState === 'confirm-full' && (
          <ConfirmDialog
            title="Full reset — are you sure?"
            description="This will clear all mock data for every user including cases, flag configurations, messages, and sessions. All testers will lose their current state."
            warning="This affects Paul, Amber, and Sarah. All work in progress will be lost."
            confirmLabel="Yes, reset everything"
            confirmColor="#dc2626"
            onConfirm={handleFullReset}
            onCancel={() => setUiState('idle')}
          />
        )}
      </div>

    </div>
  );
};

export default DemoResetTab;
