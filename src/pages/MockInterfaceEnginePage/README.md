# pages/MockInterfaceEnginePage/

- **`MockInterfaceEnginePage.tsx`** — the real control panel for the mock
  PS-239 backend endpoint. See `services/mockInterfaceEngine/README.md` for
  the full account of what this is, why it's safely gated, and exactly what
  it does and doesn't affect.

**Real, deliberate placement**: reachable only at `/dev/mock-interface-engine`
— not linked from Config, the home page, or any real navigation. A real
admin or clinical user should never stumble onto a developer tool that fakes
a backend response.
