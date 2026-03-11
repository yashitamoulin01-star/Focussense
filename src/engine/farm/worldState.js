// Farm World State Engine
// Manages the persistent state of the pixel-art Farm.

import { applyDeterministicDecay } from './growthEngine.js';

const STORAGE_KEY = 'focussense_farm_world';

// Initial default state if no save exists
const DEFAULT_STATE = {
    version: 1,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    focusBankMs: 0,
    focusSeeds: 0,
    camera: { x: 0, y: 0, zoom: 1 },
    selectedEntityId: null,
    // Progression tracking
    currentTargetId: 'grassPatch',
    growthAccumulatedMs: 0,
    targetStartedAt: null,
    unlocks: {
        pond: { state: 'locked', variant: 'healthy' }, // locked -> unlocked
        house: { state: 'locked', variant: 'healthy' },
    },
    // The dirt plots where crops grow
    plots: [
        { id: 'p1', x: -100, y: 0, cropId: null, growthStage: 0, variant: 'healthy', health: 100, lastWateredAt: null, streak: 0 },
        { id: 'p2', x: 0, y: 0, cropId: null, growthStage: 0, variant: 'healthy', health: 100, lastWateredAt: null, streak: 0 },
        { id: 'p3', x: 100, y: 0, cropId: null, growthStage: 0, variant: 'healthy', health: 100, lastWateredAt: null, streak: 0 },
        { id: 'p4', x: -100, y: 100, cropId: null, growthStage: 0, variant: 'healthy', health: 100, lastWateredAt: null, streak: 0 },
        { id: 'p5', x: 0, y: 100, cropId: null, growthStage: 0, variant: 'healthy', health: 100, lastWateredAt: null, streak: 0 },
        { id: 'p6', x: 100, y: 100, cropId: null, growthStage: 0, variant: 'healthy', health: 100, lastWateredAt: null, streak: 0 },
    ],
    // Animals roaming the farm
    animals: [
        // placeholder for unlocks:
        // { id: 'dog1', type: 'dog', x: 200, y: -50, mood: 'happy', variant: 'healthy', unlockedAt: ... }
    ],
    // Family members
    family: [
        // { id: 'kid1', role: 'kid', x: -200, y: -100, mood: 'happy', unlockedAt: ... }
    ],
    // Cosmetic static decorations (fences, trees)
    decor: [
        { id: 'tree1', type: 'oak_tree', x: -300, y: -200 },
        { id: 'tree2', type: 'pine_tree', x: 300, y: -250 },
    ]
};

let currentState = null;
let subscribers = new Set();

export function getFarmWorld() {
    if (!currentState) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const decayed = applyDeterministicDecay(parsed);

                // If decay mutated the state on load, save it immediately
                if (decayed !== parsed) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(decayed));
                }
                currentState = decayed;
            } else {
                currentState = JSON.parse(JSON.stringify(DEFAULT_STATE)); // clone default
            }
        } catch (e) {
            console.error('Failed to load farm world state', e);
            currentState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        }
    }
    return currentState;
}

export function saveFarmWorld(newState) {
    if (!newState) return;

    currentState = {
        ...newState,
        lastUpdated: Date.now()
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
        notifySubscribers();
    } catch (e) {
        console.error('Failed to save farm world state', e);
    }
}

// Temporary engine connection (to be expanded in Milestone 2/3)
export function applyFocusSessionResults(sessionStats) {
    let state = getFarmWorld();

    // Example: Add focusMs to bank
    const activeFocusMs = Math.max(0, sessionStats.totalDurationMs - sessionStats.totalDriftMs);
    state.focusBankMs += activeFocusMs;

    // Check unlocks based on bank (Simplistic example, will be expanded)
    const bankHours = state.focusBankMs / (1000 * 60 * 60);

    if (bankHours >= 4 && state.unlocks.pond.state === 'locked') {
        state.unlocks.pond.state = 'unlocked';
    }
    if (bankHours >= 6 && state.unlocks.house.state === 'locked') {
        state.unlocks.house.state = 'unlocked';
    }

    saveFarmWorld(state);
}

export function resetFarmWorld() {
    currentState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    try {
        localStorage.removeItem(STORAGE_KEY);
        notifySubscribers();
    } catch (e) {
        console.error('Failed to clear farm world state', e);
    }
}

export function subscribeFarmWorld(callback) {
    subscribers.add(callback);
    // initial blast
    callback(getFarmWorld());
    return () => subscribers.delete(callback);
}

function notifySubscribers() {
    const snap = getFarmWorld();
    subscribers.forEach(cb => cb(snap));
}
