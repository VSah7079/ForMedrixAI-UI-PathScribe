import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../../pathscribe.css';
import { Trash2, Plus, Search, Upload, Loader2 } from 'lucide-react';
import { VoiceMacro } from '../../types/voiceMacros';
import { MockVoiceMacroService } from '../../services/voicemacro/mockVoiceMacroService';
import { usePathScribeSpeech }   from '../../hooks/usepathscribeSpeech';

// Initialize the service instance
const macroService = new MockVoiceMacroService();

const SpeechConfigTab: React.FC = () => {
  const { t } = useTranslation();
  // --- State ---
  const [voiceMacros, setVoiceMacros] = useState<VoiceMacro[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Hook into the Voice Engine here
  const { isListening, transcript, startListening } = usePathScribeSpeech();

  // Hover states for UI feedback
  const [hoveredTrashId, setHoveredTrashId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    const loadMacros = async () => {
      try {
        const data = await macroService.getMacros();
        setVoiceMacros(data);
      } catch (error) {
        console.error("Failed to fetch macros:", error);
      } finally {
        setLoading(false);
      }
    };
    loadMacros();
  }, []);

  // --- Handlers ---
  const handleAddMacro = async () => {
    const newMacroData = { spoken: "", written: "", isActive: true };
    try {
      const id = await macroService.addMacro(newMacroData);
      const newMacro = { ...newMacroData, id };
      setVoiceMacros(prev => [newMacro, ...prev]);
      setEditingId(id);
    } catch (error) {
      console.error("Error adding macro:", error);
    }
  };

  const handleSave = async (id: string) => {
    const macro = voiceMacros.find(m => m.id === id);
    if (macro) {
      try {
        await macroService.updateMacro(id, macro);
        setEditingId(null);
      } catch (error) {
        console.error("Error updating macro:", error);
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await macroService.deleteMacro(id);
      setVoiceMacros(prev => prev.filter(m => m.id !== id));
    } catch (error) {
      console.error("Error deleting macro:", error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      try {
        const rows = content.split('\n').filter(row => row.trim() !== '');
        const newMacrosRaw = rows.map(row => {
          const [spoken, written] = row.split(',').map(s => s.trim());
          return { spoken: spoken || "New Macro", written: written || "", isActive: true };
        });

        await macroService.bulkImport(newMacrosRaw);
        const refreshedData = await macroService.getMacros();
        setVoiceMacros(refreshedData);
      } catch (err) {
        alert(t('speechConfigTab.csvFormatAlert'));
      }
    };
    reader.readAsText(file);
  };

  // --- Filtering Logic ---
  const filteredMacros = useMemo(() => {
    return voiceMacros.filter(m => {
      const matchesSearch = m.spoken.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            m.written.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" ? true :
                            statusFilter === "active" ? m.isActive : !m.isActive;
      return matchesSearch && matchesStatus;
    });
  }, [voiceMacros, searchTerm, statusFilter]);

  if (loading) {
    return (
      <div className="sct-loading">
        <Loader2 size={24} className="animate-spin sct-loading-icon" />
        <span>{t('speechConfigTab.loadingMacros')}</span>
      </div>
    );
  }

  return (
    <div className="sct-root">
      {/* CSS Pulse Animation */}
      <style>
        {`
          @keyframes pulse-red {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
          }
        `}
      </style>

      {/* HEADER */}
      <div className="sct-header">
        <div>
          <h2 className="sct-title">{t('speechConfigTab.title')}</h2>
          <p className="sct-subtitle">{t('speechConfigTab.subtitle')}</p>
        </div>

        <div className="sct-header-actions">
          {/* Transcript Feedback */}
          {transcript && (
            <div className="sct-transcript-chip">
              {t('speechConfigTab.heardPrefix')} <strong>"{transcript}"</strong>
            </div>
          )}

          {/* Test Voice Button */}
          <button
            onClick={startListening}
            className={`ps-voice-test-btn${isListening ? ' ps-voice-test-btn--listening' : ''}`}
          >
            <div
              className="sct-test-dot"
              style={{
                '--sct-dot-bg':   isListening ? '#ef4444' : '#0891B2',
                '--sct-dot-anim': isListening ? 'pulse-red 1.5s infinite' : 'none',
              } as React.CSSProperties}
            />
            {isListening ? t('speechConfigTab.listening') : t('speechConfigTab.testVoice')}
          </button>

          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" style={{ display: 'none' }} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="ps-conf-btn-secondary sct-bulk-btn"
          >
            <Upload size={16} /> {t('speechConfigTab.bulkImport')}
          </button>
          <button
            onClick={handleAddMacro}
            className="ps-conf-btn-primary sct-add-btn"
          >
            <Plus size={16} /> {t('speechConfigTab.addMacro')}
          </button>
        </div>
      </div>
      {/* TOOLBAR */}
      <div className="sct-toolbar">
        <div className="sct-search-wrap">
          <Search size={14} className="sct-search-icon" />
          <input
            type="text"
            placeholder={t('speechConfigTab.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="sct-search-input"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="sct-status-select"
        >
          <option value="all">{t('speechConfigTab.statusAll')}</option>
          <option value="active">{t('speechConfigTab.statusActiveOnly')}</option>
          <option value="inactive">{t('speechConfigTab.statusInactiveOnly')}</option>
        </select>
      </div>

      {/* TABLE */}
      <table className="sct-table">
        <thead>
          <tr className="sct-thead-row">
            <th className="sct-th sct-th--name">{t('speechConfigTab.colName')}</th>
            <th className="sct-th sct-th--text">{t('speechConfigTab.colResultingText')}</th>
            <th className="sct-th sct-th--status">{t('speechConfigTab.colStatus')}</th>
            <th className="sct-th sct-th--actions">{t('speechConfigTab.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {filteredMacros.map((macro) => {
            const isEditing = editingId === macro.id;
            return (
              <tr key={macro.id} className="sct-row">
                <td className="sct-cell">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={macro.spoken}
                      onChange={(e) => setVoiceMacros(prev => prev.map(m => m.id === macro.id ? {...m, spoken: e.target.value} : m))}
                      className="sct-cell-input"
                    />
                  ) : (
                    <span className="sct-spoken-text">{macro.spoken}</span>
                  )}
                </td>
                <td className="sct-cell">
                  {isEditing ? (
                    <input
                      value={macro.written}
                      onChange={(e) => setVoiceMacros(prev => prev.map(m => m.id === macro.id ? {...m, written: e.target.value} : m))}
                      className="sct-cell-input"
                    />
                  ) : (
                    <span className="sct-written-text">{macro.written}</span>
                  )}
                </td>
                <td className="sct-cell">
                  <button
                    disabled={!isEditing}
                    onClick={() => setVoiceMacros(prev => prev.map(m => m.id === macro.id ? {...m, isActive: !m.isActive} : m))}
                    className="sct-status-btn"
                    style={{
                      '--sct-status-bg':     isEditing ? 'rgba(255,255,255,0.05)' : 'transparent',
                      '--sct-status-border': isEditing ? '1px solid #1e293b' : '1px solid transparent',
                      '--sct-status-color':  macro.isActive ? '#22c55e' : '#94a3b8',
                      '--sct-status-cursor': isEditing ? 'pointer' : 'default',
                    } as React.CSSProperties}
                  >
                    <div className="sct-status-dot" style={{ '--sct-status-dot-bg': macro.isActive ? '#22c55e' : '#475569' } as React.CSSProperties} />
                    {macro.isActive ? t('speechConfigTab.active') : t('speechConfigTab.inactive')}
                  </button>
                </td>
                <td className="sct-cell">
                  <div className="sct-actions-cell">
                    {isEditing ? (
                      <button
                        onClick={() => handleSave(macro.id)}
                        className="ps-conf-btn-primary"
                      >
                        {t('speechConfigTab.save')}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingId(macro.id)}
                          className="ps-conf-btn-row"
                        >
                          {t('speechConfigTab.edit')}
                        </button>
                        <button
                          onClick={() => handleDelete(macro.id)}
                          onMouseEnter={() => setHoveredTrashId(macro.id)}
                          onMouseLeave={() => setHoveredTrashId(null)}
                          aria-label={t('speechConfigTab.deleteMacroAriaLabel', { spoken: macro.spoken })}
                          className="sct-delete-btn"
                          style={{
                            '--sct-delete-color':   hoveredTrashId === macro.id ? '#ef4444' : '#94a3b8',
                            '--sct-delete-opacity': hoveredTrashId === macro.id ? 1 : 0.65,
                          } as React.CSSProperties}
                        >
                          <Trash2 size={16} strokeWidth={2} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SpeechConfigTab;
