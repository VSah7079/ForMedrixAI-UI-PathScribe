// src/utils/serviceEndpoint.test.ts — Batch 327: HTTPS-only service URLs.
import { describe, it, expect } from 'vitest';
import { isHttpsUrl, isLoopbackHttpUrl, resolveServiceEndpoint } from './serviceEndpoint';

const base = { name: 'report renderer', envVar: 'VITE_REPORT_PDF_ENDPOINT', devDefault: 'http://localhost:8080/' };

describe('isHttpsUrl / isLoopbackHttpUrl', () => {
  it('recognises https and loopback http only', () => {
    expect(isHttpsUrl('https://render.example.com/')).toBe(true);
    expect(isHttpsUrl('http://render.example.com/')).toBe(false);
    expect(isHttpsUrl('not a url')).toBe(false);
    expect(isLoopbackHttpUrl('http://localhost:8080/')).toBe(true);
    expect(isLoopbackHttpUrl('http://127.0.0.1:8080/')).toBe(true);
    expect(isLoopbackHttpUrl('http://[::1]:8080/')).toBe(true);
    expect(isLoopbackHttpUrl('http://render.example.com/')).toBe(false);
    expect(isLoopbackHttpUrl('https://localhost/')).toBe(false);
  });
});

describe('resolveServiceEndpoint in a production build', () => {
  const prod = { ...base, isProduction: true };

  it('accepts an https URL', () => {
    expect(resolveServiceEndpoint({ ...prod, configured: 'https://render.example.com/' })).toEqual({ ok: true, url: 'https://render.example.com/' });
  });

  it('refuses a missing setting instead of falling back to localhost', () => {
    const r = resolveServiceEndpoint({ ...prod, configured: undefined });
    expect(r).toMatchObject({ ok: false, problem: 'NOT_CONFIGURED' });
    expect(r.ok === false && r.message).toContain('VITE_REPORT_PDF_ENDPOINT');
    expect(resolveServiceEndpoint({ ...prod, configured: '   ' })).toMatchObject({ ok: false, problem: 'NOT_CONFIGURED' });
  });

  it('refuses plain HTTP, even to localhost', () => {
    expect(resolveServiceEndpoint({ ...prod, configured: 'http://render.example.com/' })).toMatchObject({ ok: false, problem: 'NOT_HTTPS' });
    expect(resolveServiceEndpoint({ ...prod, configured: 'http://localhost:8080/' })).toMatchObject({ ok: false, problem: 'NOT_HTTPS' });
  });

  it('refuses a malformed value', () => {
    expect(resolveServiceEndpoint({ ...prod, configured: 'render.example.com' })).toMatchObject({ ok: false, problem: 'MALFORMED' });
  });
});

describe('resolveServiceEndpoint in a development build', () => {
  const dev = { ...base, isProduction: false };

  it('uses the local emulator default when nothing is set', () => {
    expect(resolveServiceEndpoint({ ...dev, configured: undefined })).toEqual({ ok: true, url: 'http://localhost:8080/' });
  });

  it('allows plain HTTP to this machine only', () => {
    expect(resolveServiceEndpoint({ ...dev, configured: 'http://127.0.0.1:8081/' })).toEqual({ ok: true, url: 'http://127.0.0.1:8081/' });
    expect(resolveServiceEndpoint({ ...dev, configured: 'http://render.example.com/' })).toMatchObject({ ok: false, problem: 'NOT_HTTPS' });
  });
});
