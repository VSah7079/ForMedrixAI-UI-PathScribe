# components/Printing/

On-screen feedback for printing that isn't tied to one screen. Both parts sit in one column at the bottom left (`.ps-print-feedback` in `App.tsx`): network print jobs above, the agent status line below.

## Files

- **`AgentPrintStatus.tsx`** (Batch 346, PS-52) — a small status line at the bottom left while this tab's labels are going through the PathScribe Agent:
  - "Sending label to the printer…";
  - "Label queued: 2 jobs ahead" (or "prints next");
  - "Printing on ZD421", only with an agent that sends the optional `PRINT_STARTED`;
  - plus "1 more label waiting" when this tab has several labels in flight.

  It disappears when the job finishes; the screen that printed reports the outcome, as before. It is mounted once, in `App.tsx`, and is an ARIA live region (`role="status"`), so screen readers announce the changes.

  Renders only. The jobs and the wording choice come from `utils/labels/pathscribeAgent/printJobStatus.ts`; the text is `agentPrintStatus.*` in all five languages. Styles: `.ps-agent-print-status*` in `pathscribe.css`.
- **`AgentPrintStatus.test.tsx`** — the line follows a job from sending to done, and is empty otherwise.
- **`NetworkPrintJobs.tsx`** (Batch 347, PS-54) — labels sent to *Direct via Interface Engine* printers.
  - **What it shows:** "sent, waiting for the printer", then "printed" (for 5 s), or "did not print: <reason>" with **Retry** and **Dismiss**. A label with no answer after two minutes can be retried as well.
  - **Retry** is manual only, and a retried label shows its attempt number.
  - **Demo buttons:** with no API server, two dashed buttons simulate the engine's answer.
  - A failure is announced (`role="alert"`).
  - **Renders only:** the jobs, the retry and the message choice come from `services/networkPrint/` (`networkPrintJobs` in `@/services`). Text is `networkPrint.*` and styles are `.ps-netprint-*`.
- **`NetworkPrintJobs.test.tsx`** — waiting, a simulated failure, Retry (new attempt sent), then printed.

---
*See [components/README.md](../README.md) for the other component folders.*
