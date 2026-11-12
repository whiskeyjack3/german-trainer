// Exam scoring. Constants and their citations live in exam-format.js; this file
// is pure computation so it can be unit-tested without a browser.
// The 15 raw -> 25 weighted factor is DERIVED (docs/GOETHE_A1_FORMAT.md §8, D027).

import {
  DERIVED_NOTE,
  MODULES,
  PASS_TOTAL,
  RAW_PER_MODULE,
  WEIGHTED_PER_MODULE,
  WEIGHT_FACTOR,
  WRITTEN_MIN,
  WRITTEN_MODULES,
  bandFor,
} from "./exam-format.js";

export { MODULES, RAW_PER_MODULE, WEIGHTED_PER_MODULE, PASS_TOTAL, WEIGHT_FACTOR };

export function weightedScore(raw) {
  if (!Number.isFinite(raw) || raw < 0) throw new Error("raw score must be a non-negative number");
  return raw * WEIGHT_FACTOR;
}

export function roundScore(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @param {Record<string, number|null>} rawByModule raw points per module,
 *   null/absent when the module was not attempted.
 */
export function examResult(rawByModule) {
  const modules = {};
  let total = 0;
  let attempted = 0;
  let written = 0;
  for (const module of MODULES) {
    const raw = rawByModule[module];
    if (!Number.isFinite(raw)) {
      modules[module] = { raw: null, weighted: null };
      continue;
    }
    attempted += 1;
    const weighted = roundScore(weightedScore(raw));
    modules[module] = { raw, weighted };
    total += weighted;
    if (WRITTEN_MODULES.includes(module)) written += weighted;
  }
  total = roundScore(total);
  written = roundScore(written);
  const complete = attempted === MODULES.length;
  return {
    modules,
    attempted,
    complete,
    written,
    total,
    band: bandFor(total),
    pass: complete && total >= PASS_TOTAL,
    // PZ Seite 6: with fewer than 35 written points, 60 can no longer be reached.
    writtenBelow35: written < WRITTEN_MIN,
    note: DERIVED_NOTE,
  };
}
