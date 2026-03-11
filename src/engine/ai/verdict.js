/**
 * Verdict Engine - Narrative Weekly Analytics
 * Extracts evidence-based patterns from session history.
 */

export function generateWeeklyVerdict(sessions) {
    if (!sessions || sessions.length < 3) {
        return {
            ready: false,
            message: "Keep focusing! I need at least 3 sessions to generate your first Weekly Verdict."
        };
    }

    const last7Days = sessions.filter(s => {
        const date = new Date(s.startTime);
        const now = new Date();
        return (now - date) < (7 * 24 * 60 * 60 * 1000);
    });

    if (last7Days.length < 3) {
        return {
            ready: false,
            message: "Not enough recent data. Try to complete a few more sessions this week."
        };
    }

    // 1. Analyze Peak Focus Windows
    const hourCounts = {};
    last7Days.forEach(s => {
        const hour = new Date(s.startTime).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    let peakHour = 0;
    let maxSessions = 0;
    Object.entries(hourCounts).forEach(([hour, count]) => {
        if (count > maxSessions) {
            maxSessions = count;
            peakHour = parseInt(hour);
        }
    });

    const timeOfDay = peakHour < 12 ? 'morning' : (peakHour < 17 ? 'afternoon' : 'evening');

    // 2. Analyze Endurance (Average stable duration)
    const stableDurations = last7Days
        .filter(s => (s.focusScoreAvg || 0) > 70)
        .map(s => s.totalDurationMs / 60000);

    const avgStableMins = stableDurations.length > 0
        ? Math.round(stableDurations.reduce((a, b) => a + b, 0) / stableDurations.length)
        : 0;

    // 3. Identify Primary Blocker
    const blockerCounts = {};
    last7Days.forEach(s => {
        if (s.reflection && s.reflection.blocker && s.reflection.blocker !== 'none') {
            blockerCounts[s.reflection.blocker] = (blockerCounts[s.reflection.blocker] || 0) + 1;
        }
    });

    let primaryBlocker = 'none';
    let maxBlockerCount = 0;
    Object.entries(blockerCounts).forEach(([blocker, count]) => {
        if (count > maxBlockerCount) {
            maxBlockerCount = count;
            primaryBlocker = blocker;
        }
    });

    // 4. Synthesize Narrative
    const insights = [];

    insights.push(`Your strongest focus window appears in the **${timeOfDay}**.`);

    if (avgStableMins > 0) {
        insights.push(`You maintain your best flow in blocks of **${avgStableMins} minutes**.`);
    }

    if (primaryBlocker !== 'none') {
        const blockerLabels = {
            'phone': 'Phone notifications',
            'web': 'Web browsing',
            'noise': 'Environmental noise',
            'fatigue': 'Mental fatigue',
            'other': 'External interruptions'
        };
        insights.push(`**${blockerLabels[primaryBlocker] || primaryBlocker}** was your most frequent friction point.`);
    }

    // 5. Practical Adjustment
    let adjustment = "Continue your current rhythm; the data shows consistent progress.";
    if (primaryBlocker === 'phone' || primaryBlocker === 'web') {
        adjustment = "Try using 'Deep Focus' mode for your next morning block to reduce digital friction.";
    } else if (avgStableMins > 60) {
        adjustment = "Your endurance is high. Consider trying a 90-minute 'Monk Mode' session.";
    } else if (avgStableMins < 25 && avgStableMins > 0) {
        adjustment = "Try tightening your sessions to 20-minute Pomodoros to match your current endurance curve.";
    }

    return {
        ready: true,
        summary: `You've completed ${last7Days.length} sessions this week.`,
        insights,
        adjustment,
        stats: {
            peakHour,
            avgStableMins,
            totalSessions: last7Days.length
        }
    };
}
