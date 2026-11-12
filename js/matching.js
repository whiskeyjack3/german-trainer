// Typed-answer matching (SPEC §9). Deterministic and unit-tested.

export const RESULTS = {
  exact: "exact",
  umlautFold: "umlaut_fold",
  caseFold: "case_fold",
  nounCaseError: "noun_case_error",
  noMatch: "no_match",
};

export function normalize(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

export function fold(value) {
  return normalize(value)
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue");
}

export function isAcceptedResult(result) {
  return result === RESULTS.exact || result === RESULTS.caseFold || result === RESULTS.umlautFold;
}

/**
 * @param {string} input typed answer
 * @param {string[]} accepted accepted spellings
 * @param {{noun?: boolean}} options noun = capitalisation is graded
 * @returns {{result: string, correct: boolean, note: string|null, answer: string|null}}
 */
export function matchAnswer(input, accepted, { noun = false } = {}) {
  const user = normalize(input);
  if (!user) return { result: RESULTS.noMatch, correct: false, note: null, answer: accepted?.[0] ?? null };
  const answers = (accepted || []).map(normalize).filter(Boolean);
  for (const answer of answers) {
    if (user === answer) return { result: RESULTS.exact, correct: true, note: null, answer };
  }
  for (const answer of answers) {
    if (user.localeCompare(answer, "de", { sensitivity: "accent" }) === 0) {
      // Same letters, different case (dots/ß are still significant here).
      if (noun && /^[a-zäöüß]/.test(user)) {
        return {
          result: RESULTS.nounCaseError,
          correct: false,
          note: "German nouns start with a capital letter.",
          answer,
        };
      }
      if (!noun) return { result: RESULTS.caseFold, correct: true, note: null, answer };
    }
  }
  for (const answer of answers) {
    if (fold(user).toLocaleLowerCase("de") === fold(answer).toLocaleLowerCase("de")) {
      return {
        result: RESULTS.umlautFold,
        correct: true,
        note: "Accepted, but write the umlaut/ß: " + answer,
        answer,
      };
    }
  }
  return { result: RESULTS.noMatch, correct: false, note: null, answer: answers[0] ?? null };
}

/** Split a book gloss into accepted alternatives, e.g. "to go, to walk". */
export function glossAlternatives(gloss) {
  if (!gloss) return [];
  const base = gloss.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const parts = base.split(/\s*[,;/]\s*/).filter(Boolean);
  return [...new Set([base, ...parts].filter(Boolean))];
}
