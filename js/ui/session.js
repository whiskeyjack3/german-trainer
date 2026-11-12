import { app } from "../app.js";
import { isAcceptedResult } from "../matching.js";
import { appendSessionEvent, finishSessionLog, recordExerciseResults, recordVocabAnswer } from "../progress.js";
import { getItem } from "../state.js";
import { el, pageTitle, progressBar, toast } from "./dom.js";
import { renderExercise } from "./exercise.js";
import { renderVocabCard } from "./vocab-card.js";

function stepName(step) {
  if (step.kind === "vocab") return "Vocabulary card";
  if (step.kind === "exercise") return "Book exercise";
  if (step.kind === "warmup") return "Warm-up";
  if (step.kind === "break") return "Break";
  return "Wrap-up";
}

/**
 * "Again" means the card comes back later in the same session (SPEC §7, D038).
 * It is re-shown once more per card; the requeue count is capped so a bad card
 * cannot grow the plan without bound.
 */
function requeueLapsed(session, step) {
  if (step.requeued) return;
  if ((session.requeues || 0) >= 10) return;
  const insertAt = Math.min(session.index + 4, Math.max(1, session.plan.steps.length - 1));
  const repeat = {
    kind: "vocab",
    contentId: step.contentId,
    seconds: step.seconds,
    cardType: step.cardType,
    requeued: true,
  };
  session.plan.steps.splice(insertAt, 0, repeat);
  session.plan.totalSeconds += repeat.seconds;
  session.requeues = (session.requeues || 0) + 1;
}

function summary(session) {
  return el(
    "section",
    { class: "card" },
    el("h2", { text: "Session complete" }),
    el("p", { class: "muted", text: `${session.answered} answers · ${session.correct} correct` }),
    el("p", { class: "muted", text: "Your progress is saved on this device. Re-importing content will not reset it." }),
    el("button", { type: "button", class: "btn btn-primary", onclick: () => app.go("today") }, "Back to Today"),
  );
}

async function finish(root, session, completed = true) {
  if (!session.finished) {
    session.log = await finishSessionLog(session.log, { completed, breakTaken: session.breakTaken, now: Date.now() });
    session.finished = true;
    session.completed = completed;
  }
  root.replaceChildren(pageTitle(completed ? "Session" : "Session ended"), summary(session));
}

async function tick(root, session, event, extra = {}) {
  const now = Date.now();
  session.log = await appendSessionEvent(session.log, { type: "step", ...event }, now);
  session.index += 1;
  if (session.index >= session.plan.steps.length) {
    await finish(root, session, true);
  } else {
    renderSession(root);
  }
}

function warmupStep(root, session, step) {
  const card = el(
    "section",
    { class: "card" },
    el("p", { class: "card-type", text: "Warm-up" }),
    el("h2", { text: "Ready for your session?" }),
    el("p", { class: "muted", text: `Plan: ${session.plan.steps.filter((s) => s.kind === "vocab").length} vocabulary cards, ${session.plan.steps.filter((s) => s.kind === "exercise").length} book exercises.` }),
    el("button", {
      type: "button",
      class: "btn btn-primary",
      onclick: () => tick(root, session, { kind: "warmup", contentId: null, result: "done" }),
    }, "Start"),
  );
  root.append(card);
}

function breakStep(root, session, step) {
  const card = el(
    "section",
    { class: "card" },
    el("p", { class: "card-type", text: "Break" }),
    el("h2", { text: "Take a short break" }),
    el("p", { class: "muted", text: "Stand up, drink water, look away from the screen. Your place is saved." }),
    el("button", {
      type: "button",
      class: "btn btn-primary",
      onclick: () => {
        session.breakTaken = true;
        tick(root, session, { kind: "break", contentId: null, result: "taken" });
      },
    }, "Continue"),
  );
  root.append(card);
}

function wrapupStep(root, session, step) {
  const card = el(
    "section",
    { class: "card" },
    el("p", { class: "card-type", text: "Wrap-up" }),
    el("h2", { text: "Nice work" }),
    el("p", { class: "muted", text: `${session.answered} answers · ${session.correct} correct` }),
    el("button", {
      type: "button",
      class: "btn btn-primary",
      onclick: () => tick(root, session, { kind: "wrapup", contentId: null, result: "done" }),
    }, "Finish session"),
  );
  root.append(card);
}

export function renderSession(root) {
  const session = app.session;
  if (!session) {
    app.go("today");
    return;
  }
  root.replaceChildren();
  const step = session.plan.steps[session.index];
  if (!step) {
    finish(root, session, true);
    return;
  }
  const total = session.plan.steps.length;
  root.append(
    pageTitle(stepName(step), `${session.plan.totalSeconds ? Math.round(session.plan.totalSeconds / 60) : ""} min plan`),
    el(
      "div",
      { class: "session-progress" },
      progressBar(Math.round((session.index / total) * 100), `${session.index + 1} / ${total}`),
      el("button", {
        type: "button",
        class: "btn btn-quiet",
        onclick: async () => {
          if (!window.confirm("End this session? Finished cards are already saved.")) return;
          await finish(root, session, false);
        },
      }, "End"),
    ),
  );

  if (step.kind === "warmup") return warmupStep(root, session, step);
  if (step.kind === "break") return breakStep(root, session, step);
  if (step.kind === "wrapup") return wrapupStep(root, session, step);

  const item = getItem(step.contentId);
  if (!item) {
    toast("This item is missing; skipping.", "error");
    tick(root, session, { kind: step.kind, contentId: step.contentId, result: "missing" });
    return;
  }

  if (step.kind === "vocab") {
    root.append(
      renderVocabCard(item, step.cardType || "de->en", async (outcome) => {
        await recordVocabAnswer(item, { ...outcome, now: Date.now() });
        if (!isAcceptedResult(outcome.result)) requeueLapsed(session, step);
        session.answered += 1;
        if (isAcceptedResult(outcome.result)) session.correct += 1;
        await tick(root, session, {
          kind: "vocab",
          contentId: item.id,
          result: outcome.result,
          cardType: outcome.cardType,
        });
      }),
    );
  } else if (step.kind === "exercise") {
    root.append(
      renderExercise(item, async (results) => {
        await recordExerciseResults(item, results, Date.now());
        session.answered += results.length;
        session.correct += results.filter(isAcceptedResult).length;
        await tick(root, session, {
          kind: "exercise",
          contentId: item.id,
          result: results.every(isAcceptedResult) ? "exact" : "no_match",
        });
      }),
    );
  }
}
