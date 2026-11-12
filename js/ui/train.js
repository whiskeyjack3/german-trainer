import { app } from "../app.js";
import { MODULE_INFO } from "../exam-format.js";
import { examItems, latestExamResults } from "../exam.js";
import { createSession } from "../planner.js";
import { exerciseItems, state } from "../state.js";
import { itemBadges, sourceLine } from "./components.js";
import { el, pageTitle, toast } from "./dom.js";

async function startWith(ids, button) {
  button.disabled = true;
  try {
    app.session = await createSession(10, { exerciseIds: ids });
    app.go("session");
  } catch (error) {
    toast(error.message, "error");
    button.disabled = false;
  }
}

function drillRow(exercise) {
  const button = el("button", { type: "button", class: "btn btn-secondary" }, "Start");
  button.addEventListener("click", () => startWith([exercise.id], button));
  return el(
    "div",
    { class: "drill-row" },
    el(
      "div",
      { class: "drill-main" },
      el("p", { class: "drill-title", text: exercise.prompt, lang: "de" }),
      el("p", { class: "muted small", text: `${exercise.book} · ${exercise.label || "—"} · ${exercise.exercise_type}` }),
      itemBadges(exercise),
      sourceLine(exercise),
    ),
    button,
  );
}

function examHub() {
  const exams = examItems();
  const set = exams[0]?.exam_set;
  const latest = latestExamResults();
  if (!set) {
    return el(
      "section",
      { class: "card" },
      el("h2", { class: "section-title", text: "Exam trainers" }),
      el("p", { class: "muted", text: "The official exam pack is not imported. Import exam-ue01.zip (content) and exam-audio-ue01.zip (Hören audio) in More → Content packs." }),
      el("button", { type: "button", class: "btn btn-secondary", onclick: () => app.go("more") }, "Go to import"),
    );
  }
  const tiles = ["lesen", "hoeren", "schreiben", "sprechen"].map((module) => {
    const info = MODULE_INFO[module];
    const last = latest[module];
    return el(
      "div",
      { class: "trainer-tile" },
      el("strong", { text: info.title }),
      el("span", { class: "muted small", text: `${info.english} · ${info.minutes} min` }),
      last ? el("span", { class: "badge badge-info", text: `last ${last.raw}/${last.max_raw}` }) : null,
      el("button", { type: "button", class: "btn btn-secondary btn-small", onclick: () => app.go(`exam-${module}`) }, "Study"),
    );
  });
  return el(
    "section",
    { class: "card" },
    el("div", { class: "section-head" },
      el("div", {},
        el("h2", { class: "section-title", text: "Exam trainers" }),
        el("p", { class: "muted small", text: `${set.label} · official items and keys` }),
      ),
      el("span", { class: "badge badge-exam", text: "official" }),
    ),
    el("div", { class: "trainer-grid" }, ...tiles),
    el("p", { class: "muted small", text: "Study mode explains and shows the transcript after you answer. The simulator runs the official order and timings." }),
    el("button", { type: "button", class: "btn btn-primary btn-wide", onclick: () => app.go("simulator") }, "Start timed simulation (Hören 20 · Lesen 25 · Schreiben 20 · Sprechen 15)"),
  );
}

export function renderTrain(root) {
  root.append(pageTitle("Train", "Exam trainers · book drills"));
  if (!state.items.length) {
    root.append(el("p", { class: "card muted", text: "No content imported yet." }));
    return;
  }
  root.append(examHub());

  const drills = exerciseItems().filter((exercise) => exercise.graded && exercise.audio);
  const listening = drills.filter((exercise) => exercise.exercise_type.startsWith("listen"));
  if (listening.length) {
    const all = el("button", { type: "button", class: "btn btn-secondary" }, `Start all (${listening.length})`);
    all.addEventListener("click", () => startWith(listening.map((exercise) => exercise.id), all));
    root.append(
      el(
        "details",
        { class: "card book-drills" },
        el("summary", {}, el("strong", { text: "Book listening drills" }), el("span", { class: "muted small", text: ` · ${listening.length} Kapitel 1–3 exercises with book audio` })),
        el("div", { class: "section-head" }, el("p", { class: "muted small", text: "Netzwerk A1 audio, auto-graded against the book's Lösungsschlüssel." }), all),
        ...listening.map((exercise) => drillRow(exercise)),
      ),
    );
  }
  const other = drills.filter((exercise) => !exercise.exercise_type.startsWith("listen"));
  if (other.length) {
    root.append(
      el("details", { class: "card book-drills" }, el("summary", {}, el("strong", { text: "Other book drills" })), ...other.map(drillRow)),
    );
  }
}
