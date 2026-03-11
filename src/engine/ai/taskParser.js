// src/engine/ai/taskParser.js
// ============================================================
// TASK PARSER — Rich signal extraction from text + UI metadata
// ============================================================
// Produces a structured task object. Nothing here is user memory.
// Output feeds basePlanner and planner pipeline ONLY.
// ============================================================

const SUBJECT_PATTERNS = {
  history:   /(history|social studies|civics|political science|ancient|medieval|modern history)/i,
  social:    /(social science|economics|sociology|political)/i,
  geography: /(geography|geo|maps|climate|environment)/i,
  math:      /(math|maths|mathematics|algebra|calculus|geometry|trigonometry|statistics)/i,
  physics:   /(physics|mechanics|optics|electricity|thermodynamics|waves)/i,
  chemistry: /(chemistry|organic|inorganic|periodic table|reactions|chem)/i,
  biology:   /(biology|bio|genetics|cells|ecology|botany|zoology|anatomy)/i,
  science:   /(science|scientific)/i,
  coding:    /(code|coding|programming|software|algorithm|javascript|python|react|data structure)/i,
  english:   /(english|essay|grammar|literature|poem|prose|comprehension|writing)/i,
};

const LOW_CONFIDENCE_PHRASES = [
  'know nothing', 'knowing nothing', 'zero knowledge', 'no knowledge',
  'from scratch', 'start fresh', 'starting fresh', 'haven\'t started',
  'not started', 'never studied', 'no idea', 'complete beginner',
  'haven\'t done anything', 'not done anything', 'haven\'t covered',
  'know absolutely nothing', 'i know nothing', 'dont know anything',
  'don\'t know anything',
];

const MEDIUM_CONFIDENCE_PHRASES = [
  'not much', 'very little', 'barely', 'weak', 'vague idea',
  'some topics', 'few chapters', 'half done', 'some revision',
];

const HIGH_CONFIDENCE_PHRASES = [
  'revised', 'done revision', 'mostly done', 'almost complete',
  'good understanding', 'confident', 'just need to revise',
];

const EXAM_URGENCY_PHRASES = [
  'exam tomorrow', 'test tomorrow', 'paper tomorrow', 'tomorrow exam',
  'exam today', 'test today', 'tonight exam', 'exam in the morning',
  'last minute', 'urgent', 'asap', 'due today', 'deadline today',
  'need to pass', 'must pass', 'tomorrow', 'tonight',
];

const NEAR_URGENCY_PHRASES = [
  'exam this week', 'few days', '2 days', '3 days', 'this weekend',
  'deadline soon', 'coming up', 'next few days',
];

const INTENT_PATTERNS = {
  exam_prep:          /(exam|test|paper|quiz|assessment|board|finals|midterm)/i,
  revision:           /(revise|revision|review|recap|brush up|revisit)/i,
  concept_learning:   /(learn|understand|study|concept|topic|chapter)/i,
  memorization:       /(memorize|memorise|remember|recall|mug up|learn by heart)/i,
  problem_solving:    /(problem|exercise|questions|practice|solve|numericals)/i,
  assignment:         /(assignment|homework|submission|project|writeup|report)/i,
};

/**
 * Main parser. Takes raw text + UI metadata (from form fields).
 * Returns a structured object — NEVER reads user profile or history.
 *
 * @param {string} taskText - free-form text from the user
 * @param {object} metadata - { materialSize, materialUnit, urgency, goalType, availableTimeH }
 * @returns {object} parsedTask
 */
export function parseTaskComplexity(taskText, metadata = {}) {
  const text = (taskText || '').toLowerCase();

  // ── Subject detection ──────────────────────────────────────
  let subject = 'default';
  for (const [key, pattern] of Object.entries(SUBJECT_PATTERNS)) {
    if (pattern.test(text)) { subject = key; break; }
  }

  // ── Confidence detection ───────────────────────────────────
  let confidence = 5; // default: medium
  if (LOW_CONFIDENCE_PHRASES.some(p => text.includes(p))) {
    confidence = 0;
  } else if (MEDIUM_CONFIDENCE_PHRASES.some(p => text.includes(p))) {
    confidence = 2;
  } else if (HIGH_CONFIDENCE_PHRASES.some(p => text.includes(p))) {
    confidence = 8;
  }
  // Numeric confidence override if somehow provided in metadata
  if (typeof metadata.confidence === 'number') confidence = metadata.confidence;

  // ── Urgency / exam proximity ───────────────────────────────
  let urgency = metadata.urgency || 'normal';
  let examProximity = null;

  if (EXAM_URGENCY_PHRASES.some(p => text.includes(p))) {
    urgency = 'urgent';
    examProximity = 'imminent';
  } else if (NEAR_URGENCY_PHRASES.some(p => text.includes(p))) {
    urgency = 'soon';
    examProximity = 'near';
  }

  // Override from UI if provided
  if (metadata.urgency === 'high' || metadata.urgency === 'urgent') {
    urgency = 'urgent';
    if (!examProximity) examProximity = 'imminent';
  } else if (metadata.urgency === 'medium' || metadata.urgency === 'soon') {
    urgency = 'soon';
    if (!examProximity) examProximity = 'near';
  }

  // ── Material count + unit ──────────────────────────────────
  let materialCount = Number(metadata.materialSize) || 0;
  let materialUnit  = metadata.materialUnit || 'pages';

  // Try to extract from text if not in metadata
  if (!materialCount) {
    const chMatch = text.match(/(\d+)\s*chapter/);
    if (chMatch) { materialCount = parseInt(chMatch[1]); materialUnit = 'chapters'; }
    const pgMatch = text.match(/(\d+)\s*page/);
    if (!materialCount && pgMatch) { materialCount = parseInt(pgMatch[1]); materialUnit = 'pages'; }
    const topicMatch = text.match(/(\d+)\s*topic/);
    if (!materialCount && topicMatch) { materialCount = parseInt(topicMatch[1]); materialUnit = 'topics'; }
  }

  // ── Available time ─────────────────────────────────────────
  let availableTimeH = metadata.availableTimeH || 1;
  if (metadata.timeAvailableValue) {
    availableTimeH = parseInt(metadata.timeAvailableValue) || 1;
    if (metadata.timeAvailableUnit === 'minutes') availableTimeH /= 60;
    if (metadata.timeAvailableUnit === 'days') availableTimeH *= 8;
  }

  // Extract from text if missing
  if (!metadata.availableTimeH && !metadata.timeAvailableValue) {
    const hMatch = text.match(/(\d+)\s*hour/);
    if (hMatch) availableTimeH = parseInt(hMatch[1]);
    const minMatch = text.match(/(\d+)\s*min/);
    if (!hMatch && minMatch) availableTimeH = parseInt(minMatch[1]) / 60;
  }

  // ── Task intent detection ──────────────────────────────────
  let taskIntent = 'concept_learning';
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(text)) { taskIntent = intent; break; }
  }
  // Override: goalType from UI
  if (metadata.goalType === 'study') taskIntent = taskIntent === 'concept_learning' ? 'exam_prep' : taskIntent;

  // ── Goal depth inference ───────────────────────────────────
  let goalDepth = 'understand';
  if (confidence <= 2 && urgency === 'urgent') goalDepth = 'survive';
  else if (confidence <= 4 && urgency === 'urgent') goalDepth = 'understand';
  else if (confidence >= 7) goalDepth = taskIntent === 'revision' ? 'revise' : 'understand';
  else if (taskIntent === 'revision') goalDepth = 'revise';

  // ── Cognitive demand estimate ──────────────────────────────
  let cognitiveDemand = 'medium';
  if (confidence <= 2 && materialCount >= 4 && urgency === 'urgent') cognitiveDemand = 'extreme';
  else if (confidence <= 4 || materialCount >= 80 || subject === 'math') cognitiveDemand = 'high';
  else if (confidence >= 7 && materialCount < 30) cognitiveDemand = 'low';

  // ── Legacy compat fields (for planRanker/old callers) ─────
  const complexityScore = Math.min(10, 5
    + (cognitiveDemand === 'extreme' ? 4 : cognitiveDemand === 'high' ? 2 : 0)
    + (confidence <= 2 ? 2 : confidence <= 4 ? 1 : 0)
    + (urgency === 'urgent' ? 1 : 0)
  );

  const isHeavyCognitiveLoad = cognitiveDemand === 'extreme' || cognitiveDemand === 'high';

  return {
    raw: taskText,
    subject,
    confidence,
    urgency,
    examProximity,
    materialCount,
    materialUnit,
    availableTimeH,
    taskIntent,
    goalDepth,
    cognitiveDemand,
    // Legacy compat
    complexityScore,
    isHeavyCognitiveLoad,
    estimatedVolume: materialCount > 0 ? `${materialCount} ${materialUnit}` : 'unknown',
    recommendedMinDuration: isHeavyCognitiveLoad ? 45 : 25,
  };
}
