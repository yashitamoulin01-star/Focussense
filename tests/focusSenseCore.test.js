// tests/focusSenseCore.test.js
// Lightweight unit tests for FocusSense core logic.
// Uses plain assertions — no test framework required.
// Run with: node tests/focusSenseCore.test.js

let passed = 0;
let failed = 0;

function assert(label, condition) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${label}`);
        failed++;
    }
}

function assertEqual(label, actual, expected) {
    assert(`${label} (expected: ${expected}, got: ${actual})`, actual === expected);
}

// ─── 1. Streak Calculation ────────────────────────────────────────────────────
console.log('\n📅 Streak Calculation');
{
    function computeStreaks(sessions) {
        if (!sessions.length) return { current: 0, longest: 0 };
        const daySet = new Set(sessions.map(s => new Date(s.startTime).toISOString().split('T')[0]));
        const days = [...daySet].sort();
        let longest = 1, streak = 1;
        for (let i = 1; i < days.length; i++) {
            const diff = Math.round((new Date(days[i]) - new Date(days[i - 1])) / 86400000);
            if (diff === 1) { streak++; if (streak > longest) longest = streak; } else streak = 1;
        }
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const last = days[days.length - 1];
        const current = (last === today || last === yesterday) ? streak : 0;
        return { current, longest };
    }

    // No sessions
    const r0 = computeStreaks([]);
    assertEqual('No sessions → current streak = 0', r0.current, 0);
    assertEqual('No sessions → longest streak = 0', r0.longest, 0);

    // Single session today
    const todayISO = new Date().toISOString();
    const r1 = computeStreaks([{ startTime: todayISO }]);
    assertEqual('Single session today → current = 1', r1.current, 1);
    assertEqual('Single session today → longest = 1', r1.longest, 1);

    // 3 consecutive days ending today
    const d = (offset) => new Date(Date.now() - offset * 86400000).toISOString();
    const r2 = computeStreaks([{ startTime: d(2) }, { startTime: d(1) }, { startTime: d(0) }]);
    assertEqual('3 consecutive days → current = 3', r2.current, 3);
    assertEqual('3 consecutive days → longest = 3', r2.longest, 3);

    // Gap in streak (2 sessions with a 3-day gap)
    const r3 = computeStreaks([
        { startTime: d(10) }, { startTime: d(9) }, { startTime: d(8) },
        { startTime: d(3) }, { startTime: d(2) }, { startTime: d(1) }
    ]);
    assertEqual('Broken streak → longest = 3', r3.longest, 3);
    assertEqual('Broken streak → current = 3 (3 days ending yesterday)', r3.current, 3);

    // Old streak, not active today
    const r4 = computeStreaks([{ startTime: d(10) }, { startTime: d(9) }]);
    assertEqual('Old streak not active → current = 0', r4.current, 0);
    assertEqual('Old streak not active → longest = 2', r4.longest, 2);
}

// ─── 2. Confidence Scoring ────────────────────────────────────────────────────
console.log('\n🔬 Confidence Scoring');
{
    const MIN_PER_BAND = 2;
    const FULL_CONFIDENCE = 8;

    function getPredictionConfidence(count) {
        if (count < MIN_PER_BAND) return { level: 'none', label: null };
        if (count < 3) return { level: 'low', label: 'Early Signal' };
        if (count < FULL_CONFIDENCE) return { level: 'medium', label: 'Moderate Confidence' };
        return { level: 'high', label: 'Strong Pattern' };
    }

    assertEqual('0 sessions → none', getPredictionConfidence(0).level, 'none');
    assertEqual('1 session → none', getPredictionConfidence(1).level, 'none');
    assertEqual('2 sessions → low', getPredictionConfidence(2).level, 'low');
    assertEqual('2 sessions label', getPredictionConfidence(2).label, 'Early Signal');
    assertEqual('3 sessions → medium', getPredictionConfidence(3).level, 'medium');
    assertEqual('7 sessions → medium', getPredictionConfidence(7).level, 'medium');
    assertEqual('8 sessions → high', getPredictionConfidence(8).level, 'high');
    assertEqual('8 sessions label', getPredictionConfidence(8).label, 'Strong Pattern');
    assertEqual('100 sessions → high', getPredictionConfidence(100).level, 'high');
}

// ─── 3. Import Validation ─────────────────────────────────────────────────────
console.log('\n📦 Import Validation');
{
    const SCHEMA_VERSION = 2;

    function validateImportFile(raw) {
        const errors = [], warnings = [];
        let data;
        try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; }
        catch (e) { return { valid: false, errors: ['Invalid JSON: ' + e.message], warnings: [], data: null, schemaVersion: 0 }; }

        const schemaVersion = data._meta?.schemaVersion || data.schemaVersion || 1;
        if (!data._meta) warnings.push('Legacy format (v1). Migration required.');
        if (schemaVersion > SCHEMA_VERSION) {
            errors.push(`Schema v${schemaVersion} is newer than current app (v${SCHEMA_VERSION}).`);
            return { valid: false, errors, warnings, data: null, schemaVersion };
        }
        if (!Array.isArray(data.sessions)) errors.push('Missing sessions array.');
        else {
            const invalid = data.sessions.filter(s => !s.id || !s.startTime);
            if (invalid.length) warnings.push(`${invalid.length} session(s) missing required fields.`);
        }
        return { valid: errors.length === 0, errors, warnings, data, schemaVersion };
    }

    // Valid v2 backup
    const v2 = JSON.stringify({ _meta: { schemaVersion: 2 }, sessions: [{ id: '1', startTime: '2025-01-01' }] });
    const r1 = validateImportFile(v2);
    assert('Valid v2 backup → valid=true', r1.valid);
    assertEqual('Valid v2 backup → schemaVersion=2', r1.schemaVersion, 2);
    assertEqual('Valid v2 backup → no errors', r1.errors.length, 0);

    // Invalid JSON
    const r2 = validateImportFile('{broken json');
    assert('Invalid JSON → valid=false', !r2.valid);
    assert('Invalid JSON → has error', r2.errors.length > 0);

    // Too-new schema version
    const newer = JSON.stringify({ _meta: { schemaVersion: 99 }, sessions: [] });
    const r3 = validateImportFile(newer);
    assert('Schema v99 > current → valid=false', !r3.valid);

    // Missing sessions array
    const noSessions = JSON.stringify({ _meta: { schemaVersion: 2 } });
    const r4 = validateImportFile(noSessions);
    assert('No sessions array → valid=false', !r4.valid);

    // V1 (legacy) format — no _meta
    const v1 = JSON.stringify({ sessions: [{ id: '1', startTime: '2025-01-01' }] });
    const r5 = validateImportFile(v1);
    assert('v1 legacy → valid=true (with warning)', r5.valid);
    assert('v1 legacy → has migration warning', r5.warnings.length > 0);

    // Sessions with missing fields
    const partial = JSON.stringify({ _meta: { schemaVersion: 2 }, sessions: [{ id: '1' }, { startTime: '2025-01-01' }, { id: '2', startTime: '2025-01-02' }] });
    const r6 = validateImportFile(partial);
    assert('Partial sessions → valid=true with warning', r6.valid);
    assert('Partial sessions → warning about missing fields', r6.warnings.some(w => w.includes('missing')));
}

// ─── 4. Duplication Detection ─────────────────────────────────────────────────
console.log('\n🔍 Duplicate Detection');
{
    function countDuplicates(incomingSessions, existingIds) {
        return incomingSessions.filter(s => existingIds.has(s.id)).length;
    }
    function countNew(incomingSessions, existingIds) {
        return incomingSessions.filter(s => !existingIds.has(s.id)).length;
    }

    const existing = new Set(['s1', 's2', 's3']);
    const incoming = [
        { id: 's1', startTime: '2025-01-01' },  // duplicate
        { id: 's4', startTime: '2025-01-02' },  // new
        { id: 's5', startTime: '2025-01-03' },  // new
    ];

    assertEqual('Duplicate count = 1', countDuplicates(incoming, existing), 1);
    assertEqual('New session count = 2', countNew(incoming, existing), 2);

    const allNew = [{ id: 's6' }, { id: 's7' }];
    assertEqual('All new → duplicates = 0', countDuplicates(allNew, existing), 0);
    assertEqual('All new → new count = 2', countNew(allNew, existing), 2);

    const allDup = [{ id: 's1' }, { id: 's2' }];
    assertEqual('All duplicates → new count = 0', countNew(allDup, existing), 0);
    assertEqual('All duplicates → dup count = 2', countDuplicates(allDup, existing), 2);
}

// ─── 5. Snapshot Privacy Filter ───────────────────────────────────────────────
console.log('\n🔐 Snapshot Privacy');
{
    const PRIVACY_MODES = {
        minimal: { includeStreak: false, includeStability: false, includeTimestamps: false },
        standard: { includeStreak: true, includeStability: false, includeTimestamps: false },
        detailed: { includeStreak: true, includeStability: true, includeTimestamps: false },
    };

    function applyPrivacy(raw, modeId) {
        const mode = PRIVACY_MODES[modeId];
        const out = { totalFocusMinutes: raw.totalFocusMinutes, completedSessions: raw.completedSessions };
        if (mode.includeStreak) out.currentStreak = raw.currentStreak;
        if (mode.includeStability) out.avgStability = raw.avgStability;
        if (mode.includeTimestamps) out.createdAt = raw.createdAt;
        return out;
    }

    const raw = { totalFocusMinutes: 120, completedSessions: 5, currentStreak: 3, avgStability: 78, createdAt: '2025-01-01' };

    const minimal = applyPrivacy(raw, 'minimal');
    assert('Minimal: no streak', minimal.currentStreak === undefined);
    assert('Minimal: no stability', minimal.avgStability === undefined);
    assert('Minimal: no timestamp', minimal.createdAt === undefined);
    assert('Minimal: has sessions', minimal.completedSessions === 5);

    const standard = applyPrivacy(raw, 'standard');
    assert('Standard: has streak', standard.currentStreak === 3);
    assert('Standard: no stability', standard.avgStability === undefined);

    const detailed = applyPrivacy(raw, 'detailed');
    assert('Detailed: has streak', detailed.currentStreak === 3);
    assert('Detailed: has stability', detailed.avgStability === 78);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed.`);
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}
