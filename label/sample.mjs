/**
 * Draw the sample that outside labellers see.
 *
 * Two properties matter and both are mechanical:
 *
 * SEEDED. The draw is a pure function of (corpus, seed). The seed is recorded
 * in the prereg and printed on the form. Re-rolling until the sample looks
 * friendly would change the seed, and the seed is published, so it cannot be
 * done quietly.
 *
 * STRATIFIED, AND SAID SO. The grader's semantic probes fire on 198 of 1192
 * surveyed markets. An unstratified draw of 60 would contain ~10 of them and
 * the disagreement cells would be too thin to read. So the draw is balanced
 * across the two strata by design, which means the sample prevalence is NOT
 * the population prevalence -- agreement statistics are valid, raw accuracy
 * is not, and score.mjs refuses to print accuracy for that reason.
 */

import { predictionFor, SAME } from "./protocol.mjs";

/** FNV-1a over the seed string, so any human-readable seed works. */
export function seedToInt(seed) {
  let hash = 0x811c9dc5;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, and identical across Node versions. */
export function rngFrom(seed) {
  let state = seedToInt(seed);
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates against a supplied rng. Returns a new array. */
export function shuffled(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Markets worth putting in front of a person: a real question, and enough
 * money on them that a dispute would matter. Applied before stratifying so
 * the filter cannot be tuned per stratum.
 */
export function eligible(markets, minLiquidity) {
  return markets.filter(
    (m) =>
      typeof m.question === "string" &&
      m.question.trim().length >= 20 &&
      Number(m.liquidity ?? 0) >= minLiquidity,
  );
}

/**
 * @param {object} options
 * @param {Array<object>} options.markets full corpus
 * @param {string} options.seed published draw seed
 * @param {number} options.perStratum items drawn from each stratum
 * @param {number} options.minLiquidity floor in USD
 * @returns {{items: Array<object>, provenance: object}}
 */
export function drawSample({ markets, seed, perStratum = 30, minLiquidity = 1000 }) {
  const pool = eligible(markets, minLiquidity);
  const clean = pool.filter((m) => predictionFor(m).predicts === SAME);
  const dirty = pool.filter((m) => predictionFor(m).predicts !== SAME);

  const rng = rngFrom(seed);
  const takeClean = shuffled(clean, rng).slice(0, perStratum);
  const takeDirty = shuffled(dirty, rng).slice(0, perStratum);

  // Interleave by shuffling the union, so the form never presents a run of
  // one stratum -- a labeller who notices a run starts labelling the pattern.
  const items = shuffled([...takeClean, ...takeDirty], rng);

  return {
    items,
    provenance: {
      seed: String(seed),
      design: "balanced-on-semantic-probe",
      min_liquidity: minLiquidity,
      per_stratum: perStratum,
      pool_size: pool.length,
      stratum_sizes: { no_probe: clean.length, probe_fires: dirty.length },
      drawn: { no_probe: takeClean.length, probe_fires: takeDirty.length },
    },
  };
}
