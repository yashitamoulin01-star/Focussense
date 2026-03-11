// Unlock Evaluator — Converts a completed session into farm world changes
// Pure function: takes session + world, returns a patch diff (never mutates world)

import { FARM_UNLOCKS, QUALITY_THRESHOLDS } from './farmConstants.js';

/**
 * Classify block quality based on drift ratio
 * @param {Object} session - { totalDurationMs, totalDriftMs, driftCount }
 * @returns {'healthy' | 'weak'}
 */
export function classifyQuality(session) {
    const policy = session.actionPolicy || {};
    
    // If the system was not fully confident (e.g. no extension), we DO NOT penalize the farm.
    if (!policy.allowFarmCorrection) {
         return 'healthy';
    }

    const totalMs = session.totalDurationMs || 0;
    const driftMs = session.totalDriftMs || 0;
    if (totalMs <= 0) return 'weak';
    const driftRatio = driftMs / totalMs;
    return driftRatio <= QUALITY_THRESHOLDS.healthyMaxDriftRatio ? 'healthy' : 'weak';
}

/**
 * Evaluate a completed session and return a patch diff for the world state.
 * This handles target tracking, completing targets, and stamping expiresAt.
 *
 * @param {Object} session - completed session data
 * @param {Object} worldState - current farm world state
 * @returns {Object} patch - diff of state to apply
 */
export function evaluateSession(session, worldState) {
    const policy = session.actionPolicy || {};
    
    const totalMs = session.totalDurationMs || 0;
    let driftMs = session.totalDriftMs || 0;
    let driftCount = session.driftCount || 0;
    
    // Core Fairness Rule: Never penalize if the system is not highly confident (requires extension)
    if (!policy.allowFarmCorrection) {
        driftMs = 0;
        driftCount = 0;
    }

    const activeFocusMs = Math.max(0, totalMs - driftMs);
    const scoreAvg = session.focusScoreAvg || 50;

    // Modulated Growth: Quality matters as much as time
    // Boost: score > 80, Penalty: score < 50 or high drift count
    // If we're ignoring drift, we should also probably not penalize the score multiplier heavily
    const effectiveScore = policy.allowFarmCorrection ? scoreAvg : Math.max(scoreAvg, 80);
    const qualityMultiplier = (effectiveScore / 100) * (1 - Math.min(0.5, driftCount * 0.05));
    const effectiveGrowthMs = Math.max(0, activeFocusMs * Math.max(0.1, qualityMultiplier));

    const quality = classifyQuality(session);

    const patch = {
        focusMsToBank: activeFocusMs,
        focusSeedsToAward: quality === 'healthy' ? 1 : 0,
        quality,
        unlocksToApply: [],
        newEntitiesToSpawn: [],
        growthAccumulatedMs: (worldState.growthAccumulatedMs || 0) + effectiveGrowthMs
    };

    // Progression logic
    const { currentTargetId } = worldState;
    const targetItem = FARM_UNLOCKS[currentTargetId];

    if (targetItem) {
        const requiredMs = targetItem.minutes * 60000;

        // Did we hit the required time?
        if (patch.growthAccumulatedMs >= requiredMs) {

            // Calculate deterministic lifespan
            const lifeDays = quality === 'healthy' ? targetItem.healthyLifeDays : targetItem.weakLifeDays;
            const msPerDay = 24 * 60 * 60 * 1000;
            const expiresAt = Date.now() + (lifeDays * msPerDay);

            // If it's a persistent item, mark it unlocked in the global unlocks registry
            if (!targetItem.isFragile) {
                patch.unlocksToApply.push({
                    key: currentTargetId,
                    variant: quality,
                    expiresAt: lifeDays === 999 ? null : expiresAt
                });
            } else {
                // If it's fragile (crop/grass), we just spawn a new entity
                patch.newEntitiesToSpawn.push({
                    type: currentTargetId,
                    variant: quality,
                    expiresAt,
                    createdAt: Date.now()
                });
            }

            // Reset progression accumulator so user can pick a new target (or UI can handle the clearing)
            // But we can't change currentTargetId here because we want the UI to show "You just grew X!" 
            // So we just zero the accumulator.
            patch.targetCompleted = currentTargetId;
            patch.growthAccumulatedMs = 0;
        }
    }

    return patch;
}

/**
 * Apply a patch to the world state and return the updated state.
 * @param {Object} worldState - current world state
 * @param {Object} patch - from evaluateSession
 * @returns {Object} updated world state
 */
export function applyPatch(worldState, patch) {
    const newState = { ...worldState };

    newState.focusBankMs = (newState.focusBankMs || 0) + patch.focusMsToBank;
    newState.focusSeeds = (newState.focusSeeds || 0) + (patch.focusSeedsToAward || 0);
    newState.growthAccumulatedMs = patch.growthAccumulatedMs;
    newState.lastUpdated = Date.now();

    // Apply persistent unlocks
    if (patch.unlocksToApply.length > 0) {
        newState.unlocks = { ...newState.unlocks };
        for (const unlock of patch.unlocksToApply) {
            newState.unlocks[unlock.key] = {
                state: 'unlocked',
                variant: unlock.variant,
                unlockedAt: Date.now(),
                expiresAt: unlock.expiresAt
            };
        }
    }

    // Apply fragile entities (spawns)
    if (patch.newEntitiesToSpawn.length > 0) {
        newState.plots = [...(newState.plots || [])];
        newState.decor = [...(newState.decor || [])];

        for (const spawn of patch.newEntitiesToSpawn) {
            if (spawn.type === 'grassPatch' || spawn.type === 'flowerBed') {
                const angle = Math.random() * Math.PI * 2;
                const radius = 220 + Math.random() * 180; // edge bias: 220 to 400
                newState.decor.push({
                    id: `dec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    type: spawn.type,
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius,
                    variant: spawn.variant,
                    createdAt: spawn.createdAt,
                    expiresAt: spawn.expiresAt,
                    state: 'alive'
                });
            } else if (spawn.type === 'cropPlant') {
                // Find an empty plot to plant in
                const emptyPlotIndex = newState.plots.findIndex(p => !p.cropId || p.state === 'dead');
                if (emptyPlotIndex !== -1) {
                    const oldPlot = newState.plots[emptyPlotIndex];
                    const newStreak = spawn.variant === 'healthy' ? (oldPlot.streak || 0) + 1 : 0;

                    newState.plots[emptyPlotIndex] = {
                        ...oldPlot,
                        cropId: spawn.type,
                        variant: spawn.variant,
                        createdAt: spawn.createdAt,
                        expiresAt: spawn.expiresAt,
                        state: 'alive',
                        streak: newStreak
                    };
                }
            }
        }
    }

    return newState;
}
