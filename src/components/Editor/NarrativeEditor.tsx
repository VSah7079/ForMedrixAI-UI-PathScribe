import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import PathScribeEditor from './PathScribeEditor';
import type { PathScribeEditorHandle } from './PathScribeEditorRef';

export interface NarrativeEditorProps {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  macros?: any[];
  placeholder?: string;
  // ── Multi-instance shared toolbar — see PathScribeEditor for full docs ───
  suppressToolbar?: boolean;
  toolbarPortalId?: string;
  theme?: 'light' | 'dark';
  // ── User-configurable tab width — see PathScribeEditor for full docs ─────
  tabWidthChars?: number;
  onTabWidthChange?: (chars: number) => void;
}

const NarrativeEditor = React.forwardRef<PathScribeEditorHandle, NarrativeEditorProps>((
  {
    value,
    onChange,
    readOnly = false,
    minHeight = '500px',
    macros = [],
    placeholder,
    suppressToolbar = false,
    toolbarPortalId,
    theme = 'light',
    tabWidthChars,
    onTabWidthChange,
  },
  ref,
) => {
  const { t } = useTranslation();
  return (
    <div className="ne-wrap">
      <PathScribeEditor
        ref={ref}
        content={value}
        onChange={onChange}
        readOnly={readOnly}
        minHeight={minHeight}
        placeholder={placeholder ?? t('narrativeEditor.defaultPlaceholder')}
        macros={macros}
        approvedFonts={[
          'Arial',
          'Times New Roman',
          'Calibri',
          'Courier New',
          'Georgia',
        ]}
        suppressToolbar={suppressToolbar}
        toolbarPortalId={toolbarPortalId}
        theme={theme}
        tabWidthChars={tabWidthChars}
        onTabWidthChange={onTabWidthChange}
      />
    </div>
  );
});

NarrativeEditor.displayName = 'NarrativeEditor';

export default NarrativeEditor;
