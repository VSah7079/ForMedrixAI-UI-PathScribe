// src/utils/physicianDisplay.ts
// ─────────────────────────────────────────────────────────────
// Real, shared physician-display helpers — extracted from
// AmendmentModal.tsx (where this real, already-refined "search
// staff, pick a real match, see contact info" picker pattern was
// first built and user-tested — see that file's own "FR feedback #3"
// / "per feedback" comments) so a second real consumer
// (AccessionPage.tsx, per PS-81's real, open UX question) can reuse
// the exact same logic rather than a parallel, duplicated copy that
// could drift out of sync.
// ─────────────────────────────────────────────────────────────

import type { Physician } from '@/services/physicians/IPhysicianService';

export const initials = (givenNames: string, familyNames: string): string =>
  `${givenNames?.[0] ?? ''}${familyNames?.[0] ?? ''}`.toUpperCase();

const AVATAR_COLOR_CLASSES = ['ps-avatar-color-0', 'ps-avatar-color-1', 'ps-avatar-color-2', 'ps-avatar-color-3', 'ps-avatar-color-4', 'ps-avatar-color-5'];
export const avatarColorClass = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLOR_CLASSES[Math.abs(hash) % AVATAR_COLOR_CLASSES.length];
};

export const contactRowsFor = (p: Physician): { icon: string; value: string; isPreferred: boolean }[] => {
  const rows = [
    { icon: '📞', value: p.phone, isPreferred: p.preferredContact === 'Phone' },
    { icon: '📠', value: p.fax, isPreferred: p.preferredContact === 'Fax' },
    { icon: '✉️', value: p.email, isPreferred: p.preferredContact === 'Email' },
  ].filter(c => c.value);
  // Preferred contact method first, so it's the one visible even if the
  // row can't fit all three.
  rows.sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred));
  return rows;
};
