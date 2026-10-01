import { ServiceResult, ID } from '../types';

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditLogType = 'ai' | 'user' | 'system';

export interface AuditLog {
  id:         ID;
  timestamp:  string;            // ISO-like 'YYYY-MM-DD HH:mm:ss'
  type:       AuditLogType;
  event:      string;
  detail:     string;            // PHI-safe: no patient names, DOB, MRN, or clinical values
  user:       string;            // display name of acting user or system actor
  caseId:     string | null;     // accession number — not a direct patient identifier
  confidence: number | null;     // AI confidence % where applicable
  /**
   * Real feature, per direct specification: Post-Sign-Out Release
   * Buffer, Phase 5 (spec §18a — audit entries need "facility IDs").
   * Optional, additive — genuinely absent (not backfilled) for the
   * many real, pre-existing audit call sites across this app that
   * don't populate it. Deliberately NOT paired with a client IP
   * address field — see services/reportRelease/README.md's own,
   * honest explanation of why a frontend-only app can't capture that
   * field truthfully, and why faking or permanently-nulling it would
   * be worse than not having the field at all.
   */
  facilityId?: string | null;
  /**
   * Real feature, per direct follow-up: "when we are tracking
   * actions, I don't believe we include the physical location of
   * that action, just the person - Correct?" Confirmed directly, then
   * fixed here — same real, additive shape as facilityId immediately
   * above, one level more granular (which bench/station WITHIN that
   * facility, not just which building). Auto-populated by
   * auditLogger.ts's own logEvent() bridge (getEffectiveScanStationId(),
   * utils/effectiveScanStation.ts) — genuinely absent, not backfilled,
   * for any audit entry recorded before this field existed.
   */
  stationId?: string | null;
}

export type NewAuditLog = Omit<AuditLog, 'id' | 'timestamp'>;

// ─── Error Log ────────────────────────────────────────────────────────────────

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ErrorLog {
  id:        ID;
  timestamp: string;
  severity:  ErrorSeverity;
  code:      string;
  message:   string;
  source:    string;
  caseId:    string | null;
  resolved:  boolean;
}

export type NewErrorLog = Omit<ErrorLog, 'id' | 'timestamp' | 'resolved'>;

// ─── Filter Params ────────────────────────────────────────────────────────────

export interface AuditFilterParams {
  type?:      AuditLogType | 'all';
  user?:      string;            // display name or 'all'
  dateFrom?:  string;            // 'YYYY-MM-DD'
  dateTo?:    string;            // 'YYYY-MM-DD'
  search?:    string;
}

export interface ErrorFilterParams {
  severity?:  ErrorSeverity | 'all';
  resolved?:  boolean | 'all';
  search?:    string;
}

// ─── Service Interface ────────────────────────────────────────────────────────

export interface IAuditService {
  // Audit log
  getAuditLogs(filters?: AuditFilterParams): Promise<ServiceResult<AuditLog[]>>;
  logEvent(entry: NewAuditLog):              Promise<ServiceResult<AuditLog>>;

  // Error log
  getErrorLogs(filters?: ErrorFilterParams): Promise<ServiceResult<ErrorLog[]>>;
  logError(entry: NewErrorLog):              Promise<ServiceResult<ErrorLog>>;
  resolveError(id: ID):                      Promise<ServiceResult<ErrorLog>>;
}
