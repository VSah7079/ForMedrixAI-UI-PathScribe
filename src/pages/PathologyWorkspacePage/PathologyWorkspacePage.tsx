// src/pages/PathologyWorkspacePage/PathologyWorkspacePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// "Homepage Changes part 1" — direct request: "Create Pathology Workspace
// Tile on Home page and move the following into that: Cytology Workspace,
// Microtomy Workstation - also rename Microtomy Workspace, Embedding
// Station - also rename Embedding Workspace, Slide Distribution Station -
// rename Slide Distribution Workspace." This page is the real destination
// behind Home's new "Pathology Workspace" tile — a small, second-level hub
// grouping the four sub-workspaces the direct request named, rather than
// each one sitting as its own flat top-level Home tile.
//
// Real, direct follow-up (Sep 2026): a fifth tile, "Molecular Workspace"
// (renamed from the former standalone "Molecular" Home tile, same real
// /molecular route into MolecularWorkcenterPage.tsx, itself renamed from
// "Molecular Workcenter" to match), was added here too. Per direct
// guidance, this hub groups by domain ("pathology"), not by shared
// audience — Molecular Workspace's own molecular-tech bench workflow is
// genuinely distinct from the other four tiles' histology-bench/
// cytology-screening audiences, same as Cytology and Microtomy already
// not sharing an audience within this same hub. Molecular Order Queue
// (a separate, deliberately-unmerged page — see services/molecularOrders/
// README.md) stays on Home, untouched — only "Molecular" itself moved.
//
// Deliberately reuses Home.tsx's own .ps-home-cards-grid/.ps-home-card
// visual language (same background image treatment, same keyboard
// accessibility — role="button"/tabIndex/onKeyDown — same hover-accent
// custom properties) rather than inventing a second card style, since
// these are literally the same four tiles relocated one level deeper, not
// a new kind of UI. Colors are the same ones each tile already carried on
// Home — no collision risk moving here, since Home's own regression guard
// (Home.test.tsx) only ever checked uniqueness among Home's own tiles.
//
// Built with i18n from the start (own "pathologyWorkspace" namespace,
// EN/FR/DE/NL/KO), per this repo's own standing i18n/README.md rule ("any
// new page or modal must not ship with hardcoded, user-facing strings") —
// even though the Cytology Workspace tile's own title/description were
// never i18n-converted on Home.tsx itself, this is genuinely new page
// content, not a copy-paste of the old hardcoded strings.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import '../../pathscribe.css';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';

interface SubTile {
  key: string;
  title: string;
  description: string;
  route: string;
  color: string;
  image: string;
}

export default function PathologyWorkspacePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushCrumb } = useBreadcrumb();

  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => { pushCrumb(t('pathologyWorkspace.pageTitle'), '/pathology-workspace'); }, [pushCrumb, t]);
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => { clearTimeout(timer); };
  }, []);

  // Real, same colors each tile already carried as a flat Home tile —
  // see this file's own header for why no re-verification was needed.
  const tiles: SubTile[] = [
    {
      key: 'cytology',
      title: t('pathologyWorkspace.cytologyTile.title'),
      description: t('pathologyWorkspace.cytologyTile.description'),
      route: '/cytology-worklist',
      color: '#009E73',
      image: '/cytology.webp',
    },
    {
      key: 'microtomy',
      title: t('pathologyWorkspace.microtomyTile.title'),
      description: t('pathologyWorkspace.microtomyTile.description'),
      route: '/workstations/microtomy',
      color: '#56B4E9',
      image: '/microtomy.webp',
    },
    {
      key: 'embedding',
      title: t('pathologyWorkspace.embeddingTile.title'),
      description: t('pathologyWorkspace.embeddingTile.description'),
      route: '/workstations/embedding',
      color: '#F97316',
      // TODO: still borrowing Worklist's image — no dedicated
      // Embedding Workspace photo was provided in the Sep 2026 tile-image
      // refresh (Cytology/Microtomy/Slide Distribution/Molecular all got
      // their own real photo; this one didn't). Swap in a real image once
      // one's available — see UPDATE_288_SUMMARY.md.
      image: '/worklist.webp',
    },
    {
      key: 'slideDistribution',
      title: t('pathologyWorkspace.slideDistributionTile.title'),
      description: t('pathologyWorkspace.slideDistributionTile.description'),
      route: '/workstations/slide-distribution',
      color: '#14B8A6',
      image: '/slide_distribution.webp',
    },
    {
      key: 'molecular',
      title: t('pathologyWorkspace.molecularTile.title'),
      description: t('pathologyWorkspace.molecularTile.description'),
      route: '/molecular',
      color: '#7C3AED',
      image: '/molecular.webp',
    },
  ];

  return (
    <div className={`ps-page${isLoaded ? ' ps-page--loaded' : ''}`}>
      {/* Background — same treatment as Home.tsx */}
      <div className="ps-page-bg" />
      <div className="ps-page-gradient" />

      <div className="ps-page-content">
        <main className="ps-home-main">
          <header
            className="ps-home-header"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}
          >
            <div>
              <h1 className="ps-home-title">{t('pathologyWorkspace.pageTitle')}</h1>
              <p className="ps-home-card-desc" style={{ marginTop: 4 }}>{t('pathologyWorkspace.pageSubtitle')}</p>
            </div>
            <button
              className="ps-btn-ghost-dark"
              onClick={() => navigate('/')}
            >
              {t('pathologyWorkspace.backToHome')}
            </button>
          </header>

          <div className="ps-home-cards-grid">
            {tiles.map((tile, index) => {
              const hovered = hoveredCard === index;
              return (
                <div
                  key={tile.key}
                  onClick={() => navigate(tile.route)}
                  onMouseEnter={() => setHoveredCard(index)}
                  onMouseLeave={() => setHoveredCard(null)}
                  onFocus={() => setHoveredCard(index)}
                  onBlur={() => setHoveredCard(null)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(tile.route);
                    }
                  }}
                  className={`ps-home-card${hovered ? ' ps-home-card--hovered' : ''}`}
                  style={{ '--card-accent': tile.color, '--card-accent-dim': `${tile.color}40` } as React.CSSProperties}
                >
                  {tile.image && (
                    <div className="ps-home-card-image" style={{ '--card-image': `url(${tile.image})` } as React.CSSProperties} />
                  )}
                  <div className="ps-home-card-overlay" />
                  <div className="ps-home-card-text">
                    <h3 className="ps-home-card-title">{tile.title}</h3>
                    <p className="ps-home-card-desc">{tile.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
