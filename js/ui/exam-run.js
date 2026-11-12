import { app } from "../app.js";
import { MODULE_INFO } from "../exam-format.js";
import { moduleItem, scoreHoeren, scoreLesen } from "../exam.js";
import { weightedScore, roundScore } from "../scoring.js";
import { recordExamModule } from "../progress.js";
import { itemBadges, audioPlayer } from "./components.js";
import { el, pageTitle, toast } from "./dom.js";
import { countdown } from "./timer.js";

let runCounter = 0;
function runId() {
  runCounter += 1;
  return `exam-${Date.now().toString(36)}-${runCounter}`;
}

function radio(name, labelText, checked, onChange) {
  const input = el("input", { type: "radio", name, checked: checked || null, onchange: onChange });
  return el("label", { class: "option" }, input, el("span", { text: labelText }));
}

function tfControl(entry, value, setValue) {
  const group = `tf-${entry.number}`;
  return el(
    "div",
    { class: "options options-inline", role: "radiogroup", "aria-label": `Item ${entry.number}` },
    radio(group, "Richtig", value === true, () => setValue(true)),
    radio(group, "falsch", value === false, () => setValue(false)),
  );
}

function mcControl(entry, value, setValue) {
  const group = `mc-${entry.number}`;
  return el(
    "div",
    { class: "options", role: "radiogroup", "aria-label": `Item ${entry.number}` },
    ...entry.options.map((option, index) => radio(group, `${"abc"[index]}) ${option}`, value === index, () => setValue(index))),
  );
}

function itemShell(number, promptNode) {
  return el("div", { class: "question" }, el("p", { class: "question-prompt" }, el("span", { class: "q-no", text: String(number) }), promptNode));
}

function passageBlock(passage) {
  return el(
    "article",
    { class: "passage" },
    passage.label ? el("h3", { class: "passage-label", text: passage.label }) : null,
    el("p", { class: "passage-text", lang: "de", text: passage.text }),
  );
}

function lesenPart(part, answers) {
  const box = el("section", { class: "exam-part" }, el("h2", { class: "section-title", text: `Teil ${part.part}` }), el("p", { class: "muted", text: part.instructions_de }));
  const selected = (answers[part.part] ||= {});
  if (part.passages) for (const passage of part.passages) box.append(passageBlock(passage));
  for (const entry of part.items) {
    if (part.type === "two-option") {
      const options = el("div", { class: "two-option" });
      for (const option of entry.options) {
        options.append(
          el(
            "label",
            { class: "option-card" },
            el("input", { type: "radio", name: `lesen-${entry.number}`, onchange: () => (selected[entry.number] = option.label) }),
            el("strong", { class: "option-url", text: option.title }),
            el("span", { class: "option-text", lang: "de", text: option.text }),
          ),
        );
      }
      box.append(itemShell(entry.number, el("span", { lang: "de", text: entry.situation })), options);
    } else {
      const isSign = part.type === "signs";
      const node = isSign
        ? el(
            "div",
            { class: "sign-wrap" },
            el("p", { class: "muted small", text: entry.context }),
            el("p", { class: "sign-card", lang: "de", text: entry.sign }),
          )
        : null;
      box.append(
        itemShell(entry.number, el("span", { lang: "de", text: entry.statement })),
        node,
        tfControl(entry, selected[entry.number], (value) => (selected[entry.number] = value)),
      );
    }
  }
  return box;
}

function hoerenPart(part, answers) {
  const box = el("section", { class: "exam-part" }, el("h2", { class: "section-title", text: `Teil ${part.part}` }), el("p", { class: "muted", text: part.instructions_de }));
  const selected = (answers[part.part] ||= {});
  box.append(audioPlayer(part.audio.file, { label: `Play Hören Teil ${part.part}`, caption: "Official exam audio" }));
  box.append(el("p", { class: "muted small", text: part.plays === "twice" ? "In the exam each text is played twice (the official recording already contains the repeats)." : "In the exam each text is played once." }));
  if (part.part === 1) {
    box.append(el("p", { class: "muted small", text: "The official Teil 1 is picture-supported; here the three answer options are shown as text." }));
  }
  for (const entry of part.items) {
    if (part.type === "true-false") {
      box.append(itemShell(entry.number, el("span", { lang: "de", text: entry.statement })), tfControl(entry, selected[entry.number], (value) => (selected[entry.number] = value)));
    } else {
      box.append(itemShell(entry.number, el("span", { lang: "de", text: entry.prompt })), mcControl(entry, selected[entry.number], (value) => (selected[entry.number] = value)));
    }
  }
  return box;
}

function feedback(result) {
  const wrap = el("section", { class: "card feedback" }, el("h2", { text: `Result: ${result.raw} / ${result.max}` }));
  for (const part of result.parts) {
    const wrong = part.rows.filter((row) => !row.correct);
    wrap.append(
      el("p", { class: wrong.length ? "feedback-line bad" : "feedback-line ok", text: `Teil ${part.part}: ${part.rows.length - wrong.length} / ${part.rows.length} correct` }),
      ...wrong.map((row) => el("p", { class: "muted small", text: `Item ${row.number}: correct answer ${String(row.expected === true ? "Richtig" : row.expected === false ? "Falsch" : row.expected)}` })),
    );
  }
  return wrap;
}

export function renderExamRun(root, module, { mode = "study", onDone = null } = {}) {
  const item = moduleItem(module);
  if (!item) {
    root.append(
      pageTitle(MODULE_INFO[module].title, MODULE_INFO[module].english),
      el("section", { class: "card empty-state" },
        el("h2", { text: "Exam pack not imported" }),
        el("p", { class: "muted", text: "Import exam-ue01.zip (and exam-audio-ue01.zip for Hören) in More → Content packs." }),
      ),
    );
    return;
  }
  const info = MODULE_INFO[module];
  const answers = {};
  let submitted = false;
  let timer = null;

  root.append(
    pageTitle(`${info.title} · ${item.exam_set.title}`, `${info.english} · ${mode === "simulation" ? "timed simulation" : "study mode"} · ${info.minutes} min`),
    el("div", { class: "exam-meta" }, itemBadges(item), el("span", { class: "badge badge-info", text: item.exam_set.official ? "official" : "book format" })),
  );
  if (mode === "simulation") {
    timer = countdown(info.minutes * 60, () => grade(null, true));
    root.append(timer.node);
    timer.start();
  }
  for (const part of item.parts) {
    root.append(module === "lesen" ? lesenPart(part, answers) : hoerenPart(part, answers));
  }
  const submit = el("button", { type: "button", class: "btn btn-primary btn-wide" }, mode === "simulation" ? "Submit module" : "Check answers and save");
  const note = el("p", { class: "muted small", text: "Source: official Kandidatenblätter; keys: official Lösungen (Seite 36). Progress is saved on this device." });
  root.append(el("div", { class: "action-bar" }, submit), note);
  submit.addEventListener("click", () => grade());

  function unanswered() {
    const total = item.parts.reduce((sum, part) => sum + part.items.length, 0);
    const given = Object.values(answers).reduce((sum, part) => sum + Object.values(part).filter((value) => value !== undefined).length, 0);
    return total - given;
  }

  async function grade(event, auto = false) {
    if (submitted) return;
    if (!auto && unanswered() > 0 && !window.confirm(`${unanswered()} question(s) are still unanswered. Submit anyway?`)) return;
    submitted = true;
    timer?.stop();
    submit.disabled = true;
    const result = module === "lesen" ? scoreLesen(item, answers) : scoreHoeren(item, answers);
    const weighted = roundScore(weightedScore(result.raw));
    const units = result.parts.flatMap((part) => part.rows.map((row) => ({ number: row.number, result: row.correct ? "exact" : "no_match" })));
    try {
      await recordExamModule(item, { raw: result.raw, max: result.max, weighted, units, selfRated: false, runId: runId() }, Date.now());
    } catch (error) {
      toast(error.message, "error");
    }
    if (mode === "simulation") {
      onDone?.({ raw: result.raw, max: result.max, weighted });
      return;
    }
    root.append(feedback(result));
    if (module === "hoeren") {
      for (const part of item.parts) {
        root.append(el("details", { class: "transcript-box" }, el("summary", { text: `Transcript · Teil ${part.part} (official)` }), el("pre", { class: "transcript", text: part.transcript })));
      }
      root.append(el("p", { class: "muted small", text: "The transcript appears only after answering, as in the study mode described in P5." }));
    }
    root.append(el("div", { class: "action-bar" },
      el("button", { type: "button", class: "btn btn-secondary", onclick: () => app.render() }, "Try again"),
      el("button", { type: "button", class: "btn btn-primary", onclick: () => app.go("train") }, "Back to Train"),
    ));
    root.lastElementChild?.scrollIntoView({ block: "nearest" });
  }
}
