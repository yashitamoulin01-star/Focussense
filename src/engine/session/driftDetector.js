import { logActivityEvent, saveAgentHeartbeat } from '../../data/db.js';
import { relayClient } from './relay.js';

// Attention Drift Detection Engine
// Monitors: tab visibility changes, mouse/keyboard idle within app
// Records drift events using a smoothed rolling focus score

export function createDriftDetector() {
    let state = {
        isTracking: false,
        isDrifting: false, // Legacy boolean for backward compatibility
        driftCount: 0,
        totalDriftMs: 0,
        events: [], // { startTimestamp, endTimestamp, reason }

        // New Score Model State
        focusScore: 100,
        focusLabel: 'Focused',
        monitoringSource: 'Local activity monitoring',
        modeId: 'coding',
        modeLabel: 'Coding',

        // Internal Tracking buffers
        keyBuffer: [], // Timestamps of keypresses in last 60s
        keyPatternBuffer: [], // For WASD detection
        lastActivityAt: Date.now(), // Mouse or keyboard
        lastFocusLostAt: null, // For blur duration tracking
        stabilityIndex: 1.0, // (Total Time - Total Drift Time) / Total Time
        isRelayConnected: false, // Legacy boolean
        relayStatus: 'idle', // New: granular status string
    };

    let tickInterval = null;
    let unsubscribers = [];
    let subscribers = new Set();
    let currentRules = {};

    let latestExtensionState = null;

    function setupRelay() {
        relayClient.subscribeStatus(status => {
            state.relayStatus = status;
            state.isRelayConnected = status === 'connected';
            saveAgentHeartbeat(state.isRelayConnected ? 'online' : 'offline');
            notify();
        });

        relayClient.subscribe(data => {
            if (data.type === 'window_activity') {
                latestExtensionState = data;
                state.lastActivityAt = Date.now();
                logActivityEvent(data);
            }
        });

        relayClient.connect();
    }

    const notify = () => subscribers.forEach(fn => fn(getSnapshot()));

    function getSnapshot() {
        return {
            ...state,
            events: [...state.events],
            keyBuffer: undefined, // Hide buffers from snapshot
            keyPatternBuffer: undefined,
            agentConnected: state.isRelayConnected,
            relayStatus: state.relayStatus,
        };
    }

    function subscribe(fn) {
        subscribers.add(fn);
        fn(getSnapshot());
        return () => subscribers.delete(fn);
    }

    function updateFocusLabel(score) {
        if (score >= 80) return 'Focused';
        if (score >= 60) return 'Slight distraction';
        if (score >= 35) return 'Unstable focus';
        return 'Drift detected';
    }

    function startTracking(modeId, modeProfile) {
        state.isTracking = true;
        state.modeId = modeId || 'coding';
        state.modeLabel = modeProfile?.label || 'Custom';
        state.focusScore = 100;
        state.focusLabel = 'Focused';
        state.lastActivityAt = Date.now();
        state.lastFocusLostAt = null;
        state.sessionStartTime = Date.now();
        state.stabilityIndex = 1.0;
        state.sustainedSuspicionCounter = 0; // ← fix: always reset on start
        state.driftCooldownActive = false;
        state.lastDriftCorrectionTime = null;

        const profile = modeProfile || { driftRules: {} };
        currentRules = profile.driftRules || {};
        const disableDriftDetection = profile.disableDriftDetection || false;

        if (disableDriftDetection) {
            notify();
            return; // Gaming mode or disabled — no tracking hooks
        }

        // 1) Window Visibility / Blur Tracking
        const onBlur = () => { if (!state.lastFocusLostAt) state.lastFocusLostAt = Date.now(); };
        const onFocus = () => { state.lastFocusLostAt = null; state.lastActivityAt = Date.now(); };
        const onVisibility = () => { document.hidden ? onBlur() : onFocus(); };

        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);

        // 2) Keyboard Tracking
        const onKeyDown = (e) => {
            const t = Date.now();
            state.lastActivityAt = t;
            state.keyBuffer.push(t);
            state.keyBuffer = state.keyBuffer.filter(x => t - x <= 60000); // 60s memory

            if (currentRules.penalizeGamingKeys) {
                const k = (e.key || '').toLowerCase();
                if (['w', 'a', 's', 'd'].includes(k)) {
                    state.keyPatternBuffer.push({ t, key: k });
                    state.keyPatternBuffer = state.keyPatternBuffer.filter(x => t - x.t <= 10000);
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);

        // 3) Mouse Tracking (just sets last activity)
        let lastMouseMoveHandled = 0;
        const onMouseMove = () => {
            const now = Date.now();
            // Throttle mouse updates to avoid flooding
            if (now - lastMouseMoveHandled > 1000) {
                state.lastActivityAt = now;
                lastMouseMoveHandled = now;
            }
        };
        const onMouseDown = () => { state.lastActivityAt = Date.now(); };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mousedown', onMouseDown);

        unsubscribers = [
            () => window.removeEventListener('blur', onBlur),
            () => window.removeEventListener('focus', onFocus),
            () => document.removeEventListener('visibilitychange', onVisibility),
            () => window.removeEventListener('keydown', onKeyDown),
            () => window.removeEventListener('mousemove', onMouseMove),
            () => window.removeEventListener('mousedown', onMouseDown),
        ];

        // Connect to Extension Relay
        setupRelay();

        // Start the 5-second evaluation loop
        tickInterval = setInterval(tick, 5000);

        notify();
    }

    // Helper: Determine if the active app/window is highly likely to be relevant
    // We err on the side of "relevant" to avoid false positives.
    function isRelevantToTask(activity, modeId) {
        if (!activity.activeApp && !activity.activeWindow) return true; // No clear data = assume relevant
        
        const app = (activity.activeApp || '').toLowerCase();
        const win = (activity.activeWindow || '').toLowerCase();
        const url = (activity.activeUrl || '').toLowerCase();
        
        const combinedContext = `${app} ${win} ${url}`;
        
        // Universal distractors (very high confidence off-task unless Gaming mode)
        const universalDistractors = ['youtube', 'netflix', 'twitter', 'x.com', 'instagram', 'facebook', 'reddit', 'tiktok', 'steam', 'epic games', 'discord'];
        if (modeId !== 'gaming' && universalDistractors.some(d => combinedContext.includes(d))) {
             // Exception: YouTube might be a tutorial for coding/study
             if (combinedContext.includes('youtube') && (modeId === 'coding' || modeId === 'assignment')) {
                  if (combinedContext.includes('tutorial') || combinedContext.includes('course') || combinedContext.includes('learn') || combinedContext.includes('code')) {
                      return true;
                  }
             }
             return false;
        }

        switch (modeId) {
            case 'coding':
                // IDEs, Terminals, Browsers looking at docs
                const codingAllowed = ['code', 'cursor', 'terminal', 'powershell', 'bash', 'cmd', 'git', 'chrome', 'firefox', 'edge', 'safari', 'brave', 'stack overflow', 'github', 'docs', 'api', 'localhost', '127.0.0.1'];
                return codingAllowed.some(a => combinedContext.includes(a));
                
            case 'reading':
                // PDF readers, browsers, generic reading setups
                const readingAllowed = ['acrobat', 'pdf', 'preview', 'chrome', 'firefox', 'edge', 'sumatra', 'notion', 'obsidian', 'docs', 'kindle'];
                return readingAllowed.some(a => combinedContext.includes(a));
                
            case 'assignment':
                // Study/Writing: word processors, calculators, notes, browsers
                const studyAllowed = ['word', 'docs', 'excel', 'sheets', 'powerpoint', 'calculator', 'notion', 'obsidian', 'chrome', 'firefox', 'edge', 'safari', 'canvas', 'blackboard', 'moodle'];
                return studyAllowed.some(a => combinedContext.includes(a));
                
            default:
                // Standard relaxed matching
                return true; 
        }
    }

    function tick() {
        if (!state.isTracking) return;
        const now = Date.now();

        // Cleanup old buffers
        state.keyBuffer = state.keyBuffer.filter(x => now - x <= 60000);
        state.keyPatternBuffer = state.keyPatternBuffer.filter(x => now - x.t <= 10000);

        // Derive activityState from local buffers and latest extension state
        const activityState = {
            keyboardRate: state.keyBuffer.length, // Keys in last 60s
            mouseRate: (now - state.lastActivityAt < 5000 && state.keyBuffer.length === 0) ? 1 : 0, // Simple mouse activity indicator
            navigationOccurred: state.lastFocusLostAt !== null && (now - state.lastFocusLostAt < 5000), // Recent blur/focus change
            activeApp: latestExtensionState?.processName || '',
            activeWindow: latestExtensionState?.windowTitle || '',
            activeUrl: latestExtensionState?.activeUrl || '',
            gamingKeysDetected: state.keyPatternBuffer.length >= 8,
            timestamp: latestExtensionState?.timestamp || 0,
            focusState: latestExtensionState?.focusState || 'focused',
            isIdle: latestExtensionState?.isIdle || false,
            topCpuProcess: latestExtensionState?.topCpuProcess || '',
        };

        const isRelayConnected = state.isRelayConnected && (activityState.timestamp > 0 && now - activityState.timestamp < 30000);
        const modeId = state.modeId;

        const signals = [
            activityState.keyboardRate > 0 ? 'typing' : '',
            activityState.mouseRate > 0 ? 'mouse' : '',
            activityState.navigationOccurred ? 'nav' : '',
            (activityState.activeApp || activityState.activeWindow) ? 'app_switch' : '',
            activityState.gamingKeysDetected ? 'gaming_keys' : '', // New: separate tracking for WASD
        ].filter(Boolean);

        // Core Task Relevance (requires extension)
        const isAppSwitch = signals.includes('app_switch');
        const hasTaskMismatch = isAppSwitch && !isRelevantToTask(activityState, modeId);

        // STAGE 1: Signal Quality Gate
        // Determine the ceiling of what we can confidently know.
        let signalQuality = 'weak';
        let maxConfidenceAllowed = 0.54; // Without extension, we can NEVER be highly confident

        if (isRelayConnected) {
            if (activityState.activeUrl || activityState.activeWindow) {
                signalQuality = 'strong';
                maxConfidenceAllowed = 1.00; // With deep context, we can reach full confidence
            } else {
                signalQuality = 'medium';
                maxConfidenceAllowed = 0.74; // Extension connected, but no clear context right now
            }
        }

        // STAGE 2: Mode Behavior Interpreter
        // Different modes have completely different definitions of "normal"
        let rawSuspicion = 0.0;
        let fairnessBias = 0.0; // Positive = penalize, Negative = forgive ambiguity

        switch (modeId) {
            case 'reading':
                // Reading mode strictly normalizes stillness
                if (signals.length === 0) rawSuspicion = 0.0; // Stillness is deep reading
                else if (signals.includes('nav') || signals.includes('mouse')) rawSuspicion = 0.0; // Scrolling, jumping is normal
                else if (hasTaskMismatch) rawSuspicion = 0.8;
                // Fairness bias: heavily forgive lack of input
                if (signals.length === 0) fairnessBias -= 0.2;
                break;

            case 'coding':
            case 'assignment':
                // App switching between terminal/docs/IDE is normal, only task mismatch is truly suspicious
                if (hasTaskMismatch) rawSuspicion = 0.7;
                else if (signals.length === 0) {
                    // Short idle is thinking/compiling. Long idle without task mismatch is ambiguous.
                    rawSuspicion = 0.2;
                    fairnessBias -= 0.1; // Forgive blank stares or reading docs
                }
                else rawSuspicion = 0.0;
                break;

            case 'gaming':
                if (signals.length === 0) rawSuspicion = 0.5; // AFK in game?
                else if (!signals.includes('typing') && signals.includes('app_switch')) rawSuspicion = 0.6;
                else rawSuspicion = 0.0;
                break;

            default:
                if (hasTaskMismatch) rawSuspicion = 0.6;
                else if (signals.length === 0) rawSuspicion = 0.3;
                break;
        }

        // Weaken Gaming Key Signals outside Gaming mode
        if (signals.includes('gaming_keys') && modeId !== 'gaming') {
             // Just a very small weak suspicion, cannot trigger on its own
             rawSuspicion = Math.max(rawSuspicion, 0.2);
             fairnessBias -= 0.1; // Likely just typing or navigation shortcuts
        }

        // Add raw suspicion directly into accumulator, then apply decay
        // to smooth out spikes and require sustained patterns.
        state.sustainedSuspicionCounter = (state.sustainedSuspicionCounter || 0) + rawSuspicion;

        // Decay to prevent infinite snowballing of small events
        state.sustainedSuspicionCounter = Math.max(0, state.sustainedSuspicionCounter - 0.2);

        // STAGE 3: Drift Confidence Scorer
        // Map the sustained suspicion into our 0.00 - 1.00 confidence band
        // Requires ~4 ticks (20s) of high rawSuspicion to hit 1.0
        let calculatedConfidence = Math.min(1.0, state.sustainedSuspicionCounter / 4.0);

        // Apply Fairness Bias (Downgrade on ambiguity)
        calculatedConfidence = Math.max(0, calculatedConfidence + fairnessBias);

        // Apply the Quality Gate Ceiling
        let finalConfidence = Math.min(calculatedConfidence, maxConfidenceAllowed);

        state.driftConfidence = finalConfidence;

        // Categorize state based on confidence bands
        let driftState = 'none';
        if (finalConfidence >= 0.75) driftState = 'confirmed';
        else if (finalConfidence >= 0.55) driftState = 'likely';
        else if (finalConfidence >= 0.35) driftState = 'possible';

        // Cooldown processing
        if (state.driftCooldownActive) {
            const timeSinceCooldown = Date.now() - state.lastDriftCorrectionTime;
            if (timeSinceCooldown > 60000) { // 60s cooldown
                state.driftCooldownActive = false;
            }
        }

        const isSustainedPattern = state.sustainedSuspicionCounter >= 3.0; // Needs significant buildup

        // STAGE 4: Action Policy
        // Output deterministic instructions for the rest of the application.
        const policy = {
            allowTimerCorrection: false,
            allowFarmCorrection: false,
            showUiNudge: false,
            confidence: finalConfidence,
            state: driftState
        };

        // 5-Condition Strict Gate for Timer Extensions
        const canCorrectTimer = 
            isRelayConnected &&
            finalConfidence >= 0.75 &&
            isSustainedPattern &&
            hasTaskMismatch &&
            !state.driftCooldownActive;

        if (canCorrectTimer) {
            policy.allowTimerCorrection = true;
            policy.allowFarmCorrection = true;
            policy.showUiNudge = true;
            
            // Mark cooldown
            state.driftCooldownActive = true;
            state.lastDriftCorrectionTime = Date.now();
            
            // Reset counter so we don't spam
            state.sustainedSuspicionCounter = 0;
            // Note: driftCount is managed by handleStateTransitions via focusScore threshold
        } else if (driftState === 'likely' || (driftState === 'possible' && signalQuality === 'weak')) {
            // Soft nudges are okay even if we can't mathematically penalize them
            policy.showUiNudge = true;
        }

        state.actionPolicy = policy;

        // Backward Compatibility Map (for UI charting)
        // Convert confidence back to a 0-100 "Focus Score" for the charts
        state.focusScore = Math.round((1 - finalConfidence) * 100);
        state.focusLabel = driftState === 'none' ? 'Focused' : 
                           driftState === 'possible' ? 'Slight distraction' :
                           driftState === 'likely' ? 'Unstable focus' : 'Drift detected';
        
        let suspicionReason = signals.join(', ');
        if (suspicionReason && driftState !== 'none') {
            state.monitoringSource = 'Flags: ' + suspicionReason;
        } else {
            state.monitoringSource = isRelayConnected ? 'Agent Verified Focus' : 'Local activity (Advisory)';
        }

        // Sync legacy drift states
        handleStateTransitions();

        // Calculate Real-time Stability Index
        const sessionStartTime = state.sessionStartTime;
        if (sessionStartTime) {
            const totalElapsed = now - sessionStartTime;
            if (totalElapsed > 0) {
                const hasEvents = state.events && state.events.length > 0;
                const lastEvent = hasEvents ? state.events[state.events.length - 1] : null;
                const currentDriftMs = (state.isDrifting && lastEvent && lastEvent.startTimestamp)
                    ? state.totalDriftMs + (now - lastEvent.startTimestamp)
                    : state.totalDriftMs;
                state.stabilityIndex = Math.max(0, (totalElapsed - currentDriftMs) / totalElapsed);
            }
        }

        notify();
    }


    function handleStateTransitions() {
        const currentlyDrifting = state.isDrifting;

        if (state.focusScore < 60 && !currentlyDrifting) {
            // Start a drift event
            state.isDrifting = true;
            state.driftCount += 1;
            state.events.push({ startTimestamp: Date.now(), endTimestamp: null, reason: 'SCORE_DROPPED' });
        } else if (state.focusScore >= 80 && currentlyDrifting) {
            // Recover from drift
            const last = state.events[state.events.length - 1];
            if (last && last.endTimestamp == null) {
                last.endTimestamp = Date.now();
                state.totalDriftMs += (last.endTimestamp - last.startTimestamp);
            }
            state.isDrifting = false;
        }
    }

    function stopTracking() {
        state.isTracking = false;
        if (tickInterval) clearInterval(tickInterval);

        // Finalize drift if active
        if (state.isDrifting) {
            const last = state.events[state.events.length - 1];
            if (last && last.endTimestamp == null) {
                last.endTimestamp = Date.now();
                state.totalDriftMs += (last.endTimestamp - last.startTimestamp);
            }
            state.isDrifting = false;
        }

        unsubscribers.forEach(fn => fn());
        unsubscribers = [];
        notify();
        return [...state.events];
    }

    function reset() {
        if (tickInterval) clearInterval(tickInterval);
        state = {
            isTracking: false,
            isDrifting: false,
            driftCount: 0,
            totalDriftMs: 0,
            events: [],
            focusScore: 100,
            focusLabel: 'Focused',
            monitoringSource: 'Local activity monitoring',
            modeId: 'coding',
            modeLabel: 'Coding',
            keyBuffer: [],
            keyPatternBuffer: [],
            lastActivityAt: Date.now(),
            lastFocusLostAt: null,
            isRelayConnected: state.isRelayConnected, // PRESERVE connection state on reset
        };
        currentRules = {};
        notify();
    }

    function pauseTracking() {
        state.isTracking = false;
        notify();
    }

    function resumeTracking() {
        state.isTracking = true;
        state.lastActivityAt = Date.now(); // reset idle timer so they aren't punished for the break
        if (state.lastFocusLostAt) state.lastFocusLostAt = Date.now();
        notify();
    }

    function setConfig(newConfig) { }

    return { subscribe, getSnapshot, startTracking, stopTracking, pauseTracking, resumeTracking, reset, setConfig };
}
