// src/components/Config/Staff/roleDictionaryControls.tsx
// Checkbox controls shared by the Role Dictionary's tabs (moved out of
// RoleDictionary.tsx in Batch 369 so RoleCapabilitiesTab can use them).

import React from 'react';

export type TriState = 'all' | 'some' | 'none';

// ─── TriCheckbox ──────────────────────────────────────────────────────────────

// Box and glyph sizes come from the ps-rd-cb--size-* classes (no inline CSS).
export type CheckboxSize = 16 | 18 | 20;

export const TriCheckbox: React.FC<{ state: TriState; onClick: (e: React.MouseEvent) => void; size?: CheckboxSize }> = ({ state, onClick, size = 16 }) => (
  <div
    onClick={onClick}
    className={`ps-rd-cb ps-rd-cb--size-${size} ps-rd-tri-${state}`}
  >
    {state === 'all'  && <span className="ps-rd-tri-check">✓</span>}
    {state === 'some' && <span className="ps-rd-tri-dash">—</span>}
  </div>
);

// ─── DivCheckbox (div-based custom checkbox for interactive lists) ─────────────

export const DivCheckbox: React.FC<{ checked: boolean; size?: CheckboxSize; variant?: 'blue' | 'green' }> = ({ checked, size = 18, variant = 'blue' }) => (
  <div
    className={`ps-rd-cb ps-rd-cb--div ps-rd-cb--size-${size} ${checked ? (variant === 'green' ? 'ps-rd-cb--on-green' : 'ps-rd-cb--on-blue') : 'ps-rd-cb--off'}`}
  >
    {checked && <span className="ps-rd-tri-check">✓</span>}
  </div>
);

