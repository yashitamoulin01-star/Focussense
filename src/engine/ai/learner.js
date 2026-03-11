import { getFocusProfile, saveFocusProfile } from '../../data/db.js';

/**
 * FocusSense Learner
 * Takes a completed session and updates the local FocusProfile.
 */
export function processSessionOutcome(session) {
    if (!session || !session.postSessionFeedback) return;

    const profile = getFocusProfile();
    const { feedback } = session.postSessionFeedback; // Expected to contain durationFit, goalCompletion, etc.
    const mode = session.mode || 'working';
    const difficulty = session.difficulty || 'medium';

    // 1. Adaptive Duration Learning
    // If the user says a duration was "too long", we nudge the preference down.
    if (session.postSessionFeedback.durationFit === 'too_long') {
        const currentPref = profile.preferredDurations[mode]?.[difficulty] || 30;
        profile.preferredDurations[mode][difficulty] = Math.max(20, currentPref - 5);
    }
    // If "too short", we nudge it up.
    else if (session.postSessionFeedback.durationFit === 'too_short') {
        const currentPref = profile.preferredDurations[mode]?.[difficulty] || 30;
        profile.preferredDurations[mode][difficulty] = Math.min(60, currentPref + 5);
    }

    // 2. Success Rate Tracking
    const key = `${mode}_${difficulty}`;
    if (!profile.successRates[key]) profile.successRates[key] = { count: 0, full: 0, partial: 0 };

    profile.successRates[key].count++;
    if (session.postSessionFeedback.goalCompletion === 'full') profile.successRates[key].full++;
    else if (session.postSessionFeedback.goalCompletion === 'partial') profile.successRates[key].partial++;

    // 3. Blocker Awareness
    if (session.postSessionFeedback.biggestBlocker && session.postSessionFeedback.biggestBlocker !== 'none') {
        const blocker = session.postSessionFeedback.biggestBlocker;
        if (!profile.commonBlockers[mode]) profile.commonBlockers[mode] = {};
        profile.commonBlockers[mode][blocker] = (profile.commonBlockers[mode][blocker] || 0) + 1;
    }

    profile.updatedAt = new Date().toISOString();
    saveFocusProfile(profile);

    console.log('[LEARNER] FocusProfile updated based on session outcome.', profile);
}
