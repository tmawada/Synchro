import React, { useState, useEffect, useRef } from 'react';
import { 
  MailIcon, 
  CalendarIcon, 
  CheckSquareIcon, 
  SettingsIcon, 
  LogOutIcon, 
  SearchIcon,
  PanelLeftIcon,
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

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3030`;

// Synchro priority -> TickTick numeric priority (0=none, 1=low, 3=medium, 5=high)
const TICKTICK_PRIORITY = { low: 1, medium: 3, high: 5 };
const TICKTICK_PRIORITY_REVERSE = { 0: 'low', 1: 'low', 2: 'low', 3: 'medium', 4: 'high', 5: 'high' };

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

  // Mail search (server-side) & account filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAccountFilter, setActiveAccountFilter] = useState('all');

  // Integrations states
  const [preFilledEvent, setPreFilledEvent] = useState(null);
  
  // Compose modal state
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitialValues, setComposeInitialValues] = useState(null);

  // Sidebar expand/collapse (persisted)
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => localStorage.getItem('synchro_sidebar') !== 'closed'
  );

  // Profile Dropdown state
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [headerHover, setHeaderHover] = useState(false);
  const [themePreference, setThemePreference] = useState(() =>
    localStorage.getItem('synchro_theme') || 'system'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = themePreference;
    localStorage.setItem('synchro_theme', themePreference);
  }, [themePreference]);

  useEffect(() => {
    localStorage.setItem('synchro_sidebar', isSidebarOpen ? 'open' : 'closed');
    // Reset hover state when sidebar state changes to prevent stale overlays
    setHeaderHover(false);
  }, [isSidebarOpen]);

  // Pagination state for emails
  const [mailPage, setMailPage] = useState(1);
  const [mailTotalPages, setMailTotalPages] = useState(1);
  const [mailLoading, setMailLoading] = useState(false);

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

  // Refs for debounced server-side search and stale-response guarding
  const searchTimerRef = useRef(null);
  const fetchSeqRef = useRef(0);
  const lastToggleRef = useRef(0);

  // Fetch real Google emails when logged in
  // `query` triggers a server-side Gmail subject search across the whole mailbox
  const fetchEmails = async (page = 1, limit = 50, query = '') => {
    const token = localStorage.getItem('synchro_token');
    if (!isLoggedIn || !token) return;

    // Ignore stale responses (e.g. a newer search/paging request was fired)
    fetchSeqRef.current += 1;
    const seq = fetchSeqRef.current;

    setMailLoading(true);
    try {
      const qParam = query ? `&q=${encodeURIComponent(query)}` : '';
      const res = await fetch(`${API_URL}/auth/emails?page=${page}&limit=${limit}${qParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok && seq === fetchSeqRef.current) {
        const data = await res.json();
        if (data.emails && Array.isArray(data.emails)) {
          setEmails(data.emails);
          setMailTotalPages(data.totalPages || 1);
          setMailPage(data.page || 1);
        }
      }
    } catch (err) {
      console.error('Failed to fetch real emails:', err);
    } finally {
      if (seq === fetchSeqRef.current) {
        setMailLoading(false);
      }
    }
  };

  // Server-side email search: debounce the input, then fetch page 1
  // (search always resets pagination to the first page)
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchEmails(1, 50, value);
    }, 500);
  };

  useEffect(() => {
    fetchEmails(1, 50);
  }, [isLoggedIn]);

  // Re-sync read state when returning to the Mail tab: refetch the page the
  // user was on so read/unread status changed in Gmail is reflected without
  // a full reload. Only when no search is active — searching already fetches
  // fresh results on every keystroke. The initial mount is skipped since the
  // isLoggedIn effect above already does the first fetch.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (activeTab === 'mail' && isLoggedIn && !searchQuery) {
      fetchEmails(mailPage, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Fetch user profile on app start if logged in
  useEffect(() => {
    const token = localStorage.getItem('synchro_token');
    if (isLoggedIn && token && (!authUser || !authUser.email)) {
      fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => (res.ok ? res.json() : null))
        .then(user => {
          if (user) {
            setAuthUser(user);
            localStorage.setItem('synchro_authUser', JSON.stringify(user));
          }
        })
        .catch(err => console.error('Failed to fetch user profile:', err));
    }
  }, [isLoggedIn, authUser]);

  // Data States
  // Dummy seed records from earlier builds are filtered out so they don't
  // linger in users' localStorage after the seed data is removed.
  const DUMMY_EMAIL_IDS = ['mail_1', 'mail_2', 'mail_3', 'mail_4', 'mail_5'];
  const DUMMY_TASK_IDS = ['task_1', 'task_2', 'task_3', 'task_4', 'task_5'];

  const [emails, setEmails] = useState(() => {
    const saved = localStorage.getItem('synchro_emails');
    if (!saved) return [];
    return JSON.parse(saved).filter((m) => !DUMMY_EMAIL_IDS.includes(m.id));
  });

  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('synchro_tasks');
    if (!saved) return [];
    return JSON.parse(saved).filter((t) => !DUMMY_TASK_IDS.includes(t.id));
  });

  // TickTick Tasks State
  const [ticktickTasks, setTickTickTasks] = useState(() => {
    const saved = localStorage.getItem('synchro_ticktick_tasks');
    if (saved) return JSON.parse(saved);
    return [];
  });

  const [ticktickConnected, setTickTickConnected] = useState(() => {
    const saved = localStorage.getItem('synchro_ticktick_connected');
    return saved === 'true';
  });

  const [ticktickLoading, setTickTickLoading] = useState(false);

  // Fetch TickTick tasks when logged in
  // Active tasks come from GET /ticktick/tasks, completed from GET /ticktick/completed —
  // they are merged so the Tasks view can show both lists.
  const fetchTickTickTasks = async () => {
    const token = localStorage.getItem('synchro_token');
    if (!isLoggedIn || !token) return;

    setTickTickLoading(true);
    try {
      const [activeRes, completedRes] = await Promise.all([
        fetch(`${API_URL}/ticktick/tasks`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch(`${API_URL}/ticktick/completed`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ]);

      let allTasks = [];
      let connected = false;

      if (activeRes.ok) {
        const data = await activeRes.json();
        if (data.tasks && Array.isArray(data.tasks)) {
          allTasks = data.tasks;
        }
        if (typeof data.connected === 'boolean') {
          connected = data.connected;
        }
      } else {
        console.error(`Failed to fetch TickTick tasks: HTTP ${activeRes.status}`);
      }

      if (connected && completedRes.ok) {
        const data = await completedRes.json();
        if (data.tasks && Array.isArray(data.tasks)) {
          // Completed tasks are appended; ids never collide since active fetch
          // already excludes status=2 tasks
          allTasks = [...allTasks, ...data.tasks];
        }
      }

      setTickTickTasks(allTasks);
      localStorage.setItem('synchro_ticktick_tasks', JSON.stringify(allTasks));
      setTickTickConnected(connected);
      localStorage.setItem('synchro_ticktick_connected', String(connected));
    } catch (err) {
      console.error('Failed to fetch TickTick tasks:', err);
    } finally {
      setTickTickLoading(false);
    }
  };

  // Fetch TickTick connection status
  const checkTickTickStatus = async () => {
    const token = localStorage.getItem('synchro_token');
    if (!isLoggedIn || !token) return;

    try {
      const res = await fetch(`${API_URL}/ticktick/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.connected === 'boolean') {
          setTickTickConnected(data.connected);
          localStorage.setItem('synchro_ticktick_connected', String(data.connected));
        }
      }
    } catch (err) {
      console.error('Failed to check TickTick status:', err);
    }
  };

  // Trigger TickTick tasks fetch when logged in
  useEffect(() => {
    if (isLoggedIn) {
      fetchTickTickTasks();
      checkTickTickStatus();
    }
  }, [isLoggedIn]);

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

  useEffect(() => {
    localStorage.setItem('synchro_ticktick_tasks', JSON.stringify(ticktickTasks));
  }, [ticktickTasks]);

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
    setIsProfileOpen(false);
    triggerNotification('Logged out successfully.');
  };

  // TickTick Integration Handlers
  const handleConnectTickTick = async (accessToken) => {
    const token = localStorage.getItem('synchro_token');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/ticktick/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accessToken }),
      });

      if (res.ok) {
        triggerNotification('TickTick connected successfully!');
        await fetchTickTickTasks();
        await checkTickTickStatus();
      } else {
        const error = await res.json();
        triggerNotification(`Failed to connect TickTick: ${error.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to connect TickTick:', err);
      triggerNotification('Failed to connect TickTick.');
    }
  };

  const handleDisconnectTickTick = async () => {
    const token = localStorage.getItem('synchro_token');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/ticktick/disconnect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        setTickTickTasks([]);
        setTickTickConnected(false);
        localStorage.removeItem('synchro_ticktick_tasks');
        localStorage.removeItem('synchro_ticktick_connected');
        triggerNotification('TickTick disconnected.');
      } else {
        triggerNotification('Failed to disconnect TickTick.');
      }
    } catch (err) {
      console.error('Failed to disconnect TickTick:', err);
      triggerNotification('Failed to disconnect TickTick.');
    }
  };

  // Create a task in TickTick (used for all new tasks when TickTick is connected)
  const handleCreateTickTickTask = async (task) => {
    const token = localStorage.getItem('synchro_token');
    if (!token) return false;

    try {
      const res = await fetch(`${API_URL}/ticktick/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: task.title,
          priority: TICKTICK_PRIORITY[task.priority] ?? 0,
          dueDate: task.dueDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerNotification(`Failed to create task in TickTick: ${data.message || 'HTTP ' + res.status}`);
        return false;
      }

      if (data.task) {
        setTickTickTasks(prev => [data.task, ...prev]);
      }
      return true;
    } catch (err) {
      console.error('Failed to create TickTick task:', err);
      triggerNotification('Failed to create task in TickTick.');
      return false;
    }
  };

  // Add a task: syncs to TickTick when connected, otherwise stores locally
  const handleAddTask = async (task) => {
    if (ticktickConnected) {
      return handleCreateTickTickTask(task);
    }
    setTasks(prev => [task, ...prev]);
    return true;
  };

  // Update a task: routes TickTick tasks to the TickTick API, local tasks to state
  const handleUpdateTask = async (task, patch) => {
    if (task.source === 'ticktick') {
      return handleUpdateTickTickTask(task, patch);
    }
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, ...patch } : t)));
    return true;
  };

  // Delete a task: routes TickTick tasks to the TickTick API, local tasks to state
  const handleDeleteTask = async (task) => {
    if (task.source === 'ticktick') {
      return handleDeleteTickTickTask(task);
    }
    setTasks(prev => prev.filter(t => t.id !== task.id));
    triggerNotification(`Deleted task: "${task.title}"`);
    return true;
  };

  // Update a TickTick task (title/priority/dueDate/complete)
  const handleUpdateTickTickTask = async (task, patch) => {
    const token = localStorage.getItem('synchro_token');
    if (!token) return;

    // patch uses Synchro terms; convert priority for the API
    const apiPatch = { ...patch };
    if (patch.priority !== undefined) {
      apiPatch.priority = TICKTICK_PRIORITY[patch.priority] ?? 0;
    }

    try {
      const res = await fetch(
        `${API_URL}/ticktick/task/${task.ticktickId}?projectId=${encodeURIComponent(task.projectId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(apiPatch),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerNotification(`Failed to update task: ${data.message || 'HTTP ' + res.status}`);
        return false;
      }

      setTickTickTasks(prev =>
        prev.map(t => {
          if (t.ticktickId !== task.ticktickId) return t;
          const next = { ...t };
          if (patch.title !== undefined) next.title = patch.title;
          if (patch.priority !== undefined) next.priority = TICKTICK_PRIORITY_REVERSE[apiPatch.priority] || 'low';
          if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
          if (patch.completed !== undefined) next.completed = patch.completed;
          return next;
        }),
      );
      triggerNotification('TickTick task updated.');
      return true;
    } catch (err) {
      console.error('Failed to update TickTick task:', err);
      triggerNotification('Failed to update task.');
      return false;
    }
  };

  // Delete a TickTick task
  const handleDeleteTickTickTask = async (task) => {
    const token = localStorage.getItem('synchro_token');
    if (!token) return;

    try {
      const res = await fetch(
        `${API_URL}/ticktick/task/${task.ticktickId}?projectId=${encodeURIComponent(task.projectId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        triggerNotification(`Failed to delete task: ${data.message || 'HTTP ' + res.status}`);
        return;
      }

      setTickTickTasks(prev => prev.filter(t => t.ticktickId !== task.ticktickId));
      triggerNotification(`Deleted TickTick task: "${task.title}"`);
    } catch (err) {
      console.error('Failed to delete TickTick task:', err);
      triggerNotification('Failed to delete task.');
    }
  };

  const profileRef = useRef(null);
  const headerHoverRef = useRef(null); // I don't really need a ref for this but good to have

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isProfileOpen && profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileOpen]);

  // Integration workflows
  const handleConvertEmailToTask = async (email) => {
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
    const ok = await handleAddTask(newTask);
    if (!ok) return;
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
      {/* Sidebar Navigation (collapsible) */}
      <div style={{ ...styles.mainSidebar, width: isSidebarOpen ? 240 : 76 }}>
        <div style={{ ...styles.sidebarHeader, ...(isSidebarOpen ? styles.sidebarHeaderExpanded : styles.sidebarHeaderCollapsed) }}>
          <div
            key={isSidebarOpen ? 'open' : 'closed'}
            style={{
              ...styles.logoWrapper,
              cursor: isSidebarOpen ? 'default' : 'pointer'
            }}
            onClick={() => {
              if (!isSidebarOpen) {
                const now = Date.now();
                if (now - lastToggleRef.current > 300) {
                  setIsSidebarOpen(true);
                  setHeaderHover(false);
                  lastToggleRef.current = now;
                }
              }
            }}
            onMouseEnter={() => !isSidebarOpen && setHeaderHover(true)}
            onMouseLeave={() => setHeaderHover(false)}
            title={!isSidebarOpen ? 'Expand' : ''}
          >
            <img
              src="/logo.png"
              alt="Synchro logo"
              style={{
                ...styles.logoBadge,
                opacity: (!isSidebarOpen && headerHover) ? 0.2 : 1,
                transition: 'opacity 0.2s'
              }}
            />
            {!isSidebarOpen && headerHover && (
              <div style={styles.logoOverlay}>
                <PanelLeftIcon size={18} style={{ transform: 'rotate(180deg)', transition: 'transform 0.3s' }} />
              </div>
            )}
          </div>
          {isSidebarOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeInSlide 0.3s ease-out forwards' }}>
              <span style={{ ...styles.brandName, animation: 'none' }}>Synchro</span>
              <button
                style={styles.headerToggleButton}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSidebarOpen(false);
                  setHeaderHover(false);
                }}
                title="Collapse"
                className="sidebar-nav-item"
              >
                <PanelLeftIcon size={18} />
              </button>
            </div>
          )}
        </div>

        <nav style={styles.sidebarNav}>
          <button
            className={`sidebar-nav-item ${activeTab === 'mail' ? 'sidebar-nav-item-active' : ''}`}
            style={{
              ...styles.navBtn,
              ...(activeTab === 'mail' ? styles.navBtnActive : {}),
            }}
            onClick={() => setActiveTab('mail')}
            title="Mails"
          >
            <div style={styles.navIconWrapper}>
              <MailIcon size={22} />
              {emails.filter(e => e.folder === 'inbox' && !e.isRead).length > 0 && (
                <div style={styles.badgeDot} />
              )}
            </div>
            {isSidebarOpen && <span style={styles.navText}>Mails</span>}
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'calendar' ? 'sidebar-nav-item-active' : ''}`}
            style={{
              ...styles.navBtn,
              ...(activeTab === 'calendar' ? styles.navBtnActive : {}),
            }}
            onClick={() => setActiveTab('calendar')}
            title="Calendar"
          >
            <div style={styles.navIconWrapper}>
              <CalendarIcon size={22} />
            </div>
            {isSidebarOpen && <span style={styles.navText}>Calendar</span>}
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'tasks' ? 'sidebar-nav-item-active' : ''}`}
            style={{
              ...styles.navBtn,
              ...(activeTab === 'tasks' ? styles.navBtnActive : {}),
            }}
            onClick={() => setActiveTab('tasks')}
            title="Tasks"
          >
            <div style={styles.navIconWrapper}>
              <CheckSquareIcon size={22} />
              {(tasks.filter(t => !t.completed).length + (ticktickConnected ? ticktickTasks.filter(t => !t.completed).length : 0)) > 0 && (
                <div style={styles.badgeCount}>
                  {tasks.filter(t => !t.completed).length + (ticktickConnected ? ticktickTasks.filter(t => !t.completed).length : 0)}
                </div>
              )}
            </div>
            {isSidebarOpen && <span style={styles.navText}>Tasks</span>}
          </button>
        </nav>

        {/* Profile (sidebar bottom) */}
        <div
          ref={profileRef}
          style={{ ...styles.sidebarFooter, ...(isSidebarOpen ? styles.sidebarFooterExpanded : {}) }}
        >
          <button
            className="sidebar-nav-item"
            style={{ ...styles.profileBadgeWrapper, ...(isSidebarOpen ? styles.profileBadgeWrapperExpanded : {}) }}
            onClick={(e) => {
              e.stopPropagation();
              setIsProfileOpen(!isProfileOpen);
            }}
          >
            <div style={styles.profileBadge}>
              {authUser?.avatarUrl ? (
                <img
                  src={authUser.avatarUrl}
                  alt={authUser.name || 'User'}
                  style={styles.profileAvatar}
                />
              ) : (
                <span style={styles.profileInitial}>
                  {(authUser?.name || authUser?.email || 'U').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {isSidebarOpen && (
              <div style={styles.profileInfo}>
                <span style={styles.profileName}>{authUser?.name || 'User'}</span>
                <span style={styles.profileEmail}>{authUser?.email || ''}</span>
              </div>
            )}
          </button>
          {isProfileOpen && (
            <div style={styles.sidebarProfileDropdown}>
              <div style={styles.dropdownHeader}>
                {authUser?.avatarUrl ? (
                  <img
                    src={authUser.avatarUrl}
                    alt={authUser.name || 'User'}
                    style={styles.dropdownAvatar}
                  />
                ) : (
                  <div style={styles.dropdownAvatarPlaceholder}>
                    {(authUser?.name || authUser?.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={styles.dropdownUserInfo}>
                  <span style={styles.dropdownUserName}>
                    {authUser?.name || 'User'}
                  </span>
                  <span style={styles.dropdownUserEmail}>
                    {authUser?.email || ''}
                  </span>
                </div>
              </div>
              <div style={styles.dropdownDivider} />
              <div style={styles.preferencesSection}>
                <span style={styles.preferencesTitle}>Preferences</span>
                <span style={styles.themeLabel}>Theme</span>
                <div style={styles.themeOptions} role="group" aria-label="Theme preference">
                  {[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      style={{
                        ...styles.themeOption,
                        ...(themePreference === option.value ? styles.themeOptionActive : {}),
                      }}
                      aria-pressed={themePreference === option.value}
                      onClick={() => setThemePreference(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={styles.dropdownDivider} />
              <button
                style={styles.dropdownItem}
                onClick={handleLogout}
              >
                <LogOutIcon size={16} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div style={styles.workspace}>
        {/* Workspace Top Bar */}
        <header style={styles.topbar}>
          <div style={styles.topbarTitleArea}>
            <h1 style={styles.viewTitle}>
              {activeTab === 'mail' && 'Mails'}
              {activeTab === 'calendar' && 'Routine Calendar Blocking'}
              {activeTab === 'tasks' && 'Tasks'}
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
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              currentPage={mailPage}
              totalPages={mailTotalPages}
              onPageChange={(page) => fetchEmails(page, 50, searchQuery)}
              isLoading={mailLoading}
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
              ticktickTasks={ticktickTasks}
              ticktickConnected={ticktickConnected}
              ticktickLoading={ticktickLoading}
              onAddTask={handleAddTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onScheduleTaskOnCalendar={handleScheduleTaskOnCalendar}
              onTriggerNotification={triggerNotification}
              onOpenEmail={handleOpenEmail}
              onConnectTickTick={handleConnectTickTick}
              onDisconnectTickTick={handleDisconnectTickTick}
              onRefreshTickTick={fetchTickTickTasks}
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
    position: 'relative',
    backgroundColor: 'var(--bg-primary)',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '24px 0',
    flexShrink: 0,
    boxSizing: 'border-box',
    overflow: 'visible',
    zIndex: 100,
    transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '0 19px',
    marginBottom: '40px',
    boxSizing: 'border-box',
    height: '38px',
    flexShrink: 0,
  },
  sidebarHeaderExpanded: {
    gap: '14px',
  },
  sidebarHeaderCollapsed: {
    justifyContent: 'center',
    padding: '0',
  },
  brandName: {
    fontFamily: 'var(--font-display)',
    fontSize: '20px',
    fontWeight: '800',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.5px',
    animation: 'fadeInSlide 0.3s ease-out forwards',
  },
  headerToggleButton: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginLeft: 'auto',
  },
  logoContainer: {
    width: '38px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoWrapper: {
    position: 'relative',
    width: '38px',
    height: '38px',
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px',
    flexShrink: 0,
    transition: 'background-color 0.2s',
  },
  logoOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent)',
    animation: 'fadeIn 0.2s ease-out',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: '10px',
  },
  logoBadge: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    objectFit: 'contain',
    display: 'block',
    filter: 'drop-shadow(0 0 10px rgba(2, 151, 222, 0.4))',
  },
  sidebarNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexGrow: 1,
    width: '100%',
    overflow: 'hidden',
  },
  navBtn: {
    width: '100%',
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text-secondary)',
    transition: 'all 0.2s ease',
    position: 'relative',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '0 27px',
    flexShrink: 0,
  },
  navBtnActive: {
    color: 'var(--accent)',
    backgroundColor: 'rgba(2, 151, 222, 0.08)',
  },
  navIconWrapper: {
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  navText: {
    marginLeft: '16px',
    fontSize: '14px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    animation: 'fadeInSlide 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards',
  },
  badgeDot: {
    position: 'absolute',
    top: '-2px',
    right: '-2px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent)',
    border: '2px solid var(--bg-primary)',
  },
  badgeCount: {
    position: 'absolute',
    top: '-6px',
    right: '-8px',
    fontSize: '10px',
    fontWeight: '700',
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
    padding: '2px 5px',
    borderRadius: '10px',
    lineHeight: '1',
    minWidth: '14px',
    textAlign: 'center',
  },
  sidebarFooter: {
    position: 'relative',
    marginTop: 'auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: '0',
    boxSizing: 'border-box',
    flexShrink: 0,
    borderTop: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    zIndex: 10,
  },
  sidebarFooterExpanded: {
    alignItems: 'stretch',
  },
  profileBadgeWrapper: {
    width: '100%',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    outline: 'none',
    position: 'relative',
    zIndex: 2,
  },
  profileBadgeWrapperExpanded: {
    padding: '0 20px',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  profileBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 0 15px rgba(2, 151, 222, 0.2)',
  },
  profileInitial: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#ffffff',
  },
  profileAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  profileInfo: {
    marginLeft: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    overflow: 'hidden',
  },
  profileName: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  },
  profileEmail: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sidebarProfileDropdown: {
    position: 'absolute',
    bottom: '0',
    left: 'calc(100% + 12px)',
    width: '260px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(16px)',
    zIndex: 1000,
    overflow: 'hidden',
    animation: 'slideUp 0.2s ease-out',
  },
  dropdownHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
  },
  dropdownAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  dropdownAvatarPlaceholder: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: '700',
    color: '#ffffff',
  },
  dropdownUserInfo: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  dropdownUserName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dropdownUserEmail: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dropdownDivider: {
    borderTop: '1px solid var(--border-color)',
  },
  preferencesSection: {
    padding: '12px 16px 14px',
  },
  preferencesTitle: {
    display: 'block',
    marginBottom: '10px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: '600',
  },
  themeLabel: {
    display: 'block',
    marginBottom: '7px',
    color: 'var(--text-secondary)',
    fontSize: '12px',
  },
  themeOptions: {
    display: 'flex',
    gap: '4px',
    padding: '3px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-tertiary)',
  },
  themeOption: {
    flex: 1,
    padding: '6px 4px',
    borderRadius: '6px',
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  themeOptionActive: {
    backgroundColor: 'var(--bg-card)',
    borderColor: 'var(--border-color-active)',
    color: 'var(--text-primary)',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
  },
  dropdownItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    color: 'var(--danger)',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
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
