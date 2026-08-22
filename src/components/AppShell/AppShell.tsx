/**
 * components/AppShell/AppShell.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global layout shell — wraps all authenticated pages.
 * Contains the shared nav bar so individual pages don't duplicate it.
 *
 * Renders:
 *   - Logo → navigates home
 *   - Breadcrumb slot (driven by current route)
 *   - 💡 Enhancement Request button
 *   - User initials badge
 *   - Quick Links button
 *   - Logout button
 *   - <Outlet /> for the active page content
 *
 * Drop-in path: src/components/AppShell/AppShell.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useAuditLog } from '@/components/Audit/useAuditLog';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLogout } from '../../hooks/useLogout';
import { messageService } from '../../services';
import { useMessaging } from '../../contexts/MessagingContext';
import NavBar, { SystemInfoModal } from '../NavBar/NavBar';
import ScanStationPrompt from '../ScanStationPrompt';
import StationSwitchGuardModal from '../StationSwitchGuardModal';
import { useBreadcrumb } from '../../contexts/BreadcrumbContext';
import { useDirtyState } from '../../contexts/DirtyStateContext';
import '../../pathscribe.css';
import { openUserGuide, openAdminGuide } from '../../utils/guideAssets';
import ConfirmModal from '../Common/ConfirmModal';

// ─── Internal user directory ─────────────────────────────────────────────────
interface InternalUser { id: string; name: string; role: string; }
const INTERNAL_USERS: InternalUser[] = [
  { id: 'u2',  name: 'Lab Manager',          role: 'Laboratory'           },
  { id: 'u3',  name: 'System Admin',          role: 'IT / Administration'  },
  { id: 'u4',  name: 'Dr. Sarah Li Chen',     role: 'Pathology'            },
  { id: 'u5',  name: 'Dr. James Emeka Okafor',role: 'Pathology'            },
  { id: 'u6',  name: 'IT Support',            role: 'IT / Administration'  },
  { id: 'u7',  name: 'Billing Dept',          role: 'Finance'              },
  { id: 'u8',  name: 'Dr. Miller',            role: 'Pathology'            },
  { id: 'u9',  name: 'Archives',              role: 'Medical Records'      },
  { id: 'u10', name: 'QA Team',               role: 'Quality Assurance'    },
  { id: 'u11', name: 'Dr. Aisha Priya Patel', role: 'Gastroenterology'     },
  { id: 'u12', name: 'Transcription',         role: 'Medical Transcription'},
  { id: 'u13', name: 'Medical Records',       role: 'Medical Records'      },
  { id: 'u14', name: 'Dr. Wilson',            role: 'Oncology'             },
  { id: 'u15', name: 'Compliance',            role: 'Compliance'           },
  { id: 'u16', name: 'Supply Room',           role: 'Operations'           },
  { id: 'u17', name: 'Dr. Lee',               role: 'Dermatopathology'     },
];

const avatarInitials = (name: string) => {
  const parts = name.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s*/i, '').split(' ').filter(Boolean);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0]?.[0]?.toUpperCase() ?? '?';
};


// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS — defined in this file so AppShell stays self-contained
// ═══════════════════════════════════════════════════════════════════════════

// ── Helpers shared by sub-components ────────────────────────────────────────
const relTime = (ts: Date | string): string => {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// ── UserSearchOverlay ────────────────────────────────────────────────────────
interface UserSearchOverlayProps {
  alreadyAdded: string[];
  onSelect: (u: InternalUser) => void;
  onClose: () => void;
}
const UserSearchOverlay: React.FC<UserSearchOverlayProps> = ({ alreadyAdded, onSelect, onClose }) => {
  const [q,        setQ]        = React.useState('');
  const [pending,  setPending]  = React.useState<InternalUser[]>([]);
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { ref.current?.focus(); }, []);

  const pendingIds = pending.map(u => u.id);
  const results = INTERNAL_USERS.filter(u =>
    !alreadyAdded.includes(u.id) &&
    (u.name.toLowerCase().includes(q.toLowerCase()) || u.role.toLowerCase().includes(q.toLowerCase()))
  );

  const toggle = (u: InternalUser) => {
    setPending(prev =>
      prev.find(p => p.id === u.id) ? prev.filter(p => p.id !== u.id) : [...prev, u]
    );
  };

  const handleDone = () => {
    pending.forEach(u => onSelect(u));
    onClose();
  };

  return (
    <div className="ps-user-search-modal">
      <div className="ps-user-search-header">
        <span className="ps-user-search-title">Find a recipient</span>
        <button className="ps-user-search-close" onClick={onClose}>×</button>
      </div>

      {/* Selected chips */}
      {pending.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'8px 16px 0' }}>
          {pending.map(u => (
            <span key={u.id} style={{ display:'inline-flex', alignItems:'center', gap:5,
              padding:'3px 10px', borderRadius:999, fontSize:12, fontWeight:600,
              background:'rgba(8,145,178,0.15)', color:'#38bdf8', border:'1px solid rgba(8,145,178,0.3)' }}>
              {u.name}
              <span onClick={() => toggle(u)} style={{ cursor:'pointer', opacity:0.7, fontSize:13 }}>×</span>
            </span>
          ))}
        </div>
      )}

      <div className="ps-user-search-input-wrap">
        <div className="ps-user-search-bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={ref} className="ps-user-search-input" type="text" placeholder="Search by name or department…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      <div className="ps-user-search-results">
        {results.length === 0
          ? <div className="ps-user-search-empty">No users found.</div>
          : results.map(u => {
              const sel = pendingIds.includes(u.id);
              return (
                <div key={u.id}
                  className="ps-user-search-item"
                  onClick={() => toggle(u)}
                  style={{ background: sel ? 'rgba(8,145,178,0.08)' : undefined }}>
                  <div className="ps-user-search-avatar" style={{ background: sel ? 'rgba(8,145,178,0.3)' : undefined }}>
                    {sel ? '✓' : avatarInitials(u.name)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div className="ps-user-search-name">{u.name}</div>
                    <div className="ps-user-search-role">{u.role}</div>
                  </div>
                  {sel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
              );
            })
        }
      </div>

      <div className="ps-user-search-footer" style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button className="ps-user-search-cancel" onClick={onClose}>Cancel</button>
        <button
          onClick={handleDone}
          disabled={pending.length === 0}
          style={{ padding:'8px 20px', borderRadius:8, border:'none', fontSize:13, fontWeight:700, cursor: pending.length > 0 ? 'pointer' : 'default',
            background: pending.length > 0 ? '#0891b2' : 'rgba(255,255,255,0.05)',
            color: pending.length > 0 ? '#fff' : '#475569', transition:'all 0.15s' }}>
          Add {pending.length > 0 ? `${pending.length} recipient${pending.length > 1 ? 's' : ''}` : 'recipients'}
        </button>
      </div>
    </div>
  );
};

// ── ComposePanel ─────────────────────────────────────────────────────────────
interface ComposePanelProps {
  recipients: InternalUser[];
  toInput: string;
  subject: string;
  body: string;
  isUrgent: boolean;
  showUserSearch: boolean;
  toDropdownOpen: boolean;
  toHighlightIdx: number;
  toInputRef: React.RefObject<HTMLInputElement>;
  onRecipientsChange: React.Dispatch<React.SetStateAction<InternalUser[]>>;
  onToInputChange: (v: string) => void;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onUrgentToggle: () => void;
  onToDropdownOpenChange: (v: boolean) => void;
  onToHighlightIdxChange: (v: number) => void;
  onShowUserSearch: (v: boolean) => void;
  onCancel: () => void;
  onSend: () => void;
  onSecureEmail: () => void;
}

const ComposePanel: React.FC<ComposePanelProps> = ({
  recipients, toInput, subject, body, isUrgent,
  toDropdownOpen, toHighlightIdx, toInputRef,
  onRecipientsChange, onToInputChange, onSubjectChange, onBodyChange,
  onUrgentToggle, onToDropdownOpenChange, onToHighlightIdxChange, onShowUserSearch,
  onCancel, onSend, onSecureEmail,
}) => {
  const suggestions = React.useMemo(() => {
    const q = toInput.toLowerCase().trim();
    if (!q) return [];
    const addedIds = recipients.map(r => r.id);
    return INTERNAL_USERS.filter(u =>
      !addedIds.includes(u.id) &&
      (u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
    );
  }, [toInput, recipients]);

  React.useEffect(() => {
    onToDropdownOpenChange(suggestions.length > 0 && toInput.trim().length > 0);
    onToHighlightIdxChange(0);
  }, [suggestions.length, toInput, onToDropdownOpenChange, onToHighlightIdxChange]);

  const addRecipient = (u: InternalUser) => {
    onRecipientsChange(prev => [...prev, u]);
    onToInputChange('');
    onToDropdownOpenChange(false);
    toInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (toDropdownOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); onToHighlightIdxChange(Math.min(toHighlightIdx + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); onToHighlightIdxChange(Math.max(toHighlightIdx - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (suggestions[toHighlightIdx]) addRecipient(suggestions[toHighlightIdx]); return; }
      if (e.key === 'Escape') { onToDropdownOpenChange(false); return; }
    }
    if (e.key === 'Backspace' && !toInput && recipients.length > 0) {
      onRecipientsChange(prev => prev.slice(0, -1));
    }
  };

  const handleBlur = () => {
    const exact = INTERNAL_USERS.find(u => u.name.toLowerCase() === toInput.toLowerCase().trim() && !recipients.find(r => r.id === u.id));
    if (exact) addRecipient(exact);
    setTimeout(() => onToDropdownOpenChange(false), 150);
  };

  const canSend = recipients.length > 0 && subject.trim() && body.trim();

  return (
    <div className="ps-compose-panel">
      <div className="ps-compose-body">

        {/* To: row */}
        <div className="ps-compose-row ps-compose-row--to">
          <span className="ps-compose-label">To:</span>
          <div className="ps-compose-to-field">
            {recipients.map(r => (
              <span key={r.id} className="ps-compose-chip">
                {r.name}
                <button className="ps-compose-chip-remove" onMouseDown={e => e.preventDefault()} onClick={() => onRecipientsChange(prev => prev.filter(u => u.id !== r.id))}>×</button>
              </span>
            ))}
            <input
              ref={toInputRef}
              className="ps-compose-to-input"
              type="text"
              placeholder={recipients.length === 0 ? 'Type a name…' : ''}
              value={toInput}
              onChange={e => onToInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              autoComplete="off"
            />
            <button className="ps-compose-search-btn" onMouseDown={e => e.preventDefault()} onClick={() => onShowUserSearch(true)} title="Browse all internal users">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            {toDropdownOpen && (
              <div className="ps-compose-dropdown">
                {suggestions.map((u, i) => (
                  <div key={u.id} className={`ps-compose-dropdown-item${i === toHighlightIdx ? ' highlighted' : ''}`} onMouseDown={e => e.preventDefault()} onClick={() => addRecipient(u)}>
                    <div className="ps-compose-dropdown-avatar">{avatarInitials(u.name)}</div>
                    <div>
                      <div className="ps-compose-dropdown-name">{u.name}</div>
                      <div className="ps-compose-dropdown-role">{u.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Subject */}
        <div className="ps-compose-row">
          <span className="ps-compose-label">Subject</span>
          <input className="ps-compose-field-input" type="text" placeholder="Enter subject…" value={subject} onChange={e => onSubjectChange(e.target.value)} />
        </div>

        {/* Options bar */}
        <div className="ps-compose-options">
          <button className={`ps-compose-urgent-btn${isUrgent ? ' active' : ''}`} onClick={onUrgentToggle}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill={isUrgent ? '#EF4444' : 'none'} stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Urgent
          </button>
          <div className="ps-compose-actions">
            <button className="ps-compose-cancel-btn" onClick={onCancel}>Cancel</button>
            <button className={`ps-compose-secure-btn${canSend ? '' : ' disabled'}`} disabled={!canSend} onClick={onSecureEmail} title="Send as secure external email">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Secure Email
            </button>
            <button className={`ps-compose-send-btn${canSend ? '' : ' disabled'}`} disabled={!canSend} onClick={onSend}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              Send
            </button>
          </div>
        </div>

        {/* Body */}
        <textarea className="ps-compose-textarea" placeholder="Type your message here…" value={body} onChange={e => onBodyChange(e.target.value)} />
      </div>
    </div>
  );
};

// ── MessageListPanel ─────────────────────────────────────────────────────────
interface MessageListPanelProps {
  messages: any[];
  selectedMsgId: string | null;
  hoveredMsgId: string | null;
  isEditing: boolean;
  selectedIds: string[];
  filterType: 'all' | 'deleted';
  loading: boolean;
  isComposing: boolean;
  searchText: string;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onSoftDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onSearchChange: (v: string) => void;
  onBulkMarkRead: () => void;
  onBulkDelete: () => void;
  onEmptyDeleted: () => void;
  onCompose: () => void;
  onSecureEmail: () => void;
}

const MessageListPanel: React.FC<MessageListPanelProps> = ({
  messages, selectedMsgId, hoveredMsgId, isEditing, selectedIds,
  filterType, loading, isComposing, searchText,
  onHover, onSelect, onToggleCheck, onSoftDelete, onRestore, onPermanentDelete,
  onSearchChange, onBulkMarkRead, onBulkDelete, onEmptyDeleted, onCompose, onSecureEmail,
}) => (
  <div className="ps-msg-sidebar">
    <div className="ps-msg-list" tabIndex={0} role="region" aria-label="Message list">
      {loading ? (
        <div className="ps-msg-list-status">Loading…</div>
      ) : messages.length === 0 ? (
        <div className="ps-msg-list-status">
          {filterType === 'deleted' ? 'No deleted messages.' : 'Your inbox is empty.'}
        </div>
      ) : messages.map(m => {
        const isChecked  = selectedIds.includes(m.id);
        const isSelected = selectedMsgId === m.id;
        const rowClass = [
          'ps-msg-row',
          isSelected && 'selected',
          !m.isRead && 'unread',
          !isSelected && m.isUrgent && 'urgent-row',
        ].filter(Boolean).join(' ');
        return (
          <div key={m.id}
            className={rowClass}
            onMouseEnter={() => onHover(m.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => isEditing ? onToggleCheck(m.id) : onSelect(m.id)}
          >
            {/* Checkbox in edit mode */}
            {isEditing && (
              <div className={`ps-msg-row-checkbox${isChecked ? ' checked' : ''}`}>
                {isChecked && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2,6 5,9 10,3"/></svg>}
              </div>
            )}
            {/* Avatar */}
            <div className={`ps-msg-avatar${m.isUrgent ? ' urgent-avatar' : ''}`}>
              {avatarInitials(m.senderName)}
            </div>
            {/* Body */}
            <div className="ps-msg-row-body">
              <div className="ps-msg-row-top">
                <span className="ps-msg-row-sender">
                  {m.senderName}
                </span>
                {!isEditing && (
                  hoveredMsgId === m.id ? (
                    filterType === 'deleted' ? (
                      <div className="ps-msg-row-hover-actions" onClick={e => e.stopPropagation()}>
                        <button onClick={e => { e.stopPropagation(); onRestore(m.id); }} className="ps-msg-row-restore-btn">Restore</button>
                        <button onClick={e => { e.stopPropagation(); onPermanentDelete(m.id); }} className="ps-msg-row-delete-link">Delete</button>
                      </div>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); onSoftDelete(m.id); }} className="ps-msg-row-delete-icon-btn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    )
                  ) : (
                    <div className="ps-msg-row-meta">
                      {m.isUrgent && <span className="ps-msg-urgent-pill">Urgent</span>}
                      <span className="ps-msg-row-time">{relTime(m.timestamp)}</span>
                    </div>
                  )
                )}
              </div>
              <div className="ps-msg-row-subject">{m.subject}</div>
              <div className="ps-msg-row-preview">{m.body}</div>
            </div>
            {!m.isRead && !isEditing && <div className="ps-msg-unread-dot" />}
          </div>
        );
      })}
    </div>

    {/* Footer */}
    <div className="ps-msg-sidebar-footer">
      {isEditing ? (
        <div className="ps-msg-footer-edit-row">
          <button onClick={onBulkMarkRead} className="ps-msg-footer-readall-btn">Read All</button>
          <button onClick={onBulkDelete} className="ps-msg-footer-deleteall-btn">Delete</button>
        </div>
      ) : filterType === 'deleted' ? (
        <div className="ps-msg-footer-empty-row">
          <button onClick={onEmptyDeleted} disabled={messages.length === 0} className="ps-msg-footer-deleteall-btn ps-msg-footer-deleteall-btn--centered">Delete All</button>
        </div>
      ) : (
        <div className="ps-msg-footer-normal-row">
          {/* Search */}
          <div className="ps-msg-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8aaccc" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search" value={searchText} onChange={e => onSearchChange(e.target.value)} />
          </div>
          {/* Compose */}
          <button onClick={onCompose} disabled={isComposing} title="New internal message" className="ps-msg-compose-icon-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          {/* Secure email */}
          <button onClick={onSecureEmail} title="Send secure external email" className="ps-msg-footer-secure-btn">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </button>
        </div>
      )}
    </div>
  </div>
);

// ── ThreadPanel ───────────────────────────────────────────────────────────────
interface ThreadPanelProps {
  message: any;
  userId: string;
  inputText: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onSoftDelete: () => void;
  onMarkUnread: () => void;
  onCreateTemplate?: (messageId: string) => void;
}

const ThreadPanel: React.FC<ThreadPanelProps> = ({ message, userId, inputText, onInputChange, onSend, onSoftDelete, onMarkUnread, onCreateTemplate }) => {
  // Detect template requests — body contains embedded metadata marker
  const isTemplateRequest = typeof message.body === 'string' && message.body.includes('<!-- TEMPLATE_REQUEST_META:');
  const templateMeta = React.useMemo(() => {
    if (!isTemplateRequest) return null;
    try {
      const match = message.body.match(/<!-- TEMPLATE_REQUEST_META:(.*?) -->/s);
      return match ? JSON.parse(match[1]) : null;
    } catch { return null; }
  }, [message.body, isTemplateRequest]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const bubbleEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { bubbleEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [message.thread]);

  const thread = message.thread?.length
    ? message.thread
    : [{ senderId: message.senderId, sender: message.senderName, text: message.body, timestamp: message.timestamp }];

  return (
    <>
      <div className="ps-thread-body ps-msg-thread" style={{ position: 'relative' }}>
        {thread.map((msg: any, idx: number) => {
          const isMe = msg.senderId === userId;
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#7a95b0', marginBottom: 4, display: 'flex', gap: 5 }}>
                <span>{msg.sender}</span><span>·</span>
                <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style={{ maxWidth: '72%', padding: '11px 15px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.6, color: isMe ? '#d8f0f8' : '#d0daea', background: isMe ? '#0d5f79' : '#1a2740', border: isMe ? 'none' : '1px solid rgba(255,255,255,0.07)', borderBottomRightRadius: isMe ? 4 : 14, borderBottomLeftRadius: isMe ? 14 : 4, wordBreak: 'break-word' as const }}>
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={bubbleEndRef} />

        {/* ── Template Request Action Banner ── */}
        {isTemplateRequest && templateMeta && (
          <div style={{
            margin: '0 0 16px', padding: '12px 16px', borderRadius: 10,
            background: 'rgba(8,145,178,0.08)', border: '1px solid rgba(8,145,178,0.25)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <div style={{ flex: 1, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              <strong style={{ color: '#e2e8f0', display: 'block', marginBottom: 2 }}>
                Synoptic Template Request
              </strong>
              {templateMeta.standard} {templateMeta.organ} — {templateMeta.procedure}
              {templateMeta.baseTemplateName && (
                <span style={{ color: '#38bdf8' }}> · Base: {templateMeta.baseTemplateName}</span>
              )}
            </div>
            {onCreateTemplate && (
              <button
                onClick={() => onCreateTemplate(message.id)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', border: '1.5px solid rgba(8,145,178,0.5)',
                  background: 'rgba(8,145,178,0.15)', color: '#38bdf8',
                  fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' as const,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(8,145,178,0.28)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(8,145,178,0.15)')}
              >
                ＋ Create Template
              </button>
            )}
          </div>
        )}

        {/* ⋯ menu */}
        <div style={{ position: 'absolute', top: 0, right: 0 }}>
          <button onClick={() => setMenuOpen(v => !v)} style={{ background: 'none', border: 'none', color: '#7a95b0', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#d0daea'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8aaccc'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
              <div style={{ position: 'absolute', top: '100%', right: 0, background: '#162036', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', minWidth: 175, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', zIndex: 50 }}>
                {[
                  { label: 'Mark as unread', action: () => { onMarkUnread(); setMenuOpen(false); }, danger: false },
                  { label: 'Delete message',  action: () => { onSoftDelete(); setMenuOpen(false); }, danger: true  },
                ].map(item => (
                  <button key={item.label} onClick={item.action}
                    style={{ display: 'flex', width: '100%', padding: '11px 14px', background: 'none', border: 'none', color: item.danger ? '#EF4444' : '#d0daea', fontSize: 13, cursor: 'pointer', textAlign: 'left' as const, borderBottom: '1px solid rgba(255,255,255,0.06)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                  >{item.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Reply bar */}
      <div style={{ padding: '14px 20px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, background: '#0a1220', flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: '#0f1d2e', border: '1px solid rgba(100,130,160,0.35)', borderRadius: 24, padding: '6px 8px 6px 16px', transition: 'border-color 0.15s' }}
          onFocusCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(8,145,178,0.5)'}
          onBlurCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(80,110,140,0.5)'}
        >
          <input className="ps-input" type="text" placeholder="Reply…" value={inputText}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#d0daea', fontSize: 14 }}
          />
          <button onClick={onSend} disabled={!inputText.trim()}
            style={{ width: 32, height: 32, borderRadius: '50%', background: inputText.trim() ? '#0891B2' : 'transparent', border: inputText.trim() ? 'none' : '1px solid rgba(80,110,140,0.5)', cursor: inputText.trim() ? 'pointer' : 'default', color: inputText.trim() ? '#FFF' : '#6b8099', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </>
  );
};

// ── SecureEmailModal ──────────────────────────────────────────────────────────
// Compose and send a secure external email via NHSMail (demo: simulated send)

interface SecureEmailModalProps {
  isOpen:        boolean;
  fromName:      string;
  fromEmail:     string;
  prefillTo?:    string;
  prefillSubject?: string;
  prefillBody?:  string;
  onClose:       () => void;
  /** Called once the simulated send completes — lets the caller log
   *  the event. Previously declared at the call site but never in
   *  this interface, and never invoked here either, so the intended
   *  audit log for sent emails never actually fired. */
  onSent?:       (to: string, subject: string) => void;
}

const SecureEmailModal: React.FC<SecureEmailModalProps> = ({
  isOpen, fromName, fromEmail, prefillTo = '', prefillSubject = '', prefillBody = '', onClose, onSent,
}) => {
  const [to,      setTo]      = React.useState(prefillTo);
  const [subject, setSubject] = React.useState(prefillSubject);
  const [body,    setBody]    = React.useState(prefillBody);
  const [status,  setStatus]  = React.useState<'compose' | 'sending' | 'sent'>('compose');

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTo(prefillTo); setSubject(prefillSubject); setBody(prefillBody); setStatus('compose');
    }
  }, [isOpen, prefillTo, prefillSubject, prefillBody]);

  const canSend = to.includes('@') && subject.trim() && body.trim();

  const handleSend = async () => {
    if (!canSend) return;
    setStatus('sending');
    // Simulate NHSMail SMTP handshake delay
    await new Promise(r => setTimeout(r, 1800));
    setStatus('sent');
    onSent?.(to, subject);
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal-dark" style={{ width: 560, padding: 0 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding:'18px 24px 14px', borderBottom:'1px solid rgba(51,65,85,0.9)', background:'radial-gradient(circle at top left, rgba(56,189,248,0.08), transparent 55%), #0b1120', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em', color:'#64748b', marginBottom:4 }}>
              🔒 NHSMail · Secure External Email
            </div>
            <div style={{ fontSize:18, fontWeight:700, color:'#e2e8f0' }}>New Secure Message</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#64748b', cursor:'pointer', fontSize:20, padding:4, lineHeight:1 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {status === 'sent' ? (
          /* ── Sent confirmation ── */
          <div style={{ padding:'48px 24px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(16,185,129,0.15)', border:'2px solid #10B981', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'#e2e8f0', marginBottom:6 }}>Message sent securely</div>
              <div style={{ fontSize:13, color:'#64748b' }}>Delivered to <strong style={{ color:'#94a3b8' }}>{to}</strong> via NHSMail secure relay.</div>
              <div style={{ fontSize:11, color:'#475569', marginTop:8 }}>End-to-end encrypted · NHS DSPT compliant · Audit logged</div>
            </div>
            <button onClick={onClose} style={{ marginTop:8, padding:'8px 24px', background:'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.4)', borderRadius:8, color:'#10B981', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              Close
            </button>
          </div>
        ) : (
          /* ── Compose form ── */
          <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>

            {/* From (read-only) */}
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', width:56, flexShrink:0 }}>From</span>
              <div style={{ flex:1, padding:'8px 12px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, fontSize:13, color:'#64748b' }}>
                {fromName} &lt;{fromEmail}&gt;
              </div>
            </div>

            {/* To */}
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', width:56, flexShrink:0 }}>To</span>
              <input
                type="email"
                placeholder="recipient@nhs.net or external email…"
                value={to}
                onChange={e => setTo(e.target.value)}
                style={{ flex:1, padding:'8px 12px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#e2e8f0', fontSize:13, outline:'none' }}
              />
            </div>

            {/* Subject */}
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'#475569', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', width:56, flexShrink:0 }}>Subject</span>
              <input
                type="text"
                placeholder="Subject…"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={{ flex:1, padding:'8px 12px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#e2e8f0', fontSize:13, outline:'none' }}
              />
            </div>

            {/* Body */}
            <textarea
              placeholder="Message body…"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={7}
              style={{ width:'100%', padding:'10px 12px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#e2e8f0', fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit' }}
            />

            {/* Security notice */}
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'rgba(56,189,248,0.05)', border:'1px solid rgba(56,189,248,0.15)', borderRadius:8 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span style={{ fontSize:11, color:'#38bdf8' }}>This message will be sent via NHSMail secure relay · End-to-end encrypted · DSPT compliant</span>
            </div>

            {/* Actions */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:4 }}>
              <button onClick={onClose} style={{ padding:'8px 16px', background:'transparent', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, color:'#64748b', fontSize:13, cursor:'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend || status === 'sending'}
                style={{ padding:'8px 20px', background: canSend ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.04)', border:`1px solid ${canSend ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius:8, color: canSend ? '#38bdf8' : '#475569', fontSize:13, fontWeight:600, cursor: canSend ? 'pointer' : 'default', display:'flex', alignItems:'center', gap:8 }}
              >
                {status === 'sending' ? (
                  <>
                    <div style={{ width:12, height:12, border:'2px solid rgba(56,189,248,0.2)', borderTopColor:'#38bdf8', borderRadius:'50%', animation:'wl-spin 0.8s linear infinite' }} />
                    Sending…
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Send Securely
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

interface AppShellProps { hideNav?: boolean; }

const AppShell: React.FC<AppShellProps> = ({ hideNav = false }) => {
  const navigate = useNavigate();

  const { user } = useAuth();
  const userInitials = user?.name ? (() => { const p = user.name.split(' ').filter(Boolean); return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : p[0]?.[0]?.toUpperCase() ?? '?'; })() : 'DR';
  const handleLogout = useLogout();
  const location = useLocation();
  const { crumbs, pushCrumb } = useBreadcrumb();
  const { requestNavigate } = useDirtyState();

  const guardedNavigate = React.useCallback((path: string) => {
    // Tell SearchPage to restore its previous results/filters when
    // navigating back to it — mirrors the exact same one-line pattern
    // SynopticReportPage.tsx's own guard() function already uses for its
    // internal "back to search" actions. Without this, only those
    // specific in-page actions set the flag; breadcrumb clicks, nav-bar
    // buttons, and the logo (which all route through this one shared
    // guardedNavigate) bypassed it entirely, silently dropping the
    // search session every time.
    if (path === '/search') sessionStorage.setItem('pathscribe:searchReturn', '1');
    requestNavigate(path, (p) => navigate(p));
  }, [navigate, requestNavigate]);
  const PAGE_LABELS: Record<string, string> = {
    '/':              'Home',
    '/worklist':      'Worklist',
    '/search':        'Case Search',
    '/audit':         'Audit Log',
    '/configuration': 'Configuration',
    '/contribution':  'Contributions',
    '/intraop-queue': 'Intraop Queue',
  };
  React.useEffect(() => {
    const label = PAGE_LABELS[location.pathname];
    if (label) pushCrumb(label, location.pathname);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const {
    messages, setMessages,
    unreadCount,
    hasUrgent,
    portalOpen, setPortalOpen,
  } = useMessaging();

// ─── Drawers & Modals ──────────────────────────────────────────────────────
  const [aboutOpen, setAboutOpen]             = useState(false);
  const [systemInfoOpen, setSystemInfoOpen]   = useState(false);
  const [newRecipients, setNewRecipients]     = useState<InternalUser[]>([]);
  const [newToInput,    setNewToInput]        = useState('');
  const [newSubject,    setNewSubject]        = useState('');
  const [newBody,       setNewBody]           = useState('');
  const [showUserSearch,   setShowUserSearch]   = useState(false);
  const [toDropdownOpen,   setToDropdownOpen]   = useState(false);
  const [toHighlightIdx,   setToHighlightIdx]   = useState(0);
  const [secureEmailToast, _setSecureEmailToast] = useState<string | null>(null);
  const [secureEmailOpen,  setSecureEmailOpen]  = useState(false);
  const toInputRef = useRef<HTMLInputElement>(null);

  // ─── Edit / selection ───────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // ─── Messaging ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [previousMsgId, setPreviousMsgId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchText, setSearchText] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [isUrgentNew, setIsUrgentNew] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'deleted'>('all');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const userId = user?.id ?? 'u1';
  const { log } = useAuditLog();

  // ─── Load inbox ─────────────────────────────────────────────────────────────
  const loadInbox = useCallback(async () => {
    setLoading(true);
    const result = await messageService.getInbox(userId);
    if (result.ok) {
      setMessages(result.data);
      setSelectedMsgId(null);
    }
    setLoading(false);
  }, [userId, setMessages]);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const displayMessages = messages
    .filter(m => filterType === 'deleted' ? m.isDeleted : !m.isDeleted)
    .filter(m =>
      m.senderName.toLowerCase().includes(searchText.toLowerCase()) ||
      m.body.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

  const currentMsg = messages.find(m => m.id === selectedMsgId);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleMarkRead = async (id: string) => {
    await messageService.markRead(id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isRead: true } : m));
  };


  const handleSoftDelete = async (id: string) => {
    await messageService.softDelete(id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isDeleted: true } : m));
    if (selectedMsgId === id) setSelectedMsgId(null);
  };

  const handleRestore = async (id: string) => {
    await messageService.restore(id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isDeleted: false } : m));
  };

  // Real fix: was window.confirm() in all 4 places below — replaced with
  // the shared ConfirmModal. Each needs its own pending-state variable
  // since ConfirmModal is async/UI-driven rather than a blocking call;
  // rendered as 4 separate ConfirmModal instances at the end of this
  // component, since each has a different message and trigger.
  const [pendingPermanentDeleteId, setPendingPermanentDeleteId] = useState<string | null>(null);

  const handlePermanentDelete = (id: string) => {
    setPendingPermanentDeleteId(id);
  };

  const confirmPermanentDelete = async () => {
    if (!pendingPermanentDeleteId) return;
    const id = pendingPermanentDeleteId;
    setPendingPermanentDeleteId(null);
    await messageService.permanentDelete(id);
    setMessages(prev => prev.filter(m => m.id !== id));
    if (selectedMsgId === id) setSelectedMsgId(null);
  };

  const [pendingEmptyDeletedCount, setPendingEmptyDeletedCount] = useState<number | null>(null);

  const handleEmptyDeleted = () => {
    setPendingEmptyDeletedCount(messages.filter(m => m.isDeleted).length);
  };

  const confirmEmptyDeleted = async () => {
    setPendingEmptyDeletedCount(null);
    await messageService.emptyDeleted(userId);
    setMessages(prev => prev.filter(m => !m.isDeleted));
    setSelectedMsgId(null);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !selectedMsgId) return;
    const result = await messageService.reply(selectedMsgId, userId, user?.name ?? 'Dr. Sarah Johnson', inputText);
    if (result.ok) {
      setMessages(prev => prev.map(m => m.id === selectedMsgId ? result.data : m));
      const msg = messages.find(m => m.id === selectedMsgId);
      if (msg) log('message_sent', { recipientId: msg.senderId ?? '', recipientName: msg.senderName ?? '', isUrgent: false });
    }
    setInputText('');
    setIsDirty(false);
  };

  const handleSendNew = async () => {
    if (!newBody.trim() || newRecipients.length === 0) return;
    for (const recipient of newRecipients) {
      const result = await messageService.send({
        senderId:      userId,
        senderName:    user?.name ?? 'Dr. Sarah Johnson',
        recipientId:   recipient.id,
        recipientName: recipient.name,
        subject:       newSubject,
        body:          newBody,
        timestamp:     new Date(),
        isUrgent:      isUrgentNew,
      });
      if (result.ok) {
        setMessages(prev => [result.data, ...prev]);
        log('message_sent', { recipientId: recipient.id, recipientName: recipient.name, isUrgent: isUrgentNew });
      }
    }
    setNewRecipients([]); setNewToInput(''); setNewSubject(''); setNewBody('');
    setIsUrgentNew(false); setIsDirty(false); setIsComposing(false);
  };

  const handleSecureEmail = () => {
    setSecureEmailOpen(true);
  };

  const [pendingBulkDeleteCount, setPendingBulkDeleteCount] = useState<number | null>(null);

  const handleBulkDelete = async () => {
    if (filterType === 'deleted') {
      setPendingBulkDeleteCount(selectedIds.length);
      return;
    }
    await Promise.all(selectedIds.map(id => messageService.softDelete(id)));
    setMessages(prev => prev.map(m => selectedIds.includes(m.id) ? { ...m, isDeleted: true } : m));
    setSelectedIds([]);
    setIsEditing(false);
  };

  const confirmBulkDelete = async () => {
    setPendingBulkDeleteCount(null);
    await Promise.all(selectedIds.map(id => messageService.permanentDelete(id)));
    setMessages(prev => prev.filter(m => !selectedIds.includes(m.id)));
    setSelectedIds([]);
    setIsEditing(false);
  };

  const handleBulkMarkRead = async () => {
    await Promise.all(selectedIds.map(id => messageService.markRead(id)));
    setMessages(prev => prev.map(m => selectedIds.includes(m.id) ? { ...m, isRead: true } : m));
    setSelectedIds([]);
  };

  const resetDrawerState = () => {
    setSelectedMsgId(null);
    setFilterType('all');
    setSearchText('');
    setIsEditing(false);
    setSelectedIds([]);
    setIsFilterMenuOpen(false);
    setHoveredMsgId(null);
    setInputText('');
    setIsDirty(false);
    setIsUrgentNew(false);
    setIsComposing(false);
    setNewRecipients([]); setNewToInput(''); setNewSubject(''); setNewBody('');
    setToDropdownOpen(false); setShowUserSearch(false);
  };

  const [pendingCloseDrawer, setPendingCloseDrawer] = useState(false);

  const handleCloseDrawer = () => {
    if (isDirty) {
      setPendingCloseDrawer(true);
      return;
    }
    setPortalOpen(false);
    sessionStorage.removeItem('ps_drawer_open');
    resetDrawerState();
  };

  const confirmCloseDrawer = () => {
    setPendingCloseDrawer(false);
    setPortalOpen(false);
    sessionStorage.removeItem('ps_drawer_open');
    resetDrawerState();
  };

  // ─── Voice command listeners ───────────────────────────────────────────────
  // Placed after all handlers and derived values so every closure is in scope.
  useEffect(() => {
    // ── Page navigation ──────────────────────────────────────────────────────
    const openHome               = () => guardedNavigate('/');
    const openMessages           = () => setPortalOpen(true);
    const openWorklist           = () => guardedNavigate('/worklist');
    const openIntraopQueue       = () => guardedNavigate('/intraop-queue');
    const openConfig             = () => guardedNavigate('/configuration');
    const openSearch             = () => guardedNavigate('/search');
    const openAudit              = () => guardedNavigate('/audit');
    const openContribution       = () => guardedNavigate('/contribution');
    const goBack                 = () => navigate(-1);
    const goForward              = () => navigate(1);
    const nextCase               = () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_NAV_NEXT_CASE'));
    const previousCase           = () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_NAV_PREVIOUS_CASE'));

    // ── Home page actions ────────────────────────────────────────────────────
    const openEnhancementRequest = () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_HOME_OPEN_ENHANCEMENT_REQUEST'));
    const openTestingFeedback    = () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_HOME_OPEN_TESTING_FEEDBACK'));
    const viewHelp               = () => window.open('/help/documentation.pdf', '_blank');
    const openResources          = () => window.dispatchEvent(new CustomEvent('PATHSCRIBE_PAGE_OPEN_RESOURCES'));
    const systemLogout           = () => handleLogout();

    // ── Messages: navigation ─────────────────────────────────────────────────
    const msgNext = () => {
      setSelectedMsgId(current => {
        const idx = displayMessages.findIndex(m => m.id === current);
        return displayMessages[idx + 1]?.id ?? current;
      });
    };
    const msgPrevious = () => {
      setSelectedMsgId(current => {
        const idx = displayMessages.findIndex(m => m.id === current);
        return idx > 0 ? displayMessages[idx - 1].id : current;
      });
    };

    // ── Messages: actions ────────────────────────────────────────────────────
    const msgReply = () => {
      if (selectedMsgId) {
        setPreviousMsgId(selectedMsgId);
        setSelectedMsgId(null);
        setIsComposing(true);
        setInputText('');
      }
    };
    const msgDelete = () => {
      if (!selectedMsgId) return;
      if (filterType === 'deleted') handlePermanentDelete(selectedMsgId);
      else handleSoftDelete(selectedMsgId);
    };
    const msgMarkRead    = () => { if (selectedMsgId) handleMarkRead(selectedMsgId); };
    const msgMarkReadAll  = () => handleBulkMarkRead();
    const msgMarkUnread   = () => {
      if (selectedMsgId) setMessages(prev => prev.map(m => m.id === selectedMsgId ? { ...m, isRead: false } : m));
    };
    const msgSecureEmail  = () => handleSecureEmail();
    const msgRecipientAdd = () => {
      // Confirms the highlighted inline To: suggestion — same as pressing Enter in the input
      toInputRef.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    };
    const msgCompose      = () => {
      setPreviousMsgId(selectedMsgId);
      setSelectedMsgId(null);
      setIsComposing(true);
      setInputText('');
    };
    const msgSend        = () => { if (isComposing) void handleSendNew(); else void handleSend(); };
    const msgClose       = () => handleCloseDrawer();
    const msgEdit        = () => { setIsEditing(e => !e); if (isEditing) setSelectedIds([]); };
    const msgSearch      = () => {
      const input = document.querySelector<HTMLInputElement>('.ps-msg-drawer input[placeholder="Search"]');
      input?.focus();
    };
    const msgViewDeleted  = () => setFilterType('deleted');
    const msgViewMessages = () => setFilterType('all');
    const msgRestore      = () => { if (selectedMsgId) void handleRestore(selectedMsgId); };
    const msgDeleteAll    = () => {
      if (filterType === 'deleted') void handleEmptyDeleted();
      else void handleBulkDelete();
    };

    // ── Messages compose: field helpers ──────────────────────────────────────
    const msgGotoSubject     = () => {
      document.querySelector<HTMLInputElement>('.ps-msg-drawer input[placeholder*="Subject"]')?.focus();
    };
    const msgGotoBody        = () => {
      document.querySelector<HTMLTextAreaElement>('.ps-msg-drawer textarea')?.focus();
    };
    const msgClearSubject    = () => setNewSubject('');
    const msgClearBody       = () => { setNewBody(''); setIsDirty(false); };
    const msgUrgent          = () => setIsUrgentNew(u => !u);
    const msgRecipientSearch = () => setShowUserSearch(true);

    window.addEventListener('PATHSCRIBE_OPEN_HOME',               openHome);
    window.addEventListener('PATHSCRIBE_OPEN_MESSAGES',           openMessages);
    window.addEventListener('PATHSCRIBE_OPEN_WORKLIST',           openWorklist);
    window.addEventListener('PATHSCRIBE_OPEN_INTRAOP_QUEUE',      openIntraopQueue);
    window.addEventListener('PATHSCRIBE_OPEN_CONFIGURATION',      openConfig);
    window.addEventListener('PATHSCRIBE_OPEN_SEARCH',             openSearch);
    window.addEventListener('PATHSCRIBE_OPEN_AUDIT',              openAudit);
    window.addEventListener('PATHSCRIBE_OPEN_CONTRIBUTION',       openContribution);
    window.addEventListener('PATHSCRIBE_GO_BACK',                 goBack);
    window.addEventListener('PATHSCRIBE_GO_FORWARD',              goForward);
    window.addEventListener('PATHSCRIBE_NEXT_CASE',               nextCase);
    window.addEventListener('PATHSCRIBE_PREVIOUS_CASE',           previousCase);
    window.addEventListener('PATHSCRIBE_OPEN_ENHANCEMENT_REQUEST',openEnhancementRequest);
    window.addEventListener('PATHSCRIBE_OPEN_TESTING_FEEDBACK',   openTestingFeedback);
    window.addEventListener('PATHSCRIBE_VIEW_HELP',               viewHelp);
    window.addEventListener('PATHSCRIBE_OPEN_RESOURCES',          openResources);
    window.addEventListener('PATHSCRIBE_SYSTEM_LOGOUT',           systemLogout);
    window.addEventListener('PATHSCRIBE_MSG_NEXT',                msgNext);
    window.addEventListener('PATHSCRIBE_MSG_PREVIOUS',            msgPrevious);
    window.addEventListener('PATHSCRIBE_MSG_REPLY',               msgReply);
    window.addEventListener('PATHSCRIBE_MSG_DELETE',              msgDelete);
    window.addEventListener('PATHSCRIBE_MSG_MARK_READ',           msgMarkRead);
    window.addEventListener('PATHSCRIBE_MSG_MARK_READ_ALL',       msgMarkReadAll);
    window.addEventListener('PATHSCRIBE_MSG_MARK_UNREAD',         msgMarkUnread);
    window.addEventListener('PATHSCRIBE_MSG_SECURE_EMAIL',        msgSecureEmail);
    window.addEventListener('PATHSCRIBE_MSG_RECIPIENT_ADD',       msgRecipientAdd);
    window.addEventListener('PATHSCRIBE_MSG_COMPOSE',             msgCompose);
    window.addEventListener('PATHSCRIBE_MSG_SEND',                msgSend);
    window.addEventListener('PATHSCRIBE_MSG_CLOSE',               msgClose);
    window.addEventListener('PATHSCRIBE_MSG_EDIT',                msgEdit);
    window.addEventListener('PATHSCRIBE_MSG_SEARCH',              msgSearch);
    window.addEventListener('PATHSCRIBE_MSG_VIEW_DELETED',        msgViewDeleted);
    window.addEventListener('PATHSCRIBE_MSG_VIEW_MESSAGES',       msgViewMessages);
    window.addEventListener('PATHSCRIBE_MSG_RESTORE',             msgRestore);
    window.addEventListener('PATHSCRIBE_MSG_DELETE_ALL',          msgDeleteAll);
    window.addEventListener('PATHSCRIBE_MSG_GOTO_SUBJECT',        msgGotoSubject);
    window.addEventListener('PATHSCRIBE_MSG_GOTO_BODY',           msgGotoBody);
    window.addEventListener('PATHSCRIBE_MSG_CLEAR_SUBJECT',       msgClearSubject);
    window.addEventListener('PATHSCRIBE_MSG_CLEAR_BODY',          msgClearBody);
    window.addEventListener('PATHSCRIBE_MSG_URGENT',              msgUrgent);
    window.addEventListener('PATHSCRIBE_MSG_RECIPIENT_SEARCH',    msgRecipientSearch);

    return () => {
      window.removeEventListener('PATHSCRIBE_OPEN_HOME',               openHome);
      window.removeEventListener('PATHSCRIBE_OPEN_MESSAGES',           openMessages);
      window.removeEventListener('PATHSCRIBE_OPEN_WORKLIST',           openWorklist);
      window.removeEventListener('PATHSCRIBE_OPEN_INTRAOP_QUEUE',      openIntraopQueue);
      window.removeEventListener('PATHSCRIBE_OPEN_CONFIGURATION',      openConfig);
      window.removeEventListener('PATHSCRIBE_OPEN_SEARCH',             openSearch);
      window.removeEventListener('PATHSCRIBE_OPEN_AUDIT',              openAudit);
      window.removeEventListener('PATHSCRIBE_OPEN_CONTRIBUTION',       openContribution);
      window.removeEventListener('PATHSCRIBE_GO_BACK',                 goBack);
      window.removeEventListener('PATHSCRIBE_GO_FORWARD',              goForward);
      window.removeEventListener('PATHSCRIBE_NEXT_CASE',               nextCase);
      window.removeEventListener('PATHSCRIBE_PREVIOUS_CASE',           previousCase);
      window.removeEventListener('PATHSCRIBE_OPEN_ENHANCEMENT_REQUEST',openEnhancementRequest);
      window.removeEventListener('PATHSCRIBE_OPEN_TESTING_FEEDBACK',   openTestingFeedback);
      window.removeEventListener('PATHSCRIBE_VIEW_HELP',               viewHelp);
      window.removeEventListener('PATHSCRIBE_OPEN_RESOURCES',          openResources);
      window.removeEventListener('PATHSCRIBE_SYSTEM_LOGOUT',           systemLogout);
      window.removeEventListener('PATHSCRIBE_MSG_NEXT',                msgNext);
      window.removeEventListener('PATHSCRIBE_MSG_PREVIOUS',            msgPrevious);
      window.removeEventListener('PATHSCRIBE_MSG_REPLY',               msgReply);
      window.removeEventListener('PATHSCRIBE_MSG_DELETE',              msgDelete);
      window.removeEventListener('PATHSCRIBE_MSG_MARK_READ',           msgMarkRead);
      window.removeEventListener('PATHSCRIBE_MSG_MARK_READ_ALL',       msgMarkReadAll);
      window.removeEventListener('PATHSCRIBE_MSG_MARK_UNREAD',         msgMarkUnread);
      window.removeEventListener('PATHSCRIBE_MSG_SECURE_EMAIL',        msgSecureEmail);
      window.removeEventListener('PATHSCRIBE_MSG_RECIPIENT_ADD',       msgRecipientAdd);
      window.removeEventListener('PATHSCRIBE_MSG_COMPOSE',             msgCompose);
      window.removeEventListener('PATHSCRIBE_MSG_SEND',                msgSend);
      window.removeEventListener('PATHSCRIBE_MSG_CLOSE',               msgClose);
      window.removeEventListener('PATHSCRIBE_MSG_EDIT',                msgEdit);
      window.removeEventListener('PATHSCRIBE_MSG_SEARCH',              msgSearch);
      window.removeEventListener('PATHSCRIBE_MSG_VIEW_DELETED',        msgViewDeleted);
      window.removeEventListener('PATHSCRIBE_MSG_VIEW_MESSAGES',       msgViewMessages);
      window.removeEventListener('PATHSCRIBE_MSG_RESTORE',             msgRestore);
      window.removeEventListener('PATHSCRIBE_MSG_DELETE_ALL',          msgDeleteAll);
      window.removeEventListener('PATHSCRIBE_MSG_GOTO_SUBJECT',        msgGotoSubject);
      window.removeEventListener('PATHSCRIBE_MSG_GOTO_BODY',           msgGotoBody);
      window.removeEventListener('PATHSCRIBE_MSG_CLEAR_SUBJECT',       msgClearSubject);
      window.removeEventListener('PATHSCRIBE_MSG_CLEAR_BODY',          msgClearBody);
      window.removeEventListener('PATHSCRIBE_MSG_URGENT',              msgUrgent);
      window.removeEventListener('PATHSCRIBE_MSG_RECIPIENT_SEARCH',    msgRecipientSearch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Real, honest justification: guardedNavigate and setMessages are genuinely called inside this effect's handlers. This effect's EXISTING deps (handleMarkRead, handleSoftDelete, handleRestore, handlePermanentDelete, handleEmptyDeleted, handleSend, handleSendNew, handleBulkDelete, handleBulkMarkRead, handleCloseDrawer) are themselves already unstable, unmemoized functions - a real, pre-existing condition confirmed directly, not something this fix introduces. Fully resolving this needs wrapping all 10 in useCallback, a significant, separate refactor deserving its own careful pass, not something to rush into this lint sweep.
  }, [
    navigate, setPortalOpen, displayMessages, selectedMsgId,
    filterType, isComposing, isEditing,
    handleMarkRead, handleSoftDelete, handlePermanentDelete, handleRestore,
    handleBulkMarkRead, handleBulkDelete, handleEmptyDeleted,
    handleSend, handleSendNew, handleCloseDrawer, handleLogout,
  ]);

 return (
    <div className="ps-app-root" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', color: '#f1f5f9', background: '#020617', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* ── NAVBAR ── */}
      {!hideNav && (
        <NavBar
          onLogoClick={() => guardedNavigate('/')}
          onLogout={handleLogout}
          onProfileClick={() => setAboutOpen(true)}
        />
      )}

      {/* Real fix, per direct follow-up: "the Current station...
          should be identified at login." Mounted unconditionally
          (not gated by hideNav) — a tech landing directly on a
          clinical route (NavBar hidden there) still needs this real,
          one-time prompt exactly the same as anyone landing on the
          main app shell. */}
      <ScanStationPrompt />
      {/* Real feature, per direct follow-up: "MVP Station-Switching
          via Barcode Label... interrupts standard barcode
          processing, and triggers a station switch event." Mounted
          unconditionally, same as ScanStationPrompt — a station
          barcode scan must work regardless of which page is active,
          NavBar hidden or not. */}
      <StationSwitchGuardModal />

      {/* Breadcrumb bar — dynamic */}
      {!hideNav && crumbs.length > 1 && (
        <div className="ps-crumb-bar">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            const isModal = crumb.path.includes('#');
            return (
              <React.Fragment key={crumb.path + i}>
                {i > 0 && <span className="ps-crumb-sep">{'›'}</span>}
                {isModal ? (
                  <span className="ps-crumb-modal">{crumb.label}</span>
                ) : isLast ? (
                  <span className="ps-crumb-current">{crumb.label}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => guardedNavigate(crumb.path)}
                    className="ps-crumb-link"
                  >
                    {crumb.label}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      {/* Outlet — flex:1 so it fills remaining height and full width exactly */}
      <div style={{ flex: 1, minHeight: 0, overflow: hideNav ? 'visible' : 'hidden', width: '100%', isolation: 'isolate' }}>
        <Outlet />
      </div>

      {/* ── MESSAGES DRAWER — rendered via portal to escape stacking contexts ── */}
      {portalOpen && ReactDOM.createPortal(
        <>
          <div className="ps-drawer-backdrop" onClick={handleCloseDrawer} />

          {/* ── Unified messaging surface ── */}
          <div className={`ps-msg-drawer${(selectedMsgId || isComposing) ? ' ps-msg-drawer--detail-active' : ''}`} onClick={e => e.stopPropagation()}>

            {/* ── Unified top bar ── */}
            <div className="ps-msg-topbar">

              {/* Left segment: title + controls */}
              <div className="ps-msg-topbar-left">
                <div className="ps-msg-title-row">
                  <h2 className="ps-msg-title">
                    {filterType === 'deleted' ? 'Recently Deleted' : 'Messages'}
                  </h2>
                  {unreadCount > 0 && filterType !== 'deleted' && (
                    <span className={`ps-unread-bubble${hasUrgent ? " ps-unread-urgent" : ""}`}>{unreadCount}</span>
                  )}
                </div>
                <div className="ps-msg-header-actions">
                  <button className="ps-msg-edit-btn" onClick={() => { setIsEditing(!isEditing); if (isEditing) setSelectedIds([]); }}>
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                  <div className="ps-msg-filter-wrap">
                    <button className="ps-msg-filter-btn" onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)} aria-label="Filter messages" title="Filter messages">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="21" y1="7" x2="3" y2="7" /><line x1="18" y1="12" x2="6" y2="12" /><line x1="15" y1="17" x2="9" y2="17" />
                      </svg>
                    </button>
                    {isFilterMenuOpen && (
                      <>
                        <div className="ps-msg-filter-backdrop" onClick={() => setIsFilterMenuOpen(false)} />
                        <div className="ps-msg-filter-menu">
                          {[{ id: 'all', label: 'Messages' }, { id: 'deleted', label: 'Recently Deleted' }].map((opt) => (
                            <div
                              key={opt.id}
                              className={`ps-msg-filter-item${filterType === opt.id ? ' ps-msg-filter-item--active' : ''}`}
                              onClick={() => { setFilterType(opt.id as any); setIsFilterMenuOpen(false); }}
                            >
                              <span>{opt.label}</span>
                              {filterType === opt.id && <span className="ps-msg-filter-check">✓</span>}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right segment: thread context, compose title, or close button */}
              <div className="ps-msg-topbar-right">
                <button
                  type="button"
                  className="ps-msg-mobile-back"
                  onClick={() => { setSelectedMsgId(null); setIsComposing(false); }}
                  aria-label="Back to message list"
                  title="Back to message list"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                {selectedMsgId && currentMsg ? (
                  <>
                    <div className="ps-msg-thread-header">
                      <div className="ps-msg-thread-name-row">
                        <span className="ps-msg-thread-name">{currentMsg.senderName}</span>
                        {currentMsg.isUrgent && (
                          <span className="ps-msg-urgent-badge">Urgent</span>
                        )}
                      </div>
                      <div className="ps-msg-thread-meta-row">
                        {currentMsg.subject && (
                          <span className="ps-msg-thread-subject">{currentMsg.subject}</span>
                        )}
                        {currentMsg.caseNumber && (
                          <button className="ps-msg-case-link" onClick={() => {
                            setPortalOpen(false);
                            sessionStorage.setItem('ps_reopen_messages', '1');
                            // Real fix, per direct follow-up: "I assume
                            // we will launch the Internal Notes Drawer
                            // when the case gets selected from the
                            // worklist or the message." Also finally,
                            // genuinely sets fromMessages - previously
                            // FullReportPage.tsx read this flag but
                            // nothing ever actually set it (confirmed
                            // directly), so its own "Back" handling for
                            // messages was real code with no real path
                            // reaching it. Now it does.
                            navigate(`/report/${currentMsg.caseNumber}`, { state: { fromMessages: true, openInternalNotes: true } });
                          }}>
                            Case {currentMsg.caseNumber}
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                          </button>
                        )}
                        {(currentMsg as any).configLink && (
                          <button
                            className="ps-msg-config-link"
                            title="Open configuration page"
                            onClick={() => {
                              const link = (currentMsg as any).configLink as string;
                              setPortalOpen(false);
                              navigate(link);
                              // If the link targets a system section, fire the nav event after a tick
                              const params = new URLSearchParams(link.split('?')[1] ?? '');
                              const section = params.get('section');
                              if (section) {
                                setTimeout(() => {
                                  window.dispatchEvent(new CustomEvent('PATHSCRIBE_SYSTEM_NAVIGATE', { detail: { section } }));
                                }, 150);
                              }
                            }}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            Open Configuration
                          </button>
                        )}
                      </div>
                    </div>
                    <button className="ps-msg-close-btn ps-msg-close-btn--thread" onClick={handleCloseDrawer} aria-label="Close" title="Close">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </>
                ) : isComposing ? (
                  <>
                    <span className="ps-msg-compose-title">New Message</span>
                    <button className="ps-msg-close-btn" onClick={handleCloseDrawer} aria-label="Close" title="Close">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </>
                ) : (
                  <button className="ps-msg-close-btn ps-msg-close-btn--empty" onClick={handleCloseDrawer} aria-label="Close" title="Close">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
            </div>

            {/* ── Body ── */}
            <div className="ps-msg-body">

              {/* LEFT SIDEBAR */}
              <MessageListPanel
                messages={displayMessages}
                selectedMsgId={selectedMsgId}
                hoveredMsgId={hoveredMsgId}
                isEditing={isEditing}
                selectedIds={selectedIds}
                filterType={filterType}
                loading={loading}
                isComposing={isComposing}
                searchText={searchText}
                onHover={setHoveredMsgId}
                onSelect={(id) => { setSelectedMsgId(id); handleMarkRead(id); }}
                onToggleCheck={(id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                onSoftDelete={handleSoftDelete}
                onRestore={handleRestore}
                onPermanentDelete={handlePermanentDelete}
                onSearchChange={setSearchText}
                onBulkMarkRead={handleBulkMarkRead}
                onBulkDelete={handleBulkDelete}
                onEmptyDeleted={handleEmptyDeleted}
                onCompose={() => { setPreviousMsgId(selectedMsgId); setSelectedMsgId(null); setIsComposing(true); setInputText(''); }}
                onSecureEmail={handleSecureEmail}
              />

              {/* RIGHT CONTENT */}
              <div className="ps-msg-content">
                {isComposing ? (
                  <ComposePanel
                    recipients={newRecipients}
                    toInput={newToInput}
                    subject={newSubject}
                    body={newBody}
                    isUrgent={isUrgentNew}
                    showUserSearch={showUserSearch}
                    toDropdownOpen={toDropdownOpen}
                    toHighlightIdx={toHighlightIdx}
                    toInputRef={toInputRef}
                    onRecipientsChange={setNewRecipients}
                    onToInputChange={setNewToInput}
                    onSubjectChange={setNewSubject}
                    onBodyChange={(v) => { setNewBody(v); setIsDirty(v.length > 0); }}
                    onUrgentToggle={() => setIsUrgentNew(p => !p)}
                    onToDropdownOpenChange={setToDropdownOpen}
                    onToHighlightIdxChange={setToHighlightIdx}
                    onShowUserSearch={setShowUserSearch}
                    onCancel={() => { setIsComposing(false); setSelectedMsgId(previousMsgId); }}
                    onSend={handleSendNew}
                    onSecureEmail={handleSecureEmail}
                  />
                ) : selectedMsgId && currentMsg ? (
                  <ThreadPanel
                    message={currentMsg}
                    userId={userId}
                    inputText={inputText}
                    onInputChange={(v) => { setInputText(v); setIsDirty(v.length > 0); }}
                    onSend={handleSend}
                    onSoftDelete={() => handleSoftDelete(selectedMsgId)}
                    onMarkUnread={() => setMessages(prev => prev.map(m => m.id === selectedMsgId ? { ...m, isRead: false } : m))}
                    onCreateTemplate={(msgId) => {
                      setPortalOpen(false);
                      navigate(`/template-editor/new?from=request&requestId=${msgId}`);
                    }}
                  />
                ) : (
                  <div className="ps-msg-empty-state">
                    <svg className="ps-msg-empty-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <p className="ps-msg-empty-text">Select a message to read</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </>,
        document.body
      )}
{/* Secure email toast — kept for voice trigger fallback */}
      {secureEmailToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0f1d2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#d0daea', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 10000, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#38bdf8', fontSize: 16 }}>🔒</span>
          {secureEmailToast}
        </div>
      )}

      {/* Secure Email Modal */}
      <SecureEmailModal
        onSent={(to, subject) => log('secure_email_sent', { recipientEmail: to, subject })}
        isOpen={secureEmailOpen}
        fromName={user?.name ?? 'Dr. Paul Carter'}
        fromEmail={user?.id === 'PATH-UK-001' ? 'paul.carter@mft.nhs.uk' : 'pathscribe@hospital.org'}
        prefillSubject={newSubject}
        prefillBody={newBody}
        onClose={() => setSecureEmailOpen(false)}
      />
      {/* User search modal for compose To: field */}
      {showUserSearch && (
        <div className="ps-user-search-overlay">
          <UserSearchOverlay
            alreadyAdded={newRecipients.map(r => r.id)}
            onSelect={(u) => { setNewRecipients(prev => [...prev, u]); setShowUserSearch(false); toInputRef.current?.focus(); }}
            onClose={() => setShowUserSearch(false)}
          />
        </div>
      )}



      {/* MODALS */}
      {systemInfoOpen && <SystemInfoModal onClose={() => setSystemInfoOpen(false)} />}

      {aboutOpen && (
        <div className="ps-overlay" onClick={() => setAboutOpen(false)}>
          <div className="ps-modal-dark" style={{ width: 340, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '64px', height: '64px', borderRadius: '14px', border: '2px solid #0891B2', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', fontSize: '24px', fontWeight: 800 }}>{userInitials}</div>
            <h2 style={{ margin: '0 0 4px', color: '#f1f5f9', fontSize: 18 }}>{user?.name || 'Dr. Sarah Johnson'}</h2>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>{user?.role ?? 'Pathologist'}</div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)', margin: '0 -24px', padding: '4px 0' }}>
              {/* User Guide */}
              <button
                onClick={() => { setAboutOpen(false); openUserGuide(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 24px', color: '#38bdf8', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                User Guide
              </button>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 24px' }} />
              {/* Admin Guide — all users in demo */}
              <button
                onClick={() => { setAboutOpen(false); openAdminGuide(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 24px', color: '#c084fc', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                Admin Guide
              </button>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 24px' }} />
              <button
                onClick={() => { setAboutOpen(false); setSystemInfoOpen(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 24px', color: '#38bdf8', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                </svg>
                System Information
              </button>
            </div>

            <button
              onClick={() => setAboutOpen(false)}
              className="ps-btn-ghost-teal"
              style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        show={!!pendingPermanentDeleteId}
        title="Permanently Delete Message"
        message="Permanently delete this message? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmPermanentDelete}
        onCancel={() => setPendingPermanentDeleteId(null)}
      />
      <ConfirmModal
        show={pendingEmptyDeletedCount !== null}
        title="Empty Deleted Messages"
        message={`Permanently delete all ${pendingEmptyDeletedCount ?? 0} messages? This cannot be undone.`}
        confirmLabel="Delete All"
        onConfirm={confirmEmptyDeleted}
        onCancel={() => setPendingEmptyDeletedCount(null)}
      />
      <ConfirmModal
        show={pendingBulkDeleteCount !== null}
        title="Permanently Delete Messages"
        message={`Permanently delete ${pendingBulkDeleteCount ?? 0} message(s)? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmBulkDelete}
        onCancel={() => setPendingBulkDeleteCount(null)}
      />
      <ConfirmModal
        show={pendingCloseDrawer}
        title="Unsent Message"
        message="You have an unsent message. Are you sure you want to close?"
        confirmLabel="Close"
        onConfirm={confirmCloseDrawer}
        onCancel={() => setPendingCloseDrawer(false)}
      />
    </div>
  );
};

export default AppShell;
