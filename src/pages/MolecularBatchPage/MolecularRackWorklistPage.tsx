// src/pages/MolecularBatchPage/MolecularRackWorklistPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Real, per direct follow-up: "Implement the load into extraction
// rack workflow step (§5.1's secondary_rack stage)." Matches this
// app's own established worklist/detail split
// (MolecularWorkcenterPage.tsx/MolecularPlateBuilderPage.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import '../../pathscribe.css';
import { mockMolecularExtractionRackService } from '../../services/molecular/mockMolecularExtractionRackService';
import type { MolecularExtractionRack } from '../../services/molecular/IMolecularExtractionRackService';

const MolecularRackWorklistPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [racks, setRacks] = useState<MolecularExtractionRack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    mockMolecularExtractionRackService.getAll().then(res => {
      if (res.ok) setRacks([...res.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
    });
  }, []);

  return (
    <div className="ps-app-root ps-page-container ps-page-container--medium">
      <div className="ps-page-header-row">
        <div>
          <h1 className="ps-page-title">{t('molecularRackWorklistPage.title')}</h1>
          <p className="ps-page-subtitle">
            {t('molecularRackWorklistPage.subtitle')}
          </p>
        </div>
        <button className="ps-conf-btn-secondary" onClick={() => navigate('/molecular-rack/new')}>{t('molecularRackWorklistPage.newRack')}</button>
      </div>

      <div className="ps-conf-table-wrap">
        <div className="ps-conf-table-scroll">
          <table className="ps-conf-table">
            <thead className="ps-conf-thead-sticky">
              <tr>
                <th className="ps-conf-th">{t('molecularRackWorklistPage.colRack')}</th>
                <th className="ps-conf-th">{t('molecularRackWorklistPage.colCapacity')}</th>
                <th className="ps-conf-th">{t('molecularRackWorklistPage.colOccupied')}</th>
                <th className="ps-conf-th">{t('molecularRackWorklistPage.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td className="ps-conf-empty-row" colSpan={4}>{t('molecularRackWorklistPage.loading')}</td></tr>)}
              {!loading && racks.length === 0 && (<tr><td className="ps-conf-empty-row" colSpan={4}>{t('molecularRackWorklistPage.empty')}</td></tr>)}
              {!loading && racks.map(r => {
                const occupied = r.positions.filter(p => p.containerBarcode).length;
                return (
                  <tr key={r.id} className="ps-conf-tr ps-conf-tr--clickable" onClick={() => navigate(`/molecular-rack/${r.id}`)}>
                    <td className="ps-conf-td">{r.rackBarcode}</td>
                    <td className="ps-conf-td">{r.capacity}</td>
                    <td className="ps-conf-td">{occupied} / {r.capacity}</td>
                    <td className="ps-conf-td">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MolecularRackWorklistPage;
