import React from 'react';
import '../../../pathscribe.css';

const SaveToast: React.FC<{ message: string; visible: boolean }> = ({ message, visible }) => (
  <div className={`ps-save-toast${visible ? ' ps-save-toast--visible' : ''}`}>
    <span className="ps-save-toast-check">✓</span> {message}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export { SaveToast };
