// Audio: book MP3s come from the imported packs (IndexedDB Blobs); the
// listen card type falls back to the device's German speech voice, which is
// labelled in the UI as a device voice, never as book audio.

import { get } from "./db.js";

const urlCache = new Map();

export async function audioUrl(filename) {
  if (!filename) return null;
  if (urlCache.has(filename)) return urlCache.get(filename);
  const record = await get("audio", filename);
  if (!record?.blob) return null;
  const url = URL.createObjectURL(record.blob);
  urlCache.set(filename, url);
  return url;
}

export async function audioRecord(filename) {
  return get("audio", filename);
}

let voicesReady = null;

export function primeVoices() {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  const load = () => window.speechSynthesis.getVoices();
  voicesReady = new Promise((resolve) => {
    const voices = load();
    if (voices.length) return resolve(voices);
    const onChange = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      resolve(load());
    };
    window.speechSynthesis.addEventListener("voiceschanged", onChange);
    setTimeout(() => resolve(load()), 1500);
  });
  return voicesReady;
}

export function germanVoice() {
  if (!("speechSynthesis" in window)) return null;
  return window.speechSynthesis.getVoices().find((voice) => /^de(-|_|$)/i.test(voice.lang)) || null;
}

export function canSpeakGerman() {
  return Boolean(germanVoice());
}

export function speakGerman(text) {
  if (!("speechSynthesis" in window)) return false;
  const voice = germanVoice();
  if (!voice) return false;
  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.lang = voice.lang || "de-DE";
  utterance.voice = voice;
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
