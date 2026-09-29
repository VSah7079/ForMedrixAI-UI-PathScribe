# utils/labels/pathscribeAgent/

**PathScribe's side of the PathScribe Agent (PS-52).** The agent is a small background program on a lab workstation that prints to that workstation's USB label printer. It is the last-resort printing route: see the Admin Guide section in `services/printerProfiles/README.md`.

The agent itself is a separate program and is **not built yet**; its language and runtime are still Pete's decision. Everything here works the same whatever it is written in. It is also the contract the agent's developers build against.

## Files

- **`agentProtocol.ts`** — the WebSocket contract: message types, validation (`parseAgentMessage`), the handshake check, the ports, and the protocol version.
- **`pathscribeAgentClient.ts`** — the client:
  - finds the agent (port discovery);
  - prints and waits for this job's own outcome;
  - lists printers and capabilities;
  - finds the agent again if the connection drops;
  - tries the printer profile's **Agent Port** first, when one is set (Batch 346);
  - reports each job's progress (`onJobStatus`: sending, queued, printing, done or failed) (Batch 346).

  The socket is injected, so it is tested against a fake agent.
- **`printJobStatus.ts`** (Batch 346) — what this tab's agent jobs are doing right now, kept in memory, and the one line that describes them. The shared client feeds it; `components/Printing/AgentPrintStatus.tsx` shows it.
- **`pathscribeAgentClient.test.ts`** — discovery (a raw printer on 9100 is skipped; fallback to 9101/9102; a configured port tried first; wrong protocol version refused; reconnect), job matching with concurrent jobs, progress reports, errors, timeouts, dropped connections, and printing through `dispatchZplLabel`.
- **`printJobStatus.test.ts`** — the status store and its summary line.

`../dispatchZplLabel.ts` sends labels for printers whose Bridge Type is **PathScribe Agent** through this client. Cassette, slide, container, requisition and molecular labels all use that path. Failures come back as translated messages (`printLabels.agent.*`); "not running on this workstation" lists the ports actually tried.

**While a label is on its way** (Batch 346), a small status line at the bottom left of the screen says "Sending label to the printer…", "Label queued: 2 jobs ahead" or "Printing on ZD421", and disappears when the job finishes.

## The contract (for the agent's developers)

Transport: **secure WebSocket (`wss://`) on `127.0.0.1` only**, JSON text frames. There is no plain `ws://` fallback (Batch 327, Pete: "I want to use HTTPS").

**Ports (Pete's design note).** Bind 9100; if taken, 9101; if taken, 9102.
- 9100 is also the standard raw-printing port, so PathScribe connects to each port in turn and trusts only a listener that answers `PING` with this agent's `PONG`.
- A printer, or another program on the same port, is skipped.
- **Custom port (Batch 346).** If IT must move the agent to another port (1024–65535), the agent should accept it as a setting, and the admin enters the same number as the printer profile's **Agent Port**. PathScribe tries that port first, then 9100–9102. The handshake rule is the same on every port.

| Direction | Message | Fields |
|---|---|---|
| → agent | `PING` | `requestId`, `protocolVersion` (currently 1) |
| ← agent | `PONG` | `requestId`, `agent: "pathscribe-agent"`, `version`, `protocolVersion`, `port` |
| → agent | `GET_PRINTERS` | `requestId` |
| ← agent | `PRINTERS` | `requestId`, `printers: [{ name, isDefault, connection: "usb" \| "network" \| "other" }]` |
| → agent | `GET_CAPABILITIES` | `requestId`, `printerName` |
| ← agent | `CAPABILITIES` | `requestId`, `capabilities: { printerName, dpi, supportsRawZpl }` |
| → agent | `PRINT_LOCAL_LABEL` | `requestId`, `jobId`, `idempotencyKey`, `printerName`, `zpl` (raw, send unchanged), `copies` |
| ← agent | `PRINT_QUEUED` | `requestId`, `jobId`, `position`: how many jobs are ahead of this one (0 = prints next; never negative) |
| ← agent | `PRINT_STARTED` | `jobId` (**optional**, Batch 346: the job has left the queue and is at the printer) |
| ← agent | `PRINT_SUCCESS` | `jobId` |
| ← agent | `PRINT_ERROR` | `jobId`, `errorCode`, `message?` |
| ← agent | `ERROR` | `requestId?`, `errorCode`, `message?` (a request the agent couldn't accept) |

- **Error codes:**
  - `PRINTER_UNREACHABLE`, `PAPER_OUT`, `RIBBON_OUT`, `HEAD_OPEN`, `MALFORMED_ZPL`, `INVALID_GS1`: the same states as the Interface Engine print callback;
  - `PRINTER_NOT_FOUND`, `UNSUPPORTED_PROTOCOL_VERSION`, `AGENT_ERROR`.
- **One queue, one job at a time (Pete's design note).** Jobs from every connected tab go into one FIFO queue. The printer is locked for each job, and each job's `PRINT_SUCCESS` / `PRINT_ERROR` goes back to the connection that sent it.
- **Job progress (Batch 346).** A job goes queued → (printing) → success or error. Sending `PRINT_STARTED` when a job reaches the printer is optional but recommended: without it the user sees "queued" until the job finishes. The agent may send a fresh `PRINT_QUEUED` with a smaller `position` as the queue moves.
- **Idempotency.** A resent job keeps its `idempotencyKey`; the agent must not print the same key twice.
- **Signing and installation** are covered in the Admin Guide: a code-signing certificate on Windows, and a Developer ID certificate plus notarization on macOS. (The Admin Guide's Windows advice needs a correction; see Open.)

## Security certificate (for the agent's developers)

PathScribe connects to `wss://127.0.0.1:<port>`, so the agent must serve TLS with a certificate the workstation's browsers trust.

- **One certificate per workstation.** The installer creates a new key pair and certificate on that machine, for `127.0.0.1` and `localhost`. Never ship one certificate and private key inside the installer for every site: anyone could extract that key and impersonate the agent on any workstation.
- **Trusted at install time.** The installer adds the certificate to the machine's trusted certificates: the Windows certificate store, or the macOS System keychain. Chrome and Edge use those stores. Firefox keeps its own list unless its enterprise policy `Certificates.ImportEnterpriseRoots` is on, so the installer, or IT, sets that policy or adds the certificate to Firefox.
- **The key stays on the machine,** readable only by the agent's service account.
- **Renewal:** the agent renews its certificate before it expires, and the uninstaller removes it from the trusted stores.
- **Failure looks like absence.** A browser never tells a web page why a `wss://` connection failed. An agent whose certificate isn't trusted is therefore reported as "not running on this workstation, or its security certificate is not trusted".

## Open

- **The agent program**: not built. Its language and runtime are still open (C#/.NET vs Go/Rust; see PS-52).
- **Admin Guide correction, noted for later (Pete, Sep 26: "Note the admin doc bits for later").** The Admin Guide says an EV code-signing certificate avoids the Windows SmartScreen warning. Per the developers' PS-52 review, EV certificates no longer bypass SmartScreen. Recommend Microsoft Artifact Signing, or deploying the agent through the hospital's own tools (Intune, Group Policy), which doesn't show SmartScreen. The macOS advice (Developer ID plus notarization) stands. Not edited yet.
- **Chrome and Edge ask permission to reach the workstation.** From Chrome 147 (April 2026), a website opening a WebSocket to `127.0.0.1` needs the user's **Local Network Access** permission, whether the connection is `ws://` or `wss://`. The first print shows a browser prompt. IT can pre-approve the PathScribe address with the Chrome/Edge policy `LocalNetworkAccessAllowedForUrls` so no one is prompted (see the Admin Guide in `services/printerProfiles/README.md`). Confirm the prompt's behaviour on the sites' browser versions when the agent is built.
- **The scale uses the same agent differently.** `services/grossingHardware/resolveScaleWeightCapture.ts` expects the same agent to serve `GET {agentBaseUrl}/scale/weight`, from an admin-entered base URL rather than port discovery. Since Batch 327 that URL must be `https://`: the grossing-hardware service refuses anything else, and the capture refuses to read over plain HTTP. The agent should serve both on its bound port with the same certificate, and the scale lookup could then use discovery too.

---
*See [utils/labels/README.md](../README.md) for the rest of the label-printing code.*
