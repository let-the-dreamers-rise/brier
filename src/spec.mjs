/**
 * ResolutionSpec: the machine-checkable settlement contract carried by a market.
 *
 * A market question is prose. A spec is the observation that settles it: which
 * instrument to read, which field, at which instant, against which threshold,
 * and the conditions under which the question is declared void instead of
 * guessed at.
 *
 * The spec is canonicalised and hashed at market creation. The hash is written
 * into Rain's existing `marketDescription` field, so the settlement rule is
 * fixed and public before anyone takes a position, with no protocol change.
 */

import { createHash } from "node:crypto";

/** Every field a spec may carry. Order is fixed for canonicalisation. */
export const SPEC_FIELDS = Object.freeze([
  "question",
  "source",
  "selector",
  "observed_at",
  "unit",
  "comparator",
  "entities",
  "tiebreak",
  "combine",
  "void_if",
  "fallback",
]);

/** The only settlement behaviour we accept when resolvers disagree. */
export const FALLBACK_ABSTAIN = "abstain";

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const COMPARATOR = /^(==|!=|>=|<=|>|<)\s*-?\d+(\.\d+)?$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/;
const ONCHAIN_FEED = /^(eip155|arbitrum|chainlink):[^\s]+$/;

/**
 * Canonical JSON: known fields in fixed order, unknown fields dropped,
 * arrays preserved, no insignificant whitespace. Two specs that mean the same
 * thing serialise identically, so their hashes match.
 * @param {object} spec
 * @returns {string}
 */
export function canonicalise(spec) {
  const ordered = SPEC_FIELDS.reduce((acc, key) => {
    const value = spec?.[key];
    if (value === undefined || value === null) return acc;
    return { ...acc, [key]: normaliseValue(value) };
  }, {});
  return JSON.stringify(ordered);
}

function normaliseValue(value) {
  if (Array.isArray(value)) return value.map(normaliseValue);
  if (typeof value === "string") return value.trim();
  return value;
}

/**
 * sha256 of the canonical form. This is what goes on-chain.
 * @param {object} spec
 * @returns {string} 64 hex characters
 */
export function specHash(spec) {
  return createHash("sha256").update(canonicalise(spec), "utf8").digest("hex");
}

/**
 * The string Brier writes into Rain's `marketDescription`, binding the
 * settlement rule to the market without needing a new protocol field.
 * @param {object} spec
 * @param {string} [note] optional human-readable description
 * @returns {string}
 */
export function describeMarket(spec, note = "") {
  const tag = `brier:spec:sha256:${specHash(spec)}`;
  return note ? `${note}\n\n${tag}` : tag;
}

/**
 * Recover the spec hash a market claims to be bound to.
 * @param {string} description
 * @returns {string|null}
 */
export function readSpecHash(description) {
  const found = /brier:spec:sha256:([0-9a-f]{64})/.exec(description ?? "");
  return found ? found[1] : null;
}

/**
 * Does this market's on-chain description match the spec we hold?
 * @param {string} description
 * @param {object} spec
 * @returns {boolean}
 */
export function isBoundTo(description, spec) {
  const claimed = readSpecHash(description);
  return claimed !== null && claimed === specHash(spec);
}

/**
 * Structural validation. This checks the spec is well-formed; it says nothing
 * about whether the spec actually settles the question -- that is the grader.
 * @param {object} spec
 * @returns {{ok: boolean, problems: string[]}}
 */
export function validateSpec(spec) {
  const problems = [];
  const push = (m) => problems.push(m);

  if (!spec || typeof spec !== "object") {
    return { ok: false, problems: ["spec is not an object"] };
  }
  if (!isNonEmptyString(spec.question)) push("question: missing");

  if (!isNonEmptyString(spec.source)) {
    push("source: missing -- no instrument named");
  } else if (!HTTPS_URL.test(spec.source) && !ONCHAIN_FEED.test(spec.source)) {
    push("source: must be an https URL or an on-chain feed (eip155:/arbitrum:/chainlink:)");
  }

  if (!isNonEmptyString(spec.selector)) push("selector: missing -- no field named within the source");

  if (!isNonEmptyString(spec.observed_at)) {
    push("observed_at: missing -- no instant of observation");
  } else if (!ISO_INSTANT.test(spec.observed_at)) {
    push("observed_at: must be an ISO-8601 UTC instant ending in Z");
  }

  if (spec.comparator !== undefined && !COMPARATOR.test(String(spec.comparator).trim())) {
    push("comparator: must be an operator and a number, e.g. '> 15.0'");
  }
  if (spec.comparator !== undefined && !isNonEmptyString(spec.unit)) {
    push("unit: required whenever a comparator is present");
  }

  if (!Array.isArray(spec.void_if) || spec.void_if.length === 0) {
    push("void_if: missing -- the question has no declared failure branch");
  }
  if (spec.fallback !== FALLBACK_ABSTAIN) {
    push(`fallback: must be '${FALLBACK_ABSTAIN}' -- a spec may never be told to guess`);
  }
  if (spec.entities !== undefined && !Array.isArray(spec.entities)) {
    push("entities: must be an array when present");
  }

  return { ok: problems.length === 0, problems: Object.freeze(problems) };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
