// Today's Session planner (SPEC §6). Deterministic: identical inputs produce
// an identical plan; the clock is passed in, never read here.

export const SESSION_LENGTHS = [10, 30, 45, 60];
export const CARD_SECONDS = 12;
const BUDGET = { warmup: 0.05, srs: 0.55, drills: 0.25, wrap: 0.15 };

function sortDue(cards) {
  return [...cards].sort((a, b) => {
    if (Boolean(a.goethe) !== Boolean(b.goethe)) return a.goethe ? -1 : 1;
    const overdue = (b.overdueDays || 0) - (a.overdueDays || 0);
    if (overdue !== 0) return overdue;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * @param {object} input
 * @param {number} input.minutes 10 | 30 | 45 | 60
 * @param {Array} input.dueCards [{id, goethe, overdueDays}]
 * @param {Array} input.drills [{id, seconds, skill, priority}]
 * @returns {{steps: Array, totalSeconds: number, breakAt: number|null}}
 */
export function buildSession({ minutes, dueCards = [], drills = [] }) {
  if (!SESSION_LENGTHS.includes(minutes)) throw new Error(`Unsupported session length: ${minutes}`);
  const total = minutes * 60;
  const warmup = Math.round(total * BUDGET.warmup);
  const srsBudget = Math.round(total * BUDGET.srs);
  const drillBudget = Math.round(total * BUDGET.drills);
  const wrap = total - warmup - srsBudget - drillBudget;

  const steps = [{ kind: "warmup", contentId: null, seconds: warmup }];
  const queue = sortDue(dueCards);
  const cardSlots = Math.max(0, Math.floor(srsBudget / CARD_SECONDS));
  const cardCount = Math.min(queue.length, cardSlots);
  for (const card of queue.slice(0, cardCount)) {
    steps.push({ kind: "vocab", contentId: card.id, seconds: CARD_SECONDS });
  }

  // A small due queue frees SRS budget for extra drills (D038), so the plan
  // stays close to the requested length instead of collapsing to warm-up + wrap-up.
  const unusedSrs = Math.max(0, srsBudget - cardCount * CARD_SECONDS);
  const drillBudgetTotal = drillBudget + unusedSrs;

  const orderedDrills = [...drills].sort(
    (a, b) => (a.priority || 0) - (b.priority || 0) || String(a.id).localeCompare(String(b.id)),
  );
  let drillSeconds = 0;
  for (const drill of orderedDrills) {
    const seconds = Math.max(20, drill.seconds || 40);
    if (drillSeconds > 0 && drillSeconds + seconds > drillBudgetTotal) break;
    steps.push({
      kind: "exercise",
      contentId: drill.id,
      seconds,
      skill: drill.skill || null,
    });
    drillSeconds += seconds;
  }
  steps.push({ kind: "wrapup", contentId: null, seconds: wrap });

  let breakAt = null;
  if (minutes >= 30) {
    let elapsed = 0;
    for (let i = 0; i < steps.length; i++) {
      elapsed += steps[i].seconds;
      if (elapsed >= 20 * 60 && steps[i].kind !== "wrapup") {
        breakAt = i + 1;
        break;
      }
    }
    // Only a plan with a real amount of activity gets a break prompt (D038).
    if (breakAt === null) {
      const preWrap = steps
        .filter((step) => step.kind !== "wrapup")
        .reduce((sum, step) => sum + step.seconds, 0);
      if (preWrap >= 15 * 60) breakAt = Math.max(1, steps.length - 1);
    }
    if (breakAt !== null) steps.splice(breakAt, 0, { kind: "break", contentId: null, seconds: 0 });
  }
  return { steps, totalSeconds: steps.reduce((sum, step) => sum + step.seconds, 0), breakAt };
}

/**
 * Deterministically rotate card types. Availability comes from the item:
 * cloze needs a book example; article+plural needs an article or plural.
 */
export function selectCardType(index, meta, enabledTypes) {
  const available = enabledTypes.filter((type) => {
    if (type === "cloze") return Boolean(meta.hasExample);
    if (type === "article+plural") return Boolean(meta.hasArticle || meta.hasPlural);
    return true;
  });
  if (!available.length) return "de->en";
  return available[index % available.length];
}

export function stepTotals(plan) {
  const counts = { warmup: 0, vocab: 0, exercise: 0, break: 0, wrapup: 0 };
  for (const step of plan.steps) counts[step.kind] = (counts[step.kind] || 0) + 1;
  return counts;
}
