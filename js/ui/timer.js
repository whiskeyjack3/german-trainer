// Countdown used by the exam trainer/simulator. The expiry callback runs once.
// Remaining time is computed from the wall clock, not a tick counter, so a
// hidden tab (screen off / app switch) cannot stretch the official timing.
import { el } from "./dom.js";

export function countdown(seconds, onExpire) {
  const initial = Math.max(0, Math.floor(seconds));
  let endsAt = null;
  let handle = null;
  let fired = false;
  const value = el("strong", { class: "timer-value", text: fmt(initial) });
  const node = el(
    "div",
    { class: "countdown", role: "timer", "aria-label": "Time left" },
    el("span", { class: "muted small", text: "Time left" }),
    value,
  );
  function fmt(total) {
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function currentRemaining() {
    if (endsAt === null) return initial;
    return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  }
  function tick() {
    if (!node.isConnected) {
      stop();
      return;
    }
    const remaining = currentRemaining();
    value.textContent = fmt(remaining);
    node.classList.toggle("countdown-low", remaining <= 60);
    if (remaining === 0 && !fired) {
      fired = true;
      stop();
      onExpire?.();
    }
  }
  function start() {
    if (handle) return;
    endsAt = Date.now() + initial * 1000;
    node.classList.toggle("countdown-low", initial <= 60);
    handle = setInterval(tick, 1000);
    tick();
  }
  function stop() {
    if (handle) clearInterval(handle);
    handle = null;
  }
  return { node, start, stop, remaining: currentRemaining, fired: () => fired };
}
