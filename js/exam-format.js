// Exam facts used by the trainers. Every value cites docs/GOETHE_A1_FORMAT.md,
// which is itself cited to the official PDFs (PZ = Prüfungsziele, MS = Modellsatz).
// Do not add a rule here without a citation.

export const MODULES = ["hoeren", "lesen", "schreiben", "sprechen"];

export const MODULE_INFO = {
  hoeren: {
    title: "Hören",
    english: "Listening",
    minutes: 20,
    parts: 3,
    items: 15,
    cite: "GOETHE_A1_FORMAT §4 (PZ Seite 28); overview §2 (PZ Seite 6)",
  },
  lesen: {
    title: "Lesen",
    english: "Reading",
    minutes: 25,
    parts: 3,
    items: 15,
    cite: "GOETHE_A1_FORMAT §5 (PZ Seite 33); overview §2 (PZ Seite 6)",
  },
  schreiben: {
    title: "Schreiben",
    english: "Writing",
    minutes: 20,
    parts: 2,
    items: 15,
    cite: "GOETHE_A1_FORMAT §6 (PZ Seite 38); overview §2 (PZ Seite 6)",
  },
  sprechen: {
    title: "Sprechen",
    english: "Speaking",
    minutes: 15,
    parts: 3,
    items: 15,
    cite: "GOETHE_A1_FORMAT §7 (PZ Seite 45); overview §2 (PZ Seite 6)",
  },
};

export const RAW_PER_MODULE = 15; // PZ Seiten 28, 33, 38, 45
export const WEIGHTED_PER_MODULE = 25; // PZ Seite 6 (25 % per module)
// Derived arithmetic: 15 raw -> 25 weighted. The official total computation is
// in the Durchführungsbestimmungen (not in this repo) — see §8 and D027.
export const WEIGHT_FACTOR = WEIGHTED_PER_MODULE / RAW_PER_MODULE;
export const PASS_TOTAL = 60; // PZ Seite 6: at least 60 points and every part attempted
export const WRITTEN_MODULES = ["hoeren", "lesen", "schreiben"];
export const WRITTEN_MIN = 35; // PZ Seite 6: below 35 written points the oral part is pointless
export const WRITTEN_MAX = 75; // PZ Seite 6: 75 written + 25 oral

// PZ Seite 7 result bands.
export const BANDS = [
  { min: 90, label: "sehr gut" },
  { min: 80, label: "gut" },
  { min: 70, label: "befriedigend" },
  { min: 60, label: "ausreichend" },
  { min: 0, label: "nicht bestanden" },
];

export function bandFor(total) {
  if (!Number.isFinite(total)) return null;
  return BANDS.find((band) => total >= band.min) || BANDS[BANDS.length - 1];
}

// Schreiben: Teil 1 = 5 form fields (1 point each); Teil 2 rubric = 3 content
// points × 3 + communicative design 1 = 10. PZ Seiten 38–39.
export const WRITING = {
  part1Max: 5,
  part2Max: 10,
  contentPoints: 3,
  perContentPoint: 3,
  communicativeMax: 1,
  targetWords: 30,
};

// Sprechen: 3 + 6 + 6 = 15; 80 s / 60 s / 60 s per candidate.
// PZ Seiten 45, 49, 51, 53.
export const SPEAKING = {
  part1Max: 3,
  part2Max: 6,
  part3Max: 6,
  part1Seconds: 80,
  part2Seconds: 60,
  part3Seconds: 60,
  part2Questions: 2,
  part2Answers: 2,
  part3Requests: 2,
  part3Reactions: 2,
};

// Official rubric granularity for open tasks: full / half / zero.
export const RUBRIC_SCALE = [1, 0.5, 0];

export const DERIVED_NOTE = "15 to 25 factor is derived (D027); confirm the Durchführungsbestimmungen";
