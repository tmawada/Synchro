import React, { useState } from 'react';
import { GmailIcon, OutlookIcon, YahooIcon, CustomIcon, PlusIcon, CloseIcon, CheckIcon } from './Icons';

// Google icon SVG for the sign-in button
function GoogleColorIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function Login({ connectedAccounts, onAddAccount, onRemoveAccount, onLoginSuccess, apiUrl }) {
  const [activeForm, setActiveForm] = useState(null); // 'gmail' | 'outlook' | 'yahoo' | 'custom' | null
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const providers = [
    { id: 'gmail', name: 'Google Workspace / Gmail', icon: GmailIcon, color: '--color-gmail', placeholder: 'yourname@gmail.com' },
    { id: 'outlook', name: 'Microsoft Outlook / Office 365', icon: OutlookIcon, color: '--color-outlook', placeholder: 'yourname@outlook.com' },
    { id: 'yahoo', name: 'Yahoo! Mail', icon: YahooIcon, color: '--color-yahoo', placeholder: 'yourname@yahoo.com' },
    { id: 'custom', name: 'Custom SMTP/IMAP Server', icon: CustomIcon, color: '--color-custom', placeholder: 'mail@yourdomain.com' },
  ];

  const handleOpenForm = (providerId) => {
    setActiveForm(providerId);
    setEmail('');
    setPassword('');
    setImapHost(providerId === 'custom' ? 'imap.domain.com' : '');
    setErrorMsg('');
  };

  const handleCloseForm = () => {
    setActiveForm(null);
    setErrorMsg('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg('Please enter an email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password or app password.');
      return;
    }

    // Verify email format briefly
    if (!email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    // Check if account already exists
    if (connectedAccounts.some(acc => acc.email.toLowerCase() === email.toLowerCase())) {
      setErrorMsg('This account is already connected.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    // Simulate verification
    setTimeout(() => {
      onAddAccount({
        id: activeForm + '_' + Date.now(),
        provider: activeForm,
        email: email,
        name: email.split('@')[0],
      });
      setIsVerifying(false);
      setActiveForm(null);
    }, 1200);
  };

  // Handle Google OAuth — redirect to backend
  const handleGoogleSignIn = () => {
    window.location.href = `${apiUrl}/auth/google`;
  };

  // Handle email/password auth (register or login)
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please fill in all fields.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    try {
      const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
      const body = authMode === 'register'
        ? { email, password, name: name || email.split('@')[0] }
        : { email, password };

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed.');
      }

      // data = { accessToken, user: { id, email, name } }
      onLoginSuccess(data);
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.glassBackground} />
      <div style={styles.card} className="glass-panel">
        <div style={styles.header}>
          <div style={styles.logo}>
            <span style={styles.logoText}>S</span>
          </div>
          <h1 style={styles.title}>Synchro Workspace</h1>
          <p style={styles.subtitle}>
            A unified environment for your emails, tasks, and routines. Sign in to get started.
          </p>
        </div>

        {/* Google Sign-In Button */}
        <button
          style={styles.googleBtn}
          className="glass-panel-interactive"
          onClick={handleGoogleSignIn}
        >
          <GoogleColorIcon size={20} />
          <span style={{ fontWeight: '600', fontSize: '14px' }}>Sign in with Google</span>
        </button>

        {/* Divider */}
        <div style={styles.orDivider}>
          <div style={styles.orLine} />
          <span style={styles.orText}>OR</span>
          <div style={styles.orLine} />
        </div>

        {/* Email/Password Auth Form */}
        <form onSubmit={handleEmailAuth} style={styles.form}>
          <div style={styles.authToggle}>
            <button
              type="button"
              style={{
                ...styles.toggleBtn,
                ...(authMode === 'login' ? styles.toggleBtnActive : {}),
              }}
              onClick={() => { setAuthMode('login'); setErrorMsg(''); }}
            >
              Sign In
            </button>
            <button
              type="button"
              style={{
                ...styles.toggleBtn,
                ...(authMode === 'register' ? styles.toggleBtnActive : {}),
              }}
              onClick={() => { setAuthMode('register'); setErrorMsg(''); }}
            >
              Register
            </button>
          </div>

          {authMode === 'register' && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Name</label>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={styles.input}
                disabled={isVerifying}
              />
            </div>
          )}

          <div style={styles.formGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              disabled={isVerifying}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              disabled={isVerifying}
            />
          </div>

          {errorMsg && <div style={styles.errorAlert}>{errorMsg}</div>}

          <button
            type="submit"
            disabled={isVerifying}
            style={{
              ...styles.submitBtn,
              background: isVerifying ? '#4c1d95' : 'var(--primary)',
            }}
          >
            {isVerifying
              ? 'Please wait...'
              : authMode === 'register'
                ? 'Create Account'
                : 'Sign In'}
          </button>
        </form>

        {/* Connected Accounts Section */}
        {connectedAccounts.length > 0 && (
          <>
            <div style={styles.divider} />
            <div style={styles.accountsSection}>
              <div style={styles.sectionHeader}>CONNECTED ACCOUNTS ({connectedAccounts.length})</div>
              <div style={styles.accountsList}>
                {connectedAccounts.map((acc) => {
                  const prov = providers.find(p => p.id === acc.provider);
                  const IconComponent = prov ? prov.icon : CustomIcon;
                  return (
                    <div key={acc.id} style={styles.accountBadge}>
                      <IconComponent size={16} />
                      <span style={styles.accountEmail}>{acc.email}</span>
                      <button 
                        style={styles.removeAccountBtn} 
                        onClick={() => onRemoveAccount(acc.id)}
                        title="Disconnect Account"
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Connect Email Accounts Section (IMAP/SMTP) */}
        <div style={styles.divider} />
        <div style={styles.providersSection}>
          <div style={styles.sectionHeader}>CONNECT EMAIL ACCOUNT (IMAP)</div>
          <div style={styles.grid}>
            {providers.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  style={styles.providerBtn}
                  className="glass-panel-interactive"
                  onClick={() => handleOpenForm(p.id)}
                >
                  <Icon size={24} />
                  <span style={styles.providerName}>{p.name}</span>
                  <PlusIcon size={14} style={styles.plusIcon} />
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.actions}>
          <button
            style={{
              ...styles.enterBtn,
              opacity: connectedAccounts.length > 0 ? 1 : 0.5,
              cursor: connectedAccounts.length > 0 ? 'pointer' : 'not-allowed',
              animation: connectedAccounts.length > 0 ? 'pulseGlow 2s infinite' : 'none'
            }}
            disabled={connectedAccounts.length === 0}
            onClick={() => onLoginSuccess(null)}
          >
            Enter Dashboard
          </button>
          {connectedAccounts.length === 0 && (
            <p style={styles.warningText}>Connect email accounts above, or sign in with Google / email to proceed.</p>
          )}
        </div>
      </div>

      {activeForm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal} className="glass-panel animate-slide-up">
            <div style={styles.modalHeader}>
              <div style={styles.modalTitleRow}>
                {React.createElement(providers.find(p => p.id === activeForm).icon, { size: 20 })}
                <h3 style={styles.modalTitle}>Connect {providers.find(p => p.id === activeForm).name}</h3>
              </div>
              <button style={styles.closeBtn} onClick={handleCloseForm}>
                <CloseIcon size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder={providers.find(p => p.id === activeForm).placeholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  disabled={isVerifying}
                />
              </div>

              {activeForm === 'custom' && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ ...styles.formGroup, flex: 2 }}>
                    <label style={styles.label}>IMAP Host Server</label>
                    <input
                      type="text"
                      required
                      placeholder="imap.mailserver.com"
                      value={imapHost}
                      onChange={(e) => setImapHost(e.target.value)}
                      style={styles.input}
                      disabled={isVerifying}
                    />
                  </div>
                  <div style={{ ...styles.formGroup, flex: 1 }}>
                    <label style={styles.label}>IMAP Port</label>
                    <input
                      type="number"
                      required
                      placeholder="993"
                      value={imapPort}
                      onChange={(e) => setImapPort(e.target.value)}
                      style={styles.input}
                      disabled={isVerifying}
                    />
                  </div>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  {activeForm === 'gmail' ? 'App Password' : 'Password'}
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  disabled={isVerifying}
                />
                {activeForm === 'gmail' && (
                  <span style={styles.hintText}>
                    Note: For Gmail accounts, please generate and use an App Password from your Google Account settings.
                  </span>
                )}
              </div>

              {errorMsg && <div style={styles.errorAlert}>{errorMsg}</div>}

              <button
                type="submit"
                disabled={isVerifying}
                style={{
                  ...styles.submitBtn,
                  background: isVerifying ? '#4c1d95' : 'var(--primary)',
                }}
              >
                {isVerifying ? 'Verifying Credentials...' : 'Authenticate Account'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100vw',
    position: 'relative',
    backgroundColor: '#07080a',
    fontFamily: 'var(--font-sans)',
    overflow: 'hidden',
  },
  glassBackground: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, rgba(0,0,0,0) 70%)',
    top: '20%',
    left: '30%',
    filter: 'blur(40px)',
    zIndex: 0,
  },
  card: {
    width: '480px',
    padding: '40px',
    zIndex: 1,
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  header: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  logo: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    boxShadow: '0 0 16px rgba(139, 92, 246, 0.4)',
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontWeight: '800',
    fontSize: '24px',
    color: '#ffffff',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '28px',
    fontWeight: '700',
    margin: '0 0 8px 0',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: '13.5px',
    lineHeight: '1.5',
    margin: 0,
  },
  divider: {
    height: '1px',
    background: 'var(--border-color)',
    width: '100%',
  },
  sectionHeader: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    letterSpacing: '1px',
    marginBottom: '12px',
  },
  accountsSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  accountsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  accountBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    fontSize: '12.5px',
  },
  accountEmail: {
    fontWeight: '500',
    color: 'var(--text-primary)',
  },
  removeAccountBtn: {
    fontSize: '16px',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '4px',
    padding: 0,
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'color 0.2s',
    ':hover': {
      color: 'var(--danger)',
    }
  },
  providersSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  providerBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '10px',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  providerName: {
    flexGrow: 1,
    color: 'var(--text-primary)',
  },
  plusIcon: {
    color: 'var(--text-muted)',
  },
  actions: {
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    alignItems: 'center',
  },
  enterBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '10px',
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: '600',
    boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4)',
    transition: 'background-color 0.2s',
  },
  warningText: {
    color: 'var(--text-muted)',
    fontSize: '11px',
    margin: 0,
  },
  modalOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modal: {
    width: '380px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  modalTitle: {
    fontSize: '16px',
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
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '11.5px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'rgba(0,0,0,0.2)',
    fontSize: '14px',
    color: 'var(--text-primary)',
    transition: 'border-color 0.2s',
    focus: {
      borderColor: 'var(--primary)',
    }
  },
  hintText: {
    color: 'var(--text-muted)',
    fontSize: '10px',
    lineHeight: '1.4',
    marginTop: '2px',
  },
  errorAlert: {
    padding: '10px',
    borderRadius: '6px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: 'var(--danger)',
    fontSize: '12px',
  },
  submitBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    marginTop: '8px',
    transition: 'background-color 0.2s',
  },
  googleBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '10px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontSize: '14px',
  },
  orDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  orLine: {
    flex: 1,
    height: '1px',
    background: 'var(--border-color)',
  },
  orText: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    letterSpacing: '1px',
  },
  authToggle: {
    display: 'flex',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid var(--border-color)',
  },
  toggleBtn: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  toggleBtnActive: {
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
  },
};
