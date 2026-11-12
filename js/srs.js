// SM-2 scheduler (D026). Pure: every function takes `now` in ms and returns
// plain JSON, so the unit tests can pin the clock.

export const QUALITY = { again: 0, hard: 3, good: 4, easy: 5 };
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
export const EF_START = 2.5;
export const EF_MIN = 1.3;
export const MATURE_DAYS = 21;
export const MATURE_EF = 2.3;

export function newSrs(now) {
  return {
    n: 0,
    ef: EF_START,
    interval_days: 0,
    due_at: new Date(now).toISOString(),
    lapses: 0,
    last_quality: null,
  };
}

function nextEf(ef, quality) {
  const miss = 5 - quality;
  return Math.max(EF_MIN, Number((ef + (0.1 - miss * (0.08 + miss * 0.02))).toFixed(4)));
}

/**
 * Apply one review. `isNew` is true before the card has any successful review.
 * Returns a fresh srs object (never mutates the input).
 */
export function reviewSrs(srs, quality, now, isNew = false) {
  const current = srs || newSrs(now);
  const ef = nextEf(current.ef ?? EF_START, quality);
  const n = current.n ?? 0;
  const lapses = current.lapses ?? 0;

  if (quality < 3) {
    return {
      n: 0,
      ef,
      interval_days: 0,
      due_at: new Date(now + (isNew ? MINUTE : 10 * MINUTE)).toISOString(),
      lapses: lapses + 1,
      last_quality: quality,
    };
  }

  if (isNew || n === 0) {
    // Learning ladder: Hard 10 min, Good 1 day, Easy 4 days.
    const learningDays = quality === QUALITY.hard ? 10 / (24 * 60) : quality === QUALITY.good ? 1 : 4;
    return {
      n: 1,
      ef,
      interval_days: Number(learningDays.toFixed(4)),
      due_at: new Date(now + learningDays * DAY).toISOString(),
      lapses,
      last_quality: quality,
    };
  }

  const previousInterval = current.interval_days || 1;
  const interval = n === 1 ? 6 : Math.max(1, Math.round(previousInterval * ef));
  return {
    n: n + 1,
    ef,
    interval_days: interval,
    due_at: new Date(now + interval * DAY).toISOString(),
    lapses,
    last_quality: quality,
  };
}

export function isDue(srs, now) {
  if (!srs || !srs.due_at) return true;
  const due = Date.parse(srs.due_at);
  return Number.isFinite(due) ? due <= now : true;
}

export function isMature(srs) {
  return Boolean(srs && srs.interval_days >= MATURE_DAYS && srs.ef >= MATURE_EF);
}

export function overdueDays(srs, now) {
  if (!srs || !srs.due_at) return 0;
  const due = Date.parse(srs.due_at);
  if (!Number.isFinite(due)) return 0;
  return Math.max(0, Math.floor((now - due) / DAY));
}

export function qualityFromResult(result) {
  if (result === "exact") return QUALITY.good;
  if (result === "case_fold" || result === "umlaut_fold") return QUALITY.hard;
  return QUALITY.again;
}
