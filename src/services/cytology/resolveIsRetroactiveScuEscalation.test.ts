// src/services/cytology/resolveIsRetroactiveScuEscalation.test.ts
import { describe, it, expect } from 'vitest';
import { resolveIsRetroactiveScuEscalation } from './resolveIsRetroactiveScuEscalation';

describe('resolveIsRetroactiveScuEscalation — real, per direct guidance\'s own FOV-to-manual-rescreen scenario', () => {
  it('a real FOV-assisted pass (0.5) escalating to a full manual rescreen (1.5) is a genuine escalation', () => {
    expect(resolveIsRetroactiveScuEscalation('fov_assisted', 'fov_manual_rescreen')).toBe(true);
  });

  it('an unchanged real review mode is never an escalation', () => {
    expect(resolveIsRetroactiveScuEscalation('primary_manual', 'primary_manual')).toBe(false);
  });

  it('a real DE-escalation (higher weight down to a lower one) is never treated as an escalation', () => {
    expect(resolveIsRetroactiveScuEscalation('fov_manual_rescreen', 'fov_assisted')).toBe(false);
  });

  it('two real modes with the identical weight (liquid_nongyn and fov_assisted, both 0.5) are never an escalation either direction', () => {
    expect(resolveIsRetroactiveScuEscalation('liquid_nongyn', 'fov_assisted')).toBe(false);
    expect(resolveIsRetroactiveScuEscalation('fov_assisted', 'liquid_nongyn')).toBe(false);
  });
});
