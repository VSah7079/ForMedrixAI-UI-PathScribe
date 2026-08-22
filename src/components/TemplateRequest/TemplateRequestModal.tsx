/**
 * components/TemplateRequest/TemplateRequestModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Pathologist-facing form to request a new synoptic template.
 * 
 * - Submits via messageService.send() to the admin pool (u3 / System Admin)
 * - Embeds structured request metadata in the message body as JSON
 * - Base template selector pulls from published PROTOCOL_REGISTRY entries
 * - Admin can open the template editor pre-populated via the link in the message
 *
 * Entry points:
 *   1. AddSynopticModal — "Don't see what you need? Request a template →"
 *   2. Home page — alongside Enhancement Request tile
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef } from 'react';
import { messageService } from '@/services';
import { useAuth } from '@/contexts/AuthContext';
import { useMessaging } from '@/contexts/MessagingContext';
import { PROTOCOL_REGISTRY } from '@/components/Config/Protocols/protocolShared';

// ─── Constants ────────────────────────────────────────────────────────────────

const ORGANS = [
  'Breast', 'Colorectal / Rectum', 'Lung', 'Prostate', 'Kidney',
  'Bladder', 'Liver / Biliary', 'Pancreas', 'Skin / Melanoma',
  'Thyroid', 'Head & Neck', 'Gynaecological', 'Haematopathology',
  'Neuropathology', 'Soft Tissue / Bone', 'Other',
];

const STANDARDS = ['CAP', 'RCPath', 'ICCR', 'RCPA', 'Custom / Institution'];

const URGENCIES = [
  { value: 'routine',  label: 'Routine',       desc: 'No immediate deadline' },
  { value: 'moderate', label: 'Moderate',       desc: 'Needed within 4–6 weeks' },
  { value: 'urgent',   label: 'Urgent',         desc: 'New service / accreditation deadline' },
];

// Admin pool recipient — System Admin (u3)
const ADMIN_RECIPIENT = { id: 'u3', name: 'System Admin' };

// ─── Styling constants ────────────────────────────────────────────────────────

const C = {
  bg:      '#0f172a',
  surface: '#1e293b',
  border:  '#334155',
  text:    '#f1f5f9',
  muted:   '#94a3b8',
  teal:    '#0891b2',
  tealBg:  'rgba(8,145,178,0.08)',
  tealBdr: 'rgba(8,145,178,0.25)',
  amber:   '#f59e0b',
  amberBg: 'rgba(245,158,11,0.08)',
  amberBdr:'rgba(245,158,11,0.25)',
  green:   '#22c55e',
  greenBg: 'rgba(34,197,94,0.08)',
  greenBdr:'rgba(34,197,94,0.25)',
  input:   '#0f172a',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface TemplateRequestModalProps {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TemplateRequestModal: React.FC<TemplateRequestModalProps> = ({ onClose }) => {
  const { user }         = useAuth();
  const { setMessages }  = useMessaging();

  // Form state
  const [organ,        setOrgan]        = useState('');
  const [procedure,    setProcedure]    = useState('');
  const [standard,     setStandard]     = useState('CAP');
  const [keyFields,    setKeyFields]    = useState('');
  const [baseTemplate, setBaseTemplate] = useState('');
  const [urgency,      setUrgency]      = useState('routine');
  const [reason,       setReason]       = useState('');

  // UI state
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [error,        setError]        = useState('');
  const [baseSearch,   setBaseSearch]   = useState('');
  const [showBaseList, setShowBaseList] = useState(false);

  const baseRef = useRef<HTMLDivElement>(null);

  // Published templates for base selector
  const publishedTemplates = PROTOCOL_REGISTRY.filter(p => p.status === 'published');
  const filteredBase = publishedTemplates.filter(p =>
    !baseSearch.trim() ||
    p.name.toLowerCase().includes(baseSearch.toLowerCase()) ||
    p.category.toLowerCase().includes(baseSearch.toLowerCase()) ||
    p.source.toLowerCase().includes(baseSearch.toLowerCase())
  );
  const selectedBase = publishedTemplates.find(p => p.id === baseTemplate);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (baseRef.current && !baseRef.current.contains(e.target as Node)) {
        setShowBaseList(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isValid = organ.trim() && procedure.trim() && keyFields.trim();

  const handleSubmit = async () => {
    if (!isValid || submitting || !user) return;
    setSubmitting(true);
    setError('');

    // Structured metadata embedded in message — admin can parse this to
    // pre-populate the template editor
    const requestMeta = {
      __templateRequest: true,
      organ,
      procedure,
      standard,
      keyFields,
      baseTemplateId:   baseTemplate || null,
      baseTemplateName: selectedBase?.name ?? null,
      urgency,
      reason,
      requestedBy:   user.id,
      requestedByName: user.name,
      requestedAt:   new Date().toISOString(),
    };

    const urgencyLabel = URGENCIES.find(u => u.value === urgency)?.label ?? urgency;
    const baseNote = selectedBase ? `\n\nBase template: ${selectedBase.name} (${selectedBase.source})` : '';

    const body = `${user.name} has requested a new synoptic template.\n\n` +
      `Organ/Subspecialty: ${organ}\n` +
      `Procedure: ${procedure}\n` +
      `Standard: ${standard}\n` +
      `Urgency: ${urgencyLabel}${reason ? ` — ${reason}` : ''}\n` +
      `Key fields needed:\n${keyFields}` +
      baseNote +
      `\n\n<!-- TEMPLATE_REQUEST_META:${JSON.stringify(requestMeta)} -->`;

    try {
      const result = await messageService.send({
      senderId:      user.id,
      senderName:    user.name,
      recipientId:   ADMIN_RECIPIENT.id,
      recipientName: ADMIN_RECIPIENT.name,
      subject:       `Template Request — ${standard} ${organ} ${procedure}`,
      body,
      timestamp:     new Date(),
      isUrgent:      urgency === 'urgent',
      caseNumber:    '',
    });

      if (result.ok) {
        setMessages(prev => [...prev, result.data]);
        setSubmitted(true);
      } else {
        setError('Failed to send request. Please try again.');
      }
    } catch {
      setError('Failed to send request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${C.border}`, background: C.input, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase',
    letterSpacing: '0.06em', display: 'block', marginBottom: 6,
  };

  return (
    <div className="ps-overlay" style={{ zIndex: 9000, padding: 24 }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
        width: '100%', maxWidth: 600, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`,
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>
                Request a Synoptic Template
              </h2>
              <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
                Your request will be sent to the template administration team for review and construction.
              </p>
            </div>
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none', color: C.muted,
              fontSize: 20, cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
            }}>×</button>
          </div>
        </div>

        {/* Submitted state */}
        {submitted ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
              Request Submitted
            </h3>
            <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px', lineHeight: 1.6 }}>
              Your request for a <strong style={{ color: C.text }}>{standard} {organ} {procedure}</strong> template
              has been sent to the template administration team. You'll receive a message when it's ready.
            </p>
            <div style={{
              background: C.tealBg, border: `1px solid ${C.tealBdr}`,
              borderRadius: 8, padding: '10px 16px', fontSize: 12, color: C.teal, marginBottom: 24,
            }}>
              💡 In the meantime, check the Synoptic Library — a similar published template may meet your needs.
            </div>
            <button onClick={onClose} style={{
              padding: '9px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', border: 'none', background: C.teal, color: '#fff',
            }}>
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Organ + Procedure row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Organ / Subspecialty *</label>
                  <select value={organ} onChange={e => setOrgan(e.target.value)} style={inputStyle}>
                    <option value="">Select organ…</option>
                    {ORGANS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Standard *</label>
                  <select value={standard} onChange={e => setStandard(e.target.value)} style={inputStyle}>
                    {STANDARDS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Procedure */}
              <div>
                <label style={labelStyle}>Procedure / Specimen Type *</label>
                <input
                  value={procedure}
                  onChange={e => setProcedure(e.target.value)}
                  placeholder="e.g. Wide local excision, Radical cystectomy, TURBT"
                  style={inputStyle}
                />
              </div>

              {/* Key fields */}
              <div>
                <label style={labelStyle}>Key Fields Required *</label>
                <textarea
                  value={keyFields}
                  onChange={e => setKeyFields(e.target.value)}
                  placeholder={`List the data elements you need, e.g.:\n- Breslow thickness\n- Clark level\n- Ulceration (present / absent)\n- Mitotic rate\n- Microsatellites`}
                  style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
                />
                <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0' }}>
                  Clinical terms are fine — the admin team will map these to the correct template fields.
                </p>
              </div>

              {/* Base template selector */}
              <div ref={baseRef}>
                <label style={labelStyle}>Base Template <span style={{ color: C.muted, fontWeight: 400, textTransform: 'none' }}>(optional — admin will start from this)</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={showBaseList ? baseSearch : (selectedBase?.name ?? '')}
                    onChange={e => { setBaseSearch(e.target.value); setShowBaseList(true); }}
                    onFocus={() => { setShowBaseList(true); setBaseSearch(''); }}
                    placeholder="Search published templates…"
                    style={{ ...inputStyle, paddingRight: baseTemplate ? 36 : 12 }}
                  />
                  {baseTemplate && (
                    <button
                      onClick={() => { setBaseTemplate(''); setBaseSearch(''); }}
                      style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'transparent', border: 'none', color: C.muted,
                        fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1,
                      }}
                    >×</button>
                  )}
                  {showBaseList && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                      maxHeight: 200, overflowY: 'auto', marginTop: 4,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}>
                      {filteredBase.length === 0 ? (
                        <div style={{ padding: '12px 16px', fontSize: 13, color: C.muted }}>No templates found</div>
                      ) : filteredBase.map(p => (
                        <div
                          key={p.id}
                          onClick={() => { setBaseTemplate(p.id); setShowBaseList(false); setBaseSearch(''); }}
                          style={{
                            padding: '10px 16px', cursor: 'pointer', fontSize: 13,
                            background: p.id === baseTemplate ? C.tealBg : 'transparent',
                            color: C.text, borderBottom: `1px solid ${C.border}`,
                            display: 'flex', alignItems: 'center', gap: 10,
                          }}
                          onMouseEnter={e => { if (p.id !== baseTemplate) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                          onMouseLeave={e => { if (p.id !== baseTemplate) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }} data-phi="name">{p.name}</div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                              {p.source} · {p.fields} fields · v{p.version}
                            </div>
                          </div>
                          {p.id === baseTemplate && <span style={{ color: C.teal, fontWeight: 800 }}>✓</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedBase && (
                  <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 7,
                    background: C.tealBg, border: `1px solid ${C.tealBdr}`,
                    fontSize: 12, color: C.teal,
                  }}>
                    Admin will start from <strong>{selectedBase.name}</strong> ({selectedBase.fields} fields, {selectedBase.source} v{selectedBase.version})
                  </div>
                )}
              </div>

              {/* Urgency */}
              <div>
                <label style={labelStyle}>Urgency</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {URGENCIES.map(u => (
                    <label key={u.value} style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${urgency === u.value ? C.teal : C.border}`,
                      background: urgency === u.value ? C.tealBg : 'transparent',
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}>
                      <input type="radio" value={u.value} checked={urgency === u.value}
                        onChange={() => setUrgency(u.value)} style={{ display: 'none' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: urgency === u.value ? C.teal : C.text }}>
                        {u.label}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted }}>{u.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label style={labelStyle}>Reason / Additional Context <span style={{ color: C.muted, fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. New melanoma subspecialty clinic starting in March, ASHI inspection in 6 weeks"
                  style={inputStyle}
                />
              </div>

              {/* Info callout */}
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 12, color: C.muted,
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
                lineHeight: 1.6,
              }}>
                <strong style={{ color: C.text }}>What happens next:</strong> Your request is sent to the template administration team as an internal message. They will construct the template in the Synoptic Library, where it will go through the standard governance workflow (draft → review → approved → published). You will receive a notification when it is ready to use.
              </div>

              {error && (
                <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 24px', borderTop: `1px solid ${C.border}`,
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              background: 'rgba(0,0,0,0.15)',
            }}>
              <button onClick={onClose} style={{
                padding: '9px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                border: `1px solid ${C.border}`, background: 'transparent', color: C.muted,
                fontFamily: 'inherit',
              }}>
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
                style={{
                  padding: '9px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
                  border: 'none', fontFamily: 'inherit',
                  background: isValid && !submitting ? C.teal : 'rgba(8,145,178,0.2)',
                  color: isValid && !submitting ? '#fff' : C.muted,
                  transition: 'all 0.15s',
                }}
              >
                {submitting ? 'Sending…' : 'Submit Request'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
