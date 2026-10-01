# services/demoReset/

The demo data reset (mock backend only). Moved out of `components/Config/System/DemoResetTab.tsx` in Batch 370 (PS-356), so the screen no longer touches browser storage and the decision to reset is made here.

- **`resetAllDemoData({ authorization })`** clears every tester's demo data. It needs the capability `config:demo-data:reset` (checked and audited) and refuses without it.
- **`executeUserReset(userId)`** clears only the signed-in user's own hospital's data. No capability is needed, since it touches nothing of anyone else's.
- **Both refuse** unless `IS_MOCK_BACKEND`: a real database is never reset from the browser.
- **The key lists** (`VERSIONED_KEYS`, `SETTINGS_KEYS`, `CASE_KEYS`, `FLAG_KEYS`, `STATE_KEYS`) are checked by `components/Config/System/DemoResetTab.coverage.test.ts` against every storage key in `src/`.

## Batch 381

`STATE_KEYS` gains the report page's display preferences under their `utils/uiPreferences` names: `ps_ui_reportHeaderCompact`, `ps_ui_reportSidebarCollapsed` and `ps_ui_reportTabWidth`. The old keys stay listed so old values are still cleared.

---
*See [services/README.md](../README.md) for how this folder fits the whole services/ layer.*
*When this folder's contents change meaningfully, update THIS file. Only touch the master services/README.md if this folder's overall PURPOSE changes.*

## Batch 372

- **The Full Reset now really keeps what `DELIBERATELY_NOT_RESET` lists.** The mock services store through `mockStorage.ts`, which puts every key under `pathscribe_mock_`, and the reset's prefix sweep cleared those keys regardless of the list. So until now a Full Reset **did** clear the main audit log (`pathscribe_audit_logs`), the error log and the four billing dictionaries, despite what the list and its comments said. `keptThroughReset(key)` now exempts them, bare or prefixed. Only `ps_ai_audit_log_v1`, stored without the prefix, had actually survived.
- **Support access:** the support audit stream (`pathscribe_support_audit`) is kept; support access settings and requests clear with the prefix sweep.
