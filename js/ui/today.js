import { app } from "../app.js";
import { downloadText, reviewMarkdown, reviewerName } from "../mercury.js";
import { createSession } from "../planner.js";
import { dueVocab, newVocabCount, state, streakDays } from "../state.js";
import { examSummary, last7Days, metrics } from "../metrics.js";
import { MODULE_INFO } from "../exam-format.js";
import { el, pageTitle, progressBar, setBusy, toast } from "./dom.js";
import { emptyState } from "./components.js";

const SKILLS = [
  ["vocab", "Vocabulary"],
  ["grammar", "Grammar"],
  ["listening", "Listening"],
  ["reading", "Reading"],
  ["writing", "Writing"],
  ["speaking", "Speaking"],
];

async function start(minutes, button) {
  setBusy(button, true);
  try {
    app.session = await createSession(minutes);
    app.go("session");
  } catch (error) {
    toast(error.message, "error");
    setBusy(button, false);
  }
}

function hero(now) {
  const minutes = state.settings.sessionMinutes || 30;
  const due = dueVocab(now).length;
  const fresh = newVocabCount();
  const startButton = el("button", { type: "button", class: "btn btn-primary hero-start" }, "▶ Start session");
  startButton.addEventListener("click", () => start(minutes, startButton));
  const quick = el(
    "div",
    { class: "quick-lengths", role: "group", "aria-label": "Session length" },
    ...[10, 30, 45, 60].map((length) => {
      const btn = el("button", { type: "button", class: "btn btn-quiet", "aria-label": `Start a ${length} minute session` }, `${length} min`);
      btn.addEventListener("click", () => start(length, btn));
      return btn;
    }),
  );
  return el(
    "section",
    { class: "card hero" },
    el("p", { class: "eyebrow", text: "TODAY" }),
    el("h1", { class: "hero-title", text: "German, one card at a time" }),
    el("p", { class: "muted", text: `${due} due · ${fresh} new · ${minutes} min default` }),
    startButton,
    el("p", { class: "muted small", text: "No setup. The plan is built from your due cards and weak skills." }),
    quick,
  );
}

function readiness(m) {
  const rows = SKILLS.map(([key, label]) => {
    const value = m.skills[key];
    return el(
      "div",
      { class: "readiness-row" },
      el("span", { class: "readiness-label" }, label, ["writing", "speaking"].includes(key) ? el("span", { class: "muted small", text: " · self-assessed" }) : null),
      value === null
        ? el("span", { class: "muted small", text: "Not enough data yet" })
        : progressBar(value, `${value}%`),
    );
  });
  return el(
    "section",
    { class: "card" },
    el("div", { class: "section-head" }, el("h2", { class: "section-title", text: "Readiness" }), m.overall !== null ? el("strong", { text: `${m.overall}% overall` }) : null),
    ...rows,
    el("p", { class: "muted small", text: "Readiness uses your attempts and the P0 self-assessment weights. Generated or unreviewed items are excluded." }),
  );
}

function stats(now) {
  const streak = streakDays(now);
  const week = last7Days(now);
  return el(
    "section",
    { class: "card stats" },
    el("div", {}, el("strong", { class: "stat-value", text: String(streak) }), el("span", { class: "muted", text: "day streak" })),
    el("div", {}, el("strong", { class: "stat-value", text: String(week.sessions) }), el("span", { class: "muted", text: "sessions / 7d" })),
    el("div", {}, el("strong", { class: "stat-value", text: week.accuracy === null ? "—" : `${week.accuracy}%` }), el("span", { class: "muted", text: "accuracy / 7d" })),
  );
}

function examCard() {
  const summary = examSummary();
  if (!summary.attempted) {
    return el(
      "section",
      { class: "card" },
      el("h2", { class: "section-title", text: "Exam readiness" }),
      el("p", { class: "muted", text: "No exam module recorded yet. Run the Übungssatz 01 trainer or the timed simulator in Train." }),
      el("button", { type: "button", class: "btn btn-secondary", onclick: () => app.go("train") }, "Open exam trainers"),
    );
  }
  const rows = ["hoeren", "lesen", "schreiben", "sprechen"].map((module) => {
    const entry = summary.modules[module];
    return el(
      "p",
      { class: "weak-row" },
      el("span", { text: MODULE_INFO[module].title }),
      el("strong", { text: entry ? `${entry.raw} / ${entry.max_raw}${entry.selfRated ? " · self-rated" : ""}` : "not run" }),
    );
  });
  return el(
    "section",
    { class: "card" },
    el("div", { class: "section-head" },
      el("h2", { class: "section-title", text: "Exam readiness" }),
      summary.attempted === 4 ? el("strong", { text: `${summary.total} / 100 weighted` }) : el("strong", { text: `${summary.attempted} / 4 modules recorded` }),
    ),
    ...rows,
    summary.weakest ? el("p", { class: "muted small", text: `Weakest module: ${MODULE_INFO[summary.weakest.module].title}. The pass rule needs all four modules and ≥ 60 points.` }) : null,
    el("button", { type: "button", class: "btn btn-secondary", onclick: () => app.go("simulator") }, "Timed simulation"),
  );
}

export function renderToday(root) {
  root.append(pageTitle("Today", "Your one-tap plan"));
  if (!state.items.length) {
    root.append(
      emptyState(
        "No content yet",
        "Import the core pack, your chapter audio packs, and the exam packs (exam-ue01 + exam-audio-ue01). Everything stays on this device and works offline afterwards.",
        el("button", { type: "button", class: "btn btn-primary", onclick: () => app.go("more") }, "Go to import"),
      ),
    );
    return;
  }
  const now = Date.now();
  root.append(hero(now));
  const m = metrics(now);
  root.append(readiness(m), stats(now), examCard());
  if (m.weak.length) {
    root.append(
      el(
        "section",
        { class: "card" },
        el("h2", { class: "section-title", text: "Weakest chapters" }),
        ...m.weak.map((weak) =>
          el("p", { class: "weak-row" }, el("span", { text: weak.unit }), el("strong", { text: `${weak.value}%` })),
        ),
      ),
    );
  }
  const name = reviewerName();
  const report = el("button", { type: "button", class: "btn btn-secondary" }, `Download report for ${name}`);
  report.addEventListener("click", () => {
    downloadText(`review-report-${new Date().toISOString().slice(0, 10)}.md`, reviewMarkdown(now));
    toast("Report downloaded", "success");
  });
  root.append(
    el(
      "section",
      { class: "card" },
      el("h2", { class: "section-title", text: "Export review report" }),
      el("p", { class: "muted", text: `A markdown report with weak topics, exam scores, most-missed items and their book pages. Change the reviewer in More → Reviewer.` }),
      report,
    ),
  );
}
