# components/Editor/tiptapBridge/

The bridge layer between the Orchestrator Engine and `PathScribeEditor` (Tiptap) — how AI-generated narrative content gets tracked, located, and safely inserted into the actual rich-text document.

## Files

- **`anchorMap.ts`** — tracks where each narrative section lives inside the Tiptap document, so the Orchestrator Engine can find and target a specific section without re-parsing the whole document each time.
- **`insertAtAnchor.ts`** — safe content insertion into Tiptap at section-specific positions, using the anchor map above.
- **`streamingWriter.ts`** — the real streaming bridge itself: incrementally writes Orchestrator Engine output into the editor as it's generated, rather than waiting for a complete response.
- **`aiContentMarkers.ts`** — marks which spans of content in the editor are AI-generated, so they can be visually distinguished/tracked separately from pathologist-authored text.

---
*See [components/Editor/README.md](../README.md) for how this folder fits the Editor component.*
*When this folder's contents change meaningfully, update THIS file.*
