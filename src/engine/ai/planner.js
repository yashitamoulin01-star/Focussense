// src/engine/ai/planner.js
// ============================================================
// PLANNER ORCHESTRATOR — v4 (Cold-Start Intelligence)
// ============================================================
// PIPELINE (in order, no exceptions):
//   1. taskParser         — rich signal extraction
//   2. basePlanner        — feasibility + mode selection
//   3. basePlanner        — next block + outline generation
//   4. plannerMemory      — personalization check (null if insufficient)
//   5. explanationBuilder — deterministic, honest copy
//
// KEY RULES:
//   - Base planner runs for ALL users, always
//   - Personalization only activates after real sufficient history
//   - No fallback invented durations
//   - No fake profile-memory language
// ============================================================

import { MODE_PROFILES } from '../modeProfiles.js';
import { getPlannerAdvisory, hasEnoughPredictorData } from '../analytics/predictor.js';
import { parseTaskComplexity } from './taskParser.js';
import {
  estimateFeasibility,
  selectPlanningMode,
  suggestNextBlock,
  buildExamRescuePlan,
  getStudyStrategy,
  buildDiagnostics,
} from './basePlanner.js';
import {
  estimateTaskDuration,
  getPersonalizationState,
  getMemoryProfile,
} from './plannerMemory.js';
import { buildPlanExplanation } from './explanationBuilder.js';

const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/**
 * Main entry point — planSession
 * Runs the full planner pipeline and returns a structured result.
 */
export function planSession(input) {
  const {
    task = '',
    difficulty = 'medium',
    timeAvailableValue,
    timeAvailableUnit = 'hours',
    distractions,
    goalType,
    urgency,
    materialSize,
    materialUnit,
  } = input || {};

  const taskLower = (task || '').toLowerCase().trim();

  // ── STAGE 1: Rich Task Parsing ──────────────────────────────
  const parsedTask = parseTaskComplexity(taskLower, {
    materialSize: Number(materialSize) || 0,
    materialUnit: materialUnit || 'pages',
    urgency,
    goalType,
    timeAvailableValue,
    timeAvailableUnit,
  });

  // ── STAGE 2: Feasibility & Overload Analysis ────────────────
  const feasibility = estimateFeasibility({
    subject: parsedTask.subject,
    confidence: parsedTask.confidence,
    materialCount: parsedTask.materialCount,
    materialUnit: parsedTask.materialUnit,
    availableTimeH: parsedTask.availableTimeH,
    urgency: parsedTask.urgency,
    goalDepth: parsedTask.goalDepth,
  });

  // ── STAGE 3: Mode Selection ─────────────────────────────────
  const mode = selectPlanningMode({
    feasibility,
    urgency: parsedTask.urgency,
    taskIntent: parsedTask.taskIntent,
    materialCount: parsedTask.materialCount,
    materialUnit: parsedTask.materialUnit,
    confidence: parsedTask.confidence,
  });

  // ── STAGE 4: Next Block + Outline ───────────────────────────
  const nextBlock = suggestNextBlock({
    mode,
    feasibility,
    parsedTask,
    availableTimeH: parsedTask.availableTimeH,
  });

  let outline = [];
  if (mode === 'exam_rescue') {
    const rescuePlan = buildExamRescuePlan({
      materialCount: parsedTask.materialCount || 8,
      materialUnit: parsedTask.materialUnit,
      subject: parsedTask.subject,
      availableTimeH: parsedTask.availableTimeH,
      confidence: parsedTask.confidence,
    });
    outline = rescuePlan.outline;
    nextBlock._rescueCaveat = rescuePlan.honestyCaveat;
    nextBlock._rescueStrategy = rescuePlan.strategy;
  } else if (mode === 'mega_load') {
    outline = buildMegaLoadOutline(parsedTask);
  }

  // ── STAGE 5: Personalization (only if sufficient real history) ──
  const profile = getMemoryProfile();
  const personalization = getPersonalizationState(profile, {
    subject: parsedTask.subject,
    taskIntent: parsedTask.taskIntent,
  });

  let personalizedDuration = null;
  if (personalization.state === 'sufficient') {
    personalizedDuration = estimateTaskDuration(taskLower, {
      subject: parsedTask.subject,
      taskIntent: parsedTask.taskIntent,
    });
  }

  const finalDuration = personalizedDuration || nextBlock.durationMin;

  // ── STAGE 6: Explanation (deterministic, honest) ────────────
  const explanation = buildPlanExplanation({
    mode,
    parsedTask,
    personalization: { ...personalization, used: !!personalizedDuration },
    feasibility,
    nextBlock: { ...nextBlock, durationMin: finalDuration },
  });

  // ── Mode → UI label ──────────────────────────────────────────
  const modeId = resolveBaseMode(parsedTask);
  const modeProfile = MODE_PROFILES[modeId] || MODE_PROFILES.working;

  // ── Predictor advisory (only informational) ──────────────────
  let patternAdvisory = null;
  try {
    if (hasEnoughPredictorData()) patternAdvisory = getPlannerAdvisory({ mode: modeId });
  } catch (_) {}

  // ── Diagnostics (dev builds only) ──────────────────────────
  const diagnostics = IS_DEV
    ? buildDiagnostics({
        parsedTask,
        feasibility,
        mode,
        personalization: { ...personalization, used: !!personalizedDuration },
        coefficientsUsed: { subject: parsedTask.subject, confidenceBand: feasibility.confidenceBand },
      })
    : undefined;

  return {
    // Public API shape
    suggestedMode: modeId,
    modeLabel: modeProfile.label,
    plannerMode: mode,                          // 'exam_rescue' | 'normal_focus' | etc.
    duration: finalDuration,
    breakPlan: buildBreakPlan(finalDuration, parsedTask.urgency),
    strategy: getStudyStrategy({
      subject: parsedTask.subject,
      urgency: parsedTask.urgency,
      taskIntent: parsedTask.taskIntent,
      goalDepth: parsedTask.goalDepth,
      confidence: parsedTask.confidence,
    }),
    sessionObjective: nextBlock.objective,
    audioSuggestion: recommendAudio({ modeId, difficulty, urgency: parsedTask.urgency }),
    reasoning: explanation.reasoning,
    warning: explanation.warningText,
    basisText: explanation.basisText,
    outline,

    // Structured output (for future UI)
    structured: {
      parsedTask,
      feasibility,
      mode,
      basis: {
        source: personalizedDuration ? 'personalized' : 'base_intelligence',
        reason: explanation.basisText,
      },
      warning: explanation.warningText,
      nextBlock: { ...nextBlock, durationMin: finalDuration },
      outline,
      personalization: { ...personalization, used: !!personalizedDuration },
      explanation,
    },

    metadata: {
      goalType: parsedTask.taskIntent,
      urgency: parsedTask.urgency,
      materialSize: parsedTask.materialCount,
      materialUnit: parsedTask.materialUnit,
      distraction: distractions,
      cognitiveLoadScore: parsedTask.complexityScore,
      personalizationState: personalization.state,
    },

    ...(diagnostics ? { diagnostics } : {}),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMegaLoadOutline(parsedTask) {
  const total = parsedTask.materialCount;
  const chunkSize = Math.ceil(total / 4);
  return [
    { phase: 1, label: 'Structural Scan', durationMin: 30, instruction: `Skim all ${total} ${parsedTask.materialUnit}. Map key sections, chapters, and densities.` },
    { phase: 2, label: `First Quarter (1–${chunkSize})`, durationMin: 60, instruction: 'Deep pass on first quarter. Extract key concepts and create index notes.' },
    { phase: 3, label: 'Break', durationMin: 15, instruction: 'Full recovery break. Away from screen.' },
    { phase: 4, label: `Second Quarter (${chunkSize + 1}–${chunkSize * 2})`, durationMin: 60, instruction: 'Continue at the same depth.' },
    { phase: 5, label: 'Recall Loop', durationMin: 20, instruction: 'Closed-book recall of first half.' },
    { phase: 6, label: 'Remaining Sections', durationMin: 60, instruction: 'Cover remaining material at informed pace.' },
  ];
}

function resolveBaseMode({ taskIntent, subject, urgency }) {
  if (taskIntent === 'exam_prep' || taskIntent === 'revision') return 'reading';
  if (subject === 'coding' || taskIntent === 'problem_solving') return 'coding';
  if (taskIntent === 'assignment') return 'assignment';
  return 'working';
}

function buildBreakPlan(duration, urgency) {
  if (duration <= 30) return 'No break needed. Stay in the zone.';
  if (duration <= 50) return '1 short reset break (5m) halfway through.';
  return urgency === 'urgent'
    ? '1 tactical break (5–8m). Do not fully disconnect.'
    : '1 full recovery break (10m). Step away completely.';
}

function recommendAudio({ modeId, difficulty, urgency }) {
  if (urgency === 'urgent') return 'Pure Brown Noise (maximum blocking)';
  if (modeId === 'coding') return 'Minimalist Lo-fi';
  if (difficulty === 'hard') return 'Deep Alpha Waves';
  return 'Silent Environment';
}
