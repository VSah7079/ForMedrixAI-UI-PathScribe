// src/utils/accessRequests.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared admin-notification helper for any "request access" flow. Originally
// lived privately inside WorklistTable.tsx (built for the Pediatric Access
// modal); extracted here so a second, genuinely separate flow — Pool
// membership access requests, per direct product decision: pool-restricted
// cases should stay visible with a real request-access path, the same as
// Pediatric, rather than being hidden entirely — can reuse the exact same,
// already-fixed recipient-resolution logic rather than duplicating it.
//
// Real bug fix (carried forward from the original, Pediatric-only version):
// both Pediatric and Orchestration access-request buttons used to send a
// message to a hardcoded `recipientId: 'u3'`, `recipientName: 'System
// Admin'` — but no user with id 'u3' exists anywhere in the real, canonical
// services/users/mockUserService.ts directory (confirmed directly: real ids
// are '1'-'10', 'PATH-xxx', 'PA-001'). 'u3' was only ever a stand-in id from
// AppShell.tsx's own, separate, hand-maintained INTERNAL_USERS messaging
// directory — the exact same real ID-collision pattern
// RequestReviewModal.tsx's own header comment already documents and fixed
// ('u3'/'u4' meaning different people in different, disconnected lists).
// Sending to 'u3' here meant these access-request messages were silently
// vanishing — no real inbox anywhere ever received them.
//
// Real fix: sources real, active Admin-role users from the same canonical
// userService RequestReviewModal.tsx, StaffTab.tsx, and CaseTeamModal.tsx
// all already use. Scoped to the requesting user's own organisation first —
// the UI copy says "your System Admin", and an admin at an unrelated
// hospital across the world has no real authority to grant a facility-level
// or staff-record permission for a different organisation's case. Falls
// back to every real admin system-wide only if that organisation genuinely
// has none configured yet, so the request is never silently dropped the way
// it was before. messageService.send() takes one recipient at a time, so a
// real admin pool sends one message per real admin, not just the first one
// found.
// ─────────────────────────────────────────────────────────────────────────────

import { messageService, userService } from '@/services';

export async function sendAccessRequestToAdmins(
  requestingUser: { id: string; name: string; organisationId?: string },
  subject: string,
  body: string,
  configLink: string,
): Promise<void> {
  const usersRes = await userService.getAll();
  if (!usersRes.ok) return;
  const allAdmins = usersRes.data.filter(u =>
    u.status === 'Active' && u.roles.includes('Admin') && u.id !== requestingUser.id
  );
  const orgAdmins = requestingUser.organisationId
    ? allAdmins.filter(u => u.organisationId === requestingUser.organisationId)
    : [];
  const recipients = orgAdmins.length > 0 ? orgAdmins : allAdmins;
  await Promise.all(recipients.map(admin => messageService.send({
    senderId: requestingUser.id,
    senderName: requestingUser.name,
    recipientId: admin.id,
    recipientName: `${admin.firstName} ${admin.lastName}`.trim(),
    subject,
    body,
    configLink,
    timestamp: new Date(),
    isUrgent: false,
  })));
}
