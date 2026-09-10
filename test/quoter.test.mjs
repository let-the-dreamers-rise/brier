/**
 * Tests for the read-only quoter (mm/).
 *
 * A quoter's failures cost money rather than accuracy points, so the cases
 * pinned here are the ones that lose it: quoting a market it measured as
 * dangerous, quoting a dead or finished market, and letting one position
 * grow large enough that a single bad settlement matters.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { assess, POLICY, REFUSE, WIDEN, BASE_HALF_SPREAD, WIDEN_STEP } from "../mm/policy.mjs";
import { pricesOf, dateInName, decide, buildBook } from "../mm/quoter.mjs";

const NOW = new Date("2026-09-10T00:00:00Z");
const FUTURE = "2026-12-31T00:00:00Z";

function market(id, question, yesPct, extra = {}) {
  return {
    _id: id,
    question,
    status: "Live",
    endDate: FUTURE,
    contractAddress: `0x${id}`,
    participantCount: 2,
    options: [
      { optionName: "Yes", choiceIndex: 1, percentage: yesPct },
      { optionName: "No", choiceIndex: 2, percentage: 100 - yesPct },
    ],
    ...extra,
  };
}

const CLEAN = "Will the Fed decrease interest rates by 25 bps after the September 2026 meeting?";
const VAGUE = "Will Iran agree to end enrichment of uranium?";
const TEMPORAL = "Will the ceasefire hold before July?";

// --- the policy is the dispute table, not a guess ---------------------------

test("the measured dangerous check refuses the market", () => {
  assert.equal(assess(["VAGUE_PREDICATE"]).action, REFUSE);
});

test("a refusal wins even when other checks would only widen", () => {
  assert.equal(assess(["TEMPORAL_VAGUE", "VAGUE_PREDICATE"]).action, REFUSE);
});

test("checks measured as noise change nothing", () => {
  const r = assess(["MISSING_UNIT", "SUPERLATIVE_UNTIED"]);
  assert.equal(r.action, "quote");
  assert.equal(r.halfSpread, BASE_HALF_SPREAD);
});

test("each widening check adds one step to the spread", () => {
  assert.equal(assess(["TEMPORAL_VAGUE"]).halfSpread, BASE_HALF_SPREAD + WIDEN_STEP);
  assert.equal(
    assess(["TEMPORAL_VAGUE", "COMPOUND_CONDITION"]).halfSpread,
    BASE_HALF_SPREAD + 2 * WIDEN_STEP,
  );
});

test("a check the policy has never seen is widened, not trusted", () => {
  const r = assess(["SOME_NEW_CHECK"]);
  assert.equal(r.action, WIDEN);
  assert.ok(r.halfSpread > BASE_HALF_SPREAD);
});

test("every measured rule cites the lift it was set from", () => {
  for (const [code, rule] of Object.entries(POLICY)) {
    if (rule.basis === "measured") assert.equal(typeof rule.lift, "number", code);
  }
  assert.equal(POLICY.VAGUE_PREDICATE.lift, 2.92);
  assert.equal(POLICY.MISSING_UNIT.lift, 0);
});

// --- prices -------------------------------------------------------------------

test("every outcome's price is read from Rain's percentage", () => {
  const p = pricesOf(market("a", CLEAN, 65));
  assert.deepEqual(p.map((o) => o.p), [0.65, 0.35]);
});

test("a multi-outcome market is quoted leg by leg", () => {
  // v1 quoted binaries only and quoted nothing on the first live run:
  // 21 of Rain's 30 live markets had three or more outcomes.
  const m = market("a", CLEAN, 0, {
    options: [
      { choiceIndex: 1, optionName: "A", percentage: 50 },
      { choiceIndex: 2, optionName: "B", percentage: 30 },
      { choiceIndex: 3, optionName: "C", percentage: 20 },
    ],
  });
  const q = decide(m, NOW);
  assert.equal(q.skip, undefined);
  assert.equal(q.outcomes, 3);
  assert.deepEqual(q.legs.map((l) => l.choiceIndex), [1, 2, 3]);
});

test("extreme legs are dropped while the rest of the market is still quoted", () => {
  const m = market("a", CLEAN, 0, {
    options: [
      { choiceIndex: 1, optionName: "A", percentage: 97 },
      { choiceIndex: 2, optionName: "B", percentage: 2 },
      { choiceIndex: 3, optionName: "C", percentage: 1 },
    ],
  });
  assert.match(decide(m, NOW).skip, /every open outcome too close/);

  const mixed = market("b", CLEAN, 0, {
    options: [
      { choiceIndex: 1, optionName: "A", percentage: 60 },
      { choiceIndex: 2, optionName: "B", percentage: 38 },
      { choiceIndex: 3, optionName: "C", percentage: 2 },
    ],
  });
  assert.deepEqual(decide(mixed, NOW).legs.map((l) => l.choiceIndex), [1, 2]);
});

// --- deciding one market ------------------------------------------------------

test("a clean live market is quoted symmetrically around mid", () => {
  const q = decide(market("a", CLEAN, 50), NOW);
  assert.equal(q.skip, undefined);
  assert.equal(q.legs[0].bid, 0.5 - BASE_HALF_SPREAD);
  assert.equal(q.legs[0].ask, 0.5 + BASE_HALF_SPREAD);
});

test("a vague-predicate market is refused with the reason", () => {
  const q = decide(market("a", VAGUE, 50), NOW);
  assert.match(q.skip, /VAGUE_PREDICATE/);
});

test("a temporally vague market is quoted wider", () => {
  const q = decide(market("a", TEMPORAL, 50), NOW);
  assert.equal(q.skip, undefined);
  assert.ok(q.legs[0].ask - q.legs[0].bid > 2 * BASE_HALF_SPREAD);
});

test("finished, non-live and extreme-priced markets are not quoted", () => {
  assert.match(decide(market("a", CLEAN, 50, { status: "Closed" }), NOW).skip, /status/);
  assert.match(decide(market("b", CLEAN, 50, { endDate: "2026-01-01T00:00:00Z" }), NOW).skip, /end date/);
  assert.match(decide(market("c", CLEAN, 2), NOW).skip, /close to 0 or 1/);
  assert.match(decide(market("d", CLEAN, 99), NOW).skip, /close to 0 or 1/);
});

test("quotes never leave the tradable range", () => {
  const q = decide(market("a", TEMPORAL, 5), NOW);
  for (const leg of q.legs) assert.ok(leg.bid >= 0.01 && leg.ask <= 0.99);
});

// --- the two ways the first live book would have lost money ----------------

test("dates are read from outcome names only when month and year are both there", () => {
  assert.ok(dateInName("March 31, 2026") instanceof Date);
  assert.ok(dateInName("30 June 2026") instanceof Date);
  assert.ok(dateInName(" December 31, 2026") instanceof Date);
  // A real GTA 6 Metascore bucket on Rain. Date.parse("100") is the year 100.
  assert.equal(dateInName("100"), null);
  assert.equal(dateInName("Yes"), null);
  assert.equal(dateInName("$1 Billion - $2 Billion"), null);
});

test("an outcome dated in the past is never quoted", () => {
  const m = market("a", CLEAN, 0, {
    options: [
      { choiceIndex: 1, optionName: "March 31, 2026", percentage: 24 },
      { choiceIndex: 2, optionName: "June 30, 2026", percentage: 24 },
      { choiceIndex: 3, optionName: "December 31, 2026", percentage: 52 },
    ],
  });
  const q = decide(m, NOW);
  assert.deepEqual(q.legs.map((l) => l.name), ["December 31, 2026"]);
  assert.deepEqual(q.expiredLegs, ["March 31, 2026", "June 30, 2026"]);
});

test("a market whose every outcome is dated in the past is skipped", () => {
  const m = market("a", CLEAN, 0, {
    options: [
      { choiceIndex: 1, optionName: "March 31, 2026", percentage: 50 },
      { choiceIndex: 2, optionName: "June 30, 2026", percentage: 50 },
    ],
  });
  assert.match(decide(m, NOW).skip, /every outcome is dated in the past/);
});

test("an unconfirmed seed price is quoted wider than a traded one", () => {
  const traded = decide(market("a", CLEAN, 50, { participantCount: 5 }), NOW);
  const seed = decide(market("b", CLEAN, 50, { participantCount: 1 }), NOW);
  assert.ok(seed.halfSpread > traded.halfSpread);
  assert.ok(seed.reasons.some((r) => /unconfirmed seed/.test(r)));
});

// --- sizing -------------------------------------------------------------------

test("no single market takes more than the cap", () => {
  const book = buildBook([market("a", CLEAN, 50)], { budget: 1000, maxShare: 0.1, now: NOW });
  assert.equal(book.book[0].sizeUSD, 100);
  assert.equal(book.undeployed, 900);
});

test("inventory is never over-allocated", () => {
  const markets = Array.from({ length: 40 }, (_, i) => market(`m${i}`, CLEAN, 50));
  const book = buildBook(markets, { budget: 1000, maxShare: 0.1, now: NOW });
  assert.ok(book.deployed <= 1000 + 1e-6);
  assert.equal(book.quoted, 40);
});

test("a widened market gets less size than a clean one", () => {
  const markets = Array.from({ length: 20 }, (_, i) =>
    market(`m${i}`, i % 2 ? TEMPORAL : CLEAN, 50));
  const book = buildBook(markets, { budget: 1000, maxShare: 0.5, now: NOW });
  const clean = book.book.find((q) => q.question === CLEAN);
  const wide = book.book.find((q) => q.question === TEMPORAL);
  assert.ok(wide.sizeUSD < clean.sizeUSD);
});

test("refused markets are counted in the skip reasons, never in the book", () => {
  const book = buildBook([market("a", VAGUE, 50), market("b", CLEAN, 50)], { now: NOW });
  assert.equal(book.quoted, 1);
  assert.ok(!book.book.some((q) => q.question === VAGUE));
  assert.equal(book.skipped.length, 1);
});

test("an empty input produces an empty book, not a crash", () => {
  const book = buildBook([], { budget: 1000, now: NOW });
  assert.equal(book.quoted, 0);
  assert.equal(book.deployed, 0);
});
