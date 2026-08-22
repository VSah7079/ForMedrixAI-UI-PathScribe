// src/pages/SynopticReportPage/modals/ForeignIdFields.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real fix, per direct follow-up: "the rapid-keystroke race condition
// on onUpdateBlock/onUpdateDecant." Confirmed live, twice: typing
// quickly into a fully-controlled Foreign ID input (value derived
// directly from the real, async-persisted record, onChange calling
// onUpdateBlock/onUpdateDecant/onUpdateMatrixBlock on every keystroke)
// visibly corrupted the displayed value — first "N-Y" instead of
// "KNOWN-COLLISION-XYZ", then "KNZ" even after adding a generation
// guard on the handler side alone. The generation guard (still kept,
// in useSpecimenBlockManagement.ts — real, correct defense-in-depth
// for any other rapid-fire caller of those same handlers) fixes which
// snapshot's WRITE wins; it can't fix an input that re-renders,
// mid-keystroke, from whatever the parent's own async round trip last
// resolved to.
//
// The real, standard fix for "controlled input backed by async-saved
// parent state": decouple what's DISPLAYED while typing from the
// async persistence layer entirely. This component owns real, local
// state for both fields, initialized from the real record once
// (relying on this component being rendered inside an already-keyed
// row — see each modal's own key={record.id} on the surrounding
// element — so a genuinely different record correctly gets a fresh
// instance rather than fighting stale local state). Every keystroke
// updates only this local state (pure, synchronous, zero chance of a
// race). The real commit to the parent (and the real collision check,
// which needs the just-typed values, not stale props) fires exactly
// once, on blur — matching how SpecimenEditModal.tsx/AccessionPage.tsx
// were already safe by construction (local state, commit on an
// explicit action, never per keystroke).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import type { ForeignIdCollision } from '@/utils/foreignIdCollision';

interface ForeignIdFieldsProps {
  externalId?: string;
  externalIdSource?: string;
  disabled?: boolean;
  idPrefix: string;
  sourcePlaceholder: string;
  idPlaceholder: string;
  collision: ForeignIdCollision | null;
  /** Fires on blur with the real, just-typed values — this component's
   *  own local state is the source of truth at commit time, never the
   *  (possibly stale) externalId/externalIdSource props. */
  onCommit: (values: { externalId?: string; externalIdSource?: string }) => void;
  onCheckCollision: (externalId: string, externalIdSource: string) => void;
}

const ForeignIdFields: React.FC<ForeignIdFieldsProps> = ({
  externalId, externalIdSource, disabled, idPrefix, sourcePlaceholder, idPlaceholder, collision, onCommit, onCheckCollision,
}) => {
  // Real, deliberate one-time initialization from props — this
  // component is rendered inside an already-keyed row (key={block.id}/
  // key={decant.id}/key={matrixBlock.id} on the surrounding element in
  // each real caller), so React itself gives this a fresh instance
  // (fresh local state) whenever a genuinely different record appears
  // in this slot. Never re-syncs from props on every parent
  // re-render — that would fight the user's own, in-progress typing,
  // reintroducing exactly the bug this component exists to fix.
  const [localSource, setLocalSource] = useState(externalIdSource ?? '');
  const [localId, setLocalId] = useState(externalId ?? '');

  const commitAndCheck = () => {
    onCommit({ externalId: localId.trim() || undefined, externalIdSource: localSource.trim() || undefined });
    onCheckCollision(localId.trim(), localSource.trim());
  };

  return (
    <>
      <div className="ps-conf-form-row">
        <div className="ps-conf-form-field">
          <label className="ps-conf-label" htmlFor={`${idPrefix}-ext-source`}>Foreign ID Source</label>
          <input
            id={`${idPrefix}-ext-source`} type="text" className="ps-conf-select"
            disabled={disabled}
            value={localSource}
            placeholder={sourcePlaceholder}
            onChange={e => setLocalSource(e.target.value)}
            onBlur={commitAndCheck}
          />
        </div>
        <div className="ps-conf-form-field">
          <label className="ps-conf-label" htmlFor={`${idPrefix}-ext-id`}>Foreign ID</label>
          <input
            id={`${idPrefix}-ext-id`} type="text" className="ps-conf-select"
            disabled={disabled}
            value={localId}
            placeholder={idPlaceholder}
            onChange={e => setLocalId(e.target.value)}
            onBlur={commitAndCheck}
          />
        </div>
      </div>
      {collision && (
        <div className="ps-foreign-id-collision-warning">
          <div className="ps-foreign-id-collision-warning-text">
            ⚠ This foreign ID is already linked to {collision.recordLabel} on case {collision.caseAccession} — double-check before continuing.
          </div>
        </div>
      )}
    </>
  );
};

export default ForeignIdFields;
