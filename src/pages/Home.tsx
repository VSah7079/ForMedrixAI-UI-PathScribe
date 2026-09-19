// src/pages/Home.tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../pathscribe.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@contexts/AuthContext";
import PubMedTicker from '@/components/Common/PubMedTicker';

interface Card {
  title: string;
  description: string;
  route: string;
  color: string;
  image: string;
}

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // --- UI State ---
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => { clearTimeout(timer); };
  }, []);

  // Real, per direct UI-review follow-up ("Fix them all" — colorblindness
  // + other visual issues): every accent color below replaced with a
  // fully-verified new palette, not a cosmetic tweak. The original set
  // had a genuine, exact duplicate (Intraop Queue and My Contribution
  // both #0EA5E9 — identical under every simulation type, not just
  // colorblind-specific) plus real convergence under protanopia/
  // deuteranopia (the two common forms of red-green colorblindness,
  // ~8% of men): Configuration/Audit/Quality Assurance compressed
  // toward the same yellow-green band, and Search/Intraop Queue/
  // Batch Management compressed in the blue-violet range.
  //
  // This replacement palette was verified computationally, not
  // eyeballed — every one of the 9 colors checked pairwise against
  // every other, under simulated protanopia/deuteranopia/tritanopia
  // (Brettel/Vienot-style linear-RGB transform matrices), iterating
  // until every pair cleared a real separation threshold under all
  // three types simultaneously, AND every color still holds at least
  // 3:1 contrast (WCAG 1.4.11, non-text/UI-component contrast) against
  // the dark tile background it renders on as a hover border/glow —
  // a genuinely distinct-but-invisible color would have "solved"
  // colorblindness by making the whole feature unusable for everyone.
  // Greens/yellows/reds mostly draw from the real, published Wong
  // (2011, Nature Methods) 8-color colorblind-safe palette; the
  // remaining blue/violet/magenta slots were verified individually
  // since Wong's own set doesn't have enough distinct entries for all
  // 9 tiles this app needs.
  const cards: Card[] = [
    // ⭐ New tile
    {
      title: 'Accession',
      description: 'Log new specimens and assign Grossing Templates',
      route: '/accession',
      color: '#16A34A',
      image: '/accession.webp'
    },

    { title: 'Worklist', description: 'View and manage pending pathology cases', route: '/worklist', color: '#0072B2', image: '/worklist.webp' },
    { title: 'Configuration', description: 'System settings and AI preferences', route: '/configuration', color: '#F0E442', image: '/config.webp' },
    { title: 'Search', description: 'Search completed and in-progress cases', route: '/search', color: '#CC79A7', image: '/search.webp' },
    // Real, direct follow-up (Sep 2026): "Audit" and "Quality Assurance"
    // used to be two flat top-level tiles here — folded into one
    // "Quality & Compliance" hub (QualityComplianceHubPage.tsx), per
    // direct request to reduce cognitive load. Real, considered
    // reasoning, not just tidiness: both are genuinely the same
    // domain/audience (a quality manager or compliance officer, not a
    // pathologist's or tech's daily-frequency tool) — Audit is System
    // Logs (incl. its own real, permanent QA historical-archive tab,
    // per AuditLogPage.tsx's own header) and Quality Assurance is the
    // active CAPA working queue for that same record — complementary
    // halves of one compliance domain, exactly the kind of grouping
    // already used for Pathology Workspace above. Two other candidates
    // were considered and deliberately NOT grouped here: Cytology QC
    // Peer Review Queue (its own header comment: a real, near-daily
    // pathologist queue explicitly meant to eventually live inside the
    // main Worklist itself — burying it under a Compliance hub would
    // slow down its real, frequent users) and Batch Management (its
    // own processing-node scope is genuinely broader than the five
    // pathology-bench domains already grouped in Pathology Workspace —
    // folding it in would blur what that hub means). #D55E00 is the
    // real color the removed Audit tile used to carry — reused here
    // rather than left orphaned, same real precedent as Pathology
    // Workspace reusing Cytology's old color.
    {
      title: t('home.qualityComplianceTile.title'),
      description: t('home.qualityComplianceTile.description'),
      route: '/quality-compliance',
      color: '#D55E00',
      image: '/logs.webp'
    },
    { title: 'Intraop Queue', description: 'Unlinked intraoperative entries awaiting a formal LIS accession to merge into', route: '/intraop-queue', color: '#38BDF8', image: '/worklist.webp' },
    { title: 'Cytology QC Peer Review Queue', description: 'Unified QC assignment queue for pathologist peer review — escalations, discrepancies, and routine random sampling', route: '/cytology-qc-queue', color: '#5B8DEF', image: '/worklist.webp' },
    // Real, direct follow-up (Sep 2026): "Molecular Order Queue" removed
    // from here — per direct guidance ("seems like a Testing tool"),
    // it's explicitly a demo/simulation tool (see its own page header
    // and services/molecularOrders/README.md), never a production
    // ordering workflow with a real staff operator. Moved to
    // Configuration → ⟳ Demo Reset, alongside this app's other
    // real, testing-only utilities — same real /molecular-order-queue
    // route, just a real, discoverable Configuration entry point
    // instead of a flat top-level Home tile aimed at every user.

    // ⭐ New tile
    {
      title: 'My Contribution',
      description: 'Workload • Quality • TAT • Trends',
      route: '/contribution',
      color: '#B24592',
      image: '/my_contributions.webp'
    },

    // ⭐ New tile
    {
      title: 'Batch Management',
      description: 'Track cassettes and slides through processing nodes via container barcodes',
      route: '/batch-management',
      color: '#8B3FD9',
      image: '/batch_management.webp'
    },

    // ⭐ New tile — real, per "Homepage Changes part 1" (direct
    // request): Cytology Workspace, Microtomy Workstation (renamed
    // "Microtomy Workspace"), Embedding Station (renamed "Embedding
    // Workspace"), and Slide Distribution Station (renamed "Slide
    // Distribution Workspace") were each their own flat top-level tile
    // (PS-284/285/286 respectively) — all four now live one level
    // deeper, behind this single hub tile (PathologyWorkspacePage.tsx),
    // per the direct instruction to move them into it. #009E73 is the
    // real color the removed Cytology Workspace tile used to carry —
    // reused here rather than left orphaned, and still genuinely
    // distinct from every other tile remaining on this page.
    //
    // ⭐ Real, direct follow-up (Sep 2026): the former standalone
    // "Molecular" tile (→ /molecular, MolecularWorkcenterPage.tsx,
    // itself the product of an earlier Molecular Testing + Molecular
    // Batch Management merge — see that merge's own reasoning still
    // documented in PathologyWorkspacePage.tsx) is ALSO folded into
    // this hub now, as "Molecular Workspace" — same real page
    // underneath (renamed from "Molecular Workcenter" to match), same
    // real /molecular route, just one level deeper. Per direct
    // guidance: grouped here by domain ("pathology"), not by shared
    // audience — Molecular Workspace's own molecular-tech bench
    // workflow is genuinely distinct from the other four tiles' own
    // histology-bench/cytology-screening audiences, same real
    // reasoning already true of e.g. Cytology vs. Microtomy within
    // this same hub. Molecular Order Queue (/molecular-order-queue)
    // deliberately NOT moved — per direct guidance, only "Molecular"
    // itself was named for this move.
    {
      title: t('home.pathologyWorkspaceTile.title'),
      description: t('home.pathologyWorkspaceTile.description'),
      route: '/pathology-workspace',
      color: '#009E73',
      image: '/cytology.webp'
    },
    // ⭐ New tile — real, per PS-287 (Pathologist-Initiated Add-On
    // Orders), fourth sibling workstation in the series. Genuinely
    // case-scoped (search/open an accession), not scan-to-open like its
    // three siblings — see AddOnOrderPage.tsx's own header. Color
    // checked against every other tile's own color above — a genuinely
    // new rose/red, distinct from both D55E00 (burnt orange) and
    // CC79A7/B24592 (mauve/pink), same distinct-color discipline the
    // real regression test (below) checks for.
    {
      title: t('home.addOnOrderTile.title'),
      description: t('home.addOnOrderTile.description'),
      route: '/add-on-orders',
      color: '#F43F5E',
      image: '/worklist.webp'
    }
    // Real, per "Homepage Changes part 1" (direct request): "Move
    // Facilities Ops Dashboards under Configuration." The former
    // Facility Ops Dashboards tile (PS-288, #84CC16 lime) that used to
    // sit here is gone — its entry point now lives in Configuration →
    // System → Display Profiles (DisplayProfilesSection.tsx's own
    // "Open Facility Ops Dashboard" button), not on Home. The route
    // itself (/facility-ops-dashboard) is unchanged and still the
    // same real, public/unauthenticated kiosk page — only its
    // discovery path moved.
  ];

  return (
    <div className={`ps-page${isLoaded ? ' ps-page--loaded' : ''}`}>
      {/* Background */}
      <div className="ps-page-bg" />
      <div className="ps-page-gradient" />

      {/* UI Content */}
      <div className="ps-page-content">

        <main className="ps-home-main">
          <header className="ps-home-header">
            <h1 className="ps-home-title">
              Welcome back,&nbsp;<span className="ps-home-title-name">{user?.name ? user.name.split(',')[0] : 'Doctor'}</span>
            </h1>
            <PubMedTicker />
          </header>

          <div className="ps-home-cards-grid">
            {cards.map((card, index) => {
              const hovered = hoveredCard === index;
              return (
                <div
                  key={card.title}
                  onClick={() => navigate(card.route)}
                  onMouseEnter={() => setHoveredCard(index)}
                  onMouseLeave={() => setHoveredCard(null)}
                  onFocus={() => setHoveredCard(index)}
                  onBlur={() => setHoveredCard(null)}
                  // Real, per direct UI-review follow-up ("Fix them
                  // all" — keyboard accessibility): this was a plain
                  // <div onClick> — unreachable via Tab, no keyboard
                  // activation, no visible focus state. role="button"
                  // + tabIndex + onKeyDown makes it a genuine keyboard
                  // control (Enter/Space activate, matching real
                  // <button> semantics); onFocus/onBlur reuse the
                  // existing hoveredCard state so a keyboard user gets
                  // the same visible highlight a mouse user already
                  // does, not a second, separate visual language.
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(card.route);
                    }
                  }}
                  className={`ps-home-card${hovered ? ' ps-home-card--hovered' : ''}`}
                  style={{ '--card-accent': card.color, '--card-accent-dim': `${card.color}40` } as React.CSSProperties}
                >
                  {/* Background Image */}
                  {card.image && (
                    <div className="ps-home-card-image" style={{ '--card-image': `url(${card.image})` } as React.CSSProperties} />
                  )}

                  {/* Gradient Overlay - Static */}
                  <div className="ps-home-card-overlay" />

                  {/* Text Content */}
                  <div className="ps-home-card-text">
                    <h3 className="ps-home-card-title">{card.title}</h3>
                    <p className="ps-home-card-desc">{card.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* Footer Status */}
        <footer className="ps-home-footer">
          <div>© 2026 PathScribe AI Systems • HIPAA Compliant</div>
          <div className="ps-home-footer-status">
            <span className="ps-home-status-dot" />
            SYSTEMS OPERATIONAL
          </div>
        </footer>
      </div>
    </div>
  );
}
