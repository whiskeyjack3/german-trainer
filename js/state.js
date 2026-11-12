// In-memory view of the database. Screens read from here; writes go through
// progress.js / pack-import.js and then call loadState() again.

import { getAll, get } from "./db.js";
import { loadReviewNotes } from "./findings.js";
import { migrateProgressRecord } from "./migrate.js";
import { loadSettings } from "./settings.js";
import { isDue, overdueDays } from "./srs.js";

export const state = {
  units: [],
  items: [],
  byId: new Map(),
  progress: new Map(),
  sessions: [],
  learnedPacks: [],
  reviewNotes: null,
  loaded: false,
};

export function unitOfId(id) {
  return String(id).split("-")[1] || "";
}

export function chapterOfUnit(unit) {
  const match = /^k(\d{2})$/.exec(unit || "");
  return match ? Number(match[1]) : null;
}

export function unitTitle(unit) {
  const found = state.units.find((u) => u.unit === unit);
  if (found) return found.title;
  const chapter = chapterOfUnit(unit);
  return chapter ? `Kapitel ${chapter}` : unit || "—";
}

export async function loadState() {
  const [items, progressRecords, sessions, packs, unitsRecord] = await Promise.all([
    getAll("content"),
    getAll("progress"),
    getAll("sessions"),
    getAll("packs"),
    get("meta", "units"),
  ]);
  state.items = items.filter((item) => item && typeof item.id === "string");
  state.byId = new Map(state.items.map((item) => [item.id, item]));
  state.progress = new Map();
  for (const record of progressRecords) {
    try {
      const migrated = migrateProgressRecord(record);
      state.progress.set(migrated.contentId, migrated);
    } catch (error) {
      console.warn("skipping progress record", record?.contentId, error.message);
    }
  }
  state.sessions = sessions.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  state.packs = packs;
  state.units = unitsRecord?.value?.units || [];
  state.reviewNotes = await loadReviewNotes();
  state.settings = await loadSettings();
  state.loaded = true;
  return state;
}

export function getItem(id) {
  return state.byId.get(id) || null;
}

export function vocabItems() {
  return state.items.filter((item) => item.id.split("-")[2] === "v" && item.gloss?.en);
}

export function grammarItems() {
  return state.items.filter((item) => item.id.split("-")[2] === "g");
}

export function exerciseItems() {
  return state.items.filter((item) => item.id.split("-")[2] === "e");
}

export function itemsForUnit(unit) {
  return state.items.filter((item) => unitOfId(item.id) === unit);
}

export function availableUnits() {
  const units = state.units.filter((u) => itemsForUnit(u.unit).length > 0);
  if (units.length) return units;
  const seen = new Set();
  for (const item of state.items) {
    const unit = unitOfId(item.id);
    if (unit.startsWith("k") && !seen.has(unit)) {
      seen.add(unit);
      units.push({ unit, chapter: chapterOfUnit(unit), title: unitTitle(unit), level: item.level });
    }
  }
  return units.sort((a, b) => (a.chapter || 0) - (b.chapter || 0));
}

export function vocabMeta(item) {
  const example = item.example_de || "";
  return {
    hasExample: Boolean(item.lemma && example.toLowerCase().includes(item.lemma.toLowerCase())),
    hasArticle: Boolean(item.article),
    hasPlural: Boolean(item.plural && item.plural !== "–"),
  };
}

export function dueVocab(now) {
  const out = [];
  for (const item of vocabItems()) {
    const record = state.progress.get(item.id);
    const due = !record || isDue(record.srs, now);
    if (!due) continue;
    out.push({
      id: item.id,
      goethe: Boolean(item.goethe_wortliste),
      overdueDays: record ? overdueDays(record.srs, now) : 0,
    });
  }
  return out;
}

export function newVocabCount() {
  return vocabItems().filter((item) => !state.progress.has(item.id)).length;
}

export function reviewableVocab() {
  return vocabItems().filter((item) => !item.needs_review);
}

export function chapterProgressRecords(chapter) {
  const prefix = `a1-k${String(chapter).padStart(2, "0")}-v-`;
  return [...state.progress.values()].filter((record) => record.contentId.startsWith(prefix));
}

export function allAttempts({ skill = null } = {}) {
  const attempts = [];
  for (const record of state.progress.values()) {
    const item = getItem(record.contentId);
    if (skill && (item?.tags || []).includes(skill) === false) continue;
    for (const attempt of record.attempts || []) attempts.push({ ...attempt, contentId: record.contentId });
  }
  return attempts;
}

export function streakDays(now) {
  const days = new Set(
    state.sessions
      .filter((session) => session.completed)
      .map((session) => new Date(session.started_at).toDateString()),
  );
  let streak = 0;
  const cursor = new Date(now);
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
