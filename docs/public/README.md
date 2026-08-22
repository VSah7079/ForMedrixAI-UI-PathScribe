# PathScribe — Public Documentation

This folder is for external-facing documentation, public API
references, landing page assets, and end-user release notes.

**Deliberately empty of premature content.** PathScribe hasn't been
deployed to production or released to a customer yet — writing public
API references or release notes now would describe a public surface
that doesn't exist and could mislead whoever reads it later. This
folder is scaffolded and ready; real content belongs here once there's
a real, external audience for it.

## What already exists, elsewhere

- **In-app end-user documentation** (Admin Guide, User Guide) is real,
  current, and already embedded/served directly inside the app itself
  (`public/help/`, via `src/utils/guideAssets.ts`) — that's the right
  home for it today, not this folder. See `../developer/GETTING_STARTED.md`
  for the update workflow if those guides need a rebuild.
- **A public API contract** doesn't exist yet in any current, accurate
  form — an earlier draft was found stale (predating most of the
  app's current surface) and was purged rather than kept as a
  misleading starting point. See `../ARCHIVE.md`.

## When to actually write into this folder

Once there's a real production deployment, a real customer-facing API
surface, or a real release worth announcing — write it here then,
against what's actually true at that time.
