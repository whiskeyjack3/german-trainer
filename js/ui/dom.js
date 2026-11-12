// Tiny DOM helpers. No innerHTML with user data; text goes through textContent.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "html") node.innerHTML = value;
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function button(label, onClick, { kind = "secondary", ...attrs } = {}) {
  return el("button", { type: "button", class: `btn btn-${kind}`, onclick: onClick, ...attrs }, label);
}

export function pageTitle(title, subtitle = null) {
  return el(
    "header",
    { class: "page-title" },
    el("h1", { text: title }),
    subtitle ? el("p", { class: "muted", text: subtitle }) : null,
  );
}

export function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function sourceLabel(item) {
  const page = item?.source?.page;
  const file = item?.source?.file || "";
  const short = file.replace(/\.pdf$/i, "").split(" - ").pop();
  return page ? `${short || "book"} p.${page}` : short || "source ?";
}

export function toast(message, kind = "info") {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const node = el("div", { class: `toast toast-${kind}`, role: "status" }, message);
  region.append(node);
  setTimeout(() => node.remove(), 4200);
}

export function setBusy(node, busy) {
  if (!node) return;
  node.disabled = Boolean(busy);
  node.setAttribute("aria-busy", busy ? "true" : "false");
}

export function progressBar(value, label = null) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return el(
    "div",
    { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(safe), "aria-label": label || "progress" },
    el("span", { class: "bar-fill", style: `width:${safe}%` }),
    label ? el("span", { class: "bar-label", text: label }) : null,
  );
}
