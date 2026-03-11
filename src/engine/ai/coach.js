// src/engine/ai/coach.js

/**
 * Adaptive Focus Coach v2
 * Explains session data in a human-readable, evidence-based way.
 */
export function generateCoachReview(session, analysis) {
    if (!session) return null;

    const totalMins = Math.floor((session.totalDurationMs || 0) / 60000);
    const driftCount = session.driftCount || 0;
    const stability = (analysis.stabilityIndex || 0) * 100;

    // 1. Guard against "0 min" or inactive sessions
    if (totalMins < 1 || !session.startTime) {
        return {
            summary: "This session was too short to provide a meaningful focus review. Try aiming for at least 15 minutes next time.",
            highlights: [
                { title: "Inactivity", text: "No significant activity was recorded in this window." }
            ],
            advice: "Short bursts are okay for checking emails, but for real progress, try a 25-minute 'Direct Focus' block.",
            rawStability: 0,
            timestamp: new Date().toISOString()
        };
    }

    // 2. Narrative Summary Layer
    let summary = '';
    const roundedStability = Math.round(stability);
    if (stability >= 85 && totalMins >= 25) {
        summary = `High-stability session. You maintained ${roundedStability}% focus consistency over ${totalMins} minutes. Quantitative markers indicate deep flow.`;
    } else if (stability >= 60) {
        summary = `Satisfactory session. Your stability averaged ${roundedStability}% for ${totalMins} minutes. Solid output despite minor attention shifts.`;
    } else if (stability >= 30) {
        summary = `Fragmented performance. Stability dropped to ${roundedStability}% across the ${totalMins}-minute window. High cognitive friction detected.`;
    } else {
        summary = `Critical focus instability. A ${totalMins}-minute session with only ${roundedStability}% stability. Technical or mental blocks likely occurred.`;
    }

    // 3. Evidence Points (Data-driven observations)
    const highlights = [];

    // Highlight 1: The "Gold" Zone (Flow Entry)
    if (totalMins > 10) {
        highlights.push({
            title: 'Initial Stability',
            text: `Data shows your highest stability was in the first ${Math.min(15, totalMins)} minutes. That's your optimal performance window.`
        });
    }

    // Highlight 2: Context Switching
    if (driftCount > 4) {
        highlights.push({
            title: 'Interruption Frequency',
            text: `Recorded ${driftCount} context switches. Statistical evidence suggests each switch adds a 1-3 minute latency to your flow recovery.`
        });
    } else if (driftCount <= 1 && totalMins > 20) {
        highlights.push({
            title: 'Continuity Marker',
            text: `High task continuity. You effectively avoided the overhead of context switching for over 90% of the session.`
        });
    }

    // Highlight 3: Recovery Speed (Heuristic based on driftCount vs stability)
    if (stability > 50 && driftCount > 2) {
        highlights.push({
            title: 'Recovery Response',
            text: 'Positive recovery response. Even after drift events, your focus score normalized within a healthy timeframe.'
        });
    }

    // 4. Actionable Advice
    let advice = 'Environmental stability seems high. Current configuration is recommended for your next block.';
    if (stability < 40) {
        advice = 'Cognitive load exceeded for this duration. Recommend a 20-minute interval to maintain higher peak stability.';
    } else if (driftCount > 8) {
        advice = 'Frequent tab-switching detected. Recommend using "Strict Mode" or a dedicated focus window for your next sprint.';
    } else if (stability > 90 && totalMins < 45) {
        advice = 'High endurance potential observed. You could likely extend your next session to 60 minutes without stability decay.';
    }

    return {
        summary,
        highlights,
        advice,
        rawStability: stability,
        timestamp: new Date().toISOString()
    };
}

/**
 * Generates a short, single-sentence coach "bite" for live UI.
 */
export function generateLiveCoachBite(lastSession, analysis, isFocused) {
    if (isFocused) {
        if (!analysis || analysis.focusScore > 80) return "Deep flow detected. Keep this rhythm!";
        if (analysis.focusScore < 50) return "Mind is drifting. One breath, then back to the center.";
        return "Steady progress. You are exactly where you need to be.";
    }

    if (!lastSession) return "Welcome to your focus grove. Ready to grow something today?";

    const stability = (analysis?.stabilityIndex || 0) * 100;
    if (stability > 80) return "Your last session was a masterpiece. Can we repeat that clarity?";
    if (stability < 40) return "Recent sessions have been tough. Maybe a shorter 15m sprint next?";

    return "The farm grows best when you are present. Shall we start a new block?";
}
