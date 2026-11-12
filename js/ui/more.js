import { app } from "../app.js";
import { buildBackup, backupFilename, restoreBackup } from "../backup.js";
import { count, estimateStorage, requestPersistence, replaceStores } from "../db.js";
import { clearReviewNotes, parseFindings, reviewCounts, saveReviewNotes } from "../findings.js";
import { copyText, downloadText, reviewMarkdown, reviewerName, speakingPrompt, writingPrompt } from "../mercury.js";
import { importPackFile } from "../pack-import.js";
import { getSettings, saveSettings } from "../settings.js";
import { loadState, state } from "../state.js";
import { el, pageTitle, progressBar, toast } from "./dom.js";

function bytes(value) {
  if (!Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function settingsSection() {
  const settings = getSettings();
  const theme = el("select", { class: "select", "aria-label": "Theme" });
  for (const [value, label] of [["auto", "Auto (system)"], ["light", "Light"], ["dark", "Dark"]]) {
    theme.append(el("option", { value, text: label, selected: settings.theme === value }));
  }
  theme.addEventListener("change", async () => {
    await saveSettings({ theme: theme.value });
    state.settings = getSettings();
    toast("Theme saved", "success");
  });

  const minutes = el("select", { class: "select", "aria-label": "Default session length" });
  for (const value of [10, 30, 45, 60]) {
    minutes.append(el("option", { value: String(value), text: `${value} minutes`, selected: settings.sessionMinutes === value }));
  }
  minutes.addEventListener("change", async () => {
    await saveSettings({ sessionMinutes: Number(minutes.value) });
    state.settings = getSettings();
    toast("Default length saved", "success");
  });

  const cardBoxes = el("div", { class: "check-list" });
  for (const type of ["de->en", "en->de", "article+plural", "cloze", "listen"]) {
    const box = el("input", { type: "checkbox", value: type, checked: settings.cardTypes.includes(type) });
    box.addEventListener("change", async () => {
      const current = new Set(getSettings().cardTypes);
      if (box.checked) current.add(type);
      else current.delete(type);
      if (!current.size) {
        box.checked = true;
        toast("Keep at least one card type", "error");
        return;
      }
      await saveSettings({ cardTypes: [...current] });
      state.settings = getSettings();
    });
    cardBoxes.append(el("label", { class: "check-row" }, box, el("span", { text: type })));
  }

  const weightRows = el("div", { class: "weights" });
  for (const [key, label] of [
    ["vocab", "Vocabulary"],
    ["grammar", "Grammar"],
    ["listening", "Listening"],
    ["reading", "Reading"],
    ["writing", "Writing"],
    ["speaking", "Speaking"],
  ]) {
    const range = el("input", {
      type: "range",
      min: "1",
      max: "5",
      step: "1",
      value: String(settings.weights[key] ?? 3),
      "aria-label": `${label} weight`,
    });
    const value = el("span", { class: "weight-value", text: String(settings.weights[key] ?? 3) });
    range.addEventListener("input", () => {
      value.textContent = range.value;
    });
    range.addEventListener("change", async () => {
      await saveSettings({ weights: { ...getSettings().weights, [key]: Number(range.value) } });
      state.settings = getSettings();
    });
    weightRows.append(el("label", { class: "weight-row" }, el("span", { text: label }), range, value));
  }

  return el(
    "section",
    { class: "card" },
    el("h2", { class: "section-title", text: "Settings" }),
    el("label", { class: "field-row" }, el("span", { text: "Theme" }), theme),
    el("label", { class: "field-row" }, el("span", { text: "Default session" }), minutes),
    el("h3", { class: "sub-title", text: "Card types" }),
    cardBoxes,
    el("h3", { class: "sub-title", text: "Self-assessment weights (readiness)" }),
    weightRows,
  );
}

function packSection() {
  const status = el("div", { class: "import-status" });
  const input = el("input", { type: "file", accept: ".zip,application/zip", multiple: true, class: "file-input", id: "pack-file" });
  const label = el("label", { class: "btn btn-primary file-label", for: "pack-file" }, "Choose pack files");
  input.addEventListener("change", async () => {
    const files = [...input.files];
    if (!files.length) return;
    status.replaceChildren();
    const bar = el("div", { class: "bar", role: "progressbar" }, el("span", { class: "bar-fill", style: "width:0%" }));
    const text = el("p", { class: "muted small", text: "Starting import…" });
    status.append(bar, text);
    for (const file of files) {
      text.textContent = `Importing ${file.name} (${bytes(file.size)})…`;
      try {
        const result = await importPackFile(file, {
          onProgress: ({ done, total, label: entry }) => {
            bar.querySelector(".bar-fill").style.width = `${Math.round((done / total) * 100)}%`;
            text.textContent = `${file.name}: ${done} / ${total} files · ${entry}`;
          },
        });
        toast(result.already ? `${result.packId} already imported` : `${result.packId} imported`, "success");
      } catch (error) {
        text.textContent = `${file.name}: ${error.message}`;
        text.classList.add("error-text");
        toast(error.message, "error");
      }
    }
    await loadState();
    app.render();
    input.value = "";
  });

  return el(
    "section",
    { class: "card" },
    el("h2", { class: "section-title", text: "Content packs" }),
    el("p", { class: "muted", text: "Import the core pack, the chapter audio packs, and the exam packs (exam-ue01.zip + exam-audio-ue01.zip) for the official trainers. Packs are verified with sha256 and can resume after an interruption." }),
    label,
    input,
    status,
    el("div", { class: "pack-list" },
      ...state.packs.map((pack) =>
        el(
          "div",
          { class: "pack-row" },
          el("strong", { text: pack.packId }),
          el("span", { class: "muted small", text: `${pack.kind} · ${pack.contentVersion} · ${pack.complete ? "complete" : `resume ${pack.importedCount}/${pack.totalCount}`}` }),
        ),
      ),
      state.packs.length ? null : el("p", { class: "muted small", text: "No packs imported yet." }),
    ),
  );
}

async function storageSection() {
  const estimate = await estimateStorage();
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const [contentCount, audioCount] = await Promise.all([count("content"), count("audio")]);
  const usage = estimate?.usage || 0;
  const quota = estimate?.quota || 0;
  const persistButton = el("button", { type: "button", class: "btn btn-secondary" }, persisted ? "Storage is persistent" : "Ask for persistent storage");
  persistButton.disabled = persisted;
  persistButton.addEventListener("click", async () => {
    const ok = await requestPersistence();
    toast(ok ? "Persistent storage granted" : "The browser did not grant persistent storage", ok ? "success" : "error");
    app.render();
  });
  return el(
    "section",
    { class: "card" },
    el("h2", { class: "section-title", text: "Storage" }),
    quota ? progressBar(Math.min(100, (usage / quota) * 100), `${bytes(usage)} of ${bytes(quota)}`) : el("p", { class: "muted", text: "Storage usage is unavailable in this browser." }),
    el("p", { class: "muted small", text: `${contentCount} content items · ${audioCount} audio files stored in IndexedDB.` }),
    persistButton,
  );
}

function backupSection() {
  const exportButton = el("button", { type: "button", class: "btn btn-secondary" }, "Export progress backup");
  exportButton.addEventListener("click", async () => {
    const payload = await buildBackup();
    downloadText(backupFilename(), JSON.stringify(payload, null, 2), "application/json");
    toast("Backup downloaded", "success");
  });
  const file = el("input", { type: "file", accept: ".json,application/json", class: "file-input", id: "backup-file" });
  const label = el("label", { class: "btn btn-secondary file-label", for: "backup-file" }, "Restore backup");
  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    try {
      const text = await chosen.text();
      const result = await restoreBackup(text);
      await loadState();
      toast(`Restored ${result.progress} records${result.missing.length ? `; ${result.missing.length} reference missing content` : ""}`, result.missing.length ? "error" : "success");
      app.render();
    } catch (error) {
      toast(error.message, "error");
    }
    file.value = "";
  });
  const resetButton = el("button", { type: "button", class: "btn btn-danger" }, "Reset progress");
  resetButton.addEventListener("click", async () => {
    if (!window.confirm("Reset all vocabulary and exam progress plus session history? Your packs, audio and settings stay. This cannot be undone.")) return;
    resetButton.disabled = true;
    try {
      await replaceStores({ progress: [], sessions: [] });
      await loadState();
      toast("Progress reset. Content packs are untouched.", "success");
      app.render();
    } catch (error) {
      resetButton.disabled = false;
      toast(error.message || "Could not reset progress", "error");
    }
  });
  return el(
    "section",
    { class: "card" },
    el("h2", { class: "section-title", text: "Backup & restore" }),
    el("p", { class: "muted", text: "Progress, sessions and settings only. Content comes back by re-importing packs; progress is never wiped by a content import." }),
    el("div", { class: "button-row" }, exportButton, label, file),
    el("p", { class: "muted small", text: "Reset clears vocabulary and exam progress plus session history. Packs, audio and settings stay." }),
    el("div", { class: "button-row" }, resetButton),
  );
}

function reviewerSection() {
  const settings = getSettings();
  const mode = el("select", { class: "select", "aria-label": "Who reviews your reports" });
  for (const [value, label] of [
    ["mercury", "Mercury (my other agent)"],
    ["other", "Another agent or person"],
    ["self", "Just me — no outside review"],
    ["none", "Skip for now"],
  ]) {
    mode.append(el("option", { value, text: label, selected: settings.reviewer.mode === value }));
  }
  const name = el("input", { class: "answer-input", type: "text", value: settings.reviewer.name, maxlength: "40", "aria-label": "Reviewer name" });
  const explanation = el("p", { class: "muted small" });
  const refresh = () => {
    name.disabled = mode.value === "self" || mode.value === "none";
    explanation.textContent = {
      mercury: "Default: the markdown report and prompts are addressed to Mercury.",
      other: "Any agent or person can use the same report; the text is not tied to Mercury.",
      self: "The report becomes your own study log; prompts are still available.",
      none: "No reviewer is configured. You can change this at any time — nothing is sent anywhere.",
    }[mode.value];
  };
  mode.addEventListener("change", async () => {
    await saveSettings({ reviewer: { ...getSettings().reviewer, mode: mode.value } });
    state.settings = getSettings();
    refresh();
    toast("Reviewer saved", "success");
  });
  name.addEventListener("change", async () => {
    const clean = name.value.trim() || "Mercury";
    await saveSettings({ reviewer: { ...getSettings().reviewer, name: clean } });
    state.settings = getSettings();
    toast("Reviewer name saved", "success");
  });
  refresh();
  return el(
    "section",
    { class: "card" },
    el("h2", { class: "section-title", text: "Reviewer" }),
    el("p", { class: "muted", text: "The report and the writing/speaking prompts are source-agnostic. Pick who reads them, or skip." }),
    el("label", { class: "field-row" }, el("span", { text: "Who reviews your reports?" }), mode),
    el("label", { class: "field-row" }, el("span", { text: "Reviewer name" }), name),
    explanation,
  );
}

function findingsSection() {
  const notes = state.reviewNotes;
  const counts = reviewCounts(notes);
  const summary = el(
    "p",
    { class: "muted small" },
    notes
      ? `Imported ${notes.importedAt ? new Date(notes.importedAt).toLocaleString() : ""} from ${notes.reviewerName || "reviewer"}: ${counts.items} item note(s), ${counts.general} general line(s).`
      : "No findings imported. You can paste a report from Mercury, another agent, or your own notes — or skip.",
  );
  const area = el("textarea", {
    class: "answer-textarea",
    rows: "5",
    "aria-label": "Paste reviewer findings",
    placeholder: "Paste findings. Any line with an item ID (e.g. a1-k01-v-0001) becomes a note on that item; other lines are kept as general notes.",
  });
  const preview = el("p", { class: "muted small" });
  area.addEventListener("input", () => {
    const parsed = parseFindings(area.value);
    preview.textContent = `${parsed.items.length} item note(s) · ${parsed.general.length} general line(s) · ${parsed.unknown.length} unknown ID(s)`;
  });
  const list = el("div", { class: "findings-list" });
  const renderList = () => {
    const current = reviewCounts(state.reviewNotes);
    list.replaceChildren(
      ...(state.reviewNotes?.items || []).slice(0, 12).map((note) =>
        el("p", { class: "finding-row" }, el("strong", { text: note.contentId }), note.severity ? el("span", { class: "badge badge-warn", text: note.severity }) : null, el("span", { class: "muted", text: ` ${note.note}` })),
      ),
      ...(state.reviewNotes?.general || []).slice(0, 5).map((line) => el("p", { class: "finding-row muted", text: `General: ${line}` })),
      !current.items && !current.general ? el("p", { class: "muted small", text: "Nothing imported yet." }) : null,
    );
  };
  renderList();
  const importButton = el("button", { type: "button", class: "btn btn-secondary" }, "Import findings");
  importButton.addEventListener("click", async () => {
    if (!area.value.trim()) {
      toast("Paste some findings first, or skip", "error");
      return;
    }
    const known = new Set(state.items.map((item) => item.id));
    const value = await saveReviewNotes({ reviewerName: reviewerName(getSettings()), text: area.value, knownIds: known });
    state.reviewNotes = value;
    const unknown = value.unknown?.length || 0;
    toast(`Imported ${value.items.length} item note(s)${unknown ? ` · ${unknown} unknown ID(s)` : ""}`, unknown ? "error" : "success");
    area.value = "";
    preview.textContent = "";
    summary.textContent = `Imported ${value.items.length} item note(s), ${value.general.length} general line(s) from ${value.reviewerName}.`;
    renderList();
  });
  const clear = el("button", { type: "button", class: "btn btn-quiet" }, "Clear findings");
  clear.addEventListener("click", async () => {
    if (!state.reviewNotes) return;
    await clearReviewNotes();
    state.reviewNotes = null;
    summary.textContent = "Findings cleared.";
    renderList();
    toast("Findings cleared", "success");
  });
  const skip = el("button", { type: "button", class: "btn btn-quiet" }, "Skip for now");
  skip.addEventListener("click", () => toast("Skipped. You can import findings any time.", "info"));
  return el(
    "section",
    { class: "card" },
    el("h2", { class: "section-title", text: "Reviewer findings (optional)" }),
    summary,
    area,
    preview,
    el("div", { class: "button-row" }, importButton, skip, clear),
    list,
    el("p", { class: "muted small", text: "Notes are local only and never change the content or answer keys. Items with a note show a reviewer badge." }),
  );
}

function reportSection() {
  const name = reviewerName(getSettings());
  const download = el("button", { type: "button", class: "btn btn-secondary" }, "Download report");
  download.addEventListener("click", () => {
    downloadText(`review-report-${new Date().toISOString().slice(0, 10)}.md`, reviewMarkdown());
    toast("Report downloaded", "success");
  });
  const copy = el("button", { type: "button", class: "btn btn-secondary" }, "Copy report");
  copy.addEventListener("click", async () => {
    const ok = await copyText(reviewMarkdown());
    toast(ok ? "Report copied" : "Copy failed; use Download", ok ? "success" : "error");
  });
  const copyWriting = el("button", { type: "button", class: "btn btn-quiet" }, "Copy writing prompt");
  copyWriting.addEventListener("click", async () => {
    const ok = await copyText(writingPrompt("", ""));
    toast(ok ? "Writing prompt copied" : "Copy failed", ok ? "success" : "error");
  });
  const copySpeaking = el("button", { type: "button", class: "btn btn-quiet" }, "Copy speaking prompt");
  copySpeaking.addEventListener("click", async () => {
    const ok = await copyText(speakingPrompt());
    toast(ok ? "Speaking prompt copied" : "Copy failed", ok ? "success" : "error");
  });
  return el(
    "section",
    { class: "card" },
    el("h2", { class: "section-title", text: `Report for ${name}` }),
    el("div", { class: "button-row" }, download, copy),
    el("p", { class: "muted small", text: "Prompts for writing/speaking feedback:" }),
    el("div", { class: "button-row" }, copyWriting, copySpeaking),
  );
}

function aboutSection() {
  const status = el("p", { class: "muted small", text: navigator.onLine ? "Online" : "Offline — everything local still works" });
  window.addEventListener("online", () => { status.textContent = "Online"; });
  window.addEventListener("offline", () => { status.textContent = "Offline — everything local still works"; });
  const check = el("button", { type: "button", class: "btn btn-secondary" }, "Check for update");
  check.addEventListener("click", async () => {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (!registration) {
      toast("Service worker is not active in this browser context", "error");
      return;
    }
    await registration.update();
    toast("Checked for a new version", "info");
  });
  return el(
    "section",
    { class: "card" },
    el("h2", { class: "section-title", text: "About" }),
    el("p", { class: "muted small", text: `App ${app.version} · content ${state.packs[0]?.contentVersion || "not imported"}` }),
    status,
    check,
  );
}

export async function renderMore(root) {
  root.append(pageTitle("More", "Settings · packs · reviewer · backup"));
  root.append(settingsSection(), packSection());
  root.append(await storageSection(), backupSection(), reviewerSection(), reportSection(), findingsSection(), aboutSection());
  root.append(el("p", { class: "muted small center", text: "Personal single-user trainer. No accounts, no analytics, no third-party requests." }));
}
