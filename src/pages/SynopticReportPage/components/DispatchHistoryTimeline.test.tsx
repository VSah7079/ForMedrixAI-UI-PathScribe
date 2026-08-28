// @vitest-environment happy-dom
//
// src/pages/SynopticReportPage/components/DispatchHistoryTimeline.test.tsx

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DispatchHistoryTimeline from './DispatchHistoryTimeline';
import type { DispatchHistoryEntry } from '@/services/engravers/fetchDispatchHistoryForCase';

afterEach(cleanup);

const colorNames = { COLOR_BIOPSY: 'Blue', COLOR_WHITE: 'White' };

describe('DispatchHistoryTimeline', () => {
  it('shows a real empty state when there are no entries', () => {
    render(<DispatchHistoryTimeline entries={[]} colorNames={colorNames} />);
    expect(screen.getByText(/No cassette dispatch or block exception events/)).toBeTruthy();
  });

  it('renders a cassette-dispatch-outcome entry with resolved color names, not raw keys', () => {
    const entries: DispatchHistoryEntry[] = [{
      eventType: 'cassette-dispatch-outcome',
      createdAt: '2026-08-27T12:00:00.000Z',
      payload: {
        messageId: 'm1', caseId: 'CASE-1', specimenLabel: 'A',
        requestedColorKey: 'COLOR_BIOPSY', actualColorKey: 'COLOR_WHITE',
        outcome: 'fallback_used', message: 'Hopper empty', reportedAt: '2026-08-27T12:00:00.000Z',
      },
    }];
    render(<DispatchHistoryTimeline entries={entries} colorNames={colorNames} />);
    expect(screen.getByText('Specimen A')).toBeTruthy();
    expect(screen.getByText('Fallback Used')).toBeTruthy();
    expect(screen.getByText(/Requested Blue/)).toBeTruthy();
    expect(screen.getByText(/Used White/)).toBeTruthy();
    expect(screen.getByText(/Hopper empty/)).toBeTruthy();
  });

  it('renders a routine "dispatched" outcome with the real, dedicated success badge', () => {
    const entries: DispatchHistoryEntry[] = [{
      eventType: 'cassette-dispatch-outcome',
      createdAt: '2026-08-27T12:00:00.000Z',
      payload: {
        messageId: 'm2', caseId: 'CASE-1', specimenLabel: 'B',
        requestedColorKey: 'COLOR_BIOPSY', outcome: 'dispatched', reportedAt: '2026-08-27T12:00:00.000Z',
      },
    }];
    render(<DispatchHistoryTimeline entries={entries} colorNames={colorNames} />);
    expect(screen.getByText('Dispatched Cleanly')).toBeTruthy();
  });

  it('does NOT show a "Used X" clause when actualColorKey matches requestedColorKey', () => {
    const entries: DispatchHistoryEntry[] = [{
      eventType: 'cassette-dispatch-outcome',
      createdAt: '2026-08-27T12:00:00.000Z',
      payload: {
        messageId: 'm3', caseId: 'CASE-1',
        requestedColorKey: 'COLOR_BIOPSY', actualColorKey: 'COLOR_BIOPSY',
        outcome: 'dispatched', reportedAt: '2026-08-27T12:00:00.000Z',
      },
    }];
    render(<DispatchHistoryTimeline entries={entries} colorNames={colorNames} />);
    expect(screen.queryByText(/Used/)).toBeNull();
  });

  it('renders a block-exception entry with its own real fields, not the dispatch-outcome shape', () => {
    const entries: DispatchHistoryEntry[] = [{
      eventType: 'block-exception',
      createdAt: '2026-08-27T12:00:00.000Z',
      payload: {
        messageId: 'm4', accessionNumber: 'S26-4403', specimenLetter: 'A', blockNumber: '1',
        status: 'Lost', note: 'Dropped during embedding', timestamp: '2026-08-27T12:00:00.000Z', sourceSystem: 'OTHER',
        organisationId: 'ORG-TEST',
      },
    }];
    render(<DispatchHistoryTimeline entries={entries} colorNames={colorNames} />);
    expect(screen.getByText('A1')).toBeTruthy();
    expect(screen.getByText('Block Lost')).toBeTruthy();
    expect(screen.getByText('Dropped during embedding')).toBeTruthy();
  });
});
