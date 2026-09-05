/**
 * The settlement gate: unanimous or nothing.
 *
 * N resolvers execute the same spec independently -- different models,
 * independent fetches, separately recorded bytes. If every resolver that
 * returned a verdict returned the same one, the market settles and a receipt
 * is published. Anything else abstains.
 *
 * The asymmetry is deliberate. A wrong settlement is unrecoverable and pays
 * the wrong party; a slow settlement costs a delay. So disagreement is never
 * broken by majority, and a resolver that failed to fetch is not counted as a
 * vote -- it is counted as a reason to hold.
 */

import { createHash } from "node:crypto";
import { specHash } from "./spec.mjs";

export const SETTLED = "SETTLED";
export const ABSTAINED = "ABSTAINED";
export const VOID = "VOID";

/**
 * @typedef {object} Verdict
 * @property {string} resolver   identifier, e.g. "RSV-A"
 * @property {string|null} outcome  the option chosen, or null if it could not read
 * @property {string} [raw]      the bytes fetched from the source
 * @property {string} [fetchedAt] ISO instant of the fetch
 * @property {string} [error]    why it could not read
 */

/**
 * @param {object} spec
 * @param {ReadonlyArray<Verdict>} verdicts
 * @returns {object} the receipt -- the whole audit trail, publishable as-is
 */
export function settle(spec, verdicts) {
  const list = Array.isArray(verdicts) ? verdicts : [];
  const answered = list.filter((v) => v.outcome !== null && v.outcome !== undefined);
  const silent = list.filter((v) => v.outcome === null || v.outcome === undefined);
  const distinct = [...new Set(answered.map((v) => v.outcome))];

  const state = decide(list, answered, silent, distinct);

  return Object.freeze({
    state,
    outcome: state === SETTLED ? distinct[0] : null,
    spec_sha256: specHash(spec),
    resolvers: list.length,
    answered: answered.length,
    silent: silent.length,
    distinct_outcomes: distinct,
    reason: reasonFor(state, distinct, silent),
    evidence: Object.freeze(list.map(toEvidence)),
  });
}

function decide(list, answered, silent, distinct) {
  if (list.length === 0) return ABSTAINED;
  // A resolver that could not read the source is a hold, never a vote.
  if (silent.length > 0) return silent.length === list.length ? VOID : ABSTAINED;
  return distinct.length === 1 ? SETTLED : ABSTAINED;
}

function reasonFor(state, distinct, silent) {
  if (state === SETTLED) return `all resolvers read the same value: ${distinct[0]}`;
  if (state === VOID) return "no resolver could read the source; the void_if branch applies";
  if (silent.length > 0) return `${silent.length} resolver(s) could not read the source`;
  return `resolvers disagree: ${distinct.join(" vs ")}`;
}

function toEvidence(verdict) {
  return Object.freeze({
    resolver: verdict.resolver,
    outcome: verdict.outcome ?? null,
    fetched_at: verdict.fetchedAt ?? null,
    bytes_sha256: verdict.raw === undefined ? null : sha256(verdict.raw),
    error: verdict.error ?? null,
  });
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

/**
 * Should this receipt trigger a Rain settlement transaction?
 * Only SETTLED does. ABSTAINED and VOID escalate instead.
 * @param {object} receipt
 * @returns {boolean}
 */
export function shouldResolveOnChain(receipt) {
  return receipt.state === SETTLED;
}

/**
 * The packet handed to Rain's human oracle when Brier declines to settle.
 * The point is that a human receives assembled evidence, not a question.
 * @param {object} receipt
 * @param {string} marketId
 * @returns {object}
 */
export function escalation(receipt, marketId) {
  return Object.freeze({
    market: marketId,
    set_disputed: true,
    spec_sha256: receipt.spec_sha256,
    why: receipt.reason,
    conflicting_outcomes: receipt.distinct_outcomes,
    evidence: receipt.evidence,
  });
}
