// Data migrations. Progress must survive app updates; unsupported future
// versions fail loudly instead of being silently misread.

export const PROGRESS_SCHEMA_VERSION = 1;

export function migrateProgressRecord(record) {
  if (!record || typeof record !== "object") throw new Error("progress record must be an object");
  const version = record.schemaVersion;
  if (version === PROGRESS_SCHEMA_VERSION) return record;
  if (version === undefined || version === 0) {
    return {
      ...record,
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      srs: {
        n: record.srs?.n ?? 0,
        ef: record.srs?.ef ?? 2.5,
        interval_days: record.srs?.interval_days ?? 0,
        due_at: record.srs?.due_at ?? new Date(0).toISOString(),
        lapses: record.srs?.lapses ?? 0,
        last_quality: record.srs?.last_quality ?? null,
      },
      attempts: Array.isArray(record.attempts) ? record.attempts : [],
      review_count: record.review_count ?? 0,
      correct_count: record.correct_count ?? 0,
    };
  }
  throw new Error(`Unsupported progress schemaVersion ${version}; this app reads version ${PROGRESS_SCHEMA_VERSION}.`);
}

export function migrateSettings(settings) {
  const defaults = {
    schemaVersion: 1,
    theme: "auto",
    sessionMinutes: 30,
    cardTypes: ["de->en", "en->de", "article+plural", "cloze", "listen"],
    weights: { vocab: 3, grammar: 3, listening: 3, reading: 3, writing: 3, speaking: 3 },
    reviewer: { mode: "mercury", name: "Mercury" },
  };
  if (!settings || typeof settings !== "object") return defaults;
  const merged = {
    ...defaults,
    ...settings,
    schemaVersion: 1,
    weights: { ...defaults.weights, ...(settings.weights || {}) },
    reviewer: { ...defaults.reviewer, ...(settings.reviewer || {}) },
    cardTypes: Array.isArray(settings.cardTypes) && settings.cardTypes.length ? settings.cardTypes : defaults.cardTypes,
  };
  if (!["auto", "light", "dark"].includes(merged.theme)) merged.theme = "auto";
  if (!["mercury", "other", "self", "none"].includes(merged.reviewer.mode)) merged.reviewer.mode = "mercury";
  if (!merged.reviewer.name || typeof merged.reviewer.name !== "string") merged.reviewer.name = "Mercury";
  return merged;
}
