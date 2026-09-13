import { describe, it, expect } from 'vitest';
import { resolveImageUnavailablePlaceholder } from './resolveImageUnavailablePlaceholder';

describe('resolveImageUnavailablePlaceholder', () => {
  it('matches the spec\'s own exact worked example format', () => {
    expect(resolveImageUnavailablePlaceholder('asset-123')).toBe('Image Unavailable - Server Unreachable: [asset-123]');
  });
});
