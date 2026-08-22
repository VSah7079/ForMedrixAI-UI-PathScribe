// src/services/batches/ItemDisposition.ts
// ─────────────────────────────────────────────────────────────────────────────
// Real feature, per direct follow-up: "I would like to also have a
// Disposal workflow as well. However, for our UK customers we need to
// be careful because they may need to actually send material back to
// the patient."
//
// Confirmed directly before building, not assumed: RCPath's own
// published guidance (Best Practice Recommendations: The retention and
// storage of pathological records and specimens) states that a
// pathologist should ensure a patient understands the consequences of
// requesting destruction or return of their own tissue, but "if a
// patient so informed still insists on destruction or return, consent
// has explicitly been withdrawn and laboratories must comply with the
// patient's request." The same guidance separately notes Scotland's
// own legal position differs (blocks/slides are treated as hospital
// property, part of the medical record) — a genuinely real, open
// distinction even within "the UK," which is exactly why this app
// already tracks GB_EW/GB_SCT/GB_NIR as separate jurisdictions rather
// than one "UK" value.
//
// Real, deliberate design choice: the underlying safety gate (every
// item needs an explicit, recorded disposition before a Disposal batch
// can complete) is universal, not weakened outside the UK — a patient
// asking for their own material back is not exclusively a UK scenario,
// and building something less careful elsewhere would be a worse,
// less defensible default. What genuinely varies by jurisdiction is a
// prominent, correctly-cited reminder banner surfaced at exactly the
// point of use for jurisdictions with a real, documented duty to
// comply with such a request.
//
// This file encodes the technical pattern and cites its real source.
// Whether a given jurisdiction's disposition rules are accurately
// reflected here, and whether the underlying list needs updating, is
// a legal/compliance determination for the customer's own counsel —
// same real posture as types/case/ErasureCertificate.ts's own
// retention-hold gate. Not something to treat as final or
// authoritative without that sign-off.
// ─────────────────────────────────────────────────────────────────────────────

import type { Jurisdiction } from '@/types/systemConfig';

export type ItemDispositionType =
  | 'cleared_for_disposal'
  | 'return_to_patient'
  | 'transfer_to_other_facility'
  | 'retain_hold';

export const ITEM_DISPOSITION_LABEL: Record<ItemDispositionType, string> = {
  cleared_for_disposal: 'Cleared for Disposal',
  return_to_patient: 'Return to Patient',
  transfer_to_other_facility: 'Transfer to Other Facility',
  retain_hold: 'Retain — Hold',
};

export interface ItemDispositionRecord {
  disposition: ItemDispositionType;
  /** Required for anything other than 'cleared_for_disposal' — same
   *  real, mandatory-narrative reasoning as every other override/
   *  exception path elsewhere in this app (e.g. Batch supervisor
   *  override, discordance reconciliation). */
  note?: string;
  checkedAt: string;
  checkedByUserId: string;
  checkedByUserName: string;
}

/**
 * Jurisdictions where this app surfaces a prominent, explicit reminder
 * before disposal — per RCPath's own guidance (see this file's own
 * header). Deliberately a plain, exported list — not buried inside
 * conditional logic — so it's visible, auditable, and easy to correct
 * if a customer's own legal/compliance review finds it wrong or
 * incomplete for their situation.
 */
export const DISPOSAL_REMINDER_JURISDICTIONS: Jurisdiction[] = ['GB_EW', 'GB_SCT', 'GB_NIR'];
