import { ServiceResult } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import { getEffectiveScanStationId } from '../../utils/effectiveScanStation';
import type {
  AuditLog, ErrorLog,
  AuditFilterParams, ErrorFilterParams,
  IAuditService,
} from './IAuditService';

// ─── Timestamp helper ─────────────────────────────────────────────────────────

function ts(daysBack: number, h: number, m: number, s = 0): string {
  const dt = new Date();
  // eslint-disable-next-line no-restricted-properties -- Real, honest justification: generates a FAKE, illustrative timestamp for seeded audit-log demo data ("N days ago from right now, at a given hour/minute"), not bucketing a real, stored clinical event by facility timezone. Result is a real, absolute UTC instant regardless of runtime timezone.
  dt.setDate(dt.getDate() - daysBack);
  dt.setHours(h, m, s, 0);
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

function nowTs(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ─── Seed Data ────────────────────────────────────────────────────────────────
// PHI-safe: no patient names, DOB, MRN, or clinical measurement values.
// Accession numbers (S26-xxxx) are retained — they are not direct patient identifiers.

const SEED_AUDIT_LOGS: AuditLog[] = [
  // Today
  { id: 'al-01',  timestamp: ts(0,  9, 42), type: 'ai',     event: 'Synoptic Generated', detail: 'AI generated synoptic v1 using CAP Breast Invasive protocol',          user: 'System (AI)',         caseId: 'S26-4401', confidence: 94   },
  { id: 'al-02',  timestamp: ts(0,  9, 43), type: 'user',   event: 'Field Updated',       detail: 'Synoptic field "Tumour Size" updated',                                  user: 'Dr. Sarah Johnson',   caseId: 'S26-4401', confidence: null },
  { id: 'al-03',  timestamp: ts(0,  9, 45), type: 'user',   event: 'Synoptic Finalized',  detail: 'Synoptic report finalized and signed',                                   user: 'Dr. Sarah Johnson',   caseId: 'S26-4401', confidence: null },
  { id: 'al-04',  timestamp: ts(0,  8, 31), type: 'ai',     event: 'Protocol Selected',   detail: 'AI auto-selected CAP Colon Resection protocol',                          user: 'System (AI)',         caseId: 'S26-4402', confidence: 91   },
  { id: 'al-05',  timestamp: ts(0,  8, 29), type: 'system', event: 'LIS Sync',            detail: 'Microscopic description received from LIS',                              user: 'System (LIS)',        caseId: 'S26-4402', confidence: null },
  { id: 'al-06',  timestamp: ts(0,  8, 15), type: 'ai',     event: 'Synoptic Updated',    detail: 'AI updated synoptic v2 after microscopic findings ingested',             user: 'System (AI)',         caseId: 'S26-4400', confidence: 88   },
  { id: 'al-07',  timestamp: ts(0,  7, 55), type: 'system', event: 'User Login',          detail: 'User authenticated successfully',                                         user: 'Dr. Sarah Johnson',   caseId: null,       confidence: null },
  { id: 'al-08',  timestamp: ts(0,  7, 44), type: 'system', event: 'User Login',          detail: 'User authenticated successfully',                                         user: 'Dr. Michael Chen',    caseId: null,       confidence: null },
  { id: 'al-09',  timestamp: ts(0,  7, 30), type: 'ai',     event: 'Protocol Selected',   detail: 'AI auto-selected CAP Lung Resection protocol',                           user: 'System (AI)',         caseId: 'S26-4403', confidence: 97   },
  { id: 'al-10',  timestamp: ts(0,  7,  5), type: 'system', event: 'LIS Sync',            detail: 'Gross description received from LIS',                                    user: 'System (LIS)',        caseId: 'S26-4403', confidence: null },
  // Yesterday
  { id: 'al-11',  timestamp: ts(1, 16, 22), type: 'ai',     event: 'Synoptic Generated',  detail: 'AI generated synoptic v1 using CAP Lung Resection protocol',             user: 'System (AI)',         caseId: 'S26-4398', confidence: 92   },
  { id: 'al-12',  timestamp: ts(1, 16, 30), type: 'user',   event: 'Field Updated',        detail: 'Synoptic field "Histologic Type" updated',                               user: 'Dr. Emily Rodriguez', caseId: 'S26-4398', confidence: null },
  { id: 'al-13',  timestamp: ts(1, 15, 11), type: 'user',   event: 'Synoptic Finalized',  detail: 'Synoptic report finalized and signed',                                   user: 'Dr. Emily Rodriguez', caseId: 'S26-4395', confidence: null },
  { id: 'al-14',  timestamp: ts(1, 14, 55), type: 'system', event: 'LIS Sync',            detail: 'Gross description received from LIS',                                    user: 'System (LIS)',        caseId: 'S26-4398', confidence: null },
  { id: 'al-15',  timestamp: ts(1, 14,  2), type: 'user',   event: 'Protocol Changed',    detail: 'Protocol changed from CAP Prostate Biopsy to CAP Prostatectomy',         user: 'Dr. Michael Chen',    caseId: 'S26-4396', confidence: null },
  { id: 'al-16',  timestamp: ts(1, 13, 40), type: 'ai',     event: 'Protocol Selected',   detail: 'AI auto-selected CAP Thyroid protocol',                                  user: 'System (AI)',         caseId: 'S26-4397', confidence: 96   },
  { id: 'al-17',  timestamp: ts(1, 12, 18), type: 'user',   event: 'Comment Added',        detail: 'Pathologist comment added to synoptic draft',                            user: 'Dr. James Okafor',    caseId: 'S26-4394', confidence: null },
  { id: 'al-18',  timestamp: ts(1, 11,  5), type: 'ai',     event: 'Synoptic Generated',  detail: 'AI generated synoptic v1 using CAP Prostatectomy protocol',              user: 'System (AI)',         caseId: 'S26-4396', confidence: 89   },
  { id: 'al-19',  timestamp: ts(1, 10, 50), type: 'system', event: 'LIS Sync',            detail: 'Microscopic description received from LIS',                              user: 'System (LIS)',        caseId: 'S26-4396', confidence: null },
  { id: 'al-20',  timestamp: ts(1,  8,  1), type: 'system', event: 'User Login',          detail: 'User authenticated successfully',                                         user: 'Dr. Emily Rodriguez', caseId: null,       confidence: null },
  // 2 days ago
  { id: 'al-21',  timestamp: ts(2, 15, 33), type: 'ai',     event: 'Synoptic Generated',  detail: 'AI generated synoptic v1 using CAP Colorectal Resection protocol',       user: 'System (AI)',         caseId: 'S26-4390', confidence: 87   },
  { id: 'al-22',  timestamp: ts(2, 15, 40), type: 'user',   event: 'Field Updated',        detail: 'Synoptic field "Margins" updated',                                       user: 'Dr. Priya Nair',      caseId: 'S26-4390', confidence: null },
  { id: 'al-23',  timestamp: ts(2, 14, 22), type: 'user',   event: 'Synoptic Finalized',  detail: 'Synoptic report finalized and signed',                                   user: 'Dr. Priya Nair',      caseId: 'S26-4390', confidence: null },
  { id: 'al-24',  timestamp: ts(2, 13, 10), type: 'system', event: 'LIS Sync',            detail: 'Gross description received from LIS',                                    user: 'System (LIS)',        caseId: 'S26-4391', confidence: null },
  { id: 'al-25',  timestamp: ts(2, 12, 55), type: 'ai',     event: 'Protocol Selected',   detail: 'AI auto-selected CAP Kidney Resection protocol',                         user: 'System (AI)',         caseId: 'S26-4391', confidence: 93   },
  { id: 'al-26',  timestamp: ts(2, 11, 44), type: 'user',   event: 'Protocol Changed',    detail: 'Protocol changed from CAP Bladder to CAP Kidney Resection',              user: 'Dr. James Okafor',    caseId: 'S26-4389', confidence: null },
  { id: 'al-27',  timestamp: ts(2, 10, 30), type: 'ai',     event: 'Synoptic Updated',    detail: 'AI updated synoptic v3 after additional gross findings ingested',        user: 'System (AI)',         caseId: 'S26-4388', confidence: 85   },
  { id: 'al-28',  timestamp: ts(2,  9, 15), type: 'system', event: 'User Login',          detail: 'User authenticated successfully',                                         user: 'Dr. James Okafor',    caseId: null,       confidence: null },
  { id: 'al-29',  timestamp: ts(2,  9,  2), type: 'system', event: 'User Login',          detail: 'User authenticated successfully',                                         user: 'Dr. Priya Nair',      caseId: null,       confidence: null },
  { id: 'al-30',  timestamp: ts(2,  8, 50), type: 'user',   event: 'Synoptic Finalized',  detail: 'Synoptic report finalized and signed',                                   user: 'Dr. James Okafor',    caseId: 'S26-4385', confidence: null },
  // 3–4 days ago
  { id: 'al-31',  timestamp: ts(3, 16, 10), type: 'ai',     event: 'Synoptic Generated',  detail: 'AI generated synoptic v1 using CAP Endometrium protocol',                user: 'System (AI)',         caseId: 'S26-4382', confidence: 90   },
  { id: 'al-32',  timestamp: ts(3, 15, 55), type: 'user',   event: 'Field Updated',        detail: 'Synoptic field "Grade" updated',                                         user: 'Dr. Sarah Johnson',   caseId: 'S26-4382', confidence: null },
  { id: 'al-33',  timestamp: ts(3, 14, 44), type: 'system', event: 'LIS Sync',            detail: 'Final pathology text received from LIS',                                 user: 'System (LIS)',        caseId: 'S26-4382', confidence: null },
  { id: 'al-34',  timestamp: ts(3, 13, 30), type: 'user',   event: 'Synoptic Finalized',  detail: 'Synoptic report finalized and signed',                                   user: 'Dr. Sarah Johnson',   caseId: 'S26-4382', confidence: null },
  { id: 'al-35',  timestamp: ts(3, 11, 20), type: 'ai',     event: 'Protocol Selected',   detail: 'AI auto-selected CAP Cervix Resection protocol',                         user: 'System (AI)',         caseId: 'S26-4380', confidence: 88   },
  { id: 'al-36',  timestamp: ts(3, 10,  8), type: 'system', event: 'User Login',          detail: 'User authenticated successfully',                                         user: 'Dr. Michael Chen',    caseId: null,       confidence: null },
  { id: 'al-37',  timestamp: ts(4, 15, 48), type: 'ai',     event: 'Synoptic Generated',  detail: 'AI generated synoptic v1 using CAP Bladder Resection protocol',          user: 'System (AI)',         caseId: 'S26-4375', confidence: 86   },
  { id: 'al-38',  timestamp: ts(4, 15,  0), type: 'user',   event: 'Field Updated',        detail: 'Synoptic field "Pathologic Stage" updated',                              user: 'Dr. Michael Chen',    caseId: 'S26-4375', confidence: null },
  { id: 'al-39',  timestamp: ts(4, 14, 12), type: 'user',   event: 'Comment Added',        detail: 'Pathologist comment added to synoptic draft',                            user: 'Dr. Emily Rodriguez', caseId: 'S26-4374', confidence: null },
  { id: 'al-40',  timestamp: ts(4, 10, 30), type: 'system', event: 'LIS Sync',            detail: 'Microscopic description received from LIS',                              user: 'System (LIS)',        caseId: 'S26-4375', confidence: null },
  // 5–7 days ago
  { id: 'al-41',  timestamp: ts(5, 16, 45), type: 'ai',     event: 'Synoptic Generated',  detail: 'AI generated synoptic v1 using CAP Prostatectomy protocol',              user: 'System (AI)',         caseId: 'S26-4370', confidence: 95   },
  { id: 'al-42',  timestamp: ts(5, 16, 50), type: 'user',   event: 'Field Updated',        detail: 'Synoptic field "Extraprostatic Extension" updated',                      user: 'Dr. Priya Nair',      caseId: 'S26-4370', confidence: null },
  { id: 'al-43',  timestamp: ts(5, 15, 33), type: 'user',   event: 'Synoptic Finalized',  detail: 'Synoptic report finalized and signed',                                   user: 'Dr. Priya Nair',      caseId: 'S26-4370', confidence: null },
  { id: 'al-44',  timestamp: ts(5, 14, 20), type: 'system', event: 'LIS Sync',            detail: 'Gross description received from LIS',                                    user: 'System (LIS)',        caseId: 'S26-4368', confidence: null },
  { id: 'al-45',  timestamp: ts(5,  9, 10), type: 'system', event: 'User Login',          detail: 'User authenticated successfully',                                         user: 'Dr. Priya Nair',      caseId: null,       confidence: null },
  { id: 'al-46',  timestamp: ts(6, 14, 33), type: 'ai',     event: 'Protocol Selected',   detail: 'AI auto-selected CAP Melanoma protocol',                                 user: 'System (AI)',         caseId: 'S26-4365', confidence: 91   },
  { id: 'al-47',  timestamp: ts(6, 13, 55), type: 'user',   event: 'Protocol Changed',    detail: 'Protocol changed from CAP Skin BCC to CAP Melanoma',                     user: 'Dr. James Okafor',    caseId: 'S26-4365', confidence: null },
  { id: 'al-48',  timestamp: ts(6, 12, 10), type: 'ai',     event: 'Synoptic Generated',  detail: 'AI generated synoptic v1 using CAP Melanoma protocol',                   user: 'System (AI)',         caseId: 'S26-4365', confidence: 84   },
  { id: 'al-49',  timestamp: ts(6, 11, 44), type: 'system', event: 'LIS Sync',            detail: 'Microscopic description received from LIS',                              user: 'System (LIS)',        caseId: 'S26-4365', confidence: null },
  { id: 'al-50',  timestamp: ts(7, 16,  5), type: 'user',   event: 'Synoptic Finalized',  detail: 'Synoptic report finalized and signed',                                   user: 'Dr. James Okafor',    caseId: 'S26-4360', confidence: null },
  // 8–14 days ago
  { id: 'al-51',  timestamp: ts(8,  10, 20), type: 'ai',    event: 'Synoptic Generated',  detail: 'AI generated synoptic v1 using CAP Ovary protocol',                      user: 'System (AI)',         caseId: 'S26-4355', confidence: 90   },
  { id: 'al-52',  timestamp: ts(8,  10, 35), type: 'user',  event: 'Field Updated',        detail: 'Synoptic field "Histologic Type" updated',                               user: 'Dr. Sarah Johnson',   caseId: 'S26-4355', confidence: null },
  { id: 'al-53',  timestamp: ts(9,  14, 12), type: 'system',event: 'LIS Sync',            detail: 'Final pathology text received from LIS',                                 user: 'System (LIS)',        caseId: 'S26-4350', confidence: null },
  { id: 'al-54',  timestamp: ts(10, 11, 44), type: 'ai',    event: 'Protocol Selected',   detail: 'AI auto-selected CAP Lymph Node protocol',                               user: 'System (AI)',         caseId: 'S26-4345', confidence: 93   },
  { id: 'al-55',  timestamp: ts(11,  9, 30), type: 'user',  event: 'Comment Added',        detail: 'Pathologist comment added to synoptic draft',                            user: 'Dr. Emily Rodriguez', caseId: 'S26-4340', confidence: null },
  { id: 'al-56',  timestamp: ts(12, 15, 55), type: 'user',  event: 'Synoptic Finalized',  detail: 'Synoptic report finalized and signed',                                   user: 'Dr. Michael Chen',    caseId: 'S26-4338', confidence: null },
  { id: 'al-57',  timestamp: ts(13, 10, 10), type: 'ai',    event: 'Synoptic Updated',    detail: 'AI updated synoptic v2 after additional LIS data ingested',              user: 'System (AI)',         caseId: 'S26-4330', confidence: 82   },
  { id: 'al-58',  timestamp: ts(14, 16, 22), type: 'system',event: 'User Login',          detail: 'User authenticated successfully',                                         user: 'Dr. Sarah Johnson',   caseId: null,       confidence: null },
  { id: 'al-59',  timestamp: ts(14,  8, 55), type: 'ai',    event: 'Protocol Selected',   detail: 'AI auto-selected CAP Soft Tissue protocol',                              user: 'System (AI)',         caseId: 'S26-4325', confidence: 88   },
  { id: 'al-60',  timestamp: ts(14,  8,  0), type: 'system',event: 'LIS Sync',            detail: 'Gross description received from LIS',                                    user: 'System (LIS)',        caseId: 'S26-4325', confidence: null },

  // ── Pediatric Access Control Events ─────────────────────────────────────────
  { id: 'al-61',  timestamp: ts(0,  8,  5), type: 'system', event: 'Pediatric Access Denied',    detail: 'Case MPA26-1007-PED opened by Dr. Amber Fehrs-Battey — blocked: patient age 8 below Metro General Hospital pediatric threshold (18). User lacks canViewPediatric permission.', user: 'Dr. Amber Fehrs-Battey', caseId: 'MPA26-1007-PED', confidence: null },
  { id: 'al-62',  timestamp: ts(0,  8,  6), type: 'system', event: 'Pediatric Access Requested', detail: 'Dr. Amber Fehrs-Battey requested Pediatric Access permission for case MPA26-1007-PED (patient age 8). Request sent to System Admin.',                                            user: 'Dr. Amber Fehrs-Battey', caseId: 'MPA26-1007-PED', confidence: null },
];

const SEED_ERROR_LOGS: ErrorLog[] = [
  { id: 'el-01', timestamp: ts(0,  9,  1), severity: 'error',   code: 'LIS-503',       message: 'LIS connection timeout after 30s — retrying',                          source: 'LIS Connector',   caseId: null,       resolved: false },
  { id: 'el-02', timestamp: ts(0,  8, 55), severity: 'warning', code: 'AI-LOW-CONF',   message: 'AI confidence below threshold (62%) for protocol selection',            source: 'AI Engine',       caseId: 'S26-4403', resolved: true  },
  { id: 'el-03', timestamp: ts(0,  8, 22), severity: 'error',   code: 'AUTH-401',      message: 'Failed login attempt — invalid credentials',                            source: 'Auth Service',    caseId: null,       resolved: true  },
  { id: 'el-04', timestamp: ts(1, 17, 14), severity: 'warning', code: 'SYNC-DELAY',    message: 'LIS sync delayed 4m 22s — queue backlog detected',                     source: 'LIS Connector',   caseId: null,       resolved: true  },
  { id: 'el-05', timestamp: ts(1, 14,  2), severity: 'error',   code: 'DB-WRITE',      message: 'Failed to persist synoptic draft — retrying (attempt 2/3)',            source: 'Storage Service', caseId: 'S26-4398', resolved: true  },
  { id: 'el-06', timestamp: ts(1, 11, 47), severity: 'info',    code: 'AI-FALLBACK',   message: 'AI model fallback to secondary due to primary model latency',           source: 'AI Engine',       caseId: 'S26-4396', resolved: true  },
  { id: 'el-07', timestamp: ts(1,  9,  5), severity: 'warning', code: 'AI-LOW-CONF',   message: 'AI confidence below threshold (58%) for synoptic field population',    source: 'AI Engine',       caseId: 'S26-4395', resolved: true  },
  { id: 'el-08', timestamp: ts(2, 15, 30), severity: 'error',   code: 'LIS-404',       message: 'Case not found in LIS — accession mismatch',                           source: 'LIS Connector',   caseId: 'S26-4391', resolved: false },
  { id: 'el-10', timestamp: ts(2, 11, 10), severity: 'warning', code: 'SYNC-DELAY',    message: 'LIS sync delayed 7m 01s — high queue volume',                          source: 'LIS Connector',   caseId: null,       resolved: true  },
  { id: 'el-11', timestamp: ts(2,  8, 44), severity: 'error',   code: 'AI-TIMEOUT',    message: 'AI engine response timeout (>15s) — request retried',                  source: 'AI Engine',       caseId: 'S26-4390', resolved: true  },
  { id: 'el-12', timestamp: ts(3, 16, 20), severity: 'warning', code: 'CERT-EXPIRY',   message: 'TLS certificate for LIS endpoint expires in 14 days',                  source: 'System Monitor',  caseId: null,       resolved: false },
  { id: 'el-13', timestamp: ts(3, 14,  5), severity: 'info',    code: 'CONFIG-RELOAD', message: 'System configuration reloaded after settings update',                   source: 'Config Service',  caseId: null,       resolved: true  },
  { id: 'el-14', timestamp: ts(3, 10, 33), severity: 'error',   code: 'AUTH-401',      message: 'Failed login attempt — account temporarily locked',                    source: 'Auth Service',    caseId: null,       resolved: true  },
  { id: 'el-15', timestamp: ts(4, 15, 48), severity: 'warning', code: 'AI-LOW-CONF',   message: 'AI confidence below threshold (55%) — manual review recommended',      source: 'AI Engine',       caseId: 'S26-4382', resolved: true  },
  { id: 'el-16', timestamp: ts(4,  9, 22), severity: 'info',    code: 'BACKUP-OK',     message: 'Scheduled audit log backup completed successfully',                      source: 'Backup Service',  caseId: null,       resolved: true  },
  { id: 'el-17', timestamp: ts(5, 14, 10), severity: 'error',   code: 'LIS-503',       message: 'LIS service unavailable — maintenance window',                         source: 'LIS Connector',   caseId: null,       resolved: true  },
  { id: 'el-18', timestamp: ts(5, 11, 55), severity: 'info',    code: 'AI-RETRAIN',    message: 'AI protocol model retrained with updated CAP definitions',              source: 'AI Engine',       caseId: null,       resolved: true  },
  { id: 'el-19', timestamp: ts(6, 16, 30), severity: 'warning', code: 'SYNC-DELAY',    message: 'LIS sync delayed 11m 14s — upstream API degraded',                     source: 'LIS Connector',   caseId: null,       resolved: true  },
  { id: 'el-20', timestamp: ts(6, 13,  0), severity: 'error',   code: 'DB-CONN',       message: 'Database connection pool exhausted — queuing requests',                 source: 'Storage Service', caseId: null,       resolved: true  },
  { id: 'el-22', timestamp: ts(8, 14, 20), severity: 'error',   code: 'LIS-404',       message: 'Case not found in LIS — accession mismatch',                           source: 'LIS Connector',   caseId: 'S26-4355', resolved: false },
  { id: 'el-23', timestamp: ts(9, 11,  5), severity: 'warning', code: 'AI-LOW-CONF',   message: 'AI confidence below threshold (60%) for protocol selection',            source: 'AI Engine',       caseId: 'S26-4350', resolved: true  },
  { id: 'el-24', timestamp: ts(10, 9, 33), severity: 'info',    code: 'CONFIG-RELOAD', message: 'System configuration reloaded after settings update',                   source: 'Config Service',  caseId: null,       resolved: true  },
  { id: 'el-25', timestamp: ts(11,15, 44), severity: 'error',   code: 'AI-TIMEOUT',    message: 'AI engine response timeout (>15s) — request retried successfully',     source: 'AI Engine',       caseId: 'S26-4345', resolved: true  },
  { id: 'el-26', timestamp: ts(12,10, 22), severity: 'warning', code: 'SYNC-DELAY',    message: 'LIS sync delayed 3m 58s — minor queue backlog',                        source: 'LIS Connector',   caseId: null,       resolved: true  },
  { id: 'el-27', timestamp: ts(13, 8, 10), severity: 'error',   code: 'DB-WRITE',      message: 'Failed to persist audit event — disk quota warning',                    source: 'Storage Service', caseId: null,       resolved: false },
  { id: 'el-28', timestamp: ts(14,16, 55), severity: 'info',    code: 'BACKUP-OK',     message: 'Scheduled audit log backup completed successfully',                      source: 'Backup Service',  caseId: null,       resolved: true  },
  { id: 'el-29', timestamp: ts(21,11, 30), severity: 'warning', code: 'CERT-EXPIRY',   message: 'TLS certificate for LIS endpoint expires in 30 days',                  source: 'System Monitor',  caseId: null,       resolved: true  },
  { id: 'el-30', timestamp: ts(28, 9, 15), severity: 'error',   code: 'LIS-503',       message: 'LIS connection failed — DNS resolution error',                         source: 'LIS Connector',   caseId: null,       resolved: true  },
];

// ─── Storage ──────────────────────────────────────────────────────────────────

const loadAudit  = () => storageGet<AuditLog[]>('pathscribe_audit_logs',  SEED_AUDIT_LOGS);
const loadErrors = () => storageGet<ErrorLog[]>('pathscribe_error_logs',  SEED_ERROR_LOGS);
const persistAudit  = (data: AuditLog[])  => storageSet('pathscribe_audit_logs',  data);
const persistErrors = (data: ErrorLog[])  => storageSet('pathscribe_error_logs',  data);

let MOCK_AUDIT_LOGS:  AuditLog[]  = loadAudit();
let MOCK_ERROR_LOGS:  ErrorLog[]  = loadErrors();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok    = <T>(data: T): ServiceResult<T> => ({ ok: true,  data  });
const err   = <T>(e: string): ServiceResult<T> => ({ ok: false, error: e });
const delay = () => new Promise(r => setTimeout(r, 80));

function parseTs(ts: string): Date { return new Date(ts.replace(' ', 'T')); }

function applyAuditFilters(logs: AuditLog[], f: AuditFilterParams = {}): AuditLog[] {
  return logs.filter(log => {
    if (f.type && f.type !== 'all' && log.type !== f.type)           return false;
    if (f.user && f.user !== 'all' && log.user !== f.user)           return false;
    if (f.dateFrom && parseTs(log.timestamp) < new Date(f.dateFrom)) return false;
    if (f.dateTo   && parseTs(log.timestamp) > new Date(f.dateTo + 'T23:59:59')) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (![log.event, log.detail, log.user, log.caseId ?? ''].some(s => s.toLowerCase().includes(q)))
        return false;
    }
    return true;
  });
}

function applyErrorFilters(logs: ErrorLog[], f: ErrorFilterParams = {}): ErrorLog[] {
  return logs.filter(log => {
    if (f.severity && f.severity !== 'all' && log.severity !== f.severity) return false;
    if (f.resolved !== undefined && f.resolved !== 'all' && log.resolved !== f.resolved) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (![log.message, log.code, log.source, log.caseId ?? ''].some(s => s.toLowerCase().includes(q)))
        return false;
    }
    return true;
  });
}

// ─── Mock Service ─────────────────────────────────────────────────────────────

export const mockAuditService: IAuditService = {

  async getAuditLogs(filters) {
    await delay();
    return ok(applyAuditFilters([...MOCK_AUDIT_LOGS], filters));
  },

  async logEvent(entry) {
    await delay();
    // Real fix, per direct follow-up: "when we are tracking actions,
    // I don't believe we include the physical location of that
    // action, just the person - Correct?" Confirmed, then fixed HERE
    // specifically, not in audit/auditLogger.ts alone — a direct
    // trace found 16 separate real files calling this function,
    // most going straight to mockAuditService.logEvent() rather than
    // through that one wrapper. This is the actual, single choke
    // point every one of them funnels through regardless of which
    // intermediate file they use, so injecting the real, current
    // station here — always, unconditionally overwriting whatever
    // (if anything) the caller passed — is what genuinely covers
    // every real audit event in this app, not just the three
    // consumers of one specific bridge file.
    const newEntry: AuditLog = { ...entry, stationId: getEffectiveScanStationId(), id: 'al-' + Date.now(), timestamp: nowTs() };
    MOCK_AUDIT_LOGS = [newEntry, ...MOCK_AUDIT_LOGS];
    persistAudit(MOCK_AUDIT_LOGS);
    return ok({ ...newEntry });
  },

  async getErrorLogs(filters) {
    await delay();
    return ok(applyErrorFilters([...MOCK_ERROR_LOGS], filters));
  },

  async logError(entry) {
    await delay();
    const newEntry: ErrorLog = { ...entry, id: 'el-' + Date.now(), timestamp: nowTs(), resolved: false };
    MOCK_ERROR_LOGS = [newEntry, ...MOCK_ERROR_LOGS];
    persistErrors(MOCK_ERROR_LOGS);
    return ok({ ...newEntry });
  },

  async resolveError(id) {
    await delay();
    const idx = MOCK_ERROR_LOGS.findIndex(e => e.id === id);
    if (idx === -1) return err(`Error log ${id} not found`);
    MOCK_ERROR_LOGS = MOCK_ERROR_LOGS.map(e => e.id === id ? { ...e, resolved: true } : e);
    persistErrors(MOCK_ERROR_LOGS);
    return ok({ ...MOCK_ERROR_LOGS[idx], resolved: true });
  },
};
