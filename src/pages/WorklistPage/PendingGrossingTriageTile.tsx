// src/pages/WorklistPage/PendingGrossingTriageTile.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per the Protocol-Driven Workflow Infrastructure story's Part
// 2c: "Worklist badge: cases with pending triage show a distinct
// indicator so they don't sit silently." Same real, established
// collapsible-summary-tile shape as AmendedAddendaTriageTile.tsx
// (this folder) — deliberately a separate, new tile rather than
// folded into that one: that tile's own "triage" is an editorial
// amendment/addendum review queue for pathologists; this one is a
// genuinely different real concept — a bench-tech grossing checklist
// gate (Specimen.triage, types/case/Specimen.ts) — and conflating the
// two into one UI surface would make neither easy to reason about.
//
// Real, deliberate difference from AmendedAddendaTriageTile's own
// fetch-on-mount pattern: WorklistPage.tsx already holds every loaded
// case in state (realCases) — this tile takes that same array as a
// prop and filters it client-side, rather than issuing a second,
// redundant fetch for data the page already has.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import '../../pathscribe.css';
import type { Case } from '@/types/case/Case';
import type { SpecimenTriage } from '@/types/case/Specimen';

interface PendingTriageItem {
  caseId: string;
  accession: string;
  specimenLabel: string;
  confirmedCount: number;
  totalCount: number;
}

/** Real, pure — a specimen is genuinely pending exactly when it has a
 *  SpecimenTriage record, no override reason was recorded, and at
 *  least one checklist item is still unconfirmed. Exported for direct
 *  unit testing, same real reasoning as every other pure predicate
 *  extracted elsewhere in this app. */
export function isTriagePending(triage: SpecimenTriage | undefined): boolean {
  if (!triage) return false;
  if (triage.overrideReason) return false;
  return !triage.checklistItems.every(ci => ci.confirmed);
}

export const PendingGrossingTriageTile: React.FC<{ cases: Case[] }> = ({ cases }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);

  const items: PendingTriageItem[] = [];
  for (const c of cases) {
    for (const sp of (c.specimens ?? []) as { label: string; triage?: SpecimenTriage }[]) {
      if (!isTriagePending(sp.triage) || !sp.triage) continue;
      items.push({
        caseId: c.id,
        accession: c.accession?.fullAccession ?? c.id,
        specimenLabel: sp.label,
        confirmedCount: sp.triage.checklistItems.filter(ci => ci.confirmed).length,
        totalCount: sp.triage.checklistItems.length,
      });
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="ps-triage-tile">
      <button className="ps-triage-tile-header" onClick={() => setExpanded(v => !v)}>
        <span className="ps-triage-tile-title">⚠ {t('pendingTriageTile.title', { count: items.length })}</span>
        <span className="ps-triage-tile-toggle">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="ps-triage-tile-body">
          {items.map((item, i) => (
            <button
              key={`${item.caseId}-${item.specimenLabel}-${i}`}
              className="ps-triage-tile-row"
              onClick={() => navigate(`/case/${item.caseId}/synoptic`)}
            >
              <span className="ps-triage-tile-badge ps-triage-tile-badge--pending_triage">{t('pendingTriageTile.badge')}</span>
              <span className="ps-triage-tile-case">{item.accession}</span>
              <span className="ps-triage-tile-label">{t('pendingTriageTile.specimenLabel', { specimenLabel: item.specimenLabel })}</span>
              <span className="ps-triage-tile-detail">{t('pendingTriageTile.progress', { confirmed: item.confirmedCount, total: item.totalCount })}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
