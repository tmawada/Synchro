import React, { useState, useMemo } from 'react';
import { PlusIcon, TrashIcon, CheckSquareIcon, CalendarIcon, InfoIcon, MailIcon, SettingsIcon, RefreshIcon, LinkIcon, UnlinkIcon, EditIcon, CloseIcon } from './Icons';

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

  const isTickTickTask = (task) => task.source === 'ticktick';

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    if (!ticktickToken.trim() || isConnecting) return;
    setIsConnecting(true);
    await onConnectTickTick(ticktickToken.trim());
    setIsConnecting(false);
    setShowTickTickModal(false);
    setTicktickToken('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask = {
      id: 'task_' + Date.now(),
      title,
      priority,
      listType,
      duration: parseInt(duration),
      dueDate: dueDate || new Date().toISOString().split('T')[0],
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
    setEditDueDate(task.dueDate);
  };

  const closeEdit = () => {
    setEditingTask(null);
    setIsSaving(false);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim() || isSaving) return;

    const fromTickTick = isTickTickTask(editingTask);
    const patch = {
      title: editTitle.trim(),
      priority: editPriority,
      dueDate: editDueDate || editingTask.dueDate,
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
            <span style={{ ...styles.prioTag, color: 'var(--text-primary)', fontSize: '11px', padding: '2px 6px', borderRadius: '6px', marginRight: '8px' }}>
              <LinkIcon size={12} style={{ marginRight: '4px' }} /> Connected
            </span>
            <button
              style={{ ...styles.scheduleBlockBtn, padding: '4px 8px', fontSize: '10px', marginLeft: '8px', backgroundColor: 'rgba(255,255,255,0.02)' }}
              onClick={onDisconnectTickTick}
              title="Disconnect TickTick"
            >
              <TrashIcon size={12} /> Disconnect
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
              <input
                type="text"
                required
                placeholder="What is your next task task?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={styles.taskInput}
              />
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
              filteredTasks.map((task) => {
                const prio = getPriorityStyle(task.priority);
                return (
                  <div key={task.id} style={styles.taskCard} className="glass-panel">
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
                      <span style={{
                        ...styles.taskTitle,
                        textDecoration: task.completed ? 'line-through' : 'none',
                        color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)'
                      }}>
                        {task.title}
                      </span>
                      
                      <div style={styles.taskDetails}>
                        <span style={{ ...styles.prioTag, color: prio.color, backgroundColor: prio.bg }}>
                          {task.priority}
                        </span>
                        <span style={styles.detailText}>
                          Due: {task.dueDate}
                        </span>
                        <span style={styles.detailText}>
                          Est: {task.duration} mins
                        </span>

                        {isTickTickTask(task) && task.projectName && (
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
                      <button
                        style={styles.editBtn}
                        className="glass-panel-interactive"
                        onClick={() => openEdit(task)}
                        title="Edit Task"
                      >
                        <EditIcon size={14} />
                      </button>
                      <button
                        style={styles.deleteBtn}
                        onClick={() => onDeleteTask(task)}
                        title={isTickTickTask(task) ? 'Delete from TickTick' : 'Delete Task'}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
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
                <input
                  type="text"
                  required
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={styles.editInput}
                />
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
    flexGrow: 1,
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
    gap: '10px',
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
  deleteBtn: {
    padding: '6px',
    borderRadius: '6px',
    color: 'var(--text-muted)',
    transition: 'color 0.2s, background-color 0.2s',
    ':hover': {
      color: 'var(--danger)',
      backgroundColor: 'rgba(239,68,68,0.05)',
    }
  },
  editBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px',
    borderRadius: '6px',
    color: 'var(--text-muted)',
    transition: 'color 0.2s, background-color 0.2s',
    ':hover': {
      color: 'var(--primary)',
      backgroundColor: 'rgba(139, 92, 246, 0.08)',
    }
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
    flexGrow: 1,
    padding: '9px 12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid var(--border-color)',
    fontSize: '13px',
    color: 'var(--text-primary)',
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
    alignItems: 'center',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid var(--border-color)',
  }
};
