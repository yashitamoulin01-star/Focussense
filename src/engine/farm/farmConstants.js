// Farm Constants — All unlock thresholds and rules in one configurable place
// Thresholds are in MINUTES of accumulated active focus time.

export const FARM_UNLOCKS = {
    // Plots & crops (Fragile - can die)
    grassPatch: { minutes: 30, label: 'Grass Patch', icon: '🌱', isFragile: true, healthyLifeDays: 5, weakLifeDays: 2 },
    cropPlant: { minutes: 120, label: 'Crop Plant', icon: '🌾', isFragile: true, healthyLifeDays: 5, weakLifeDays: 2 },
    flowerBed: { minutes: 150, label: 'Flower Bed', icon: '🌻', isFragile: true, healthyLifeDays: 6, weakLifeDays: 3 },

    // Structures (Persistent - infinite lifespan, but can become inactive)
    pond: { minutes: 240, label: 'Pond', icon: '💧', isFragile: false, healthyLifeDays: 365, weakLifeDays: 180 },
    house: { minutes: 360, label: 'Farm House', icon: '🏠', requiresBreak: true, isFragile: false, healthyLifeDays: 365, weakLifeDays: 180 },

    // Family (requires house first. Persistent - become sleepy/inactive)
    kid: { minutes: 120, label: 'Kid', icon: '👦', requiresHouse: true, isFragile: false, healthyLifeDays: 60, weakLifeDays: 30 },
    elder1: { minutes: 240, label: 'Elder', icon: '👵', requiresHouse: true, isFragile: false, healthyLifeDays: 180, weakLifeDays: 90 },
    elder2: { minutes: 360, label: 'Elder 2', icon: '👴', requiresHouse: true, isFragile: false, healthyLifeDays: 180, weakLifeDays: 90 },

    // Animals (Persistent, but can wander off if neglected)
    chicken: { minutes: 90, label: 'Chicken', icon: '🐔', isFragile: false, healthyLifeDays: 12, weakLifeDays: 6 },
    dog: { minutes: 150, label: 'Dog', icon: '🐕', isFragile: false, healthyLifeDays: 15, weakLifeDays: 7 },
    cat: { minutes: 180, label: 'Cat', icon: '🐈', isFragile: false, healthyLifeDays: 15, weakLifeDays: 7 },
    cow: { minutes: 270, label: 'Cow', icon: '🐄', isFragile: false, healthyLifeDays: 20, weakLifeDays: 10 },
    duck: { minutes: 330, label: 'Duck', icon: '🦆', isFragile: false, healthyLifeDays: 20, weakLifeDays: 10 },
};

// Growth stage definitions
export const GROWTH_STAGES = {
    SEED: 0,
    SPROUT: 1,
    GROWING: 2,
    MATURE: 3,
    HARVEST: 4,
};

// Quality thresholds
export const QUALITY_THRESHOLDS = {
    // If drift ratio is below this, the session is "healthy"
    healthyMaxDriftRatio: 0.15,  // ≤15% drift = healthy
    // Healthy sessions give +2 growth, weak give +1
    healthyGrowthBonus: 2,
    weakGrowthBonus: 1,
    // Health scores
    healthyScore: 1.0,
    weakScore: 0.6,
};
