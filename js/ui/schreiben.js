import { MODULE_INFO, WRITING } from "../exam-format.js";
import { moduleItem, scoreWritingForm, scoreWritingRubric, writingChecks } from "../exam.js";
import { weightedScore, roundScore } from "../scoring.js";
import { copyText, writingPrompt } from "../mercury.js";
import { recordExamModule } from "../progress.js";
import { itemBadges, sourceLine } from "./components.js";
import { el, pageTitle, toast } from "./dom.js";
import { countdown } from "./timer.js";

function rubricSelect(max, value, onChange, label) {
  const select = el("select", { class: "select", "aria-label": label, onchange: (event) => onChange(Number(event.target.value)) });
  select.append(el("option", { value: "0", text: "0 – not fulfilled", selected: value === 0 }));
  select.append(el("option", { value: String(max / 2), text: `${max / 2} – partly fulfilled`, selected: value === max / 2 }));
  select.append(el("option", { value: String(max), text: `${max} – fully fulfilled`, selected: value === max }));
  return select;
}

export function renderSchreiben(root, { mode = "study", onDone = null } = {}) {
  const item = moduleItem("schreiben");
  if (!item) {
    root.append(
      pageTitle("Schreiben", "Writing"),
      el("section", { class: "card empty-state" }, el("h2", { text: "Exam pack not imported" }), el("p", { class: "muted", text: "Import exam-ue01.zip in More → Content packs." })),
    );
    return;
  }
  const info = MODULE_INFO.schreiben;
  const part1 = item.parts.find((part) => part.type === "form-fill");
  const part2 = item.parts.find((part) => part.type === "short-message");
  const answers = {};
  const ratings = part2.content_points.map(() => 0);
  let communicative = 0;
  let submitted = false;
  let timer = null;

  root.append(
    pageTitle(`Schreiben · ${item.exam_set.title}`, `${mode === "simulation" ? "timed simulation" : "study mode"} · ${info.minutes} min`),
    el("div", { class: "exam-meta" }, itemBadges(item), el("span", { class: "badge badge-info", text: "official tasks" })),
  );
  if (mode === "simulation") {
    timer = countdown(info.minutes * 60, () => submit(true));
    root.append(timer.node);
    timer.start();
  }

  // ---- Teil 1: form ----
  const formBox = el("section", { class: "card" }, el("h2", { class: "section-title", text: "Teil 1 · Formular" }), el("p", { class: "muted", text: part1.instructions_de }), el("p", { class: "passage-text", lang: "de", text: part1.lead_in }));
  const form = el("div", { class: "form-grid" }, el("p", { class: "form-title", text: part1.form_title }));
  for (const field of part1.fields) {
    if (field.prefilled) {
      form.append(el("label", { class: "form-row" }, el("span", { text: field.label }), el("input", { class: "answer-input", type: "text", value: field.value, readonly: true, tabindex: "-1" })));
    } else {
      const input = el("input", {
        class: "answer-input",
        type: "text",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": `${field.number}. ${field.label}`,
        oninput: (event) => (answers[field.number] = event.target.value),
      });
      form.append(el("label", { class: "form-row" }, el("span", {}, el("strong", { text: `(${field.number}) ` }), field.label), input));
    }
  }
  formBox.append(form);
  const formFeedback = el("div", { class: "feedback" });
  const checkForm = el("button", { type: "button", class: "btn btn-secondary" }, "Check form");
  checkForm.addEventListener("click", () => {
    const result = scoreWritingForm(item, answers);
    formFeedback.replaceChildren(
      el("p", { class: result.raw === result.max ? "feedback-line ok" : "feedback-line bad", text: `Form: ${result.raw} / ${result.max} correct` }),
      ...result.rows.filter((row) => !row.correct).map((row) => el("p", { class: "muted small", text: `${row.number}. ${row.label}: ${row.expected}` })),
    );
    if (result.raw === result.max) checkForm.disabled = true;
  });
  formBox.append(checkForm, formFeedback);
  root.append(formBox);

  // ---- Teil 2: short message ----
  const text = el("textarea", {
    class: "answer-textarea",
    rows: "7",
    lang: "de",
    spellcheck: "false",
    "aria-label": "Your e-mail to Anna",
    placeholder: "Liebe Anna, …",
    oninput: () => updateCount(),
  });
  const counter = el("p", { class: "muted small", "aria-live": "polite" });
  const checksBox = el("div", { class: "check-list" });
  const pointsBox = el("div", { class: "check-list" });
  part2.content_points.forEach((point, index) => {
    const box = el("input", { type: "checkbox" });
    pointsBox.append(el("label", { class: "check-row" }, box, el("span", { text: `I addressed: ${point}` })));
  });
  const rubric = el("div", { class: "rubric" });
  part2.content_points.forEach((point, index) => {
    rubric.append(
      el("label", { class: "field-row" }, el("span", { text: `Content point ${index + 1}: ${point}` }), rubricSelect(3, 0, (value) => (ratings[index] = value), point)),
    );
  });
  rubric.append(
    el("label", { class: "field-row" }, el("span", { text: "Communicative design (Anrede/Gruß)" }), rubricSelect(1, 0, (value) => (communicative = value), "Communicative design")),
  );

  const part2Box = el(
    "section",
    { class: "card" },
    el("h2", { class: "section-title", text: "Teil 2 · Kurzmitteilung" }),
    el("p", { class: "muted", text: part2.instructions_de }),
    el("p", { class: "passage-text", lang: "de", text: part2.task }),
    el("p", { class: "muted small", text: part2.note }),
    text,
    counter,
    el("h3", { class: "sub-title", text: "Self-check" }),
    checksBox,
    pointsBox,
    el("h3", { class: "sub-title", text: "Official rubric (self-assessment)" }),
    el("p", { class: "muted small", text: "Each content point 3 / 1.5 / 0; communicative design 1 / 0.5 / 0. This is your own rating, not an examiner's." }),
    rubric,
  );
  const copy = el("button", { type: "button", class: "btn btn-quiet" }, "Copy for reviewer");
  copy.addEventListener("click", async () => {
    const ok = await copyText(writingPrompt(part2.task, text.value));
    toast(ok ? "Writing prompt copied" : "Copy failed", ok ? "success" : "error");
  });
  part2Box.append(copy);
  root.append(part2Box);

  function updateCount() {
    const info2 = writingChecks(text.value, part2);
    counter.textContent = `${info2.words} words · target circa ${WRITING.targetWords}`;
    checksBox.replaceChildren(...info2.checks.map((check) => el("p", { class: check.ok ? "check-ok" : "check-bad", text: `${check.ok ? "✓" : "○"} ${check.label}` })));
    return info2;
  }
  updateCount();

  const submit = el("button", { type: "button", class: "btn btn-primary btn-wide" }, mode === "simulation" ? "Submit module" : "Save result");
  const resultBox = el("div", { class: "feedback", "aria-live": "polite" });
  root.append(el("div", { class: "action-bar" }, submit), sourceLine(item), resultBox);
  submit.addEventListener("click", () => submitRun(false));

  async function submitRun(auto) {
    if (submitted) return;
    if (!auto && ratings.every((value) => value === 0) && !window.confirm("You have not rated any content point; the rubric part will score 0. Submit anyway?")) return;
    submitted = true;
    timer?.stop();
    submit.disabled = true;
    const formResult = scoreWritingForm(item, answers);
    const rubricResult = scoreWritingRubric(ratings, communicative);
    const raw = roundScore(formResult.raw + rubricResult.raw);
    const units = [
      ...formResult.rows.map((row) => ({ number: row.number, result: row.correct ? "exact" : "no_match", quality: row.correct ? 5 : 0 })),
      ...ratings.map((value, index) => ({ number: 6 + index, result: value === 3 ? "exact" : "no_match", quality: value === 3 ? 5 : value === 1.5 ? 3 : 0 })),
      { number: 9, result: communicative === 1 ? "exact" : "no_match", quality: communicative === 1 ? 5 : communicative === 0.5 ? 3 : 0 },
    ];
    const weighted = roundScore(weightedScore(raw));
    try {
      await recordExamModule(item, { raw, max: 15, weighted, units, selfRated: true, runId: `writing-${Date.now().toString(36)}` }, Date.now());
    } catch (error) {
      toast(error.message, "error");
    }
    resultBox.replaceChildren(
      el("p", { class: "feedback-line", text: `Score: ${raw} / 15 raw · ${weighted} / 25 weighted` }),
      el("p", { class: "muted small", text: `Form ${formResult.raw}/5 · content ${rubricResult.content}/9 · communicative ${rubricResult.communicative}/1. Self-rated parts are labelled in the dashboard.` }),
      el("p", { class: "muted small", text: auto ? "Time ran out; the module was submitted automatically." : "Saved to progress." }),
    );
    if (mode === "simulation") onDone?.({ raw, max: 15, weighted, selfRated: true });
  }
}
