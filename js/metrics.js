// Dashboard metrics: readiness per skill, weak chapters, due counts.
// Everything is a pure read of `state` plus the caller's `now`.

import {
  chapterOfUnit,
  exerciseItems,
  reviewableVocab,
  state,
  unitOfId,
  vocabItems,
} from "./state.js";
import { isAcceptedResult } from "./matching.js";
import { overallReadiness, skillReadiness, vocabReadiness, weakestChapters } from "./readiness.js";
import { examItems, latestExamResults } from "./exam.js";

function recordsForUnit(unit) {
  return [...state.progress.values()].filter((record) => unitOfId(record.contentId) === unit);
}

function attemptsForSkill(skill) {
  const attempts = [];
  for (const record of state.progress.values()) {
    const item = state.byId.get(record.contentId);
    if (!item || !(item.tags || []).includes(skill)) continue;
    for (const attempt of record.attempts || []) attempts.push({ ...attempt, contentId: record.contentId });
  }
  return attempts;
}

export function chapterMetrics(now) {
  const units = new Map();
  for (const item of vocabItems()) {
    const unit = unitOfId(item.id);
    if (!units.has(unit)) units.set(unit, { total: 0, records: [] });
    const entry = units.get(unit);
    if (!item.needs_review) entry.total += 1;
    const record = state.progress.get(item.id);
    if (record) entry.records.push(record);
  }
  const out = {};
  for (const [unit, entry] of units.entries()) {
    out[unit] = vocabReadiness(entry.records, entry.total, now);
  }
  return out;
}

export function metrics(now) {
  const vocab = vocabReadiness(
    [...state.progress.values()].filter((record) => record.contentId.includes("-v-")),
    reviewableVocab().length,
    now,
  );
  const grammarExercises = exerciseItems().filter((item) => (item.tags || []).includes("grammar") && item.graded);
  const listeningExercises = exerciseItems().filter((item) => (item.tags || []).includes("listening") && item.graded);
  const readingExercises = exerciseItems().filter((item) => (item.tags || []).includes("reading") && item.graded);
  const exams = examItems();
  const examListening = exams.filter((item) => item.module === "hoeren").length;
  const examReading = exams.filter((item) => item.module === "lesen").length;
  const examWriting = exams.filter((item) => item.module === "schreiben").length;
  const examSpeaking = exams.filter((item) => item.module === "sprechen").length;
  const grammar = skillReadiness(attemptsForSkill("grammar"), grammarExercises.length, now);
  const listening = skillReadiness(attemptsForSkill("listening"), listeningExercises.length + examListening, now);
  const reading = skillReadiness(attemptsForSkill("reading"), readingExercises.length + examReading, now);
  const writing = skillReadiness(attemptsForSkill("writing"), examWriting, now);
  const speaking = skillReadiness(attemptsForSkill("speaking"), examSpeaking, now);
  const skills = {
    vocab,
    grammar,
    listening,
    reading,
    writing,
    speaking,
  };
  const overall = overallReadiness(skills, state.settings?.weights);
  const chapters = chapterMetrics(now);
  const weak = weakestChapters(chapters, 3).map(([unit, value]) => ({
    unit,
    chapter: chapterOfUnit(unit),
    value,
  }));
  return { skills, overall, chapters, weak };
}

/** Latest recorded raw/weighted result per exam module (self-rated flag kept). */
export function examSummary() {
  const latest = latestExamResults();
  const modules = {};
  for (const module of ["hoeren", "lesen", "schreiben", "sprechen"]) {
    modules[module] = latest[module] || null;
  }
  const attempted = Object.values(modules).filter(Boolean);
  const total = attempted.length
    ? Math.round(attempted.reduce((sum, entry) => sum + (entry.weighted || 0), 0) * 100) / 100
    : null;
  const lastAt = attempted.length
    ? attempted.map((entry) => entry.at).sort().at(-1)
    : null;
  const weakest = attempted
    .filter((entry) => Number.isFinite(entry.raw) && Number.isFinite(entry.max_raw))
    .map((entry) => ({ module: entry.module, ratio: entry.raw / entry.max_raw }))
    .sort((a, b) => a.ratio - b.ratio || a.module.localeCompare(b.module))[0] || null;
  return { modules, attempted: attempted.length, total, lastAt, weakest };
}

export function last7Days(now) {
  const from = now - 7 * 24 * 60 * 60 * 1000;
  let attempts = 0;
  let correct = 0;
  for (const record of state.progress.values()) {
    for (const attempt of record.attempts || []) {
      const at = Date.parse(attempt.at);
      if (!Number.isFinite(at) || at < from) continue;
      attempts += 1;
      if (isAcceptedResult(attempt.result)) correct += 1;
    }
  }
  const sessions = state.sessions.filter((session) => {
    const at = Date.parse(session.started_at);
    return Number.isFinite(at) && at >= from && session.completed;
  });
  return { attempts, correct, sessions: sessions.length, accuracy: attempts ? Math.round((100 * correct) / attempts) : null };
}

export function mostMissed(limit = 10) {
  const rows = [];
  for (const record of state.progress.values()) {
    const missed = (record.attempts || []).filter((attempt) => !isAcceptedResult(attempt.result)).length;
    if (!missed) continue;
    const item = state.byId.get(record.contentId);
    if (!item) continue;
    rows.push({ item, missed, record });
  }
  return rows.sort((a, b) => b.missed - a.missed || String(a.item.id).localeCompare(String(b.item.id))).slice(0, limit);
}
