# pathscribe AI - Frontend Application

AI-Powered CAP Synoptic Reporting System for Pathologists

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

## Demo Credentials
Contact the team lead for access credentials.

## 📁 Project Structure

The app has grown substantially since this README was first written. As
of August 2026, **every folder in `src/` has its own `README.md`** describing
exactly what's in it — this section is a genuine rollup of that tree, not a
re-derivation of it. For real detail on any area, follow the link to that
folder's own README rather than looking for it enumerated here.

```
pathscribe-ai/
├── src/
│   ├── main.tsx                  # App entry point
│   ├── App.tsx                   # Route table — every real route in the app
│   ├── ProtectedRoute.tsx, MobileRestrictedRoute.tsx
│   ├── pathscribe.css            # The main stylesheet (20,000+ lines)
│   │                              #   See src/README.md for the full loose-
│   │                              #   file breakdown (stylesheets, type
│   │                              #   declarations, and two real findings).
│   │
│   ├── pages/                    # Route-level pages — see pages/README.md
│   │   ├── SynopticReportPage/   #   Central folder — see below
│   │   ├── BatchManagement/      #   Cassette/slide custody + 3 computed queues
│   │   ├── WorklistPage/, AccessionPage/, Synoptic/, ReportPreview/, system/, modals/
│   │   └── ... (QualityAssurancePage, IntraopQueuePage, ContributionDashboardPage, etc.)
│   │
│   ├── components/               # 23 feature-area folders — see components/README.md
│   ├── services/                 # 78 domain folders, one per real data
│   │   │                          #   domain — see services/README.md. Each
│   │   │                          #   typically an interface
│   │   │                          #   (`I<X>Service.ts`) + mock implementation
│   │   │                          #   (`mock<X>Service.ts`), with a Firestore
│   │   │                          #   implementation alongside where one exists.
│   │   │                          #   Coverage verified via a real, dedicated
│   │   │                          #   script: `scripts/check-services-docs.cjs`.
│   │   └── (Central folders: cases/, cassetteRouting/, retentionPolicy/, hl7/)
│   │
│   ├── types/                    # Shared domain types — see types/README.md
│   │   └── case/                 #   Central folder — Case, Specimen,
│   │                              #   RetentionHold, CaseHold, and more
│   ├── orchestrator/              # AI narrative-generation engine — Layer 2
│   │                              #   (context) + Layer 3 (generation). See
│   │                              #   orchestrator/README.md.
│   ├── contexts/                  # App-wide React state — auth, messaging,
│   │                              #   voice, system config, scanner input,
│   │                              #   dirty-state guards. See contexts/README.md.
│   ├── hooks/                     # App-wide reusable hooks (distinct from
│   │                              #   SynopticReportPage/hooks/, which is
│   │                              #   page-specific). See hooks/README.md.
│   ├── utils/                     # Pure, mostly-stateless helpers — date/
│   │                              #   time, cassette routing, label printing
│   │                              #   (utils/labels/), scanning, patient ID
│   │                              #   validation. See utils/README.md.
│   ├── data/                      # 27 CAP/RCPath synoptic protocol templates
│   │                              #   (pure JSON). See data/README.md.
│   ├── firebase/                  # Firebase config and initialization
│   ├── theme/                     # Design-token object (`pathscribeTheme.ts`)
│   ├── constants/                 # Voice/action registries, macros
│   ├── audit/                     # Central `logEvent()` wrapper
│   ├── api/                       # Thin API layer (case flags)
│   ├── loaders/                   # React Router loaders
│   ├── mock/                      # Standalone mock full-report data
│   └── assets/                    # Static assets (currently empty)
│
├── scripts/                       # Dev tooling — including
│                                   #   check-services-docs.cjs (verifies
│                                   #   services/ README coverage) and
│                                   #   check-organization.cjs
├── public/                        # Static assets (SVGs, images)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### `SynopticReportPage/` — the core clinical workflow

This is where a pathologist actually builds and signs out a report
(`/case/:caseId/synoptic`). It's the single largest, most actively
developed part of the app, and has its own extracted architecture:

```
SynopticReportPage/
├── SynopticReportPage.tsx   # Layout + modal wiring — business logic
│                             #   lives in hooks/, not here
├── hooks/                   # Ten domain hooks (LIS integration,
│                             #   specimen/block management, report
│                             #   generation, amendment workflow, grossing
│                             #   completion, orchestrator draft
│                             #   lifecycle, sign-out/finalize, microscopic
│                             #   entry, cassette scan verification,
│                             #   release-buffer countdown) plus shared
│                             #   types. 188 tests.
│                             #   See hooks/README.md for the full
│                             #   architecture and hooks/__tests__/README.md
│                             #   for the testing approach.
├── components/               # Presentational pieces specific to this page
└── modals/
```


## 🎨 Design System

### Color Palette
- **Primary Cyan**: `#0891B2` - Main brand color
- **Dark Cyan**: `#0E7490` - Gradients and accents
- **Success Green**: `#10b981` - Positive states
- **Warning Yellow**: `#f59e0b` - Alerts and medium confidence
- **Error Red**: `#ef4444` - Errors and critical alerts

### Typography
- System fonts: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Professional, medical software aesthetic

## 📄 Pages Overview

The route list below reflects `App.tsx` as it exists today. A few of the
original pages (Login, Home, Worklist) are still accurate in spirit; most
of the rest — including the core clinical workflow — didn't exist when
this README was first written.

### Core clinical workflow

- **`/case/:caseId/synoptic`** — the Synoptic Report Page. Where a
  pathologist builds and signs out a report. Supports two distinct
  operating modes: **CoPilot** (PathScribe as a passive synoptic
  data-capture layer feeding a host LIS) and **Orchestration** (PathScribe
  owns the full report lifecycle as a lightweight LIS for outreach
  cases). See `src/pages/SynopticReportPage/hooks/README.md` for the full
  architecture.
- **`/accession`** — case accessioning.
- **`/worklist`** — sortable/filterable case table, AI generation status,
  priority badges (Routine/Rush/STAT — Rush and STAT both group under
  Worklist's "Urgent" filter; see `components/Worklist/README.md`).
- **`/quality-assurance`** — nonconformance-management work queue (renamed
  from the old `/deficiencies` route — the underlying specimen-deficiency
  domain terminology is unchanged, but this page now also covers
  Intraoperative Linkage, Discordance & Reconciliation, Countersign
  Turnaround, Drift Correction, Patient Match Review (MPI), Retention
  Holds Management Review, Access Request Response, and FPPE Tracking —
  see `components/QualityAssurance/README.md` for all eight tabs).
- **`/intraop-queue`**, **`/search`**, **`/audit`** — intraoperative-consult
  queue, case search, and the audit log.
- **`/report/:caseId`** — generated report viewing.

### Batch Management

- **`/batch-management`** — chain-of-custody tracking for cassettes and
  slides through processing nodes (Decal/Special Processing, Processing,
  Embedding, Microtomy/Sectioning, Staining, Checkout) via container
  barcode scanning.
- **`/batch-management/disposal`** — computed queue of specimens/blocks/
  slides that qualify for disposal right now under retention policy, with
  direct scan-to-dispose.
- **`/batch-management/pending-load`** — computed queue of cassettes/slides
  that have been printed/engraved but not yet scanned into any active
  batch.
- **`/batch-management/retention-holds`** — every case with an active
  retention hold blocking disposal, oldest first.

### Configuration & templates

- **`/configuration`** — admin configuration (organisation, users,
  templates, AI behavior, and more — see `components/Config/`).
- **`/template-editor/*`**, **`/template-review/*`**,
  **`/admin/templates/*`**, **`/admin/parts/*`** — the synoptic template
  builder: assembling report templates from reusable Parts, plus the
  review/approval workflow for template changes.

### Other

- **`/contribution`** — pathologist productivity/quality dashboard.
- **`/mock-emr`** — a mock EMR view, used for demoing the "Launch EMR"
  integration point.
- **`/login`**, **`/`** (Home) — authentication and dashboard, described
  below.

### Login Page (`/login`)
- Email/password authentication
- SSO placeholders (Google, Microsoft)

### Home Dashboard (`/`)
- Key metrics overview
- Recent cases list
- Quick action buttons
- Role-based navigation (admin badge for admins)

## 🔐 Authentication

The app uses a context-based auth system:
- `AuthProvider` (`src/contexts/AuthContext.tsx`) wraps the entire app
- `useAuth()` hook provides auth state and methods
- Protected routes redirect to login if not authenticated
- Actual login/password validation happens against `services/users/`
  (see Demo Credentials above — not stored in `AuthContext.tsx` itself,
  which only resolves display fields like name and professional
  credentials, e.g. "MD, FCAP")

## 🛠️ Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **React Router v6** - Client-side routing
- **Vite** - Build tool and dev server
- **Firebase** - Backend for the services that have a real (non-mock)
  implementation; most domains currently run on an in-memory mock service
  behind the same interface, swappable without touching calling code
- **Vitest** - Test runner; `@testing-library/react` + `happy-dom` for the
  React-hook test suites (see Testing below)
- **SunCalc** - Installed as a dependency, but confirmed unused —
  zero real imports anywhere in the codebase (checked directly, not
  assumed). Likely a leftover from a geolocation-based theming feature
  that either never got built or was later removed without this
  dependency being cleaned up. See "Key Features" below.

## 🧪 Testing

```bash
npm test              # Full suite (excludes firestore.rules.test.ts)
npm run test:rules    # Firestore security rules tests, run separately
npm run test:watch    # Watch mode
npm run type-check    # tsc --noEmit — run this separately from tests;
                       #   vitest's esbuild transform is more lenient
                       #   about lib/target settings than the real
                       #   tsconfig, so a clean test run is not proof a
                       #   file compiles under the project's real settings
npm run lint
```

Most of the suite is plain Node-environment tests (services, utilities,
calculations) with no DOM dependency. The `SynopticReportPage/hooks`
directory also has real React-hook tests (188 of them) — see
`src/pages/SynopticReportPage/hooks/__tests__/README.md` for the
`happy-dom` setup, the unit/integration split, and known tooling gotchas
before adding to that suite.

## 🎯 Key Features

### Theming — real finding, not a real feature

**This README used to describe a "4-mode (Light/Dark/Auto/Scheduled),
geolocation-based" theming system. Checked directly before writing this
section: it doesn't exist.** No app-wide theme toggle, no light-mode
styling, no `ThemeContext`/`ThemeProvider`, and `suncalc` (the package
this would have needed) is installed but never imported anywhere. The
only real "theme" concept in the codebase is `PathScribeEditor.tsx`'s
own, unrelated, internal `EditorThemeContext` — light/dark tokens for
the rich-text editor's own rendering, not an app-wide UI mode. The app
is consistently, single-mode dark-themed throughout (`pathscribe.css`).
This reads as either scaffold-stage content that was never built, or a
real feature that was built and later removed without this README
being updated — not determined which, since neither is discoverable
from the code alone. Flagged rather than guessed at.

### Authentication
- Mock authentication for demo
- Role-based access (pathologist vs admin)
- Protected routes with redirect

### Responsive Design
- Professional medical software UI
- Color-coded confidence indicators
- Priority badges and status chips
- Consistent branding across all pages

## 🔧 Configuration

### Vite Config (`vite.config.ts`)

Real, substantially larger than a default scaffold — the snippet that
used to live here (`plugins: [react()], server: { port: 5173 }`) was a
stale toy example from the original scaffolding, not what's actually
in the file today. The real config includes:

- **Dev-server proxies** for three external APIs, so browser calls
  never hit them directly (CORS, and keeps API keys server-side):
  Anthropic (`/api/ai/anthropic`), Gemini (`/api/ai/gemini/generate`),
  and UMLS/NLM terminology search (`/api/terminology/umls`).
- **Path aliases** (`@`, `@components`, `@pages`, `@theme`, `@hooks`,
  `@contexts`) resolved against `src/`.
- **`optimizeDeps.entries` scoped to `index.html`** — without this,
  Vite's dependency scanner auto-discovers every `.html` file in the
  project (including malformed docs files) as a potential entry point
  and crashes.
- **Manual build chunking** (`vendor-react`, `vendor-tiptap`,
  `vendor-xlsx`) for the production bundle.
- **`__APP_VERSION__`** injected from `package.json` at build time, so
  a release number is only ever typed in one place.

See the real file for the full, current detail — deliberately not
reproduced here in full, since a stale copy is worse than a pointer.

### TypeScript Config (`tsconfig.json`)

**Not strict mode** — `"strict": false`, and every individual strict
sub-flag (`strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`,
`strictPropertyInitialization`, and others) is explicitly disabled too,
not just inherited as off. This is a real, deliberate project setting,
not an oversight — worth knowing before assuming TypeScript is
catching null/undefined or implicit-`any` issues, because it isn't.
Two real checks *are* enabled: `noUnusedLocals` and
`noUnusedParameters`. Bundler-mode module resolution
(`moduleResolution: "bundler"`), matching Vite. A real `exclude` list
carves out `src/Legacy/` and a handful of specific files from
compilation entirely — see the file itself for the current list.

## 📦 Building for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```

The build output will be in the `dist/` directory.

## 📚 Other project documentation

Beyond this README and the `README.md` in every `src/` folder (see
Project Structure above), project-level documentation lives in `docs/`,
organized by audience rather than as loose root-level files:

- **`docs/architecture/`** — system design, service-layer conventions,
  Firestore migration status, the CoPilot/Orchestration mode split.
- **`docs/developer/`** — setup, coding conventions, testing gotchas.
- **`docs/quality/`** — the app's own QA feature, plus how this
  codebase itself is tested.
- **`docs/product/`** — a real, current feature-by-feature overview.
- **`docs/ip-and-legal/`** — IP inventory, license audits, patent
  reference material (index only — real content belongs with counsel).
- **`docs/public/`** — external-facing docs, scaffolded and
  deliberately empty until there's a real external audience.
- **`docs/ARCHIVE.md`** — a record of what was purged in the August
  2026 restructure and why, rather than a folder full of stale files.

Bug/gap tracking (formerly `PRIORITY_FIXES.md` and
`DEAD_CODE_TRACKING.md`) now lives in Jira, project `PS`
(`formedrixai.atlassian.net`) — see `docs/ARCHIVE.md` for the mapping
from the old tracking docs to the real tickets that replaced them.

## 🚧 Notes on this README's history

This file originally described the project at its earliest scaffolding
stage — a "Future Enhancements" section here once listed "Case detail
view with synoptic editor" as planned work; that's now the
`SynopticReportPage` system described above, one of the largest and most
actively developed parts of the app. If you're looking for what's
currently being worked on or planned next, check with the team lead
rather than this file — a static list here would go stale again quickly
given how fast this area moves.

## 📝 Notes

- UI components use real CSS classes in `pathscribe.css` (`ps-*` naming) — inline styles are reserved for genuinely dynamic, per-render values only (colours from props, calculated dimensions), per the Internal Team Guide's own CSS convention (4.3)
- No external UI library dependencies (pure React)
- Cyan theme matches the original synoptic UI design
- Designed for medical professionals (clear, professional, trustworthy)

## 🐛 Troubleshooting

**Issue: Login not working**
- Check you're using the demo credentials
- Clear localStorage and refresh

**Issue: Navigation not working**
- Ensure React Router is properly installed
- Check browser console for errors

## 📞 Support

For questions or issues, contact the pathscribe AI development team.

---

**Version:** 1.0.0
**Last Updated:** August 19, 2026 — full documentation pass: every
folder in `src/` now has its own, verified-accurate `README.md` (169
folders with real files; coverage checked programmatically — every
real filename in every folder is actually named in that folder's own
README, not assumed), this file rebuilt as a genuine rollup of that
tree rather than a re-derivation of it, and two confirmed-dead
duplicate files removed along the way (see `DEAD_CODE_TRACKING.md`).
**License:** Proprietary - pathscribe AI
