import React, { useState, useEffect } from 'react';
import { 
  MailIcon, 
  CalendarIcon, 
  CheckSquareIcon, 
  SettingsIcon, 
  LogOutIcon, 
  SearchIcon,
  GmailIcon,
  OutlookIcon,
  YahooIcon,
  CustomIcon
} from './components/Icons';
import Login from './components/Login';
import MailView from './components/MailView';
import CalendarView from './components/CalendarView';
import TasksView from './components/TasksView';
import ComposeModal from './components/ComposeModal';

const API_URL = 'http://localhost:3000';

export default function App() {
  // Navigation & Login
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem('synchro_token');
  });
  const [authUser, setAuthUser] = useState(() => {
    const saved = localStorage.getItem('synchro_authUser');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('synchro_activeTab') || 'mail';
  });
  
  // Accounts
  const [connectedAccounts, setConnectedAccounts] = useState(() => {
    const saved = localStorage.getItem('synchro_accounts');
    return saved ? JSON.parse(saved) : [];
  });

  // Global search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAccountFilter, setActiveAccountFilter] = useState('all');

  // Integrations states
  const [preFilledEvent, setPreFilledEvent] = useState(null);
  
  // Compose modal state
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitialValues, setComposeInitialValues] = useState(null);

  // Notification state
  const [notification, setNotification] = useState({ show: false, message: '' });

  // Handle OAuth callback — extract token from URL after Google redirect
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    if (token) {
      localStorage.setItem('synchro_token', token);
      // Fetch user profile with the token
      fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(user => {
          setAuthUser(user);
          localStorage.setItem('synchro_authUser', JSON.stringify(user));
          setIsLoggedIn(true);
          triggerNotification('Logged in with Google successfully!');
        })
        .catch(() => {
          triggerNotification('Failed to fetch user profile.');
        });
      // Clean the URL
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  // Data States
  const [emails, setEmails] = useState(() => {
    const saved = localStorage.getItem('synchro_emails');
    if (saved) return JSON.parse(saved);
    
    // Default initial mock emails
    return [
      {
        id: 'mail_1',
        subject: 'Weekly Product Sync Proposal',
        sender: 'alice.vance@company.com',
        senderName: 'Alice Vance',
        to: 'me',
        account: 'work@outlook.com',
        body: "Hey team,\n\nLet's align on the new Synchro app layout. I would like to schedule a 45-minute syncing session this Wednesday or Thursday to review the time blocking mockup and list integration.\n\nLet me know what slot works for you!\n\nBest,\nAlice Vance",
        folder: 'inbox',
        date: '09:24 AM',
        isRead: false,
        isStarred: true,
        attachments: [{ name: 'Synchro_v1_Pitch.pdf', size: '4.2 MB' }],
        replies: []
      },
      {
        id: 'mail_2',
        subject: 'IT Security Keys Expiration Alert',
        sender: 'admin@serverhq.com',
        senderName: 'SysAdmin IT',
        to: 'me',
        account: 'work@outlook.com',
        body: "Hi developer,\n\nYour server security keys are set to expire in 3 days. Please review the security policy changes and perform a key rotation as soon as possible.\n\nFeel free to block time in my calendar if you run into any issues during the deployment.\n\nThanks,\nIT Department",
        folder: 'inbox',
        date: 'Yesterday',
        isRead: true,
        isStarred: false,
        attachments: [],
        replies: []
      },
      {
        id: 'mail_3',
        subject: 'Google Workspace Billing Invoice',
        sender: 'billing-noreply@google.com',
        senderName: 'Google Workspace Billing',
        to: 'personal@gmail.com',
        account: 'personal@gmail.com',
        body: "Dear Customer,\n\nYour monthly subscription invoice for Google Workspace is now available.\nAmount Due: $18.00\n\nPayment method ending in *4242 will be charged automatically on July 2nd. If you want to update your billing details, please visit the admin billing console.",
        folder: 'inbox',
        date: 'Yesterday',
        isRead: true,
        isStarred: false,
        attachments: [{ name: 'Invoice_2026_06.pdf', size: '128 KB' }],
        replies: []
      },
      {
        id: 'mail_4',
        subject: 'Yahoo News: Major Tech Shifts in 2026',
        sender: 'news@yahoo-inc.com',
        senderName: 'Yahoo News',
        to: 'leisure@yahoo.com',
        account: 'leisure@yahoo.com',
        body: "Welcome to Yahoo Technology newsletter!\n\nThis week, we analyze the surge in AI agent workspace integrations, the evolution of browser sandboxes, and why developers are reverting to vanilla CSS frameworks for responsiveness. Read on for the full analysis.",
        folder: 'inbox',
        date: '2 Days ago',
        isRead: true,
        isStarred: false,
        attachments: [],
        replies: []
      },
      {
        id: 'mail_5',
        subject: 'Welcome to Synchro Workspace!',
        sender: 'onboarding@synchro.io',
        senderName: 'Synchro Team',
        to: 'personal@gmail.com',
        account: 'personal@gmail.com',
        body: "Hi there!\n\nWelcome to Synchro, your unified environment for mail client folders, tasks, and routine-blocking calendars.\n\nYou can integrate Gmail, Outlook, Yahoo, or custom accounts in seconds. Try converting this email into a task or scheduling a time block directly from the reader toolbar.\n\nEnjoy!\nSynchro Team",
        folder: 'inbox',
        date: '3 Days ago',
        isRead: false,
        isStarred: true,
        attachments: [],
        replies: []
      }
    ];
  });

  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('synchro_tasks');
    if (saved) return JSON.parse(saved);

    return [
      {
        id: 'task_1',
        title: "Review Alice's proposal & send confirmation email",
        priority: 'high',
        listType: 'work',
        duration: 45,
        dueDate: '2026-06-29',
        completed: false,
        emailRef: 'mail_1'
      },
      {
        id: 'task_2',
        title: 'Rotate server security credentials',
        priority: 'high',
        listType: 'work',
        duration: 30,
        dueDate: '2026-07-02',
        completed: false,
        emailRef: 'mail_2'
      },
      {
        id: 'task_3',
        title: 'Set up morning meditation and stretching routine',
        priority: 'low',
        listType: 'routine',
        duration: 60,
        dueDate: '2026-06-29',
        completed: false,
        emailRef: null
      },
      {
        id: 'task_4',
        title: 'Verify Google Workspace invoice details',
        priority: 'medium',
        listType: 'personal',
        duration: 30,
        dueDate: '2026-07-01',
        completed: false,
        emailRef: 'mail_3'
      },
      {
        id: 'task_5',
        title: 'Buy groceries for tonight\'s dinner recipe',
        priority: 'low',
        listType: 'personal',
        duration: 45,
        dueDate: '2026-06-29',
        completed: true,
        emailRef: null
      }
    ];
  });

  const [events, setEvents] = useState(() => {
    const saved = localStorage.getItem('synchro_events');
    if (saved) return JSON.parse(saved);

    return [
      {
        id: 'ev_1',
        title: 'Team Alignment Sync',
        day: 'Mon',
        startHour: 10,
        startMin: 0,
        duration: 60,
        category: 'work'
      },
      {
        id: 'ev_2',
        title: 'Lunch Break & Walk',
        day: 'Mon',
        startHour: 12,
        startMin: 30,
        duration: 60,
        category: 'personal'
      },
      {
        id: 'ev_3',
        title: 'Focus Block: Code Review',
        day: 'Tue',
        startHour: 14,
        startMin: 0,
        duration: 120,
        category: 'work'
      },
      {
        id: 'ev_4',
        title: 'Morning Inbox Zero Triage',
        day: 'Wed',
        startHour: 8,
        startMin: 30,
        duration: 45,
        category: 'email'
      },
      {
        id: 'ev_5',
        title: 'Weekly Planning Routine',
        day: 'Fri',
        startHour: 16,
        startMin: 0,
        duration: 90,
        category: 'routine'
      }
    ];
  });

  // Synced States to localStorage

  useEffect(() => {
    localStorage.setItem('synchro_activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('synchro_accounts', JSON.stringify(connectedAccounts));
  }, [connectedAccounts]);

  useEffect(() => {
    localStorage.setItem('synchro_emails', JSON.stringify(emails));
  }, [emails]);

  useEffect(() => {
    localStorage.setItem('synchro_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('synchro_events', JSON.stringify(events));
  }, [events]);

  // Toast Notification triggers
  const triggerNotification = (message) => {
    setNotification({ show: true, message });
    setTimeout(() => {
      setNotification({ show: false, message: '' });
    }, 3000);
  };

  // Login Handlers
  const handleAddAccount = (account) => {
    setConnectedAccounts(prev => [...prev, account]);
    triggerNotification(`Added account: ${account.email}`);
  };

  const handleRemoveAccount = (accountId) => {
    setConnectedAccounts(prev => prev.filter(acc => acc.id !== accountId));
    triggerNotification(`Removed email account.`);
  };

  const handleLoginSuccess = (authResult) => {
    if (authResult?.accessToken) {
      localStorage.setItem('synchro_token', authResult.accessToken);
      localStorage.setItem('synchro_authUser', JSON.stringify(authResult.user));
      setAuthUser(authResult.user);
    }
    setIsLoggedIn(true);
    triggerNotification('Logged in successfully!');
  };

  const handleLogout = () => {
    localStorage.removeItem('synchro_token');
    localStorage.removeItem('synchro_authUser');
    setAuthUser(null);
    setIsLoggedIn(false);
    triggerNotification('Logged out successfully.');
  };

  // Integration workflows
  const handleConvertEmailToTask = (email) => {
    const newTask = {
      id: 'task_' + Date.now(),
      title: `Follow up: ${email.subject}`,
      priority: 'high',
      listType: 'work',
      duration: 60,
      dueDate: new Date().toISOString().split('T')[0],
      completed: false,
      emailRef: email.id
    };
    setTasks(prev => [newTask, ...prev]);
    setActiveTab('tasks');
    triggerNotification('Created new task referencing this email!');
  };

  const handleBlockCalendarForEmail = (email) => {
    setPreFilledEvent({
      title: `Triage: ${email.subject}`,
      category: 'email',
      duration: 45,
      day: 'Mon',
      startHour: 9,
      startMin: 0
    });
    setActiveTab('calendar');
    triggerNotification('Opening scheduler. Click slot to block calendar.');
  };

  const handleScheduleTaskOnCalendar = (task) => {
    setPreFilledEvent({
      title: `Block: ${task.title}`,
      category: task.listType === 'routine' ? 'routine' : 'work',
      duration: task.duration,
      day: 'Mon',
      startHour: 11,
      startMin: 0
    });
    setActiveTab('calendar');
    triggerNotification('Opening scheduler. Select slot to block this task.');
  };

  const handleOpenEmail = (emailId) => {
    // Open email view and focus on emailId
    setActiveTab('mail');
    // MailView handles active email selection based on local state, but we default to this
  };

  const handleComposeSend = (newMail) => {
    const createdMail = {
      id: 'mail_' + Date.now(),
      subject: newMail.subject,
      sender: newMail.from,
      senderName: 'Me',
      to: newMail.to,
      account: newMail.from,
      body: newMail.body,
      folder: 'sent',
      date: newMail.date,
      isRead: true,
      isStarred: false,
      attachments: [],
      replies: []
    };
    setEmails(prev => [createdMail, ...prev]);
    triggerNotification(`Message sent to ${newMail.to}`);
  };

  const getProviderIcon = (provider) => {
    switch (provider) {
      case 'gmail': return GmailIcon;
      case 'outlook': return OutlookIcon;
      case 'yahoo': return YahooIcon;
      default: return CustomIcon;
    }
  };

  // If not logged in, render Login
  if (!isLoggedIn) {
    return (
      <Login
        connectedAccounts={connectedAccounts}
        onAddAccount={handleAddAccount}
        onRemoveAccount={handleRemoveAccount}
        onLoginSuccess={handleLoginSuccess}
        apiUrl={API_URL}
      />
    );
  }

  return (
    <div style={styles.appContainer}>
      {/* Sidebar Navigation */}
      <div style={styles.mainSidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.logoBadge}>S</div>
        </div>

        <nav style={styles.sidebarNav}>
          <button 
            style={{...styles.navBtn, ...(activeTab === 'mail' ? styles.navBtnActive : {})}}
            onClick={() => setActiveTab('mail')}
            title="Mail Integration Inbox"
          >
            <MailIcon size={20} />
            <span style={styles.navText}>Mail</span>
            {emails.filter(e => e.folder === 'inbox' && !e.isRead).length > 0 && (
              <div style={styles.badgeDot} />
            )}
          </button>
          
          <button 
            style={{...styles.navBtn, ...(activeTab === 'calendar' ? styles.navBtnActive : {})}}
            onClick={() => setActiveTab('calendar')}
            title="Routine Calendar Blocker"
          >
            <CalendarIcon size={20} />
            <span style={styles.navText}>Calendar</span>
          </button>
          
          <button 
            style={{...styles.navBtn, ...(activeTab === 'tasks' ? styles.navBtnActive : {})}}
            onClick={() => setActiveTab('tasks')}
            title="Tasks Manager"
          >
            <CheckSquareIcon size={20} />
            <span style={styles.navText}>Tasks</span>
            {tasks.filter(t => !t.completed).length > 0 && (
              <div style={styles.badgeCount}>
                {tasks.filter(t => !t.completed).length}
              </div>
            )}
          </button>
        </nav>

        <div style={styles.sidebarFooter}>
          <button 
            style={styles.logoutBtn} 
            onClick={handleLogout}
            title="Sign out of Dashboard"
          >
            <LogOutIcon size={18} />
          </button>
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div style={styles.workspace}>
        {/* Workspace Top Bar */}
        <header style={styles.topbar}>
          <div style={styles.topbarTitleArea}>
            <h1 style={styles.viewTitle}>
              {activeTab === 'mail' && 'Unified Mailbox'}
              {activeTab === 'calendar' && 'Routine Calendar Blocking'}
              {activeTab === 'tasks' && 'Focus Todo Tasks'}
            </h1>
          </div>

          <div style={styles.topbarActions}>
            {/* Connected Accounts indicator bar */}
            <div style={styles.accountsRow}>
              {connectedAccounts.map(acc => {
                const Icon = getProviderIcon(acc.provider);
                return (
                  <div key={acc.id} style={styles.avatarIndicator} title={acc.email}>
                    <Icon size={14} />
                  </div>
                );
              })}
            </div>

            <div style={styles.profileBadge}>
              <span style={styles.profileInitial}>U</span>
            </div>
          </div>
        </header>

        {/* View render area */}
        <main style={styles.contentContainer}>
          {activeTab === 'mail' && (
            <MailView
              emails={emails}
              connectedAccounts={connectedAccounts}
              onUpdateEmails={setEmails}
              onConvertEmailToTask={handleConvertEmailToTask}
              onBlockCalendarForEmail={handleBlockCalendarForEmail}
              activeAccountFilter={activeAccountFilter}
              setActiveAccountFilter={setActiveAccountFilter}
              onTriggerNotification={triggerNotification}
              onOpenCompose={() => setIsComposeOpen(true)}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              events={events}
              onAddEvent={(ev) => setEvents(prev => [...prev, ev])}
              onRemoveEvent={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
              connectedAccounts={connectedAccounts}
              onTriggerNotification={triggerNotification}
              preFilledEvent={preFilledEvent}
              clearPreFilledEvent={() => setPreFilledEvent(null)}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksView
              tasks={tasks}
              onAddTask={(t) => setTasks(prev => [t, ...prev])}
              onUpdateTasks={setTasks}
              onDeleteTask={(id) => setTasks(prev => prev.filter(t => t.id !== id))}
              onScheduleTaskOnCalendar={handleScheduleTaskOnCalendar}
              onTriggerNotification={triggerNotification}
              onOpenEmail={handleOpenEmail}
            />
          )}
        </main>
      </div>

      {/* Global Compose Overlay Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        connectedAccounts={connectedAccounts}
        onSend={handleComposeSend}
        initialValues={composeInitialValues}
      />

      {/* Animated notification toast */}
      {notification.show && (
        <div style={styles.toast} className="glass-panel animate-slide-up">
          <span style={{ fontSize: '13px', fontWeight: '500' }}>
            {notification.message}
          </span>
        </div>
      )}
    </div>
  );
}

const styles = {
  appContainer: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
  },
  mainSidebar: {
    width: '76px',
    backgroundColor: 'var(--bg-primary)',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 0',
    flexShrink: 0,
    boxSizing: 'border-box',
  },
  sidebarHeader: {
    marginBottom: '32px',
  },
  logoBadge: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)',
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: '800',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    boxShadow: '0 0 12px rgba(139, 92, 246, 0.3)',
  },
  sidebarNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    flexGrow: 1,
    width: '100%',
    alignItems: 'center',
  },
  navBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    transition: 'all 0.2s',
    position: 'relative',
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.04)',
      color: 'var(--text-primary)',
    }
  },
  navBtnActive: {
    backgroundColor: 'var(--primary-glow)',
    color: '#c084fc',
  },
  navText: {
    fontSize: '9px',
    fontWeight: '600',
    marginTop: '4px',
  },
  badgeDot: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--danger)',
  },
  badgeCount: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    fontSize: '9px',
    fontWeight: '700',
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    padding: '2px 5px',
    borderRadius: '8px',
    lineHeight: '1',
  },
  sidebarFooter: {
    marginTop: 'auto',
  },
  logoutBtn: {
    color: 'var(--text-muted)',
    padding: '8px',
    borderRadius: '8px',
    transition: 'color 0.2s, background-color 0.2s',
    ':hover': {
      color: 'var(--danger)',
      backgroundColor: 'rgba(239, 68, 68, 0.05)',
    }
  },
  workspace: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  topbar: {
    height: '64px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    backgroundColor: 'var(--bg-primary)',
    flexShrink: 0,
  },
  topbarTitleArea: {
    display: 'flex',
    alignItems: 'center',
  },
  viewTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '20px',
    fontWeight: '700',
    margin: 0,
  },
  topbarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  accountsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingRight: '12px',
    borderRight: '1px solid var(--border-color)',
  },
  avatarIndicator: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  profileInitial: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#ffffff',
  },
  contentContainer: {
    flexGrow: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '14px 20px',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    zIndex: 1000,
    backgroundColor: 'var(--bg-tertiary)',
    borderLeft: '4px solid var(--primary)',
  }
};
