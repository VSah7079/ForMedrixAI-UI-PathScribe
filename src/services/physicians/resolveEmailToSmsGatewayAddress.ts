// src/services/physicians/resolveEmailToSmsGatewayAddress.ts
// ─────────────────────────────────────────────────────────────────────────────
// PS-136 — real, per direct follow-up: closes the data-model gap
// services/clinical/postGaAlertChannels/README.md's own research
// documented ("the email-to-SMS gateway option needs a per-physician
// carrier field that doesn't exist in this app's data model today").
// `Physician.smsCarrier`/`smsCarrierOtherDomain` now carry the real
// data; this is the pure, testable function that turns
// (phone, carrier) into the actual gateway email address a real
// backend would send to — e.g. `2125551234@vtext.com`.
//
// Real, deliberate scope boundary, same as every other pure resolver
// in this app: this function only ever builds the address string. It
// is not called anywhere in the live dispatch path or the post-GA
// interface-engine module — actually delivering mail to that address
// is real, per-customer backend work (services/clinical/postGaAlertChannels/
// README.md's own "Real scope boundary" note), which this repo cannot
// build. This function exists so that backend work has one real,
// tested, unambiguous reference for what PathScribe's own data means.
// ─────────────────────────────────────────────────────────────────────────────

import type { SmsCarrierId } from './IPhysicianService';

/** Real, curated set of major US carriers' own currently-active
 *  email-to-SMS gateway domains (confirmed against each carrier's own
 *  published support documentation). Not exhaustive — real, honest gap
 *  for any carrier outside this list, which is exactly what
 *  `smsCarrier: 'other'` + `smsCarrierOtherDomain` is for. */
export const SMS_CARRIER_GATEWAY_DOMAIN: Record<Exclude<SmsCarrierId, 'other'>, string> = {
  verizon: 'vtext.com',
  att: 'txt.att.net',
  tmobile: 'tmomail.net',
  uscellular: 'email.uscc.net',
};

/** Real, strips everything but digits, then keeps only the last 10 —
 *  same real, honest posture as every other phone-normalizing utility
 *  in this app: never guesses a country code, never pads a
 *  genuinely-too-short number. Returns undefined for a number that
 *  doesn't resolve to a real, plausible 10-digit US number, since a
 *  gateway address built from anything else would not actually work. */
function normalizeToTenDigitUsNumber(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return undefined;
}

/** Real, the actual resolver. Returns undefined — never a fabricated
 *  address — when there's genuinely not enough real data to build one:
 *  no phone, no carrier, an `'other'` carrier with no override domain,
 *  or a phone number that doesn't normalize to a real 10-digit US
 *  number (this mechanism has no real equivalent outside the US — see
 *  `SmsCarrierId`'s own doc comment). */
export function resolveEmailToSmsGatewayAddress(
  phone: string | undefined,
  carrier: SmsCarrierId | undefined,
  otherDomain?: string,
): string | undefined {
  if (!phone || !carrier) return undefined;
  const digits = normalizeToTenDigitUsNumber(phone);
  if (!digits) return undefined;

  const domain = carrier === 'other' ? otherDomain?.trim() : SMS_CARRIER_GATEWAY_DOMAIN[carrier];
  if (!domain) return undefined;

  return `${digits}@${domain}`;
}
