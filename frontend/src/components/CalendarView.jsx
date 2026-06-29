import React, { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, ClockIcon, InfoIcon } from './Icons';

export default function CalendarView({
  events,
  onAddEvent,
  onRemoveEvent,
  connectedAccounts,
  onTriggerNotification,
  preFilledEvent,
  clearPreFilledEvent
}) {
  const [selectedDay, setSelectedDay] = useState('Mon');
  const [showEventModal, setShowEventModal] = useState(false);
  
  // Form State
  const [modalTitle, setModalTitle] = useState('');
  const [modalDay, setModalDay] = useState('Mon');
  const [modalStartHour, setModalStartHour] = useState(9); // 24h number, e.g. 9 = 9:00 AM
  const [modalStartMin, setModalStartMin] = useState(0);
  const [modalDuration, setModalDuration] = useState(60); // minutes
  const [modalCategory, setModalCategory] = useState('work'); // work, email, routine, personal, health
  
  // Placement Mode for Routines
  const [placementRoutine, setPlacementRoutine] = useState(null); // the routine details if placing

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]; // 8 AM to 9 PM

  const routines = [
    { id: 'r_inbox', title: 'Inbox Zero Triage', duration: 45, category: 'email', color: '#3b82f6', desc: 'Sort, reply, archive all mail inboxes.' },
    { id: 'r_deep', title: 'Deep Work Block', duration: 120, category: 'work', color: '#8b5cf6', desc: 'Uninterrupted deep focus time.' },
    { id: 'r_exercise', title: 'Exercise & Health', duration: 60, category: 'health', color: '#10b981', desc: 'Workout, yoga, run, or mental break.' },
    { id: 'r_sync', title: 'Routine Planning', duration: 90, category: 'routine', color: '#f59e0b', desc: 'Plan weekly agenda and tasks.' },
  ];

  // Handle outside prefilled event (e.g. from converting email/task to calendar block)
  useEffect(() => {
    if (preFilledEvent) {
      setModalTitle(preFilledEvent.title || '');
      setModalDay(preFilledEvent.day || 'Mon');
      setModalStartHour(preFilledEvent.startHour || 9);
      setModalStartMin(preFilledEvent.startMin || 0);
      setModalDuration(preFilledEvent.duration || 60);
      setModalCategory(preFilledEvent.category || 'work');
      setShowEventModal(true);
      clearPreFilledEvent();
    }
  }, [preFilledEvent]);

  const handleRoutineClick = (routine) => {
    setPlacementRoutine(routine);
    onTriggerNotification(`Click any timeslot on the calendar grid to place "${routine.title}"`);
  };

  const handleCellClick = (day, hour) => {
    if (placementRoutine) {
      // Place routine immediately
      const newEv = {
        id: 'ev_' + Date.now(),
        title: placementRoutine.title,
        day: day,
        startHour: hour,
        startMin: 0,
        duration: placementRoutine.duration,
        category: placementRoutine.category,
      };
      onAddEvent(newEv);
      onTriggerNotification(`Scheduled "${placementRoutine.title}" for ${day} at ${hour}:00`);
      setPlacementRoutine(null);
    } else {
      // Open modal
      setModalTitle('');
      setModalDay(day);
      setModalStartHour(hour);
      setModalStartMin(0);
      setModalDuration(60);
      setModalCategory('work');
      setShowEventModal(true);
    }
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!modalTitle.trim()) return;

    const newEv = {
      id: 'ev_' + Date.now(),
      title: modalTitle,
      day: modalDay,
      startHour: parseInt(modalStartHour),
      startMin: parseInt(modalStartMin),
      duration: parseInt(modalDuration),
      category: modalCategory,
    };

    onAddEvent(newEv);
    setShowEventModal(false);
    onTriggerNotification(`Event "${modalTitle}" created successfully!`);
  };

  const formatHourLabel = (h) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour} ${period}`;
  };

  const getEventStyle = (ev) => {
    // Math to position event absolute
    const hourHeight = 60; // 60px per hour
    const startHourOffset = ev.startHour - 8; // grid starts at 8 AM
    const minutesOffset = ev.startMin / 60;
    
    const top = (startHourOffset + minutesOffset) * hourHeight;
    const height = (ev.duration / 60) * hourHeight;

    let bg = 'var(--primary-glow)';
    let border = 'rgba(139, 92, 246, 0.4)';
    let text = '#c084fc';

    switch (ev.category) {
      case 'email':
        bg = 'rgba(59, 130, 246, 0.15)';
        border = '#3b82f6';
        text = '#60a5fa';
        break;
      case 'work':
        bg = 'rgba(139, 92, 246, 0.15)';
        border = '#8b5cf6';
        text = '#a78bfa';
        break;
      case 'health':
        bg = 'rgba(16, 185, 129, 0.15)';
        border = '#10b981';
        text = '#34d399';
        break;
      case 'routine':
        bg = 'rgba(245, 158, 11, 0.15)';
        border = '#f59e0b';
        text = '#fbbf24';
        break;
      case 'personal':
        bg = 'rgba(236, 72, 153, 0.15)';
        border = '#ec4899';
        text = '#f472b6';
        break;
    }

    return {
      position: 'absolute',
      top: `${top}px`,
      height: `${height}px`,
      left: '4px',
      right: '4px',
      backgroundColor: bg,
      borderLeft: `3px solid ${border}`,
      borderTop: `1px solid ${border}55`,
      borderRight: `1px solid ${border}55`,
      borderBottom: `1px solid ${border}55`,
      borderRadius: '4px',
      padding: '4px 6px',
      boxSizing: 'border-box',
      fontSize: '11.5px',
      color: text,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      zIndex: 2,
      transition: 'transform 0.15s, box-shadow 0.15s',
      cursor: 'default',
    };
  };

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* Sidebar: Routine Blocks Palette */}
      <div style={styles.sidebar}>
        <button style={styles.newEventBtn} onClick={() => {
          setModalTitle('');
          setModalDay('Mon');
          setModalStartHour(9);
          setModalStartMin(0);
          setModalDuration(60);
          setModalCategory('work');
          setShowEventModal(true);
        }}>
          <PlusIcon size={16} style={{ marginRight: '8px' }} />
          Create Event
        </button>

        <div style={styles.sidebarSection}>
          <div style={styles.sectionHeaderRow}>
            <span>ROUTINE BLOCKING</span>
            <InfoIcon size={12} style={{color: 'var(--text-muted)'}} title="Select a routine block below, then click a slot on the calendar to reserve routine hours." />
          </div>
          <p style={styles.sectionDesc}>
            Click a preset block below, then click any time slot on the calendar grid to block time.
          </p>

          <div style={styles.routineList}>
            {routines.map((r) => (
              <div
                key={r.id}
                style={{
                  ...styles.routineCard,
                  ...(placementRoutine?.id === r.id ? styles.routineCardPlacing : {}),
                  borderLeft: `4px solid ${r.color}`
                }}
                className="glass-panel-interactive"
                onClick={() => handleRoutineClick(r)}
              >
                <div style={styles.routineCardHeader}>
                  <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{r.title}</strong>
                  <span style={styles.routineDurationBadge}>{r.duration}m</span>
                </div>
                <div style={styles.routineDesc}>{r.desc}</div>
                <button style={styles.routineScheduleBtn}>
                  {placementRoutine?.id === r.id ? 'Click Grid Cell' : 'Block Time'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {placementRoutine && (
          <div style={styles.placingAlert} className="glass-panel">
            <span style={{ fontSize: '12px' }}>
              Placing: <strong>{placementRoutine.title}</strong>
            </span>
            <button 
              style={styles.cancelPlaceBtn} 
              onClick={() => setPlacementRoutine(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Main Grid: Google Calendar week view */}
      <div style={styles.calendarGrid}>
        {/* Calendar Week Header */}
        <div style={styles.gridHeader}>
          <div style={styles.timeColumnHeader} />
          {days.map((day) => {
            const isToday = day === 'Mon'; // Simulated: today is Monday
            return (
              <div key={day} style={styles.dayColumnHeader}>
                <span style={{
                  ...styles.dayLabel,
                  ...(isToday ? styles.dayLabelToday : {})
                }}>{day}</span>
              </div>
            );
          })}
        </div>

        {/* Scrollable grid area */}
        <div style={styles.gridScrollContainer}>
          <div style={styles.gridBody}>
            {/* Left timeline column */}
            <div style={styles.timeColumn}>
              {hours.map((h) => (
                <div key={h} style={styles.timeCell}>
                  <span style={styles.timeLabel}>{formatHourLabel(h)}</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((day) => (
              <div key={day} style={styles.dayColumn}>
                {/* Hourly slots grid backgrounds */}
                {hours.map((h) => (
                  <div
                    key={h}
                    style={styles.gridCell}
                    onClick={() => handleCellClick(day, h)}
                    title={`Block hour starting ${h}:00 on ${day}`}
                  />
                ))}

                {/* Absolute events inside this day column */}
                {events.filter((ev) => ev.day === day).map((ev) => (
                  <div 
                    key={ev.id} 
                    style={getEventStyle(ev)}
                    className="event-block-hover"
                  >
                    <div style={styles.eventTitleRow}>
                      <span style={{ fontWeight: '600' }}>{ev.title}</span>
                      <button 
                        style={styles.deleteEventBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveEvent(ev.id);
                          onTriggerNotification(`Removed block: "${ev.title}"`);
                        }}
                        title="Delete Time Block"
                      >
                        &times;
                      </button>
                    </div>
                    <div style={styles.eventTimeLabel}>
                      {ev.startHour}:{ev.startMin < 10 ? '0' + ev.startMin : ev.startMin} &bull; {ev.duration}m
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Block Event Modal */}
      {showEventModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal} className="glass-panel animate-slide-up">
            <h3 style={styles.modalTitle}>Reserve Calendar Block</h3>
            
            <form onSubmit={handleModalSubmit} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Event Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Project Setup Review"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.label}>Day</label>
                  <select
                    value={modalDay}
                    onChange={(e) => setModalDay(e.target.value)}
                    style={styles.select}
                  >
                    {days.map((d) => (
                      <option key={d} value={d} style={styles.option}>{d}</option>
                    ))}
                  </select>
                </div>

                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.label}>Category</label>
                  <select
                    value={modalCategory}
                    onChange={(e) => setModalCategory(e.target.value)}
                    style={styles.select}
                  >
                    <option value="work" style={styles.option}>Work Focus</option>
                    <option value="email" style={styles.option}>Email Triage</option>
                    <option value="routine" style={styles.option}>Routine Setup</option>
                    <option value="health" style={styles.option}>Health & Break</option>
                    <option value="personal" style={styles.option}>Personal Block</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.label}>Start Hour</label>
                  <select
                    value={modalStartHour}
                    onChange={(e) => setModalStartHour(parseInt(e.target.value))}
                    style={styles.select}
                  >
                    {hours.map((h) => (
                      <option key={h} value={h} style={styles.option}>{formatHourLabel(h)}</option>
                    ))}
                  </select>
                </div>

                <div style={{ ...styles.formGroup, flex: 1 }}>
                  <label style={styles.label}>Duration</label>
                  <select
                    value={modalDuration}
                    onChange={(e) => setModalDuration(parseInt(e.target.value))}
                    style={styles.select}
                  >
                    <option value={30} style={styles.option}>30 Minutes</option>
                    <option value={45} style={styles.option}>45 Minutes</option>
                    <option value={60} style={styles.option}>1 Hour</option>
                    <option value={90} style={styles.option}>1.5 Hours</option>
                    <option value={120} style={styles.option}>2 Hours</option>
                    <option value={180} style={styles.option}>3 Hours</option>
                  </select>
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  style={styles.cancelBtn}
                  onClick={() => setShowEventModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.saveBtn}>
                  Block Slot
                </button>
              </div>
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
  sidebar: {
    width: '240px',
    borderRight: '1px solid var(--border-color)',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    backgroundColor: 'var(--bg-primary)',
    boxSizing: 'border-box',
  },
  newEventBtn: {
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
  sidebarSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '10.5px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    letterSpacing: '1px',
  },
  sectionDesc: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: '1.45',
    margin: 0,
  },
  routineList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    maxHeight: '420px',
    paddingRight: '4px',
  },
  routineCard: {
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  routineCardPlacing: {
    backgroundColor: 'var(--bg-card-hover)',
    borderColor: 'var(--primary)',
    boxShadow: '0 0 10px rgba(139, 92, 246, 0.15)',
  },
  routineCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routineDurationBadge: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: 'var(--text-secondary)',
  },
  routineDesc: {
    fontSize: '10.5px',
    color: 'var(--text-muted)',
    lineHeight: '1.4',
  },
  routineScheduleBtn: {
    alignSelf: 'flex-start',
    marginTop: '6px',
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--primary)',
    padding: '2px 0',
  },
  placingAlert: {
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    border: '1px solid var(--primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: 'var(--text-primary)',
  },
  cancelPlaceBtn: {
    fontSize: '10.5px',
    fontWeight: '600',
    color: 'var(--danger)',
  },
  calendarGrid: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  gridHeader: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    paddingRight: '6px', // offset for scrollbar
  },
  timeColumnHeader: {
    width: '60px',
    flexShrink: 0,
    borderRight: '1px solid var(--border-color)',
  },
  dayColumnHeader: {
    flex: 1,
    padding: '12px 0',
    textAlign: 'center',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'center',
  },
  dayLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  dayLabelToday: {
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    boxShadow: '0 0 10px rgba(139, 92, 246, 0.4)',
  },
  gridScrollContainer: {
    flexGrow: 1,
    overflowY: 'auto',
    position: 'relative',
  },
  gridBody: {
    display: 'flex',
    minHeight: '840px', // 14 hours * 60px = 840px
    position: 'relative',
  },
  timeColumn: {
    width: '60px',
    flexShrink: 0,
    borderRight: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
  },
  timeCell: {
    height: '60px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingRight: '8px',
    paddingTop: '4px',
    boxSizing: 'border-box',
  },
  timeLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  dayColumn: {
    flex: 1,
    borderRight: '1px solid var(--border-color)',
    position: 'relative',
    height: '840px',
    boxSizing: 'border-box',
  },
  gridCell: {
    height: '60px',
    borderBottom: '1px dotted rgba(255, 255, 255, 0.03)',
    cursor: 'cell',
    transition: 'background-color 0.1s',
    ':hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.01)',
    }
  },
  eventTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  deleteEventBtn: {
    fontSize: '12px',
    color: 'inherit',
    lineHeight: '1',
    cursor: 'pointer',
    padding: '0 2px',
    transition: 'opacity 0.2s',
    opacity: 0.6,
    ':hover': {
      opacity: 1,
    }
  },
  eventTimeLabel: {
    fontSize: '9.5px',
    opacity: 0.8,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  modal: {
    width: '360px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
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
    fontSize: '11px',
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
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'rgba(0,0,0,0.2)',
    color: 'var(--text-primary)',
    fontSize: '13.5px',
    cursor: 'pointer',
  },
  option: {
    background: '#11141b',
    color: '#ffffff',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '10px',
  },
  cancelBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
  },
  saveBtn: {
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#ffffff',
    backgroundColor: 'var(--primary)',
    fontWeight: '600',
  }
};
