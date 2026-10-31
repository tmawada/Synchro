import React, { useState, useEffect, useMemo } from 'react';
import { PlusIcon, TrashIcon, CheckSquareIcon, CalendarIcon, InfoIcon, MailIcon, SettingsIcon, RefreshIcon, LinkIcon, UnlinkIcon, EditIcon, CloseIcon, MoreVerticalIcon } from './Icons';

// TickTick-style priority shortcuts: type "!high", "!medium" or "!low" in the title
const PRIORITY_SUGGESTIONS = [
  { token: '!high', priority: 'high', desc: 'Set priority to high' },
  { token: '!medium', priority: 'medium', desc: 'Set priority to medium' },
  { token: '!low', priority: 'low', desc: 'Set priority to low' },
];

// Matches the word currently being typed when it starts with "!"
const CURRENT_WORD_REGEX = /(^|\s)(!\w*)$/;
// Matches completed priority tokens anywhere in the input
const PRIORITY_TOKEN_REGEX = /(^|\s)!(high|medium|low)\b/gi;

// Returns the suggestions for the word currently being typed (or null prefix)
const getSuggestions = (value) => {
  const match = value.match(CURRENT_WORD_REGEX);
  if (!match) return { prefix: null, list: [] };
  const prefix = match[2];
  return {
    prefix,
    list: PRIORITY_SUGGESTIONS.filter((s) => s.token.startsWith(prefix.toLowerCase())),
  };
};

// Replaces the in-progress word with the chosen token (plus a trailing space)
const applySuggestion = (value, token) =>
  value.replace(CURRENT_WORD_REGEX, (m, space) => space + token + ' ');

// Extracts !high/!medium/!low tokens from raw input, returning the cleaned title
// and the last priority token found (or null when none was typed)
const parsePriorityInput = (raw) => {
  let priority = null;
  const title = raw
    .replace(PRIORITY_TOKEN_REGEX, (match, space, p) => {
      priority = p.toLowerCase();
      return space || '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { title, priority };
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Friendly label for the date chip on the left of each task card
const formatDueLabel = (dateStr) => {
  const due = new Date(`${dateStr}T00:00:00`);
  if (isNaN(due.getTime())) return dateStr;
  const today = startOfToday();
  const diff = Math.round((due - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(due.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
};

// Urgency color for the date chip: red = overdue, amber = due today, muted = upcoming
const getDueStyle = (task) => {
  if (task.completed) return { color: 'var(--text-muted)' };
  const due = new Date(`${task.dueDate}T00:00:00`);
  if (isNaN(due.getTime())) return { color: 'var(--text-muted)' };
  const today = startOfToday();
  if (due < today) return { color: 'var(--danger)' };
  if (due.getTime() === today.getTime()) return { color: 'var(--warning)' };
  return { color: 'var(--text-secondary)' };
};

export default function TasksView({
  tasks,
  ticktickTasks = [],
  ticktickConnected = false,
  ticktickLoading = false,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onScheduleTaskOnCalendar,
  onTriggerNotification,
  onOpenEmail,
  onConnectTickTick,
  onDisconnectTickTick,
  onRefreshTickTick
}) {
  const [selectedFilter, setSelectedFilter] = useState('all'); // all, today, high, completed, list_work, list_personal, list_routine
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium'); // high, medium, low
  const [listType, setListType] = useState('work'); // work, personal, routine
  const [duration, setDuration] = useState(60); // minutes
  const [dueDate, setDueDate] = useState('');
  const [showTickTickSettings, setShowTickTickSettings] = useState(false);
  const [showTickTickModal, setShowTickTickModal] = useState(false);
  const [ticktickToken, setTicktickToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Edit modal state
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editListType, setEditListType] = useState('work');
  const [editDuration, setEditDuration] = useState(60);
  const [editDueDate, setEditDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Priority-token autocomplete state
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [dismissedToken, setDismissedToken] = useState(null);

  // Which task's 3-dot menu is open (task id, or null)
  const [openMenuTaskId, setOpenMenuTaskId] = useState(null);

  // Close the 3-dot menu when clicking outside of it
  useEffect(() => {
    if (!openMenuTaskId) return;
    const handleClickOutside = (event) => {
      if (!event.target.closest('[data-task-menu-wrapper]')) {
        setOpenMenuTaskId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuTaskId]);

  const isTickTickTask = (task) => task.source === 'ticktick';

  const composerSuggest = getSuggestions(title);
  const editSuggest = getSuggestions(editTitle);
  const composerSuggestOpen =
    composerSuggest.list.length > 0 && composerSuggest.prefix !== dismissedToken;
  const editSuggestOpen =
    editSuggest.list.length > 0 && editSuggest.prefix !== dismissedToken;

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    if (!ticktickToken.trim() || isConnecting) return;
    setIsConnecting(true);
    await onConnectTickTick(ticktickToken.trim());
    setIsConnecting(false);
    setShowTickTickModal(false);
    setTicktickToken('');
  };

  // Keyboard navigation for the "!priority" suggestion dropdown
  const handleSuggestKeyDown = (e, suggest, onAccept) => {
    const { prefix, list } = suggest;
    if (list.length === 0 || prefix === dismissedToken) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestIdx((i) => (Math.min(i, list.length - 1) + 1) % list.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestIdx((i) => (Math.min(i, list.length - 1) - 1 + list.length) % list.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onAccept(list[Math.min(suggestIdx, list.length - 1)]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDismissedToken(prefix);
    }
  };

  const acceptComposerSuggestion = (s) => {
    setTitle((v) => applySuggestion(v, s.token));
    setPriority(s.priority);
    setSuggestIdx(0);
    setDismissedToken(null);
  };

  const acceptEditSuggestion = (s) => {
    setEditTitle((v) => applySuggestion(v, s.token));
    setEditPriority(s.priority);
    setSuggestIdx(0);
    setDismissedToken(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Pull !high/!medium/!low out of the title and apply it as the priority
    const { title: cleanTitle, priority: typedPriority } = parsePriorityInput(title);
    if (!cleanTitle) {
      onTriggerNotification('Task title is required.');
      return;
    }

    const newTask = {
      id: 'task_' + Date.now(),
      title: cleanTitle,
      priority: typedPriority || priority,
      listType,
      duration: parseInt(duration),
      dueDate: dueDate || null,
      completed: false,
      emailRef: null // will be null unless created from email
    };

    const ok = await onAddTask(newTask);
    if (ok === false) return; // creation failed (error toast already shown)

    setTitle('');
    setPriority('medium');
    setListType('work');
    setDuration(60);
    setDueDate('');
    setSuggestIdx(0);
    setDismissedToken(null);
    onTriggerNotification(
      ticktickConnected
        ? `Task "${newTask.title}" created in TickTick!`
        : `Task "${newTask.title}" added!`
    );
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditListType(task.listType);
    setEditDuration(task.duration);
    setEditDueDate(task.dueDate || '');
    setSuggestIdx(0);
    setDismissedToken(null);
  };

  const closeEdit = () => {
    setEditingTask(null);
    setIsSaving(false);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingTask || isSaving) return;

    // Pull !high/!medium/!low out of the title and apply it as the priority
    const { title: cleanTitle, priority: typedPriority } = parsePriorityInput(editTitle);
    if (!cleanTitle) {
      onTriggerNotification('Task title is required.');
      return;
    }

    const fromTickTick = isTickTickTask(editingTask);
    const patch = {
      title: cleanTitle,
      priority: typedPriority || editPriority,
      // Empty input clears the due date
      dueDate: editDueDate || null,
    };
    // listType/duration only exist in Synchro — TickTick tasks keep their synced values
    if (!fromTickTick) {
      patch.listType = editListType;
      patch.duration = parseInt(editDuration);
    }

    setIsSaving(true);
    const ok = await onUpdateTask(editingTask, patch);
    setIsSaving(false);
    if (ok === false) return; // update failed (error toast already shown)

    closeEdit();
    if (!fromTickTick) {
      onTriggerNotification(`Task updated: "${patch.title}"`);
    }
    // TickTick updates already trigger a toast from App's handler
  };

  const toggleTaskCompleted = async (task) => {
    await onUpdateTask(task, { completed: !task.completed });
  };

  // Merge local tasks with TickTick tasks (both are fully editable;
  // App routes updates/deletes to the TickTick API or local state)
  const allTasks = useMemo(() => {
    if (!ticktickConnected || ticktickTasks.length === 0) {
      return tasks;
    }
    // Combine, avoiding duplicates by ID
    const taskMap = new Map();
    tasks.forEach(t => taskMap.set(t.id, t));
    ticktickTasks.forEach(t => taskMap.set(t.id, t));
    return Array.from(taskMap.values());
  }, [tasks, ticktickTasks, ticktickConnected]);

  // Filter Tasks
  const filteredTasks = allTasks.filter((t) => {
    if (selectedFilter === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      return t.dueDate === todayStr && !t.completed;
    }
    if (selectedFilter === 'high') {
      return t.priority === 'high' && !t.completed;
    }
    if (selectedFilter === 'completed') {
      return t.completed;
    }
    if (selectedFilter.startsWith('list_')) {
      const targetList = selectedFilter.split('_')[1];
      return t.listType === targetList && !t.completed;
    }
    // 'all' includes uncompleted tasks
    return !t.completed;
  });

  const getPriorityStyle = (prio) => {
    switch (prio) {
      case 'high': return { color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.15)' };
      case 'medium': return { color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.15)' };
      default: return { color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.15)' };
    }
  };

  // Dates come first, priority breaks ties, title keeps it stable
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const sortByDateThenPriority = (list) =>
    [...list].sort((a, b) => {
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      const pa = PRIORITY_RANK[a.priority] ?? 3;
      const pb = PRIORITY_RANK[b.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      return a.title.localeCompare(b.title);
    });

  // Bucket a task by how far its due date is from today
  // (overdue tasks stay in "Today" — they're the most urgent)
  const getDueBucket = (task) => {
    if (!task.dueDate) return 'nodate';
    const due = new Date(`${task.dueDate}T00:00:00`);
    if (isNaN(due.getTime())) return 'nodate';
    const diff = Math.round((due - startOfToday()) / 86400000);
    if (diff <= 0) return 'today';
    if (diff <= 5) return 'soon';
    return 'later';
  };

  const TASK_SECTIONS = [
    { key: 'today', label: 'Today' },
    { key: 'soon', label: 'Next 5 Days' },
    { key: 'later', label: 'Later' },
    { key: 'nodate', label: 'No Date' },
  ];

  // Completed archives stay a flat, date-sorted list; other views get sections
  const groupedTasks = useMemo(() => {
    if (selectedFilter === 'completed') {
      return [{ key: 'completed', label: null, tasks: sortByDateThenPriority(filteredTasks) }];
    }
    return TASK_SECTIONS
      .map((section) => ({
        ...section,
        tasks: sortByDateThenPriority(filteredTasks.filter((t) => getDueBucket(t) === section.key)),
      }))
      .filter((section) => section.tasks.length > 0);
  }, [filteredTasks, selectedFilter]);

  const getCount = (filter) => {
    return allTasks.filter((t) => {
      if (filter === 'today') {
        const todayStr = new Date().toISOString().split('T')[0];
        return t.dueDate === todayStr && !t.completed;
      }
      if (filter === 'high') {
        return t.priority === 'high' && !t.completed;
      }
      if (filter === 'completed') {
        return t.completed;
      }
      if (filter.startsWith('list_')) {
        const targetList = filter.split('_')[1];
        return t.listType === targetList && !t.completed;
      }
      return !t.completed;
    }).length;
  };

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* Sidebar: Filters & Categories */}
      <div style={styles.sidebar}>
        <div style={styles.navSection}>
          <div style={styles.navHeader}>SMART LISTS</div>
          <button
            style={{ ...styles.navItem, ...(selectedFilter === 'all' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFilter('all')}
          >
            <span>All Tasks</span>
            <span style={styles.countBadge}>{getCount('all')}</span>
          </button>
          <button
            style={{ ...styles.navItem, ...(selectedFilter === 'today' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFilter('today')}
          >
            <span>Due Today</span>
            <span style={styles.countBadge}>{getCount('today')}</span>
          </button>
          <button
            style={{ ...styles.navItem, ...(selectedFilter === 'high' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFilter('high')}
          >
            <span>High Priority</span>
            <span style={styles.countBadge}>{getCount('high')}</span>
          </button>
          <button
            style={{ ...styles.navItem, ...(selectedFilter === 'completed' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFilter('completed')}
          >
            <span>Completed</span>
            <span style={styles.countBadge}>{getCount('completed')}</span>
          </button>
        </div>

        <div style={styles.navSection}>
          <div style={styles.navHeader}>CATEGORIES</div>
          <button
            style={{ ...styles.navItem, ...(selectedFilter === 'list_work' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFilter('list_work')}
          >
            <span>Work Projects</span>
            <span style={styles.countBadge}>{getCount('list_work')}</span>
          </button>
          <button
            style={{ ...styles.navItem, ...(selectedFilter === 'list_personal' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFilter('list_personal')}
          >
            <span>Personal Life</span>
            <span style={styles.countBadge}>{getCount('list_personal')}</span>
          </button>
          <button
            style={{ ...styles.navItem, ...(selectedFilter === 'list_routine' ? styles.navItemActive : {}) }}
            onClick={() => setSelectedFilter('list_routine')}
          >
            <span>Routine / Habits</span>
            <span style={styles.countBadge}>{getCount('list_routine')}</span>
          </button>
        </div>

        {/* TickTick Integration */}
        {ticktickConnected && !ticktickLoading ? (
          <div style={styles.ticktickConnected}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '8px' }}>
              <span style={{ ...styles.prioTag, color: 'var(--text-primary)', fontSize: '11px', padding: '2px 6px', borderRadius: '6px' }}>
                <LinkIcon size={12} style={{ marginRight: '4px' }} /> Connected
              </span>
              <button
                style={styles.refreshBtn}
                onClick={onRefreshTickTick}
                title="Refresh TickTick tasks"
              >
                <RefreshIcon size={14} />
              </button>
            </div>
            <button
              style={styles.disconnectBtn}
              onClick={onDisconnectTickTick}
              title="Disconnect TickTick"
            >
              <TrashIcon size={12} style={{ marginRight: '6px' }} /> Disconnect Account
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <button
              style={{ ...styles.navItem, padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setShowTickTickModal(true)}
              title="Connect TickTick"
            >
              <SettingsIcon size={14} /> Connect
            </button>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Sync your TickTick tasks
            </span>
          </div>
        )}
        {/* TickTick sync status when loading */}
        {ticktickLoading && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>Syncing TickTick tasks...</span>
          </div>
        )}
      </div>

      {/* Main Task Dashboard */}
      <div style={styles.mainPanel}>
        {/* Task Composer Header */}
        <div style={styles.composerCard} className="glass-panel">
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.composerFirstRow}>
              <div style={styles.suggestWrapper}>
                <input
                  type="text"
                  required
                  placeholder="What is your next task? Type ! for priority"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => handleSuggestKeyDown(e, composerSuggest, acceptComposerSuggestion)}
                  style={styles.taskInput}
                />
                {composerSuggestOpen && (
                  <div style={styles.suggestDropdown} className="glass-panel">
                    <div style={styles.suggestHint}>Priority shortcuts</div>
                    {composerSuggest.list.map((s, i) => {
                      const activeIdx = Math.min(suggestIdx, composerSuggest.list.length - 1);
                      return (
                        <button
                          key={s.token}
                          type="button"
                          style={{
                            ...styles.suggestItem,
                            ...(i === activeIdx ? styles.suggestItemActive : {}),
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault(); // keep focus in the input
                            acceptComposerSuggestion(s);
                          }}
                          onMouseEnter={() => setSuggestIdx(i)}
                        >
                          <span style={{ ...styles.suggestToken, color: getPriorityStyle(s.priority).color }}>
                            {s.token}
                          </span>
                          <span style={styles.suggestDesc}>{s.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button type="submit" style={styles.addTaskBtn}>
                <PlusIcon size={16} style={{ marginRight: '6px' }} />
                {ticktickConnected ? 'Add to TickTick' : 'Add Task'}
              </button>
            </div>

            {ticktickConnected && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                <LinkIcon size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                New tasks are created in your TickTick account, not stored locally.
              </div>
            )}

            <div style={styles.composerSecondRow}>
              <div style={styles.settingGroup}>
                <span style={styles.settingLabel}>List:</span>
                <select value={listType} onChange={(e) => setListType(e.target.value)} style={styles.composerSelect}>
                  <option value="work">Work</option>
                  <option value="personal">Personal</option>
                  <option value="routine">Routine</option>
                </select>
              </div>

              <div style={styles.settingGroup}>
                <span style={styles.settingLabel}>Priority:</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} style={styles.composerSelect}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div style={styles.settingGroup}>
                <span style={styles.settingLabel}>Duration:</span>
                <select value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} style={styles.composerSelect}>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hour</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>

              <div style={styles.settingGroup}>
                <span style={styles.settingLabel}>Due:</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={styles.datePicker}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Task List */}
        <div style={styles.taskListContainer}>
          <h2 style={styles.listTitle}>
            {selectedFilter === 'all' && 'All Pending Tasks'}
            {selectedFilter === 'today' && 'Tasks Due Today'}
            {selectedFilter === 'high' && 'High Priority Tasks'}
            {selectedFilter === 'completed' && 'Completed Archives'}
            {selectedFilter === 'list_work' && 'Work Focus Tasks'}
            {selectedFilter === 'list_personal' && 'Personal Life Tasks'}
            {selectedFilter === 'list_routine' && 'Daily Habits & Routines'}
          </h2>

          <div style={styles.taskList}>
            {filteredTasks.length === 0 ? (
              <div style={styles.emptyState}>
                <CheckSquareIcon size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                <p>All clean! No tasks found in this view.</p>
              </div>
            ) : (
              groupedTasks.map((section) => (
                <div key={section.key} style={styles.taskSection}>
                  {section.label && (
                    <div style={styles.sectionHeader}>
                      <span style={styles.sectionLabel}>{section.label}</span>
                      <span style={styles.countBadge}>{section.tasks.length}</span>
                    </div>
                  )}
                  {section.tasks.map((task) => {
                const prio = getPriorityStyle(task.priority);
                return (
                  <div
                    key={task.id}
                    style={styles.taskCard}
                    className="glass-panel task-card-clickable"
                    title="Click anywhere to edit"
                    onClick={(e) => {
                      // Buttons (checkbox, block time, delete, mail link) handle themselves
                      if (e.target.closest('button')) return;
                      openEdit(task);
                    }}
                  >
                    <button 
                      style={styles.checkboxBtn} 
                      onClick={() => toggleTaskCompleted(task)}
                      title={task.completed ? 'Mark as pending' : 'Mark as completed'}
                    >
                      <div style={{
                        ...styles.checkbox,
                        backgroundColor: task.completed ? 'var(--success)' : 'transparent',
                        borderColor: task.completed ? 'var(--success)' : 'var(--border-color-active)'
                      }}>
                        {task.completed && <span>✓</span>}
                      </div>
                    </button>

                    <div style={styles.taskContent}>
                      <div style={styles.taskTitleRow}>
                        <span style={{
                          ...styles.taskTitle,
                          textDecoration: task.completed ? 'line-through' : 'none',
                          color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)'
                        }}>
                          {task.title}
                        </span>
                        <span style={{ ...styles.prioTag, color: prio.color, backgroundColor: prio.bg }}>
                          {task.priority}
                        </span>
                      </div>

                      {(task.emailRef || (isTickTickTask(task) && task.projectName && task.projectName.toLowerCase() !== 'inbox')) && (
                        <div style={styles.taskDetails}>
                          {isTickTickTask(task) && task.projectName && task.projectName.toLowerCase() !== 'inbox' && (
                            <span style={{ ...styles.prioTag, color: 'var(--primary)', backgroundColor: 'rgba(139, 92, 246, 0.15)', fontSize: '9px' }}>
                              <LinkIcon size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                              {task.projectName}
                            </span>
                          )}

                          {task.emailRef && (
                            <button
                              style={styles.emailRefBtn}
                              onClick={() => onOpenEmail(task.emailRef)}
                              title="Open related email details"
                            >
                              <MailIcon size={11} style={{ marginRight: '4px' }} />
                              Mail Link
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={styles.taskActions}>
                      {!task.completed && !isTickTickTask(task) && (
                        <button
                          style={styles.scheduleBlockBtn}
                          className="glass-panel-interactive"
                          onClick={() => onScheduleTaskOnCalendar(task)}
                          title="Register this task as a block on your Calendar"
                        >
                          <CalendarIcon size={12} style={{ marginRight: '4px' }} />
                          Block Time
                        </button>
                      )}
                      {/* Due date sits at the middle-right of the row */}
                      {task.dueDate && (
                        <span style={{ ...styles.dueDateChip, ...getDueStyle(task) }}>
                          {formatDueLabel(task.dueDate)}
                        </span>
                      )}

                      {/* 3-dot menu: edit / delete */}
                      <div
                        data-task-menu-wrapper
                        style={styles.taskMenuWrapper}
                      >
                        <button
                          className="task-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuTaskId(openMenuTaskId === task.id ? null : task.id);
                          }}
                          title="Task options"
                        >
                          <MoreVerticalIcon size={16} />
                        </button>
                        {openMenuTaskId === task.id && (
                          <div style={styles.taskMenu} className="glass-panel">
                            <button
                              className="task-menu-item"
                              onClick={() => {
                                setOpenMenuTaskId(null);
                                openEdit(task);
                              }}
                            >
                              <EditIcon size={14} />
                              {task.completed ? 'View' : 'Edit'}
                            </button>
                            <button
                              className="task-menu-item task-menu-item-danger"
                              onClick={() => {
                                setOpenMenuTaskId(null);
                                onDeleteTask(task);
                              }}
                            >
                              <TrashIcon size={14} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Edit Task Modal */}
      {editingTask && (
        <div style={styles.ticktickModalOverlay} onClick={closeEdit}>
          <div style={styles.ticktickModal} className="glass-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <EditIcon size={16} />
                <h3 style={{ margin: 0, fontSize: '15px' }}>Edit Task</h3>
              </div>
              <button style={styles.closeModalBtn} onClick={closeEdit} title="Close">
                <CloseIcon size={14} />
              </button>
            </div>

            {isTickTickTask(editingTask) && (
              <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <LinkIcon size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                Synced with TickTick &mdash; title, priority and due date are saved to TickTick.
              </p>
            )}

            <form onSubmit={handleEditSubmit} style={styles.editForm}>
              <div style={styles.editField}>
                <span style={styles.settingLabel}>Title:</span>
                <div style={styles.suggestWrapper}>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => handleSuggestKeyDown(e, editSuggest, acceptEditSuggestion)}
                    style={styles.editInput}
                  />
                  {editSuggestOpen && (
                    <div style={styles.suggestDropdown} className="glass-panel">
                      <div style={styles.suggestHint}>Priority shortcuts</div>
                      {editSuggest.list.map((s, i) => {
                        const activeIdx = Math.min(suggestIdx, editSuggest.list.length - 1);
                        return (
                          <button
                            key={s.token}
                            type="button"
                            style={{
                              ...styles.suggestItem,
                              ...(i === activeIdx ? styles.suggestItemActive : {}),
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault(); // keep focus in the input
                              acceptEditSuggestion(s);
                            }}
                            onMouseEnter={() => setSuggestIdx(i)}
                          >
                            <span style={{ ...styles.suggestToken, color: getPriorityStyle(s.priority).color }}>
                              {s.token}
                            </span>
                            <span style={styles.suggestDesc}>{s.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.editField}>
                <span style={styles.settingLabel}>Priority:</span>
                <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={styles.composerSelect}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div style={styles.editField}>
                <span style={styles.settingLabel}>Due:</span>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  style={styles.datePicker}
                />
              </div>

              {!isTickTickTask(editingTask) && (
                <>
                  <div style={styles.editField}>
                    <span style={styles.settingLabel}>List:</span>
                    <select value={editListType} onChange={(e) => setEditListType(e.target.value)} style={styles.composerSelect}>
                      <option value="work">Work</option>
                      <option value="personal">Personal</option>
                      <option value="routine">Routine</option>
                    </select>
                  </div>

                  <div style={styles.editField}>
                    <span style={styles.settingLabel}>Duration:</span>
                    <select value={editDuration} onChange={(e) => setEditDuration(parseInt(e.target.value))} style={styles.composerSelect}>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hour</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" style={styles.cancelEditBtn} onClick={closeEdit}>
                  Cancel
                </button>
                <button type="submit" style={styles.saveEditBtn} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TickTick Connect Modal */}
      {showTickTickModal && (
        <div style={styles.ticktickModalOverlay} onClick={() => setShowTickTickModal(false)}>
          <div style={styles.ticktickModal} className="glass-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <LinkIcon size={16} />
              <h3 style={{ margin: 0, fontSize: '15px' }}>Connect TickTick</h3>
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Paste your TickTick personal API token. Get it from TickTick web:
              <br />
              <strong>Settings &rarr; Open API</strong> (token starts with <code>tp_</code>)
            </p>
            <form onSubmit={handleConnectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="password"
                required
                autoFocus
                placeholder="tp_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={ticktickToken}
                onChange={(e) => setTicktickToken(e.target.value)}
                style={styles.ticktickInput}
              />
              <button type="submit" style={styles.ticktickConnectBtn} disabled={isConnecting}>
                {isConnecting ? 'Connecting...' : 'Connect'}
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
    height: '100%',
    width: '100%',
    backgroundColor: 'var(--bg-secondary)',
  },
  ticktickModalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  ticktickModal: {
    width: '360px',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
  },
  ticktickInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'rgba(0,0,0,0.2)',
    fontSize: '13px',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  },
  ticktickConnectBtn: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    border: 'none',
    opacity: 1,
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
    color: 'var(--accent)',
    fontWeight: '600',
  },
  countBadge: {
    fontSize: '10px',
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: '2px 6px',
    borderRadius: '10px',
    color: 'var(--text-secondary)',
  },
  mainPanel: {
    flexGrow: 1,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    overflowY: 'auto',
  },
  composerCard: {
    padding: '16px 20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  composerFirstRow: {
    display: 'flex',
    gap: '12px',
  },
  taskInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.25)',
    border: '1px solid var(--border-color)',
    fontSize: '14px',
    color: 'var(--text-primary)',
  },
  addTaskBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    fontSize: '13.5px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)',
    transition: 'background-color 0.2s',
    ':hover': {
      backgroundColor: 'var(--primary-hover)',
    }
  },
  composerSecondRow: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  },
  settingGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  settingLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
  },
  composerSelect: {
    padding: '6px 10px',
    borderRadius: '6px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid var(--border-color)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  datePicker: {
    padding: '5px 10px',
    borderRadius: '6px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid var(--border-color)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  taskListContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  listTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '18px',
    fontWeight: '700',
    margin: 0,
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  taskSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingBottom: '6px',
    borderBottom: '1px solid var(--border-color)',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  emptyState: {
    padding: '60px 40px',
    textAlign: 'center',
    color: 'var(--text-muted)',
  },
  taskCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    gap: '16px',
  },
  dueDateChip: {
    fontSize: '11.5px',
    fontWeight: '600',
    minWidth: '62px',
    flexShrink: 0,
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  checkboxBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    color: '#ffffff',
    fontWeight: 'bold',
    transition: 'all 0.2s',
  },
  taskContent: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  taskTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  taskTitle: {
    fontSize: '14.5px',
    fontWeight: '500',
  },
  taskDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  prioTag: {
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: '12px',
  },
  detailText: {
    fontSize: '11.5px',
    color: 'var(--text-muted)',
  },
  emailRefBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '11px',
    color: 'var(--primary)',
    fontWeight: '600',
  },
  taskActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  scheduleBlockBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    fontSize: '11.5px',
    fontWeight: '600',
    color: '#ffffff',
    borderRadius: '6px',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  taskMenuWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  taskMenu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: '150px',
    padding: '6px',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
    zIndex: 100,
  },
  closeModalBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    borderRadius: '6px',
    color: 'var(--text-muted)',
    transition: 'color 0.2s, background-color 0.2s',
    ':hover': {
      color: 'var(--text-primary)',
      backgroundColor: 'rgba(255,255,255,0.06)',
    }
  },
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  editField: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  editInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid var(--border-color)',
    fontSize: '13px',
    color: 'var(--text-primary)',
  },
  suggestWrapper: {
    position: 'relative',
    flexGrow: 1,
    minWidth: 0,
  },
  suggestDropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    minWidth: '240px',
    padding: '4px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    boxShadow: '0 14px 34px rgba(0,0,0,0.45)',
    zIndex: 60,
  },
  suggestHint: {
    fontSize: '9.5px',
    fontWeight: '700',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    padding: '6px 10px 4px',
  },
  suggestItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  suggestItemActive: {
    backgroundColor: 'var(--primary-glow)',
  },
  suggestToken: {
    fontSize: '12.5px',
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  suggestDesc: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  cancelEditBtn: {
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  saveEditBtn: {
    flex: 2,
    padding: '10px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    border: 'none',
  },
  ticktickConnected: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid var(--border-color)',
    gap: '4px',
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: 'var(--text-secondary)',
    transition: 'all 0.2s',
    border: 'none',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.08)',
      color: 'var(--text-primary)',
    }
  },
  disconnectBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '8px',
    borderRadius: '6px',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    color: 'var(--danger)',
    fontSize: '11px',
    fontWeight: '600',
    transition: 'all 0.2s',
    border: 'none',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
    }
  }
};
