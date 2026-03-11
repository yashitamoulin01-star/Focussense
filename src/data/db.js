// FocusSense Data Layer — localStorage-backed persistence
// Mirrors the planned schema: Sessions, DriftEvents, ModeHistory, AggregatedStats

// NOTE: No seed imports here. A fresh install is completely clean.
// Planner intelligence comes from basePlanner.js (calibrated priors), not fake history.


const STORAGE_KEYS = {
  SESSIONS: 'focussense_sessions',
  DRIFT_EVENTS: 'focussense_drift_events',
  MODE_HISTORY: 'focussense_mode_history',
  SETTINGS: 'focussense_settings',
  ACTIVE_SESSION: 'focussense_active_session',
  FOCUS_PROFILE: 'focussense_focus_profile',
  ACTIVITY_EVENTS: 'focussense_activity_events', // Phase 12 Raw Pipeline
  AGENT_HEARTBEAT: 'focussense_agent_heartbeat', // Phase 12 Connection State
};

const DEFAULT_FOCUS_PROFILE = {
  version: 1,
  updatedAt: new Date().toISOString(),
  // taskHistory starts EMPTY — populated only from real completed sessions.
  // Never seeded, never bootstrapped, never imported from mock data.
  taskHistory: [],
  learningStats: {},
  preferredDurations: {
    reading:    { easy: 40, medium: 40, hard: 35 },
    coding:     { easy: 50, medium: 45, hard: 45 },
    assignment: { easy: 40, medium: 35, hard: 30 },
    working:    { easy: 35, medium: 30, hard: 25 },
  },
  successRates: {},
  commonBlockers: {},
  breakPreferences: {
    reading: { recommendedAfterMin: 40 },
    coding:  { recommendedAfterMin: 50 }
  }
};

function load(key, defaultValue = []) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// Sessions CRUD
export function getAllSessions() {
  return load(STORAGE_KEYS.SESSIONS);
}

export function getSessionById(id) {
  return getAllSessions().find(s => s.id === id) || null;
}

export function saveSession(session) {
  const sessions = getAllSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.push(session);
  }
  save(STORAGE_KEYS.SESSIONS, sessions);
  return session;
}

export function deleteSessions(ids) {
  const sessions = getAllSessions().filter(s => !ids.includes(s.id));
  save(STORAGE_KEYS.SESSIONS, sessions);
}

export function getSessionsByMode(mode) {
  return getAllSessions().filter(s => s.mode === mode);
}

export function getSessionsInRange(startDate, endDate) {
  return getAllSessions().filter(s => {
    const t = new Date(s.startTime).getTime();
    return t >= startDate.getTime() && t <= endDate.getTime();
  });
}

// Drift Events
export function getDriftEventsForSession(sessionId) {
  return load(STORAGE_KEYS.DRIFT_EVENTS).filter(e => e.sessionId === sessionId);
}

export function saveDriftEvent(event) {
  const events = load(STORAGE_KEYS.DRIFT_EVENTS);
  events.push(event);
  save(STORAGE_KEYS.DRIFT_EVENTS, events);
  return event;
}

// Mode History
export function getModeHistory() {
  return load(STORAGE_KEYS.MODE_HISTORY);
}

export function logModeUsage(mode) {
  const history = getModeHistory();
  history.push({ mode, timestamp: new Date().toISOString() });
  save(STORAGE_KEYS.MODE_HISTORY, history);
}

// Settings
export function getSettings() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : { theme: 'deep', idleThreshold: 60 };
  } catch {
    return { theme: 'deep', idleThreshold: 60 };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

// Active Session Persistence (Recovery)
export function getActiveSession() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveActiveSession(sessionData) {
  if (sessionData) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(sessionData));
  } else {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
  }
}


export function getFocusProfile() {
  const profile = load(STORAGE_KEYS.FOCUS_PROFILE, DEFAULT_FOCUS_PROFILE);
  // Wipe legacy seeded training data from localStorage if it exists (>500 items is a dead giveaway)
  if (profile && profile.taskHistory && profile.taskHistory.length > 500) {
    save(STORAGE_KEYS.FOCUS_PROFILE, { ...DEFAULT_FOCUS_PROFILE, updatedAt: new Date().toISOString() });
    return DEFAULT_FOCUS_PROFILE;
  }
  return profile;
}

// ─── One-time aggressive cleanup for legacy pre-loaded data ───
try {
  // If the user's browser still has the 1MB of mock data from the initial prompt, delete it.
  localStorage.removeItem('focussense_fake_training_data');
  localStorage.removeItem('focussense_seed_history');
} catch (e) {
  // Ignored
}



export function saveFocusProfile(profile) {
  save(STORAGE_KEYS.FOCUS_PROFILE, { ...profile, updatedAt: new Date().toISOString() });
}

// Export all data as JSON
export function exportAllData() {
  return {
    sessions: getAllSessions(),
    driftEvents: load(STORAGE_KEYS.DRIFT_EVENTS),
    modeHistory: getModeHistory(),
    settings: getSettings(),
    focusProfile: getFocusProfile(),
    exportedAt: new Date().toISOString(),
  };
}

// Import data from JSON
export function importData(jsonData) {
  try {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

    if (data.focusProfile) {
      saveFocusProfile(data.focusProfile);
    }

    if (data.sessions) {
      const existing = getAllSessions();
      const existingIds = new Set(existing.map(s => s.id));
      const toAdd = data.sessions.filter(s => !existingIds.has(s.id));
      save(STORAGE_KEYS.SESSIONS, [...existing, ...toAdd]);
    }

    if (data.driftEvents) {
      const existing = load(STORAGE_KEYS.DRIFT_EVENTS);
      const existingIds = new Set(existing.map(e => e.id || `${e.sessionId}_${e.startTimestamp}`));
      const toAdd = data.driftEvents.filter(e => !existingIds.has(e.id || `${e.sessionId}_${e.startTimestamp}`));
      save(STORAGE_KEYS.DRIFT_EVENTS, [...existing, ...toAdd]);
    }

    if (data.settings && data.settings.theme) {
      saveSettings(data.settings);
    }

    return { success: true, addedSessions: data.sessions?.length || 0 };
  } catch (e) {
    console.error('Import failed', e);
    return { success: false, error: e.message };
  }
}

// --- Phase 12: Event Pipeline (Desktop Agent) ---
export function logActivityEvent(event) {
  const events = load(STORAGE_KEYS.ACTIVITY_EVENTS, []);
  events.push({ ...event, timestamp: new Date().toISOString() });
  // Keep only the last 2000 events to prevent localStorage overflow
  if (events.length > 2000) events.splice(0, events.length - 2000);
  save(STORAGE_KEYS.ACTIVITY_EVENTS, events);
}

export function getActivityEvents() {
  return load(STORAGE_KEYS.ACTIVITY_EVENTS, []);
}

export function clearActivityEvents() {
  save(STORAGE_KEYS.ACTIVITY_EVENTS, []);
}

export function saveAgentHeartbeat(status) {
  save(STORAGE_KEYS.AGENT_HEARTBEAT, { status, lastSeen: new Date().toISOString() });
}

export function getAgentHeartbeat() {
  return load(STORAGE_KEYS.AGENT_HEARTBEAT, { status: 'offline', lastSeen: null });
}

// Clear all data
export function clearAllData() {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
}
