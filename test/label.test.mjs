/**
 * Tests for the outside-labelling instrument (label/).
 *
 * The instrument exists to turn "I think my grader is good" into a number
 * somebody else produced. That only holds if two things are mechanically
 * true, and both are pinned here: the labeller cannot see the verdict, and
 * the author cannot move the grader after the labels arrive.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SAME, DIFFER, CANT_TELL, PROTOCOL_VERSION,
  predictionFor, canonicalJSON, digest, preregister, verifyPrereg,
} from "../label/protocol.mjs";
import { rngFrom, shuffled, eligible, drawSample } from "../label/sample.mjs";
import { formItems, renderForm } from "../label/form.mjs";
import { cohenKappa, majority, indexSheet, score } from "../label/score.mjs";

/** A question with no probe word in it, and one stuffed with them. */
const CLEAN = "Will the Fed decrease interest rates by 25 bps after the September 2026 meeting?";
const DIRTY = "Will a major exchange significantly expand support for staking by end of year?";

function market(id, question, extra = {}) {
  return {
    id,
    question,
    description: "Resolution text for " + id,
    liquidity: 5000,
    endDate: "2026-12-31T00:00:00Z",
    ...extra,
  };
}

function corpus(n = 200) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    // Two thirds clean, one third dirty, so both strata are populated.
    const question = i % 3 === 0 ? `${DIRTY} (${i})` : `${CLEAN} (${i})`;
    out.push(market(`m${i}`, question, { liquidity: 1000 + i * 10 }));
  }
  return out;
}

// --- the prediction under test -------------------------------------------

test("the grader's semantic half splits the two example questions", () => {
  assert.equal(predictionFor(market("a", CLEAN)).predicts, SAME);
  assert.equal(predictionFor(market("b", DIRTY)).predicts, DIFFER);
});

test("structural spec defects are excluded from the prediction", () => {
  // Both markets have no spec at all; the clean one must still predict SAME,
  // or every item would be DIFFER and the test would be vacuous.
  const pinned = predictionFor(market("a", CLEAN));
  assert.equal(pinned.predicts, SAME);
  assert.deepEqual(pinned.fired, []);
});

// --- canonical hashing ----------------------------------------------------

test("canonicalJSON is key-order independent", () => {
  assert.equal(canonicalJSON({ b: 1, a: 2 }), canonicalJSON({ a: 2, b: 1 }));
  assert.notEqual(canonicalJSON({ a: 1 }), canonicalJSON({ a: 2 }));
});

test("canonicalJSON is stable through nesting and arrays", () => {
  const left = { x: [{ q: 1, p: 2 }], y: "s" };
  const right = { y: "s", x: [{ p: 2, q: 1 }] };
  assert.equal(digest(left), digest(right));
});

// --- the draw -------------------------------------------------------------

test("the same seed draws the same sample", () => {
  const markets = corpus();
  const a = drawSample({ markets, seed: "acorn", perStratum: 10 });
  const b = drawSample({ markets, seed: "acorn", perStratum: 10 });
  assert.deepEqual(a.items.map((m) => m.id), b.items.map((m) => m.id));
});

test("a different seed draws a different sample", () => {
  const markets = corpus();
  const a = drawSample({ markets, seed: "acorn", perStratum: 10 });
  const b = drawSample({ markets, seed: "beacon", perStratum: 10 });
  assert.notDeepEqual(a.items.map((m) => m.id), b.items.map((m) => m.id));
});

test("the draw is balanced across the two strata", () => {
  const { items, provenance } = drawSample({ markets: corpus(), seed: "acorn", perStratum: 10 });
  assert.equal(items.length, 20);
  assert.equal(provenance.drawn.no_probe, 10);
  assert.equal(provenance.drawn.probe_fires, 10);
  const differ = items.filter((m) => predictionFor(m).predicts === DIFFER).length;
  assert.equal(differ, 10);
});

test("the draw records the seed and design so it cannot be re-rolled quietly", () => {
  const { provenance } = drawSample({ markets: corpus(), seed: "acorn", perStratum: 5 });
  assert.equal(provenance.seed, "acorn");
  assert.equal(provenance.design, "balanced-on-semantic-probe");
});

test("eligibility drops stub questions and dust markets", () => {
  const markets = [
    market("ok", CLEAN, { liquidity: 5000 }),
    market("short", "Too short?", { liquidity: 5000 }),
    market("dust", CLEAN, { liquidity: 10 }),
  ];
  assert.deepEqual(eligible(markets, 1000).map((m) => m.id), ["ok"]);
});

test("shuffled leaves the input alone", () => {
  const input = [1, 2, 3, 4, 5];
  const copy = [...input];
  shuffled(input, rngFrom("s"));
  assert.deepEqual(input, copy);
});

// --- blindness ------------------------------------------------------------

test("the form leaks no verdict, no probe name, and no spec field", () => {
  const { items } = drawSample({ markets: corpus(), seed: "acorn", perStratum: 10 });
  const html = renderForm({ markets: items, seed: "acorn" });
  const forbidden = [
    "TEMPORAL_VAGUE", "SUPERLATIVE_UNTIED", "MISSING_UNIT", "COMPOUND_CONDITION",
    "VAGUE_PREDICATE", "UNBOUND_ENTITY", "SPEC_INVALID",
    "ADMIT", "REFUSE", "predicts", "fired", "grader", "probe",
  ];
  for (const token of forbidden) {
    assert.ok(!html.includes(token), `form leaked "${token}"`);
  }
});

test("formItems whitelists, so a new corpus field cannot leak by default", () => {
  const items = formItems([market("a", CLEAN, { secret_verdict: "REFUSE", volume: 9 })]);
  assert.deepEqual(Object.keys(items[0]).sort(),
    ["end_date", "id", "liquidity", "question", "resolution_text"]);
});

test("the form still carries what a labeller needs to judge", () => {
  const html = renderForm({ markets: [market("a", CLEAN)], seed: "acorn" });
  assert.ok(html.includes(CLEAN));
  assert.ok(html.includes("Resolution text for a"));
  assert.ok(html.includes("acorn"));
  assert.ok(html.includes(PROTOCOL_VERSION));
});

// --- the commitment -------------------------------------------------------

test("a prereg verifies against the grader that produced it", () => {
  const { items, provenance } = drawSample({ markets: corpus(), seed: "acorn", perStratum: 10 });
  const prereg = preregister(items, provenance);
  const byId = new Map(items.map((m) => [String(m.id), m]));
  assert.equal(verifyPrereg(prereg, byId).ok, true);
});

test("a moved verdict fails verification and names the market", () => {
  const { items, provenance } = drawSample({ markets: corpus(), seed: "acorn", perStratum: 10 });
  const prereg = preregister(items, provenance);
  const tampered = {
    ...prereg,
    predictions: prereg.predictions.map((p, i) =>
      i === 0 ? { ...p, predicts: p.predicts === SAME ? DIFFER : SAME } : p),
  };
  const byId = new Map(items.map((m) => [String(m.id), m]));
  const check = verifyPrereg(tampered, byId);
  assert.equal(check.ok, false);
  assert.equal(check.changed[0].id, prereg.predictions[0].id);
});

test("drift and forgery are reported as different failures", () => {
  const { items, provenance } = drawSample({ markets: corpus(), seed: "acorn", perStratum: 10 });
  const prereg = preregister(items, provenance);

  // Drift: the document is untouched, but the grader now says something else.
  // Swapping the underlying question is equivalent to widening a probe.
  const drifted = new Map(items.map((m) => [String(m.id), m]));
  const first = items[0];
  const flipped = predictionFor(first).predicts === SAME ? DIRTY : CLEAN;
  drifted.set(String(first.id), { ...first, question: flipped });
  const onDrift = verifyPrereg(prereg, drifted);
  assert.equal(onDrift.ok, false);
  assert.equal(onDrift.file_intact, true, "the commitment itself was not forged");
  assert.equal(onDrift.grader_stable, false);

  // Forgery: the document no longer hashes to its own commitment.
  const forged = { ...prereg, hash: "0".repeat(64) };
  const byId = new Map(items.map((m) => [String(m.id), m]));
  const onForge = verifyPrereg(forged, byId);
  assert.equal(onForge.ok, false);
  assert.equal(onForge.file_intact, false);
  assert.equal(onForge.grader_stable, true, "the grader itself did not move");
});

test("score names drift and forgery differently in its refusal", () => {
  const { items, provenance } = drawSample({ markets: corpus(), seed: "acorn", perStratum: 10 });
  const prereg = preregister(items, provenance);
  const sheets = [{ labeller: "a", labels: items.map((m) => ({ id: String(m.id), label: SAME })) }];

  const drifted = new Map(items.map((m) => [String(m.id), m]));
  const first = items[0];
  drifted.set(String(first.id), {
    ...first,
    question: predictionFor(first).predicts === SAME ? DIRTY : CLEAN,
  });
  const onDrift = score({ prereg, marketsById: drifted, sheets });
  assert.equal(onDrift.ok, false);
  assert.match(onDrift.reason, /the grader moved/);

  const byId = new Map(items.map((m) => [String(m.id), m]));
  const onForge = score({ prereg: { ...prereg, hash: "0".repeat(64) }, marketsById: byId, sheets });
  assert.equal(onForge.ok, false);
  assert.match(onForge.reason, /does not hash to its own commitment/);
});

test("a market that vanished from the corpus fails verification", () => {
  const { items, provenance } = drawSample({ markets: corpus(), seed: "acorn", perStratum: 5 });
  const prereg = preregister(items, provenance);
  const byId = new Map(items.slice(1).map((m) => [String(m.id), m]));
  const check = verifyPrereg(prereg, byId);
  assert.equal(check.ok, false);
  assert.match(check.changed[0].reason, /missing from corpus/);
});

// --- agreement statistics -------------------------------------------------

test("kappa is 1 on perfect agreement across both categories", () => {
  const pairs = [[SAME, SAME], [SAME, SAME], [DIFFER, DIFFER], [DIFFER, DIFFER]];
  assert.equal(cohenKappa(pairs).kappa, 1);
});

test("kappa is 0 when agreement is exactly chance", () => {
  const pairs = [[SAME, SAME], [SAME, DIFFER], [DIFFER, SAME], [DIFFER, DIFFER]];
  const { kappa, observed } = cohenKappa(pairs);
  assert.equal(observed, 0.5);
  assert.equal(kappa, 0);
});

test("kappa is null, not 1, when both raters used a single category", () => {
  // 100% observed agreement carrying zero information must not read as perfect.
  const pairs = [[SAME, SAME], [SAME, SAME], [SAME, SAME]];
  assert.equal(cohenKappa(pairs).kappa, null);
  assert.equal(cohenKappa(pairs).observed, 1);
});

test("kappa on no pairs reports n=0 rather than a number", () => {
  assert.deepEqual(cohenKappa([]), { kappa: null, observed: null, expected: null, n: 0 });
});

test("majority resolves ties to CANT_TELL rather than picking a winner", () => {
  const sheets = [
    { labeller: "a", labels: [{ id: "x", label: SAME }] },
    { labeller: "b", labels: [{ id: "x", label: DIFFER }] },
  ];
  assert.equal(majority(sheets).get("x"), CANT_TELL);
});

test("majority takes the strict winner when there is one", () => {
  const sheets = [
    { labeller: "a", labels: [{ id: "x", label: SAME }] },
    { labeller: "b", labels: [{ id: "x", label: DIFFER }] },
    { labeller: "c", labels: [{ id: "x", label: SAME }] },
  ];
  assert.equal(majority(sheets).get("x"), SAME);
});

test("unanswered items are dropped rather than counted as agreement", () => {
  const sheet = { labeller: "a", labels: [{ id: "x", label: SAME }, { id: "y", label: null }] };
  assert.deepEqual([...indexSheet(sheet).keys()], ["x"]);
});

// --- scoring refuses to launder a moved grader ---------------------------

function fixture(seed = "acorn", perStratum = 10) {
  const markets = corpus();
  const { items, provenance } = drawSample({ markets, seed, perStratum });
  return {
    items,
    prereg: preregister(items, provenance),
    marketsById: new Map(markets.map((m) => [String(m.id), m])),
  };
}

test("score refuses outright when the prereg document has been rewritten", () => {
  const { items, prereg, marketsById } = fixture();
  const tampered = {
    ...prereg,
    predictions: prereg.predictions.map((p, i) =>
      i === 0 ? { ...p, predicts: p.predicts === SAME ? DIFFER : SAME } : p),
  };
  const sheets = [{
    labeller: "outsider",
    labels: items.map((m) => ({ id: String(m.id), label: SAME })),
  }];
  const result = score({ prereg: tampered, marketsById, sheets });
  assert.equal(result.ok, false);
  // Editing the predictions in place breaks the document's own hash, so this
  // is forgery rather than drift, and must be named as such.
  assert.equal(result.file_intact, false);
  assert.match(result.reason, /does not hash to its own commitment/);
  assert.ok(result.changed.length > 0);
});

test("score reports human-human agreement and never reports accuracy", () => {
  const { items, prereg, marketsById } = fixture();
  const truth = new Map(prereg.predictions.map((p) => [p.id, p.predicts]));
  const sheets = [
    { labeller: "a", labels: items.map((m) => ({ id: String(m.id), label: truth.get(String(m.id)) })) },
    { labeller: "b", labels: items.map((m) => ({ id: String(m.id), label: truth.get(String(m.id)) })) },
  ];
  const result = score({ prereg, marketsById, sheets });
  assert.equal(result.ok, true);
  assert.equal(result.accuracy, null);
  assert.equal(result.human_vs_human.length, 1);
  assert.equal(result.human_vs_human[0].kappa, 1);
  assert.equal(result.grader_vs_majority.kappa, 1);
});

test("a labeller who always abstains produces no kappa, not a fake one", () => {
  const { items, prereg, marketsById } = fixture();
  const sheets = [{
    labeller: "abstainer",
    labels: items.map((m) => ({ id: String(m.id), label: CANT_TELL })),
  }];
  const result = score({ prereg, marketsById, sheets });
  assert.equal(result.ok, true);
  assert.equal(result.grader_vs_labeller[0].n, 0);
  assert.equal(result.grader_vs_labeller[0].kappa, null);
  assert.equal(result.grader_vs_labeller[0].abstained, items.length);
});

test("a single labeller yields an empty ceiling, which the CLI must flag", () => {
  const { items, prereg, marketsById } = fixture();
  const sheets = [{
    labeller: "only-one",
    labels: items.map((m) => ({ id: String(m.id), label: SAME })),
  }];
  const result = score({ prereg, marketsById, sheets });
  assert.equal(result.human_vs_human.length, 0);
});

test("per-probe backing is counted from the majority label", () => {
  const { items, prereg, marketsById } = fixture();
  const truth = new Map(prereg.predictions.map((p) => [p.id, p.predicts]));
  const sheets = [
    { labeller: "a", labels: items.map((m) => ({ id: String(m.id), label: truth.get(String(m.id)) })) },
    { labeller: "b", labels: items.map((m) => ({ id: String(m.id), label: truth.get(String(m.id)) })) },
  ];
  const result = score({ prereg, marketsById, sheets });
  for (const cell of Object.values(result.per_probe)) {
    assert.equal(cell.contradicted, 0);
    assert.equal(cell.backed, cell.fired);
  }
});

test("exposure to the resolution text is scored as its own stratum", () => {
  const { items, prereg, marketsById } = fixture();
  const sheets = [{
    labeller: "a",
    labels: items.map((m, i) => ({
      id: String(m.id),
      label: SAME,
      saw_description: i % 2 === 0,
    })),
  }];
  const result = score({ prereg, marketsById, sheets });
  const seen = result.by_exposure.saw_description.n;
  const unseen = result.by_exposure.question_only.n;
  assert.equal(seen + unseen, items.length);
  assert.ok(seen > 0 && unseen > 0);
});
