/**
 * services/enhancementRequestService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles routing of enhancement request submissions.
 * Supports two modes: Email and Portal (API/webhook).
 *
 * Mock phase: logs to console, simulates latency.
 * Real phase: swap bodies below — nothing in the UI layer changes.
 *
 * Drop-in path: src/services/enhancementRequestService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CONFIG_KEY = 'ps_enhancement_config_v1';

import { sendEmail }                                        from './communications/notificationService';
import { supportPageOf }                                    from './supportReferences/supportTicketRules';
import { mockSupportReferenceService }                      from './supportReferences/mockSupportReferenceService';
import type { ISupportReferenceService }                    from './supportReferences/ISupportReferenceService';
import type { ICaseService }                                from './cases/ICaseService';
import { buildEnhancementSubject, buildEnhancementHtml, buildEnhancementText }
                                                            from './communications/emailTemplates/enhancementEmailTemplates';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoutingMode     = 'email' | 'portal';
export type RequestCategory =
  // Enhancement categories
  | 'UI' | 'Workflow' | 'Reporting' | 'Integrations' | 'Other'
  // QA / testing categories
  | 'UI Bug' | 'Functional Issue' | 'Data Issue' | 'Performance';
export type RequestPriority = 'Low' | 'Medium' | 'High';

export interface EnhancementRequestConfig {
  mode:              RoutingMode;
  emailRecipients:   string[];       // enhancement request recipients
  qaEmailRecipients: string[];       // QA feedback recipients (VITE_QA_EMAIL)
  qaAdminCc:         string[];       // admin cc for QA submissions (VITE_QA_ADMIN_CC)
  qaEnabled:         boolean;        // show QA feedback button in nav
  emailConfirmation: boolean;
  portalUrl:         string;
  portalApiKey:      string;         // memory only — never persisted
  portalProjectKey:  string;
}

export interface EnhancementRequestPayload {
  title:         string;
  description:   string;
  category:      RequestCategory;
  priority?:     RequestPriority;
  attachments:      File[];
  includeSystem:    boolean;
  mode?:            'enhancement' | 'qa';   // controls email routing
  screenshotDataUrl?: string;               // base64 dataUrl — embedded in email body
  metadata?: {
    userId:      string;
    userName:    string;
    userRole:    string;
    timestamp:   string;
    appVersion:  string;
    browser:     string;
    os:          string;
    /** Batch 364 (PS-349): the page's route pattern ('/report/:caseId'), never its address. */
    currentPage: string;
    /** The case the page is about, as its support reference (never the case number). */
    caseSupportReference?: string;
  };
}

export interface SubmissionResult {
  success:    boolean;
  messageId?: string;
  ticketUrl?: string;
  error?:     string;
}

// ─── Config persistence ───────────────────────────────────────────────────────

export function loadEnhancementConfig(): EnhancementRequestConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    mode:              'email',
    // Enhancement requests — product team
    emailRecipients:   import.meta.env.VITE_ENHANCEMENT_EMAIL
                         ? [import.meta.env.VITE_ENHANCEMENT_EMAIL as string]
                         : [],
    // QA / testing feedback — QA team + admin cc
    qaEmailRecipients: import.meta.env.VITE_QA_EMAIL
                         ? [import.meta.env.VITE_QA_EMAIL as string]
                         : [],
    qaAdminCc:         import.meta.env.VITE_QA_ADMIN_CC
                         ? [import.meta.env.VITE_QA_ADMIN_CC as string]
                         : [],
    qaEnabled:         import.meta.env.VITE_QA_ENABLED === 'true',
    emailConfirmation: true,
    portalUrl:         '',
    portalApiKey:      '',
    portalProjectKey:  '',
  };
}

export function saveEnhancementConfig(config: EnhancementRequestConfig): void {
  // Never persist API key to localStorage
  const safe = { ...config, portalApiKey: '' };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(safe));
}

// ─── Metadata capture ─────────────────────────────────────────────────────────

// Batch 364 (PS-349): the page used to be sent as its address
// (window.location.pathname + search), which on a case is e.g.
// /report/S26-4403: the case number reached the support inbox even though
// the screenshot was redacted. It is now the route pattern, and the case
// goes as its support reference (services/supportReferences/).
export async function captureMetadata(
  user: { id: string; name: string; role: string },
  deps: { supportReferenceService: ISupportReferenceService; pathname: string } = { supportReferenceService: mockSupportReferenceService, pathname: window.location.pathname },
): Promise<EnhancementRequestPayload['metadata']> {
  const page = supportPageOf(deps.pathname);
  const caseRef = page.caseId ? await deps.supportReferenceService.forRecord('case', page.caseId) : null;
  const ua = navigator.userAgent;
  const browser = /Edg/.test(ua)     ? 'Edge'
    : /Chrome/.test(ua)  ? 'Chrome'
    : /Firefox/.test(ua) ? 'Firefox'
    : /Safari/.test(ua)  ? 'Safari'
    : 'Unknown';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Mac/.test(ua)    ? 'macOS'
    : /Linux/.test(ua)  ? 'Linux'
    : 'Unknown';

  return {
    userId:      user.id,
    userName:    user.name,
    userRole:    user.role,
    timestamp:   new Date().toISOString(),
    appVersion:  (import.meta.env.VITE_APP_VERSION as string) ?? '1.0.0',
    browser,
    os,
    currentPage: page.pattern,
    caseSupportReference: caseRef?.ok ? caseRef.data.ref : undefined,
  };
}

/**
 * Batch 364 (PS-349): support references for the case numbers a user typed,
 * so the ticket can say "SR-7K2Q-9MXD" instead. Only numbers that name a
 * case PathScribe holds get one; others are left for the user to remove.
 */
export async function supportReferencesForCaseNumbers(
  caseNumbers: readonly string[],
  deps: { caseService: Pick<ICaseService, 'getCase'>; supportReferenceService: ISupportReferenceService },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const n of caseNumbers) {
    const found = await deps.caseService.getCase(n.toUpperCase()).catch(() => null);
    if (!found) continue;
    const ref = await deps.supportReferenceService.forRecord('case', found.id);
    if (ref.ok) out.set(n, ref.data.ref);
  }
  return out;
}

// ─── Submission ───────────────────────────────────────────────────────────────

const delay = (ms = 800) => new Promise(res => setTimeout(res, ms));

export async function submitEnhancementRequest(
  payload: EnhancementRequestPayload,
  config:  EnhancementRequestConfig,
): Promise<SubmissionResult> {
  return config.mode === 'email'
    ? submitViaEmail(payload, config)
    : submitViaPortal(payload, config);
}

// ─── Email mode ───────────────────────────────────────────────────────────────

async function submitViaEmail(
  payload: EnhancementRequestPayload,
  config:  EnhancementRequestConfig,
): Promise<SubmissionResult> {
  const isQA = payload.mode === 'qa';
  const to   = isQA ? config.qaEmailRecipients : config.emailRecipients;
  const cc   = isQA ? config.qaAdminCc         : [];

  if (to.length === 0) {
    console.warn('[enhancementRequestService] No recipients configured — check VITE_ENHANCEMENT_EMAIL / VITE_QA_EMAIL');
    return { success: false, error: 'No recipients configured.' };
  }

  await sendEmail({
    to,
    cc,
    subject:  buildEnhancementSubject(payload),
    bodyHtml: buildEnhancementHtml(payload),
    bodyText: buildEnhancementText(payload),
    metadata: {
      mode:     payload.mode ?? 'enhancement',
      category: payload.category,
      ...(payload.metadata ?? {}),
    },
  });

  return { success: true, messageId: `email-${Date.now()}` };
}

// ─── Portal mode ──────────────────────────────────────────────────────────────

async function submitViaPortal(
  payload: EnhancementRequestPayload,
  config:  EnhancementRequestConfig,
): Promise<SubmissionResult> {
  await delay(1100);

  // ── MOCK ──
  console.info('[enhancementRequestService] PORTAL submission (mock):', {
    url: config.portalUrl, projectKey: config.portalProjectKey, payload,
  });
  return {
    success:   true,
    messageId: `MOCK-${Math.floor(Math.random() * 9000) + 1000}`,
    ticketUrl: `${config.portalUrl || 'https://portal.example.com'}/browse/MOCK-1234`,
  };

  // ── REAL ──
  // const res = await fetch(config.portalUrl, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type':  'application/json',
  //     'Authorization': `Bearer ${config.portalApiKey}`,
  //   },
  //   body: JSON.stringify({
  //     projectKey:  config.portalProjectKey,
  //     title:       payload.title,
  //     description: payload.description,
  //     category:    payload.category,
  //     priority:    payload.priority,
  //     metadata:    payload.metadata,
  //   }),
  // });
  // if (!res.ok) throw await res.json();
  // return res.json();
}
