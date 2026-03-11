// Focus Stability Analyzer — Computes transparent, explainable metrics
import { getAllSessions, getSessionsByMode, getDriftEventsForSession } from '../../data/db.js';

export function analyzeSession(session) {
    const totalMs = session.totalDurationMs || 0;
    const driftCount = session.driftCount || 0;
    const totalDriftMs = session.totalDriftMs || 0;
    const activeFocusMs = Math.max(0, totalMs - totalDriftMs);
    const longestSegmentMs = session.longestFocusSegmentMs || 0;

    // Focus Stability Index: ratio of longest uninterrupted segment to total session
    const stabilityIndex = totalMs > 0 ? longestSegmentMs / totalMs : 0;

    let stabilityLabel = 'Low';
    const SESSION_MIN_MS = 180000; // 3 minutes

    if (totalMs < SESSION_MIN_MS) {
        stabilityLabel = 'Too short to judge';
    } else if (stabilityIndex >= 0.8) {
        stabilityLabel = 'High';
    } else if (stabilityIndex >= 0.5) {
        stabilityLabel = 'Medium';
    }

    // Improvement delta vs previous session of the same mode
    const previousSession = getPreviousSession(session);
    const improvementDelta = previousSession
        ? computeImprovementDelta(session, previousSession)
        : null;

    return {
        totalDurationMs: totalMs,
        activeFocusDurationMs: activeFocusMs,
        interruptedDurationMs: totalDriftMs,
        driftCount,
        longestContinuousSegmentMs: longestSegmentMs,
        stabilityIndex: Math.round(stabilityIndex * 1000) / 1000,
        stabilityLabel,
        improvementDelta,
        insights: generateInsights(session, previousSession, stabilityIndex, activeFocusMs, driftCount, stabilityLabel),
    };
}

function getPreviousSession(currentSession) {
    const sessions = getSessionsByMode(currentSession.workMode)
        .filter(s => s.id !== currentSession.id && s.endTime)
        .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
    return sessions[0] || null;
}

function computeImprovementDelta(current, previous) {
    const currentLongest = current.longestFocusSegmentMs || 0;
    const previousLongest = previous.longestFocusSegmentMs || 0;
    const currentTotal = current.totalDurationMs || 0;
    const previousTotal = previous.totalDurationMs || 0;
    const currentDrifts = current.driftCount || 0;
    const previousDrifts = previous.driftCount || 0;

    return {
        longestSegmentDeltaMs: currentLongest - previousLongest,
        totalDurationDeltaMs: currentTotal - previousTotal,
        driftCountDelta: currentDrifts - previousDrifts,
    };
}

function generateInsights(session, previous, stabilityIndex, activeFocusMs, driftCount, stabilityLabel) {
    const insights = [];

    // Format time nicely
    const fmt = (ms) => {
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        if (mins > 0) return `${mins} minute${mins !== 1 ? 's' : ''} ${secs > 0 ? `${secs}s` : ''}`.trim();
        return `${secs} second${secs !== 1 ? 's' : ''}`;
    };

    // Stability insight
    if (stabilityLabel === 'Too short to judge') {
        insights.push({ type: 'neutral', text: `Session was too short to accurately measure stability.` });
    } else {
        if (stabilityLabel === 'High') {
            insights.push({ type: 'positive', text: `Gold standard stability. You maintained deep focus flow for most of the session.` });
        } else if (stabilityLabel === 'Medium') {
            insights.push({ type: 'neutral', text: `Solid stability. You had a few interruptions but recovered your focus quickly.` });
        } else {
            insights.push({ type: 'observation', text: `Low stability detected. Try shorter intervals (e.g. 25m) to build up your focus muscle.` });
        }
    }

    // Context Switch & Micro-break Insights (Simulated for now, as they are real-time engine states)
    if (driftCount > 5) {
        insights.push({ type: 'observation', text: 'Multiple context switches detected. Batching similar tasks avoids this "switching tax".' });
    } else if (stabilityIndex > 0.7 && driftCount > 0) {
        insights.push({ type: 'positive', text: 'Excellent recovery! You returned to focus quickly after minor distractions.' });
    }

    // Active focus
    insights.push({
        type: 'info',
        text: `You spent ${fmt(activeFocusMs)} in an active focus state.`,
    });

    // Comparison with previous session
    if (previous) {
        const delta = computeImprovementDelta(session, previous);
        if (delta.longestSegmentDeltaMs > 300000) { // 5 mins improvement
            insights.push({
                type: 'positive',
                text: `Massive win! Your longest focus stretch was ${fmt(delta.longestSegmentDeltaMs)} longer than last time.`,
            });
        } else if (delta.longestSegmentDeltaMs > 0) {
            insights.push({
                type: 'positive',
                text: `Progress: Your longest focus stretch improved by ${fmt(delta.longestSegmentDeltaMs)}.`,
            });
        }

        if (delta.driftCountDelta < 0) {
            insights.push({
                type: 'positive',
                text: `Focus efficiency up: ${Math.abs(delta.driftCountDelta)} fewer interruptions than your last session.`,
            });
        }
    }

    return insights;
}

// Weekly aggregation
export function getWeeklyStats() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sessions = getAllSessions().filter(s => {
        return s.endTime && new Date(s.startTime).getTime() >= weekAgo.getTime();
    });

    // Daily breakdown
    const dailyData = {};
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = date.toISOString().split('T')[0];
        dailyData[key] = { date: key, totalFocusMs: 0, sessionCount: 0, driftCount: 0 };
    }

    const modeDistribution = {};

    for (const session of sessions) {
        const key = new Date(session.startTime).toISOString().split('T')[0];
        if (dailyData[key]) {
            dailyData[key].totalFocusMs += session.totalDurationMs || 0;
            dailyData[key].sessionCount += 1;
            dailyData[key].driftCount += session.driftCount || 0;
        }
        const m = session.workMode || session.mode || 'Working';
        modeDistribution[m] = (modeDistribution[m] || 0) + 1;
    }

    return {
        dailyBreakdown: Object.values(dailyData),
        modeDistribution: Object.entries(modeDistribution).map(([name, value]) => ({ name, value })),
        totalSessions: sessions.length,
        totalFocusMs: sessions.reduce((sum, s) => sum + (s.totalDurationMs || 0), 0),
        totalDrifts: sessions.reduce((sum, s) => sum + (s.driftCount || 0), 0),
        averageSessionMs: sessions.length > 0
            ? sessions.reduce((sum, s) => sum + (s.totalDurationMs || 0), 0) / sessions.length
            : 0,
    };
}

/**
 * Historical Predictor Logic
 * Analyzes past 14 days of sessions to find "Golden Windows"
 * Returns array of { hour: 0-23, score: 0-1, confidence: 0-1 }
 */
export function getDeepWorkPredictors() {
    const allSessions = getAllSessions().filter(s => s.endTime);
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const relevantSessions = allSessions.filter(s => {
        return new Date(s.startTime).getTime() >= twoWeeksAgo.getTime();
    });

    if (relevantSessions.length < 3) return []; // Not enough data

    // hourlyStats[hour] = { totalStability: 0, count: 0 }
    const hourlyStats = Array.from({ length: 24 }, () => ({ totalStability: 0, count: 0 }));

    relevantSessions.forEach(session => {
        const start = new Date(session.startTime);
        const hour = start.getHours();

        // Use analysis to get stability index
        const analysis = analyzeSession(session);
        if (analysis.stabilityLabel !== 'Too short to judge') {
            hourlyStats[hour].totalStability += analysis.stabilityIndex;
            hourlyStats[hour].count += 1;
        }
    });

    const predictions = hourlyStats.map((stat, hour) => {
        if (stat.count === 0) return { hour, score: 0, confidence: 0 };

        const avgStability = stat.totalStability / stat.count;
        // Confidence is based on sample size (max out at 5 sessions per hour for 100% confidence)
        const confidence = Math.min(1, stat.count / 5);

        return {
            hour,
            score: Math.round(avgStability * 100) / 100,
            confidence: Math.round(confidence * 100) / 100
        };
    }).filter(p => p.confidence > 0.2);

    return predictions.sort((a, b) => b.score - a.score);
}
