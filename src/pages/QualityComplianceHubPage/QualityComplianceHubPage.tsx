// src/pages/QualityComplianceHubPage/QualityComplianceHubPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, direct follow-up (Sep 2026): "are there any [Home tiles] that can
// be grouped, trying to reduce the cognitive load" — this hub is the real
// destination behind Home's new "Quality & Compliance" tile, grouping the
// former flat "Audit" and "Quality Assurance" tiles one level deeper.
//
// Real, considered reasoning, not just tidiness: both are genuinely the
// same domain and audience — a quality manager or compliance officer,
// not a pathologist's or tech's daily-frequency tool. Audit (AuditLogPage.tsx)
// is System Logs — Audit Log, Error Log, Interface Log, Financial — plus
// its own real, permanent Quality Assurance historical-archive tab (see
// that file's own header: "Deliberately separate from the working
// queue itself"). Quality Assurance (QualityAssurancePage.tsx) IS that
// working queue — the active CAPA engine. Complementary halves of one
// compliance record, not one containing the other — same real
// domain-grouping logic already used for Pathology Workspace, just
// applied to an oversight domain instead of a bench-workflow one.
//
// Two other candidates were considered and deliberately NOT folded in
// here, flagged directly rather than silently decided either way:
// - Cytology QC Peer Review Queue: its own header comment describes a
//   real, near-daily pathologist queue explicitly meant to eventually
//   live inside the main Worklist itself — burying it under a
//   Compliance hub would slow down its real, frequent users, the
//   opposite of the point of this change.
// - Batch Management: its own processing-node scope (External
//   Referral, Decal/Special Processing, etc.) is genuinely broader
//   than the five pathology-bench domains already grouped in Pathology
//   Workspace — it doesn't cleanly fit here either.
//
// Deliberately reuses Home.tsx's own .ps-home-cards-grid/.ps-home-card
// visual language and the same second-level-hub shape
// PathologyWorkspacePage.tsx already established (pushCrumb on mount,
// "← Back to Home", same keyboard-accessible card pattern) — the same
// real UI vocabulary, not a new one invented for this hub.
//
// Sub-tile descriptions deliberately reworded from their old flat-tile
// text rather than copied verbatim: the old Audit tile's own
// description ("...and Quality Assurance") is exactly the ambiguity a
// direct question raised about whether Audit "contains" Quality
// Assurance — sitting the two tiles side by side here, unchanged, would
// have reproduced that same confusion one level deeper instead of
// resolving it.
//
// Built with i18n from the start (own "qualityComplianceHub" namespace,
// EN/FR/DE/NL/KO), same standing i18n/README.md rule as
// PathologyWorkspacePage.tsx — genuinely new page content, not a
// copy-paste of old hardcoded strings.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import '../../pathscribe.css';
import { useBreadcrumb } from '@/contexts/BreadcrumbContext';
import { visibleTiles, type ScreenId } from '@/services/screens/screenAccess';
import { useCapabilities } from '@/hooks/useCapabilities';

interface SubTile {
  key: string;
  /** Batch 374: the screen it opens; shown only if the user may open it. */
  screen: ScreenId;
  title: string;
  description: string;
  route: string;
  color: string;
  image: string;
}

export default function QualityComplianceHubPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushCrumb } = useBreadcrumb();

  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => { pushCrumb(t('qualityComplianceHub.pageTitle'), '/quality-compliance'); }, [pushCrumb, t]);
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => { clearTimeout(timer); };
  }, []);

  // Real, same colors each tile already carried as a flat Home tile —
  // same real precedent as PathologyWorkspacePage.tsx's own tiles.
  const capabilities = useCapabilities();
  const allTiles: SubTile[] = [
    {
      key: 'audit',
      screen: 'auditLog',
      title: t('qualityComplianceHub.auditTile.title'),
      description: t('qualityComplianceHub.auditTile.description'),
      route: '/audit',
      color: '#D55E00',
      image: '/logs.webp',
    },
    {
      key: 'qualityAssurance',
      screen: 'qualityAssurance',
      title: t('qualityComplianceHub.qualityAssuranceTile.title'),
      description: t('qualityComplianceHub.qualityAssuranceTile.description'),
      route: '/quality-assurance',
      color: '#E69F00',
      image: '/deficiencies.webp',
    },
  ];
  // Batch 374: only the screens this user may open (services/screens/screenAccess.ts).
  const shown = new Set(visibleTiles(allTiles.map(x => x.screen), c => capabilities.has(c)));
  const tiles = allTiles.filter(x => shown.has(x.screen));

  return (
    <div className={`ps-page${isLoaded ? ' ps-page--loaded' : ''}`}>
      {/* Background — same treatment as Home.tsx */}
      <div className="ps-page-bg" />
      <div className="ps-page-gradient" />

      <div className="ps-page-content">
        <main className="ps-home-main">
          <header className="ps-home-header ps-home-header--split">
            <div>
              <h1 className="ps-home-title">{t('qualityComplianceHub.pageTitle')}</h1>
              <p className="ps-home-card-desc ps-mt-4">{t('qualityComplianceHub.pageSubtitle')}</p>
            </div>
            <button
              className="ps-btn-ghost-dark"
              onClick={() => navigate('/')}
            >
              {t('qualityComplianceHub.backToHome')}
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
                  style={{ '--card-accent': tile.color } as React.CSSProperties}
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
