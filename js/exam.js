// Pure exam logic: scoring a module's answers, the rubric maths, and reading
// the latest attempts back from progress. Format facts live in exam-format.js.

import { MODULE_INFO, WRITING } from "./exam-format.js";
import { isAcceptedResult, matchAnswer } from "./matching.js";
import { state } from "./state.js";
import { roundScore, weightedScore } from "./scoring.js";

export function examItems() {
  return state.items.filter((item) => item.module && item.exam_set);
}

export function examSets() {
  const seen = new Map();
  for (const item of examItems()) {
    if (!seen.has(item.exam_set.id)) seen.set(item.exam_set.id, item.exam_set);
  }
  return [...seen.values()];
}

export function moduleItem(module) {
  return examItems().find((item) => item.module === module) || null;
}

export function moduleLabel(module) {
  return MODULE_INFO[module]?.title || module;
}

function tfResult(given, expected) {
  return given === expected ? "exact" : "no_match";
}

function numericResult(given, expected) {
  return Number(given) === Number(expected) ? "exact" : "no_match";
}

/** Lesen: parts 1 (R/F), 2 (a/b), 3 (R/F). answers = {part: {number: value}}. */
export function scoreLesen(item, answers) {
  const parts = [];
  let raw = 0;
  let units = 0;
  for (const part of item.parts) {
    const given = answers[part.part] || {};
    const rows = part.items.map((entry) => {
      const correct = given[entry.number] === entry.answer;
      units += 1;
      if (correct) raw += 1;
      return { number: entry.number, correct, expected: entry.answer, given: given[entry.number] ?? null };
    });
    parts.push({ part: part.part, rows });
  }
  return { raw, max: units, units, parts, selfRated: false };
}

/** Hören: MC (index) and R/F (boolean). */
export function scoreHoeren(item, answers) {
  const parts = [];
  let raw = 0;
  let units = 0;
  for (const part of item.parts) {
    const given = answers[part.part] || {};
    const rows = part.items.map((entry) => {
      const correct = part.type === "true-false"
        ? tfResult(given[entry.number], entry.answer) === "exact"
        : numericResult(given[entry.number], entry.correct_index) === "exact";
      units += 1;
      if (correct) raw += 1;
      return { number: entry.number, correct, expected: part.type === "true-false" ? entry.answer : entry.correct_index, given: given[entry.number] ?? null };
    });
    parts.push({ part: part.part, rows });
  }
  return { raw, max: units, units, parts, selfRated: false };
}

/** Schreiben Teil 1: five blanks, typed answers with umlaut/ae-oe-ue-ss matching. */
export function scoreWritingForm(item, answers = {}) {
  const part = item.parts.find((entry) => entry.type === "form-fill");
  const blank = part.fields.filter((field) => !field.prefilled);
  const rows = blank.map((field) => {
    const accepted = field.answers || [field.answer];
    const result = matchAnswer(answers[field.number] || "", accepted, { noun: /^[A-ZÄÖÜ]/.test(accepted[0]) }).result;
    return {
      number: field.number,
      label: field.label,
      correct: isAcceptedResult(result),
      expected: accepted.join(" / "),
      given: answers[field.number] || "",
      result,
    };
  });
  const raw = rows.filter((row) => row.correct).length;
  return { raw, max: WRITING.part1Max, units: blank.length, rows, selfRated: false };
}

/** Schreiben Teil 2 rubric: three content points (3/1.5/0) + communicative (1/0.5/0). */
export function scoreWritingRubric(ratings = [], communicative = 0) {
  const safe = ratings.slice(0, WRITING.contentPoints).map((value) => (Number.isFinite(Number(value)) ? Number(value) : 0));
  const content = safe.reduce((sum, value) => sum + value, 0);
  const raw = roundScore(content + (Number(communicative) || 0));
  return { raw, max: WRITING.part2Max, content: roundScore(content), communicative: Number(communicative) || 0 };
}

/**
 * Sprechen self-rating. Each element is {max, fraction} where fraction is
 * 1 / 0.5 / 0 (official full / half / zero, PZ Seiten 46, 49–53).
 */
export function scoreSpeaking(elements = []) {
  const rows = elements.map((element) => {
    const fraction = [1, 0.5, 0].includes(Number(element.fraction)) ? Number(element.fraction) : 0;
    return { ...element, fraction, points: roundScore(element.max * fraction) };
  });
  const raw = roundScore(rows.reduce((sum, row) => sum + row.points, 0));
  const max = rows.reduce((sum, row) => sum + row.max, 0);
  return { raw, max, rows, selfRated: true };
}

/** The official per-module elements for the Sprechen self-check. */
export function speakingElements() {
  return [
    { part: 1, key: "vorstellen", max: 1, label: "I introduced myself (name, origin, home, languages, hobby)." },
    { part: 1, key: "buchstabieren", max: 1, label: "I spelled a name/place when asked." },
    { part: 1, key: "nummer", max: 1, label: "I gave a number (phone number) when asked." },
    { part: 2, key: "q1", max: 2, label: "First question: clear and about the topic." },
    { part: 2, key: "a1", max: 1, label: "First answer: appropriate and comprehensible." },
    { part: 2, key: "q2", max: 2, label: "Second question: clear and about the topic." },
    { part: 2, key: "a2", max: 1, label: "Second answer: appropriate and comprehensible." },
    { part: 3, key: "r1", max: 2, label: "First request: understandable and polite." },
    { part: 3, key: "re1", max: 1, label: "First reaction: appropriate." },
    { part: 3, key: "r2", max: 2, label: "Second request: understandable and polite." },
    { part: 3, key: "re2", max: 1, label: "Second reaction: appropriate." },
  ];
}

/** Objective, non-AI checks for the Schreiben Teil 2 text (PZ Seite 38 wording). */
export function writingChecks(text, part) {
  const trimmed = String(text || "").trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const hasGreeting = /^(liebe[rn]?|hallo|hi|sehr geehrte[rn]?|guten tag)\b/im.test(trimmed);
  const hasClosing = /(viele grüße|liebe grüße|herzliche grüße|freundliche grüße|bis bald|bis dann|alles liebe|gruß)\b/i.test(trimmed);
  const min = part.min_words || 20;
  const max = part.max_words || 50;
  return {
    words,
    hasGreeting,
    hasClosing,
    inRange: words >= min && words <= max,
    checks: [
      { key: "words", ok: words >= min, label: `At least ${min} words (you wrote ${words})` },
      { key: "greeting", ok: hasGreeting, label: "Salutation (Anrede) present" },
      { key: "closing", ok: hasClosing, label: "Closing (Grußformel) present" },
    ],
  };
}

export function latestExamResults() {
  const out = {};
  for (const record of state.progress.values()) {
    const exam = record.meta?.exam;
    if (!exam) continue;
    const previous = out[exam.module];
    if (!previous || String(exam.at) > String(previous.at)) out[exam.module] = exam;
  }
  return out;
}

export function examAttemptSummary(module) {
  const candidates = [...state.progress.values()].filter((record) => record.meta?.exam?.module === module);
  if (!candidates.length) return null;
  const record = candidates.sort((a, b) => String(b.meta.exam.at).localeCompare(String(a.meta.exam.at)))[0];
  const attempts = record.attempts || [];
  const correct = attempts.filter((attempt) => isAcceptedResult(attempt.result)).length;
  return { attempts: attempts.length, correct, record };
}

export function weighted(raw) {
  return roundScore(weightedScore(raw));
}
