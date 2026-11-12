import { app } from "../app.js";
import { createSession } from "../planner.js";
import { availableUnits, exerciseItems, grammarItems, state } from "../state.js";
import { ruleBox } from "./components.js";
import { el, pageTitle, toast } from "./dom.js";

function practiceButton(unit) {
  const exercises = exerciseItems().filter(
    (exercise) => exercise.source?.chapter === unit.chapter && (exercise.tags || []).includes("grammar"),
  );
  const button = el(
    "button",
    { type: "button", class: "btn btn-secondary", disabled: exercises.length === 0 },
    exercises.length ? `Practise (${exercises.length})` : "No drill yet",
  );
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      app.session = await createSession(10, { exerciseIds: exercises.map((exercise) => exercise.id) });
      app.go("session");
    } catch (error) {
      toast(error.message, "error");
      button.disabled = false;
    }
  });
  return button;
}

export function renderGrammar(root) {
  root.append(pageTitle("Grammar", "Rules from the book, with the page"));
  if (!state.items.length) {
    root.append(el("p", { class: "card muted", text: "No content imported yet." }));
    return;
  }
  const points = grammarItems();
  if (!points.length) {
    root.append(el("p", { class: "card muted", text: "No grammar points in the imported content yet." }));
    return;
  }
  for (const unit of availableUnits()) {
    const unitPoints = points.filter((point) => point.source?.chapter === unit.chapter);
    if (!unitPoints.length) continue;
    root.append(
      el(
        "section",
        { class: "card" },
        el("div", { class: "section-head" },
          el("div", {}, el("h2", { class: "section-title", text: unit.title || unit.unit }), el("p", { class: "muted small", text: `${unit.unit} · ${unitPoints.length} rule${unitPoints.length === 1 ? "" : "s"}` })),
          practiceButton(unit)),
        ...unitPoints.map((point) => ruleBox(point)),
      ),
    );
  }
  root.append(el("p", { class: "muted small center", text: "After a drill, the book's rule box appears under the answer." }));
}
