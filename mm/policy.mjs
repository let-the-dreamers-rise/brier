/**
 * The quoting risk policy, derived from measurement rather than intuition.
 *
 * Each rule below cites the lift it was set from. The source is
 * edge/disputes.mjs run over 3,464 settled Polymarket markets against their
 * realised UMA dispute record (base dispute rate 4.3% when no check fires).
 * A market maker loses money when a market settles in a way the question did
 * not pin down, so a check that predicted disputes is a reason not to quote,
 * and a check that predicted nothing is not a reason to do anything.
 *
 *   VAGUE_PREDICATE     2.92x   do not quote -- the predicate is a judgement
 *   TEMPORAL_VAGUE      1.55x   quote, but wider
 *   SUPERLATIVE_UNTIED  1.10x   measured noise, no adjustment
 *   MISSING_UNIT        0.00x   fired 155 times with zero disputes, no adjustment
 *   COMPOUND_CONDITION  n=3     too few observations to set; treated as widen
 *   UNBOUND_ENTITY      n=1     too few observations to set; treated as widen
 *
 * The two unmeasured checks are widened rather than ignored: absence of
 * evidence is not evidence of safety, and widening is the cheap mistake.
 */

export const REFUSE = "refuse";
export const WIDEN = "widen";
export const IGNORE = "ignore";

export const POLICY = Object.freeze({
  VAGUE_PREDICATE: Object.freeze({ action: REFUSE, lift: 2.92, basis: "measured" }),
  TEMPORAL_VAGUE: Object.freeze({ action: WIDEN, lift: 1.55, basis: "measured" }),
  SUPERLATIVE_UNTIED: Object.freeze({ action: IGNORE, lift: 1.1, basis: "measured" }),
  MISSING_UNIT: Object.freeze({ action: IGNORE, lift: 0.0, basis: "measured" }),
  COMPOUND_CONDITION: Object.freeze({ action: WIDEN, lift: null, basis: "unmeasured" }),
  UNBOUND_ENTITY: Object.freeze({ action: WIDEN, lift: null, basis: "unmeasured" }),
});

/** Base half-spread around mid, as a probability. 0.03 = quote 3 points either side. */
export const BASE_HALF_SPREAD = 0.03;

/** Added per widening check that fires. */
export const WIDEN_STEP = 0.02;

/**
 * Prices this close to 0 or 1 are not worth quoting: the edge is inside the
 * tick and the downside is the whole position.
 */
export const MIN_MID = 0.04;
export const MAX_MID = 0.96;

/**
 * Decide what to do about a market from the checks that fired on it.
 * @param {string[]} fired check codes from the grader
 * @returns {{action: string, halfSpread: number, reasons: string[]}}
 */
export function assess(fired) {
  const reasons = [];
  let widenings = 0;
  for (const code of fired) {
    const rule = POLICY[code];
    if (!rule) {
      // A check this policy has never seen: do not guess in its favour.
      widenings += 1;
      reasons.push(`${code}: no rule, widened`);
      continue;
    }
    if (rule.action === REFUSE) {
      return {
        action: REFUSE,
        halfSpread: null,
        reasons: [`${code}: ${rule.lift}x dispute lift, not quoted`],
      };
    }
    if (rule.action === WIDEN) {
      widenings += 1;
      reasons.push(
        rule.basis === "measured"
          ? `${code}: ${rule.lift}x dispute lift, widened`
          : `${code}: unmeasured, widened`,
      );
    }
  }
  return {
    action: widenings > 0 ? WIDEN : "quote",
    halfSpread: BASE_HALF_SPREAD + WIDEN_STEP * widenings,
    reasons,
  };
}
