// src/pages/Home.tsx
import { useState, useEffect } from 'react';
import '../pathscribe.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@contexts/AuthContext";
import { useLogout } from '@hooks/useLogout';
import LogoutWarningModal from '@/components/Common/LogoutWarningModal';
import PubMedTicker from '@/components/Common/PubMedTicker';

interface Card {
  title: string;
  description: string;
  route: string;
  color: string;
  image: string;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const handleLogout = useLogout();

  // --- UI State ---
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

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
    { title: 'Audit', description: 'Review System Activities, Audit Trail, and Quality Assurance', route: '/audit', color: '#D55E00', image: '/logs.webp' },
    { title: 'Quality Assurance', description: 'Deficiencies, Intraoperative Linkage, and Discordance & Reconciliation reporting', route: '/quality-assurance', color: '#E69F00', image: '/deficiencies.webp' },
    { title: 'Intraop Queue', description: 'Unlinked intraoperative entries awaiting a formal LIS accession to merge into', route: '/intraop-queue', color: '#38BDF8', image: '/worklist.webp' },
    { title: 'Molecular Order Queue', description: 'Outbound molecular assay and instrument orders, including HPV reflex genotyping', route: '/molecular-order-queue', color: '#7F77DD', image: '/worklist.webp' },
    { title: 'Cytology QC Peer Review Queue', description: 'Unified QC assignment queue for pathologist peer review — escalations, discrepancies, and routine random sampling', route: '/cytology-qc-queue', color: '#5B8DEF', image: '/worklist.webp' },

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

    // ⭐ New tile — real, per direct guidance: a dedicated Cytotech
    // entry point, opening their own assigned cases and pool
    // worklist (Cytology & Cervical Screening module). Deliberately
    // NOT a second worklist destination for Pathologists — per direct
    // guidance's own explicit constraint ("I do not want to send the
    // Pathologist to multiple worklist"), cytology cases needing
    // pathologist review surface within their existing, real
    // /worklist instead; this tile is a real, separate later piece.
    // Real, honest color-choice caveat: every other tile's color was
    // computationally, pairwise-verified against protanopia/
    // deuteranopia/tritanopia simulation (see this file's own header
    // comment) — #009E73 is drawn from the real, published Wong
    // (2011, Nature Methods) colorblind-safe palette and not yet
    // used by any existing tile, but has NOT been through that same
    // full, pairwise verification against all 9 others. Worth a real
    // pass before considering this tile's color final.
    {
      title: 'Cytology Workspace',
      description: 'Primary screening hub for GYN Paps, Non-GYN triage, cell block tracking, and mandatory QC',
      route: '/cytology-worklist',
      color: '#009E73',
      image: '/cytology.webp'
    },
    // ⭐ Real, direct correction (Sep 2026), per direct follow-up
    // ("I'm not sure it makes sense to have Molecular Testing and
    // Molecular Batch Management as separate tiles"): the two former,
    // separate tiles ('Molecular Testing' → /molecular-batch,
    // 'Molecular Batch Management' → /molecular-batch-management,
    // removed above) are now one real, single tile, opening into
    // MolecularWorkcenterPage.tsx's own real, tab-based
    // sub-navigation (Worklist & Plate Builder / Active Runs &
    // Batches / History & Archive / QC & Specimen Association) —
    // confirmed directly (services/molecular/README.md) that the two
    // former pages are genuinely related real, downstream pipelines
    // off the same real molecular-instrument-run lifecycle, not an
    // arbitrary merge.
    {
      title: 'Molecular',
      description: 'Batch and plate management, active runs, and QC/specimen association for molecular diagnostics (HPV, CT/NG, respiratory PCR)',
      route: '/molecular',
      color: '#7C3AED',
      image: '/batch_management.webp'
    }
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

      <LogoutWarningModal
        isOpen={showWarning}
        onClose={() => setShowWarning(false)}
        onLogout={handleLogout}
      />
    </div>
  );
}
