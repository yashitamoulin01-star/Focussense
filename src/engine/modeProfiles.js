// src/engine/modeProfiles.js
// Defines the exact expectations, signals, and rules for each focus mode.

// Enums for config
const low = 'low';
const very_low = 'very_low';
const moderate = 'moderate';
const high = 'high';

export const MODE_PROFILES = {
    coding: {
        id: 'coding',
        label: 'Coding',
        expectedSignals: ['keyboard', 'mouse_bursts'],
        driftRules: {
            idleThresholdMs: 120000, // 2 minutes
            blurGraceMs: 2500,
            typingBurst10sThreshold: null, // Rapid typing is optimal for coding
            penalizeGamingKeys: true, // WASD spam is suspicious in coding
            gamingPattern5sThreshold: 18,
            allowAppSwitches: low,
            suspiciousPatterns: ['gaming_keys'],
            distractingDomains: ['youtube.com', 'twitter.com', 'reddit.com', 'facebook.com', 'instagram.com', 'netflix.com', 'tiktok.com'],
        },
        alertPolicy: { enabled: true, cooldownMs: 600000 }, // 10 minutes
        strictness: 'standard',
    },
    reading: {
        id: 'reading',
        label: 'Reading',
        expectedSignals: ['scroll', 'mouse_periodic', 'keyboard_low'],
        driftRules: {
            idleThresholdMs: 300000, // 5 minutes
            blurGraceMs: 2000,
            typingBurst10sThreshold: 35, // More lenient, but still bounded
            penalizeGamingKeys: true,
            gamingPattern5sThreshold: 12, // WASD spam is drift
            allowAppSwitches: very_low,
            suspiciousPatterns: ['rapid_tab_hop', 'rapid_typing'],
            distractingDomains: ['youtube.com', 'twitter.com', 'reddit.com', 'facebook.com', 'instagram.com', 'netflix.com', 'tiktok.com', 'news.ycombinator.com', 'bbc.com', 'cnn.com'],
        },
        alertPolicy: { enabled: true, cooldownMs: 300000 }, // 5 minutes
        strictness: 'standard',
    },
    assignment: {
        id: 'assignment',
        label: 'Assignment',
        expectedSignals: ['keyboard', 'mouse_periodic', 'scroll'],
        driftRules: {
            idleThresholdMs: 180000, // 3 minutes
            blurGraceMs: 3000,
            typingBurst10sThreshold: null, // Typing is good
            penalizeGamingKeys: true,
            gamingPattern5sThreshold: 15,
            allowAppSwitches: moderate,
            suspiciousPatterns: ['gaming_keys'],
            distractingDomains: ['youtube.com', 'twitter.com', 'reddit.com', 'facebook.com', 'instagram.com', 'netflix.com', 'tiktok.com', 'twitch.tv'],
        },
        alertPolicy: { enabled: true, cooldownMs: 300000 },
        strictness: 'standard',
    },
    working: {
        id: 'working',
        label: 'Working',
        expectedSignals: ['keyboard', 'mouse', 'scroll'],
        driftRules: {
            idleThresholdMs: 180000,
            blurGraceMs: 5000, // More lenient
            typingBurst10sThreshold: null, // Don't police typing rate
            penalizeGamingKeys: true,
            gamingPattern5sThreshold: 20,
            allowAppSwitches: high,
            suspiciousPatterns: [],
            distractingDomains: ['netflix.com', 'tiktok.com', 'instagram.com'], // More lenient for general work
        },
        alertPolicy: { enabled: true, cooldownMs: 900000 },
        strictness: 'relaxed',
    },
    gaming: {
        id: 'gaming',
        label: 'Gaming',
        expectedSignals: ['keyboard_high', 'mouse_high'],
        driftRules: {
            idleThresholdMs: 600000, // 10 minutes
            penalizeGamingKeys: false, // Never penalize WASD in gaming mode
            allowAppSwitches: high,
            suspiciousPatterns: [], // gaming mode doesn't flag gaming
            distractingDomains: [], // No limits in gaming mode
        },
        disableDriftDetection: true, // Turn off drift checking entirely
        alertPolicy: { enabled: false, cooldownMs: 0 },
        strictness: 'relaxed',
    },
    custom: {
        id: 'custom',
        label: 'Custom',
        expectedSignals: ['keyboard', 'mouse'],
        driftRules: {
            idleThresholdMs: 300000,
            blurGraceMs: 3000,
            typingBurst10sThreshold: null,
            penalizeGamingKeys: false, // Default custom is lenient on gaming
            gamingPattern5sThreshold: 15,
            allowAppSwitches: moderate,
            suspiciousPatterns: [],
            distractingDomains: ['youtube.com', 'twitter.com', 'reddit.com', 'facebook.com', 'instagram.com', 'netflix.com', 'tiktok.com'],
        },
        alertPolicy: { enabled: true, cooldownMs: 600000 },
        strictness: 'standard',
    }
};

export function getModeProfile(modeId) {
    return MODE_PROFILES[modeId] || MODE_PROFILES['custom'];
}
