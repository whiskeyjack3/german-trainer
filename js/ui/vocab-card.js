import { glossAlternatives, isAcceptedResult, matchAnswer } from "../matching.js";
import { QUALITY, qualityFromResult } from "../srs.js";
import { speakGerman } from "../audio.js";
import { itemBadges, sourceLine } from "./components.js";
import { append, el } from "./dom.js";

const LABELS = {
  "de->en": "DE → EN · meaning",
  "en->de": "EN → DE · typed",
  "article+plural": "Article + plural · typed",
  cloze: "Cloze from the book sentence",
  listen: "Listen → type",
};

const QUALITY_BUTTONS = [
  ["Again", QUALITY.again],
  ["Hard", QUALITY.hard],
  ["Good", QUALITY.good],
  ["Easy", QUALITY.easy],
];

function acceptedFor(item, cardType) {
  const withArticle = item.article ? `${item.article} ${item.lemma}` : item.lemma;
  if (cardType === "article+plural") {
    return [item.de, `${withArticle}${item.plural ? `, ${item.plural}` : ""}`];
  }
  return [...new Set([item.de, item.lemma, withArticle].filter(Boolean))];
}

function clozeText(item) {
  if (!item.example_de || !item.lemma) return null;
  const pattern = new RegExp(item.lemma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (!pattern.test(item.example_de)) return null;
  return item.example_de.replace(pattern, "____");
}

export function renderVocabCard(item, cardType, onComplete) {
  const started = performance.now();
  const noun = Boolean(item.article) && cardType !== "de->en";
  const root = el("section", { class: "card vocab-card" });
  append(root, [
    el("div", { class: "card-type", text: LABELS[cardType] || cardType }),
    itemBadges(item),
    el("p", { class: "vocab-de", text: item.de, lang: "de" }),
    item.note ? el("p", { class: "muted small", text: item.note }) : null,
  ]);

  const finish = (result, quality) => {
    onComplete({
      result,
      quality,
      cardType,
      seconds: (performance.now() - started) / 1000,
    });
  };

  if (cardType === "de->en") {
    const answer = el("p", { class: "gloss-answer", hidden: true, text: item.gloss?.en || "—" });
    const grades = el("div", { class: "grade-grid", hidden: true });
    for (const [label, quality] of QUALITY_BUTTONS) {
      grades.append(
        el("button", {
          type: "button",
          class: `btn grade grade-${label.toLowerCase()}`,
          onclick: () => finish(quality >= 3 ? "exact" : "no_match", quality),
        }, label),
      );
    }
    const reveal = el("button", { type: "button", class: "btn btn-primary" }, "Show answer");
    reveal.addEventListener("click", () => {
      reveal.hidden = true;
      answer.hidden = false;
      grades.hidden = false;
      grades.querySelector("button")?.focus();
    });
    root.append(reveal, answer, grades);
    root.append(sourceLine(item));
    return root;
  }

  let promptText = item.gloss?.en || item.lemma;
  if (cardType === "article+plural") {
    promptText = `${item.lemma}${item.gloss?.en ? ` — ${item.gloss.en}` : ""}`;
  }
  if (cardType === "cloze") {
    promptText = clozeText(item) || item.example_de || item.lemma;
  }
  if (cardType === "listen") {
    promptText = "Listen and type the German word.";
    const played = speakGerman(item.lemma);
    root.append(
      el("p", { class: "listen-hint", text: played ? "Device voice · German" : "No German voice installed on this device." }),
      el("button", { type: "button", class: "btn btn-secondary", onclick: () => speakGerman(item.lemma) }, "▶ Play again"),
    );
  }
  const prompt = el("p", { class: `prompt ${cardType === "cloze" ? "cloze" : ""}`, text: promptText, lang: cardType === "cloze" ? "de" : undefined });
  const input = el("input", {
    class: "answer-input",
    type: "text",
    inputmode: "text",
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    lang: "de",
    "aria-label": "Your answer",
  });
  const submit = el("button", { type: "submit", class: "btn btn-primary" }, "Check");
  const form = el("form", { class: "answer-form" }, input, submit);
  const feedback = el("div", { class: "feedback", "aria-live": "polite" });
  const next = el("button", { type: "button", class: "btn btn-primary", hidden: true }, "Next card");
  let outcome = null;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (outcome) {
      finish(outcome.result, outcome.quality);
      return;
    }
    const accepted = acceptedFor(item, cardType);
    const match = matchAnswer(input.value, accepted, { noun });
    const quality = qualityFromResult(match.result);
    outcome = { result: match.result, quality };
    feedback.replaceChildren(
      el(
        "p",
        { class: `feedback-line ${isAcceptedResult(match.result) ? "ok" : "bad"}` },
        isAcceptedResult(match.result) ? "Correct." : "Not quite.",
        match.result === "noun_case_error" ? " German nouns start with a capital letter." : "",
        match.result === "umlaut_fold" ? " Write ä/ö/ü/ß, not ae/oe/ue/ss." : "",
      ),
      el("p", {}, el("span", { class: "muted", text: "Answer: " }), el("strong", { lang: "de", text: match.answer || accepted[0] })),
    );
    input.disabled = true;
    submit.hidden = true;
    next.hidden = false;
    next.focus();
  });
  next.addEventListener("click", () => {
    if (outcome) finish(outcome.result, outcome.quality);
  });

  root.append(prompt, form, feedback, next, sourceLine(item));
  setTimeout(() => input.focus({ preventScroll: true }), 30);
  return root;
}
