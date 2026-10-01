import { describe, it, expect } from 'vitest';
import {
  editorUrlAfterSave,
  bumpVersion,
  prepareProtocolCopy,
  findProtocolNameConflict,
  protocolActions,
  matchesStatusFilter,
  protocolExportFilename,
  buildProtocolExport,
  PROTOCOL_EXPORT_FORMAT,
  inheritedCopyAttributes,
} from './protocolLifecycle';
import type { EditorTemplate } from '@/components/Config/Protocols/SynopticEditor';
import type { Protocol } from '@/components/Config/Protocols/protocolShared';

const de = (name: string) => `${name} (Kopie)`;
const source: EditorTemplate = {
  id: 'breast_invasive', name: 'Breast Invasive Carcinoma', source: 'CAP', version: '4.10.2', category: 'BREAST',
  sections: [{ id: 's1', title: 'Tumor', collapsed: false, fields: [{ id: 'f1', label: 'Size', type: 'numeric', required: true, snomed: '', icd: '', options: [] }] }],
};
const proto = (over: Partial<Protocol>): Protocol => ({
  id: 'p', name: 'X', category: 'BREAST', version: '1.0.0', source: 'CAP', type: 'Resection', status: 'published',
  fields: 1, snomedPct: 0, icdPct: 0, lastModified: '2026-01-01', owner: 'o', ...over,
});

describe('bumpVersion', () => {
  it('bumps each semver part and treats empty as 1.0.0', () => {
    expect(bumpVersion('4.10.2', 'major')).toBe('5.0.0');
    expect(bumpVersion('4.10.2', 'minor')).toBe('4.11.0');
    expect(bumpVersion('4.10.2', 'patch')).toBe('4.10.3');
    expect(bumpVersion('', 'patch')).toBe('1.0.1');
  });
});

describe('prepareProtocolCopy', () => {
  it('Duplicate: new id, localized copy name, patch bump, no lineage, deep copy', () => {
    const copy = prepareProtocolCopy({ ...source, supersedesId: 'older' }, 'duplicate', { copyName: de, newId: () => 'new1' });
    expect(copy.id).toBe('new1');
    expect(copy.name).toBe('Breast Invasive Carcinoma (Kopie)');
    expect(copy.version).toBe('4.10.3');
    expect(copy.supersedesId).toBeUndefined();
    expect(copy.copiedFromId).toBe('breast_invasive');
    copy.sections[0].fields[0].label = 'changed';
    expect(source.sections[0].fields[0].label).toBe('Size');
  });

  it('New Version: new id, SAME name, minor bump, supersedes the source', () => {
    const next = prepareProtocolCopy(source, 'newVersion', { copyName: de, newId: () => 'new2' });
    expect(next).toMatchObject({ id: 'new2', name: 'Breast Invasive Carcinoma', version: '4.11.0', supersedesId: 'breast_invasive' });
  });
});

describe('findProtocolNameConflict', () => {
  const registry = [
    proto({ id: 'v1', name: 'Breast Invasive Carcinoma', status: 'published' }),
    proto({ id: 'old', name: 'Colon Resection', status: 'archived' }),
    proto({ id: 'lung', name: 'Lung Resection' }),
  ];
  it('a new version may keep its predecessor\'s name', () => {
    expect(findProtocolNameConflict(registry, { id: 'v2', name: 'Breast Invasive Carcinoma', supersedesId: 'v1' })).toBeUndefined();
  });
  it('a different protocol may not reuse a live name (case-insensitive)', () => {
    expect(findProtocolNameConflict(registry, { id: 'n', name: 'lung resection' })?.id).toBe('lung');
  });
  it('archived protocols do not block a name', () => {
    expect(findProtocolNameConflict(registry, { id: 'n', name: 'Colon Resection' })).toBeUndefined();
  });
  it('editing the predecessor is not blocked by its own new-version draft', () => {
    const withDraft = [...registry, proto({ id: 'v2', name: 'Breast Invasive Carcinoma', status: 'draft', supersedesId: 'v1' })];
    expect(findProtocolNameConflict(withDraft, { id: 'v1', name: 'Breast Invasive Carcinoma' })).toBeUndefined();
  });
});

describe('protocolActions', () => {
  it('published: view, duplicate, export, new version, archive', () => {
    expect(protocolActions({ status: 'published' })).toEqual({
      view: true, openReviewer: false, openEditor: false, duplicate: true, exportJson: true, newVersion: true, archive: true, restore: false,
    });
  });
  it('draft: reviewer, editor, duplicate, export, archive — no new version', () => {
    const a = protocolActions({ status: 'draft' });
    expect(a).toMatchObject({ openReviewer: true, openEditor: true, duplicate: true, newVersion: false, archive: true, restore: false });
  });
  it('archived: only export and restore', () => {
    expect(protocolActions({ status: 'archived' })).toEqual({
      view: false, openReviewer: false, openEditor: false, duplicate: false, exportJson: true, newVersion: false, archive: false, restore: true,
    });
  });
});

describe('matchesStatusFilter', () => {
  it('"all" hides archived; each state filter matches exactly', () => {
    expect(matchesStatusFilter({ status: 'archived' }, 'all')).toBe(false);
    expect(matchesStatusFilter({ status: 'draft' }, 'all')).toBe(true);
    expect(matchesStatusFilter({ status: 'archived' }, 'archived')).toBe(true);
    expect(matchesStatusFilter({ status: 'draft' }, 'published')).toBe(false);
  });
});

describe('export', () => {
  it('file name keeps letters in any script and the version', () => {
    expect(protocolExportFilename('Breast Invasive Carcinoma', '4.10.2')).toBe('breast-invasive-carcinoma-v4.10.2.json');
    expect(protocolExportFilename('Mammakarzinom (Kopie)', '1.0.0')).toBe('mammakarzinom-kopie-v1.0.0.json');
    expect(protocolExportFilename('유방암 절제', '2.0.0')).toBe('유방암-절제-v2.0.0.json');
    expect(protocolExportFilename('***', '')).toBe('protocol-v1.0.0.json');
  });
  it('payload carries the format marker, metadata and a copy of the full template', () => {
    const { filename, data } = buildProtocolExport(
      { id: 'breast_invasive', name: source.name, source: 'CAP', version: '4.10.2', category: 'BREAST', status: 'published' },
      source, '2026-09-24T00:00:00Z',
    );
    expect(filename).toBe('breast-invasive-carcinoma-v4.10.2.json');
    expect(data.format).toBe(PROTOCOL_EXPORT_FORMAT);
    expect(data.protocol).toMatchObject({ id: 'breast_invasive', status: 'published' });
    expect(data.template).toEqual(source);
    expect(data.template).not.toBe(source);
  });
});

describe('inheritedCopyAttributes', () => {
  it('a copy keeps its source\'s non-diagnostic flag, type and group (regression: a Grossing copy became diagnostic)', () => {
    expect(inheritedCopyAttributes({ isDiagnostic: false, type: 'Non-cancer / Custom', group: 'Grossing' }))
      .toEqual({ isDiagnostic: false, type: 'Non-cancer / Custom', group: 'Grossing' });
  });
  it('nothing to inherit without a source, and unset values stay unset', () => {
    expect(inheritedCopyAttributes(undefined)).toEqual({});
    expect(inheritedCopyAttributes({ type: 'Resection' } as never)).toEqual({ type: 'Resection' });
  });
});

describe('editorUrlAfterSave (PS-63)', () => {
  it('moves a new template or a copy to its own address after the first save', () => {
    expect(editorUrlAfterSave('new', 'abc123', null)).toBe('/template-editor/abc123');
    expect(editorUrlAfterSave(undefined, 'abc123', null)).toBe('/template-editor/abc123');
    expect(editorUrlAfterSave('colon_resection', 'abc123', 'all')).toBe('/template-editor/abc123?from=all');
  });
  it('leaves an existing protocol where it is', () => {
    expect(editorUrlAfterSave('abc123', 'abc123', 'review')).toBeNull();
  });
});
