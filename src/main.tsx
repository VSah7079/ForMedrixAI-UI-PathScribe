import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'
import './pathscribe.css';
import './i18n/config';
import { signingCallbackProvider } from './services/auth/sso/ssoClient';

// Real, per direct follow-up on testing PS-239's own real endpoint
// with mock data — see services/mockInterfaceEngine/
// mockInterfaceEngineSettings.ts's own header for the full account.
// Real, deliberate double-gate: import.meta.env.DEV (Vite's own real,
// build-time flag — false in a real production build, so this whole
// branch is dead code there, never shipped) AND a separate, explicit,
// persisted "enabled" flag defaulting to OFF — never active by
// accident even in a real local dev session.
if (import.meta.env.DEV) {
  import('./services/mockInterfaceEngine/mockInterfaceEngineSettings').then(({ getMockInterfaceEngineSettings }) => {
    if (getMockInterfaceEngineSettings().enabled) {
      import('./mocks/browser').then(({ mockInterfaceEngineWorker }) => {
        mockInterfaceEngineWorker.start({ onUnhandledRequest: 'bypass' });
      });
    }
  });
}

// Batch 344: the signature-confirmation popup returns here
// (/auth/signing/<provider>). It only hands the identity provider's answer
// back to the window that opened it, which then closes it. The app itself
// never starts in the popup: its session code would otherwise treat the
// popup as a second tab of the same session.
const signingProvider = signingCallbackProvider(window.location.pathname);
if (signingProvider) {
  void import('./services/auth/authSessionInstance')
    .then(m => m.signerConfirmation.completePopup(signingProvider, window.location.href))
    .catch(e => console.error('[signing] could not return the confirmation to PathScribe', e));
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
