// Pack import: streamed entry-by-entry, sha256-verified, resumable.
// Writes content/audio/packs only. Progress records are never touched here.

import { get, getAll, put, putMany } from "./db.js";
import { bytesToText, listEntries, readEntry, sha256Hex } from "./zip.js";

function quotaMessage(error) {
  if (!error) return null;
  const name = error.name || "";
  const isQuota = name === "QuotaExceededError" || /quota|storage.*full/i.test(`${name} ${error.message || ""}`);
  return isQuota
    ? "Storage is full. Free space on the device, then import the same pack again — the import resumes where it stopped."
    : null;
}

function parseManifestBytes(bytes) {
  const manifest = JSON.parse(bytesToText(bytes));
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported pack schemaVersion ${manifest.schemaVersion}; this app reads version 1.`);
  }
  if (!manifest.packId || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error("Pack manifest is missing packId or files.");
  }
  return manifest;
}

async function importCoreFile(file, entry, fileSpec, manifest) {
  const bytes = await readEntry(file, entry);
  const actual = await sha256Hex(bytes);
  if (actual !== fileSpec.sha256) {
    throw new Error(`sha256 mismatch for ${fileSpec.path}: the pack is damaged or incomplete.`);
  }
  if (fileSpec.path.endsWith("units.json")) {
    const units = JSON.parse(bytesToText(bytes));
    await put("meta", { key: "units", value: units, updatedAt: new Date().toISOString() });
    return 1;
  }
  if (!fileSpec.path.startsWith("content/") || !fileSpec.path.endsWith(".json")) {
    return 0;
  }
  const items = JSON.parse(bytesToText(bytes));
  if (!Array.isArray(items)) throw new Error(`${fileSpec.path} is not a JSON array.`);
  for (const item of items) {
    if (!item || typeof item.id !== "string") {
      throw new Error(`${fileSpec.path} contains an item without a stable id.`);
    }
  }
  await putMany("content", items);
  return items.length;
}

async function importAudioFile(file, entry, fileSpec, manifest) {
  const bytes = await readEntry(file, entry);
  const actual = await sha256Hex(bytes);
  if (actual !== fileSpec.sha256) {
    throw new Error(`sha256 mismatch for ${fileSpec.path}: the pack is damaged or incomplete.`);
  }
  const meta = (manifest.audioFiles || []).find((a) => a.file === fileSpec.path) || {};
  const blob = new Blob([bytes], { type: "audio/mpeg" });
  await put("audio", {
    filename: fileSpec.path,
    blob,
    sha256: fileSpec.sha256,
    bytes: bytes.byteLength,
    duration: meta.duration ?? null,
    packId: manifest.packId,
    chapter: meta.chapter ?? null,
    book: meta.book ?? null,
    exercise: meta.exercise ?? null,
  });
  return 1;
}

/**
 * Import one pack file. Safe to call again after an interruption: the pack
 * record stores how many manifest files were committed.
 */
export async function importPackFile(file, { onProgress = () => {} } = {}) {
  const entries = await listEntries(file);
  const manifestEntry = entries.get("manifest.json");
  if (!manifestEntry) throw new Error("This file has no manifest.json at its root.");
  const manifestBytes = await readEntry(file, manifestEntry);
  const manifest = parseManifestBytes(manifestBytes);
  const manifestHash = await sha256Hex(manifestBytes);

  const previous = await get("packs", manifest.packId);
  const samePack = previous && previous.manifestHash === manifestHash;
  if (samePack && previous.complete) {
    return { packId: manifest.packId, kind: manifest.kind, already: true, files: manifest.files.length };
  }
  const start = samePack ? previous.importedCount || 0 : 0;
  const record = {
    packId: manifest.packId,
    kind: manifest.kind,
    contentVersion: manifest.contentVersion,
    manifestHash,
    complete: false,
    importedCount: start,
    totalCount: manifest.files.length,
    importedAt: samePack ? previous.importedAt : null,
    updatedAt: new Date().toISOString(),
  };
  await put("packs", record);

  try {
    for (let i = start; i < manifest.files.length; i++) {
      const fileSpec = manifest.files[i];
      const entry = entries.get(fileSpec.path);
      if (!entry) throw new Error(`Pack manifest lists ${fileSpec.path}, but the ZIP does not contain it.`);
      if (manifest.kind === "core" || manifest.kind === "exam") {
        await importCoreFile(file, entry, fileSpec, manifest);
      } else if (manifest.kind === "chapter-audio" || manifest.kind === "exam-audio") {
        await importAudioFile(file, entry, fileSpec, manifest);
      } else {
        throw new Error(`Unsupported pack kind ${manifest.kind}.`);
      }
      record.importedCount = i + 1;
      record.updatedAt = new Date().toISOString();
      await put("packs", record);
      onProgress({ packId: manifest.packId, done: i + 1, total: manifest.files.length, label: fileSpec.path });
    }
  } catch (error) {
    const message = quotaMessage(error);
    throw new Error(message || error.message || String(error));
  }

  record.complete = true;
  record.importedAt = new Date().toISOString();
  record.updatedAt = record.importedAt;
  await put("packs", record);
  return {
    packId: manifest.packId,
    kind: manifest.kind,
    already: false,
    files: manifest.files.length,
    contentVersion: manifest.contentVersion,
  };
}

export async function listPacks() {
  return getAll("packs");
}
