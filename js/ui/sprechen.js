import { MODULE_INFO, SPEAKING, RUBRIC_SCALE } from "../exam-format.js";
import { moduleItem, scoreSpeaking, speakingElements } from "../exam.js";
import { weightedScore, roundScore } from "../scoring.js";
import { recordExamModule } from "../progress.js";
import { itemBadges, sourceLine } from "./components.js";
import { el, pageTitle, toast } from "./dom.js";
import { countdown } from "./timer.js";

function fractionSelect(value, onChange, label) {
  const select = el("select", { class: "select", "aria-label": label });
  for (const fraction of RUBRIC_SCALE) {
    const text = fraction === 1 ? "full" : fraction === 0.5 ? "half" : "0";
    select.append(el("option", { value: String(fraction), text, selected: value === fraction }));
  }
  select.addEventListener("change", () => onChange(Number(select.value)));
  return select;
}

function recorderBlock(label) {
  const status = el("p", { class: "muted small", text: "Optional: record yourself and listen back. Recordings stay in memory only." });
  const play = el("audio", { controls: true, hidden: true, class: "audio-playback" });
  let recorder = null;
  let chunks = [];
  let url = null;
  const start = el("button", { type: "button", class: "btn btn-secondary" }, "● Record");
  const stop = el("button", { type: "button", class: "btn btn-quiet", disabled: true }, "Stop");
  const clear = el("button", { type: "button", class: "btn btn-quiet", disabled: true }, "Clear");

  async function begin() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      status.textContent = "Recording is not supported in this browser. You can still speak aloud and self-rate.";
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (url) URL.revokeObjectURL(url);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        url = URL.createObjectURL(blob);
        play.src = url;
        play.hidden = false;
        clear.disabled = false;
        status.textContent = "Recorded. Listen back, then rate yourself.";
      };
      recorder.start();
      start.disabled = true;
      stop.disabled = false;
      status.textContent = "Recording…";
    } catch (error) {
      status.textContent = `Microphone not available: ${error.message}`;
    }
  }
  start.addEventListener("click", begin);
  stop.addEventListener("click", () => {
    recorder?.stop();
    start.disabled = false;
    stop.disabled = true;
  });
  clear.addEventListener("click", () => {
    if (url) URL.revokeObjectURL(url);
    url = null;
    play.hidden = true;
    play.removeAttribute("src");
    clear.disabled = true;
    status.textContent = "Recording cleared.";
  });
  return el("div", { class: "recorder" }, el("p", { class: "audio-label", text: label }), el("div", { class: "button-row" }, start, stop, clear), status, play);
}

function partTimer(seconds) {
  const wrap = el("div", { class: "part-timer" });
  const start = el("button", { type: "button", class: "btn btn-quiet" }, `Start ${seconds} s`);
  start.addEventListener("click", () => {
    const fresh = countdown(seconds, () => {});
    wrap.replaceChildren(fresh.node);
    fresh.start();
  });
  wrap.append(start);
  return wrap;
}

export function renderSprechen(root, { mode = "study", onDone = null } = {}) {
  const item = moduleItem("sprechen");
  if (!item) {
    root.append(
      pageTitle("Sprechen", "Speaking"),
      el("section", { class: "card empty-state" }, el("h2", { text: "Exam pack not imported" }), el("p", { class: "muted", text: "Import exam-ue01.zip in More → Content packs." })),
    );
    return;
  }
  const info = MODULE_INFO.sprechen;
  const elements = speakingElements();
  const fractions = Object.fromEntries(elements.map((element) => [element.key, 0]));
  let submitted = false;
  let timer = null;

  root.append(
    pageTitle(`Sprechen · ${item.exam_set.title}`, `${mode === "simulation" ? "timed simulation" : "study mode"} · ${info.minutes} min`),
    el("div", { class: "exam-meta" }, itemBadges(item), el("span", { class: "badge badge-info", text: "self-assessed" })),
    el("p", { class: "muted small", text: "The official Sprechen is a group exam. Here you practise alone: speak aloud, record if you like, then rate each element full / half / 0 against the official rubric." }),
  );
  if (mode === "simulation") {
    timer = countdown(info.minutes * 60, () => submitRun(true));
    root.append(timer.node);
    timer.start();
  }

  const [p1, p2, p3] = item.parts;
  const ratingBox = el("section", { class: "card" }, el("h2", { class: "section-title", text: "Self-check · official rubric" }), el("p", { class: "muted", text: "Full = task fulfilled and comprehensible · half = partly fulfilled · 0 = not fulfilled/unclear (PZ Seite 46)." }));
  for (const element of elements) {
    const select = fractionSelect(fractions[element.key], (value) => {
      fractions[element.key] = value;
      refreshScore();
    }, element.label);
    ratingBox.append(el("label", { class: "field-row" }, el("span", { class: "rubric-label" }, el("span", { class: "badge badge-info", text: `Teil ${element.part}` }), ` ${element.label}`), select));
  }
  const live = el("p", { class: "muted small" });
  ratingBox.append(live);

  // Teil 1
  const p1Box = el("section", { class: "card" }, el("h2", { class: "section-title", text: "Teil 1 · Sich vorstellen" }), el("p", { class: "muted", text: p1.instructions_de }));
  p1Box.append(el("ul", { class: "examples" }, ...p1.prompts.map((prompt) => el("li", { lang: "de", text: prompt }))));
  p1Box.append(el("h3", { class: "sub-title", text: "The examiner will also ask:" }), el("ul", { class: "examples" }, ...p1.examiner_tasks.map((task) => el("li", { lang: "de", text: task }))));
  p1Box.append(partTimer(SPEAKING.part1Seconds), recorderBlock("Teil 1 recording"));
  root.append(p1Box);

  // Teil 2
  const p2Box = el("section", { class: "card" }, el("h2", { class: "section-title", text: "Teil 2 · Fragen und antworten" }), el("p", { class: "muted", text: p2.instructions_de }), p2.note ? el("p", { class: "muted small", text: p2.note }) : null);
  for (const topic of p2.topics) {
    p2Box.append(el("h3", { class: "sub-title", text: `Thema: ${topic.topic}` }), el("div", { class: "chips" }, ...topic.cards.map((card) => el("span", { class: "chip", lang: "de", text: card }))));
  }
  p2Box.append(partTimer(SPEAKING.part2Seconds), recorderBlock("Teil 2 recording"));
  root.append(p2Box);

  // Teil 3
  const p3Box = el("section", { class: "card" }, el("h2", { class: "section-title", text: "Teil 3 · Bitten und Reaktionen" }), el("p", { class: "muted", text: p3.instructions_de }), p3.note ? el("p", { class: "muted small", text: p3.note }) : null);
  p3Box.append(el("p", { class: "muted", text: "Example:" }), el("ul", { class: "examples" }, ...(p3.examples || []).map((example) => el("li", { lang: "de", text: example }))));
  p3Box.append(el("div", { class: "chips" }, ...p3.cards.map((card) => el("span", { class: "chip", lang: "de", text: card }))));
  p3Box.append(partTimer(SPEAKING.part3Seconds), recorderBlock("Teil 3 recording"));
  root.append(p3Box);

  root.append(ratingBox);
  const submit = el("button", { type: "button", class: "btn btn-primary btn-wide" }, mode === "simulation" ? "Submit module" : "Save result");
  const resultBox = el("div", { class: "feedback", "aria-live": "polite" });
  root.append(el("div", { class: "action-bar" }, submit), sourceLine(item), resultBox);
  submit.addEventListener("click", () => submitRun(false));
  refreshScore();

  function scoreNow() {
    return scoreSpeaking(elements.map((element) => ({ ...element, fraction: fractions[element.key] })));
  }
  function refreshScore() {
    const result = scoreNow();
    live.textContent = `Self-rating: ${result.raw} / ${result.max} points`;
  }

  async function submitRun(auto) {
    if (submitted) return;
    if (!auto && Object.values(fractions).every((value) => value === 0) && !window.confirm("You have not rated anything; the Sprechen score will be 0. Submit anyway?")) return;
    submitted = true;
    timer?.stop();
    submit.disabled = true;
    const result = scoreNow();
    const weighted = roundScore(weightedScore(result.raw));
    const units = result.rows.map((row) => ({
      number: row.key,
      result: row.fraction === 1 ? "exact" : "no_match",
      quality: Math.round(row.fraction * 5),
    }));
    try {
      await recordExamModule(item, { raw: result.raw, max: result.max, weighted, units, selfRated: true, runId: `speaking-${Date.now().toString(36)}` }, Date.now());
    } catch (error) {
      toast(error.message, "error");
    }
    resultBox.replaceChildren(
      el("p", { class: "feedback-line", text: `Score: ${result.raw} / 15 raw · ${weighted} / 25 weighted (self-assessed)` }),
      el("p", { class: "muted small", text: auto ? "Time ran out; the module was submitted automatically." : "Saved to progress." }),
    );
    if (mode === "simulation") onDone?.({ raw: result.raw, max: 15, weighted, selfRated: true });
  }
}
