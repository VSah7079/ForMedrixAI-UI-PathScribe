import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { Flag } from '../../services/flags/IFlagService';

interface Props {
  flags: Flag[];
  onReview: () => void;
}

const AutoCreatedBanner: React.FC<Props> = ({ flags, onReview }) => {
  const { t } = useTranslation();
  if (!flags.length) return null;

  const codes = flags.map(f => f.lisCode).join(', ');
  const count = flags.length;

  return (
    <div className="banner-warning acb-banner">
      <div>
        <strong>
          {t('autoCreatedBanner.newFlagsDetected', { count })}
        </strong>{' '}
        {codes}
        <div className="acb-detail">
          {t('autoCreatedBanner.detailText')}
        </div>
      </div>
      <button
        className="ps-conf-btn-primary acb-review-btn"
        onClick={onReview}
      >
        {t('autoCreatedBanner.reviewNow')}
      </button>
    </div>
  );
};

export default AutoCreatedBanner;
