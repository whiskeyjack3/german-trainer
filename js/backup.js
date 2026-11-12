// Backup / restore of progress, sessions and settings. Content is restored by
// re-importing packs, never from a backup file (SPEC §13).

import { getAll, get, put, replaceStores } from "./db.js";
import { REVIEW_KEY } from "./findings.js";
import { migrateProgressRecord } from "./migrate.js";
import { getSettings } from "./settings.js";
import { state } from "./state.js";

export async function buildBackup(now = Date.now()) {
  const [progress, sessions, reviewNotes] = await Promise.all([
    getAll("progress"),
    getAll("sessions"),
    get("meta", REVIEW_KEY),
  ]);
  return {
    schemaVersion: 1,
    exportedAt: new Date(now).toISOString(),
    appVersion: "p5-2026-11-12",
    settings: getSettings(),
    progress,
    sessions,
    reviewNotes: reviewNotes?.value || null,
  };
}

export function backupFilename(now = Date.now()) {
  return `german-trainer-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
}

export async function restoreBackup(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (payload.schemaVersion !== 1) {
    throw new Error(`Unsupported backup schemaVersion ${payload.schemaVersion}; this app reads version 1.`);
  }
  const progress = Array.isArray(payload.progress) ? payload.progress.map(migrateProgressRecord) : null;
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  if (!progress) throw new Error("Backup has no progress array.");
  const missing = progress.filter((record) => !state.byId.has(record.contentId)).map((record) => record.contentId);
  await replaceStores({ progress, sessions });
  if (payload.settings) {
    await put("meta", { key: "settings", value: payload.settings, updatedAt: new Date().toISOString() });
  }
  // Restore replaces state: if the backup carries no notes, clear the current ones.
  await put("meta", { key: REVIEW_KEY, value: payload.reviewNotes ?? null, updatedAt: new Date().toISOString() });
  return { progress: progress.length, sessions: sessions.length, missing };
}
