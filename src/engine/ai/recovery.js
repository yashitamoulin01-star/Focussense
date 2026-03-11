// src/engine/ai/recovery.js

/**
 * Recovery Agent
 * Decides the best intervention when focus is unstable.
 */
export function getRecoveryAction(driftState, sessionContext) {
    if (!driftState || !driftState.isDrifting) return null;

    const { driftCount, focusScore, focusLabel } = driftState;
    const { modeId, elapsedMs, targetDurationMs } = sessionContext;

    // 1. Analyze Instability Severity
    const elapsedMins = Math.floor(elapsedMs / 60000);
    const isDeepSession = targetDurationMs > 45 * 60000;

    // 2. Decision Logic (Agentic Reasoning)

    // Case A: Repeated switching early on
    if (driftCount >= 3 && elapsedMins < 15) {
        return {
            type: 'reset',
            message: "You've had repeated interruptions early in this session. Reset with a 15-minute 'Focus Sprint'?",
            label: 'Start Sprint',
            meta: { newMode: 'working', newDuration: 15 }
        };
    }

    // Case B: Late session fatigue (Drift after long focus)
    if (focusScore < 40 && elapsedMins > 40) {
        return {
            type: 'pause',
            message: "Focus is tapering after 40 minutes. Take a 5-minute mental reset now?",
            label: 'Take Break',
            meta: { duration: 300 }
        };
    }

    // Case C: Critical Drift (Blocked Domain persistent)
    if (focusScore < 30) {
        return {
            type: 'warning',
            message: "Your focus is critically low. This mode might be too strict right now. Switch to 'Relaxed' mode?",
            label: 'Switch Mode',
            meta: { newModeId: 'working' }
        };
    }

    // Case D: General nudge
    if (driftCount > 5) {
        return {
            type: 'tip',
            message: "You're switching context often. Try closing all non-essential tabs for the next 10 minutes.",
            label: 'I will try',
            meta: {}
        };
    }

    return null;
}
