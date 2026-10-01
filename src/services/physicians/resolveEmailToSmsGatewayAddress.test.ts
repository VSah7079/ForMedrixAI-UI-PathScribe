import { describe, it, expect } from 'vitest';
import { resolveEmailToSmsGatewayAddress, SMS_CARRIER_GATEWAY_DOMAIN } from './resolveEmailToSmsGatewayAddress';

describe('resolveEmailToSmsGatewayAddress', () => {
  it('builds a real gateway address for a plain 10-digit number and a known carrier', () => {
    expect(resolveEmailToSmsGatewayAddress('2125551234', 'verizon')).toBe('2125551234@vtext.com');
  });

  it('normalizes a formatted number (dashes/parens/spaces) before building the address', () => {
    expect(resolveEmailToSmsGatewayAddress('(212) 555-1234', 'att')).toBe('2125551234@txt.att.net');
  });

  it('strips a leading US country code (11 digits starting with 1)', () => {
    expect(resolveEmailToSmsGatewayAddress('+1 212-555-1234', 'tmobile')).toBe('2125551234@tmomail.net');
  });

  it('covers every known carrier in SMS_CARRIER_GATEWAY_DOMAIN', () => {
    for (const [carrier, domain] of Object.entries(SMS_CARRIER_GATEWAY_DOMAIN)) {
      expect(resolveEmailToSmsGatewayAddress('2125551234', carrier as any)).toBe(`2125551234@${domain}`);
    }
  });

  it('uses smsCarrierOtherDomain when carrier is "other"', () => {
    expect(resolveEmailToSmsGatewayAddress('2125551234', 'other', 'mymvno.example.com')).toBe('2125551234@mymvno.example.com');
  });

  it('returns undefined for "other" with no override domain — never fabricates one', () => {
    expect(resolveEmailToSmsGatewayAddress('2125551234', 'other')).toBeUndefined();
    expect(resolveEmailToSmsGatewayAddress('2125551234', 'other', '   ')).toBeUndefined();
  });

  it('returns undefined when no phone is given', () => {
    expect(resolveEmailToSmsGatewayAddress(undefined, 'verizon')).toBeUndefined();
  });

  it('returns undefined when no carrier is given — genuinely unknown, never guessed', () => {
    expect(resolveEmailToSmsGatewayAddress('2125551234', undefined)).toBeUndefined();
  });

  it('returns undefined for a number that does not normalize to a real 10-digit US number', () => {
    expect(resolveEmailToSmsGatewayAddress('555-1234', 'verizon')).toBeUndefined();
    expect(resolveEmailToSmsGatewayAddress('+44 20 7946 0958', 'verizon')).toBeUndefined();
  });
});
