import React from "react";
import '../../../pathscribe.css';
import { useNavigate } from "react-router";

type Template = { id: string; name: string; version: string; status: string; };

const mockTemplates: Template[] = [
  { id: "generic_test_basic", name: "Generic Synoptic Test Form — Basic", version: "1.0", status: "staged" },
];

export const AdminTemplateList: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="ps-tmpl-list-wrap">
      <h1>Template Review Queue</h1>
      {mockTemplates.map(t => (
        <div key={t.id} className="ps-tmpl-list-card" onClick={() => navigate(`/template-review/${t.id}`)}>
          <div className="ps-tmpl-list-card-name">{t.name}</div>
          <div className="ps-tmpl-list-card-meta">Version: {t.version}</div>
          <div className="ps-tmpl-list-card-meta">Status: {t.status}</div>
        </div>
      ))}
    </div>
  );
};
