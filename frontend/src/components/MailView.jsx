import React, { useState, useRef, useEffect } from 'react';
import { MailIcon, StarIcon, TrashIcon, ReplyIcon, ClockIcon, CheckSquareIcon, SearchIcon, GmailIcon, OutlookIcon, YahooIcon, CustomIcon, ChevronDownIcon } from './Icons';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3030`;

// Extract a plain-text snippet from HTML for the email list preview.
// Strips all HTML tags and collapses whitespace.
function getPlainTextSnippet(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Email HTML from Gmail is a full document: it can carry its own <style>
// blocks and <body style="margin: ...">. Injected as-is, those rules leak out
// of the .email-html-content container and restyle the whole app (page shift,
// white lines at the edges). Strip document-level tags so only inline element
// styling remains. Also removes <script>/<iframe>/<link>/<meta> as a bonus.
function sanitizeEmailHtml(html) {
  if (!html) return '';
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?(html|body|base|link|meta|iframe|object|embed)[^>]*>/gi, '');
}

// Split the raw Gmail `To` header into individual recipients.
// The header is a comma-separated list, but commas may also appear inside
// quoted display names ("Doe, John" <j@x.com>) or angle-bracket addresses,
// so only split on commas outside of quotes/angle brackets.
function parseRecipients(to) {
  if (!to) return [];
  const parts = [];
  let current = '';
  let inQuotes = false;
  let inAngle = false;
  for (const ch of String(to)) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === '<') inAngle = true;
    if (ch === '>') inAngle = false;
    if (ch === ',' && !inQuotes && !inAngle) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// Skeleton loader component for email cards
function EmailCardSkeleton() {
  return (
    <div style={styles.skeletonCard}>
      <div style={styles.skeletonHeader}>
        <div style={{...styles.skeletonLine, width: '40%', height: '14px'}} />
        <div style={{...styles.skeletonLine, width: '60px', height: '11px'}} />
      </div>
      <div style={{...styles.skeletonLine, width: '70%', height: '13px', marginBottom: '6px'}} />
      <div style={{...styles.skeletonLine, width: '90%', height: '12px', marginBottom: '4px'}} />
      <div style={{...styles.skeletonLine, width: '60%', height: '12px'}} />
    </div>
  );
}

export default function MailView({
  emails,
  connectedAccounts,
  onUpdateEmails,
  onConvertEmailToTask,
  onBlockCalendarForEmail,
  activeAccountFilter,
  setActiveAccountFilter,
  onTriggerNotification,
  onOpenCompose,
  searchQuery = '',
  onSearchChange,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  isLoading = false,
  onMailMarkedAsRead, // New prop to update the overall unread count in App.jsx

}) {
  const [selectedFolder, setSelectedFolder] = useState('inbox'); // inbox, starred, sent, trash
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('synchro_isSidebarCollapsed');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('synchro_isSidebarCollapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);

  // Static list pane width
  const [listPaneWidth, setListPaneWidth] = useState(() => {
    const savedWidth = localStorage.getItem('synchro_mailListWidth');
    return savedWidth ? parseInt(savedWidth, 10) : 480;
  });
  const [isDragging, setIsDragging] = useState(false);
  const splitterRef = useRef(null);

  // Handle splitter drag
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const sidebar = document.querySelector('[data-mail-sidebar]');
      if (!sidebar) return;

      const sidebarRect = sidebar.getBoundingClientRect();
      const minWidth = 320;
      const maxWidth = 600;

      let newWidth = e.clientX - sidebarRect.right;
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      setListPaneWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        localStorage.setItem('synchro_mailListWidth', listPaneWidth.toString());
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, listPaneWidth]);

  // Selected email for the detail pane; null shows the "no email selected" state
  const selectedEmail = selectedEmailId ? emails.find(e => e.id === selectedEmailId) || null : null;

  // Recipients ("To") dropdown in the sender header: collapsed by default so a
  // long recipient list can never stretch/break the header row. It drops down
  // as an absolutely positioned overlay, so nothing else in the layout shifts.
  const [showRecipients, setShowRecipients] = useState(false);
  const metaRowRef = useRef(null);

  // Close the recipients dropdown when clicking anywhere outside the header row
  useEffect(() => {
    if (!showRecipients) return;
    const handleMouseDown = (e) => {
      if (metaRowRef.current && !metaRowRef.current.contains(e.target)) {
        setShowRecipients(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showRecipients]);

  // Start collapsed again whenever a different email is opened
  useEffect(() => {
    setShowRecipients(false);
  }, [selectedEmailId]);

  // Recipient data derived from the raw `To` header string
  const parsedRecipients = selectedEmail ? parseRecipients(selectedEmail.to) : [];
  const recipients = parsedRecipients.length > 0 ? parsedRecipients : ['me'];
  const recipientCount = recipients.length;
  // Chip preview: a single address when there is only one recipient, otherwise
  // just the count — the full list only appears in the dropdown.
  const recipientChipText = recipientCount > 1 ? `To: ${recipientCount} recipients` : `To: ${recipients[0]}`;

  const getProviderIcon = (provider) => {
    switch (provider) {
      case 'gmail': return GmailIcon;
      case 'outlook': return OutlookIcon;
      case 'yahoo': return YahooIcon;
      default: return CustomIcon;
    }
  };

  const handleToggleStar = (emailId, e) => {
    e.stopPropagation();
    const updated = emails.map(m => m.id === emailId ? { ...m, isStarred: !m.isStarred } : m);
    onUpdateEmails(updated);
  };

  // Sync read state to Gmail: remove the UNREAD label server-side so the
  // message shows as read in Gmail too. Fire-and-forget; local state is
  // updated immediately so the UI stays responsive. Only Gmail-fetched
  // messages (ids prefixed `gmail_`) are synced; local/composed ones aren't.
  const syncReadToGmail = (mail) => {
    if (!mail.id?.startsWith('gmail_')) return;
    const token = localStorage.getItem('synchro_token');
    if (!token) return;
    fetch(`${API_URL}/auth/emails/${encodeURIComponent(mail.id)}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to sync read state to Gmail:', err));
  };

  const handleDeleteEmail = (emailId, e) => {
    e.stopPropagation();
    const updated = emails.map(m => {
      if (m.id === emailId) {
        if (m.folder === 'trash') {
          return null; // permanently delete
        } else {
          return { ...m, folder: 'trash' }; // move to trash
        }
      }
      return m;
    }).filter(Boolean);
    onUpdateEmails(updated);
    onTriggerNotification('Email moved to trash');
  };

  const handleReplySubmit = (e) => {
    e.preventDefault();
    if (!replyBody.trim() || !selectedEmail) return;

    // Simulate appending a reply to thread
    const updatedThread = [...(selectedEmail.replies || []), {
      id: Date.now(),
      sender: 'You',
      body: replyBody,
      time: 'Just now'
    }];

    const updated = emails.map(m => m.id === selectedEmail.id ? { ...m, replies: updatedThread } : m);
    onUpdateEmails(updated);
    setReplyBody('');
    setShowReplyForm(false);
    onTriggerNotification('Reply sent successfully!');
  };

  // Filter Emails
  const filteredEmails = emails.filter((mail) => {
    // Folder filter
    if (selectedFolder === 'starred') {
      if (!mail.isStarred || mail.folder === 'trash') return false;
    } else if (mail.folder !== selectedFolder) {
      return false;
    }

    // Account filter
    if (activeAccountFilter !== 'all') {
      // Find account
      const account = connectedAccounts.find(acc => acc.email === mail.account);
      if (!account || account.id !== activeAccountFilter) return false;
    }

    // Note: search is done server-side (Gmail's subject: search via the API's
    // `q` parameter), so no client-side query filter here.

    return true;
  });

  const getUnreadCount = (folder) => {
    if (folder === 'inbox') {
      // For the main inbox, we now rely on the totalUnread count from the backend
      // as it's more accurate across all pages. Other folders still use local calculation.
      return emails.filter(m => m.folder === folder && !m.isRead &&
        (activeAccountFilter === 'all' || (connectedAccounts.find(acc => acc.email === m.account)?.id === activeAccountFilter))
      ).length;
    }
    return emails.filter(m => {
      if (m.folder !== folder) return false;
      if (m.isRead) return false;
      if (activeAccountFilter !== 'all') {
        const account = connectedAccounts.find(acc => acc.email === m.account);
        if (!account || account.id !== activeAccountFilter) return false;
      }
      return true;
    }).length;
  };

  const unreadInboxCount = emails.filter(e => e.folder === 'inbox' && !e.isRead).length;


  return (
    <div style={styles.container} className="animate-fade-in" data-mail-container>
      {/* 1st Pane: Sidebar navigation */}
      <div style={{...styles.sidebar, width: isSidebarCollapsed ? '70px' : '280px', minWidth: isSidebarCollapsed ? '70px' : '200px'}} data-mail-sidebar>
        {/* Toggle Sidebar Button (Burger Icon) */}
        <button
          style={{
            padding: '10px',
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
            marginBottom: '8px',
          }}
          onClick={() => {
            const newState = !isSidebarCollapsed;
            setIsSidebarCollapsed(newState);
            localStorage.setItem('synchro_isSidebarCollapsed', newState.toString());
          }}
        >
          ☰
        </button>

        <button
          style={{
            ...styles.composeBtn,
            padding: isSidebarCollapsed ? '12px' : '12px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isSidebarCollapsed ? '0' : '8px',
          }}
          onClick={() => onOpenCompose()}
        >
          <MailIcon size={16} />
          {!isSidebarCollapsed && 'New Mail'}
        </button>

        <div style={styles.navSection}>
          <div style={styles.navHeader}>{isSidebarCollapsed ? '' : 'FOLDERS'}</div>
          <button
            className={`nav-item ${selectedFolder === 'inbox' ? 'nav-item-active' : ''}`}
            style={{ ...styles.navItem, justifyContent: 'flex-start' }}
            onClick={() => setSelectedFolder('inbox')}
            title="Inbox"
          >
            <MailIcon size={16} />
            {!isSidebarCollapsed && <span style={styles.navLabel}>Inbox</span>}
            {!isSidebarCollapsed && getUnreadCount('inbox') > 0 && (
              <span className="badge badge-primary" style={{ marginLeft: 'auto' }}>{getUnreadCount('inbox')}</span>
            )}
          </button>
          <button
            className={`nav-item ${selectedFolder === 'starred' ? 'nav-item-active' : ''}`}
            style={{ ...styles.navItem, justifyContent: 'flex-start' }}
            onClick={() => setSelectedFolder('starred')}
            title="Starred"
          >
            <StarIcon size={16} />
            {!isSidebarCollapsed && <span style={styles.navLabel}>Starred</span>}
          </button>
          <button
            className={`nav-item ${selectedFolder === 'sent' ? 'nav-item-active' : ''}`}
            style={{ ...styles.navItem, justifyContent: 'flex-start' }}
            onClick={() => setSelectedFolder('sent')}
            title="Sent"
          >
            <ClockIcon size={16} />
            {!isSidebarCollapsed && <span style={styles.navLabel}>Sent</span>}
          </button>
          <button
            className={`nav-item ${selectedFolder === 'trash' ? 'nav-item-active' : ''}`}
            style={{ ...styles.navItem, justifyContent: 'flex-start' }}
            onClick={() => setSelectedFolder('trash')}
            title="Trash"
          >
            <TrashIcon size={16} />
            {!isSidebarCollapsed && <span style={styles.navLabel}>Trash</span>}
          </button>
        </div>

        <div style={styles.navSection}>
          <div style={styles.navHeader}>{isSidebarCollapsed ? '' : 'CONNECTED INBOXES'}</div>
          <button
            className={`nav-item ${activeAccountFilter === 'all' ? 'nav-item-active' : ''}`}
            style={{ ...styles.navItem, justifyContent: 'flex-start' }}
            onClick={() => setActiveAccountFilter('all')}
            title="All Inboxes"
          >
            <MailIcon size={16} />
            {!isSidebarCollapsed && <span style={styles.navLabel}>All Inboxes</span>}
          </button>

          {connectedAccounts.map((acc) => {
            const Icon = getProviderIcon(acc.provider);
            return (
              <button
                key={acc.id}
                className={`nav-item ${activeAccountFilter === acc.id ? 'nav-item-active' : ''}`}
                style={{ ...styles.navItem, justifyContent: 'flex-start' }}
                onClick={() => setActiveAccountFilter(acc.id)}
                title={acc.email}
              >
                <Icon size={16} />
                {!isSidebarCollapsed && (
                  <span style={{ ...styles.navLabel, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {acc.email}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2nd Pane: Email list */}
      <div style={{...styles.listPane, width: `${listPaneWidth}px`}}>
        <div style={styles.searchBarContainer}>
          <SearchIcon size={16} style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search email subject..."
            value={searchQuery}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <div style={styles.listContainer}>
          {isLoading ? (
            // Show skeleton loaders while fetching
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <EmailCardSkeleton key={`skeleton-${i}`} />
              ))}
            </>
          ) : filteredEmails.length === 0 ? (
            <div style={styles.emptyState}>No emails found.</div>
          ) : (
            filteredEmails.map((mail) => {
              const accountObj = connectedAccounts.find(acc => acc.email === mail.account);
              const provider = accountObj ? accountObj.provider : 'custom';

              return (
                <div
                  key={mail.id}
                  className="email-card"
                  style={{
                    ...styles.emailCard,
                    ...(selectedEmailId === mail.id ? styles.emailCardActive : {}),
                    ...(mail.isRead ? styles.emailCardRead : styles.emailCardUnread)
                  }}
                  onClick={() => {
                    setSelectedEmailId(mail.id);
                    // Mark as read locally + sync to Gmail
                    if (!mail.isRead) {
                      const updated = emails.map(m => m.id === mail.id ? { ...m, isRead: true } : m);
                      onUpdateEmails(updated);
                      syncReadToGmail(mail);
                      onMailMarkedAsRead(); // Notify App.jsx to update global unread count

                    }
                  }}
                >
                  <div style={styles.emailCardRow1}>
                    <span style={styles.emailSender}>{mail.senderName || mail.sender}</span>
                    <span style={styles.emailSubject}>{mail.subject}</span>
                    <span style={styles.emailTime}>{mail.date}</span>
                  </div>
                  <div style={styles.emailCardRow2}>
                    <div style={styles.emailPreview}>{getPlainTextSnippet(mail.snippet || mail.body)}</div>
                    <div style={styles.cardActions}>
                      <button
                        className="email-card-action-btn"
                        style={{ ...styles.cardActionBtn, color: mail.isStarred ? '#fbbf24' : 'var(--text-muted)' }}
                        onClick={(e) => handleToggleStar(mail.id, e)}
                      >
                        <StarIcon size={14} />
                      </button>
                      <button
                        className="email-card-action-btn"
                        style={styles.cardActionBtn}
                        onClick={(e) => handleDeleteEmail(mail.id, e)}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls - Bottom of email list */}
        <div style={styles.paginationContainerBottom}>
          <button
            style={styles.paginationButton}
            onClick={() => {
              if (currentPage > 1) {
                onPageChange(currentPage - 1);
              }
            }}
            disabled={currentPage <= 1}
          >
            ◀
          </button>
          <div style={styles.paginationInfo}>
            Page {currentPage} of {totalPages}
          </div>
          <button
            style={styles.paginationButton}
            onClick={() => {
              if (currentPage < totalPages) {
                onPageChange(currentPage + 1);
              }
            }}
            disabled={currentPage >= totalPages}
          >
            ▶
          </button>
        </div>
      </div>

      {/* Resizable Splitter */}
      <div
        ref={splitterRef}
        style={styles.splitter}
        onMouseDown={() => setIsDragging(true)}
      />

      {/* 3rd Pane: Email reader detail */}
      <div style={styles.detailPane}>
        {selectedEmail ? (
          <div style={styles.detailContainer}>
            <div style={styles.detailHeader}>
              <div style={styles.detailTitleArea}>
                <h2 style={styles.detailSubject}>{selectedEmail.subject}</h2>
                <div style={styles.detailAccountRow}>
                  <span style={styles.detailAccountTag}>
                    Account: <strong style={{color: 'var(--primary)'}}>{selectedEmail.account}</strong>
                  </span>
                </div>
              </div>

              {/* Integrations Toolbar - Removed */}
            </div>

            <div style={styles.divider} />

            {/* Email Meta — the "To" list stays hidden behind a small chip so
                multiple recipients can never stretch/break this row. Clicking
                the chip drops the full list down as an overlay (position:
                absolute), leaving every other element untouched. */}
            <div ref={metaRowRef} style={styles.emailMetaRow} className="glass-panel">
              <div style={styles.senderAvatar}>
                {(selectedEmail.senderName || selectedEmail.sender || '?')[0].toUpperCase()}
              </div>
              <div style={styles.metaText}>
                <div style={styles.metaSenderName}>{selectedEmail.senderName || selectedEmail.sender}</div>
                <div style={styles.metaSubRow}>
                  <span style={styles.metaSenderEmail}>From: {selectedEmail.sender}</span>
                  <button
                    type="button"
                    className="recipients-toggle"
                    style={styles.recipientsToggle}
                    onClick={() => setShowRecipients((v) => !v)}
                    aria-expanded={showRecipients}
                    aria-label="Show all recipients"
                  >
                    <span style={styles.recipientsToggleLabel}>{recipientChipText}</span>
                    <ChevronDownIcon
                      size={12}
                      style={{
                        flexShrink: 0,
                        transform: showRecipients ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </button>
                </div>
              </div>
              <div style={styles.metaTime}>{selectedEmail.date}</div>

              {showRecipients && (
                <div
                  style={styles.recipientsDropdown}
                  className="glass-panel"
                  role="group"
                  aria-label="All recipients"
                >
                  <div style={styles.recipientsDropdownTitle}>To ({recipientCount})</div>
                  {recipients.map((r, i) => (
                    <div key={i} style={styles.recipientItem}>{r}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Email Body */}
            <div
              className="email-html-content"
              style={styles.detailBody}
              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(selectedEmail.body) }}
            />

            {/* Attachments */}
            {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
              <div style={styles.attachmentsSection}>
                <div style={styles.attachmentsTitle}>Attachments ({selectedEmail.attachments.length})</div>
                <div style={styles.attachmentsGrid}>
                  {selectedEmail.attachments.map((att, i) => (
                    <div key={i} style={styles.attachmentCard} className="glass-panel">
                      <span style={styles.attachmentName}>{att.name}</span>
                      <span style={styles.attachmentSize}>{att.size}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thread Replies */}
            {selectedEmail.replies && selectedEmail.replies.length > 0 && (
              <div style={styles.repliesSection}>
                <div style={styles.repliesTitle}>Replies Thread</div>
                {selectedEmail.replies.map((rep) => (
                  <div key={rep.id} style={styles.replyCard}>
                    <div style={styles.replyCardHeader}>
                      <span style={styles.replySender}>{rep.sender}</span>
                      <span style={styles.replyTime}>{rep.time}</span>
                    </div>
                    <div style={styles.replyBody}>{rep.body}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Reply Button/Form */}
            {!showReplyForm ? (
              <button
                style={styles.replyButton}
                onClick={() => setShowReplyForm(true)}
              >
                <ReplyIcon size={14} style={{ marginRight: '6px' }} />
                Reply
              </button>
            ) : (
              <form onSubmit={handleReplySubmit} style={styles.replyForm}>
                <textarea
                  placeholder={`Reply to ${selectedEmail.senderName || selectedEmail.sender}...`}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  style={styles.replyTextarea}
                  required
                  autoFocus
                />
                <div style={styles.replyFormActions}>
                  <button type="submit" style={styles.replySendBtn}>
                    <ReplyIcon size={14} style={{ marginRight: '6px' }} />
                    Send Reply
                  </button>
                  <button
                    type="button"
                    style={styles.replyCancelBtn}
                    onClick={() => {
                      setShowReplyForm(false);
                      setReplyBody('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div style={styles.noEmailSelected}>
            <MailIcon size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
            <h3 style={styles.noEmailTitle}>No Email Selected</h3>
            <p style={styles.noEmailText}>Select an email from the inbox list to read its content.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    height: '100%',
    width: '100%',
    backgroundColor: 'var(--bg-secondary)',
  },
  sidebar: {
    minWidth: '200px',
    maxWidth: '280px',
    width: 'auto',
    borderRight: '1px solid var(--border-color)',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    backgroundColor: 'var(--bg-primary)',
    boxSizing: 'border-box',
    overflow: 'hidden',
    transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  composeBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
    fontSize: '13.5px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(2, 151, 222, 0.3)',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'var(--accent-hover)',
    }
  },
  navSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  navHeader: {
    fontSize: '10.5px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    letterSpacing: '1px',
    paddingLeft: '8px',
    marginBottom: '8px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    textAlign: 'left',
    transition: 'all 0.2s',
    overflow: 'hidden',
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.04)',
      color: 'var(--text-primary)',
    }
  },
  navItemActive: {
    backgroundColor: 'var(--primary-glow)',
    color: '#0297de',
    fontWeight: '600',
  },
  navLabel: {
    marginLeft: '8px',
    whiteSpace: 'nowrap',
    animation: 'fadeInSlide 0.3s ease-out forwards',
  },
  listPane: {
    width: '480px',
    flexShrink: 0,
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-secondary)',
  },
  searchBarContainer: {
    padding: '16px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: '28px',
    color: 'var(--text-muted)',
  },
  searchInput: {
    width: '100%',
    padding: '8px 12px 8px 36px',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    fontSize: '13px',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  listContainer: {
    flexGrow: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '13.5px',
  },
  emailCard: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-color)',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    transition: 'background-color 0.2s, border-color 0.2s',
    ':hover': {
      backgroundColor: 'rgba(2, 151, 222, 0.1)',
    }
  },
  emailCardActive: {
    backgroundColor: 'var(--primary-deep)',
  },
  emailCardUnread: {
    backgroundColor: 'rgba(2, 151, 222, 0.15)',
    borderLeftColor: 'var(--mail-unread-border)',
  },
  emailCardRead: {
    borderLeftColor: 'var(--mail-read-border)',
  },
  emailCardRow1: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  emailSender: {
    fontSize: '13.5px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    minWidth: '120px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  emailSubject: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexGrow: 1,
  },
  emailTime: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    minWidth: '50px',
    textAlign: 'right',
  },
  emailCardRow2: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  emailPreview: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flexGrow: 1,
  },

  emailCardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '6px',
  },
  emailAccountBadge: {
    fontSize: '10.5px',
    fontWeight: '500',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  cardActionBtn: {
    padding: '4px',
    borderRadius: '4px',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s, background-color 0.2s',
    ':hover': {
      color: 'var(--text-primary)',
      backgroundColor: 'rgba(255,255,255,0.04)',
    }
  },
  detailPane: {
    flexGrow: 1,
    backgroundColor: 'var(--bg-secondary)',
    overflowY: 'auto',
  },
  detailContainer: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailTitleArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  detailSubject: {
    fontFamily: 'var(--font-display)',
    fontSize: '22px',
    fontWeight: '700',
    margin: 0,
  },
  detailAccountRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  detailAccountTag: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  divider: {
    height: '1px',
    background: 'var(--border-color)',
    width: '100%',
  },
  emailMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '2px 20px',
    // Anchors the recipients dropdown so it can drop down as an overlay
    position: 'relative',
    minWidth: 0,
  },
  senderAvatar: {
    width: '38px',
    height: '38px',
    flexShrink: 0,
    borderRadius: '50%',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: '600',
  },
  metaText: {
    flexGrow: 1,
    // Without minWidth: 0 a long recipient string forces this flex item to its
    // min-content width, which is what broke the header row.
    minWidth: 0,
    overflow: 'hidden',
  },
  metaSenderName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  metaSubRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  metaSenderEmail: {
    fontSize: '11.5px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  recipientsToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
    maxWidth: '240px',
    padding: '2px 8px',
    border: '1px solid var(--border-color)',
    borderRadius: '999px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--text-secondary)',
    fontFamily: 'inherit',
    fontSize: '11.5px',
    lineHeight: '1.5',
    cursor: 'pointer',
    overflow: 'hidden',
    minWidth: 0,
  },
  recipientsToggleLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  recipientsDropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: '70px',
    right: '20px',
    maxWidth: '460px',
    zIndex: 30,
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
    animation: 'slideUp 0.18s ease-out',
  },
  recipientsDropdownTitle: {
    fontSize: '10.5px',
    fontWeight: '600',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  recipientItem: {
    fontSize: '12.5px',
    lineHeight: '1.45',
    color: 'var(--text-secondary)',
    wordBreak: 'break-word',
  },
  metaTime: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  detailBody: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: '14px',
    lineHeight: '1.6',
    color: 'var(--text-primary)',
    overflow: 'auto',
    wordWrap: 'break-word',
  },
  paragraph: {
    margin: '0 0 16px 0',
  },
  attachmentsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  attachmentsTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    letterSpacing: '0.5px',
  },
  attachmentsGrid: {
    display: 'flex',
    gap: '10px',
  },
  attachmentCard: {
    padding: '10px 14px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '140px',
    cursor: 'pointer',
  },
  attachmentName: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  attachmentSize: {
    fontSize: '10.5px',
    color: 'var(--text-muted)',
  },
  repliesSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: '16px',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '20px',
  },
  repliesTitle: {
    fontSize: '12.5px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
  },
  replyCard: {
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  replyCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  replySender: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--primary)',
  },
  replyTime: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  replyBody: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.5',
  },
  replyForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '20px',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '20px',
  },
  replyTextarea: {
    width: '100%',
    height: '80px',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    resize: 'none',
    boxSizing: 'border-box',
  },
  replyFormActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  replyButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: 'var(--primary)',
      color: '#ffffff',
      borderColor: 'var(--primary)',
    }
  },
  replySendBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
    fontSize: '12.5px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: 'var(--accent-hover)',
    }
  },
  replyCancelBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontSize: '12.5px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-primary)',
    }
  },
  paginationContainer: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-color)',
  },
  paginationContainerBottom: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    justifyContent: 'center',
    alignItems: 'center',
    borderTop: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
  },
  paginationButton: {
    padding: '8px 14px',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      backgroundColor: 'var(--accent)',
      color: '#ffffff',
      borderColor: 'var(--accent)',
    },
    ':disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  },
  splitter: {
    width: '4px',
    cursor: 'col-resize',
    backgroundColor: 'transparent',
    borderLeft: '1px solid var(--border-color)',
    borderRight: '1px solid var(--border-color)',
    transition: 'background-color 0.2s',
    position: 'relative',
    flexShrink: 0,
    ':hover': {
      backgroundColor: 'var(--primary)',
    }
  },
  paginationInfo: {
    padding: '0 12px',
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontWeight: '500',
  },
  noEmailSelected: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },
  noEmailTitle: {
    margin: '0 0 8px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  noEmailText: {
    margin: 0,
    fontSize: '13.5px',
    color: 'var(--text-muted)',
    maxWidth: '280px',
  },
  skeletonCard: {
    padding: '16px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    backgroundColor: 'var(--bg-secondary)',
  },
  skeletonHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skeletonLine: {
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: '4px',
    animation: 'skeleton-pulse 1.5s ease-in-out infinite',
  },
  };
