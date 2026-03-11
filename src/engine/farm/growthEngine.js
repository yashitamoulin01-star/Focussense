// Growth Engine — Handles deterministic state transitions based on expiresAt timestamps
// Separated from unlockEvaluator so time-based logic can run on load.

/**
 * Apply time-based decay deterministically using `expiresAt` timestamps.
 * If current time has passed `expiresAt`, the entity transitions to dead/inactive.
 * 
 * @param {Object} worldState - current world state
 * @returns {Object} mutated worldState with updated entity states
 */
export function applyDeterministicDecay(worldState) {
    const now = Date.now();
    let mutated = false;
    const newState = { ...worldState };

    // Function to check and update an entity's state based on expiresAt
    const checkState = (entity, isFragile) => {
        if (!entity || !entity.expiresAt || entity.state === 'dead' || entity.state === 'inactive') return false;

        // If time has passed the expiration date
        if (now > entity.expiresAt) {
            entity.state = isFragile ? 'dead' : 'inactive';
            return true;
        }

        // Optional: Implement a 'wilted' warning state e.g. 24h before death
        const msPerDay = 24 * 60 * 60 * 1000;
        if (entity.state === 'alive' && now > (entity.expiresAt - msPerDay)) {
            entity.state = 'wilted';
            return true;
        }

        return false;
    };

    // Check Plots (Crops are fragile)
    if (newState.plots) {
        newState.plots = newState.plots.map(plot => {
            if (plot.cropId && plot.state !== 'dead') {
                const updatedPlot = { ...plot };
                if (checkState(updatedPlot, true)) {
                    mutated = true;
                    // If a crop dies, we might clear it or leave it as a dead sprite
                    // We will leave it as state: 'dead' so the UI can render a dead plant
                }
                return updatedPlot;
            }
            return plot;
        });
    }

    // Check Decor (Grass/Flowers are fragile)
    if (newState.decor) {
        newState.decor = newState.decor.map(deco => {
            const updatedDeco = { ...deco };
            if (checkState(updatedDeco, true)) {
                mutated = true;
            }
            return updatedDeco;
        });
    }

    // Check Animals (Persistent, but become inactive/wander off)
    if (newState.animals) {
        newState.animals = newState.animals.map(animal => {
            const updatedAnimal = { ...animal };
            if (checkState(updatedAnimal, false)) {
                mutated = true;
            }
            return updatedAnimal;
        });
    }

    // Unlocks like house/pond are persistent. We can check them too if needed.
    if (newState.unlocks) {
        let unlocksMutated = false;
        const newUnlocks = { ...newState.unlocks };

        for (const [key, unlock] of Object.entries(newUnlocks)) {
            if (unlock.state === 'unlocked' && unlock.expiresAt) {
                if (now > unlock.expiresAt) {
                    newUnlocks[key] = { ...unlock, state: 'inactive' };
                    unlocksMutated = true;
                    mutated = true;
                } else if (!unlock.variant || unlock.variant === 'healthy') { // Not wilted yet
                    // No complex wilting for buildings yet, keep it simple
                }
            }
        }
        if (unlocksMutated) {
            newState.unlocks = newUnlocks;
        }
    }

    if (mutated) {
        newState.lastUpdated = now;
    }

    return mutated ? newState : worldState; // Return same ref if no changes
}
