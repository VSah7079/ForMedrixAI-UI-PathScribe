/**
 * services/templates/templateService.ts
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Service layer for all synoptic template operations.
 *
 * MOCK PHASE (current):
 *   All functions return realistic mock data with simulated async latency.
 *   Components are fully wired â€” swap the implementations below when the
 *   backend is ready. Nothing in the UI layer needs to change.
 *
 * REAL PHASE (when backend is ready):
 *   Replace each function body with the corresponding fetch() call.
 *   API contracts are documented inline above each function.
 *   See also: /docs/api-contracts/templates.md (generate from this file)
 *
 * Used by:
 *   components/Config/Protocols/SynopticEditor.tsx
 *   components/Config/Templates/TemplateRenderer.tsx
 *
 * Drop-in path: src/services/templates/templateService.ts
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { EditorTemplate } from '../../components/Config/Protocols/SynopticEditor';
import { PROTOCOL_REGISTRY, Protocol, LifecycleState, notifyRegistryChanged, saveRegistryOverride } from '../../components/Config/Protocols/protocolShared';
import { getSessionUser } from '../auth/caseAccessControl';
import { fromLegacyName, formatFullDisplayName } from '../../utils/personName';
import { inheritedCopyAttributes } from './protocolLifecycle';
import {
  calcTemplateCoverage, canDraftTemplates, decideApprove, decidePublish, isTemplateApprover, withEditor, SNOMED_PUBLISH_THRESHOLD,
  type TemplateActor,
} from './templatePublishingRules';
import { roleIdsForNames } from '../roles/systemRoles';
import { getTemplateGovernanceSettings } from './templateGovernanceSettings';

// â”€â”€â”€ Shared types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type TemplateStatus = LifecycleState | 'deprecated';

/** Real, per direct guidance - mirrors protocolShared.tsx's own
 *  isDiagnosticProtocol() exactly (default true when unset - the same
 *  "effectively all CAP/RCPath/diagnostic-Custom protocols" reasoning
 *  applies here). Use this rather than reading .isDiagnostic directly. */
export function isTemplateDiagnostic(t: Pick<TemplateSummary, 'isDiagnostic'>): boolean {
  return t.isDiagnostic !== false;
}

export interface TemplateSummary {
  id:           string;
  name:         string;
  source:       string;
  version:      string;
  category:     string;
  status:       TemplateStatus;
  fields:       number;
  sections:     number;
  createdBy:    string;
  createdAt:    string;
  updatedAt:    string;
  submittedAt?: string;
  publishedAt?: string;
  /** Real, per direct guidance - whether this protocol's answers are
   *  real diagnostic content (post-microscopy) as opposed to
   *  procedural/Grossing checklist data. Mirrors
   *  Protocol.isDiagnostic exactly - undefined here means the same
   *  thing it means there (defaults true; use isTemplateDiagnostic()
   *  below rather than reading this directly). */
  isDiagnostic?: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  template:     EditorTemplate;
  reviewNote?:  string;
  reviewedBy?:  string;
}

export interface SaveDraftResult {
  id:        string;
  status:    'draft';
  updatedAt: string;
}

export interface SubmitResult {
  id:          string;
  status:      'in_review';
  submittedAt: string;
}

export interface TransitionResult {
  id:          string;
  status:      TemplateStatus;
  reviewNote?: string;
  updatedAt:   string;
  /** Approve only: approvals that now count toward publishing (PS-63). */
  approvalCount?: number;
}

export interface ServiceError {
  code:    string;
  message: string;
  /** Publish refusals (PS-63): the template's SNOMED % or approval count. */
  coverage?: number;
  approvalCount?: number;
}

// â”€â”€â”€ In-memory editor state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Stores the full EditorTemplate structure keyed by id.
// PROTOCOL_REGISTRY holds the summary/status view; this holds the field data.
// Both are updated together on every write.
//
// localStorage bridge — same pattern as protocolShared.tsx's registry
// overrides, added for the same reason: this was a plain in-memory Map,
// meaning a real Build/Customise session lost all its field/section work
// on a page refresh even though the registry's lifecycle status (draft,
// in_review, etc.) survived. That mismatch was flagged directly rather
// than left implicit — a template could show "draft" in the registry
// with no real content behind it anymore. Local-only, same tradeoff as
// the registry bridge: fast, protects against accidental refresh, but
// doesn't sync across machines or survive clearing browser data. A real
// backend-backed autosave is separate, larger scope — deliberately not
// attempted here.
// Key: ps_editor_store_v1  Value: Record<id, EditorTemplate>

const editorStore = new Map<string, EditorTemplate>();

const EDITOR_STORE_KEY = 'ps_editor_store_v1';

function loadEditorStoreOverrides(): Record<string, EditorTemplate> {
  try {
    const raw = localStorage.getItem(EDITOR_STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveEditorStoreOverride(id: string, template: EditorTemplate): void {
  try {
    const overrides = loadEditorStoreOverrides();
    overrides[id] = template;
    localStorage.setItem(EDITOR_STORE_KEY, JSON.stringify(overrides));
  } catch { /* storage unavailable */ }
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const delay = (ms = 400) => new Promise(res => setTimeout(res, ms));

const now = () => new Date().toISOString();

// ─── PS-63 review governance helpers ────────────────────────────────────────

/** The signed-in user as the publishing rules see them. Roles are read
 *  live from the staff record and the role catalog at the moment of the
 *  action (not from the login session), and matched to built-in role ids
 *  (services/roles/systemRoles.ts). `displayName` is the name the reviewer
 *  page shows (AuthContext user.name). */
async function currentActor(displayName?: string): Promise<TemplateActor | null> {
  const session = getSessionUser();
  if (!session) return null;
  let roleIds: string[] = [];
  try {
    const { userService, roleService } = await import('../../services');
    const [users, roles] = await Promise.all([userService.getAll(), roleService.getAll()]);
    const staff = users.ok ? users.data.find(u => u.id === session.id) : undefined;
    if (staff && roles.ok) roleIds = roleIdsForNames(staff.roles, roles.data);
  } catch { /* no staff record or catalog: app role only */ }
  return {
    id: session.id,
    name: displayName ?? resolveOwnerDisplayName(),
    appRole: session.role,
    roleIds,
  };
}

/** Whether the signed-in user may draft templates (Template Author, or
 *  Admin by inheritance). The editor uses it to open read-only. */
export async function canCurrentUserDraftTemplates(): Promise<boolean> {
  return canDraftTemplates(await currentActor());
}

/** Plain-English messages for the log; the reviewer page shows its own
 *  translated text for each code. */
const GOVERNANCE_MESSAGES: Record<string, string> = {
  NOT_TEMPLATE_AUTHOR:    'Drafting templates requires the Template Author role.',
  NOT_APPROVER:           'Only a Template Approver, Lab Director or Admin can approve or publish templates.',
  SELF_APPROVAL:          'This template requires independent review before publication. Please assign a reviewer or request sign-off from a Lab Director.',
  ALREADY_APPROVED:       'You have already approved this template.',
  NOT_ENOUGH_APPROVALS:   'This template does not yet have the required number of independent approvals.',
  SNOMED_BELOW_THRESHOLD: `Templates require at least ${SNOMED_PUBLISH_THRESHOLD}% SNOMED coverage before publishing.`,
};

function governanceError(code: string, extra: { coverage?: number; approvalCount?: number } = {}): ServiceError {
  return {
    code,
    message: GOVERNANCE_MESSAGES[code] ?? code,
    ...(extra.coverage !== undefined ? { coverage: extra.coverage } : {}),
    ...(extra.approvalCount !== undefined ? { approvalCount: extra.approvalCount } : {}),
  };
}

/** Field-level SNOMED % used by the publish check: from the template's own
 *  content when the editor has it, else the registry's seeded figure. */
function publishCoverage(id: string, entry: Protocol): number {
  const stored = editorStore.get(id);
  if (stored && stored.sections?.some(sec => sec.fields.length > 0)) return calcTemplateCoverage(stored).snomed;
  return entry.snomedPct ?? 0;
}

function registryEntry(id: string): Protocol | undefined {
  return PROTOCOL_REGISTRY.find(p => p.id === id);
}

function upsertRegistry(patch: Partial<Protocol> & { id: string }): void {
  const idx = PROTOCOL_REGISTRY.findIndex(p => p.id === patch.id);
  if (idx >= 0) {
    PROTOCOL_REGISTRY[idx] = { ...PROTOCOL_REGISTRY[idx], ...patch };
  } else {
    // New entry â€” build a full Protocol from the patch
    PROTOCOL_REGISTRY.push({
      name:         patch.name         ?? 'Untitled',
      category:     patch.category     ?? 'OTHER',
      version:      patch.version      ?? '1.0.0',
      source:       (patch.source as Protocol['source']) ?? 'Custom',
      type:         patch.type         ?? 'Custom',
      status:       patch.status       ?? 'draft',
      fields:       patch.fields       ?? 0,
      snomedPct:    patch.snomedPct    ?? 0,
      icdPct:       patch.icdPct       ?? 0,
      lastModified: patch.lastModified ?? now().slice(0, 10),
      owner:        patch.owner        ?? 'Current User',
      ...patch,
    } as Protocol);
  }
  // Persist to localStorage so transitions survive page reloads (mock-phase bridge)
  saveRegistryOverride(patch);
  // Any registry change can alter a status-filtered list (e.g. an archived
  // protocol must leave the 'published' picker), so cached list results are
  // dropped. Detail entries stay: their template content is unchanged.
  templateListCache.clear();
  notifyRegistryChanged();
}

// ─── Real prefetch/cache layer ─────────────────────────────────────────────
// Added to close a real load-time gap: RightSynopticPanel.tsx couldn't
// start fetching a case's template until AFTER the case itself had
// loaded and the panel had mounted — a genuinely sequential dependency
// chain (case fetch -> mount -> template fetch) that stacks their
// artificial mock delays (30ms + 350ms) instead of overlapping them.
// These cache the actual in-flight PROMISE, not just the resolved value
// — that's what lets a prefetch triggered from the worklist (before
// navigation even completes) and the real load inside
// RightSynopticPanel.tsx share the SAME request instead of firing two,
// even if the real load's own call happens before the prefetch settles.
const templateDetailCache = new Map<string, Promise<TemplateDetail>>();
const templateListCache   = new Map<string, Promise<Protocol[]>>();

export function getTemplateCached(id: string): Promise<TemplateDetail> {
  let entry = templateDetailCache.get(id);
  if (!entry) {
    entry = getTemplate(id);
    templateDetailCache.set(id, entry);
    // A failed fetch shouldn't poison the cache forever — let a later
    // caller retry instead of being stuck replaying the same rejection.
    entry.catch(() => templateDetailCache.delete(id));
  }
  return entry;
}

export function listTemplatesCached(status?: TemplateStatus | TemplateStatus[]): Promise<Protocol[]> {
  const key = status ? (Array.isArray(status) ? status.join(',') : status) : '__all__';
  let entry = templateListCache.get(key);
  if (!entry) {
    entry = listTemplates(status);
    templateListCache.set(key, entry);
    entry.catch(() => templateListCache.delete(key));
  }
  return entry;
}

/** Real prefetch trigger — call the moment a case is clicked in the
 *  worklist, well before navigation to the report page completes, so
 *  both requests are already in flight (or resolved) by the time
 *  RightSynopticPanel.tsx actually needs them. Deliberately takes the
 *  template id directly rather than re-fetching the case to find it —
 *  the worklist already has the full case object in memory at click
 *  time, so there's no reason to pay a second round trip just to learn
 *  something already known. */
export function prefetchTemplateData(templateId: string | undefined): void {
  if (!templateId) return;
  getTemplateCached(templateId).catch(() => {});
  listTemplatesCached('approved').catch(() => {});
}

// â”€â”€â”€ GET /api/templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function listTemplates(
  status?: TemplateStatus | TemplateStatus[]
): Promise<Protocol[]> {
  await delay(300);

  // â”€â”€ MOCK â”€â”€
  const statuses = status ? (Array.isArray(status) ? status : [status]) : null;
  return PROTOCOL_REGISTRY.filter(p => !statuses || statuses.includes(p.status as TemplateStatus));

  // â”€â”€ REAL â”€â”€
  // const q = status ? `?status=${Array.isArray(status) ? status.join(',') : status}` : '';
  // const res = await fetch(`/api/templates${q}`);
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// â”€â”€â”€ GET /api/templates/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getTemplate(id: string): Promise<TemplateDetail> {
  await delay(350);

  // â”€â”€ MOCK â”€â”€
  const entry = registryEntry(id);
  const storedTemplate = editorStore.get(id);

  // Fallback: template seeded directly into editorStore but not in PROTOCOL_REGISTRY
  // (e.g. skin_melanoma_bx, or any template added via editorStore.set without a registry entry)
  if (!entry && storedTemplate) {
    const tpl = storedTemplate as any;
    const fieldCount = (tpl.sections ?? []).reduce((n: number, s: any) => n + (s.fields?.length ?? 0), 0);
    return {
      id,
      name:      tpl.name ?? id,
      source:    tpl.source ?? 'Custom',
      version:   tpl.version ?? '1.0.0',
      category:  tpl.category ?? 'Other',
      status:    'approved' as TemplateStatus,
      fields:    fieldCount,
      sections:  (tpl.sections ?? []).length,
      createdBy: 'System',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      template:  storedTemplate,
      isDiagnostic: tpl.isDiagnostic,
    };
  }

  if (!entry) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;
  const template = storedTemplate ?? {
    id, name: entry.name, source: entry.source,
    version: entry.version, category: entry.category, sections: [],
  };
  return {
    id:          entry.id,
    name:        entry.name,
    source:      entry.source,
    version:     entry.version,
    category:    entry.category,
    status:      entry.status as TemplateStatus,
    fields:      entry.fields,
    sections:    0,
    createdBy:   entry.owner,
    createdAt:   entry.lastModified,
    updatedAt:   entry.lastModified,
    reviewNote:  entry.reviewNote,
    template,
    isDiagnostic: entry.isDiagnostic,
  };

  // â”€â”€ REAL â”€â”€
  // const res = await fetch(`/api/templates/${id}`);
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// â”€â”€â”€ POST /api/templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Real fix, found via a direct audit: this used to hardcode
// owner: 'Current User' with a `// TODO: replace with auth context`
// comment — every template ever saved through this function got
// credited to a literal, fake name regardless of who actually saved
// it. getSessionUser() already exists and is used throughout this app;
// this just wires it in here too, with an honest fallback ('Unknown
// User', not a guess) for the genuinely-unauthenticated edge case.
function resolveOwnerDisplayName(): string {
  const session = getSessionUser();
  if (!session?.firstName && !session?.lastName) return 'Unknown User';
  return formatFullDisplayName(fromLegacyName(session.firstName ?? '', session.lastName ?? ''));
}

export async function saveDraft(template: EditorTemplate): Promise<SaveDraftResult> {
  await delay(400);
  // PS-63 (Batch 329): drafting is limited to Template Author (Admin inherits).
  const author = await currentActor();
  if (!canDraftTemplates(author)) throw governanceError('NOT_TEMPLATE_AUTHOR');

  // â”€â”€ MOCK â”€â”€
  const ts = now();
  // A Duplicate / New Version's first save inherits its source's
  // registry-only attributes (isDiagnostic, type, group); see
  // protocolLifecycle.ts → inheritedCopyAttributes.
  const inherited = !registryEntry(template.id) && template.copiedFromId
    ? inheritedCopyAttributes(registryEntry(template.copiedFromId))
    : {};
  editorStore.set(template.id, template);
  saveEditorStoreOverride(template.id, template);
  upsertRegistry({
    ...inherited,
    id:           template.id,
    name:         template.name || 'Untitled',
    source:       template.source as Protocol['source'],
    version:      template.version,
    category:     template.category,
    status:       'draft',
    fields:       template.sections.reduce((n, s) => n + s.fields.length, 0),
    lastModified: ts.slice(0, 10),
    owner:        resolveOwnerDisplayName(),
    ...(template.supersedesId ? { supersedesId: template.supersedesId } : {}),
    // PS-63: everyone who edits a template counts as its author for the
    // self-approval rule, and an edit starts a new review round.
    editorIds:    withEditor(registryEntry(template.id)?.editorIds, author.id),
    approvals:    [],
  });

  console.info(`[templateService] Draft saved: ${template.name} (${template.id})`);
  return { id: template.id, status: 'draft', updatedAt: ts };

  // â”€â”€ REAL â”€â”€
  // const res = await fetch('/api/templates', {
  //   method: 'POST', headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ template }),
  // });
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// â”€â”€â”€ POST /api/templates/:id/submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function submitForReview(id: string, note?: string): Promise<SubmitResult> {
  await delay(500);
  if (!canDraftTemplates(await currentActor())) throw governanceError('NOT_TEMPLATE_AUTHOR');

  // â”€â”€ MOCK â”€â”€
  const entry = registryEntry(id);
  if (!entry) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;

  const ts = now();
  upsertRegistry({ id, status: 'in_review', lastModified: ts.slice(0, 10), reviewNote: note, approvals: [] });

  console.info(`[templateService] Submitted for review: ${entry.name}`);
  return { id, status: 'in_review', submittedAt: ts };

  // â”€â”€ REAL â”€â”€
  // const res = await fetch(`/api/templates/${id}/submit`, {
  //   method: 'POST', headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ note }),
  // });
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// â”€â”€â”€ POST /api/templates/:id/approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function approveTemplate(id: string, note?: string, reviewedBy?: string): Promise<TransitionResult> {
  await delay(500);

  // â”€â”€ MOCK â”€â”€
  const entry = registryEntry(id);
  if (!entry) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;

  const ts = now();
  // PS-63: approver role, no self-approval (unless the site allows it), and
  // the template becomes 'approved' only once it has the site's required
  // number of approvals. Refusals throw ServiceError with the rule's code.
  const actor = await currentActor(reviewedBy);
  const decision = decideApprove(entry, actor, getTemplateGovernanceSettings(), ts);
  if (decision.ok === false) throw governanceError(decision.code);

  upsertRegistry({
    id, status: decision.status,
    approvals: decision.approvals,
    reviewedBy: actor?.name ?? reviewedBy ?? 'Unknown User',
    reviewedAt: ts,
    lastModified: ts.slice(0, 10), reviewNote: note,
  });

  console.info(`[templateService] Approval recorded: ${entry.name} (${decision.approvalCount}, now ${decision.status})`);
  return { id, status: decision.status, updatedAt: ts, approvalCount: decision.approvalCount };

  // â”€â”€ REAL â”€â”€
  // const res = await fetch(`/api/templates/${id}/approve`, {
  //   method: 'POST', headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ note }),
  // });
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// â”€â”€â”€ POST /api/templates/:id/publish â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function publishTemplate(id: string, _note?: string, publishedBy?: string): Promise<TransitionResult> {
  await delay(600);

  // â”€â”€ MOCK â”€â”€
  const entry = registryEntry(id);
  if (!entry) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;

  const ts = now();
  // PS-63: approver role, no self-publishing (unless the site allows it),
  // enough approvals, and ≥80% SNOMED coverage for diagnostic templates.
  const actor = await currentActor(publishedBy);
  const decision = decidePublish(entry, actor, getTemplateGovernanceSettings(), publishCoverage(id, entry));
  if (decision.ok === false) throw governanceError(decision.code, decision);

  upsertRegistry({ id, status: 'published', reviewNote: undefined, lastModified: ts.slice(0, 10), publishedById: actor.id, publishedAt: ts });

  // New Version lineage (PS-73): publishing a version retires the published
  // version it supersedes, so only one version of a protocol is ever live.
  const predecessor = entry.supersedesId ? registryEntry(entry.supersedesId) : undefined;
  if (predecessor && predecessor.status === 'published') {
    upsertRegistry({ id: predecessor.id, status: 'archived', archivedAt: ts, lastModified: ts.slice(0, 10) });
    clearReviewerStateOverride(predecessor.id);
    console.info(`[templateService] Archived ${predecessor.name} v${predecessor.version} (superseded by v${entry.version})`);
  }

  console.info(`[templateService] Published: ${entry.name}`);

  // Notify the requester if template was built from a request
  // Requester info stored in reviewNote as NOTIFY_REQUESTER:{...} marker
  try {
    const metaMatch = (entry.reviewNote ?? '').match(/NOTIFY_REQUESTER:({.*?})/);
    if (metaMatch) {
      const meta = JSON.parse(metaMatch[1]);
      if (meta.requesterId && meta.requesterName) {
        const { messageService } = await import('../../services');
        await messageService.send({
          senderId: 'u3', senderName: 'System Admin',
recipientId: meta.requesterId, recipientName: meta.requesterName,
subject: `Your template request is ready — ${entry.name}`,
body: `Great news — the synoptic template you requested, "${entry.name}", has been published and is now available in the Synoptic Library. You can add it to any case via "+ Add Synoptic Report".`,
timestamp: new Date(), isUrgent: false,
caseNumber: '',
        });
      }
    }
  } catch { /* notification is best-effort */ }
  return { id, status: 'published', updatedAt: ts };

  // â”€â”€ REAL â”€â”€
  // const res = await fetch(`/api/templates/${id}/publish`, {
  //   method: 'POST', headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ note }),
  // });
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// â”€â”€â”€ POST /api/templates/:id/request-changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function requestChanges(id: string, note: string, reviewedBy?: string): Promise<TransitionResult> {
  await delay(500);

  // â”€â”€ MOCK â”€â”€
  const entry = registryEntry(id);
  if (!entry) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;

  const ts = now();
  upsertRegistry({
    id, status: 'needs_changes', reviewNote: note,
    reviewedBy: reviewedBy ?? 'Unknown User',
    reviewedAt: ts,
    lastModified: ts.slice(0, 10),
    approvals: [],
  });

  console.info(`[templateService] Changes requested: ${entry.name} â€” "${note}"`);
  return { id, status: 'needs_changes', reviewNote: note, updatedAt: ts };

  // â”€â”€ REAL â”€â”€
  // const res = await fetch(`/api/templates/${id}/request-changes`, {
  //   method: 'POST', headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ note }),
  // });
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// â”€â”€â”€ POST /api/templates/:id/resubmit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function resubmitForReview(id: string, _note?: string): Promise<SubmitResult> {
  await delay(500);
  // The author resubmits; a reviewer may also move it back into review.
  { const a = await currentActor(); if (!canDraftTemplates(a) && !isTemplateApprover(a)) throw governanceError('NOT_TEMPLATE_AUTHOR'); }

  // â”€â”€ MOCK â”€â”€
  const entry = registryEntry(id);
  if (!entry) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;

  const ts = now();
  upsertRegistry({ id, status: 'in_review', reviewNote: undefined, lastModified: ts.slice(0, 10), approvals: [] });

  console.info(`[templateService] Resubmitted: ${entry.name}`);
  return { id, status: 'in_review', submittedAt: ts };

  // â”€â”€ REAL â”€â”€
  // const res = await fetch(`/api/templates/${id}/resubmit`, {
  //   method: 'POST', headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ note }),
  // });
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// â”€â”€â”€ DELETE /api/templates/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function deleteTemplate(id: string): Promise<{ deleted: true }> {
  await delay(300);
  if (!canDraftTemplates(await currentActor())) throw governanceError('NOT_TEMPLATE_AUTHOR');

  // â”€â”€ MOCK â”€â”€
  const idx = PROTOCOL_REGISTRY.findIndex(p => p.id === id);
  if (idx < 0) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;
  if (PROTOCOL_REGISTRY[idx].status !== 'draft') {
    throw { code: 'FORBIDDEN', message: 'Only draft templates can be deleted' } as ServiceError;
  }
  PROTOCOL_REGISTRY.splice(idx, 1);
  editorStore.delete(id);

  // Remove from localStorage persistence store
  try {
    const { loadRegistryOverrides } = await import('../../components/Config/Protocols/protocolShared');
    const overrides = loadRegistryOverrides();
    delete overrides[id];
    localStorage.setItem('ps_registry_overrides_v1', JSON.stringify(overrides));
  } catch { /* storage unavailable */ }

  console.info(`[templateService] Deleted draft: ${id}`);
  return { deleted: true };

  // â”€â”€ REAL â”€â”€
  // const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// ─── Archive / restore (PS-73, Batch 317) ────────────────────────────────────
// Archive retires a protocol from use in any state: it drops out of every
// status-filtered list (published/approved pickers), while existing reports
// keep their content. Restore brings it back as a DRAFT, so it goes through
// review again before anyone can report with it. Rules:
// services/templates/protocolLifecycle.ts.
/** TemplateRenderer.tsx (the reviewer page) keeps its own copy of a
 *  protocol's lifecycle state in localStorage (`ps_state_<id>`) and prefers
 *  it over the registry. Archive/restore/supersede move a protocol
 *  backwards, which nothing could do before, so that copy must be dropped or
 *  a restored draft would still show as 'published' there, with no way back
 *  into review. */
function clearReviewerStateOverride(id: string): void {
  try { localStorage.removeItem(`ps_state_${id}`); } catch { /* storage unavailable */ }
}

export async function archiveTemplate(id: string): Promise<TransitionResult> {
  await delay(300);
  const entry = registryEntry(id);
  if (!entry) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;
  if (entry.status === 'archived') throw { code: 'INVALID_TRANSITION', message: `Template ${id} is already archived` } as ServiceError;
  const ts = now();
  upsertRegistry({ id, status: 'archived', archivedAt: ts, lastModified: ts.slice(0, 10) });
  clearReviewerStateOverride(id);
  console.info(`[templateService] Archived: ${entry.name}`);
  return { id, status: 'archived', updatedAt: ts };
}

export async function restoreTemplate(id: string): Promise<TransitionResult> {
  await delay(300);
  const entry = registryEntry(id);
  if (!entry) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;
  if (entry.status !== 'archived') throw { code: 'INVALID_TRANSITION', message: `Template ${id} is not archived` } as ServiceError;
  const ts = now();
  upsertRegistry({ id, status: 'draft', archivedAt: undefined, lastModified: ts.slice(0, 10) });
  clearReviewerStateOverride(id);
  console.info(`[templateService] Restored to draft: ${entry.name}`);
  return { id, status: 'draft', updatedAt: ts };
}

// â”€â”€â”€ Convenience: lifecycle transition dispatcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** The reviewer page's Reset: back to draft, starting a new review round.
 *  (Before Batch 328 there was no handler, so Reset only changed the
 *  reviewer page's local copy and the registry never moved.) */
export async function resetToDraft(id: string): Promise<TransitionResult> {
  await delay(300);
  const entry = registryEntry(id);
  if (!entry) throw { code: 'NOT_FOUND', message: `Template ${id} not found` } as ServiceError;
  if (entry.status === 'published' || entry.status === 'archived') {
    throw { code: 'INVALID_TRANSITION', message: `A ${entry.status} template can't be reset to draft` } as ServiceError;
  }
  const ts = now();
  upsertRegistry({ id, status: 'draft', approvals: [], lastModified: ts.slice(0, 10) });
  return { id, status: 'draft', updatedAt: ts };
}

export async function transitionTemplate(
  id:         string,
  target:     TemplateStatus,
  note?:      string,
  reviewedBy?: string
): Promise<TransitionResult | SubmitResult> {
  switch (target) {
    case 'in_review':     return resubmitForReview(id, note);
    case 'approved':      return approveTemplate(id, note, reviewedBy);
    case 'published':     return publishTemplate(id, note, reviewedBy);
    case 'draft':         return resetToDraft(id);
    case 'needs_changes': return requestChanges(id, note ?? '', reviewedBy);
    case 'archived':      return archiveTemplate(id);
    default:
      throw { code: 'INVALID_TRANSITION', message: `No handler for transition to ${target}` } as ServiceError;
  }
}

// â”€â”€â”€ Terminology validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// POST /api/v1/terminology/validate (see /docs/api/pathscribe-api-contract.yaml)
//
// Mock phase: validates against MOCK_DEPRECATED_CODES.
// Real phase: replace function body with fetch() to the backend endpoint.

export interface TermCode {
  code:    string;
  system:  'snomed' | 'icd';
  display: string;
}

export interface TerminologyAlert {
  id:           string;    // stable key for dismiss tracking: `${system}:${code}:${fieldId}`
  severity:     'error' | 'warning';
  system:       'snomed' | 'icd';
  code:         string;
  message:      string;
  fieldId?:     string;
  fieldLabel?:  string;
  optionId?:    string;
  optionLabel?: string;
  replacements?: TermCode[];
}

// Known deprecated codes â€” mock registry.
// Format: code â†’ { severity, message, replacements? }
// Replace with API call in real phase.
const MOCK_DEPRECATED_CODES: Record<string, {
  system:       'snomed' | 'icd';
  severity:     'error' | 'warning';
  message:      string;
  replacements?: TermCode[];
}> = {
  // SNOMED CT â€” retired concepts
  '363346000': {
    system: 'snomed', severity: 'error',
    message: 'SNOMED CT 363346000 (Malignant neoplastic disease) was retired on 2024-01-31.',
    replacements: [{ code: '363346001', system: 'snomed', display: 'Malignant neoplasm (disorder)' }],
  },
  '188340000': {
    system: 'snomed', severity: 'error',
    message: 'SNOMED CT 188340000 has been retired. Use the updated concept below.',
    replacements: [{ code: '254837009', system: 'snomed', display: 'Malignant neoplasm of breast (disorder)' }],
  },
  '413448000': {
    system: 'snomed', severity: 'warning',
    message: 'SNOMED CT 413448000 is flagged for deprecation in the next release (Jan 2026). Plan replacement.',
    replacements: [{ code: '413448001', system: 'snomed', display: 'Adenocarcinoma of colon (disorder)' }],
  },
  // ICD â€” retired codes
  'C18':  {
    system: 'icd', severity: 'warning',
    message: 'ICD-10 C18 (unspecified) â€” use a more specific 4th-character code (e.g. C18.0â€“C18.9) for CAP compliance.',
  },
  'D05.1': {
    system: 'icd', severity: 'error',
    message: 'ICD-10 D05.1 was retired in ICD-11. Use ICD-11 2E65.0 (Lobular carcinoma in situ of breast) instead.',
    replacements: [{ code: '2E65.0', system: 'icd', display: 'Lobular carcinoma in situ of breast' }],
  },
};

export async function validateTerminologyCodes(
  template: EditorTemplate
): Promise<TerminologyAlert[]> {
  await delay(300);

  // â”€â”€ MOCK â”€â”€
  const alerts: TerminologyAlert[] = [];

  template.sections.forEach(section => {
    section.fields.forEach(field => {

      // Field-level SNOMED
      if (field.snomed) {
        const hit = MOCK_DEPRECATED_CODES[field.snomed];
        if (hit && hit.system === 'snomed') {
          alerts.push({
            id:           `snomed:${field.snomed}:${field.id}`,
            severity:     hit.severity,
            system:       'snomed',
            code:         field.snomed,
            message:      hit.message,
            fieldId:      field.id,
            fieldLabel:   field.label || '(unlabelled field)',
            replacements: hit.replacements,
          });
        }
      }

      // Field-level ICD
      if (field.icd) {
        const hit = MOCK_DEPRECATED_CODES[field.icd];
        if (hit && hit.system === 'icd') {
          alerts.push({
            id:           `icd:${field.icd}:${field.id}`,
            severity:     hit.severity,
            system:       'icd',
            code:         field.icd,
            message:      hit.message,
            fieldId:      field.id,
            fieldLabel:   field.label || '(unlabelled field)',
            replacements: hit.replacements,
          });
        }
      }

      // Option-level SNOMED + ICD
      field.options.forEach(option => {
        if (option.snomed) {
          const hit = MOCK_DEPRECATED_CODES[option.snomed];
          if (hit && hit.system === 'snomed') {
            alerts.push({
              id:           `snomed:${option.snomed}:${field.id}:${option.id}`,
              severity:     hit.severity,
              system:       'snomed',
              code:         option.snomed,
              message:      hit.message,
              fieldId:      field.id,
              fieldLabel:   field.label || '(unlabelled field)',
              optionId:     option.id,
              optionLabel:  option.label || '(unlabelled option)',
              replacements: hit.replacements,
            });
          }
        }
        if (option.icd) {
          const hit = MOCK_DEPRECATED_CODES[option.icd];
          if (hit && hit.system === 'icd') {
            alerts.push({
              id:           `icd:${option.icd}:${field.id}:${option.id}`,
              severity:     hit.severity,
              system:       'icd',
              code:         option.icd,
              message:      hit.message,
              fieldId:      field.id,
              fieldLabel:   field.label || '(unlabelled field)',
              optionId:     option.id,
              optionLabel:  option.label || '(unlabelled option)',
              replacements: hit.replacements,
            });
          }
        }
      });
    });
  });

  return alerts;

  // â”€â”€ REAL â”€â”€
  // const res = await fetch('/api/v1/terminology/validate', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ codes: extractCodes(template) }),
  // });
  // if (!res.ok) throw await res.json() as ServiceError;
  // return res.json();
}

// ─── DEVELOPMENT SEED (generic synoptic template JSON files) ─────────────
// These were originally derived from CAP protocol content. As of the
// CAP/RCPath content-licensing cleanup, all field labels, section titles,
// and option text have been replaced with generic placeholders -- no CAP
// or RCPath content remains in these files. Structure (field types,
// section counts) is preserved so the editor/validation UI still exercises
// the same code paths. Restore real CAP-derived content only once a CAP
// license is confirmed in place.
// Each is seeded into editorStore at module load so getTemplate() returns
// real field data during development. Remove when backend API is wired in.

import BREAST_INVASIVE_JSON      from '../../data/templates/generic/breast_invasive.json';
import BREAST_DCIS_JSON          from '../../data/templates/generic/breast_dcis_resection.json';
import LUNG_ADENO_JSON           from '../../data/templates/generic/lung_adeno.json';
import PROSTATE_NEEDLE_JSON      from '../../data/templates/generic/prostate_needle_biopsy.json';
import COLON_RESECTION_JSON      from '../../data/templates/generic/colon_resection.json';
import SKIN_MELANOMA_JSON        from '../../data/templates/generic/skin_melanoma_bx.json';
import PROSTATE_RESECTION_JSON   from '../../data/templates/generic/prostate_resection.json';
import LUNG_RESECTION_JSON       from '../../data/templates/generic/lung_resection.json';
import KIDNEY_RESECTION_JSON    from '../../data/templates/generic/kidney_resection.json';
import KIDNEY_BIOPSY_JSON       from '../../data/templates/generic/kidney_biopsy.json';
import WILMS_RESECTION_JSON     from '../../data/templates/generic/wilms_resection.json';
import WILMS_BIOPSY_JSON        from '../../data/templates/generic/wilms_biopsy.json';
import AUTOPSY_GROSS_EXAM_JSON  from '../../data/templates/Autopsy/autopsy_gross_examination.json';

// Seed all generic templates (see comment block above)
editorStore.set('breast_invasive',        BREAST_INVASIVE_JSON   as any);
editorStore.set('breast_dcis_resection',  BREAST_DCIS_JSON       as any);
editorStore.set('lung_adeno',             LUNG_ADENO_JSON        as any);
editorStore.set('prostate_needle_biopsy', PROSTATE_NEEDLE_JSON   as any);
editorStore.set('colon_resection',        COLON_RESECTION_JSON   as any);
editorStore.set('skin_melanoma_bx',          SKIN_MELANOMA_JSON       as any);
editorStore.set('kidney_resection',    KIDNEY_RESECTION_JSON    as unknown as EditorTemplate);
editorStore.set('kidney_biopsy',       KIDNEY_BIOPSY_JSON       as unknown as EditorTemplate);
editorStore.set('wilms_resection',     WILMS_RESECTION_JSON     as unknown as EditorTemplate);
editorStore.set('wilms_biopsy',        WILMS_BIOPSY_JSON        as unknown as EditorTemplate);
editorStore.set('autopsy_gross_examination', AUTOPSY_GROSS_EXAM_JSON as unknown as EditorTemplate);
editorStore.set('prostate_resection',        PROSTATE_RESECTION_JSON  as any);
editorStore.set('lung_resection',            LUNG_RESECTION_JSON      as any);
// Alias — internal protocol ID used by the generic seed template above
editorStore.set('skin_invasive_melanoma_biopsy', SKIN_MELANOMA_JSON as any);

// UK generic templates (formerly RCPath-derived; see comment block above --
// same content-licensing cleanup applies. Ids/filenames were also renamed
// to drop the "rcpath_" prefix and RCPath's internal document numbering,
// e.g. rcpath_g148_breast_surgical_excision -> breast_surgical_excision.)
import UK_BREAST_JSON         from '../../data/templates/generic/breast_surgical_excision.json';
import UK_COLORECTAL_RES_JSON from '../../data/templates/generic/colorectal_resection_b.json';
import UK_COLORECTAL_LOC_JSON from '../../data/templates/generic/colorectal_local_excision.json';
import UK_COLORECTAL_FI_JSON  from '../../data/templates/generic/colorectal_further_investigations.json';
import UK_PROSTATE_BX_JSON    from '../../data/templates/generic/prostate_biopsy.json';
import UK_PROSTATE_RP_JSON    from '../../data/templates/generic/prostate_radical_prostatectomy.json';
import UK_PROSTATE_TURP_JSON  from '../../data/templates/generic/prostate_turp_enucleation.json';

editorStore.set('breast_surgical_excision',            UK_BREAST_JSON         as any);
editorStore.set('colorectal_resection_b',               UK_COLORECTAL_RES_JSON as any);
editorStore.set('colorectal_local_excision',            UK_COLORECTAL_LOC_JSON as any);
editorStore.set('colorectal_further_investigations',    UK_COLORECTAL_FI_JSON  as any);
editorStore.set('prostate_biopsy',                      UK_PROSTATE_BX_JSON   as any);
editorStore.set('prostate_radical_prostatectomy',       UK_PROSTATE_RP_JSON   as any);
editorStore.set('prostate_turp_enucleation',            UK_PROSTATE_TURP_JSON as any);

// Grossing Templates
// NOTE: unlike the generic template imports above, these do NOT rely on the
// getTemplate() fallback path (the "seeded into editorStore but not in
// PROTOCOL_REGISTRY" case) — each has an explicit PROTOCOL_REGISTRY entry
// in protocolShared.tsx (see "Grossing Templates" section there), set to
// status: 'published' so they show in Active Protocols / are selectable
// for assignment, the same as any other Base/Custom template. Both files
// must be kept in sync by id.
//
// Three peer templates (Route A/B/C), not one generic + variants — see the
// "Grossing Templates" comment block in protocolShared.tsx for why there's
// no parent/child relationship between them; Stage 0's AI assignment picks
// the right one per specimen, the same way CAP_TO_REPORT picks a Report
// Template in TemplateRoutingService.ts.
import GROSSING_STANDARD_TISSUE_JSON from '../../data/templates/Grossing/grossing_standard_tissue.json';
import GROSSING_FLUID_CYTOLOGY_JSON  from '../../data/templates/Grossing/grossing_fluid_cytology.json';
import THYROID_FNA_CYTOLOGY_JSON     from '../../data/templates/Cytology/cytology_thyroid_fna_cytology.json';
import SALIVARY_GLAND_FNA_CYTOLOGY_JSON from '../../data/templates/Cytology/cytology_salivary_gland_fna_cytology.json';
import URINE_CYTOLOGY_JSON           from '../../data/templates/Cytology/cytology_urine_cytology.json';
import PANCREATICOBILIARY_CYTOLOGY_JSON from '../../data/templates/Cytology/cytology_pancreaticobiliary_cytology.json';
import LYMPH_NODE_FNA_CYTOLOGY_JSON  from '../../data/templates/Cytology/cytology_lymph_node_fna_cytology.json';
import GROSSING_HISTOLOGY_ONLY_JSON  from '../../data/templates/Grossing/grossing_histology_only.json';

editorStore.set('grossing_standard_tissue', GROSSING_STANDARD_TISSUE_JSON as any);
editorStore.set('grossing_fluid_cytology',  GROSSING_FLUID_CYTOLOGY_JSON  as any);
editorStore.set('thyroid_fna_cytology',     THYROID_FNA_CYTOLOGY_JSON     as any);
editorStore.set('salivary_gland_fna_cytology', SALIVARY_GLAND_FNA_CYTOLOGY_JSON as any);
editorStore.set('urine_cytology',           URINE_CYTOLOGY_JSON           as any);
editorStore.set('pancreaticobiliary_cytology', PANCREATICOBILIARY_CYTOLOGY_JSON as any);
editorStore.set('lymph_node_fna_cytology',  LYMPH_NODE_FNA_CYTOLOGY_JSON  as any);
editorStore.set('grossing_histology_only',  GROSSING_HISTOLOGY_ONLY_JSON  as any);

// Hydrate from localStorage on module load — merges saved template content
// on top of the seed data, same timing and same reasoning as
// protocolShared.tsx's registry hydration: reflects prior-session edits
// immediately, and restores any template that only ever existed at
// runtime (never had a hardcoded seed import at all).
{
  const overrides = loadEditorStoreOverrides();
  Object.entries(overrides).forEach(([id, template]) => {
    editorStore.set(id, template);
  });
}
