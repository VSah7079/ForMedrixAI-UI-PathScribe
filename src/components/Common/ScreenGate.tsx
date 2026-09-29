// src/components/Common/ScreenGate.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 374: a route's check that the signed-in user may open its screen
// (services/screens/screenAccess.ts). The Home page already hides tiles for
// screens the user can't open; this stops the address being typed in. The
// decision is the service's; this shows the screen, or a short "no access"
// page with a way home.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import '../../pathscribe.css';
import { screenAccessService, type ScreenId, type HomeTileId } from '@/services';
import { useAuth } from '@/contexts/AuthContext';

export const ScreenGate: React.FC<{ screen: ScreenId | HomeTileId; children: React.ReactNode }> = ({ screen, children }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAllowed(null);
    screenAccessService.canOpen(screen)
      .then(ok => { if (!cancelled) setAllowed(ok); })
      .catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, [screen, user?.id, user?.role]);

  if (allowed === null) return null;
  if (allowed) return <>{children}</>;
  return (
    <div className="ps-screen-denied" role="alert">
      <h1 className="ps-screen-denied-title">{t('screenAccess.denied.title')}</h1>
      <p className="ps-screen-denied-body">{t('screenAccess.denied.body')}</p>
      <button type="button" className="ps-conf-btn-primary" onClick={() => navigate('/')}>{t('screenAccess.denied.home')}</button>
    </div>
  );
};

export default ScreenGate;
