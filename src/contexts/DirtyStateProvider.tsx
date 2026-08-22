// src/contexts/DirtyStateProvider.tsx

import React, { useState, useCallback, useRef } from 'react';
import { DirtyStateContext } from './DirtyStateContext';

export const DirtyStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDirty, setIsDirty]        = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const onProceedRef = React.useRef<((path: string) => void) | null>(null);
  const saveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const discardHandlerRef = useRef<(() => void) | null>(null);

  const setDirty = useCallback((dirty: boolean) => setIsDirty(dirty), []);

  const requestNavigate = useCallback((path: string, onProceed: (path: string) => void) => {
    if (!isDirty) {
      onProceed(path);
      return;
    }
    setPendingPath(path);
    onProceedRef.current = onProceed;
  }, [isDirty]);

  const confirmNavigate = useCallback(() => {
    const path    = pendingPath;
    const proceed = onProceedRef.current;
    setIsDirty(false);
    setPendingPath(null);
    onProceedRef.current = null;
    if (path && proceed) proceed(path);
  }, [pendingPath]);

  const cancelNavigate = useCallback(() => {
    setPendingPath(null);
    onProceedRef.current = null;
  }, []);

  const registerSaveHandler = useCallback((fn: (() => Promise<boolean>) | null) => {
    saveHandlerRef.current = fn;
  }, []);

  const getSaveHandler = useCallback(() => saveHandlerRef.current, []);

  const registerDiscardHandler = useCallback((fn: (() => void) | null) => {
    discardHandlerRef.current = fn;
  }, []);

  const getDiscardHandler = useCallback(() => discardHandlerRef.current, []);

  return (
    <DirtyStateContext.Provider value={{
      isDirty, setDirty, requestNavigate, pendingPath, confirmNavigate, cancelNavigate,
      registerSaveHandler, getSaveHandler, registerDiscardHandler, getDiscardHandler,
    }}>
      {children}
    </DirtyStateContext.Provider>
  );
};
