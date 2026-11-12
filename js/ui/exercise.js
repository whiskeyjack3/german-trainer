import { isAcceptedResult, matchAnswer } from "../matching.js";
import { getItem } from "../state.js";
import { itemBadges, ruleBox, sourceLine, audioPlayer } from "./components.js";
import { append, el } from "./dom.js";

function answerLine(text) {
  return el("p", { class: "answer-line" }, el("span", { class: "muted", text: "Answer: " }), el("strong", { lang: "de", text }));
}

function renderMc(exercise, answers) {
  const blocks = exercise.items.map((item, index) => {
    const group = `q-${exercise.id}-${index}`;
    const options = el("div", { class: "options", role: "radiogroup", "aria-label": item.prompt });
    item.options.forEach((option, optionIndex) => {
      const id = `${group}-${optionIndex}`;
      options.append(
        el(
          "label",
          { class: "option", for: id },
          el("input", {
            type: "radio",
            id,
            name: group,
            value: String(optionIndex),
            onchange: () => {
              answers[index] = optionIndex;
            },
          }),
          el("span", { text: option, lang: "de" }),
        ),
      );
    });
    return el("div", { class: "question" }, el("p", { class: "question-prompt", text: item.prompt }), options);
  });
  return {
    blocks,
    results: () =>
      exercise.items.map((item, index) =>
        answers[index] === item.correct_index ? "exact" : "no_match",
      ),
    reveal: (results) =>
      exercise.items.map((item, index) =>
        results[index] === "exact" ? null : answerLine(item.options[item.correct_index]),
      ),
  };
}

function renderTrueFalse(exercise, answers) {
  const blocks = exercise.items.map((item, index) => {
    const group = `tf-${exercise.id}-${index}`;
    const options = el("div", { class: "options options-inline", role: "radiogroup" });
    for (const value of [true, false]) {
      const id = `${group}-${value}`;
      options.append(
        el(
          "label",
          { class: "option", for: id },
          el("input", {
            type: "radio",
            id,
            name: group,
            value: String(value),
            onchange: () => {
              answers[index] = value;
            },
          }),
          el("span", { text: value ? "richtig" : "falsch" }),
        ),
      );
    }
    return el("div", { class: "question" }, el("p", { class: "question-prompt", text: item.statement, lang: "de" }), options);
  });
  return {
    blocks,
    results: () => exercise.items.map((item, index) => (answers[index] === item.answer ? "exact" : "no_match")),
    reveal: (results) =>
      exercise.items.map((item, index) =>
        results[index] === "exact" ? null : answerLine(item.answer ? "richtig" : "falsch"),
      ),
  };
}

function renderGap(exercise, answers) {
  const blocks = exercise.items.map((item, index) => {
    const input = el("input", {
      class: "answer-input inline",
      type: "text",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      lang: "de",
      "aria-label": `Answer ${index + 1}`,
      oninput: (event) => {
        answers[index] = event.target.value;
      },
    });
    const promptText = item.text
      ? item.text.replace("___", "____")
      : item.prompt || `Item ${index + 1}`;
    return el(
      "div",
      { class: "question gap-question" },
      el("p", { class: "question-prompt", lang: "de", text: promptText }),
      input,
    );
  });
  return {
    blocks,
    results: () =>
      exercise.items.map((item, index) =>
        matchAnswer(answers[index] || "", item.answers, { noun: false }).result,
      ),
    reveal: (results) =>
      exercise.items.map((item, index) => (results[index] === "exact" ? null : answerLine(item.answers[0]))),
  };
}

function renderMatching(exercise, answers) {
  const rightByLeft = new Map(exercise.pairs.map(([left, right]) => [left, right]));
  const blocks = exercise.left.map((left, index) => {
    const select = el("select", {
      class: "select",
      "aria-label": `Match: ${left}`,
      onchange: (event) => {
        answers[index] = Number(event.target.value);
      },
    });
    select.append(el("option", { value: "-1", text: "— choose —" }));
    exercise.right.forEach((right, rightIndex) => {
      select.append(el("option", { value: String(rightIndex), text: right, lang: "de" }));
    });
    return el(
      "div",
      { class: "question match-question" },
      el("p", { class: "question-prompt", lang: "de", text: left }),
      select,
    );
  });
  return {
    blocks,
    results: () => exercise.left.map((_, index) => (answers[index] === rightByLeft.get(index) ? "exact" : "no_match")),
    reveal: (results) =>
      exercise.left.map((_, index) =>
        results[index] === "exact" ? null : answerLine(exercise.right[rightByLeft.get(index)]),
      ),
  };
}

function renderReorder(exercise, answers) {
  const chosen = [];
  const slots = el("div", { class: "chips", "aria-live": "polite" });
  const bank = el("div", { class: "chips" });
  const draw = () => {
    slots.replaceChildren(...chosen.map((index) => el("span", { class: "chip selected", text: exercise.fragments[index] })));
    bank.replaceChildren(
      ...exercise.fragments.map((fragment, index) =>
        el(
          "button",
          {
            type: "button",
            class: "chip",
            disabled: chosen.includes(index),
            onclick: () => {
              chosen.push(index);
              answers.order = [...chosen];
              draw();
            },
          },
          fragment,
        ),
      ),
      el("button", {
        type: "button",
        class: "btn btn-quiet",
        onclick: () => {
          chosen.length = 0;
          answers.order = [];
          draw();
        },
      }, "Reset"),
    );
  };
  draw();
  return {
    blocks: [el("div", { class: "question" }, el("p", { class: "muted small", text: "Tap the words in the correct order." }), slots, bank)],
    results: () => {
      const order = answers.order || [];
      const correct = order.length === exercise.correct_order.length && order.every((value, index) => value === exercise.correct_order[index]);
      return [correct ? "exact" : "no_match"];
    },
    reveal: (results) => (results[0] === "exact" ? null : answerLine(exercise.correct_order.map((i) => exercise.fragments[i]).join(" "))),
  };
}

function renderForm(exercise, answers) {
  const blocks = exercise.fields.map((field, index) => {
    const input = el("input", {
      class: "answer-input",
      type: "text",
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": field.label,
      oninput: (event) => {
        answers[index] = event.target.value;
      },
    });
    return el("label", { class: "field-row" }, el("span", { text: field.label }), input);
  });
  return {
    blocks,
    results: () =>
      exercise.fields.map((field, index) => matchAnswer(answers[index] || "", [field.answer], { noun: /^[A-ZÄÖÜ]/.test(field.answer) }).result),
    reveal: (results) =>
      exercise.fields.map((field, index) => (results[index] === "exact" ? null : answerLine(field.answer))),
  };
}

export function renderExercise(exercise, onDone) {
  const root = el("section", { class: "card exercise-card" });
  append(root, [
    itemBadges(exercise),
    el("p", { class: "card-type", text: `${exercise.book || "book"} · Aufgabe ${exercise.label || "—"}` }),
    el("h2", { class: "exercise-prompt", text: exercise.prompt }),
    exercise.audio ? audioPlayer(exercise.audio.file, { label: "Play exercise audio" }) : null,
    el("p", { class: "muted small text", text: "Listen as often as you like. Answer all items, then check." }),
  ]);

  const answers = {};
  let renderer;
  switch (exercise.exercise_type) {
    case "multiple-choice":
    case "listen-mc":
      renderer = renderMc(exercise, answers);
      break;
    case "true/false":
      renderer = renderTrueFalse(exercise, answers);
      break;
    case "gap-fill":
    case "listen-type":
      renderer = renderGap(exercise, answers);
      break;
    case "matching":
      renderer = renderMatching(exercise, answers);
      break;
    case "reorder":
      renderer = renderReorder(exercise, answers);
      break;
    case "form-fill":
      renderer = renderForm(exercise, answers);
      break;
    case "short-message":
      renderer = { blocks: [el("p", { class: "muted", text: "Open writing task — self-check in P5." })], results: () => [], reveal: () => [] };
      break;
    default:
      renderer = { blocks: [el("p", { class: "muted", text: `Unknown exercise type: ${exercise.exercise_type}` })], results: () => [], reveal: () => [] };
  }
  root.append(...renderer.blocks);

  const check = el("button", { type: "button", class: "btn btn-primary" }, "Check answers");
  const feedback = el("div", { class: "feedback", "aria-live": "polite" });
  const next = el("button", { type: "button", class: "btn btn-primary", hidden: true }, "Continue");
  let results = null;

  check.addEventListener("click", () => {
    results = renderer.results();
    const correct = results.filter(isAcceptedResult).length;
    const reveals = renderer.reveal(results);
    feedback.replaceChildren(
      el("p", { class: correct === results.length ? "feedback-line ok" : "feedback-line bad" },
        results.length ? `${correct} / ${results.length} correct` : "Study the text, then continue."),
      ...reveals
        .map((extra) => (extra ? el("div", { class: "reveal" }, extra) : null))
        .filter(Boolean),
    );
    check.hidden = true;
    next.hidden = false;
    if (exercise.grammar_point_id) {
      const grammar = getItem(exercise.grammar_point_id);
      if (grammar) feedback.append(ruleBox(grammar));
    } else if ((exercise.tags || []).includes("grammar")) {
      const unit = exercise.id.split("-")[1];
      const grammar = getItem(`a1-${unit}-g-0001`);
      if (grammar) feedback.append(ruleBox(grammar));
    }
    next.scrollIntoView({ block: "nearest" });
  });
  next.addEventListener("click", () => {
    if (results) onDone(results);
  });

  root.append(check, feedback, next, sourceLine(exercise));
  return root;
}
