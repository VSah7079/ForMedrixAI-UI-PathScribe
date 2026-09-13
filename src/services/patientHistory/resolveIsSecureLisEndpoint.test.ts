import { describe, it, expect } from 'vitest';
import { resolveIsSecureLisEndpoint } from './resolveIsSecureLisEndpoint';

describe('resolveIsSecureLisEndpoint', () => {
  it('accepts a real https endpoint', () => {
    expect(resolveIsSecureLisEndpoint('https://trust-fhir-server.nhs.uk/fhir/R4')).toBe(true);
  });

  it('refuses a real http (non-TLS) endpoint', () => {
    expect(resolveIsSecureLisEndpoint('http://trust-fhir-server.nhs.uk/fhir/R4')).toBe(false);
  });

  it('refuses a genuinely malformed URL rather than treating it as secure by default', () => {
    expect(resolveIsSecureLisEndpoint('not a real url')).toBe(false);
  });

  it('refuses any other real protocol, e.g. a plain file/ftp reference', () => {
    expect(resolveIsSecureLisEndpoint('ftp://old-server/reports')).toBe(false);
  });
});
