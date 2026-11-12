// Readiness (SPEC §8). Pure functions over progress records; no clock reads —
// callers pass `now`.

import { isAcceptedResult } from "./matching.js";
import { isMature } from "./srs.js";

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

function accepted(attempt) {
  return attempt && isAcceptedResult(attempt.result);
}

export function vocabReadiness(records, reviewableCount, now) {
  if (!reviewableCount) return null;
  const attempts = [];
  let mature = 0;
  for (const record of records) {
    if (isMature(record.srs)) mature += 1;
    for (const attempt of record.attempts || []) {
      const at = Date.parse(attempt.at);
      if (Number.isFinite(at) && now - at <= WINDOW_DAYS * DAY) attempts.push(attempt);
    }
  }
  if (!attempts.length) return null;
  const correct = attempts.filter(accepted).length;
  const matureRatio = mature / reviewableCount;
  const recall = correct / attempts.length;
  return Math.round(100 * (0.6 * matureRatio + 0.4 * recall));
}

export function skillReadiness(attempts, availableCount, now) {
  const recent = (attempts || [])
    .filter((a) => Number.isFinite(Date.parse(a.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (!recent.length) return null;
  const last20 = recent.slice(0, 20);
  const accuracy = last20.filter(accepted).length / last20.length;
  const distinct = new Set(recent.map((a) => a.contentId).filter(Boolean)).size;
  const coverage = availableCount ? Math.min(1, distinct / availableCount) : 0;
  const days = Math.max(0, (now - Date.parse(recent[0].at)) / DAY);
  const recency = days <= 7 ? 1 : Math.exp(-days / 30);
  return Math.round(100 * (0.5 * accuracy + 0.3 * coverage + 0.2 * recency));
}

export function overallReadiness(skills, weights) {
  const entries = Object.entries(skills).filter(([, value]) => Number.isFinite(value));
  if (!entries.length) return null;
  let weighted = 0;
  let totalWeight = 0;
  for (const [skill, value] of entries) {
    const weight = Number(weights?.[skill] ?? 3);
    weighted += value * weight;
    totalWeight += weight;
  }
  return totalWeight ? Math.round(weighted / totalWeight) : null;
}

export function chapterVocabReadiness(progressRecordsByChapter, itemCountsByChapter, now) {
  const out = {};
  for (const [chapter, records] of Object.entries(progressRecordsByChapter)) {
    out[chapter] = vocabReadiness(records, itemCountsByChapter[chapter] || 0, now);
  }
  return out;
}

export function weakestChapters(chapterReadiness, limit = 3) {
  return Object.entries(chapterReadiness)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}
