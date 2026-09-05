import test from "node:test";
import assert from "node:assert/strict";
import { settle, shouldResolveOnChain, escalation, SETTLED, ABSTAINED, VOID } from "../src/settle.mjs";

const SPEC = Object.freeze({
  question: "q", source: "https://example.org", selector: "$.v",
  observed_at: "2026-12-31T23:59:59Z", void_if: ["unreachable"], fallback: "abstain",
});

const v = (resolver, outcome, raw) => ({ resolver, outcome, raw, fetchedAt: "2026-12-31T23:59:59Z" });

test("unanimous resolvers settle", () => {
  const r = settle(SPEC, [v("A", "Yes", "15.7"), v("B", "Yes", "15.7"), v("C", "Yes", "15.7")]);
  assert.equal(r.state, SETTLED);
  assert.equal(r.outcome, "Yes");
  assert.ok(shouldResolveOnChain(r));
});

test("one dissenter blocks settlement -- majority never wins", () => {
  const r = settle(SPEC, [v("A", "Yes", "15.7"), v("B", "Yes", "15.7"), v("C", "No", "14.9")]);
  assert.equal(r.state, ABSTAINED);
  assert.equal(r.outcome, null);
  assert.equal(shouldResolveOnChain(r), false);
  assert.deepEqual([...r.distinct_outcomes].sort(), ["No", "Yes"]);
});

test("a resolver that could not read is a hold, not a vote", () => {
  const silent = { resolver: "C", outcome: null, error: "404" };
  const r = settle(SPEC, [v("A", "Yes", "15.7"), v("B", "Yes", "15.7"), silent]);
  assert.equal(r.state, ABSTAINED, "two agreeing resolvers must not outvote a failed fetch");
  assert.equal(r.silent, 1);
});

test("no resolver could read -> void", () => {
  const r = settle(SPEC, [
    { resolver: "A", outcome: null, error: "timeout" },
    { resolver: "B", outcome: null, error: "404" },
  ]);
  assert.equal(r.state, VOID);
  assert.match(r.reason, /void_if/);
});

test("an empty panel abstains rather than settling", () => {
  assert.equal(settle(SPEC, []).state, ABSTAINED);
  assert.equal(settle(SPEC, undefined).state, ABSTAINED);
});

test("the receipt hashes the fetched bytes, not the verdict", () => {
  const r = settle(SPEC, [v("A", "Yes", "15.7"), v("B", "Yes", "15.7")]);
  const [a, b] = r.evidence;
  assert.match(a.bytes_sha256, /^[0-9a-f]{64}$/);
  assert.equal(a.bytes_sha256, b.bytes_sha256, "same bytes must hash the same");
});

test("differing bytes produce differing hashes even on the same verdict", () => {
  const r = settle(SPEC, [v("A", "Yes", "15.7"), v("B", "Yes", "15.8")]);
  const [a, b] = r.evidence;
  assert.notEqual(a.bytes_sha256, b.bytes_sha256);
  assert.equal(r.state, SETTLED, "same outcome from different readings still settles");
});

test("the receipt names the spec it settled under", () => {
  const r = settle(SPEC, [v("A", "Yes", "1")]);
  assert.match(r.spec_sha256, /^[0-9a-f]{64}$/);
});

test("escalation carries assembled evidence, not a question", () => {
  const r = settle(SPEC, [v("A", "Yes", "15.7"), v("B", "No", "14.9")]);
  const packet = escalation(r, "0xd262");
  assert.equal(packet.market, "0xd262");
  assert.equal(packet.set_disputed, true);
  assert.equal(packet.evidence.length, 2);
  assert.equal(packet.spec_sha256, r.spec_sha256);
});

test("the receipt is frozen -- it cannot be edited after the fact", () => {
  const r = settle(SPEC, [v("A", "Yes", "1")]);
  assert.throws(() => { "use strict"; r.outcome = "No"; }, TypeError);
});
