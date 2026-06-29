import React, { useState, useEffect } from 'react';
import { CloseIcon } from './Icons';

export default function ComposeModal({ isOpen, onClose, connectedAccounts, onSend, initialValues = null }) {
  const [fromAccount, setFromAccount] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (connectedAccounts && connectedAccounts.length > 0) {
      setFromAccount(connectedAccounts[0].id);
    }
  }, [connectedAccounts]);

  useEffect(() => {
    if (initialValues) {
      if (initialValues.from) {
        const found = connectedAccounts.find(acc => acc.email.toLowerCase() === initialValues.from.toLowerCase());
        if (found) setFromAccount(found.id);
      }
      setTo(initialValues.to || '');
      setSubject(initialValues.subject || '');
      setBody(initialValues.body || '');
    } else {
      setTo('');
      setSubject('');
      setBody('');
    }
  }, [initialValues, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!to || !subject || !body) return;

    setIsSending(true);
    setTimeout(() => {
      onSend({
        from: connectedAccounts.find(acc => acc.id === fromAccount)?.email || 'sender@domain.com',
        to,
        subject,
        body,
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      });
      setIsSending(false);
      onClose();
    }, 1000);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal} className="glass-panel animate-slide-up">
        <div style={styles.header}>
          <h3 style={styles.title}>New Message</h3>
          <button style={styles.closeBtn} onClick={onClose} disabled={isSending}>
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.row}>
            <label style={styles.label}>From</label>
            <select
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
              style={styles.select}
              disabled={isSending}
            >
              {connectedAccounts.map((acc) => (
                <option key={acc.id} value={acc.id} style={styles.option}>
                  {acc.email} ({acc.provider.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>To</label>
            <input
              type="email"
              required
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={styles.input}
              disabled={isSending}
            />
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Subject</label>
            <input
              type="text"
              required
              placeholder="Re: Project Proposal"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={styles.input}
              disabled={isSending}
            />
          </div>

          <div style={{ ...styles.row, flexDirection: 'column', alignItems: 'stretch', flexGrow: 1 }}>
            <textarea
              required
              placeholder="Write your email details here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={styles.textarea}
              disabled={isSending}
            />
          </div>

          <div style={styles.footer}>
            <button
              type="button"
              style={styles.cancelBtn}
              onClick={onClose}
              disabled={isSending}
            >
              Discard
            </button>
            <button
              type="submit"
              style={styles.sendBtn}
              disabled={isSending}
            >
              {isSending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  modal: {
    width: '600px',
    height: '500px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
  },
  closeBtn: {
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: '6px',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.06)',
    }
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flexGrow: 1,
    height: 'calc(100% - 48px)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '8px',
  },
  label: {
    width: '80px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  input: {
    flexGrow: 1,
    fontSize: '14px',
    color: 'var(--text-primary)',
    padding: '4px 0',
  },
  select: {
    flexGrow: 1,
    fontSize: '14px',
    color: 'var(--text-primary)',
    padding: '4px 0',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
  },
  option: {
    background: '#11141b',
    color: '#ffffff',
  },
  textarea: {
    width: '100%',
    flexGrow: 1,
    resize: 'none',
    padding: '12px 0',
    fontSize: '14px',
    color: 'var(--text-primary)',
    lineHeight: '1.6',
    border: 'none',
    outline: 'none',
    height: '100%',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '12px',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '12px',
  },
  cancelBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13.5px',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.04)',
    }
  },
  sendBtn: {
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '13.5px',
    color: '#ffffff',
    backgroundColor: 'var(--primary)',
    fontWeight: '600',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'var(--primary-hover)',
    }
  }
};
