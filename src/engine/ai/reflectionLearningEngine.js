// src/engine/ai/reflectionLearningEngine.js
// Generates intelligent, dynamic reflection questions based on the exact
// session outcome and drift data, outputting structured labels for the DB.

export function generateReflectionQuestions(session, driftEvents = []) {
    const q = [];
    const duration = session.durationMinutes || 0;

    // 1. Completion / Realism Check (Mandatory)
    if (session.intendedTask) {
        q.push({
            id: 'completionMismatch',
            label: `You planned to: "${session.intendedTask}". Did you finish it?`,
            type: 'select',
            options: [
                { value: 'perfect', text: 'Yes, finished perfectly on time' },
                { value: 'underestimated', text: 'No, I underestimated the time needed' },
                { value: 'overestimated', text: 'Finished early, had too much time' }
            ]
        });
    }

    // 2. High Drift Detection
    if (driftEvents.length > 2 || (session.stabilityIndex && session.stabilityIndex < 60)) {
        q.push({
            id: 'distractionCause',
            label: `You had multiple drift events. What was the main cause?`,
            type: 'select',
            options: [
                { value: 'task_too_hard', text: 'Task was too hard / confusing' },
                { value: 'fatigue', text: 'Mental fatigue / energy crash' },
                { value: 'notifications', text: 'External notifications (phone/PC)' },
                { value: 'boredom', text: 'Boredom / low interest' }
            ]
        });
    }

    // 3. Perfect Session (Reward & Reinforce)
    if (driftEvents.length === 0 && session.stabilityIndex > 95) {
        q.push({
            id: 'successFactor',
            label: `Perfect focus session! What helped you stay locked in?`,
            type: 'select',
            options: [
                { value: 'clear_goal', text: 'I had a very clear goal' },
                { value: 'high_energy', text: 'I felt well-rested and energetic' },
                { value: 'music_ambience', text: 'Good music / environment' },
                { value: 'urgency', text: 'Deadline pressure' }
            ]
        });
    }

    // 4. Context-Specific Questions Based on Work Mode
    if (session.workMode === 'coding' || session.workMode === 'programming') {
        q.push({
            id: 'codingBlocker',
            label: `Coding Check-in: What was your main blocker today?`,
            type: 'select',
            options: [
                { value: 'none', text: 'No blockers, smooth sailing' },
                { value: 'bug', text: 'Stuck on a specific bug' },
                { value: 'architecture', text: 'Figuring out how to design/architect it' },
                { value: 'documentation', text: 'Reading documentation / looking up syntax' }
            ]
        });
    } else if (session.workMode === 'study' || session.workMode === 'reading') {
        q.push({
            id: 'studyComprehension',
            label: `Study Check-in: How was your comprehension vs. pacing?`,
            type: 'select',
            options: [
                { value: 'good_both', text: 'Good pace and solid understanding' },
                { value: 'fast_low_comp', text: 'Read fast, but missed some details' },
                { value: 'slow_high_comp', text: 'Read slow, but understood it deeply' },
                { value: 'lost', text: 'Felt confused by the material' }
            ]
        });
    }

    return q;
}

/**
 * Standardize user responses before saving to DB
 */
export function formatReflectionFeedback(rawAnswers) {
    return {
        completionMismatch: rawAnswers.completionMismatch || null,
        distractionCause: rawAnswers.distractionCause || null,
        successFactor: rawAnswers.successFactor || null,
        codingBlocker: rawAnswers.codingBlocker || null,
        studyComprehension: rawAnswers.studyComprehension || null,
        timestamp: new Date().toISOString()
    };
}
