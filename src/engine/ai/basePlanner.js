// src/engine/ai/basePlanner.js
// ============================================================
// BASE PLANNER INTELLIGENCE LAYER
// ============================================================
// This file is the cold-start intelligence engine.
// It uses CALIBRATED, INERT PRIORS — not user history.
// It must function perfectly with zero personal data.
//
// LAYER RULES (non-negotiable):
//   - May use: parsed task inputs + coefficients below
//   - May NOT: read user history, write localStorage, imply personal knowledge
//   - May NOT: claim a value is "learned" when it comes from these priors
// ============================================================

// ─── Calibrated Priors (derived offline, inert at runtime) ───────────────────

const CHAPTER_MINUTES = {
  history:       { high: 35, medium: 50, low: 65 },
  social:        { high: 35, medium: 50, low: 65 },
  geography:     { high: 30, medium: 45, low: 60 },
  science:       { high: 40, medium: 55, low: 75 },
  physics:       { high: 45, medium: 62, low: 85 },
  chemistry:     { high: 42, medium: 58, low: 78 },
  biology:       { high: 38, medium: 52, low: 68 },
  math:          { high: 50, medium: 70, low: 95 },
  coding:        { high: 45, medium: 65, low: 85 },
  english:       { high: 25, medium: 38, low: 50 },
  default:       { high: 40, medium: 55, low: 72 },
};

const PAGES_PER_HOUR = {
  history:       { normal: 20, crisis: 35 },
  social:        { normal: 20, crisis: 35 },
  science:       { normal: 16, crisis: 28 },
  math:          { normal: 10, crisis: 16 },
  coding:        { normal: 10, crisis: 16 },
  english:       { normal: 25, crisis: 40 },
  default:       { normal: 18, crisis: 30 },
};

const CONFIDENCE_BAND = (c) => {
  if (c <= 3) return 'low';
  if (c <= 6) return 'medium';
  return 'high';
};

const CONFIDENCE_MULTIPLIER = { high: 1.0, medium: 1.25, low: 1.6 };

const OVERLOAD_THRESHOLD        = 1.25;
const SEVERE_OVERLOAD_THRESHOLD = 1.75;
const AUTO_RESCUE_CONFIDENCE    = 3;  // crisis triggered if confidence ≤ this + tomorrow + large load

// ─── Feasibility Estimator ────────────────────────────────────────────────────

/**
 * Returns a structured feasibility analysis.
 * @param {object} p
 * @param {string}  p.subject
 * @param {number}  p.confidence   0-10
 * @param {number}  p.materialCount
 * @param {string}  p.materialUnit 'chapters' | 'pages' | 'topics'
 * @param {number}  p.availableTimeH
 * @param {string}  p.urgency      'urgent' | 'soon' | 'relaxed'
 * @param {string}  p.goalDepth    'survive' | 'understand' | 'revise' | 'master'
 */
export function estimateFeasibility({
  subject = 'default',
  confidence = 5,
  materialCount = 0,
  materialUnit = 'chapters',
  availableTimeH = 1,
  urgency = 'normal',
  goalDepth = 'understand',
}) {
  const subjectKey = subject.toLowerCase();
  const profile = CHAPTER_MINUTES[subjectKey] || CHAPTER_MINUTES.default;
  const band = CONFIDENCE_BAND(confidence);
  const multiplier = CONFIDENCE_MULTIPLIER[band];

  let estimatedRequiredH = 0;

  if (materialUnit === 'chapters' || materialUnit === 'topics') {
    const minutesPerUnit = profile[band] * multiplier;
    estimatedRequiredH = (materialCount * minutesPerUnit) / 60;
  } else if (materialUnit === 'pages') {
    const pageProfile = PAGES_PER_HOUR[subjectKey] || PAGES_PER_HOUR.default;
    const pph = urgency === 'urgent' ? pageProfile.crisis : pageProfile.normal;
    estimatedRequiredH = materialCount / pph;
    estimatedRequiredH *= multiplier;
  } else {
    estimatedRequiredH = (materialCount * (profile[band] || 50)) / 60;
  }

  // Apply goal-depth adjustment
  if (goalDepth === 'master') estimatedRequiredH *= 1.4;
  if (goalDepth === 'revise') estimatedRequiredH *= 0.85;
  if (goalDepth === 'survive') estimatedRequiredH *= 0.65;

  const ratio = estimatedRequiredH / Math.max(0.5, availableTimeH);
  const isOverloaded = ratio > OVERLOAD_THRESHOLD;
  const isSevere = ratio > SEVERE_OVERLOAD_THRESHOLD;
  const autoRescue =
    confidence <= AUTO_RESCUE_CONFIDENCE &&
    urgency === 'urgent' &&
    materialCount >= 4;

  const severity = isSevere || autoRescue ? 'severe' : isOverloaded ? 'moderate' : 'none';

  return {
    estimatedRequiredH: +estimatedRequiredH.toFixed(2),
    availableTimeH,
    ratio: +ratio.toFixed(2),
    isOverloaded: isOverloaded || autoRescue,
    isSevere: isSevere || autoRescue,
    severity,
    confidenceBand: band,
    subjectUsed: subjectKey in CHAPTER_MINUTES ? subjectKey : 'default',
  };
}

// ─── Mode Selector ────────────────────────────────────────────────────────────

/**
 * Selects the planning mode based on feasibility + task intent.
 * @returns {string} 'normal_focus' | 'exam_rescue' | 'mega_load' | 'revision_sprint' | 'deep_work'
 */
export function selectPlanningMode({ feasibility, urgency, taskIntent, materialCount, materialUnit, confidence }) {
  const { severity, isSevere, isOverloaded } = feasibility;

  // Crisis: exam tomorrow + low confidence + big workload
  if (urgency === 'urgent' && confidence <= AUTO_RESCUE_CONFIDENCE && materialCount >= 4) {
    return 'exam_rescue';
  }

  if (taskIntent === 'exam_prep' && isSevere) return 'exam_rescue';
  if (taskIntent === 'exam_prep' && isOverloaded) return 'exam_rescue';

  if (materialUnit === 'pages' && materialCount >= 80 && isOverloaded) return 'mega_load';
  if (materialCount >= 200) return 'mega_load';

  if (taskIntent === 'revision' && !isOverloaded) return 'revision_sprint';

  if (!isOverloaded && confidence >= 7) return 'deep_work';

  return 'normal_focus';
}

// ─── Next Block Generator ─────────────────────────────────────────────────────

/**
 * Generates the immediate next focus block recommendation.
 * Never returns a trivial short block for overloaded/rescue scenarios.
 */
export function suggestNextBlock({ mode, feasibility, parsedTask, availableTimeH }) {
  const { subject, confidence, materialCount, materialUnit, urgency, goalDepth } = parsedTask;
  const clampedAvailMins = Math.min(availableTimeH * 60, 720);

  switch (mode) {
    case 'exam_rescue': {
      return {
        durationMin: 45,
        breakAfterMin: 10,
        objective: `Chapter Triage: Map all ${materialCount} chapters in priority order. Identify highest-yield sections.`,
        strategy: 'Exam Rescue: Skim table of contents + key terms for each chapter. Do NOT start deep reading yet — map first.',
        why: `With ${materialCount} ${materialUnit} and low familiarity, triage is the highest-value first move. Jumping into reading without a map wastes time.`,
      };
    }

    case 'mega_load': {
      const firstChunk = Math.min(40, Math.floor(materialCount * 0.25));
      return {
        durationMin: 60,
        breakAfterMin: 10,
        objective: `Cover the first ${firstChunk} pages in structured triage mode. Focus on headers, diagrams, and key conclusions only.`,
        strategy: 'Mega Load: Surface-pass the first quarter. Build a mental index before deep dives.',
        why: `${materialCount} ${materialUnit} cannot be covered linearly in one pass. A structural map first makes subsequent blocks far more efficient.`,
      };
    }

    case 'revision_sprint': {
      const duration = Math.min(50, Math.floor(clampedAvailMins * 0.3));
      return {
        durationMin: Math.max(30, duration),
        breakAfterMin: 8,
        objective: `Active recall sprint: Test yourself on each key concept without notes. Write down gaps.`,
        strategy: 'Revision Sprint: Closed-book recall first. Then fix gaps. Minimize re-reading.',
        why: 'Active recall is far more efficient than passive re-reading for revision.',
      };
    }

    case 'deep_work': {
      const duration = Math.min(90, Math.floor(clampedAvailMins * 0.4));
      return {
        durationMin: Math.max(45, duration),
        breakAfterMin: 12,
        objective: `Deep concentration block. Work with complete focus, phone out of reach.`,
        strategy: 'Deep Work: Single-task, no switching. Set clear end goal before starting.',
        why: 'High confidence + low urgency is the ideal condition for deep, high-quality work.',
      };
    }

    default: { // normal_focus
      const band = CONFIDENCE_BAND(confidence);
      const profile = CHAPTER_MINUTES[subject] || CHAPTER_MINUTES.default;
      const baseMins = profile[band] || 45;
      const duration = Math.min(baseMins, 60, clampedAvailMins * 0.5);
      return {
        durationMin: Math.max(25, Math.round(duration)),
        breakAfterMin: duration > 45 ? 10 : 5,
        objective: `Make solid progress on your primary task. Focus on understanding, not completion speed.`,
        strategy: 'Standard Focus: Steady pace, clear micro-goal for this block.',
        why: 'Workload and urgency analysis suggest a focused, balanced session.',
      };
    }
  }
}

// ─── Exam Rescue Plan Builder ─────────────────────────────────────────────────

/**
 * Builds a full multi-block rescue outline for crisis exam scenarios.
 * Returns a structured array of phases.
 */
export function buildExamRescuePlan({ materialCount, materialUnit, subject, availableTimeH, confidence }) {
  const chapters = materialUnit === 'chapters' ? materialCount : Math.ceil(materialCount / 20);
  const hoursLeft = availableTimeH;
  const band = CONFIDENCE_BAND(confidence);

  // Classify chapters into tiers
  const highYield = Math.ceil(chapters * 0.4);
  const medYield  = Math.ceil(chapters * 0.35);
  const lowYield  = chapters - highYield - medYield;

  const outline = [
    {
      phase: 1,
      label: 'Scope Mapping',
      durationMin: 30,
      instruction: `Scan ALL ${chapters} chapter titles, key headings, and summaries. Rank them: high-yield, medium, low. This is your battle map.`,
      method: 'skim + annotate',
    },
  ];

  // High-yield chapters: full engagement blocks
  for (let i = 0; i < highYield; i++) {
    outline.push({
      phase: 2,
      label: `High-Yield: Chapter ${i + 1}`,
      durationMin: band === 'low' ? 55 : 45,
      instruction: `Read core content. Extract: 5 key facts, 3 dates/events (for history), 1 summary sentence. End with a 5-minute closed-book recall quiz.`,
      method: 'read + active recall',
    });
  }

  // Break
  outline.push({ phase: 3, label: 'Recovery Break', durationMin: 15, instruction: 'Away from screen. Walk or stretch.', method: 'break' });

  // Medium-yield chapters: skim blocks
  for (let i = 0; i < medYield; i++) {
    outline.push({
      phase: 4,
      label: `Medium-Yield Skim: Chapter ${highYield + i + 1}`,
      durationMin: 30,
      instruction: `Skim for key terms and 3 core ideas only. Write 1 sentence summary.`,
      method: 'skim + summary',
    });
  }

  // Recall loop
  outline.push({
    phase: 5,
    label: 'Recall Loop',
    durationMin: 25,
    instruction: `Closed-book: Write down everything you remember from HIGH-YIELD chapters. Identify gaps.`,
    method: 'closed-book active recall',
  });

  // Final compression
  outline.push({
    phase: 6,
    label: 'Final Compression',
    durationMin: 20,
    instruction: `Review your notes from this session. Highlight 10 most likely exam points. Practice answering them.`,
    method: 'compression + exam simulation',
  });

  const totalMin = outline.reduce((s, b) => s + b.durationMin, 0);
  const fitsInTime = totalMin <= hoursLeft * 60;

  return {
    outline,
    totalEstimatedMin: totalMin,
    fitsInAvailableTime: fitsInTime,
    honestyCaveat: fitsInTime
      ? 'This plan is ambitious but achievable with strict focus.'
      : `This plan requires ~${Math.round(totalMin / 60 * 10) / 10}h. Full coverage is unlikely — prioritize the high-yield phase strictly.`,
    strategy: `Exam survival mode: prioritize scoring yield over mastery. High-yield first, perfect is the enemy of done.`,
  };
}

// ─── Component Intelligence Strategy Generator ────────────────────────────────

const COMPONENT_LIBRARY = {
  // STEM / Prep
  formulas: { id: 'formulas', text: 'formulas', type: 'stem' },
  worked_examples: { id: 'worked_examples', text: 'solved examples per question type', type: 'stem' },
  derivations: { id: 'derivations', text: 'derivations and proofs', type: 'stem' },
  repeated_types: { id: 'repeated_types', text: 'repeated question patterns', type: 'stem' },
  numericals: { id: 'numericals', text: 'numerical problems', type: 'stem' },

  // Theory / Humanities
  theory_recall: { id: 'theory_recall', text: 'core theory concepts', type: 'theory' },
  definitions: { id: 'definitions', text: 'key definitions and terminology', type: 'theory' },
  timelines: { id: 'timelines', text: 'timelines and cause-effect linking', type: 'theory' },
  diagrams: { id: 'diagrams', text: 'process diagrams and labels', type: 'theory' },
  concept_linking: { id: 'concept_linking', text: 'concept linking and mapping', type: 'theory' },

  // Coding / Technical
  syntax_review: { id: 'syntax_review', text: 'syntax and API familiarity', type: 'code' },
  code_tracing: { id: 'code_tracing', text: 'code tracing / dry runs', type: 'code' },
  edge_cases: { id: 'edge_cases', text: 'edge-case testing', type: 'code' },
  implementation: { id: 'implementation', text: 'implementation reps', type: 'code' },
  architecture: { id: 'architecture', text: 'architecture and pattern planning', type: 'code' },

  // Writing
  outline_first: { id: 'outline_first', text: 'building the structure/outline first', type: 'write' },
  drafting: { id: 'drafting', text: 'rough drafting without pausing', type: 'write' },
  thesis_building: { id: 'thesis_building', text: 'argument/thesis building', type: 'write' },
  
  // General / Meta
  triage: { id: 'triage', text: 'high-yield topic triage', type: 'meta' },
  past_papers: { id: 'past_papers', text: 'past paper questions', type: 'meta' },
  spaced_recall: { id: 'spaced_recall', text: 'closed-book active recall', type: 'meta' },
  error_correction: { id: 'error_correction', text: 'error correction loops', type: 'meta' },
};

function getBaseWeights(subject) {
  const weights = {};
  for (const key in COMPONENT_LIBRARY) weights[key] = 0;

  switch (subject) {
    case 'math':
      weights.formulas = 3; weights.worked_examples = 3; weights.repeated_types = 2; weights.derivations = 1; weights.past_papers = 2;
      break;
    case 'physics':
      weights.formulas = 3; weights.numericals = 3; weights.derivations = 2; weights.diagrams = 1; weights.past_papers = 2;
      break;
    case 'chemistry':
      weights.formulas = 2; weights.numericals = 2; weights.theory_recall = 2; weights.diagrams = 1; weights.definitions = 1;
      break;
    case 'history':
    case 'social':
    case 'geography':
      weights.timelines = 3; weights.theory_recall = 2; weights.definitions = 2; weights.past_papers = 2;
      break;
    case 'biology':
    case 'science':
      weights.diagrams = 3; weights.definitions = 2; weights.theory_recall = 2; weights.spaced_recall = 1;
      break;
    case 'coding':
      weights.implementation = 3; weights.code_tracing = 2; weights.edge_cases = 1; weights.architecture = 2; weights.syntax_review = 1;
      break;
    case 'english':
      weights.outline_first = 3; weights.thesis_building = 2; weights.drafting = 2; weights.theory_recall = 1;
      break;
    default:
      weights.theory_recall = 2; weights.spaced_recall = 2; weights.definitions = 1; weights.past_papers = 1;
      break;
  }
  return weights;
}

function applyModifiers(weights, { urgency, goalDepth, confidence, taskIntent }) {
  // Urgency
  if (urgency === 'urgent') {
    weights.triage += 3;
    weights.past_papers += 3;
    weights.repeated_types += 2;
    weights.theory_recall -= 2;
    weights.derivations -= 1; // Not skipped, just deprioritized unless explicitly needed
    weights.architecture -= 2;
  }

  // Goal Depth
  if (goalDepth === 'survive') {
    weights.triage += 3;
    weights.formulas += 2;
    weights.definitions += 1;
  } else if (goalDepth === 'understand' || goalDepth === 'master') {
    weights.derivations += 2;
    weights.code_tracing += 2;
    weights.architecture += 2;
    weights.theory_recall += 2;
    weights.concept_linking = (weights.concept_linking || 0) + 2; 
  }

  // Confidence
  if (confidence <= 3) {
    weights.formulas += 1;
    weights.theory_recall += 1;
    weights.syntax_review += 2;
    weights.past_papers -= 1; // Too early for past papers if confidence is 0
  } else if (confidence >= 7) {
    weights.edge_cases += 3;
    weights.past_papers += 3;
    weights.error_correction += 2;
    weights.theory_recall -= 2; // Don't re-read what you know
  }

  // Intent
  if (taskIntent === 'revision') {
    weights.spaced_recall += 4;
    weights.error_correction += 2;
    weights.past_papers += 2;
  }
  
  return weights;
}

function rankStrategyComponents(parsedTask) {
  const baseWeights = getBaseWeights(parsedTask.subject);
  const finalWeights = applyModifiers(baseWeights, parsedTask);

  return Object.keys(finalWeights)
    .filter(key => finalWeights[key] > 0)
    .map(key => ({ id: key, text: COMPONENT_LIBRARY[key].text, weight: finalWeights[key] }))
    .sort((a, b) => b.weight - a.weight);
}

function formatStrategyText(ranked) {
  if (ranked.length === 0) return 'Standard focus: Steady pace with micro-goals. Check understanding at end of each section.';

  const topPriority = ranked.slice(0, 2).map(c => c.text).join(' and ');
  let strategy = `Focus first on ${topPriority}.`;

  if (ranked.length > 2) {
    const conditionals = [];
    const lowerRanked = ranked.slice(2, 5); // Take next 3
    
    // Check specific edge cases for safer wording
    if (lowerRanked.find(c => c.id === 'derivations')) {
      conditionals.push('include derivations or proofs only where they carry marks or unlock understanding');
    }
    if (lowerRanked.find(c => c.id === 'past_papers')) {
      conditionals.push('switch back to past paper questions to verify readiness');
    }
    if (lowerRanked.find(c => c.id === 'diagrams')) {
      conditionals.push('draw quick process diagrams where helpful');
    }
    if (lowerRanked.find(c => c.id === 'edge_cases')) {
      conditionals.push('reserve time for debugging edge cases');
    }

    if (conditionals.length > 0) {
      strategy += ` ${conditionals.join(', and ')}.`;
    } else {
      // Generic conditional fallback for other components
      const nextBest = lowerRanked.map(c => c.text).join(' or ');
      strategy += ` Include ${nextBest} if they appear frequently in your syllabus/exams.`;
    }
  }

  // Final sanity injection for extreme urgency
  if (strategy.includes('Focus first on high-yield topic triage')) {
    strategy += ' Perfect is the enemy of done — prioritize coverage over deep mastery right now.';
  }

  return strategy.charAt(0).toUpperCase() + strategy.slice(1);
}

export function getStudyStrategy(parsedTask) {
  const rankedComponents = rankStrategyComponents(parsedTask);
  return formatStrategyText(rankedComponents);
}

// ─── Diagnostics Builder (dev only) ──────────────────────────────────────────

export function buildDiagnostics({ parsedTask, feasibility, mode, personalization, coefficientsUsed }) {
  return {
    _DEV_ONLY: true,
    parsedTask,
    feasibility,
    modeSelected: mode,
    personalizationState: personalization?.state,
    personalizationReason: personalization?.reason,
    coefficientsUsed,
    timestamp: new Date().toISOString(),
  };
}
