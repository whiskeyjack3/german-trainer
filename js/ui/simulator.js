import { app } from "../app.js";
import { MODULE_INFO } from "../exam-format.js";
import { examItems, latestExamResults } from "../exam.js";
import { examResult } from "../scoring.js";
import { el, pageTitle, progressBar } from "./dom.js";
import { renderExamRun } from "./exam-run.js";
import { renderSchreiben } from "./schreiben.js";
import { renderSprechen } from "./sprechen.js";

const ORDER = ["hoeren", "lesen", "schreiben", "sprechen"];
const INFO = MODULE_INFO;

function rendererFor(module) {
  if (module === "schreiben") return renderSchreiben;
  if (module === "sprechen") return renderSprechen;
  return (root, options) => renderExamRun(root, module, options);
}

function startScreen(root) {
  const set = examItems()[0]?.exam_set;
  const table = el(
    "table",
    { class: "score-table" },
    el("thead", {}, el("tr", {}, el("th", { text: "Module" }), el("th", { text: "Time" }), el("th", { text: "Points" }))),
    el("tbody", {}, ...ORDER.map((module) => el("tr", {}, el("td", { text: INFO[module].title }), el("td", { text: `${INFO[module].minutes} min` }), el("td", { text: "25" })))),
    el("tfoot", {}, el("tr", {}, el("td", { text: "Total" }), el("td", { text: "ca. 80 min" }), el("td", { text: "100" }))),
  );
  const start = el("button", { type: "button", class: "btn btn-primary btn-wide" }, "Start full simulation");
  start.addEventListener("click", () => {
    app.sim = { runId: `sim-${Date.now().toString(36)}`, index: 0, results: {}, startedAt: Date.now() };
    app.go("simulator");
  });
  const last = latestExamResults();
  const lastRows = ORDER.filter((module) => last[module]).map((module) =>
    el("p", { class: "weak-row" }, el("span", { text: INFO[module].title }), el("strong", { text: `${last[module].raw} / ${last[module].max_raw}` })),
  );
  root.append(
    pageTitle("Exam simulator", set ? `${set.label} · official timings` : "Official timings"),
    el(
      "section",
      { class: "card" },
      el("p", { class: "muted", text: "A timed run of the four official modules, in exam order. Each module is scored immediately; the result screen applies the official pass rule. Your answers are saved per module, so leaving mid-run keeps the modules you finished." }),
      table,
      el("p", { class: "muted small", text: "Weighting: each module has 15 raw points and contributes 25 points (factor 5/3, derived — confirm the Durchführungsbestimmungen; D027)." }),
      el("p", { class: "muted small", text: "Hören uses the official Übungssatz 01 audio; Schreiben and Sprechen are self-assessed with the official rubrics." }),
      start,
      el("div", { class: "button-row" },
        el("button", { type: "button", class: "btn btn-quiet", onclick: () => app.go("exam-hoeren") }, "Hören study"),
        el("button", { type: "button", class: "btn btn-quiet", onclick: () => app.go("exam-lesen") }, "Lesen study"),
        el("button", { type: "button", class: "btn btn-quiet", onclick: () => app.go("exam-schreiben") }, "Schreiben study"),
        el("button", { type: "button", class: "btn btn-quiet", onclick: () => app.go("exam-sprechen") }, "Sprechen study"),
      ),
    ),
    lastRows.length ? el("section", { class: "card" }, el("h2", { class: "section-title", text: "Last recorded module scores" }), ...lastRows) : null,
  );
}

function resultScreen(root) {
  const sim = app.sim;
  const rawByModule = {};
  for (const module of ORDER) rawByModule[module] = sim.results[module]?.raw ?? null;
  const result = examResult(rawByModule);
  const writtenDone = ["hoeren", "lesen", "schreiben"].filter((module) => sim.results[module]).length;
  const rows = ORDER.map((module) => {
    const entry = result.modules[module];
    const info = INFO[module];
    return el(
      "tr",
      { class: entry.raw === null ? "score-missing" : "" },
      el("td", {}, el("strong", { text: info.title }), el("br"), el("span", { class: "muted small", text: `${info.minutes} min` })),
      el("td", { text: entry.raw === null ? "not run" : `${entry.raw} / 15` }),
      el("td", { text: entry.weighted === null ? "—" : `${entry.weighted.toFixed(2)} / 25` }),
      el("td", { text: entry.raw === null ? "not run" : sim.results[module]?.selfRated ? "self-rated" : "auto-graded" }),
    );
  });
  const verdict = result.complete
    ? result.pass
      ? `Passed — ${result.band.label}`
      : `Not passed — ${result.band.label}`
    : `Incomplete — ${result.attempted} of 4 modules run`;
  const writtenText = writtenDone === 3
    ? `Written part: ${result.written.toFixed(2)} / 75. ${result.writtenBelow35 ? "Below 35 written points: the official rule says 60 can no longer be reached, even with full oral marks (PZ Seite 6)." : "Pass line: 60 points with all four modules attempted (PZ Seite 6)."}`
    : `Written part: ${result.written.toFixed(2)} / 75 from ${writtenDone} of 3 written modules. Run the full simulation for a pass/fail verdict.`;
  const restart = el("button", { type: "button", class: "btn btn-primary" }, "Start a new simulation");
  restart.addEventListener("click", () => {
    app.sim = null;
    app.go("simulator");
  });
  root.append(
    pageTitle("Simulation result", `Run ${new Date(sim.startedAt).toLocaleString()}`),
    el(
      "section",
      { class: result.pass ? "card result-pass" : "card result-fail" },
      el("p", { class: "eyebrow", text: "GOETHE-ZERTIFIKAT A1 · START DEUTSCH 1" }),
      el("h2", { class: "result-total", text: `${result.total.toFixed(2)} / 100` }),
      el("p", { class: "result-verdict", text: verdict }),
      el("p", { class: "muted", text: writtenText }),
      table(rows),
      el("p", { class: "muted small", text: result.note }),
      el("p", { class: "muted small", text: "Schreiben/Sprechen scores are your own rubric ratings, so treat them as practice estimates, not an examiner's result." }),
      el("div", { class: "button-row" }, restart, el("button", { type: "button", class: "btn btn-secondary", onclick: () => app.go("today") }, "Open dashboard")),
    ),
  );
}

function table(rows) {
  return el(
    "table",
    { class: "score-table" },
    el("thead", {}, el("tr", {}, el("th", { text: "Module" }), el("th", { text: "Raw" }), el("th", { text: "Weighted" }), el("th", { text: "Scoring" }))),
    el("tbody", {}, ...rows),
  );
}

export function renderSimulator(root) {
  if (!examItems().length) {
    root.append(
      pageTitle("Exam simulator", "Official Übungssatz 01"),
      el("section", { class: "card empty-state" },
        el("h2", { text: "Exam pack not imported" }),
        el("p", { class: "muted", text: "Import exam-ue01.zip and exam-audio-ue01.zip in More → Content packs, then start the simulator." }),
      ),
    );
    return;
  }
  if (!app.sim) {
    startScreen(root);
    return;
  }
  if (app.sim.index >= ORDER.length) {
    resultScreen(root);
    return;
  }
  const module = ORDER[app.sim.index];
  const info = MODULE_INFO[module];
  root.append(
    el("section", { class: "sim-strip" },
      el("div", { class: "section-head" },
        el("strong", { text: `Simulation · module ${app.sim.index + 1} of 4` }),
        el("span", { class: "muted small", text: `Next: ${info.title} · ${info.minutes} min` }),
      ),
      progressBar(Math.round((app.sim.index / ORDER.length) * 100), `${app.sim.index} / 4 done`),
    ),
  );
  const render = rendererFor(module);
  render(root, {
    mode: "simulation",
    onDone: (result) => {
      app.sim.results[module] = result;
      app.sim.index += 1;
      app.go("simulator");
    },
  });
  const abort = el("button", { type: "button", class: "btn btn-quiet" }, "Abandon simulation");
  abort.addEventListener("click", () => {
    if (!window.confirm("Abandon this simulation? Finished modules are already saved.")) return;
    app.sim.index = ORDER.length;
    app.go("simulator");
  });
  root.append(abort);
}
