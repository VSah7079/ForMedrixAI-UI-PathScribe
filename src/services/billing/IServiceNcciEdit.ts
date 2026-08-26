// src/services/billing/IServiceNcciEdit.ts
import type { ServiceResult } from '../types';
import type { NcciPtpEditPair, NcciPtpEditImport } from '@/types/billing/NcciPtpEdit';

export interface INcciEditService {
  /** The real, active import's own pairs - what a real bundling check
   *  actually runs against. */
  getAll(): Promise<ServiceResult<NcciPtpEditPair[]>>;
  getCurrentImport(): Promise<ServiceResult<NcciPtpEditImport | null>>;
  /** Every real import - active, pending, approved (superseded), or
   *  rejected - for the approval queue and history. */
  getAllImports(): Promise<ServiceResult<NcciPtpEditImport[]>>;
  /** Real, per direct follow-up: "we just need to track the changes
   *  so we know who is responsible and have it go through the
   *  approval process." Creates a new, PENDING_APPROVAL import -
   *  never replaces the real active table immediately. A different,
   *  real reviewer must approve it first (see approveImport below).
   *  Used both for a full quarterly wholesale replacement and for a
   *  single-pair manual correction (built from the active import's
   *  own pairs with one real pair changed). */
  importQuarter(pairs: Omit<NcciPtpEditPair, 'id'>[], quarterVersion: string, importedBy: string): Promise<ServiceResult<NcciPtpEditImport>>;

  /** Real, hard-enforced Four-Eyes Principle - mirrors
   *  mockModifierDictionaryService.ts's own approveVersion exactly.
   *  The person who submitted this import can never be the one who
   *  approves it. */
  approveImport(importId: string, reviewedBy: string): Promise<ServiceResult<NcciPtpEditImport>>;

  /** Same real, hard-enforced dual-control gate as approveImport.
   *  Requires a real rejection reason - never activates. */
  rejectImport(importId: string, reviewedBy: string, rejectionReason: string): Promise<ServiceResult<NcciPtpEditImport>>;
}
