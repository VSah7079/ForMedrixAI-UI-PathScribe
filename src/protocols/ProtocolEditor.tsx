import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuditLog } from "../components/Audit/useAuditLog";
import {
  ProtocolDefinition,
  ProtocolSection,
  ProtocolQuestion,
  ProtocolQuestionType,
  ProtocolLifecycleState
} from "../types/ProtocolDefinition";
import {
  loadProtocolRegistry,
  saveProtocolOverride
} from "./protocolRegistry";
import { buildProtocolChangeSummary } from "./protocolChangeSummary";

// Persisted enum values — translate only the displayed label, not the
// underlying value (established codebase pattern for lifecycle/status/
// type-style fields).
const LIFECYCLE_LABEL_KEY: Record<ProtocolLifecycleState, string> = {
  draft: "protocolEditor.lifecycle.draft",
  validated: "protocolEditor.lifecycle.validated",
  published: "protocolEditor.lifecycle.published",
  archived: "protocolEditor.lifecycle.archived",
};

const QUESTION_TYPE_LABEL_KEY: Record<ProtocolQuestionType, string> = {
  choice: "protocolEditor.questionType.choice",
  text: "protocolEditor.questionType.text",
  number: "protocolEditor.questionType.number",
  boolean: "protocolEditor.questionType.boolean",
};

const ProtocolEditor: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { protocolId } = useParams();
  const location = useLocation();
  const { log } = useAuditLog();
  const returnTab = new URLSearchParams(location.search).get("from") || "protocols";
  const [protocol, setProtocol] = useState<ProtocolDefinition | null>(null);
  const originalProtocol = React.useRef<ProtocolDefinition | null>(null);

  useEffect(() => {
    const registry = loadProtocolRegistry();
    if (protocolId && registry[protocolId]) {
      const loaded = structuredClone(registry[protocolId]);
      setProtocol(loaded);
      originalProtocol.current = structuredClone(loaded);
    }
  }, [protocolId]);

  if (!protocol) {
    return (
      <div className="ps-pe-notfound-page">
        <button
          onClick={() => navigate(`/configuration?tab=${returnTab}`)}
          className="ps-pe-notfound-back-btn"
        >
          ← {t('protocolEditor.backToConfiguration')}
        </button>
        <div className="ps-pe-notfound-text">{t('protocolEditor.notFound')}</div>
      </div>
    );
  }

  const updateSection = (sectionId: string, updater: (s: ProtocolSection) => ProtocolSection) => {
    setProtocol(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map(s => (s.id === sectionId ? updater(s) : s))
      };
    });
  };

  const updateQuestion = (
    sectionId: string,
    questionId: string,
    updater: (q: ProtocolQuestion) => ProtocolQuestion
  ) => {
    updateSection(sectionId, section => ({
      ...section,
      questions: section.questions.map(q =>
        q.id === questionId ? updater(q) : q
      )
    }));
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    setProtocol(prev => {
      if (!prev) return prev;
      const idx = prev.sections.findIndex(s => s.id === sectionId);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.sections.length) return prev;
      const sections = [...prev.sections];
      const [moved] = sections.splice(idx, 1);
      sections.splice(newIdx, 0, moved);
      return { ...prev, sections };
    });
  };

  const moveQuestion = (
    sectionId: string,
    questionId: string,
    direction: -1 | 1
  ) => {
    updateSection(sectionId, section => {
      const idx = section.questions.findIndex(q => q.id === questionId);
      if (idx < 0) return section;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= section.questions.length) return section;
      const questions = [...section.questions];
      const [moved] = questions.splice(idx, 1);
      questions.splice(newIdx, 0, moved);
      return { ...section, questions };
    });
  };

  const addSection = () => {
    const id = `section_${Date.now()}`;
    setProtocol(prev =>
      prev
        ? {
            ...prev,
            sections: [
              ...prev.sections,
              { id, title: t('protocolEditor.section.newTitle'), questions: [] }
            ]
          }
        : prev
    );
  };

  const addQuestion = (sectionId: string) => {
    const id = `q_${Date.now()}`;
    updateSection(sectionId, section => ({
      ...section,
      questions: [
        ...section.questions,
        {
          id,
          text: t('protocolEditor.question.newText'),
          type: "text",
          required: false
        }
      ]
    }));
  };

  const save = () => {
    if (!protocol) return;
    saveProtocolOverride(protocol);

    // Audit-log change summary — persisted audit-trail text, deliberately
    // left in English regardless of locale (see protocolChangeSummary.ts).
    const changes = buildProtocolChangeSummary(originalProtocol.current, protocol);

    log("save_protocol", {
      name: protocol.name,
      changes,
    });

    navigate(`/configuration?tab=${returnTab}`);
  };

  return (
    <div className="ps-pe-page">
      {/* ── Top nav bar ─────────────────────────────────────────────────── */}
      <div className="ps-pe-navbar">
        <button
          onClick={() => navigate(`/configuration?tab=${returnTab}`)}
          className="ps-pe-nav-back-btn"
        >
          ← {t('protocolEditor.backToConfiguration')}
        </button>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="ps-pe-content">

        {/* Header */}
        <div className="ps-pe-header">
          <h1 className="ps-pe-title">
            {t('protocolEditor.title', { name: protocol.name })}
          </h1>
          <div className="ps-pe-meta-row">
            <span>{t('protocolEditor.meta.source')}: <span className="ps-pe-meta-value">
              {/* CAP/RCPath are governing-body abbreviations and stay literal;
                  "Custom" is the one source value that's genuine UI copy. */}
              {protocol.source === 'Custom' ? t('protocolEditor.source.custom') : protocol.source}
            </span></span>
            <span className="ps-pe-meta-sep">&bull;</span>
            <span>{t('protocolEditor.meta.version')}: <span className="ps-pe-meta-value">{protocol.version}</span></span>
            <span className="ps-pe-meta-sep">&bull;</span>
            <span>{t('protocolEditor.meta.lifecycle')}:{" "}
              <span
                className={`ps-pe-lifecycle-value${
                  protocol.lifecycle === "validated" ? " ps-pe-lifecycle-value--validated"
                    : protocol.lifecycle === "draft" ? " ps-pe-lifecycle-value--draft"
                    : ""
                }`}
              >
                {t(LIFECYCLE_LABEL_KEY[protocol.lifecycle])}
              </span>
            </span>
          </div>
        </div>

        {/* Add Section button */}
        <div className="ps-pe-add-section-wrap">
          <button onClick={addSection} className="ps-pe-add-section-btn">
            + {t('protocolEditor.addSection')}
          </button>
        </div>

        {/* Sections */}
        {protocol.sections.map((section, sIdx) => (
          <div key={section.id} className="ps-pe-section-card">
            {/* Section header row */}
            <div className="ps-pe-section-header">
              <input
                type="text"
                value={section.title}
                onChange={e =>
                  updateSection(section.id, s => ({ ...s, title: e.target.value }))
                }
                className="ps-pe-input ps-pe-section-title-input"
              />
              <div className="ps-pe-arrow-group">
                <button
                  onClick={() => moveSection(section.id, -1)}
                  disabled={sIdx === 0}
                  className="ps-pe-arrow-btn"
                >↑</button>
                <button
                  onClick={() => moveSection(section.id, 1)}
                  disabled={sIdx === protocol.sections.length - 1}
                  className="ps-pe-arrow-btn"
                >↓</button>
              </div>
            </div>

            {/* Section body */}
            <div className="ps-pe-section-body">
              <div className="ps-pe-add-question-wrap">
                <button
                  onClick={() => addQuestion(section.id)}
                  className="ps-pe-add-question-btn"
                >
                  + {t('protocolEditor.addQuestion')}
                </button>
              </div>

              {section.questions.map((q, qIdx) => (
                <div key={q.id} className="ps-pe-question-card">
                  <div
                    className={`ps-pe-question-header-row${q.type === "choice" ? " ps-pe-question-header-row--spaced" : ""}`}
                  >
                    <input
                      type="text"
                      value={q.text}
                      onChange={e =>
                        updateQuestion(section.id, q.id, qq => ({
                          ...qq,
                          text: e.target.value
                        }))
                      }
                      className="ps-pe-input"
                    />
                    <select
                      value={q.type}
                      onChange={e =>
                        updateQuestion(section.id, q.id, qq => ({
                          ...qq,
                          type: e.target.value as any
                        }))
                      }
                      className="ps-pe-select"
                    >
                      {(Object.keys(QUESTION_TYPE_LABEL_KEY) as ProtocolQuestionType[]).map(qt => (
                        <option key={qt} value={qt}>{t(QUESTION_TYPE_LABEL_KEY[qt])}</option>
                      ))}
                    </select>
                    <label className="ps-pe-required-label">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={e =>
                          updateQuestion(section.id, q.id, qq => ({
                            ...qq,
                            required: e.target.checked
                          }))
                        }
                        className="ps-pe-required-checkbox"
                      />
                      {t('protocolEditor.required')}
                    </label>
                    <div className="ps-pe-arrow-group">
                      <button
                        onClick={() => moveQuestion(section.id, q.id, -1)}
                        disabled={qIdx === 0}
                        className="ps-pe-arrow-btn"
                      >↑</button>
                      <button
                        onClick={() => moveQuestion(section.id, q.id, 1)}
                        disabled={qIdx === section.questions.length - 1}
                        className="ps-pe-arrow-btn"
                      >↓</button>
                    </div>
                  </div>

                  {q.type === "choice" && (
                    <div className="ps-pe-choice-hint">
                      {t('protocolEditor.choiceOptionsHint')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Save / Cancel */}
        {(() => {
          const hasChanges = JSON.stringify(protocol) !== JSON.stringify(originalProtocol.current);
          return (
        <div className="ps-pe-footer-row">
          <button
            onClick={save}
            disabled={!hasChanges}
            className="ps-pe-save-btn"
          >
            {t('protocolEditor.saveProtocol')}
          </button>
          <button
            onClick={() => navigate(`/configuration?tab=${returnTab}`)}
            className="ps-pe-cancel-btn"
          >
            {t('common.cancel')}
          </button>
        </div>
          );
        })()}
      </div>
    </div>
  );
};

export default ProtocolEditor;
