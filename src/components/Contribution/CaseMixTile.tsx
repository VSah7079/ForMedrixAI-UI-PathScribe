import React, { useState } from "react";
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import type { CaseMixData } from "../../types/ContributionDashboard";

export interface CaseMixTileProps {
  title: string;
  data: CaseMixData;
  colors: Record<keyof CaseMixData, string>;
  showCounts?: boolean;
}

const CATEGORY_LABEL_KEY: Record<keyof CaseMixData, string> = {
  breast: "caseMixTile.category.breast",
  gi:     "caseMixTile.category.gi",
  gu:     "caseMixTile.category.gu",
  derm:   "caseMixTile.category.derm",
  other:  "caseMixTile.category.other",
};

const CaseMixTile: React.FC<CaseMixTileProps> = ({ title, data, colors, showCounts: _showCounts = false }) => {
  const { t: translate } = useTranslation();
  const [hovered, setHovered] = useState<keyof CaseMixData | null>(null);
  const categories = Object.keys(data) as Array<keyof CaseMixData>;
  const total = categories.reduce((sum, k) => sum + data[k], 0);
  const maxVal = Math.max(...categories.map(k => data[k]));

  return (
    <div className="cmt-tile">
      {/* Header */}
      <div className="cmt-header">
        <div>
          <div className="cmt-title">{title}</div>
          <div className="cmt-subtitle">
            {translate('caseMixTile.distributionSummary', { total })}
          </div>
        </div>
      </div>

      {/* Bars */}
      <div className="cmt-bars">
        {categories.map((key) => {
          const pct    = Math.round((data[key] / total) * 100);
          const barH   = (data[key] / maxVal) * 80;
          const isHov  = hovered === key;

          return (
            <div key={key} className="cmt-bar-col"
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Tooltip */}
              {isHov && (
                <div className="cmt-tooltip">
                  <div className="cmt-tooltip-title">{translate(CATEGORY_LABEL_KEY[key])}</div>
                  <div>{translate('caseMixTile.tooltipCasesPct', { count: data[key], pct })}</div>
                </div>
              )}

              {/* Count always visible above bar */}
              <div className="cmt-count" style={{ '--cmt-count-color': colors[key] } as React.CSSProperties}>
                {data[key]}
              </div>

              {/* Bar */}
              <div
                className="cmt-bar"
                style={{ '--cmt-bar-h': `${barH}px`, '--cmt-bar-bg': colors[key], '--cmt-bar-opacity': isHov ? 1 : 0.85 } as React.CSSProperties}
              />

              {/* Label + pct always visible below */}
              <div className="cmt-bar-footer">
                <div className="cmt-bar-label">{translate(CATEGORY_LABEL_KEY[key])}</div>
                <div className="cmt-bar-pct">{translate('caseMixTile.pct', { pct })}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CaseMixTile;
