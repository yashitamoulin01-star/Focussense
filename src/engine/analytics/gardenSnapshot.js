// src/engine/analytics/gardenSnapshot.js
// Privacy-first Garden Snapshot Engine
// Converts raw farm + session data into a structured, shareable snapshot object.
// No external uploads. No identifiable metadata unless explicitly included.

import { getAllSessions } from '../../data/db.js';
import { getFarmWorld } from '../farm/worldState.js';
import { analyzeSession } from '../session/stabilityAnalyzer.js';

export const SNAPSHOT_VERSION = 1;

// Privacy modes control which fields are included in the snapshot.
export const PRIVACY_MODES = {
    minimal: {
        id: 'minimal',
        label: 'Minimal',
        desc: 'Visual garden only. 2 generic stats.',
        includeStability: false,
        includeStreak: false,
        includeTimestamps: false,
        includeMood: false,
    },
    standard: {
        id: 'standard',
        label: 'Standard',
        desc: 'Garden + key metrics (Hours, Sessions, Streak).',
        includeStability: false,
        includeStreak: true,
        includeTimestamps: false,
        includeMood: false,
    },
    detailed: {
        id: 'detailed',
        label: 'Detailed',
        desc: 'Full breakdown including Stability and Streaks.',
        includeStability: true,
        includeStreak: true,
        includeTimestamps: false,
        includeMood: true,
    },
    anonymous: {
        id: 'anonymous',
        label: 'Anonymous',
        desc: 'No timestamps or identifying labels.',
        includeStability: false,
        includeStreak: false,
        includeTimestamps: false,
        includeMood: false,
    },
};

// Range options for snapshot scope
export const SNAPSHOT_RANGES = {
    week: { id: 'week', label: 'Last 7 Days', days: 7 },
    month: { id: 'month', label: 'Last 30 Days', days: 30 },
    all: { id: 'all', label: 'All Time', days: Infinity },
};

/**
 * Compute current and longest focus streak (consecutive days with at least 1 session).
 */
function computeStreaks(sessions) {
    if (!sessions.length) return { current: 0, longest: 0 };

    // Build a set of unique YYYY-MM-DD strings that have sessions
    const daySet = new Set(
        sessions
            .filter(s => s.endTime)
            .map(s => new Date(s.startTime).toISOString().split('T')[0])
    );

    const days = [...daySet].sort();
    if (!days.length) return { current: 0, longest: 0 };

    let longest = 1;
    let current = 1;
    let streak = 1;

    for (let i = 1; i < days.length; i++) {
        const prev = new Date(days[i - 1]);
        const curr = new Date(days[i]);
        const diffDays = Math.round((curr - prev) / 86400000);
        if (diffDays === 1) {
            streak++;
            if (streak > longest) longest = streak;
        } else {
            streak = 1;
        }
    }

    // Check if current streak is still active (last day is today or yesterday)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const lastDay = days[days.length - 1];
    current = (lastDay === today || lastDay === yesterday) ? streak : 0;

    return { current, longest };
}

/**
 * Derive a focus style label from session patterns.
 */
function deriveFocusStyle(sessions) {
    if (!sessions.length) return 'Explorer';
    const avgDuration = sessions.reduce((s, x) => s + (x.totalDurationMs || 0), 0) / sessions.length / 60000;
    const avgDrift = sessions.reduce((s, x) => s + (x.driftCount || 0), 0) / sessions.length;

    if (avgDuration >= 50 && avgDrift < 3) return 'Deep Diver';
    if (avgDuration >= 30 && avgDrift < 5) return 'Steady Builder';
    if (avgDuration < 25 && avgDrift < 4) return 'Sprint Artist';
    if (avgDrift >= 7) return 'Context Juggler';
    return 'Balanced Practitioner';
}

/**
 * Get the dominant biome/growth from farm world state.
 */
function deriveFarmSummary(farmWorld) {
    if (!farmWorld || !farmWorld.entities) return { level: 1, dominantBiome: 'Seedling', topAchievement: null };
    const entities = farmWorld.entities || [];
    const growthCount = entities.filter(e => e.growthStage >= 3).length;
    const maturedCount = entities.filter(e => e.growthStage >= 5 || e.isFullyGrown).length;

    let dominantBiome = 'Seedling';
    if (maturedCount >= 5) dominantBiome = 'Ancient Grove';
    else if (maturedCount >= 3) dominantBiome = 'Blossoming Vale';
    else if (growthCount >= 5) dominantBiome = 'Growing Meadow';
    else if (growthCount >= 2) dominantBiome = 'Budding Garden';

    const level = Math.min(10, Math.floor((growthCount + maturedCount * 2) / 2) + 1);
    const topAchievement = maturedCount >= 3 ? '🌟 Ancient Grove reached' : growthCount >= 5 ? '🌿 Thriving Meadow' : null;

    return { level, dominantBiome, topAchievement };
}

/**
 * Core: Generate a garden snapshot.
 * @param {string} rangeId - 'week' | 'month' | 'all'
 * @param {string} privacyModeId - 'minimal' | 'standard' | 'detailed' | 'anonymous'
 * @returns {object} Structured snapshot object
 */
export function generateGardenSnapshot(rangeId = 'week', privacyModeId = 'standard') {
    const mode = PRIVACY_MODES[privacyModeId] || PRIVACY_MODES.standard;
    const range = SNAPSHOT_RANGES[rangeId] || SNAPSHOT_RANGES.week;

    const allSessions = getAllSessions().filter(s => s.endTime);
    const cutoff = range.days === Infinity ? 0 : Date.now() - range.days * 86400000;
    const sessions = allSessions.filter(s => new Date(s.startTime).getTime() >= cutoff);

    const totalFocusMinutes = Math.round(
        sessions.reduce((sum, s) => sum + (s.totalDurationMs || 0), 0) / 60000
    );

    const avgStability = sessions.length > 0
        ? Math.round(
            sessions
                .map(s => analyzeSession(s).stabilityIndex)
                .reduce((a, b) => a + b, 0) / sessions.length * 100
        )
        : 0;

    const streaks = computeStreaks(allSessions); // streaks are computed on all-time data
    const farmWorld = getFarmWorld();
    const farmSummary = deriveFarmSummary(farmWorld);

    // Build the raw snapshot — all fields computed
    const raw = {
        snapshotVersion: SNAPSHOT_VERSION,
        range: range.label,
        completedSessions: sessions.length,
        totalFocusMinutes,
        avgStability,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
        farmLevel: farmSummary.level,
        dominantBiome: farmSummary.dominantBiome,
        topAchievement: farmSummary.topAchievement,
        focusStyleLabel: deriveFocusStyle(sessions),
    };

    // Apply privacy filter — strip fields the user opted out of
    const snapshot = {
        snapshotVersion: raw.snapshotVersion,
        exportType: 'focussense-garden-snapshot',
        privacyMode: mode.id,
        range: raw.range,
        totalFocusMinutes: raw.totalFocusMinutes,
        completedSessions: raw.completedSessions,
        farmLevel: raw.farmLevel,
        dominantBiome: raw.dominantBiome,
    };

    if (mode.includeStreak) {
        snapshot.currentStreak = raw.currentStreak;
        snapshot.longestStreak = raw.longestStreak;
    }
    if (mode.includeStability) {
        snapshot.avgStability = raw.avgStability;
        snapshot.focusStyleLabel = raw.focusStyleLabel;
    }
    if (mode.includeTimestamps) {
        snapshot.createdAt = new Date().toISOString();
    }
    if (raw.topAchievement && privacyModeId !== 'anonymous') {
        snapshot.topAchievement = raw.topAchievement;
    }

    return snapshot;
}

/**
 * Serialize to JSON for file download.
 */
export function serializeGardenSnapshot(snapshot) {
    return JSON.stringify(snapshot, null, 2);
}

/**
 * Heuristic caption generator — reflective, not vanity-driven.
 * Avoids rankings, percentages, or claims of superiority.
 */
export function generateGardenCaption(snapshot) {
    const { completedSessions, totalFocusMinutes, currentStreak, dominantBiome, focusStyleLabel } = snapshot;

    if (!completedSessions || completedSessions === 0) {
        return 'A garden waiting to grow. Every session plants a seed.';
    }

    const hours = Math.floor(totalFocusMinutes / 60);
    const mins = totalFocusMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;

    if (currentStreak >= 7) {
        return `Seven days of intentional work. The grove reflects it.`;
    }
    if (currentStreak >= 3) {
        return `${currentStreak} days of consistent focus. Built through patience, not speed.`;
    }
    if (dominantBiome === 'Ancient Grove') {
        return `This garden grew through sustained daily effort — ${timeStr} of focused work in this period.`;
    }
    if (focusStyleLabel === 'Deep Diver') {
        return `Long, unbroken sessions shaped this space. ${timeStr} of depth.`;
    }
    if (completedSessions === 1) {
        return 'One session. The garden has begun.';
    }

    return `${completedSessions} sessions of deliberate work. ${timeStr} of growth in this period.`;
}
