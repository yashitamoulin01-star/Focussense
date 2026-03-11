import { v4 as uuidv4 } from 'uuid';
import { saveSession, getSessionsByMode, saveActiveSession, getActiveSession } from '../../data/db.js';

// TimerEngine: State machine for session lifecycle
// States: idle → running → paused → completed
export function createSessionManager() {
    let state = {
        status: 'idle', // idle | running | paused | completed
        session: null,
        timerMode: 'stopwatch', // stopwatch | countdown | interval
        elapsedMs: 0,
        targetDurationMs: null, // used for countdown
        breakIntervals: [],
        currentBreakStart: null,
        timerInterval: null,
        startTimestamp: null,
        listeners: new Set(),
    };

    function notify() {
        const snapshot = getSnapshot();
        state.listeners.forEach(fn => fn(snapshot));
    }

    function persistState() {
        if (state.status === 'running' || state.status === 'paused') {
            saveActiveSession({
                status: state.status,
                session: state.session,
                timerMode: state.timerMode,
                elapsedMs: state.elapsedMs,
                targetDurationMs: state.targetDurationMs,
                breakIntervals: state.breakIntervals,
                currentBreakStart: state.currentBreakStart,
                // We don't save startTimestamp because it's relative to current run
                // elapsedMs is the absolute source of truth
            });
        } else {
            saveActiveSession(null);
        }
    }

    function getSnapshot() {
        let formattedTime = formatTime(state.elapsedMs);
        let remainingMs = 0;
        let isCompletedCountdown = false;

        if (state.targetDurationMs) {
            remainingMs = Math.max(0, state.targetDurationMs - state.elapsedMs);
            formattedTime = formatTime(remainingMs);
            if (state.elapsedMs >= state.targetDurationMs) {
                isCompletedCountdown = true;
            }
        }

        return {
            status: state.status,
            session: state.session ? { ...state.session } : null,
            timerMode: state.timerMode,
            elapsedMs: state.elapsedMs,
            targetDurationMs: state.targetDurationMs,
            remainingMs,
            isCompletedCountdown,
            breakIntervals: [...state.breakIntervals],
            formattedTime,
        };
    }

    function formatTime(ms) {
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function startSession(workMode, timerType, targetDurationMs = null) {
        if (state.status === 'running' || state.status === 'paused') return;

        const now = new Date();

        let timerMode = 'stopwatch';
        if (timerType === 'standard' && targetDurationMs) {
            timerMode = 'countdown';
        }

        state.session = {
            id: uuidv4(),
            workMode,
            mode: workMode, // Alias for data compatibility
            timerType,
            startTime: now.toISOString(),
            endTime: null,
            totalDurationMs: 0,
            breakIntervals: [],
            driftCount: 0,
            totalDriftMs: 0,
            longestFocusSegmentMs: 0,
            focusSegments: [],
            focusTimeline: [],
        };
        state.status = 'running';
        state.timerMode = timerMode;
        state.targetDurationMs = targetDurationMs;
        state.elapsedMs = 0;
        state.breakIntervals = [];
        state.startTimestamp = Date.now();
        state.currentBreakStart = null;

        state.timerInterval = setInterval(() => {
            if (state.status === 'running') {
                state.elapsedMs = Date.now() - state.startTimestamp - getTotalBreakMs();

                // If countdown finishes, auto-stop or mark completed
                if (state.timerMode === 'countdown' && state.elapsedMs >= state.targetDurationMs) {
                    state.elapsedMs = state.targetDurationMs; // clamp
                }

                // Persist state periodically (every 5s roughly)
                if (Math.floor(state.elapsedMs / 1000) % 5 === 0) {
                    persistState();
                }

                notify();
            }
        }, 100);

        persistState();
        notify();
        return state.session;
    }

    function getTotalBreakMs() {
        let total = 0;
        for (const b of state.breakIntervals) {
            total += (b.end || Date.now()) - b.start;
        }
        if (state.currentBreakStart) {
            total += Date.now() - state.currentBreakStart;
        }
        return total;
    }

    function pauseSession() {
        if (state.status !== 'running') return;
        state.status = 'paused';
        state.currentBreakStart = Date.now();
        persistState();
        notify();
    }

    function resumeSession() {
        if (state.status !== 'paused') return;
        if (state.currentBreakStart) {
            state.breakIntervals.push({
                start: state.currentBreakStart,
                end: Date.now(),
            });
            state.currentBreakStart = null;
        }
        state.status = 'running';
        // When resuming, we need to reset startTimestamp to account for the gap
        state.startTimestamp = Date.now() - state.elapsedMs - getTotalBreakMs();
        persistState();
        notify();
    }

    function stopSession(driftEvents = []) {
        if (state.status === 'idle' || state.status === 'completed') return null;

        if (state.currentBreakStart) {
            state.breakIntervals.push({
                start: state.currentBreakStart,
                end: Date.now(),
            });
            state.currentBreakStart = null;
        }

        clearInterval(state.timerInterval);
        state.timerInterval = null;

        const now = new Date();
        const totalDurationMs = state.elapsedMs;

        // Compute focus segments from drift events
        const segments = computeFocusSegments(
            new Date(state.session.startTime).getTime(),
            now.getTime(),
            driftEvents
        );

        const longestSegment = segments.reduce((max, s) => Math.max(max, s.duration), 0);

        state.session.endTime = now.toISOString();
        state.session.totalDurationMs = totalDurationMs;
        state.session.durationMinutes = Math.round(totalDurationMs / 60000);
        state.session.breakIntervals = state.breakIntervals.map(b => ({
            start: new Date(b.start).toISOString(),
            end: new Date(b.end).toISOString(),
            durationMs: b.end - b.start,
        }));
        state.session.driftCount = driftEvents.length;
        state.session.totalDriftMs = driftEvents.reduce((sum, d) => sum + (d.durationMs || 0), 0);
        state.session.longestFocusSegmentMs = longestSegment;
        state.session.focusSegments = segments;

        state.status = 'completed';
        const completedSession = { ...state.session };
        saveSession(completedSession);
        persistState(); // This will clear active session
        notify();
        return completedSession;
    }

    function computeFocusSegments(sessionStart, sessionEnd, driftEvents) {
        if (driftEvents.length === 0) {
            return [{ start: sessionStart, end: sessionEnd, duration: sessionEnd - sessionStart }];
        }

        const sorted = [...driftEvents].sort((a, b) => a.timestamp - b.timestamp);
        const segments = [];
        let cursor = sessionStart;

        for (const drift of sorted) {
            const driftStart = drift.timestamp;
            const driftEnd = driftStart + (drift.durationMs || 0);
            if (driftStart > cursor) {
                segments.push({ start: cursor, end: driftStart, duration: driftStart - cursor });
            }
            cursor = driftEnd;
        }

        if (cursor < sessionEnd) {
            segments.push({ start: cursor, end: sessionEnd, duration: sessionEnd - cursor });
        }

        return segments;
    }

    function resetSession() {
        if (state.timerInterval) clearInterval(state.timerInterval);
        state.status = 'idle';
        state.session = null;
        state.timerMode = 'stopwatch';
        state.targetDurationMs = null;
        state.elapsedMs = 0;
        state.breakIntervals = [];
        state.currentBreakStart = null;
        state.timerInterval = null;
        state.startTimestamp = null;
        persistState();
        notify();
    }

    function hydrateSession() {
        const saved = getActiveSession();
        if (!saved) return false;

        state.status = saved.status;
        state.session = saved.session;
        state.timerMode = saved.timerMode;
        state.elapsedMs = saved.elapsedMs;
        state.targetDurationMs = saved.targetDurationMs;
        state.breakIntervals = saved.breakIntervals;
        state.currentBreakStart = saved.currentBreakStart;

        // Reconstruct startTimestamp for the interval logic
        const totalBreakMs = getTotalBreakMs();
        state.startTimestamp = Date.now() - state.elapsedMs - totalBreakMs;

        // Restart timer interval if it was running
        if (state.status === 'running' || state.status === 'paused') {
            state.timerInterval = setInterval(() => {
                if (state.status === 'running') {
                    state.elapsedMs = Date.now() - state.startTimestamp - getTotalBreakMs();
                    if (state.timerMode === 'countdown' && state.elapsedMs >= state.targetDurationMs) {
                        state.elapsedMs = state.targetDurationMs;
                    }
                    if (Math.floor(state.elapsedMs / 1000) % 5 === 0) {
                        persistState();
                    }
                    notify();
                }
            }, 100);
        }

        notify();
        return true;
    }

    function subscribe(fn) {
        state.listeners.add(fn);
        return () => state.listeners.delete(fn);
    }

    function recordFocusTick(score, label) {
        if (state.status !== 'running' || !state.session) return;
        state.session.focusTimeline.push({
            t: Math.floor(state.elapsedMs / 1000), // store as seconds
            score,
            label
        });
    }

    return {
        startSession,
        pauseSession,
        resumeSession,
        stopSession,
        resetSession,
        getSnapshot,
        subscribe,
        recordFocusTick,
        hydrateSession,
    };
}
