import { describe, it, expect } from 'vitest';
import { resolveCytologyQcComplianceReport } from './resolveCytologyQcComplianceReport';
import type { CytologyQcCaseAssignment } from '@/types/cytologyQc/CytologyQcRule';

const base = (over: Partial<CytologyQcCaseAssignment>): CytologyQcCaseAssignment => ({
  id: 'a1', caseId: 'case-1', specimenId: 'spec-1', triggerSource: 'rule_match',
  priorityTier: 'routine_random', badges: [], state: 'QC_PENDING',
  primarySignOutProviderId: 'prov-1', slaEscalationCount: 0,
  slaDeadline: new Date().toISOString(), createdAt: new Date().toISOString(),
  ...over,
});

describe('resolveCytologyQcComplianceReport', () => {
  it('an empty real assignment list produces a real, honest zero report with an undefined rate, never a fabricated 0%', () => {
    const report = resolveCytologyQcComplianceReport([]);
    expect(report.totalAssignments).toBe(0);
    expect(report.discrepancyRatePercent).toBeUndefined();
  });

  it('a real, still-pending assignment (never reviewed) is counted in totals but never in resolved/discrepancy stats', () => {
    const report = resolveCytologyQcComplianceReport([base({ state: 'QC_PENDING' })]);
    expect(report.totalAssignments).toBe(1);
    expect(report.totalResolved).toBe(0);
    expect(report.discrepancyRatePercent).toBeUndefined();
  });

  it('a real, concurrence-resolved case counts toward concordance, not discrepancy', () => {
    const report = resolveCytologyQcComplianceReport([base({ state: 'FINAL_APPROVED', assignedReviewerId: 'prov-2' })]);
    expect(report.totalResolved).toBe(1);
    expect(report.totalConcordant).toBe(1);
    expect(report.totalDiscrepancies).toBe(0);
    expect(report.discrepancyRatePercent).toBe(0);
  });

  it('a real discrepancy-resolved case is counted correctly, including its own real severity', () => {
    const report = resolveCytologyQcComplianceReport([
      base({ state: 'QC_DISCREPANCY_REVISE', assignedReviewerId: 'prov-2', discrepancy: { primaryDiagnosticCode: 'NILM', secondaryDiagnosticCode: 'HSIL', severity: 'major', loggedAt: new Date().toISOString() } }),
    ]);
    expect(report.totalDiscrepancies).toBe(1);
    expect(report.majorDiscrepancyCount).toBe(1);
    expect(report.discrepancyRatePercent).toBe(100);
  });

  it('real, per-reviewer stats are genuinely broken out per real reviewer, not lumped together', () => {
    const report = resolveCytologyQcComplianceReport([
      base({ id: 'a1', state: 'FINAL_APPROVED', assignedReviewerId: 'prov-A' }),
      base({ id: 'a2', state: 'QC_DISCREPANCY_REVISE', assignedReviewerId: 'prov-A', discrepancy: { primaryDiagnosticCode: 'X', secondaryDiagnosticCode: 'Y', severity: 'minor', loggedAt: new Date().toISOString() } }),
      base({ id: 'a3', state: 'FINAL_APPROVED', assignedReviewerId: 'prov-B' }),
    ]);
    const provA = report.byReviewer.find(r => r.reviewerId === 'prov-A');
    const provB = report.byReviewer.find(r => r.reviewerId === 'prov-B');
    expect(provA?.casesReviewed).toBe(2);
    expect(provA?.discrepancyRatePercent).toBe(50);
    expect(provB?.casesReviewed).toBe(1);
    expect(provB?.discrepancyRatePercent).toBe(0);
  });

  it('real tier and trigger-source breakdowns count every real assignment, resolved or not', () => {
    const report = resolveCytologyQcComplianceReport([
      base({ priorityTier: 'high_escalation', triggerSource: 'rose_discrepancy' }),
      base({ priorityTier: 'routine_random', triggerSource: 'ct_escalation' }),
    ]);
    expect(report.byPriorityTier.high_escalation).toBe(1);
    expect(report.byTriggerSource.rose_discrepancy).toBe(1);
    expect(report.byTriggerSource.ct_escalation).toBe(1);
  });

  it('real SLA escalation and supervisor bypass counts are genuinely tallied across all assignments', () => {
    const report = resolveCytologyQcComplianceReport([
      base({ slaEscalationCount: 2 }),
      base({ supervisorBypass: { supervisorId: 'sup-1', justification: 'x', bypassedAt: new Date().toISOString() } }),
    ]);
    expect(report.totalSlaBreachEscalations).toBe(2);
    expect(report.totalSupervisorBypasses).toBe(1);
  });
});
