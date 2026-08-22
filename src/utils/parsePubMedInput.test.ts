// src/utils/parsePubMedInput.test.ts
import { describe, it, expect } from 'vitest';
import { parsePubMedInput } from './parsePubMedInput';

describe('parsePubMedInput — real feature, per direct follow-up: the ticker\'s "paste it here" field', () => {
  it('parses a bare PMID', () => {
    expect(parsePubMedInput('38123456')).toBe('38123456');
  });

  it('parses a real, current-format PubMed URL', () => {
    expect(parsePubMedInput('https://pubmed.ncbi.nlm.nih.gov/38123456/')).toBe('38123456');
  });

  it('parses the same URL without a trailing slash', () => {
    expect(parsePubMedInput('https://pubmed.ncbi.nlm.nih.gov/38123456')).toBe('38123456');
  });

  it('parses without a scheme - a real, common way people paste URLs', () => {
    expect(parsePubMedInput('pubmed.ncbi.nlm.nih.gov/38123456/')).toBe('38123456');
  });

  it('parses the real, older pubmed URL format (ncbi.nlm.nih.gov/pubmed/{PMID})', () => {
    expect(parsePubMedInput('https://www.ncbi.nlm.nih.gov/pubmed/38123456')).toBe('38123456');
  });

  it('parses a URL with a real, trailing query string', () => {
    expect(parsePubMedInput('https://pubmed.ncbi.nlm.nih.gov/38123456/?utm_source=test')).toBe('38123456');
  });

  it('trims real, incidental whitespace from a paste', () => {
    expect(parsePubMedInput('  38123456  ')).toBe('38123456');
  });

  it('a genuinely empty or missing input returns null, never a guess', () => {
    expect(parsePubMedInput('')).toBeNull();
    expect(parsePubMedInput('   ')).toBeNull();
    expect(parsePubMedInput(undefined)).toBeNull();
    expect(parsePubMedInput(null)).toBeNull();
  });

  it('a real, deliberate safety rule: never matches an unrelated site, even one that happens to contain digits', () => {
    expect(parsePubMedInput('https://example.com/38123456')).toBeNull();
  });

  it('never matches a URL from a real but different, unrelated NIH-family site', () => {
    expect(parsePubMedInput('https://clinicaltrials.gov/38123456')).toBeNull();
  });

  it('rejects free text that is not a real PMID or PubMed URL', () => {
    expect(parsePubMedInput('this is not a pmid')).toBeNull();
  });

  it('rejects a PMID with a leading zero - real PMIDs never have one', () => {
    expect(parsePubMedInput('012345')).toBeNull();
  });

  it('rejects zero itself - not a real, valid PMID', () => {
    expect(parsePubMedInput('0')).toBeNull();
  });

  it('rejects a negative number', () => {
    expect(parsePubMedInput('-38123456')).toBeNull();
  });

  it('a malformed URL is handled gracefully, never throws', () => {
    expect(() => parsePubMedInput('https://')).not.toThrow();
    expect(parsePubMedInput('https://')).toBeNull();
  });
});
