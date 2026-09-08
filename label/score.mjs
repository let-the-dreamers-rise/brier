/**
 * Score outside labels against the pre-registered grader predictions.
 *
 * The order of operations is the whole point:
 *
 *   1. Verify the commitment. If any probe changed since the prereg was
 *      written, this refuses to report anything at all. A number produced
 *      after tuning the grader on the labels is worthless, so it is not
 *      produced.
 *   2. Report human-human agreement FIRST. It is the ceiling. If two people
 *      only agree with each other at kappa 0.4, then the grader agreeing with
 *      them at 0.4 is not a weak result -- it is the task's noise floor, and a
 *      grader-human number quoted without it is meaningless.
 *   3. Refuse to print accuracy. The draw is balanced on the grader's own
 *      verdict, so sample prevalence is a design choice; accuracy would be a
 *      number about the draw, not about the grader.
 */

import { SAME, DIFFER, CANT_TELL, verifyPrereg } from "./protocol.mjs";

const BINARY = Object.freeze([SAME, DIFFER]);

/**
 * Cohen's kappa over paired categorical judgements.
 * @param {Array<[string, string]>} pairs
 * @param {ReadonlyArray<string>} categories
 */
export function cohenKappa(pairs, categories = BINARY) {
  const n = pairs.length;
  if (n === 0) return { kappa: null, observed: null, expected: null, n: 0 };

  const agree = pairs.filter(([a, b]) => a === b).length;
  const observed = agree / n;

  const marginal = (index, category) =>
    pairs.filter((pair) => pair[index] === category).length / n;
  const expected = categories.reduce(
    (sum, category) => sum + marginal(0, category) * marginal(1, category),
    0,
  );

  const kappa = expected === 1 ? null : (observed - expected) / (1 - expected);
  return { kappa, observed, expected, n };
}

/** Counts keyed `rowCategory|colCategory`. */
export function confusion(pairs) {
  const table = {};
  for (const [row, col] of pairs) {
    const key = `${row}|${col}`;
    table[key] = (table[key] ?? 0) + 1;
  }
  return table;
}

/** Drop pairs where either side abstained; those are reported separately. */
function decided(pairs) {
  return pairs.filter(([a, b]) => a !== CANT_TELL && b !== CANT_TELL);
}

/**
 * One labeller's submission, normalised to a Map of id -> entry.
 * @param {{labeller: string, protocol_version: string, labels: Array<object>}} sheet
 */
export function indexSheet(sheet) {
  const byId = new Map();
  for (const entry of sheet.labels ?? []) {
    if (!entry || typeof entry.id !== "string") continue;
    if (!entry.label) continue;
    byId.set(entry.id, entry);
  }
  return byId;
}

/** Majority label per id; ties and all-abstain resolve to CANT_TELL. */
export function majority(sheets) {
  const votes = new Map();
  for (const sheet of sheets) {
    for (const [id, entry] of indexSheet(sheet)) {
      const tally = votes.get(id) ?? {};
      tally[entry.label] = (tally[entry.label] ?? 0) + 1;
      votes.set(id, tally);
    }
  }
  const out = new Map();
  for (const [id, tally] of votes) {
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const tied = ranked.length > 1 && ranked[1][1] === top[1];
    out.set(id, tied ? CANT_TELL : top[0]);
  }
  return out;
}

/**
 * @param {object} input
 * @param {object} input.prereg the frozen commitment
 * @param {Map<string, object>} input.marketsById corpus, for re-derivation
 * @param {Array<object>} input.sheets one submission per labeller
 */
export function score({ prereg, marketsById, sheets }) {
  const check = verifyPrereg(prereg, marketsById);
  if (!check.ok) {
    const reason = !check.file_intact
      ? "the pre-registration document does not hash to its own commitment: it " +
        "has been edited since it was written. Nothing here can be trusted."
      : "the grader moved since pre-registration -- the commitment is intact, " +
        "but the probes no longer say what it pinned. This sample can no longer " +
        "test them. Draw a fresh sample and re-register.";
    return {
      ok: false,
      reason,
      file_intact: check.file_intact,
      grader_stable: check.grader_stable,
      changed: check.changed,
      committed_hash: prereg.hash,
      rebuilt_hash: check.hash,
    };
  }

  const predicted = new Map(prereg.predictions.map((p) => [p.id, p]));
  const firedBy = new Map(prereg.predictions.map((p) => [p.id, p.fired]));

  // --- human vs human: the ceiling -------------------------------------
  const pairwise = [];
  for (let i = 0; i < sheets.length; i += 1) {
    for (let j = i + 1; j < sheets.length; j += 1) {
      const a = indexSheet(sheets[i]);
      const b = indexSheet(sheets[j]);
      const shared = [...a.keys()].filter((id) => b.has(id));
      const pairs = shared.map((id) => [a.get(id).label, b.get(id).label]);
      pairwise.push({
        between: [sheets[i].labeller, sheets[j].labeller],
        overlap: shared.length,
        ...cohenKappa(decided(pairs)),
        abstain_either: pairs.length - decided(pairs).length,
      });
    }
  }

  // --- grader vs each labeller, and vs the majority ---------------------
  const versus = sheets.map((sheet) => {
    const mine = indexSheet(sheet);
    const pairs = [];
    for (const [id, entry] of mine) {
      const pinned = predicted.get(id);
      if (pinned) pairs.push([pinned.predicts, entry.label]);
    }
    const usable = decided(pairs);
    return {
      labeller: sheet.labeller,
      labelled: mine.size,
      abstained: pairs.length - usable.length,
      ...cohenKappa(usable),
      confusion: confusion(usable),
    };
  });

  const consensus = majority(sheets);
  const consensusPairs = [];
  for (const [id, label] of consensus) {
    const pinned = predicted.get(id);
    if (pinned) consensusPairs.push([pinned.predicts, label]);
  }
  const vsMajority = {
    ...cohenKappa(decided(consensusPairs)),
    confusion: confusion(decided(consensusPairs)),
    abstained: consensusPairs.length - decided(consensusPairs).length,
  };

  // --- per-probe: which probes outside labellers actually back ----------
  const perProbe = {};
  for (const [id, label] of consensus) {
    for (const code of firedBy.get(id) ?? []) {
      const cell = perProbe[code] ?? { fired: 0, backed: 0, contradicted: 0, abstained: 0 };
      cell.fired += 1;
      if (label === DIFFER) cell.backed += 1;
      else if (label === SAME) cell.contradicted += 1;
      else cell.abstained += 1;
      perProbe[code] = cell;
    }
  }

  // --- did seeing the resolution text change the call? ------------------
  const byExposure = { saw_description: [], question_only: [] };
  for (const sheet of sheets) {
    for (const [id, entry] of indexSheet(sheet)) {
      const pinned = predicted.get(id);
      if (!pinned) continue;
      const bucket = entry.saw_description ? "saw_description" : "question_only";
      byExposure[bucket].push([pinned.predicts, entry.label]);
    }
  }

  return {
    ok: true,
    committed_hash: prereg.hash,
    labellers: sheets.map((s) => s.labeller),
    human_vs_human: pairwise,
    grader_vs_labeller: versus,
    grader_vs_majority: vsMajority,
    per_probe: perProbe,
    by_exposure: {
      saw_description: cohenKappa(decided(byExposure.saw_description)),
      question_only: cohenKappa(decided(byExposure.question_only)),
    },
    accuracy: null, // withheld on purpose: the draw is balanced by design
  };
}
