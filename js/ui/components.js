import { audioUrl } from "../audio.js";
import { reviewNoteFor } from "../findings.js";
import { state } from "../state.js";
import { el } from "./dom.js";

export function badge(text, kind = "info") {
  return el("span", { class: `badge badge-${kind}`, text });
}

export function itemBadges(item) {
  const badges = [];
  if (item.generated) badges.push(badge("generated", "warn"));
  if (item.needs_review) badges.push(badge("needs review", "warn"));
  if (item.goethe_wortliste) badges.push(badge("exam list", "exam"));
  const note = reviewNoteFor(state.reviewNotes, item?.id);
  if (note) badges.push(badge(`reviewer: ${note.severity || "note"}`, "warn"));
  return badges.length ? el("span", { class: "badges" }, ...badges) : null;
}

export function shortFile(file) {
  const name = String(file || "").replace(/\.pdf$/i, "");
  if (/Kursbuch/i.test(name)) return "Kursbuch A1";
  if (/Arbeitsbuch/i.test(name)) return "Arbeitsbuch A1";
  if (/Testheft/i.test(name)) return "Testheft A1";
  if (/Kapitelwortschatz/i.test(name)) return "Kapitelwortschatz";
  if (/Glossar/i.test(name)) return "Glossar Englisch";
  if (/Wortliste/i.test(name)) return "Goethe Wortliste A1";
  if (/Lösungsschlüssel/i.test(name)) return "Lösungsschlüssel";
  if (/Transkript/i.test(name)) return "Transkripte";
  return name.split(" - ").pop() || "source";
}

export function sourceLine(item) {
  const page = item?.source?.page;
  const file = shortFile(item?.source?.file);
  return el(
    "p",
    { class: "source-line" },
    el("span", { text: file || "source ?" }),
    page ? el("strong", { text: ` · p.${page}` }) : null,
    item?.source?.printed_page && item.source.printed_page !== page
      ? el("span", { class: "muted", text: ` (printed p.${item.source.printed_page})` })
      : null,
    item?.source?.line ? el("span", { class: "muted", text: ` · ${item.source.line}` }) : null,
  );
}

export function audioPlayer(filename, { label = "Play book audio", caption = "Book audio" } = {}) {
  const wrapper = el("div", { class: "audio-block" });
  const status = el("p", { class: "muted", text: "Loading audio…" });
  wrapper.append(status);
  audioUrl(filename).then((url) => {
    if (!url) {
      status.textContent = "Audio not imported. Import this chapter's audio pack in More → Packs.";
      status.classList.add("error-text");
      return;
    }
    status.remove();
    wrapper.append(
      el("audio", { controls: true, preload: "metadata", src: url, "aria-label": label }),
      el("p", { class: "muted small", text: `${caption} · ${filename}` }),
    );
  });
  return wrapper;
}

export function ruleBox(grammar) {
  if (!grammar) return null;
  return el(
    "section",
    { class: "rule-box" },
    el("h3", { text: grammar.topic }),
    el("p", { class: "rule-text", text: grammar.rule_de }),
    el("p", { class: "muted", text: grammar.rule_en }),
    el(
      "ul",
      { class: "examples" },
      ...(grammar.examples || []).map((example) =>
        el("li", {}, el("span", { text: example.de }), example.en ? el("span", { class: "muted", text: ` — ${example.en}` }) : null),
      ),
    ),
    sourceLine(grammar),
  );
}

export function emptyState(title, body, action = null) {
  return el(
    "section",
    { class: "empty-state" },
    el("h2", { text: title }),
    el("p", { class: "muted", text: body }),
    action,
  );
}

export function section(title, ...children) {
  return el("section", { class: "card" }, el("h2", { class: "section-title", text: title }), ...children);
}
