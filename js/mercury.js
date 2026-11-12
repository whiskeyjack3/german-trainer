// Review export. The reviewer is configurable (Mercury by default, but any
// agent/person, or just the owner's own notes) — see Settings → Reviewer.

import { chapterOfUnit, state, unitOfId, unitTitle } from "./state.js";
import { last7Days, metrics, mostMissed, examSummary } from "./metrics.js";
import { getSettings } from "./settings.js";
import { reviewCounts, reviewerName as configuredReviewerName } from "./findings.js";
import { sourceLabel } from "./ui/dom.js";
import { MODULE_INFO } from "./exam-format.js";

function german(item) {
  return item.de || item.lemma || item.topic || item.prompt || item.id;
}

export function reviewerName() {
  return configuredReviewerName(getSettings());
}

export function reviewMarkdown(now = Date.now()) {
  const name = reviewerName();
  const m = metrics(now);
  const last = last7Days(now);
  const missed = mostMissed(12);
  const exam = examSummary();
  const findings = reviewCounts(state.reviewNotes);
  const lines = [];
  lines.push(`# German Trainer — weekly report for ${name}`);
  lines.push("");
  lines.push(`Generated: ${new Date(now).toISOString()}`);
  lines.push(`Level: ${state.settings?.level || "a1"} · Sessions this week: ${last.sessions} · Attempts: ${last.attempts} · Accuracy: ${last.accuracy === null ? "no data" : `${last.accuracy}%`}`);
  lines.push("");
  lines.push("## Readiness");
  for (const [skill, value] of Object.entries(m.skills)) {
    lines.push(`- ${skill}: ${value === null ? "not enough data" : `${value}%`}`);
  }
  if (m.weak.length) {
    lines.push("");
    lines.push("## Weak chapters");
    for (const weak of m.weak) lines.push(`- ${weak.unit} ${unitTitle(weak.unit)}: ${weak.value}% readiness`);
  }
  lines.push("");
  lines.push("## Exam practice (latest per module)");
  if (!exam.attempted) {
    lines.push("- no exam module recorded yet");
  } else {
    for (const module of ["hoeren", "lesen", "schreiben", "sprechen"]) {
      const entry = exam.modules[module];
      if (!entry) continue;
      lines.push(
        `- ${MODULE_INFO[module].title}: ${entry.raw}/${entry.max_raw} raw · ${entry.weighted}/25 weighted${entry.selfRated ? " · self-rated" : ""} · ${String(entry.at).slice(0, 10)}`,
      );
    }
    if (exam.weakest) lines.push(`- weakest module: ${MODULE_INFO[exam.weakest.module].title}`);
    lines.push(`- weighted total of recorded modules: ${exam.total} (pass needs all four and ≥ 60)`);
  }
  lines.push("");
  lines.push("## Most-missed items");
  if (!missed.length) {
    lines.push("- none yet");
  } else {
    for (const row of missed) {
      const item = row.item;
      const chapter = chapterOfUnit(unitOfId(item.id)) || "?";
      lines.push(`- ${item.id} · ${german(item)}${item.gloss?.en ? ` = ${item.gloss.en}` : ""} · ${row.missed} misses · source: ${sourceLabel(item)} · chapter ${chapter}`);
    }
  }
  if (findings.items || findings.general) {
    lines.push("");
    lines.push(`## Open reviewer findings (${findings.items} item notes, ${findings.general} general)`);
    for (const note of (state.reviewNotes.items || []).slice(0, 10)) {
      lines.push(`- ${note.contentId}${note.severity ? ` [${note.severity}]` : ""}: ${note.note}`);
    }
    for (const line of (state.reviewNotes.general || []).slice(0, 5)) lines.push(`- general: ${line}`);
  }
  lines.push("");
  lines.push("## What I want from you");
  lines.push("1. Explain the two most-missed items with a short, A1-level German example each.");
  lines.push("2. Give me 5 new gap-fill sentences for my weakest chapter, using only A1 vocabulary.");
  lines.push("3. Suggest a 10-minute practice plan for tomorrow based on the weak areas above.");
  lines.push("4. For the exam modules above, name one concrete thing to practise next.");
  lines.push("");
  return lines.join("\n");
}

export function writingPrompt(task, text) {
  return `You are my German A1 tutor. I am preparing for Goethe-Zertifikat A1: Start Deutsch 1.
Below is a Schreiben task and my answer. Mark it against the official A1 criteria (content points covered,
communicative design, language correctness), correct my German, and give me one improved version at A1 level.
Do not invent exam rules; say when you are unsure.

TASK:
${task || "[paste the task here]"}

MY ANSWER:
${text || "[paste your answer here]"}`;
}

export function speakingPrompt() {
  return `You are my German A1 speaking partner. I am preparing for Goethe-Zertifikat A1: Start Deutsch 1.
Ask me the three official-style Sprechen parts one at a time (introduce yourself, ask and answer questions,
make requests), wait for my answer, then give short feedback on pronunciation, vocabulary and structures.
Keep everything at A1 level and do not invent exam rules.`;
}

// Backwards-compatible name used by older code paths.
export const mercuryMarkdown = reviewMarkdown;

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function downloadText(filename, text, type = "text/markdown") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
