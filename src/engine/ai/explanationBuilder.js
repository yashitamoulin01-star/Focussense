// src/engine/ai/explanationBuilder.js
// ============================================================
// EXPLANATION BUILDER — Deterministic, honesty-preserving copy
// ============================================================
// HONESTY CONTRACT (non-negotiable rules):
//   - Never claim observed personal behavior unless personalization.used === true
//   - Never say "Based on your Profile Memory" or "historically" for new users
//   - Never imply the user has patterns they haven't created
//   - All text is driven by structured planner state — never ad hoc
// ============================================================

/**
 * Builds a user-facing explanation string.
 * All wording is determined by structured state, never invented.
 *
 * @param {object} opts
 * @param {string} opts.mode
 * @param {object} opts.parsedTask
 * @param {object} opts.personalization  { state, used, reason }
 * @param {object} opts.feasibility      { estimatedRequiredH, ratio, severity }
 * @param {object} opts.nextBlock
 */
export function buildPlanExplanation({ mode, parsedTask, personalization, feasibility, nextBlock }) {
  const { state: personState, used: personUsed } = personalization || {};

  // ── Basis text (who/what produced this recommendation) ────
  let basisText;
  if (personUsed && personState === 'sufficient') {
    basisText = 'Adjusted using your recent session patterns.';
  } else {
    basisText = 'Recommended based on workload and urgency analysis.';
  }

  // ── Warning text ───────────────────────────────────────────
  let warningText = null;
  if (mode === 'exam_rescue') {
    warningText = '⚠️ Exam Rescue Mode — full coverage in this timeframe is unlikely. Prioritizing high-yield chapters and recall efficiency.';
  } else if (mode === 'mega_load') {
    warningText = '⚠️ Large workload detected — multi-block strategy engaged. Realistic chunking applied.';
  }

  // ── Strategy text ──────────────────────────────────────────
  let strategyText = nextBlock?.strategy || '';

  // ── Full reasoning string (for backward compat display) ───
  let reasoning = basisText;
  if (mode === 'exam_rescue' || mode === 'mega_load') {
    const reqH = feasibility?.estimatedRequiredH;
    if (reqH) {
      reasoning += ` Estimated effort for this workload: ~${reqH}h. `;
      reasoning += `Your planner has switched to ${mode === 'exam_rescue' ? 'Exam Rescue' : 'Multi-Block'} mode.`;
    }
  }

  return { basisText, warningText, strategyText, reasoning };
}

// ─── Legacy single-string builder (kept for backward compat) ─────────────────
// Used by older callers expecting a single string from explanationBuilder.

export function buildPlanExplanationLegacy(bestPlan, taskAnalysis, historicalMemory, personalization) {
  const personState = personalization?.state || 'none';

  if (taskAnalysis.cognitiveDemand === 'extreme' || taskAnalysis.isHeavyCognitiveLoad) {
    return `This task has high workload (${taskAnalysis.estimatedVolume !== 'unknown' ? taskAnalysis.estimatedVolume : 'large volume'}). Recommended ${bestPlan.durationMin || bestPlan.duration}m block. Recommended based on workload and urgency analysis.`;
  }

  if (personState === 'sufficient' && historicalMemory) {
    return `Adjusted using your recent session patterns.`;
  }

  return `Recommended based on workload and urgency analysis.`;
}
