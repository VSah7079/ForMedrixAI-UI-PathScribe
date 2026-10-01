// src/services/tatConfig/systemDefaultTatEntries.ts
// ─────────────────────────────────────────────────────────────────────────────
// Batch 353: the turnaround targets every site starts with, moved from
// components/Config/System/TATConfigSection.tsx. They have no facility,
// lab, specimen or subspecialty scope. Their ids start with "sys-"; they
// can be switched off but not deleted (isSystemDefaultTatEntryId). The API
// server seeds the same list.
// ─────────────────────────────────────────────────────────────────────────────
import type { TATEntry } from '@/types/quality/TatConfigEntry';

/** A built-in target: it can be switched off, never deleted. */
export function isSystemDefaultTatEntryId(id: string): boolean {
  return id.startsWith('sys-');
}

export const SYSTEM_DEFAULT_TAT_ENTRIES: readonly TATEntry[] = [
  { id: 'sys-ft-r',  type: 'FIRST_TOUCH',    targetHours: 4,    urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-ft-s',  type: 'FIRST_TOUCH',    targetHours: 1,    urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-tc-r',  type: 'TOTAL_CASE',     targetHours: 24,   urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-tc-s',  type: 'TOTAL_CASE',     targetHours: 4,    urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-fs-r',  type: 'FROZEN_SECTION', targetHours: 0.5,  urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-fs-s',  type: 'FROZEN_SECTION', targetHours: 0.33, urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-ci',    type: 'COLD_ISCHEMIA',  targetHours: 1,    urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-gr-r',  type: 'GROSSING',       targetHours: 4,    urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-gr-s',  type: 'GROSSING',       targetHours: 2,    urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null, active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-so-r',  type: 'SIGN_OUT',              targetHours: 4,    urgency: 'ROUTINE', facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null,           active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-so-s',  type: 'SIGN_OUT',              targetHours: 2,    urgency: 'STAT',    facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: null,           active: true, notes: 'System default', createdAt: '2024-01-01T00:00:00Z' },
  // Consultation — Response (how fast I reply to requests sent to me)
  { id: 'sys-cr-res',type: 'CONSULTATION_RESPONSE', targetHours: 24,   urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'Resident',     active: true, notes: 'Resident / Fellow — training programme standard', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-cr-pat',type: 'CONSULTATION_RESPONSE', targetHours: 48,   urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'Pathologist',  active: true, notes: 'Pathologist — informal peer review', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-cr-ext',type: 'CONSULTATION_RESPONSE', targetHours: 120,  urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'External',     active: true, notes: 'External / formal consult — 5 working days', createdAt: '2024-01-01T00:00:00Z' },
  // Consultation — Awaiting (how long before I chase up outstanding requests)
  { id: 'sys-ca-res',type: 'CONSULTATION_AWAITING', targetHours: 24,   urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'Resident',     active: true, notes: 'Resident / Fellow — escalate if no response', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-ca-pat',type: 'CONSULTATION_AWAITING', targetHours: 48,   urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'Pathologist',  active: true, notes: 'Pathologist — chase after 48h', createdAt: '2024-01-01T00:00:00Z' },
  { id: 'sys-ca-ext',type: 'CONSULTATION_AWAITING', targetHours: 120,  urgency: null,      facilityId: null, performingLabFacilityId: null, specimenId: null, subspecialtyId: null, roleId: 'External',     active: true, notes: 'External / formal consult — 5 working days', createdAt: '2024-01-01T00:00:00Z' },
];
