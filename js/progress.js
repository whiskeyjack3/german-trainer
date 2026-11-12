// Writes to the progress / sessions stores. Content records are never touched.

import { put } from "./db.js";
import { isAcceptedResult } from "./matching.js";
import { newSrs, reviewSrs } from "./srs.js";
import { state } from "./state.js";

function baseRecord(item, now) {
  const existing = state.progress.get(item.id);
  return (
    existing || {
      schemaVersion: 1,
      contentId: item.id,
      contentType: item.id.split("-")[2] === "v" ? "vocab" : item.id.split("-")[2] === "g" ? "grammar" : "exercise",
      srs: newSrs(now),
      attempts: [],
      first_seen: new Date(now).toISOString(),
      last_review: null,
      review_count: 0,
      correct_count: 0,
      meta: {},
    }
  );
}

export async function recordVocabAnswer(item, { result, quality, seconds, cardType, now }) {
  const existing = baseRecord(item, now);
  const isNew = (existing.review_count || 0) === 0;
  const record = {
    ...existing,
    schemaVersion: 1,
    contentType: "vocab",
    srs: reviewSrs(existing.srs, quality, now, isNew),
    attempts: [
      ...(existing.attempts || []),
      {
        at: new Date(now).toISOString(),
        result,
        card_type: cardType,
        quality,
        seconds: Math.max(0, Math.round(seconds || 0)),
      },
    ],
    last_review: new Date(now).toISOString(),
    review_count: (existing.review_count || 0) + 1,
    correct_count: (existing.correct_count || 0) + (isAcceptedResult(result) ? 1 : 0),
  };
  await put("progress", record);
  state.progress.set(record.contentId, record);
  return record;
}

export async function recordExerciseResults(item, results, now) {
  const existing = baseRecord(item, now);
  const attempts = results.map((result) => ({
    at: new Date(now).toISOString(),
    result,
    card_type: "exercise",
    quality: isAcceptedResult(result) ? 4 : 0,
    seconds: 0,
  }));
  const correct = results.filter(isAcceptedResult).length;
  const record = {
    ...existing,
    schemaVersion: 1,
    contentType: "exercise",
    srs: existing.srs || newSrs(now),
    attempts: [...(existing.attempts || []), ...attempts],
    last_review: new Date(now).toISOString(),
    review_count: (existing.review_count || 0) + results.length,
    correct_count: (existing.correct_count || 0) + correct,
  };
  await put("progress", record);
  state.progress.set(record.contentId, record);
  return record;
}

/**
 * Exam module attempt (one record per set+module). `outcome` comes from
 * exam.js: {raw, max, weighted, units:[{number, result, quality}], selfRated, runId}.
 * The raw/weighted score is kept in meta.exam so the dashboard and the review
 * export can show it without recomputing from attempts.
 */
export async function recordExamModule(item, outcome, now = Date.now()) {
  const existing = baseRecord(item, now);
  const units = outcome.units || [];
  const attempts = units.map((unit) => ({
    at: new Date(now).toISOString(),
    result: unit.result,
    card_type: "exam",
    quality: Number.isFinite(unit.quality) ? unit.quality : isAcceptedResult(unit.result) ? 5 : 0,
    seconds: 0,
  }));
  const correct = attempts.filter((attempt) => isAcceptedResult(attempt.result)).length;
  const record = {
    ...existing,
    schemaVersion: 1,
    contentType: "exam",
    srs: existing.srs || newSrs(now),
    attempts: [...(existing.attempts || []), ...attempts],
    last_review: new Date(now).toISOString(),
    review_count: (existing.review_count || 0) + attempts.length,
    correct_count: (existing.correct_count || 0) + correct,
    meta: {
      ...(existing.meta || {}),
      exam: {
        setId: item.exam_set?.id || null,
        module: item.module,
        raw: outcome.raw,
        max_raw: outcome.max,
        weighted: outcome.weighted,
        selfRated: Boolean(outcome.selfRated),
        run_id: outcome.runId || null,
        at: new Date(now).toISOString(),
      },
    },
  };
  await put("progress", record);
  state.progress.set(record.contentId, record);
  return record;
}

export async function startSessionLog(plan, minutes, now) {
  const session = {
    schemaVersion: 1,
    sessionId: `s-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    started_at: new Date(now).toISOString(),
    ended_at: null,
    target_minutes: minutes,
    plan: plan.steps.map(({ kind, contentId, seconds }) => ({
      kind,
      contentId: contentId ?? null,
      seconds,
    })),
    events: [],
    completed: false,
    break_taken: false,
  };
  await put("sessions", session);
  state.sessions.unshift(session);
  return session;
}

export async function appendSessionEvent(session, event, now) {
  const updated = {
    ...session,
    events: [...(session.events || []), { at: new Date(now).toISOString(), ...event }],
  };
  await put("sessions", updated);
  const index = state.sessions.findIndex((s) => s.sessionId === updated.sessionId);
  if (index >= 0) state.sessions[index] = updated;
  return updated;
}

export async function finishSessionLog(session, { completed = true, breakTaken = false, now } = {}) {
  const updated = {
    ...session,
    completed,
    break_taken: breakTaken || Boolean(session.break_taken),
    ended_at: new Date(now || Date.now()).toISOString(),
  };
  await put("sessions", updated);
  const index = state.sessions.findIndex((s) => s.sessionId === updated.sessionId);
  if (index >= 0) state.sessions[index] = updated;
  return updated;
}
