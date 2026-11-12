import { app } from "./app.js";
import { primeVoices } from "./audio.js";
import { requestPersistence } from "./db.js";
import { loadSettings } from "./settings.js";
import { loadState } from "./state.js";
import { renderGrammar } from "./ui/grammar.js";
import { renderMore } from "./ui/more.js";
import { renderExamRun } from "./ui/exam-run.js";
import { renderSchreiben } from "./ui/schreiben.js";
import { renderSimulator } from "./ui/simulator.js";
import { renderSprechen } from "./ui/sprechen.js";
import { renderSession } from "./ui/session.js";
import { renderToday } from "./ui/today.js";
import { renderTrain } from "./ui/train.js";
import { renderVocab } from "./ui/vocab.js";
import { clear, el } from "./ui/dom.js";

const VIEWS = {
  today: renderToday,
  vocab: renderVocab,
  grammar: renderGrammar,
  train: renderTrain,
  more: renderMore,
  session: renderSession,
  "exam-lesen": (root) => renderExamRun(root, "lesen"),
  "exam-hoeren": (root) => renderExamRun(root, "hoeren"),
  "exam-schreiben": (root) => renderSchreiben(root),
  "exam-sprechen": (root) => renderSprechen(root),
  simulator: renderSimulator,
};

function currentView() {
  const view = location.hash.replace(/^#\/?/, "").split("/")[0];
  return VIEWS[view] ? view : "today";
}

function markTabs(view) {
  const active = view === "session" ? "today" : view.startsWith("exam-") || view === "simulator" ? "train" : view;
  document.querySelectorAll(".tab").forEach((tab) => {
    if (tab.dataset.view === active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
}

function errorCard(error) {
  return el(
    "section",
    { class: "card error-card" },
    el("h1", { text: "Something went wrong" }),
    el("p", { class: "muted", text: error.message || String(error) }),
    el("p", { class: "muted small", text: "Your progress is stored locally and has not been changed by this error." }),
  );
}

async function render() {
  const root = document.getElementById("main");
  const view = currentView();
  markTabs(view);
  clear(root);
  try {
    await VIEWS[view](root);
  } catch (error) {
    console.error(error);
    root.append(errorCard(error));
  }
  document.title = view === "today" ? "German Trainer" : `German Trainer · ${view}`;
  root.focus({ preventScroll: true });
}

let reloading = false;
let updateAccepted = false;

function setupUpdatePrompt() {
  const banner = document.getElementById("update-banner");
  const button = document.getElementById("update-button");
  if (!banner || !button) return;
  let waiting = null;
  const show = (registration) => {
    waiting = registration.waiting;
    banner.hidden = false;
  };
  button.addEventListener("click", () => {
    updateAccepted = true;
    if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
    banner.hidden = true;
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateAccepted || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register("./sw.js")
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) show(registration);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) show(registration);
        });
      });
    })
    .catch((error) => console.warn("Service worker registration failed", error));
  window.addEventListener("online", () => {
    navigator.serviceWorker.getRegistration().then((registration) => registration?.update());
  });
}

function setupNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => app.go(button.dataset.view));
  });
}

async function boot() {
  app.go = (view) => {
    if (location.hash.replace(/^#\/?/, "") === view) render();
    else location.hash = view;
  };
  app.render = render;
  setupNavigation();
  window.addEventListener("hashchange", render);
  try {
    await loadSettings();
    await loadState();
    render();
    primeVoices();
    requestPersistence().then((persisted) => {
      if (!persisted) console.info("Persistent storage not granted");
    });
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) setupUpdatePrompt();
  } catch (error) {
    console.error(error);
    document.getElementById("main").append(errorCard(error));
  }
}

boot();
