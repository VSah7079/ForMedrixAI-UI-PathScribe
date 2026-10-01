// src/services/templates/protocolLifecycle.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure rules for the synoptic protocol library's row actions (PS-73, Batch
// 317): Duplicate, New Version, Export JSON, Archive / Restore. The
// All Protocols and Active Protocols screens rendered these as buttons that
// did nothing, or (Active → Duplicate) opened the PUBLISHED protocol for
// direct editing. The components now only render what protocolActions()
// allows and dispatch; storage changes happen in templateService.ts.
//
//   Duplicate    a new, independent protocol: new id, name marked as a copy
//                in the user's language, patch version bump (the editor's
//                long-standing duplicate behaviour). No lineage.
//   New Version  the next version of the SAME protocol: new id, same name,
//                minor version bump, `supersedesId` → the published source.
//                The source stays live until the new version is published;
//                publishing it archives the source (templateService).
//   Archive      retires a protocol from use (no longer offered for new
//                reports). Allowed from any state. Existing reports that
//                used it keep their content.
//   Restore      brings an archived protocol back as a DRAFT, so it must go
//                through review again before anyone can report with it.
//   Export JSON  the full editor template plus summary metadata, as a file.
// ─────────────────────────────────────────────────────────────────────────────

import type { EditorTemplate } from '@/components/Config/Protocols/SynopticEditor';
import type { Protocol } from '@/components/Config/Protocols/protocolShared';
import type { CopyNameFormatter } from '@/utils/duplicateEntry';

export type VersionPart = 'major' | 'minor' | 'patch';

/** Semver bump; an empty/unset version counts as 1.0.0. */
export function bumpVersion(version: string, part: VersionPart): string {
  const [maj, min, pat] = (version || '1.0.0').split('.').map(Number);
  if (part === 'major') return `${maj + 1}.0.0`;
  if (part === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${(pat || 0) + 1}`;
}

export type ProtocolCopyKind = 'duplicate' | 'newVersion';

/** The editor's starting template for a Duplicate or New Version of `source`.
 *  `copiedFromId` lets the first save inherit the source's registry-only
 *  attributes (templateService.saveDraft → inheritedCopyAttributes). */
export function prepareProtocolCopy(
  source: EditorTemplate,
  kind: ProtocolCopyKind,
  { copyName, newId }: { copyName: CopyNameFormatter; newId: () => string },
): EditorTemplate {
  const copy = structuredClone(source);
  if (kind === 'newVersion') {
    return { ...copy, id: newId(), name: source.name, version: bumpVersion(source.version, 'minor'), supersedesId: source.id, copiedFromId: source.id };
  }
  return { ...copy, id: newId(), name: copyName(source.name), version: bumpVersion(source.version, 'patch'), supersedesId: undefined, copiedFromId: source.id };
}

/** Another live protocol already using this name (case-insensitive).
 *  Archived protocols, the protocol itself, and its own version lineage (the
 *  version it supersedes, or a version superseding it) don't count: a new
 *  version deliberately keeps its predecessor's name. */
export function findProtocolNameConflict(
  registry: Protocol[],
  template: { id: string; name: string; supersedesId?: string },
): Protocol | undefined {
  const name = template.name.trim().toLowerCase();
  if (!name) return undefined;
  return registry.find(p =>
    p.status !== 'archived' &&
    p.id !== template.id &&
    p.id !== template.supersedesId &&
    p.supersedesId !== template.id &&
    p.name.trim().toLowerCase() === name,
  );
}

export interface ProtocolActions {
  /** Read-only reviewer view (published). */
  view: boolean;
  /** Reviewer workflow (not yet published). */
  openReviewer: boolean;
  openEditor: boolean;
  duplicate: boolean;
  exportJson: boolean;
  newVersion: boolean;
  archive: boolean;
  restore: boolean;
}

/** Which row actions a protocol offers in its current state. */
export function protocolActions(p: Pick<Protocol, 'status'>): ProtocolActions {
  const archived = p.status === 'archived';
  const published = p.status === 'published';
  return {
    view: published,
    openReviewer: !published && !archived,
    openEditor: !published && !archived,
    duplicate: !archived,
    exportJson: true,
    newVersion: published,
    archive: !archived,
    restore: archived,
  };
}

/** All Protocols status filter. "All" means every protocol still in use;
 *  archived protocols only appear under their own Archived filter. */
export function matchesStatusFilter(p: Pick<Protocol, 'status'>, filter: 'all' | Protocol['status']): boolean {
  return filter === 'all' ? p.status !== 'archived' : p.status === filter;
}

/** Registry attributes a copy inherits from the protocol it was copied from,
 *  on its first save. The editor template doesn't carry them, and without
 *  this a copy of a non-diagnostic Grossing checklist would default to
 *  diagnostic (isDiagnosticProtocol treats unset as true) and to type 'Custom'. */
export function inheritedCopyAttributes(origin: Pick<Protocol, 'isDiagnostic' | 'type' | 'group'> | undefined): Partial<Pick<Protocol, 'isDiagnostic' | 'type' | 'group'>> {
  if (!origin) return {};
  return {
    ...(origin.isDiagnostic !== undefined ? { isDiagnostic: origin.isDiagnostic } : {}),
    ...(origin.type ? { type: origin.type } : {}),
    ...(origin.group ? { group: origin.group } : {}),
  };
}

export const PROTOCOL_EXPORT_FORMAT = 'pathscribe-synoptic-protocol';
export const PROTOCOL_EXPORT_FORMAT_VERSION = 1;

export interface ProtocolExport {
  format: typeof PROTOCOL_EXPORT_FORMAT;
  formatVersion: number;
  exportedAt: string;
  protocol: {
    id: string; name: string; source: string; version: string; category: string;
    status: string; isDiagnostic?: boolean; supersedesId?: string;
  };
  template: EditorTemplate;
}

/** File name: the protocol name (letters/digits in any script kept) + version. */
export function protocolExportFilename(name: string, version: string): string {
  const slug = name.normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'protocol';
  return `${slug}-v${version || '1.0.0'}.json`;
}

export function buildProtocolExport(
  summary: { id: string; name: string; source: string; version: string; category: string; status: string; isDiagnostic?: boolean; supersedesId?: string },
  template: EditorTemplate,
  exportedAt: string,
): { filename: string; data: ProtocolExport } {
  return {
    filename: protocolExportFilename(summary.name, summary.version),
    data: {
      format: PROTOCOL_EXPORT_FORMAT,
      formatVersion: PROTOCOL_EXPORT_FORMAT_VERSION,
      exportedAt,
      protocol: {
        id: summary.id, name: summary.name, source: summary.source, version: summary.version,
        category: summary.category, status: summary.status, isDiagnostic: summary.isDiagnostic, supersedesId: summary.supersedesId,
      },
      template: structuredClone(template),
    },
  };
}

/** Where the editor should point after a save (PS-63 walkthrough, Batch
 *  326). A new template or a Duplicate / New Version gets its own id when
 *  the editor opens, but the address bar still shows /new or the source's
 *  id with ?mode=duplicate. Left like that, a page refresh opens yet
 *  another fresh copy and the next save creates a second protocol. After
 *  the first save the editor moves to the saved protocol's own address;
 *  null means it is already there. */
export function editorUrlAfterSave(routeTemplateId: string | undefined, savedId: string, fromSection: string | null): string | null {
  if (routeTemplateId === savedId) return null;
  return `/template-editor/${encodeURIComponent(savedId)}${fromSection ? `?from=${encodeURIComponent(fromSection)}` : ''}`;
}
