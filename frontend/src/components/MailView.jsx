import React, { useState } from 'react';
import { MailIcon, StarIcon, TrashIcon, ReplyIcon, ClockIcon, CheckSquareIcon, SearchIcon, GmailIcon, OutlookIcon, YahooIcon, CustomIcon } from './Icons';

export default function MailView({
  emails,
  connectedAccounts,
  onUpdateEmails,
  onConvertEmailToTask,
  onBlockCalendarForEmail,
  activeAccountFilter,
  setActiveAccountFilter,
  onTriggerNotification,
  onOpenCompose
}) {
  const [selectedFolder, setSelectedFolder] = useState('inbox'); // inbox, starred, sent, trash
  const [selectedEmailId, setSelectedEmailId] = useState(emails.length > 0 ? emails[0].id : null);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyBody, setReplyBody] = useState('');
  
  // Clean up selection if email is deleted
  const selectedEmail = emails.find(e => e.id === selectedEmailId) || (emails.length > 0 ? emails[0] : null);

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

    // Search query filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        mail.subject.toLowerCase().includes(query) ||
        mail.sender.toLowerCase().includes(query) ||
        mail.body.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const getUnreadCount = (folder) => {
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

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* 1st Pane: Sidebar navigation */}
      <div style={styles.sidebar}>
        <button style={styles.composeBtn} onClick={() => onOpenCompose()}>
          <MailIcon size={16} style={{ marginRight: '8px' }} />
          Compose Mail
        </button>

        <div style={styles.navSection}>
          <div style={styles.navHeader}>FOLDERS</div>
          <button
            style={{ ...styles.navItem, ...(selectedFolder === 'inbox' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFolder('inbox')}
          >
            <span>Inbox</span>
            {getUnreadCount('inbox') > 0 && (
              <span className="badge badge-primary">{getUnreadCount('inbox')}</span>
            )}
          </button>
          <button
            style={{ ...styles.navItem, ...(selectedFolder === 'starred' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFolder('starred')}
          >
            <span>Starred</span>
          </button>
          <button
            style={{ ...styles.navItem, ...(selectedFolder === 'sent' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFolder('sent')}
          >
            <span>Sent</span>
          </button>
          <button
            style={{ ...styles.navItem, ...(selectedFolder === 'trash' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFolder('trash')}
          >
            <span>Trash</span>
          </button>
        </div>

        <div style={styles.navSection}>
          <div style={styles.navHeader}>CONNECTED INBOXES</div>
          <button
            style={{ ...styles.navItem, ...(activeAccountFilter === 'all' ? styles.navItemActive : {}) }}
            onClick={() => setActiveAccountFilter('all')}
          >
            <MailIcon size={14} />
            <span style={{ marginLeft: '8px' }}>All Inboxes</span>
          </button>

          {connectedAccounts.map((acc) => {
            const Icon = getProviderIcon(acc.provider);
            return (
              <button
                key={acc.id}
                style={{ ...styles.navItem, ...(activeAccountFilter === acc.id ? styles.navItemActive : {}) }}
                onClick={() => setActiveAccountFilter(acc.id)}
              >
                <Icon size={14} />
                <span style={{ marginLeft: '8px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {acc.email}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2nd Pane: Email list */}
      <div style={styles.listPane}>
        <div style={styles.searchBarContainer}>
          <SearchIcon size={16} style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search email thread..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <div style={styles.listContainer}>
          {filteredEmails.length === 0 ? (
            <div style={styles.emptyState}>No emails found.</div>
          ) : (
            filteredEmails.map((mail) => {
              const accountObj = connectedAccounts.find(acc => acc.email === mail.account);
              const provider = accountObj ? accountObj.provider : 'custom';
              
              return (
                <div
                  key={mail.id}
                  style={{
                    ...styles.emailCard,
                    ...(selectedEmailId === mail.id ? styles.emailCardActive : {}),
                    ...(mail.isRead ? {} : styles.emailCardUnread)
                  }}
                  className={`provider-${provider}`}
                  onClick={() => {
                    setSelectedEmailId(mail.id);
                    // Mark as read
                    if (!mail.isRead) {
                      const updated = emails.map(m => m.id === mail.id ? { ...m, isRead: true } : m);
                      onUpdateEmails(updated);
                    }
                  }}
                >
                  <div style={styles.emailCardHeader}>
                    <span style={styles.emailSender}>{mail.senderName || mail.sender}</span>
                    <span style={styles.emailTime}>{mail.date}</span>
                  </div>
                  <div style={styles.emailSubject}>{mail.subject}</div>
                  <div style={styles.emailPreview}>{mail.body}</div>
                  
                  <div style={styles.emailCardFooter}>
                    <span style={styles.emailAccountBadge} className={`text-${provider}`}>
                      {mail.account}
                    </span>
                    <div style={styles.cardActions}>
                      <button 
                        style={{ ...styles.cardActionBtn, color: mail.isStarred ? '#fbbf24' : 'var(--text-muted)' }}
                        onClick={(e) => handleToggleStar(mail.id, e)}
                      >
                        <StarIcon size={14} />
                      </button>
                      <button 
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
      </div>

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

              {/* Integrations Toolbar */}
              <div style={styles.toolbar}>
                <button
                  style={styles.toolbarBtn}
                  className="glass-panel-interactive"
                  onClick={() => onConvertEmailToTask(selectedEmail)}
                  title="Create a Todo task from this email"
                >
                  <CheckSquareIcon size={15} />
                  <span>Convert to Task</span>
                </button>
                <button
                  style={styles.toolbarBtn}
                  className="glass-panel-interactive"
                  onClick={() => onBlockCalendarForEmail(selectedEmail)}
                  title="Schedule a time block in calendar for this email"
                >
                  <ClockIcon size={15} />
                  <span>Block Calendar</span>
                </button>
              </div>
            </div>

            <div style={styles.divider} />

            {/* Email Meta */}
            <div style={styles.emailMetaRow}>
              <div style={styles.senderAvatar}>
                {(selectedEmail.senderName || selectedEmail.sender)[0].toUpperCase()}
              </div>
              <div style={styles.metaText}>
                <div style={styles.metaSenderName}>{selectedEmail.senderName || selectedEmail.sender}</div>
                <div style={styles.metaSenderEmail}>From: {selectedEmail.sender} &bull; To: {selectedEmail.to || 'me'}</div>
              </div>
              <div style={styles.metaTime}>{selectedEmail.date}</div>
            </div>

            {/* Email Body */}
            <div style={styles.detailBody}>
              {selectedEmail.body.split('\n').map((para, i) => (
                <p key={i} style={styles.paragraph}>{para}</p>
              ))}
            </div>

            {/* Mock Attachments */}
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

            {/* Quick Reply Form */}
            <form onSubmit={handleReplySubmit} style={styles.replyForm}>
              <textarea
                placeholder={`Reply to ${selectedEmail.senderName || selectedEmail.sender}...`}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                style={styles.replyTextarea}
                required
              />
              <div style={styles.replyFormActions}>
                <button type="submit" style={styles.replySendBtn}>
                  <ReplyIcon size={14} style={{ marginRight: '6px' }} />
                  Send Reply
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div style={styles.noEmailSelected}>
            <MailIcon size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
            <h3>No Email Selected</h3>
            <p>Select an email from the inbox list to read its content.</p>
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
    width: '220px',
    borderRight: '1px solid var(--border-color)',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    backgroundColor: 'var(--bg-primary)',
    boxSizing: 'border-box',
  },
  composeBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    fontSize: '13.5px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'var(--primary-hover)',
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
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.04)',
      color: 'var(--text-primary)',
    }
  },
  navItemActive: {
    backgroundColor: 'var(--primary-glow)',
    color: '#c084fc',
    fontWeight: '600',
  },
  listPane: {
    width: '360px',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'rgba(10, 11, 14, 0.4)',
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
    backgroundColor: 'rgba(0,0,0,0.2)',
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
    padding: '16px',
    borderBottom: '1px solid var(--border-color)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
    }
  },
  emailCardActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
  },
  emailCardUnread: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  emailCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emailSender: {
    fontSize: '13.5px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  emailTime: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  emailSubject: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  emailPreview: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    display: '-webkit-box',
    WebkitLineClamp: '2',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
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
  toolbar: {
    display: 'flex',
    gap: '10px',
  },
  toolbarBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    fontSize: '12.5px',
    fontWeight: '500',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
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
  },
  senderAvatar: {
    width: '38px',
    height: '38px',
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
  },
  metaSenderName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  metaSenderEmail: {
    fontSize: '11.5px',
    color: 'var(--text-muted)',
  },
  metaTime: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  detailBody: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
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
  },
  replySendBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    fontSize: '12.5px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'var(--primary-hover)',
    }
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
  }
};
