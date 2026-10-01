// src/services/protocols/mockProtocolService.ts

import type { ServiceResult, ID } from '../types';
import { storageGet, storageSet } from '../mockStorage';
import type { IProtocolService, Protocol } from './IProtocolService';

const load = () => storageGet<Protocol[]>('pathscribe_protocols', [
  {
    id: 'proto-medical-renal',
    name: 'Medical Renal Protocol',
    description: 'Native/transplant kidney biopsy — splits into Light Microscopy, Immunofluorescence, and Electron Microscopy tracks. Referenced by any specimen type that needs it (Kidney Biopsy, Native; Kidney Biopsy, Transplant; etc.) — update this once, it cascades everywhere it\'s mapped.',
    requiresTriage: true,
    triageChecklist: [
      'Verify specimen adequacy under dissecting microscope (count glomeruli if possible).',
      'Split core into three segments: LM (largest portion), IF, and EM.',
    ],
    pathways: [
      {
        id: 'path-renal-lm', pathwayName: 'Light Microscopy', materialKind: 'block',
        fixativeType: '10% Neutral Buffered Formalin', requiresDecal: false, processingFormat: 'Standard',
        tasks: [
          { id: 't1', stepOrder: 1, action: 'Cut Level 1', stainTypeIds: ['st-he'] },
          { id: 't2', stepOrder: 2, action: 'Cut Level 2', stainTypeIds: ['st-pas'] },
          { id: 't3', stepOrder: 3, action: 'Cut Level 3', stainTypeIds: ['st-gms'] },
          { id: 't4', stepOrder: 4, action: 'Cut Level 4', stainTypeIds: ['st-trichrome'] },
          { id: 't5', stepOrder: 5, action: 'Cut Level 5', stainTypeIds: [], isHold: true },
        ],
      },
      {
        id: 'path-renal-if', pathwayName: 'Immunofluorescence', materialKind: 'block',
        fixativeType: "Michel's Transport Medium", requiresDecal: false, processingFormat: 'Frozen Block',
        tasks: [
          { id: 't6', stepOrder: 1, action: 'Frozen Section', stainTypeIds: ['st-igg', 'st-iga', 'st-igm', 'st-c3', 'st-c1q', 'st-kappa', 'st-lambda'] },
        ],
      },
      {
        id: 'path-renal-em', pathwayName: 'Electron Microscopy', materialKind: 'block',
        fixativeType: 'Glutaraldehyde', requiresDecal: false, processingFormat: 'Resin Grid',
        tasks: [
          { id: 't7', stepOrder: 1, action: 'Ultra-thin Sectioning', stainTypeIds: ['st-uranyl-lead'] },
        ],
      },
    ],
    active: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(),
  },
  // Real, per direct follow-up: "add tissue descriptions on
  // cassettes... then test a protocol." A real, second example
  // Protocol — Autopsy Cardiac Sectioning — chosen deliberately to
  // match content already built: the Autopsy Grossing Synoptic's own
  // Cardiovascular section already documents all 4 real coronary
  // vessels (LAD/LCX/RCA/PDA) by name; this Protocol is what would
  // actually generate one real block per vessel at accessioning,
  // rather than a single undifferentiated cardiac block. Illustrative
  // "preference card" seed data, not asserted clinical fact — same
  // as the Medical Renal Protocol above, editable the same way.
  {
    id: 'proto-autopsy-cardiac-sectioning',
    name: 'Autopsy \u2014 Cardiac Sectioning Protocol',
    description: 'Whole heart at autopsy \u2014 standard sectioning for coronary artery examination (one block per major vessel: LAD, LCX, RCA, PDA) plus representative myocardial blocks.',
    requiresTriage: false,
    pathways: [
      {
        id: 'path-autopsy-coronary-arteries', pathwayName: 'Coronary Arteries', materialKind: 'block',
        fixativeType: '10% Neutral Buffered Formalin', requiresDecal: false, processingFormat: 'Standard',
        // Real, deliberate defaultCount: 4 \u2014 one real block per
        // real, named vessel (LAD, LCX, RCA, PDA), matching the
        // Autopsy Grossing Synoptic's own Cardiovascular section
        // exactly rather than an arbitrary count.
        defaultCount: 4,
        tasks: [
          { id: 't1', stepOrder: 1, action: 'Cut Section', stainTypeIds: ['st-he'] },
        ],
      },
      {
        id: 'path-autopsy-myocardium', pathwayName: 'Myocardium', materialKind: 'block',
        fixativeType: '10% Neutral Buffered Formalin', requiresDecal: false, processingFormat: 'Standard',
        // Real, deliberate defaultCount: 2 \u2014 representative LV
        // free wall and septum, the two real sites the Autopsy
        // Grossing Synoptic's own Myocardium & Valvular Apparatus
        // field already documents findings against.
        defaultCount: 2,
        tasks: [
          { id: 't2', stepOrder: 1, action: 'Cut Section', stainTypeIds: ['st-he'] },
        ],
      },
    ],
    active: true, version: 1, updatedBy: 'system', updatedAt: new Date().toISOString(),
  },
]);
const persist = (data: Protocol[]) => storageSet('pathscribe_protocols', data);
let PROTOCOLS: Protocol[] = load();

const ok = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

export const mockProtocolService: IProtocolService = {
  async getAll() {
    return ok([...PROTOCOLS]);
  },
  async add(entry) {
    const created: Protocol = {
      ...entry,
      id: `proto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      version: 1, updatedBy: 'admin', updatedAt: new Date().toISOString(),
    };
    PROTOCOLS = [...PROTOCOLS, created];
    persist(PROTOCOLS);
    return ok(created);
  },
  async update(id: ID, changes) {
    let updated: Protocol | undefined;
    PROTOCOLS = PROTOCOLS.map(p => {
      if (p.id !== id) return p;
      // Snapshot the pre-change state before applying anything, so
      // restoreVersion has something real to go back to.
      const { history: _prevHistory, ...snapshot } = p;
      const historyEntry = {
        version:  p.version,
        snapshot,
        savedBy:  p.updatedBy,
        savedAt:  p.updatedAt,
      };
      updated = {
        ...p, ...changes,
        version: p.version + 1, updatedBy: 'admin', updatedAt: new Date().toISOString(),
        history: [...(p.history ?? []), historyEntry],
      };
      return updated;
    });
    persist(PROTOCOLS);
    if (!updated) return { ok: false, error: 'Not found' } as ServiceResult<Protocol>;
    return ok(updated);
  },

  async restoreVersion(id: ID, version: number) {
    const current = PROTOCOLS.find(p => p.id === id);
    if (!current) return { ok: false, error: 'Not found' } as ServiceResult<Protocol>;
    const entry = current.history?.find(h => h.version === version);
    if (!entry) return { ok: false, error: `Version ${version} not found in history` } as ServiceResult<Protocol>;
    // Restoring is itself a new, recorded version — not a rewrite of
    // history — so the version you're restoring FROM stays in history
    // too, and this restore can itself be undone later.
    return this.update(id, entry.snapshot);
  },
};
