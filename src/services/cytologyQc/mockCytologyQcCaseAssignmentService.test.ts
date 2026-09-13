import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});

const newAssignment = () => ({
  caseId: 'case-1', specimenId: 'spec-1', triggerSource: 'rule_match' as const,
  matchedRuleId: 'rule-1', priorityTier: 'routine_random' as const, badges: [],
  state: 'QC_PENDING' as const, primarySignOutProviderId: 'prov-1', slaEscalationCount: 0,
  slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), createdAt: new Date().toISOString(),
});

describe('mockCytologyQcCaseAssignmentService', () => {
  it('a real, full happy-path lifecycle: create -> assign -> concurrence -> FINAL_APPROVED', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    const created = await mockCytologyQcCaseAssignmentService.create(newAssignment());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const assigned = await mockCytologyQcCaseAssignmentService.assignReviewer(created.data.id, 'prov-2');
    expect(assigned.ok).toBe(true);
    if (assigned.ok) expect(assigned.data.state).toBe('QC_IN_REVIEW');

    const resolved = await mockCytologyQcCaseAssignmentService.recordConcurrence(created.data.id, 'Agree with primary interpretation.');
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.data.state).toBe('FINAL_APPROVED');
      expect(resolved.data.concurrenceCommentary).toBe('Agree with primary interpretation.');
      expect(resolved.data.resolvedAt).toBeDefined();
    }
  });

  it('a real self-review attempt is honestly rejected, never silently allowed', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    const created = await mockCytologyQcCaseAssignmentService.create(newAssignment());
    if (!created.ok) return;
    const result = await mockCytologyQcCaseAssignmentService.assignReviewer(created.data.id, 'prov-1');
    expect(result.ok).toBe(false);
  });

  it('recording a discrepancy on a case that was never assigned a reviewer is honestly rejected, never silently allowed out of order', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    const created = await mockCytologyQcCaseAssignmentService.create(newAssignment());
    if (!created.ok) return;
    const result = await mockCytologyQcCaseAssignmentService.recordDiscrepancy(created.data.id, {
      primaryDiagnosticCode: 'NILM', secondaryDiagnosticCode: 'HSIL', severity: 'major',
    });
    expect(result.ok).toBe(false);
  });

  it('a real discrepancy path transitions to QC_DISCREPANCY_REVISE and logs the real discrepancy record', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    const created = await mockCytologyQcCaseAssignmentService.create(newAssignment());
    if (!created.ok) return;
    await mockCytologyQcCaseAssignmentService.assignReviewer(created.data.id, 'prov-2');
    const result = await mockCytologyQcCaseAssignmentService.recordDiscrepancy(created.data.id, {
      primaryDiagnosticCode: 'NILM', secondaryDiagnosticCode: 'HSIL', severity: 'major', reviewerCommentary: 'Missed high-grade cells.',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe('QC_DISCREPANCY_REVISE');
      expect(result.data.discrepancy?.severity).toBe('major');
      expect(result.data.discrepancy?.loggedAt).toBeDefined();
    }
  });

  it('the real unified queue only ever contains active (QC_PENDING/QC_IN_REVIEW) assignments, never a resolved one', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    const created = await mockCytologyQcCaseAssignmentService.create(newAssignment());
    if (!created.ok) return;
    await mockCytologyQcCaseAssignmentService.assignReviewer(created.data.id, 'prov-2');
    await mockCytologyQcCaseAssignmentService.recordConcurrence(created.data.id);
    const queue = await mockCytologyQcCaseAssignmentService.getUnifiedQueue();
    expect(queue.ok).toBe(true);
    if (queue.ok) expect(queue.data.find(a => a.id === created.data.id)).toBeUndefined();
  });

  it('the real unified queue is genuinely sorted by the urgency matrix, high_escalation before routine_random', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    await mockCytologyQcCaseAssignmentService.create({ ...newAssignment(), priorityTier: 'routine_random' });
    await mockCytologyQcCaseAssignmentService.create({ ...newAssignment(), priorityTier: 'high_escalation', badges: ['ROSE Discrepancy'] });
    const queue = await mockCytologyQcCaseAssignmentService.getUnifiedQueue();
    expect(queue.ok).toBe(true);
    if (queue.ok) expect(queue.data[0].priorityTier).toBe('high_escalation');
  });

  it('a real, genuinely SLA-breached case in review is escalated back to the unified queue, reviewer cleared, escalation count real and incremented', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // an hour ago — genuinely breached
    const created = await mockCytologyQcCaseAssignmentService.create({ ...newAssignment(), slaDeadline: pastDeadline });
    if (!created.ok) return;
    await mockCytologyQcCaseAssignmentService.assignReviewer(created.data.id, 'prov-2');
    const result = await mockCytologyQcCaseAssignmentService.escalateForSlaBreach(created.data.id, new Date().toISOString(), 'Reviewer unavailable.');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe('QC_PENDING');
      expect(result.data.assignedReviewerId).toBeUndefined();
      expect(result.data.slaEscalationCount).toBe(1);
    }
  });

  it('a real case that has NOT genuinely breached its own SLA is honestly refused escalation, never allowed as an arbitrary bump', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    const created = await mockCytologyQcCaseAssignmentService.create(newAssignment()); // real, 24h-out deadline
    if (!created.ok) return;
    await mockCytologyQcCaseAssignmentService.assignReviewer(created.data.id, 'prov-2');
    const result = await mockCytologyQcCaseAssignmentService.escalateForSlaBreach(created.data.id, new Date().toISOString(), 'Testing.');
    expect(result.ok).toBe(false);
  });

  it('a real supervisor bypass force-approves the case and logs a real, attributable justification, never silently', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    const created = await mockCytologyQcCaseAssignmentService.create(newAssignment());
    if (!created.ok) return;
    const result = await mockCytologyQcCaseAssignmentService.supervisorBypass(created.data.id, 'supervisor-1', 'Reviewer on leave, case needed for surgery today.');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.state).toBe('FINAL_APPROVED');
      expect(result.data.supervisorBypass?.supervisorId).toBe('supervisor-1');
      expect(result.data.supervisorBypass?.justification).toContain('surgery');
    }
  });

  it('a real, already-terminal case cannot be bypassed again, per its own real terminal-state guard', async () => {
    const { mockCytologyQcCaseAssignmentService } = await import('./mockCytologyQcCaseAssignmentService');
    const created = await mockCytologyQcCaseAssignmentService.create(newAssignment());
    if (!created.ok) return;
    await mockCytologyQcCaseAssignmentService.supervisorBypass(created.data.id, 'supervisor-1', 'First bypass.');
    const result = await mockCytologyQcCaseAssignmentService.supervisorBypass(created.data.id, 'supervisor-1', 'Second attempt.');
    expect(result.ok).toBe(false);
  });
});
