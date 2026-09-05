import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { grade, explain, ADMIT, REFUSE } from "../src/grader.mjs";

const COMPLETE = Object.freeze({
  question: "q",
  source: "https://example.org/data",
  selector: "$.value",
  observed_at: "2026-12-31T23:59:59Z",
  unit: "percent",
  comparator: "> 15.0",
  tiebreak: "earliest wins",
  combine: "(a AND b) OR c",
  entities: ["A", "B"],
  void_if: ["unreachable"],
  fallback: "abstain",
});

test("a fully specified question is admitted", () => {
  const r = grade("Will the top score exceed 15 percent at 2026-12-31T23:59:59Z?", COMPLETE);
  assert.equal(r.decision, ADMIT);
  assert.deepEqual(r.defects, []);
});

test("a vague predicate cannot be repaired by any field", () => {
  const r = grade("Will a lab release a significant model at 2026-12-31T23:59:59Z?", COMPLETE);
  assert.equal(r.decision, REFUSE);
  const vague = r.defects.find((d) => d.code === "VAGUE_PREDICATE");
  assert.ok(vague, "VAGUE_PREDICATE should fire");
  assert.equal(vague.fixable, false);
});

test("a superlative is admitted only once a tiebreak exists", () => {
  const q = "Which model has the highest score at 2026-12-31T23:59:59Z?";
  const { tiebreak, ...noTiebreak } = COMPLETE;
  assert.equal(grade(q, noTiebreak).decision, REFUSE);
  assert.equal(grade(q, COMPLETE).decision, ADMIT);
});

test("a relative period is admitted only once observed_at exists", () => {
  const q = "Will the index rise by end of year?";
  const { observed_at, ...noInstant } = COMPLETE;
  const r = grade(q, noInstant);
  assert.equal(r.decision, REFUSE);
  assert.ok(r.defects.some((d) => d.code === "TEMPORAL_VAGUE"));
  assert.equal(grade(q, COMPLETE).decision, ADMIT);
});

test("a threshold is admitted only once a unit exists", () => {
  const q = "Will transactions exceed 5 million at 2026-12-31T23:59:59Z?";
  const { unit, comparator, ...noUnit } = COMPLETE;
  const r = grade(q, noUnit);
  assert.equal(r.decision, REFUSE);
  assert.ok(r.defects.some((d) => d.code === "MISSING_UNIT"));
});

test("an unbound entity is admitted only once the set is enumerated", () => {
  const q = "Will a major exchange list the token at 2026-12-31T23:59:59Z?";
  const { entities, ...noEntities } = COMPLETE;
  // "major" is also a vague predicate, so this stays refused either way;
  // assert specifically that the entity probe is what the enumeration answers.
  assert.ok(grade(q, noEntities).defects.some((d) => d.code === "UNBOUND_ENTITY"));
  assert.equal(grade(q, COMPLETE).defects.some((d) => d.code === "UNBOUND_ENTITY"), false);
});

test("structural problems are reported as defects, not thrown", () => {
  const r = grade("Will X happen at 2026-12-31T23:59:59Z?", {});
  assert.equal(r.decision, REFUSE);
  assert.ok(r.defects.every((d) => d.code === "SPEC_INVALID"));
});

test("grade survives junk input without throwing", () => {
  assert.equal(grade(undefined, undefined).decision, REFUSE);
  assert.equal(grade(null, null).decision, REFUSE);
});

test("explain separates rewrites from spec completions", () => {
  const text = explain(grade("Will a lab announce something soon?", {}));
  assert.match(text, /Rewrite the question/);
  assert.match(text, /Complete the spec/);
});

test("explain on an admitted question says so", () => {
  const text = explain(grade("Will the value exceed 15 percent at 2026-12-31T23:59:59Z?", COMPLETE));
  assert.match(text, /^ADMIT/);
});

test("corpus: every case matches its human label", () => {
  const corpus = JSON.parse(readFileSync(new URL("../corpus/questions.json", import.meta.url), "utf8"));
  const misses = corpus.cases
    .map((c) => ({ id: c.id, expect: c.expect, got: grade(c.question, c.spec).decision }))
    .filter((r) => r.expect !== r.got);
  assert.deepEqual(misses, [], `grader disagrees with the label on: ${misses.map((m) => m.id).join(", ")}`);
});

test("corpus: the attacked Polymarket question is refused", () => {
  const corpus = JSON.parse(readFileSync(new URL("../corpus/questions.json", import.meta.url), "utf8"));
  const attacked = corpus.cases.find((c) => c.id === "uma-ukraine-minerals");
  const r = grade(attacked.question, attacked.spec);
  assert.equal(r.decision, REFUSE);
  assert.ok(r.fired.includes("VAGUE_PREDICATE"), "the word 'agree' is the unresolvable defect");
});
