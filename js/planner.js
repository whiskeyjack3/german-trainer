// Session creation glue: turns content + progress into a runnable plan.

import { canSpeakGerman } from "./audio.js";
import { chapterMetrics } from "./metrics.js";
import { startSessionLog } from "./progress.js";
import { buildSession, selectCardType } from "./session.js";
import { getSettings } from "./settings.js";
import { dueVocab, exerciseItems, getItem, unitOfId, vocabMeta } from "./state.js";

export function enabledCardTypes(settings = getSettings()) {
  return settings.cardTypes.filter((type) => type !== "listen" || canSpeakGerman());
}

export function drillSeconds(exercise) {
  const count =
    exercise.items?.length ||
    exercise.fields?.length ||
    exercise.fragments?.length ||
    exercise.left?.length ||
    2;
  return 30 + count * 18;
}

export function availableDrills(unit = null, now = Date.now()) {
  const readiness = chapterMetrics(now);
  return exerciseItems()
    .filter((exercise) => exercise.graded)
    .filter((exercise) => !unit || unitOfId(exercise.id) === unit)
    .map((exercise) => ({
      id: exercise.id,
      seconds: drillSeconds(exercise),
      skill: (exercise.tags || []).find((tag) => tag === "listening" || tag === "grammar") || "listening",
      priority: readiness[unitOfId(exercise.id)] ?? 100,
    }))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export async function createSession(minutes, { unit = null, exerciseIds = null, now = Date.now() } = {}) {
  let plan;
  if (exerciseIds && exerciseIds.length) {
    const exercises = exerciseIds.map(getItem).filter(Boolean);
    const steps = exercises.map((exercise) => ({
      kind: "exercise",
      contentId: exercise.id,
      seconds: drillSeconds(exercise),
      skill: (exercise.tags || []).find((tag) => tag === "listening" || tag === "grammar") || null,
    }));
    steps.push({ kind: "wrapup", contentId: null, seconds: 60 });
    plan = { steps, totalSeconds: steps.reduce((sum, step) => sum + step.seconds, 0), breakAt: null };
  } else {
    const dueCards = dueVocab(now).filter((card) => !unit || unitOfId(card.id) === unit);
    plan = buildSession({ minutes, dueCards, drills: availableDrills(unit, now) });
  }

  const types = enabledCardTypes();
  let vocabIndex = 0;
  for (const step of plan.steps) {
    if (step.kind !== "vocab") continue;
    const item = getItem(step.contentId);
    step.cardType = item ? selectCardType(vocabIndex, vocabMeta(item), types) : "de->en";
    vocabIndex += 1;
  }

  const log = await startSessionLog(plan, minutes, now);
  return { plan, log, index: 0, startedAt: now, answered: 0, correct: 0, breakTaken: false };
}
