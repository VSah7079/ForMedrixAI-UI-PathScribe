import { useState } from 'react';
import { getUiPreference } from '@/utils/uiPreferences';

// Batch 344: the username and password state for the sign-out and
// finalize modals moved into useSignerConfirmation (hooks/), which checks
// them. The post-sign-out preference reads through uiPreferences.
const PREF_KEY = 'postSignOutPref';

export function useSynopticFinalize() {
  const [showFinalizeModal,    setShowFinalizeModal]    = useState(false);
  const [finalizeAndNext,      setFinalizeAndNext]      = useState(false);
  const [showSignOutModal,     setShowSignOutModal]     = useState(false);
  const [caseSigned,           setCaseSigned]           = useState(false);
  const [showPostSignOutModal, setShowPostSignOutModal] = useState(false);
  const [postSignOutPref,      setPostSignOutPref]      = useState<'next' | 'worklist'>(
    () => getUiPreference<'next' | 'worklist'>(PREF_KEY, 'next')
  );
  const [showAmendmentModal,   setShowAmendmentModal]   = useState(false);
  const [amendmentText,        setAmendmentText]        = useState('');
  const [amendmentMode,        setAmendmentMode]        = useState<'amendment' | 'correction' | 'addendum'>('amendment');

  return {
    showFinalizeModal,    setShowFinalizeModal,
    finalizeAndNext,      setFinalizeAndNext,
    showSignOutModal,     setShowSignOutModal,
    caseSigned,           setCaseSigned,
    showPostSignOutModal, setShowPostSignOutModal,
    postSignOutPref,      setPostSignOutPref,
    showAmendmentModal,   setShowAmendmentModal,
    amendmentText,        setAmendmentText,
    amendmentMode,        setAmendmentMode,
  };
}
