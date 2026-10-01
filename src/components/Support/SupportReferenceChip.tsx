// src/components/Support/SupportReferenceChip.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Batch 364 (PS-350): a record's support reference, to quote to support
// instead of the case number. Clicking creates (first time) or reveals the
// reference and copies it; it isn't created just by showing a list.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { supportReferenceService, type SupportReferenceKind } from '@/services';

interface Props {
  kind: SupportReferenceKind;
  recordId: string;
}

const SupportReferenceChip: React.FC<Props> = ({ kind, recordId }) => {
  const { t } = useTranslation();
  const [ref, setRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let value = ref;
    if (!value) {
      const res = await supportReferenceService.forRecord(kind, recordId);
      if (!res.ok) return;
      value = res.data.ref;
      setRef(value);
    }
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable: the reference is still shown to copy by hand */ }
  };

  return (
    <button type="button" className={`ps-supportref-chip${ref ? ' ps-supportref-chip--shown' : ''}`} onClick={handleClick}
      title={t('supportReference.chip.title')} aria-label={t('supportReference.chip.title')}>
      <span aria-hidden="true">🔖</span>
      <span className="ps-supportref-chip-text">{ref ?? t('supportReference.chip.label')}</span>
      {copied && <span className="ps-supportref-chip-copied">{t('supportReference.chip.copied')}</span>}
    </button>
  );
};

export default SupportReferenceChip;
