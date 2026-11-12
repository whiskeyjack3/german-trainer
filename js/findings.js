// Review findings from any external reviewer (Mercury, another agent, or the
// owner's own notes). The app never hard-codes a reviewer: notes are plain text
// anchored to stable item IDs, stored in the meta store, and shown as badges.
// Nothing here is content and nothing counts as an answer key.

import { get, put } from "./db.js";

export const REVIEW_KEY = "reviewNotes";

export function reviewerName(settings) {
  const reviewer = settings?.reviewer || {};
  if (reviewer.mode === "self" || reviewer.mode === "none") return "my notes";
  return reviewer.name || "Mercury";
}

const ID_PATTERN = /\b(a1|a2|b1)-(k|pl|th|iv|ex)\d{2}-[a-z]-\d{4}\b/g;
const SEVERITY_PATTERN = /\b(high|medium|low|critical|blocker)\b/i;

/**
 * Parse pasted findings. Any line that mentions a stable content ID becomes an
 * item note; all other non-empty lines become general notes. Unknown IDs are
 * kept but reported so a typo cannot silently "fix" nothing.
 */
export function parseFindings(text, { knownIds = null } = {}) {
  const items = [];
  const general = [];
  const unknown = [];
  const seen = new Set();
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*•]\s*/, "");
    if (!line) continue;
    const ids = [...line.matchAll(ID_PATTERN)].map((match) => match[0]);
    if (!ids.length) {
      if (general.length < 200) general.push(line);
      continue;
    }
    const note = line.replace(ID_PATTERN, "").replace(/\s{2,}/g, " ").replace(/^[\s:–—-]+|[\s:–—-]+$/g, "");
    const severityMatch = line.match(SEVERITY_PATTERN);
    for (const contentId of ids) {
      const key = `${contentId}|${note}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = {
        contentId,
        note: note || "(no note text)",
        severity: severityMatch ? severityMatch[1].toLowerCase() : null,
      };
      if (knownIds && !knownIds.has(contentId)) unknown.push(item);
      items.push(item);
    }
  }
  return { items, general, unknown };
}

export async function loadReviewNotes() {
  const record = await get("meta", REVIEW_KEY);
  return record?.value || null;
}

export async function saveReviewNotes({ reviewerName: name, text, now = Date.now(), knownIds = null }) {
  const parsed = parseFindings(text, { knownIds });
  const value = {
    schemaVersion: 1,
    reviewerName: name || "reviewer",
    importedAt: new Date(now).toISOString(),
    items: parsed.items,
    general: parsed.general,
    unknown: parsed.unknown,
  };
  await put("meta", { key: REVIEW_KEY, value, updatedAt: new Date(now).toISOString() });
  return value;
}

export async function clearReviewNotes() {
  await put("meta", { key: REVIEW_KEY, value: null, updatedAt: new Date().toISOString() });
}

export function reviewNoteFor(notes, contentId) {
  return (notes?.items || []).find((item) => item.contentId === contentId) || null;
}

export function reviewCounts(notes) {
  return {
    items: notes?.items?.length || 0,
    general: notes?.general?.length || 0,
    unknown: notes?.unknown?.length || 0,
  };
}
