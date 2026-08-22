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

  const cards: Card[] = [
    // ⭐ New tile
    {
      title: 'Accession',
      description: 'Log new specimens and assign Grossing Templates',
      route: '/accession',
      color: '#22C55E',
      image: '/accession.webp'
    },

    { title: 'Worklist', description: 'View and manage pending pathology cases', route: '/worklist', color: '#0891B2', image: '/worklist.webp' },
    { title: 'Configuration', description: 'System settings and AI preferences', route: '/configuration', color: '#F59E0B', image: '/config.webp' },
    { title: 'Search', description: 'Search completed and in-progress cases', route: '/search', color: '#8B5CF6', image: '/search.webp' },
    { title: 'Audit', description: 'Review System Activities, Audit Trail, and Quality Assurance', route: '/audit', color: '#EF4444', image: '/logs.webp' },
    { title: 'Quality Assurance', description: 'Deficiencies, Intraoperative Linkage, and Discordance & Reconciliation reporting', route: '/quality-assurance', color: '#F97316', image: '/deficiencies.webp' },
    { title: 'Intraop Queue', description: 'Unlinked intraoperative entries awaiting a formal LIS accession to merge into', route: '/intraop-queue', color: '#0EA5E9', image: '/worklist.webp' },

    // ⭐ New tile
    {
      title: 'My Contribution',
      description: 'Workload • Quality • TAT • Trends',
      route: '/contribution',
      color: '#0EA5E9',
      image: '/my_contributions.webp'
    },

    // ⭐ New tile
    {
      title: 'Batch Management',
      description: 'Track cassettes and slides through processing nodes via container barcodes',
      route: '/batch-management',
      color: '#6366F1',
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
