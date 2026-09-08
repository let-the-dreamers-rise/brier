/**
 * Does the admission grader predict markets that actually got disputed?
 *
 * This is the test the hand-labelling instrument in `label/` was built to make
 * possible, answered from a better source than human labels: Polymarket's own
 * UMA record. A closed market's `umaResolutionStatuses` holds the sequence of
 * proposals and disputes it actually went through. That is a realised outcome,
 * written by the protocol, about markets nobody here authored or selected.
 *
 * WHAT KILLED THE FIRST VERSION OF THIS RESULT. On the first 500 markets the
 * pooled lift was 2.03x at z=2.53 and it looked like a finding. Those 500 came
 * from offset paging ordered by volume, so the sample was the fattest books on
 * the site. On 3,464 markets drawn from monthly windows the pooled effect falls
 * to 1.29x at z=1.41, and among non-sports markets it is 0.98x -- nothing.
 *
 * Read the strata, not the pooled number. A pooled figure over a mixture is
 * exactly how the first version fooled its author.
 */

import { grade } from "../src/grader.mjs";

/** Sports resolve off a scoreboard: cleanly questioned and rarely disputed, so
 *  they are reported separately rather than averaged in. */
const SPORT_SOURCE = /hltv|espn|nba|nfl|mlb|nhl|premierleague|sofascore|flashscore|uefa|fifa/i;

export function isSport(market) {
  return Boolean(
    market.sportsMarketType ||
      market.gameStartTime ||
      (market.resolutionSource && SPORT_SOURCE.test(market.resolutionSource)),
  );
}

/** Did this market actually go to dispute? Polymarket's own record. */
export function wasDisputed(market) {
  try {
    const statuses = JSON.parse(market.umaResolutionStatuses || "[]");
    return Array.isArray(statuses) && statuses.includes("disputed");
  } catch {
    return false;
  }
}

/** One row per market: what the grader said, and what actually happened. */
export function toRows(markets) {
  return markets.map((market) => {
    const { fired } = grade(market.question || "", {});
    return {
      id: String(market.id),
      question: String(market.question || ""),
      volume: Number(market.volumeNum || 0),
      flagged: fired.length > 0,
      fired,
      disputed: wasDisputed(market),
      sport: isSport(market),
    };
  });
}

/**
 * Two-proportion comparison between flagged and unflagged rows.
 * `z` is the pooled-variance two-proportion test; with counts this small it is
 * a sanity check on direction, not a p-value to quote to three decimals.
 */
export function compare(rows) {
  const flagged = rows.filter((r) => r.flagged);
  const clean = rows.filter((r) => !r.flagged);
  const hits = (list) => list.filter((r) => r.disputed).length;

  const rateFlagged = flagged.length ? hits(flagged) / flagged.length : null;
  const rateClean = clean.length ? hits(clean) / clean.length : null;

  let z = null;
  if (flagged.length && clean.length) {
    const pooled = (hits(flagged) + hits(clean)) / (flagged.length + clean.length);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / flagged.length + 1 / clean.length));
    if (se > 0) z = (rateFlagged - rateClean) / se;
  }

  return {
    n_flagged: flagged.length,
    n_clean: clean.length,
    disputed_flagged: hits(flagged),
    disputed_clean: hits(clean),
    rate_flagged: rateFlagged,
    rate_clean: rateClean,
    lift: rateClean ? rateFlagged / rateClean : null,
    z,
  };
}

/** Split into terciles by volume; the top one is where the money is. */
export function terciles(rows) {
  const sorted = [...rows].sort((a, b) => a.volume - b.volume);
  const cut = Math.floor(sorted.length / 3);
  return {
    low: sorted.slice(0, cut),
    mid: sorted.slice(cut, 2 * cut),
    high: sorted.slice(2 * cut),
  };
}

/** Per-probe dispute rate, against the unflagged base rate. */
export function perProbe(rows) {
  const clean = rows.filter((r) => !r.flagged);
  const base = clean.length ? clean.filter((r) => r.disputed).length / clean.length : 0;

  const cells = {};
  for (const row of rows) {
    for (const code of row.fired) {
      const cell = cells[code] ?? { fired: 0, disputed: 0 };
      cell.fired += 1;
      if (row.disputed) cell.disputed += 1;
      cells[code] = cell;
    }
  }
  for (const [code, cell] of Object.entries(cells)) {
    cell.rate = cell.fired ? cell.disputed / cell.fired : null;
    cell.lift = base > 0 && cell.rate !== null ? cell.rate / base : null;
    cells[code] = cell;
  }
  return { base_rate: base, probes: cells };
}

/** The whole analysis, strata first. */
export function analyse(markets) {
  const rows = toRows(markets);
  const byVolume = terciles(rows);
  const nonSport = rows.filter((r) => !r.sport);

  return {
    n: rows.length,
    disputed: rows.filter((r) => r.disputed).length,
    strata: {
      all: compare(rows),
      non_sports: compare(nonSport),
      sports: compare(rows.filter((r) => r.sport)),
      volume_low: compare(byVolume.low),
      volume_mid: compare(byVolume.mid),
      volume_high: compare(byVolume.high),
      volume_high_non_sports: compare(byVolume.high.filter((r) => !r.sport)),
    },
    per_probe: perProbe(rows),
    headline: rows
      .filter((r) => r.flagged && r.disputed)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10),
  };
}
