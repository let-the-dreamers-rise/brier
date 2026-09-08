#!/usr/bin/env node
/**
 * Report the grader against Polymarket's realised dispute record.
 *
 *   node bin/disputes.mjs
 *
 * Reads corpus/closed-resolved.json, assembled from monthly windows of
 * gamma-api.polymarket.com with closed=true. Strata are printed before the
 * pooled figure on purpose: the pooled figure over a mixture is what made an
 * earlier version of this look like a result.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyse } from "../edge/disputes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const corpusPath = join(here, "..", "corpus", "closed-resolved.json");

const pct = (x) => (x === null ? "   n/a" : `${(100 * x).toFixed(1)}%`.padStart(6));
const num = (x, d = 2) => (x === null ? " n/a" : x.toFixed(d));

function line(label, c) {
  console.log(
    `  ${label.padEnd(24)}` +
      `flag n=${String(c.n_flagged).padStart(4)} ${pct(c.rate_flagged)}` +
      `   clean n=${String(c.n_clean).padStart(4)} ${pct(c.rate_clean)}` +
      `   lift ${(c.lift === null ? "n/a" : `${num(c.lift)}x`).padStart(6)}` +
      `   z ${num(c.z).padStart(6)}`,
  );
}

const cache = JSON.parse(readFileSync(corpusPath, "utf8"));
const out = analyse(cache.markets);

console.log(`corpus fetched ${cache.fetched_at}`);
console.log(
  `${out.n} resolved markets, ${out.disputed} disputed ` +
    `(${((100 * out.disputed) / out.n).toFixed(1)}%)\n`,
);

console.log("BY STRATUM -- read these before the pooled row");
line("non-sports", out.strata.non_sports);
line("sports", out.strata.sports);
line("volume low", out.strata.volume_low);
line("volume mid", out.strata.volume_mid);
line("volume high", out.strata.volume_high);
line("volume high, non-sports", out.strata.volume_high_non_sports);
console.log("");
line("POOLED (do not quote)", out.strata.all);

console.log("\nPER PROBE");
console.log(`  unflagged base rate ${pct(out.per_probe.base_rate)}`);
const probes = Object.entries(out.per_probe.probes).sort((a, b) => b[1].fired - a[1].fired);
for (const [code, cell] of probes) {
  console.log(
    `  ${code.padEnd(20)}fired ${String(cell.fired).padStart(4)}` +
      `   disputed ${String(cell.disputed).padStart(3)} ${pct(cell.rate)}` +
      `   lift ${(cell.lift === null ? "n/a" : `${num(cell.lift)}x`).padStart(6)}`,
  );
}

console.log("\nLARGEST FLAGGED MARKETS THAT WERE ACTUALLY DISPUTED");
for (const row of out.headline) {
  console.log(
    `  $${(row.volume / 1e6).toFixed(1)}M`.padStart(10) +
      `  [${row.fired.join(",")}]  ${row.question.slice(0, 70)}`,
  );
}
