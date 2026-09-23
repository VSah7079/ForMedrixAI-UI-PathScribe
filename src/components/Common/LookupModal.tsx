/**
 * LookupModal.tsx — src/components/Common/LookupModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared full-screen search-and-select modal used across pathscribe.
 * Currently used by: SearchPage (SNOMED, ICD-10, ICD-O, Specimen, Synoptic,
 *                                Flags, Pathologist, Attending)
 *
 * Usage:
 *   <LookupModal
 *     title="SNOMED CT"
 *     subtitle="Select clinical findings or morphology codes"
 *     onClose={() => setOpen(false)}
 *   >
 *     <CodeLookupContent ... />
 *   </LookupModal>
 *
 * The modal shell handles:
 *   - Fixed full-screen overlay with blur backdrop
 *   - Close on overlay click or Escape key
 *   - Consistent header with title, subtitle, selection count, and close button
 *   - Scrollable content area via .ps-scroll
 *
 * Content is passed as children — see the *Content components below for
 * reusable content implementations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';

// ─── Shell ────────────────────────────────────────────────────────────────────

interface LookupModalProps {
  title:       string;
  subtitle?:   string;
  selectedCount?: number;   // shown as "N selected" badge in header
  onClose:     () => void;
  children:    React.ReactNode;
}

export const LookupModal: React.FC<LookupModalProps> = ({
  title, subtitle, selectedCount, onClose, children,
}) => {
  const { t } = useTranslation();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div onClick={onClose} className="ps-lookup-overlay">
      <div onClick={e => e.stopPropagation()} className="ps-lookup-modal">
        {/* Header */}
        <div className="ps-lookup-header">
          <div>
            <div className="ps-lookup-title-row">
              <span className="ps-lookup-title">{title}</span>
              {selectedCount != null && selectedCount > 0 && (
                <span className="ps-lookup-selected-badge">
                  {t('lookupModal.selectedBadge', { count: selectedCount })}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="ps-lookup-subtitle">{subtitle}</p>
            )}
          </div>
          <button onClick={onClose} className="ps-lookup-close-btn">×</button>
        </div>

        {/* Content — scrollable */}
        <div className="ps-scroll ps-lookup-content">
          {children}
        </div>

        {/* Footer — Done button */}
        <div className="ps-lookup-footer">
          <button onClick={onClose} className="ps-lookup-done-btn">
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Shared search input used inside content components ───────────────────────

interface LookupSearchProps {
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
}

export const LookupSearch: React.FC<LookupSearchProps> = ({ value, onChange, placeholder }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="ps-lookup-search-wrap">
      <svg className="ps-lookup-search-icon"
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? t('lookupModal.searchPlaceholder')}
        className="ps-lookup-search-input"
      />
      {value && (
        <button onClick={() => onChange('')} className="ps-lookup-search-clear">×</button>
      )}
    </div>
  );
};

// ─── LookupItem — single row used by all content types ───────────────────────

interface LookupItemProps {
  selected:  boolean;
  onToggle:  () => void;
  primary:   string;
  secondary?: string;
  badge?:    string;
  badgeColor?: string;
}

export const LookupItem: React.FC<LookupItemProps> = ({
  selected, onToggle, primary, secondary, badge, badgeColor = '#0891B2',
}) => (
  <div
    onClick={onToggle}
    className={`ps-lookup-item${selected ? ' ps-lookup-item--selected' : ''}`}
  >
    {/* Label */}
    <div className="ps-lookup-item-label">
      <span className={`ps-lookup-item-primary${selected ? ' ps-lookup-item-primary--selected' : ''}`}>{primary}</span>
      {secondary && <span className="ps-lookup-item-secondary">{secondary}</span>}
    </div>

    {/* Badge */}
    {badge && (
      <span
        className="ps-lookup-item-badge"
        style={{ color: badgeColor, background: `${badgeColor}18`, border: `1px solid ${badgeColor}30` }}
      >{badge}</span>
    )}

    {/* Checkmark — only shown when selected */}
    <div className="ps-lookup-item-check">
      {selected && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="7" fill="#0891B2"/>
          <path d="M3.5 7l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  </div>
);

// ─── Section divider used inside grouped content ──────────────────────────────

export const LookupSection: React.FC<{ label: string; count: number }> = ({ label, count }) => (
  <div className="ps-lookup-section">
    <span className="ps-lookup-section-label">{label}</span>
    <span className="ps-lookup-section-count">{count}</span>
    <div className="ps-lookup-section-divider" />
  </div>
);

// ─── Empty state ──────────────────────────────────────────────────────────────

export const LookupEmpty: React.FC<{ query: string }> = ({ query }) => {
  const { t } = useTranslation();
  return (
    <div className="ps-lookup-empty">
      <div className="ps-lookup-empty-icon">🔍</div>
      <div className="ps-lookup-empty-title">{t('lookupModal.noResultsFor', { query })}</div>
      <div className="ps-lookup-empty-hint">{t('lookupModal.tryDifferentTerm')}</div>
    </div>
  );
};
