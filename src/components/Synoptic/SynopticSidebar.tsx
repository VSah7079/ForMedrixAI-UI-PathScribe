// PathScribe — SynopticSidebar
// Thin wrapper that applies the synoptic page's sidebar border and scroll
// behaviour to the existing Sidebar component.
// The Computational insights section has been moved into the Results tab
// of the left panel — no sidebar real estate needed.

import React from 'react';

interface Props {
  children: React.ReactNode;
}

const SynopticSidebar: React.FC<Props> = ({ children }) => (
  <div className="synoptic-sidebar">
    {children}
  </div>
);

export default SynopticSidebar;
