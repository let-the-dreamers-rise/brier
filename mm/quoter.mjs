/**
 * A read-only quoter for Rain's long tail.
 *
 * WHAT THIS IS. Given the markets Rain's public API returns, it decides which
 * ones are safe to quote, where, and with how much inventory -- and emits the
 * quote book. It signs nothing and sends nothing. Turning a quote into an
 * order is `buildLimitBuyOptionTx` / `buildSellOptionTx` on the Rain SDK,
 * and that step needs inventory and a key that this code deliberately does
 * not hold.
 *
 * WHY IT EXISTS. 174 of the 325 markets Rain's public API returned had two or
 * fewer participants. A market nobody quotes cannot be traded by someone who
 * wants to, however good the question. Rain pays builders 0.5% of the volume
 * they generate, so the incentive and the problem point at the same place.
 *
 * Everything here is a pure function of its input, so the book it produces can
 * be reproduced from the same snapshot by anyone.
 */

import { grade } from "../src/grader.mjs";
import { assess, REFUSE, MIN_MID, MAX_MID, WIDEN_STEP } from "./policy.mjs";

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round4 = (x) => Math.round(x * 1e4) / 1e4;

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
const YEAR = /\b20\d{2}\b/;

/**
 * A date named in an outcome, such as "by June 30, 2026", or null.
 *
 * Deliberately narrow: an outcome is only read as a date when it names both a
 * month and a four-digit year. Without that guard an outcome called "100" --
 * a real GTA 6 Metascore bucket on Rain -- parses as the year 100.
 */
export function dateInName(name) {
  const text = String(name ?? "");
  if (!MONTH.test(text) || !YEAR.test(text)) return null;
  const t = Date.parse(text.trim());
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * Implied probability of every outcome, from Rain's own listing.
 *
 * v1 quoted binaries only, and on the first live run that scope quoted
 * nothing: 21 of Rain's 30 live markets had three to eight outcomes. Each
 * outcome is a price in its own right and buildLimitBuyOptionTx takes any
 * choiceIndex, so every outcome is quoted separately.
 */
export function pricesOf(market) {
  const options = Array.isArray(market.options) ? market.options : [];
  return options
    .map((o) => ({
      choiceIndex: Number(o.choiceIndex),
      name: String(o.optionName ?? ""),
      p: Number(o.percentage) / 100,
    }))
    .filter((o) => Number.isFinite(o.p) && Number.isFinite(o.choiceIndex));
}

/**
 * Decide whether and how to quote one market.
 * @param {object} market a market as returned by getPublicMarkets
 * @param {Date} now
 * @returns {object} a quote, or a skip with the reason
 */
export function decide(market, now = new Date()) {
  const base = {
    id: String(market._id ?? market.id ?? ""),
    question: String(market.question ?? ""),
    contract: String(market.contractAddress ?? ""),
    participants: Number(market.participantCount ?? market.participants ?? 0),
  };

  if (String(market.status) !== "Live") return { ...base, skip: `status ${market.status}` };
  const end = market.endDate ? new Date(market.endDate) : null;
  if (end && end <= now) return { ...base, skip: "past its end date" };

  const prices = pricesOf(market);
  if (prices.length < 2) return { ...base, skip: "no price" };

  // Risk is a property of the question, so it is decided once per market.
  const { fired } = grade(base.question, {});
  const risk = assess(fired);
  if (risk.action === REFUSE) return { ...base, outcomes: prices.length, fired, skip: risk.reasons[0] };

  // An outcome dated in the past has already resolved one way or the other.
  // The first live run quoted "by March 31, 2026" at 23.8% in September 2026,
  // which is a free option for anyone holding a calendar.
  const expired = prices.filter((o) => {
    const d = dateInName(o.name);
    return d !== null && d <= now;
  });
  const open = prices.filter((o) => !expired.includes(o));

  // With one participant or none, the listed price is the creator's opening
  // guess and nobody has traded against it. Quoting around it means taking
  // the other side of an uninformed number, so it is quoted wider.
  const reasons = [...risk.reasons];
  let halfSpread = risk.halfSpread;
  if (base.participants <= 1) {
    halfSpread += WIDEN_STEP;
    reasons.push("price is an unconfirmed seed (<=1 participant), widened");
  }

  const legs = open
    .filter((o) => o.p >= MIN_MID && o.p <= MAX_MID)
    .map((o) => ({
      choiceIndex: o.choiceIndex,
      name: o.name,
      mid: round4(o.p),
      bid: round4(clamp(o.p - halfSpread, 0.01, 0.99)),
      ask: round4(clamp(o.p + halfSpread, 0.01, 0.99)),
    }));
  if (legs.length === 0) {
    const why = expired.length === prices.length
      ? "every outcome is dated in the past"
      : "every open outcome too close to 0 or 1 to quote";
    return { ...base, outcomes: prices.length, skip: why };
  }

  return {
    ...base,
    outcomes: prices.length,
    legs,
    expiredLegs: expired.map((o) => o.name),
    halfSpread: round4(halfSpread),
    fired,
    reasons,
  };
}

/**
 * Build the full book and allocate inventory across it.
 *
 * Inventory is split evenly over quoted markets and capped per market, so one
 * bad settlement cannot take more than the cap. Wider quotes get less size:
 * the market that needed widening is the one more likely to cost money.
 *
 * @param {Array<object>} markets
 * @param {object} options
 * @param {number} options.budget USD of inventory
 * @param {number} options.maxShare largest fraction of budget in one market
 * @param {Date} options.now
 */
export function buildBook(markets, { budget = 1000, maxShare = 0.1, now = new Date() } = {}) {
  const decisions = markets.map((m) => decide(m, now));
  const quoted = decisions.filter((d) => !d.skip);
  const skipped = decisions.filter((d) => d.skip);

  const cap = budget * maxShare;
  const weights = quoted.map((q) => 0.03 / q.halfSpread);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  const book = quoted.map((q, i) => ({
    ...q,
    sizeUSD: round4(Math.min(cap, (budget * weights[i]) / totalWeight)),
  }));
  const deployed = book.reduce((a, q) => a + q.sizeUSD, 0);

  const skipReasons = skipped.reduce((acc, s) => {
    const key = s.skip.replace(/^[A-Z_]+: [\d.]+x/, (m) => m.split(":")[0]);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    considered: markets.length,
    quoted: book.length,
    budget,
    deployed: round4(deployed),
    undeployed: Math.max(0, round4(budget - deployed)),
    book,
    skipped,
    skip_reasons: skipReasons,
  };
}
