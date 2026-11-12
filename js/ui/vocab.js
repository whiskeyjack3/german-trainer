import { app } from "../app.js";
import { chapterMetrics } from "../metrics.js";
import { createSession } from "../planner.js";
import { availableUnits, dueVocab, itemsForUnit, state, unitOfId } from "../state.js";
import { itemBadges, sourceLine } from "./components.js";
import { el, pageTitle, progressBar, toast } from "./dom.js";

function unitCard(unit, now, readiness) {
  const items = itemsForUnit(unit.unit).filter((item) => item.id.includes("-v-") && item.gloss?.en);
  const due = dueVocab(now).filter((card) => unitOfId(card.id) === unit.unit).length;
  const exam = items.filter((item) => item.goethe_wortliste).length;
  const start = el("button", { type: "button", class: "btn btn-primary" }, "Start 10 min");
  start.addEventListener("click", async () => {
    start.disabled = true;
    try {
      app.session = await createSession(10, { unit: unit.unit });
      app.go("session");
    } catch (error) {
      toast(error.message, "error");
      start.disabled = false;
    }
  });
  const details = el("details", { class: "browse" });
  const list = el("div", { class: "browse-list" });
  const draw = (limit) => {
    list.replaceChildren(
      ...items.slice(0, limit).map((item) =>
        el(
          "div",
          { class: "browse-row" },
          el("div", {}, el("strong", { text: item.de, lang: "de" }), el("span", { class: "muted", text: ` — ${item.gloss.en}` })),
          itemBadges(item),
          sourceLine(item),
        ),
      ),
    );
    if (items.length > limit) {
      list.append(el("button", { type: "button", class: "btn btn-quiet", onclick: () => draw(items.length) }, `Show all ${items.length}`));
    }
  };
  draw(12);
  details.append(el("summary", { text: `Browse ${items.length} words` }), list);

  return el(
    "section",
    { class: "card" },
    el("div", { class: "section-head" },
      el("div", {}, el("h2", { class: "section-title", text: unit.title || unit.unit }), el("p", { class: "muted small", text: `${unit.unit} · ${items.length} words · ${exam} on the exam list · ${due} due` })),
      start),
    readiness === null
      ? el("p", { class: "muted small", text: "Readiness: not enough data yet." })
      : progressBar(readiness, `${readiness}% readiness`),
    details,
  );
}

export function renderVocab(root) {
  root.append(pageTitle("Vocabulary", "SRS · all card types"));
  if (!state.items.length) {
    root.append(el("p", { class: "card muted", text: "No content imported yet." }));
    return;
  }
  const now = Date.now();
  const readiness = chapterMetrics(now);
  root.append(
    el(
      "section",
      { class: "card intro-card" },
      el("p", { class: "muted", text: "Card types: DE→EN meaning · EN→DE typed · article + plural · cloze from the book sentence · listen→type (device German voice). Umlaut shortcuts ae/oe/ue/ss are accepted but flagged; noun capitalisation is checked." }),
    ),
  );
  for (const unit of availableUnits()) {
    const hasVocab = itemsForUnit(unit.unit).some((item) => item.id.includes("-v-") && item.gloss?.en);
    if (!hasVocab) continue;
    root.append(unitCard(unit, now, readiness[unit.unit] ?? null));
  }
}
