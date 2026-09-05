import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalise, specHash, describeMarket, readSpecHash, isBoundTo, validateSpec,
} from "../src/spec.mjs";

const GOOD = Object.freeze({
  question: "BTC above 100000",
  source: "chainlink:arbitrum/BTC-USD",
  selector: "$.answer",
  observed_at: "2026-12-31T23:59:59Z",
  unit: "USD",
  comparator: "> 100000",
  void_if: ["feed stale"],
  fallback: "abstain",
});

test("canonical form is independent of key order", () => {
  const reordered = { fallback: "abstain", void_if: ["feed stale"], comparator: "> 100000",
    unit: "USD", observed_at: "2026-12-31T23:59:59Z", selector: "$.answer",
    source: "chainlink:arbitrum/BTC-USD", question: "BTC above 100000" };
  assert.equal(canonicalise(GOOD), canonicalise(reordered));
  assert.equal(specHash(GOOD), specHash(reordered));
});

test("canonical form ignores unknown fields and whitespace", () => {
  const noisy = { ...GOOD, question: "  BTC above 100000  ", sneaked: "ignore me" };
  assert.equal(specHash(GOOD), specHash(noisy));
});

test("changing any meaningful field changes the hash", () => {
  assert.notEqual(specHash(GOOD), specHash({ ...GOOD, comparator: "> 100001" }));
  assert.notEqual(specHash(GOOD), specHash({ ...GOOD, observed_at: "2027-01-01T00:00:00Z" }));
});

test("the hash round-trips through marketDescription", () => {
  const description = describeMarket(GOOD, "Prediction market for BTC price");
  assert.equal(readSpecHash(description), specHash(GOOD));
  assert.ok(isBoundTo(description, GOOD));
});

test("a market bound to one spec rejects a different spec", () => {
  const description = describeMarket(GOOD);
  assert.equal(isBoundTo(description, { ...GOOD, comparator: "> 1" }), false);
});

test("a description with no tag is bound to nothing", () => {
  assert.equal(readSpecHash("just some prose"), null);
  assert.equal(isBoundTo("just some prose", GOOD), false);
});

test("validateSpec accepts a complete spec", () => {
  assert.deepEqual(validateSpec(GOOD).problems, []);
  assert.ok(validateSpec(GOOD).ok);
});

test("validateSpec rejects a non-UTC instant", () => {
  const r = validateSpec({ ...GOOD, observed_at: "2026-12-31" });
  assert.ok(r.problems.some((p) => p.startsWith("observed_at:")));
});

test("validateSpec rejects http and unknown schemes", () => {
  assert.ok(validateSpec({ ...GOOD, source: "http://x.com" }).problems.some((p) => p.startsWith("source:")));
  assert.ok(validateSpec({ ...GOOD, source: "ftp://x" }).problems.some((p) => p.startsWith("source:")));
});

test("validateSpec requires a unit whenever a comparator is present", () => {
  const { unit, ...noUnit } = GOOD;
  assert.ok(validateSpec(noUnit).problems.some((p) => p.startsWith("unit:")));
});

test("validateSpec requires a void branch", () => {
  assert.ok(validateSpec({ ...GOOD, void_if: [] }).problems.some((p) => p.startsWith("void_if:")));
});

test("validateSpec forbids any fallback except abstain", () => {
  for (const bad of ["majority", "5050", "creator", undefined]) {
    assert.ok(validateSpec({ ...GOOD, fallback: bad }).problems.some((p) => p.startsWith("fallback:")),
      `fallback ${bad} should be rejected`);
  }
});

test("validateSpec survives junk input", () => {
  assert.equal(validateSpec(null).ok, false);
  assert.equal(validateSpec("nope").ok, false);
});
