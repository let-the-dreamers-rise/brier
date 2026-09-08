/**
 * Tests for the dispute analysis (edge/disputes.mjs).
 *
 * The arithmetic here decides whether a claim gets made in public, and an
 * earlier version of this analysis produced a confident number that did not
 * survive a bigger sample. So the maths is pinned against hand-computed cases
 * rather than trusted.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { wasDisputed, isSport, toRows, compare, terciles, perProbe } from "../edge/disputes.mjs";

const DIRTY = "Will Zelenskyy wear a suit before July?";
const CLEAN = "Will the Fed decrease interest rates by 25 bps after the September 2026 meeting?";

function market(id, question, extra = {}) {
  return { id, question, volumeNum: 1000, umaResolutionStatuses: "[]", ...extra };
}

// --- reading Polymarket's own record ---------------------------------------

test("a dispute is read from the status sequence", () => {
  assert.equal(wasDisputed(market("a", CLEAN, {
    umaResolutionStatuses: '["proposed", "disputed", "proposed", "resolved"]',
  })), true);
  assert.equal(wasDisputed(market("b", CLEAN, {
    umaResolutionStatuses: '["proposed", "resolved"]',
  })), false);
});

test("a missing or malformed status list is not a dispute", () => {
  assert.equal(wasDisputed(market("a", CLEAN, { umaResolutionStatuses: undefined })), false);
  assert.equal(wasDisputed(market("b", CLEAN, { umaResolutionStatuses: "not json" })), false);
  assert.equal(wasDisputed(market("c", CLEAN, { umaResolutionStatuses: '"disputed"' })), false);
});

test("sports are detected from any of the three markers", () => {
  assert.equal(isSport(market("a", CLEAN, { sportsMarketType: "spread" })), true);
  assert.equal(isSport(market("b", CLEAN, { gameStartTime: "2026-01-01" })), true);
  assert.equal(isSport(market("c", CLEAN, { resolutionSource: "https://hltv.org" })), true);
  assert.equal(isSport(market("d", CLEAN, { resolutionSource: "https://fed.gov" })), false);
  assert.equal(isSport(market("e", CLEAN)), false);
});

// --- the arithmetic that decides the claim ---------------------------------

test("compare reproduces a hand-computed lift and direction", () => {
  // 4 flagged, 2 disputed (50%); 4 clean, 1 disputed (25%). Lift = 2.
  const rows = [
    { flagged: true, disputed: true, fired: ["X"], volume: 1 },
    { flagged: true, disputed: true, fired: ["X"], volume: 1 },
    { flagged: true, disputed: false, fired: ["X"], volume: 1 },
    { flagged: true, disputed: false, fired: ["X"], volume: 1 },
    { flagged: false, disputed: true, fired: [], volume: 1 },
    { flagged: false, disputed: false, fired: [], volume: 1 },
    { flagged: false, disputed: false, fired: [], volume: 1 },
    { flagged: false, disputed: false, fired: [], volume: 1 },
  ];
  const c = compare(rows);
  assert.equal(c.rate_flagged, 0.5);
  assert.equal(c.rate_clean, 0.25);
  assert.equal(c.lift, 2);
  assert.ok(c.z > 0, "a higher flagged rate must give a positive z");
});

test("a reversed effect reports lift below 1 and a negative z", () => {
  const rows = [
    { flagged: true, disputed: false, fired: ["X"], volume: 1 },
    { flagged: true, disputed: false, fired: ["X"], volume: 1 },
    { flagged: false, disputed: true, fired: [], volume: 1 },
    { flagged: false, disputed: true, fired: [], volume: 1 },
  ];
  const c = compare(rows);
  assert.equal(c.lift, 0);
  assert.ok(c.z < 0);
});

test("compare degrades rather than dividing by zero", () => {
  const noneDisputed = [
    { flagged: true, disputed: false, fired: ["X"], volume: 1 },
    { flagged: false, disputed: false, fired: [], volume: 1 },
  ];
  assert.equal(compare(noneDisputed).lift, null);
  assert.equal(compare(noneDisputed).z, null);

  const noFlags = [{ flagged: false, disputed: true, fired: [], volume: 1 }];
  assert.equal(compare(noFlags).rate_flagged, null);
  assert.equal(compare(noFlags).z, null);
});

test("terciles split by volume with the largest markets on top", () => {
  const rows = [9, 1, 5, 3, 7, 2, 8, 4, 6].map((v) => ({
    flagged: false, disputed: false, fired: [], volume: v,
  }));
  const { low, mid, high } = terciles(rows);
  assert.deepEqual(low.map((r) => r.volume), [1, 2, 3]);
  assert.deepEqual(mid.map((r) => r.volume), [4, 5, 6]);
  assert.deepEqual(high.map((r) => r.volume), [7, 8, 9]);
});

test("per-probe lift is measured against the unflagged base rate", () => {
  const rows = [
    { flagged: true, disputed: true, fired: ["A"], volume: 1 },
    { flagged: true, disputed: false, fired: ["A"], volume: 1 },
    { flagged: true, disputed: false, fired: ["B"], volume: 1 },
    { flagged: false, disputed: true, fired: [], volume: 1 },
    { flagged: false, disputed: false, fired: [], volume: 1 },
    { flagged: false, disputed: false, fired: [], volume: 1 },
    { flagged: false, disputed: false, fired: [], volume: 1 },
  ];
  const { base_rate, probes } = perProbe(rows);
  assert.equal(base_rate, 0.25);
  assert.equal(probes.A.fired, 2);
  assert.equal(probes.A.rate, 0.5);
  assert.equal(probes.A.lift, 2);
  assert.equal(probes.B.rate, 0);
  assert.equal(probes.B.lift, 0);
});

test("a probe that never coincides with a dispute reports zero, not null", () => {
  // MISSING_UNIT fired 155 times with zero disputes in the real corpus; that
  // must read as a measured zero rather than as missing data.
  const rows = [
    { flagged: true, disputed: false, fired: ["MISSING_UNIT"], volume: 1 },
    { flagged: false, disputed: true, fired: [], volume: 1 },
  ];
  assert.equal(perProbe(rows).probes.MISSING_UNIT.rate, 0);
  assert.equal(perProbe(rows).probes.MISSING_UNIT.lift, 0);
});

// --- end to end on market-shaped input -------------------------------------

test("toRows pairs the grader's call with the realised outcome", () => {
  const rows = toRows([
    market("a", DIRTY, { umaResolutionStatuses: '["proposed","disputed"]', volumeNum: 5 }),
    market("b", CLEAN, { umaResolutionStatuses: '["proposed","resolved"]', volumeNum: 7 }),
  ]);
  assert.equal(rows[0].flagged, true);
  assert.equal(rows[0].disputed, true);
  assert.equal(rows[0].volume, 5);
  assert.equal(rows[1].flagged, false);
  assert.equal(rows[1].disputed, false);
});
