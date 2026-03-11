// src/engine/analytics/predictor.js
// Focus Pattern Intelligence Engine
// Reads historical session data to surface Deep Work Windows with explicit confidence scoring.
// NEVER makes claims with insufficient data. Mode-aware. Explainable by design.

import { getAllSessions } from '../../data/db.js';
import { analyzeSession } from '../session/stabilityAnalyzer.js';

const MIN_SESSIONS_FOR_PREDICTION = 5;
const MIN_SESSIONS_PER_BAND = 2; // Min per hour or day to register signal
const FULL_CONFIDENCE_SESSIONS = 8; // Number of sessions per band for "High Confidence"

/**
 * Check if there's enough total data to enable predictions at all.
 */
export function hasEnoughPredictorData() {
    const sessions = getAllSessions().filter(s => s.endTime);
    return sessions.length >= MIN_SESSIONS_FOR_PREDICTION;
}

/**
 * Compute confidence label from a sample count.
 */
export function getPredictionConfidence(count) {
    if (count < MIN_SESSIONS_PER_BAND) return { level: 'none', label: null };
    if (count < 3) return { level: 'low', label: 'Early Signal' };
    if (count < FULL_CONFIDENCE_SESSIONS) return { level: 'medium', label: 'Moderate Confidence' };
    return { level: 'high', label: 'Strong Pattern' };
}

/**
 * Get hourly and day-of-week stats, optionally filtered by mode.
 * @param {string|null} modeFilter - workMode string or null for all modes
 * @param {number} days - how far back to look (default 14)
 */
function getHourlyStats(modeFilter = null, days = 14) {
    const allSessions = getAllSessions().filter(s => s.endTime);
    const cutoff = Date.now() - days * 86400000;
    const sessions = allSessions.filter(s => {
        const inRange = new Date(s.startTime).getTime() >= cutoff;
        if (modeFilter) return inRange && (s.workMode === modeFilter || s.mode === modeFilter);
        return inRange;
    });

    // hourlyStats[hour] = { totalStability, count, totalDurationMs }
    const hourlyStats = Array.from({ length: 24 }, () => ({
        totalStability: 0,
        count: 0,
        totalDurationMs: 0,
    }));

    // dayStats[0..6] = { totalStability, count } where 0=Sun
    const dayStats = Array.from({ length: 7 }, () => ({
        totalStability: 0,
        count: 0,
    }));

    sessions.forEach(session => {
        const start = new Date(session.startTime);
        const hour = start.getHours();
        const day = start.getDay();
        const analysis = analyzeSession(session);

        if (analysis.stabilityLabel !== 'Too short to judge') {
            hourlyStats[hour].totalStability += analysis.stabilityIndex;
            hourlyStats[hour].count += 1;
            hourlyStats[hour].totalDurationMs += session.totalDurationMs || 0;
            dayStats[day].totalStability += analysis.stabilityIndex;
            dayStats[day].count += 1;
        }
    });

    return { hourlyStats, dayStats, totalSessions: sessions.length };
}

/**
 * Get "Golden Windows" — hours of historically high focus stability.
 * Returns top 5, or fewer if data is insufficient. Empty array if not enough data at all.
 * @param {{ mode?: string, minConfidence?: string }} opts
 */
export function getGoldenWindows({ mode = null, minConfidence = 'low' } = {}) {
    if (!hasEnoughPredictorData()) return [];

    const { hourlyStats } = getHourlyStats(mode);

    const confidenceLevels = { none: 0, low: 1, medium: 2, high: 3 };
    const minLevel = confidenceLevels[minConfidence] || 0;

    const windows = hourlyStats
        .map((stat, hour) => {
            const confidence = getPredictionConfidence(stat.count);
            if (confidenceLevels[confidence.level] < minLevel) return null;
            if (stat.count === 0) return null;

            const avgStability = stat.totalStability / stat.count;
            const avgDurationMins = stat.count > 0 ? Math.round(stat.totalDurationMs / stat.count / 60000) : 0;

            return {
                hour,
                hourLabel: formatHour(hour),
                score: Math.round(avgStability * 100),
                count: stat.count,
                avgDurationMins,
                confidence: confidence.level,
                confidenceLabel: confidence.label,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    return windows;
}

/**
 * Get "Fragile Windows" — hours of historically high drift or low endurance.
 */
export function getFragileWindows({ mode = null } = {}) {
    if (!hasEnoughPredictorData()) return [];

    const allSessions = getAllSessions().filter(s => s.endTime);
    const cutoff = Date.now() - 14 * 86400000;
    const sessions = allSessions.filter(s => {
        const inRange = new Date(s.startTime).getTime() >= cutoff;
        if (mode) return inRange && (s.workMode === mode || s.mode === mode);
        return inRange;
    });

    const hourlyDrift = Array.from({ length: 24 }, () => ({
        totalDrift: 0,
        count: 0,
    }));

    sessions.forEach(session => {
        const hour = new Date(session.startTime).getHours();
        if ((session.totalDurationMs || 0) > 180000) { // Only sessions > 3 min
            hourlyDrift[hour].totalDrift += session.driftCount || 0;
            hourlyDrift[hour].count += 1;
        }
    });

    return hourlyDrift
        .map((stat, hour) => {
            if (stat.count < MIN_SESSIONS_PER_BAND) return null;
            const avgDrift = stat.totalDrift / stat.count;
            if (avgDrift < 4) return null; // Only flag genuinely drifty hours
            return {
                hour,
                hourLabel: formatHour(hour),
                avgDrift: Math.round(avgDrift * 10) / 10,
                count: stat.count,
                risk: avgDrift >= 8 ? 'High' : 'Moderate',
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.avgDrift - a.avgDrift)
        .slice(0, 3);
}

/**
 * Compute current and longest focus streak (consecutive days).
 */
export function getFocusStreakInfo() {
    const allSessions = getAllSessions().filter(s => s.endTime);
    if (!allSessions.length) return { current: 0, longest: 0, activeDays: [] };

    const daySet = new Set(
        allSessions.map(s => new Date(s.startTime).toISOString().split('T')[0])
    );
    const days = [...daySet].sort();

    let longest = 1;
    let streak = 1;

    for (let i = 1; i < days.length; i++) {
        const diffDays = Math.round(
            (new Date(days[i]) - new Date(days[i - 1])) / 86400000
        );
        if (diffDays === 1) {
            streak++;
            if (streak > longest) longest = streak;
        } else {
            streak = 1;
        }
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const lastDay = days[days.length - 1];
    const current = lastDay === today || lastDay === yesterday ? streak : 0;

    return { current, longest, activeDays: days };
}

/**
 * Compare avg session duration: last 7 days vs previous 7 days.
 * Returns a trend: 'up' | 'down' | 'stable' | 'insufficient'
 */
export function getEnduranceTrend() {
    const allSessions = getAllSessions().filter(s => s.endTime && s.totalDurationMs > 180000);

    const now = Date.now();
    const last7 = allSessions.filter(s => new Date(s.startTime).getTime() >= now - 7 * 86400000);
    const prev7 = allSessions.filter(s => {
        const t = new Date(s.startTime).getTime();
        return t >= now - 14 * 86400000 && t < now - 7 * 86400000;
    });

    if (last7.length < 2 || prev7.length < 2) return { trend: 'insufficient', deltaMin: 0 };

    const avgLast = last7.reduce((s, x) => s + x.totalDurationMs, 0) / last7.length / 60000;
    const avgPrev = prev7.reduce((s, x) => s + x.totalDurationMs, 0) / prev7.length / 60000;
    const delta = avgLast - avgPrev;

    return {
        trend: delta > 3 ? 'up' : delta < -3 ? 'down' : 'stable',
        deltaMin: Math.round(Math.abs(delta)),
        avgLastWeekMin: Math.round(avgLast),
        avgPrevWeekMin: Math.round(avgPrev),
    };
}

/**
 * Get per-day-of-week focus stats.
 */
export function getDayOfWeekStats() {
    const { dayStats } = getHourlyStats(null, 28); // Look further back for day patterns
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return dayStats.map((stat, day) => ({
        day,
        dayName: dayNames[day],
        avgStability: stat.count > 0 ? Math.round((stat.totalStability / stat.count) * 100) : 0,
        sessions: stat.count,
        confidence: getPredictionConfidence(stat.count),
    }));
}

/**
 * Generate advisory text for the planner based on predictor data.
 * Returns null if data is insufficient.
 */
export function getPlannerAdvisory({ mode = null } = {}) {
    if (!hasEnoughPredictorData()) return null;

    const golden = getGoldenWindows({ mode, minConfidence: 'low' });
    const streak = getFocusStreakInfo();
    const trend = getEnduranceTrend();

    if (!golden.length) return null;

    const top = golden[0];
    const now = new Date();
    const currentHour = now.getHours();
    const nearPeak = Math.abs(currentHour - top.hour) <= 1;

    let advisory = `Your historical focus peaks around ${top.hourLabel} (${top.confidenceLabel}).`;
    if (nearPeak) {
        advisory += ` You're in your peak window right now.`;
    } else {
        advisory += ` Current time is outside your peak window.`;
    }
    if (trend.trend === 'up') {
        advisory += ` Your endurance is trending up (+${trend.deltaMin}m avg vs last week).`;
    } else if (trend.trend === 'down') {
        advisory += ` Your endurance dipped recently — consider a shorter sprint.`;
    }
    if (streak.current >= 3) {
        advisory += ` ${streak.current}-day streak active — maintain it with a consistent block today.`;
    }

    return advisory;
}

// Utility
function formatHour(h) {
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
}
