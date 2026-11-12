import { get, put } from "./db.js";
import { migrateSettings } from "./migrate.js";

let cached = null;

export function applyTheme(settings) {
  const theme = settings?.theme || "auto";
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    meta.setAttribute("content", dark ? "#0e1524" : "#15305c");
  }
}

export async function loadSettings() {
  const record = await get("meta", "settings");
  cached = migrateSettings(record?.value);
  applyTheme(cached);
  return cached;
}

export function getSettings() {
  if (!cached) throw new Error("settings not loaded");
  return cached;
}

export async function saveSettings(patch) {
  cached = migrateSettings({ ...cached, ...patch });
  await put("meta", { key: "settings", value: cached, updatedAt: new Date().toISOString() });
  applyTheme(cached);
  return cached;
}
