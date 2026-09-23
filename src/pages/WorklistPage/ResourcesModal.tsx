import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';

interface ResourcesModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  quickLinks: {
    protocols: { title: string; url: string }[];
    references: { title: string; url: string }[];
    systems: { title: string; url: string }[];
  };
}

const LinkSection: React.FC<{ label: string; links: { title: string; url: string }[] }> = ({ label, links }) => (
  <div className="ps-resources-section">
    <div className="ps-resources-section-label">{label}</div>
    {links.map(link => (
      <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="ps-resources-link">
        {link.title}
      </a>
    ))}
  </div>
);

const ResourcesModal: React.FC<ResourcesModalProps> = ({ isOpen, onClose, quickLinks }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;
  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark ps-resources-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ps-resources-title">
          {t('resourcesModal.quickLinks')}
        </div>

        <LinkSection label={t('resourcesModal.protocols')}  links={quickLinks.protocols} />
        <LinkSection label={t('resourcesModal.references')} links={quickLinks.references} />
        <LinkSection label={t('resourcesModal.systems')}    links={quickLinks.systems} />

        <button className="ps-btn-ghost-dark ps-resources-close-btn" onClick={onClose}>
          {t('resourcesModal.close')}
        </button>
      </div>
    </div>
  );
};

export default ResourcesModal;
