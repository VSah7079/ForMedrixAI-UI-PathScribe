# services/clinical/postGaAlertChannels/

**Real, per direct follow-up ("Can the interface engine be used for any
post GA modification to fully implement this feature?"). This folder is
NOT currently wired into `dispatchCriticalAlerts.ts` — it is a
ready-to-review, ready-to-test cutover candidate, built and kept
deliberately separate from the live dispatch path so nothing here
changes production sign-out behavior until someone decides to activate
it.**

## Why this exists, and why it's separate

`services/clinical/alertChannels/` (the folder `dispatchCriticalAlerts.ts`
actually calls today) is three disclosed local stubs — each channel
logs its real intent via `console.info` and returns `{dispatched: true,
method: 'stub'}`. No real network call happens anywhere in that path.

This folder is the same three channels, same payload/template logic,
but routed through this app's one real, generic outbound HTTP transport
— `services/interfaceDispatch/dispatchInterfaceMessage.ts` →
`receive_interface_message` (a separate Firebase Functions repository)
— the same real transport six other transaction types
(A08/A40/A47/ORU_R01/LIS_SYNC/ORDER_CREATED/REGISTRY_REPORT/PRINT_JOB)
already use for real dispatch. A new `'CRITICAL_ALERT'` transaction type
was added to that shared union for this.

**Real, honest limit on what this actually proves.** A dispatch success
through this module confirms PathScribe's own outbound message reached
the real receiving endpoint — it does **not** confirm an SMS/email/EHR
message actually reached the physician. That final leg depends entirely
on whichever real, per-customer interface engine (Mirth Connect,
Rhapsody, Cloverleaf, or similar) or cloud function is configured on the
receiving end to accept a `CRITICAL_ALERT` transaction and forward it to
a real SMS gateway, email vendor, or EHR inbox API — a real,
per-customer decision this module deliberately does not make. See
`AlertChannelDispatchOutcome.method`'s own doc comment
(`types/clinical/CriticalAlertDispatch.ts`) for the same distinction.

## Real, concrete downstream delivery options for the receiving side

(Per direct research into how enterprise healthcare customers actually
run this — none of these are implemented here; they're all decisions
for the separate `receive_interface_message` backend, keyed off
tenant/customer configuration, once this module is activated.)

- **`secure_email`** — either a customer-provisioned SMTP relay
  credential/endpoint (restricted by sending IP), or an OAuth
  enterprise-app integration calling `graph.microsoft.com` (M365) or
  the Gmail API (Google Workspace) to send as a designated system
  address.
- **`sms`** — two real options, neither requiring PathScribe to run its
  own Twilio-style account:
  - **Email-to-SMS gateway** (e.g., `{number}@vtext.com`,
    `{number}@txt.att.net`) — routed as an outbound email through the
    same secure-email mechanism above. **Real, formerly-honest gap, now
    closed on this app's side**: this needs the recipient's carrier.
    `Physician` now carries `smsCarrier`/`smsCarrierOtherDomain`
    (`services/physicians/IPhysicianService.ts`), set via a new field
    in the Physicians config UI
    (`components/Config/System/PhysiciansSection.tsx`). This module's
    `sendSmsAlertViaInterfaceEngine.ts` resolves the actual gateway
    address with the new, pure, tested
    `services/physicians/resolveEmailToSmsGatewayAddress.ts` and sends
    it on the envelope as `emailToSmsGatewayAddress`, alongside the raw
    `carrier`, whenever both a valid US mobile number and a carrier are
    on file — genuinely `undefined` on either field otherwise (no phone,
    no carrier, or a non-US/malformed number), never a fabricated
    guess. **Real, remaining scope boundary**: PathScribe only computes
    and offers this address; a real backend is free to use it as-is,
    ignore it and use interface-engine offloading instead (below), or
    do its own resolution — none of that downstream routing decision is
    made here.
  - **Interface-engine offloading** — Mirth/Cloverleaf/Corepoint etc.
    often already have a connector or integration with the health
    system's own preferred SMS vendor or paging system; the engine
    receives the generic `CRITICAL_ALERT` envelope this module already
    sends and forwards it there. Needs no carrier data from PathScribe
    at all — the other real option for a customer who'd rather not
    collect carrier per physician.
- **`ehr_push`** — the interface engine ingests the message (an
  `ORU^R01` or a custom HL7/FHIR alert) and the EHR's own inbox-task
  mechanism takes over from there; PathScribe's role ends at handing it
  off, same as `alertChannels/pushEhrInboxAlert.ts`'s own established
  reasoning.

**Real scope boundary**: all of the above is backend/tenant-configuration
work in the separate Firebase Functions repository
(`receive_interface_message`), not this one — this module only builds
and tests PathScribe's own outbound half (a well-formed `CRITICAL_ALERT`
envelope reaching the real receiving endpoint). That backend repo isn't
part of this session/codebase, so none of the customer-routing logic
above is buildable from here.

## Files

- **`sendSmsAlertViaInterfaceEngine.ts`** / **`sendSecureEmailAlertViaInterfaceEngine.ts`** —
  reuse the exact same zero-PHI templates the live channels already
  build (`alertChannels/sendSmsAlert.ts`'s `buildSmsBody()`,
  `alertChannels/sendSecureEmailAlert.ts`'s `buildEmailBody()`, both
  exported specifically for this reuse) — only the transport changes.
  `sendSmsAlertViaInterfaceEngine.ts` additionally resolves and carries
  `carrier`/`emailToSmsGatewayAddress` on the envelope — see "Real,
  concrete downstream delivery options" above.
- **`pushEhrInboxAlertViaInterfaceEngine.ts`** — deliberately still
  carries real clinical detail (`findingTerm`/`findingSeverity`), same
  as the live `alertChannels/pushEhrInboxAlert.ts` — this channel
  already crosses a different, real trust boundary (the receiving
  institution's own interface engine, never a public link), so the
  zero-PHI constraint the sms/secure_email siblings carry doesn't apply
  here.
- **`postGaAlertChannels.test.ts`** — real coverage for all three,
  `dispatchInterfaceMessage` mocked (no real network call), covering
  the real success/failure paths and confirming the zero-PHI templates
  carry over unchanged from the live channels.

## How to activate this (not done as part of building it)

Swap three imports in `dispatchCriticalAlerts.ts`:

```ts
// from:
import { sendSecureEmailAlert } from './alertChannels/sendSecureEmailAlert';
import { sendSmsAlert } from './alertChannels/sendSmsAlert';
import { pushEhrInboxAlert } from './alertChannels/pushEhrInboxAlert';
// to:
import { sendSecureEmailAlertViaInterfaceEngine as sendSecureEmailAlert } from './postGaAlertChannels/sendSecureEmailAlertViaInterfaceEngine';
import { sendSmsAlertViaInterfaceEngine as sendSmsAlert } from './postGaAlertChannels/sendSmsAlertViaInterfaceEngine';
import { pushEhrInboxAlertViaInterfaceEngine as pushEhrInboxAlert } from './postGaAlertChannels/pushEhrInboxAlertViaInterfaceEngine';
```

Deliberately **not** done here — activating this changes what a real
sign-out actually dispatches, in production, for a real customer. That
should be its own explicit decision (and would also want, at minimum:
confirming `VITE_INTERFACE_RECEIVER_ENDPOINT` points at a real,
reachable `https://` receiver for that customer (production builds
refuse anything else since Batch 327), and confirming that receiver's
own downstream `CRITICAL_ALERT` handling actually exists — this folder
only builds PathScribe's own outbound half).

---
*See [services/clinical/README.md](../README.md) for how this folder fits the whole clinical/ domain.*
*When this folder's contents change meaningfully, update THIS file.*
