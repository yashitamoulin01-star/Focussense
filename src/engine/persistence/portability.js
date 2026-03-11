// src/engine/persistence/portability.js
// Data Portability System — Schema validation, migration, and merge strategies.
// Treats export/import as a trustworthy data pipeline, not just a button action.

import {
    getAllSessions,
    saveSession,
    getModeHistory,
    getSettings,
    saveSettings,
    getFocusProfile,
    saveFocusProfile,
    getAllSessions as dbGetAllSessions,
} from '../../data/db.js';

export const SCHEMA_VERSION = 2;
export const APP_VERSION = '0.1.0-alpha';

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Export all data as a structured, versioned JSON backup.
 * This is full-fidelity — suitable for restore operations.
 */
export function exportAsJSON() {
    const sessions = getAllSessions();
    const settings = getSettings();
    const modeHistory = getModeHistory();
    const focusProfile = getFocusProfile();

    const payload = {
        _meta: {
            schemaVersion: SCHEMA_VERSION,
            appVersion: APP_VERSION,
            exportedAt: new Date().toISOString(),
            platform: navigator.platform || 'unknown',
            recordCounts: {
                sessions: sessions.length,
                modeHistory: modeHistory.length,
            },
            exportType: 'full-backup',
        },
        sessions,
        modeHistory,
        settings,
        focusProfile,
    };

    return JSON.stringify(payload, null, 2);
}

/**
 * Export sessions as a flat CSV — suitable for external analysis (Excel, etc.).
 * NOTE: This is NOT a restore format. Clearly labeled in the file.
 */
export function exportAsCSV() {
    const sessions = getAllSessions();
    const headers = [
        'id', 'date', 'startTime', 'endTime', 'durationMin',
        'workMode', 'timerType', 'driftCount', 'focusScoreAvg',
        'longestFocusSegMin', 'mood', 'reflection',
    ];

    const rows = sessions.map(s => {
        const mins = Math.round((s.totalDurationMs || 0) / 60000);
        const longestSegMin = Math.round((s.longestFocusSegmentMs || 0) / 60000);
        const mood = s.reflection?.mood || '';
        const reflection = (s.reflection?.text || '').replace(/,/g, ';').replace(/\n/g, ' ');
        const date = s.startTime ? new Date(s.startTime).toISOString().split('T')[0] : '';
        return [
            s.id, date, s.startTime || '', s.endTime || '', mins,
            s.workMode || s.mode || '', s.timerType || '',
            s.driftCount || 0, s.focusScoreAvg || 0,
            longestSegMin, mood, reflection,
        ].join(',');
    });

    return [
        `# FocusSense Analysis Export — Schema v${SCHEMA_VERSION} — Not a restore format`,
        headers.join(','),
        ...rows,
    ].join('\n');
}

// ─── Import Validation & Migration ───────────────────────────────────────────

/**
 * Validate an import payload. Returns { valid, errors, warnings, schemaVersion }.
 */
export function validateImportFile(raw) {
    const errors = [];
    const warnings = [];
    let data;

    // Parse if string
    try {
        data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        return { valid: false, errors: ['File is not valid JSON: ' + e.message], warnings: [], data: null, schemaVersion: 0 };
    }

    // Detect schema version
    const schemaVersion = data._meta?.schemaVersion || data.schemaVersion || 1;

    // V1 compatibility (old exports without _meta)
    if (!data._meta) {
        warnings.push('Legacy backup format (v1). Will attempt migration to v2.');
    }

    if (schemaVersion > SCHEMA_VERSION) {
        errors.push(`This backup was created with a newer version of FocusSense (schema v${schemaVersion}). Please update the app.`);
        return { valid: false, errors, warnings, data: null, schemaVersion };
    }

    // Validate sessions array
    if (!Array.isArray(data.sessions)) {
        errors.push('Missing or invalid sessions array.');
    } else {
        const invalidSessions = data.sessions.filter(s => !s.id || !s.startTime);
        if (invalidSessions.length > 0) {
            warnings.push(`${invalidSessions.length} session record(s) are missing required fields (id, startTime) and will be skipped.`);
        }
    }

    return { valid: errors.length === 0, errors, warnings, data, schemaVersion };
}

/**
 * Migrate a v1 payload to v2 schema.
 * Handles field renames and structural differences between versions.
 */
export function migrateImportData(data, fromVersion) {
    if (fromVersion === 2) return data; // Already current

    const migrated = { ...data };

    // V1 → V2: add _meta, rename 'mode' to 'workMode' on sessions
    if (!migrated._meta) {
        migrated._meta = {
            schemaVersion: 2,
            exportedAt: data.exportedAt || new Date().toISOString(),
            exportType: 'migrated-backup',
            recordCounts: { sessions: (data.sessions || []).length },
        };
    }

    if (Array.isArray(migrated.sessions)) {
        migrated.sessions = migrated.sessions.map(s => ({
            ...s,
            workMode: s.workMode || s.mode || 'working',
        }));
    }

    return migrated;
}

/**
 * Preview what an import WOULD do — without committing any data.
 * Returns an integrity report to show the user before they confirm.
 */
export function estimateImportImpact(data) {
    const existingSessions = dbGetAllSessions();
    const existingIds = new Set(existingSessions.map(s => s.id));

    const incomingSessions = (data.sessions || []).filter(s => s.id && s.startTime);
    const newSessions = incomingSessions.filter(s => !existingIds.has(s.id));
    const duplicates = incomingSessions.filter(s => existingIds.has(s.id));

    // Rough storage estimate
    const rawSize = JSON.stringify(data).length;
    const storageEstimateKB = Math.round(rawSize / 1024);

    return {
        sessionsToAdd: newSessions.length,
        duplicatesFound: duplicates.length,
        settingsFound: !!data.settings,
        focusProfileFound: !!data.focusProfile,
        modeHistoryFound: Array.isArray(data.modeHistory),
        schemaVersion: data._meta?.schemaVersion || 1,
        storageEstimateKB,
        exportedAt: data._meta?.exportedAt || data.exportedAt || null,
    };
}

// ─── Merge & Import ───────────────────────────────────────────────────────────

export const MERGE_STRATEGIES = {
    merge: 'merge',   // Add new sessions, keep existing. No overwrites.
    replace: 'replace', // Wipe everything and restore from backup.
    sessions_only: 'sessions_only', // Only import sessions, ignore settings.
    settings_only: 'settings_only', // Only import settings, ignore sessions.
};

/**
 * Commit an import using the chosen merge strategy.
 * @param {object} data - Pre-validated, migrated import payload
 * @param {string} strategy - MERGE_STRATEGIES key
 * @returns {{ success: boolean, added: number, message: string }}
 */
export function mergeImportedData(data, strategy = 'merge') {
    try {
        if (strategy === 'replace') {
            // Clear existing sessions and replaced with imported
            localStorage.removeItem('focussense_sessions');
            localStorage.removeItem('focussense_settings');
            localStorage.removeItem('focussense_mode_history');
            localStorage.removeItem('focussense_focus_profile');
        }

        let added = 0;

        if (strategy !== 'settings_only' && Array.isArray(data.sessions)) {
            const existingIds = new Set(dbGetAllSessions().map(s => s.id));
            const toAdd = data.sessions.filter(s => s.id && s.startTime && !existingIds.has(s.id));
            toAdd.forEach(s => saveSession(s));
            added = toAdd.length;
        }

        if (strategy !== 'sessions_only') {
            if (data.settings?.theme) saveSettings(data.settings);
            if (data.focusProfile) saveFocusProfile(data.focusProfile);
        }

        return {
            success: true,
            added,
            message: strategy === 'replace'
                ? `Data replaced. ${data.sessions?.length || 0} sessions restored.`
                : `Successfully added ${added} new session(s).`,
        };
    } catch (e) {
        console.error('Import failed:', e);
        return { success: false, added: 0, message: 'Import failed: ' + e.message };
    }
}

// ─── Data Summary ─────────────────────────────────────────────────────────────

/**
 * Get a summary of local data for the Settings page.
 */
export function getDataSummary() {
    const sessions = dbGetAllSessions();
    const totalFocusMins = Math.round(
        sessions.reduce((sum, s) => sum + (s.totalDurationMs || 0), 0) / 60000
    );

    let dataStorageKB = 0;
    let configStorageKB = 0;

    try {
        const dataKeys = [
            'focussense_sessions', 
            'focussense_drift_events', 
            'focussense_focus_profile', 
            'focussense_mode_history',
            'focussense_activity_events'
        ];
        dataStorageKB = Math.round(
            dataKeys.reduce((sum, k) => sum + (localStorage.getItem(k)?.length || 0), 0) / 1024
        );

        const configKeys = ['focussense_settings', 'focussense_farm_world', 'focussense_agent_heartbeat'];
        configStorageKB = Math.round(
            configKeys.reduce((sum, k) => sum + (localStorage.getItem(k)?.length || 0), 0) / 1024
        );
    } catch (_) { }

    return {
        sessionCount: sessions.length,
        totalFocusHours: Math.round(totalFocusMins / 60 * 10) / 10,
        dataStorageKB,
        configStorageKB,
        storageUsedKB: dataStorageKB + configStorageKB,
        schemaVersion: SCHEMA_VERSION,
        oldest: sessions.length ? sessions[0].startTime : null,
        newest: sessions.length ? sessions[sessions.length - 1].startTime : null,
    };
}
