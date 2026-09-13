import { describe, it, expect } from 'vitest';
import { resolveImageUrlWithFallback } from './resolveImageUrlWithFallback';

describe('resolveImageUrlWithFallback', () => {
  it('a real, successful primary fetch is used directly', () => {
    const result = resolveImageUrlWithFallback({ outcome: 'success' }, 'https://fallback.example.com');
    expect(result).toEqual({ action: 'use_primary' });
  });

  it('a real 404 on the primary reroutes to the fallback, per spec §2.2', () => {
    const result = resolveImageUrlWithFallback({ outcome: 'error', statusCode: 404 }, 'https://fallback.example.com/asset');
    expect(result).toEqual({ action: 'use_fallback', fallbackUrl: 'https://fallback.example.com/asset' });
  });

  it('a real 500 on the primary reroutes to the fallback', () => {
    const result = resolveImageUrlWithFallback({ outcome: 'error', statusCode: 500 }, 'https://fallback.example.com');
    expect(result.action).toBe('use_fallback');
  });

  it('a real connection timeout reroutes to the fallback', () => {
    const result = resolveImageUrlWithFallback({ outcome: 'error', isTimeout: true }, 'https://fallback.example.com');
    expect(result.action).toBe('use_fallback');
  });

  it('a real 401 does NOT reroute — surfaced as auth_required instead, per spec §2.2\'s own explicit carve-out', () => {
    const result = resolveImageUrlWithFallback({ outcome: 'error', statusCode: 401 }, 'https://fallback.example.com');
    expect(result).toEqual({ action: 'auth_required', statusCode: 401 });
  });

  it('a real 403 does NOT reroute — same carve-out as 401', () => {
    const result = resolveImageUrlWithFallback({ outcome: 'error', statusCode: 403 }, 'https://fallback.example.com');
    expect(result).toEqual({ action: 'auth_required', statusCode: 403 });
  });

  it('a real, retryable failure with no fallback configured is genuinely unavailable, never a fabricated fallback', () => {
    const result = resolveImageUrlWithFallback({ outcome: 'error', statusCode: 500 }, undefined);
    expect(result).toEqual({ action: 'unavailable' });
  });

  it('a real 3xx status is never treated as a retryable failure', () => {
    const result = resolveImageUrlWithFallback({ outcome: 'error', statusCode: 302 }, 'https://fallback.example.com');
    expect(result).toEqual({ action: 'unavailable' });
  });
});
