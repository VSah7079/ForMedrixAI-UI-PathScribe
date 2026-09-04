import React, { useState, useEffect } from 'react';
import '../../../pathscribe.css';
import { modelService, facilityService } from '../../../services';
import { AIModel, ModelVendor } from '../../../services/models/IModelService';
import type { Facility } from '../../../services/facilities/IFacilityService';
import { hasPassingValidationForVoiceModel } from '../AI/resolveVoiceAiModel';

const statusStyle: Record<string, React.CSSProperties> = {
  Active:  { color: '#81C995', background: 'rgba(129,201,149,0.15)', border: '1px solid rgba(129,201,149,0.3)'  },
  Retired: { color: '#9AA0A6', background: 'rgba(154,160,166,0.10)', border: '1px solid rgba(154,160,166,0.2)' },
  Beta:    { color: '#FDD663', background: 'rgba(253,214,99,0.12)',  border: '1px solid rgba(253,214,99,0.3)'   },
};

// Real, honest labels for the vendors this app actually knows about —
// keeps the table readable rather than showing raw union values.
const vendorLabel: Record<ModelVendor, string> = {
  anthropic: 'Anthropic',
  openai:    'OpenAI',
  google:    'Google',
  other:     'Other',
};

const ModelsTab: React.FC = () => {
  const [models,  setModels]  = useState<AIModel[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([modelService.getAll(), facilityService.getAll()]).then(([modelsRes, facilitiesRes]) => {
      if (modelsRes.ok) setModels(modelsRes.data);
      if (facilitiesRes.ok) setFacilities(facilitiesRes.data);
      setLoading(false);
    });
  }, []);

  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const handleSetDefault = async (id: string) => {
    setBlockedMessage(null);
    const target = models.find(m => m.id === id);
    // Real fix, per direct product decision: voice models have no
    // per-facility override layer the way report-generation models do
    // (Facility.internalAiModelId) — this "Set Default" action IS the
    // only point where a voice model actually goes live, so this is
    // the only place the hard block can meaningfully apply. Same
    // absolute-block posture as resolveClientAiModel.ts: an
    // unvalidated voice model going live on a real deployment is a
    // real liability concern, not just a UX one.
    if (target?.type === 'Voice Dictation') {
      const eligible = await hasPassingValidationForVoiceModel(id);
      if (!eligible) {
        setBlockedMessage(`"${target.name} ${target.version}" needs a PASS-graded, reported Validation Study before it can become the active voice model.`);
        return;
      }
    }
    const res = await modelService.setDefault(id);
    if (res.ok) {
      // Real fix: previously un-defaulted EVERY model in local state
      // regardless of type, no longer matching the now type-aware
      // backend (see mockModelService.ts's setDefault) — only clear
      // isDefault on other models within the same group (voice vs
      // non-voice) as the one just set.
      const isVoice = target?.type === 'Voice Dictation';
      setModels(prev => prev.map(m => {
        const sameGroup = (m.type === 'Voice Dictation') === isVoice;
        return sameGroup ? { ...m, isDefault: m.id === id } : m;
      }));
    }
  };

  // Real fix, per direct request: "track which types and versions are
  // at our customer sites." A facility is only ever "on" a model via
  // its own explicit internalAiModelId override — there's no separate
  // tracking table to fall out of sync, this reads the exact same
  // field the hard-block enforcement itself checks.
  const facilitiesOnModel = (modelId: string) => facilities.filter(c => c.internalAiModelId === modelId);

  if (loading) return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Loading models...</div>
  );

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>Models</h2>
      <p style={{ fontSize: '14px', color: '#9AA0A6', marginBottom: '24px' }}>View and compare AI model performance across versions.</p>
      {blockedMessage && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13 }}>
          🔒 {blockedMessage}
        </div>
      )}
      <div style={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
              {['Model', 'Vendor', 'Type', 'Accuracy', 'Cases Processed', 'Status', 'Facilities Approved', 'Default'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#9AA0A6', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m, i) => {
              const approved = facilitiesOnModel(m.id);
              return (
              <tr key={m.id} style={{ borderBottom: i < models.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', opacity: m.status === 'Retired' ? 0.6 : 1 }}>
                <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600, color: '#DEE4E7' }}>
                  {m.name} {m.version}
                </td>
                <td style={{ padding: '14px 16px', fontSize: '14px', color: '#9AA0A6' }}>{vendorLabel[m.vendor]}</td>
                <td style={{ padding: '14px 16px', fontSize: '14px', color: '#9AA0A6' }}>{m.type}</td>
                <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 700, color: '#8AB4F8' }}>{m.accuracy}%</td>
                <td style={{ padding: '14px 16px', fontSize: '14px', color: '#9AA0A6' }}>{m.casesProcessed.toLocaleString()}</td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '12px', fontWeight: 600, ...statusStyle[m.status] }}>{m.status}</span>
                </td>
                <td style={{ padding: '14px 16px', fontSize: '13px' }}>
                  {approved.length === 0 ? (
                    <span style={{ color: '#6b7280' }}>—</span>
                  ) : (
                    <span
                      style={{ color: '#81C995', fontWeight: 600, cursor: 'default' }}
                      title={approved.map(c => c.name).join(', ')}
                    >
                      {approved.length} facilit{approved.length === 1 ? 'y' : 'ies'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  {m.isDefault ? (
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#8AB4F8' }}>✓ Default</span>
                  ) : m.status !== 'Retired' ? (
                    <button
                      onClick={() => handleSetDefault(m.id)}
                      style={{ padding: '4px 12px', fontSize: '12px', fontWeight: 600, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, background: 'rgba(255,255,255,0.07)', cursor: 'pointer', color: '#DEE4E7' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                    >Set Default</button>
                  ) : null}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ModelsTab;
