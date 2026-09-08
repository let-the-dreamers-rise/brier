/**
 * The labelling protocol: what outside labellers are asked, and what the
 * grader is held to.
 *
 * WHY THIS FILE IS SEPARATE FROM THE GRADER. The corpus in corpus/questions.json
 * scores 20/20 and proves nothing, because the same author wrote the questions
 * and the probes. The only way a label set becomes evidence is if the person
 * producing it cannot see what the grader said, and the author cannot change
 * the grader after seeing the labels. This module defines both halves of that
 * barrier: the question put to the labeller (which never uses the grader's
 * vocabulary), and the canonical hash that pins the grader's predictions
 * before any label exists.
 *
 * THE LABEL IS NOT "IS THIS AMBIGUOUS". Asking that invites the labeller to
 * reconstruct the probe list. The question asked instead is behavioural, and
 * it is the thing that actually costs money when it goes wrong: would two
 * independent settlers return the same answer? That maps onto realised
 * disputes, and a labeller can answer it without knowing this project exists.
 */

import { createHash } from "node:crypto";
import { grade } from "../src/grader.mjs";

/** The label vocabulary. Deliberately three-valued: forcing a binary call
 *  manufactures agreement out of labeller fatigue. */
export const SAME = "SAME";
export const DIFFER = "DIFFER";
export const CANT_TELL = "CANT_TELL";
export const LABELS = Object.freeze([SAME, DIFFER, CANT_TELL]);

/** The exact wording shown to labellers. Changing it invalidates comparability
 *  with any labels already collected, so it is versioned. */
export const PROTOCOL_VERSION = "1.0.0";

export const PROMPT = Object.freeze({
  task:
    "This market has closed. Two careful, independent people are each paid to " +
    "settle it using only public information. Do they return the same answer?",
  options: Object.freeze({
    [SAME]:
      "Same answer. The question determines its own outcome; a competent " +
      "settler has nothing left to choose.",
    [DIFFER]:
      "Could differ. Two reasonable settlers could return different answers " +
      "without either being careless.",
    [CANT_TELL]: "Cannot tell from what is shown.",
  }),
  followUp:
    "If they could differ, what is the one thing they would disagree about? " +
    "(One line. Optional, but it is the most useful field here.)",
});

/**
 * The grader's prediction for one market, restricted to the semantic probes.
 *
 * The structural half of the grader (SPEC_INVALID: no source, no void_if)
 * refuses all 1192 surveyed markets, because Polymarket has no such fields.
 * That is an artifact of their schema, not a finding about their questions,
 * and no human can label it. Only the probes that read the question text are
 * put up for test here.
 *
 * @param {{id: string, question: string}} market
 * @returns {{id: string, predicts: string, fired: string[]}}
 */
export function predictionFor(market) {
  const { fired } = grade(market.question, {});
  return {
    id: String(market.id),
    predicts: fired.length === 0 ? SAME : DIFFER,
    fired: [...fired].sort(),
  };
}

/** Deterministic JSON: sorted keys at every depth, no incidental whitespace. */
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value && typeof value === "object") {
    const body = Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function digest(value) {
  return createHash("sha256").update(canonicalJSON(value), "utf8").digest("hex");
}

/**
 * Freeze the grader's predictions over a drawn sample.
 *
 * The returned `hash` is the commitment. score.mjs recomputes predictions from
 * the grader as it stands at scoring time and refuses to report anything if the
 * hash moved. Editing a probe after seeing labels therefore cannot produce a
 * score -- it produces a hard failure naming the markets whose verdict changed.
 *
 * @param {Array<object>} markets the drawn sample, in draw order
 * @param {object} provenance seed and stratum sizes from the draw
 */
export function preregister(markets, provenance) {
  const predictions = markets.map(predictionFor);
  const body = {
    protocol_version: PROTOCOL_VERSION,
    provenance,
    predictions,
  };
  return Object.freeze({ ...body, hash: digest(body) });
}

/**
 * Re-derive predictions and compare against the commitment.
 * @returns {{ok: boolean, hash: string, changed: Array<object>}}
 */
export function verifyPrereg(prereg, marketsById) {
  const changed = [];
  for (const pinned of prereg.predictions) {
    const market = marketsById.get(pinned.id);
    if (!market) {
      changed.push({ id: pinned.id, reason: "market missing from corpus" });
      continue;
    }
    const now = predictionFor(market);
    if (now.predicts !== pinned.predicts || now.fired.join(",") !== pinned.fired.join(",")) {
      changed.push({
        id: pinned.id,
        reason:
          `was ${pinned.predicts} [${pinned.fired.join(",") || "-"}], ` +
          `now ${now.predicts} [${now.fired.join(",") || "-"}]`,
      });
    }
  }
  // Two independent guards, and a caller must be told which one tripped:
  //   file_intact  -- the prereg document is the one that was committed
  //   grader_stable -- the grader still says what the document pinned
  // A hash match with a non-empty `changed` list is the interesting case: the
  // commitment was not forged, the grader was edited underneath it.
  const rebuilt = digest({
    protocol_version: prereg.protocol_version,
    provenance: prereg.provenance,
    predictions: prereg.predictions,
  });
  const fileIntact = rebuilt === prereg.hash;
  return {
    ok: changed.length === 0 && fileIntact,
    file_intact: fileIntact,
    grader_stable: changed.length === 0,
    hash: rebuilt,
    changed,
  };
}
