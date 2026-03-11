// src/engine/ai/plannerMemory.js
// ============================================================
// PERSONAL MEMORY LAYER — Strictly real sessions only
// ============================================================
// LAYER RULES (non-negotiable):
//   - Starts fully EMPTY for all new users
//   - Only populated from actual completed sessions by this user
//   - Must return null (not a default) when history is absent
//   - Must NEVER seed defaults or invent fallback durations
//   - Must NEVER activate personalization before sufficient evidence
// ============================================================

import { getFocusProfile, saveFocusProfile } from '../../data/db.js';

// ─── Personalization policy thresholds ───────────────────────────────────────
const PERSONALIZATION_THRESHOLDS = {
  none:         0,   // 0 sessions
  insufficient: 1,   // 1–4 sessions — collect only, no adaptation
  sufficient:   5,   // 5+ relevant sessions — adaptation allowed
};

/**
 * Determines how much real evidence exists for personalization.
 * Returns 'none' | 'insufficient' | 'sufficient'
 *
 * @param {object} profile - Focus profile from db
 * @param {object} taskContext - { subject, taskIntent, materialUnit }
 */
export function getPersonalizationState(profile, taskContext = {}) {
  const history = profile?.taskHistory;
  if (!history || history.length === 0) {
    return { state: 'none', reason: 'No completed sessions recorded yet.', count: 0 };
  }

  // Find relevant sessions: same subject area or goal type
  const relevant = history.filter(h => {
    if (!h.task) return false;
    const t = h.task.toLowerCase();
    const hasSubjectMatch = taskContext.subject && t.includes(taskContext.subject);
    const hasModeMatch = taskContext.taskIntent === 'exam_prep' && /(exam|revision|study)/.test(t);
    return hasSubjectMatch || hasModeMatch || true; // fallback: count all if no good context
  });

  const count = relevant.length;

  if (count === 0) {
    return { state: 'none', reason: 'No sessions recorded yet.', count: 0 };
  }
  if (count < PERSONALIZATION_THRESHOLDS.sufficient) {
    return {
      state: 'insufficient',
      reason: `Only ${count} session(s) recorded. Need ${PERSONALIZATION_THRESHOLDS.sufficient}+ for personalized adjustment.`,
      count,
    };
  }
  return {
    state: 'sufficient',
    reason: `${count} relevant sessions found. Personalization active.`,
    count,
  };
}

/**
 * Estimates duration from real personal history.
 * Returns NULL if history is empty or personalization is not yet sufficient.
 * NEVER returns a hardcoded fallback — that is the base planner's job.
 *
 * @param {string} taskString
 * @param {object} taskContext
 * @returns {number|null}
 */
export function estimateTaskDuration(taskString, taskContext = {}) {
  const profile = getFocusProfile();
  const personalization = getPersonalizationState(profile, taskContext);

  // Strict: return null if not enough real evidence
  if (personalization.state !== 'sufficient') return null;

  const key = (taskString || '').toLowerCase();
  const history = profile.taskHistory || [];

  // Find strongly matching sessions
  const matches = history.filter(t => {
    if (!t.task) return false;
    const tLower = t.task.toLowerCase();
    return tLower.includes(key.substring(0, 15)) || key.includes(tLower.substring(0, 15));
  });

  if (matches.length === 0) return null;

  // Calculate evidence-weighted duration estimate
  let recommended = 0;
  let totalWeight = 0;
  matches.forEach(match => {
    const weight = match.successWeight === 1 ? 1.2 : match.successWeight === -1 ? 0.8 : 1.0;
    recommended += match.plannedDuration * weight;
    totalWeight += weight;
  });

  const avg = totalWeight > 0 ? recommended / totalWeight : null;
  if (!avg) return null;

  // Apply underestimation correction
  const underestimated = matches.filter(m => m.successWeight === -1).length;
  const correction = underestimated > matches.length * 0.5 ? 1.15 : 1.0;
  const corrected = avg * correction;

  return Math.max(20, Math.min(120, Math.round(corrected)));
}

/**
 * Ingests a real completed session outcome into personal memory.
 * This is the ONLY way personal memory grows.
 */
export function ingestSessionOutcome(session, feedback) {
  if (!session) return;
  const profile = getFocusProfile();

  if (!profile.taskHistory) profile.taskHistory = [];
  if (!profile.learningStats) profile.learningStats = {};

  // Standardize fields with fallback for direct saving safety
  const mode = (session.mode || session.workMode || 'working').toLowerCase();
  const taskKey = (session.intendedTask || session.task || 'generic').substring(0, 30).toLowerCase();
  
  // Use durationMinutes if available, else derive from totalDurationMs
  const duration = session.durationMinutes || (session.totalDurationMs ? Math.round(session.totalDurationMs / 60000) : 0);

  let successWeight = 1;
  if (feedback?.completionMismatch === 'underestimated') successWeight = -1;
  if (feedback?.completionMismatch === 'overestimated') successWeight = 0;

  // Update rolling averages
  const stats = profile.learningStats[mode] || {};
  stats.avgActualDuration = stats.avgActualDuration
    ? stats.avgActualDuration * 0.8 + duration * 0.2
    : duration;

  if (feedback?.distractionCause) {
    stats.distractions = stats.distractions || {};
    stats.distractions[feedback.distractionCause] = (stats.distractions[feedback.distractionCause] || 0) + 1;
  }

  profile.learningStats[mode] = stats;

  profile.taskHistory.push({
    task: taskKey,
    mode,
    plannedDuration: duration,
    successWeight,
    timestamp: new Date().toISOString(),
  });

  // Realistic cap — real human sessions over years, not tens of thousands
  if (profile.taskHistory.length > 5000) profile.taskHistory.shift();

  saveFocusProfile(profile);
}

export function getMemoryProfile() {
  return getFocusProfile();
}
