#!/usr/bin/env node
/**
 * Survey live Polymarket markets for resolution-source quality.
 *
 * Why this exists: the corpus in corpus/questions.json was written by the same
 * author as the probes, so its 100% is circular and says nothing about unseen
 * questions. This script measures real markets that nobody here authored.
 *
 * The headline measurement needs no labelling at all. Polymarket exposes a
 * `resolutionSource` field per market. Either it holds a fetchable URL or it
 * does not. Counting that is a fact about their data, not a judgement about it,
 * so it cannot be circular.
 *
 *   node bin/survey.mjs --build     assemble the cache from corpus/raw/*.json
 *   node bin/survey.mjs             report over the cache
 *   node bin/survey.mjs --samples   also print example questions per bucket
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { grade } from "../src/grader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", "corpus");
const cachePath = join(cacheDir, "polymarket-live.json");

const API = "https://gamma-api.polymarket.com/markets";
const PAGES = 12;
const PER_PAGE = 100;

/** Phrases that hand settlement to human judgement rather than an instrument. */
const JUDGEMENT_PHRASES = Object.freeze([
  "consensus of credible reporting",
  "credible reporting",
  "a consensus",
  "resolver's discretion",
  "at the discretion",
  "widely reported",
  "generally accepted",
  "public consensus",
]);

/**
 * Assemble the cache from pages downloaded with curl into corpus/raw/.
 * Node's fetch is unavailable in some sandboxes, so the download step is
 * deliberately external and the raw pages are kept for reproducibility:
 *
 *   for i in $(seq 0 11); do curl -s \
 *     "https://gamma-api.polymarket.com/markets?limit=100&offset=$((i*100))\
 * &closed=false&order=liquidity&ascending=false" -o corpus/raw/page$i.json; done
 */
function assembleFromRaw() {
  const rawDir = join(cacheDir, "raw");
  if (!existsSync(rawDir)) throw new Error(`no raw pages at ${rawDir}`);
  const seen = new Map();
  for (const file of readdirSync(rawDir).filter((f) => f.endsWith(".json"))) {
    const batch = JSON.parse(readFileSync(join(rawDir, file), "utf8"));
    if (!Array.isArray(batch)) continue;
    for (const market of batch) seen.set(market.id, slim(market));
  }
  return [...seen.values()];
}

function slim(m) {
  return {
    id: m.id,
    question: m.question ?? "",
    description: m.description ?? "",
    resolutionSource: m.resolutionSource ?? "",
    endDate: m.endDate ?? "",
    liquidity: Number(m.liquidity ?? 0),
    volume: Number(m.volume ?? 0),
  };
}

function isFetchableSource(source) {
  return /^https?:\/\/\S+$/i.test(String(source).trim());
}

function usesJudgement(description) {
  const text = String(description).toLowerCase();
  return JUDGEMENT_PHRASES.some((phrase) => text.includes(phrase));
}

/** Build the spec Polymarket's own fields would produce, and grade it. */
function specFromMarket(m) {
  return {
    question: m.question,
    source: isFetchableSource(m.resolutionSource) ? m.resolutionSource.trim() : undefined,
    selector: undefined,
    observed_at: /Z$/.test(m.endDate) ? m.endDate : undefined,
    void_if: undefined,
    fallback: "abstain",
  };
}

function report(markets, showSamples) {
  const n = markets.length;
  const money = markets.reduce((sum, m) => sum + m.liquidity, 0);

  const noSource = markets.filter((m) => !isFetchableSource(m.resolutionSource));
  const judgement = markets.filter((m) => usesJudgement(m.description));
  const noSourceMoney = noSource.reduce((sum, m) => sum + m.liquidity, 0);
  const judgementMoney = judgement.reduce((sum, m) => sum + m.liquidity, 0);

  const graded = markets.map((m) => ({ m, g: grade(m.question, specFromMarket(m)) }));
  const refused = graded.filter((r) => r.g.decision === "REFUSE");
  const unrewritable = graded.filter((r) => r.g.defects.some((d) => !d.fixable));
  const unrewritableMoney = unrewritable.reduce((sum, r) => sum + r.m.liquidity, 0);

  const probeCounts = graded.reduce((acc, r) => {
    for (const code of r.g.fired) acc[code] = (acc[code] ?? 0) + 1;
    return acc;
  }, {});

  const pct = (x, total) => (total === 0 ? "n/a" : `${((100 * x) / total).toFixed(1)}%`);
  const usd = (x) => `$${(x / 1e6).toFixed(1)}M`;

  console.log("Live Polymarket markets -- resolution source survey");
  console.log("===================================================");
  console.log(`markets sampled            ${n}  (open, ranked by liquidity)`);
  console.log(`liquidity represented      ${usd(money)}`);
  console.log("");
  console.log("NO LABELLING INVOLVED -- these are facts about Polymarket's own fields:");
  console.log(`  no fetchable resolutionSource   ${noSource.length}/${n}  (${pct(noSource.length, n)})`);
  console.log(`  ...as a share of liquidity      ${usd(noSourceMoney)}  (${pct(noSourceMoney, money)})`);
  console.log(`  settles on human judgement      ${judgement.length}/${n}  (${pct(judgement.length, n)})`);
  console.log(`  ...as a share of liquidity      ${usd(judgementMoney)}  (${pct(judgementMoney, money)})`);
  console.log("");
  console.log("GRADER, run on question text with the spec Polymarket's fields imply:");
  console.log(`  refused                         ${refused.length}/${n}  (${pct(refused.length, n)})`);
  console.log(`  refused unrewritably            ${unrewritable.length}/${n}  (${pct(unrewritable.length, n)})`);
  console.log(`  ...as a share of liquidity      ${usd(unrewritableMoney)}  (${pct(unrewritableMoney, money)})`);
  console.log("");
  console.log("probe firing rate:");
  for (const [code, count] of Object.entries(probeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(20)} ${String(count).padStart(4)}  ${pct(count, n)}`);
  }

  if (showSamples) {
    console.log("\nHighest-liquidity markets with no fetchable source:");
    for (const m of [...noSource].sort((a, b) => b.liquidity - a.liquidity).slice(0, 8)) {
      console.log(`  ${usd(m.liquidity).padStart(7)}  ${m.question}`);
      const phrase = JUDGEMENT_PHRASES.find((p) => m.description.toLowerCase().includes(p));
      if (phrase) console.log(`           settles on: "${phrase}"`);
    }
    console.log("\nHighest-liquidity markets the grader refuses unrewritably:");
    for (const r of [...unrewritable].sort((a, b) => b.m.liquidity - a.m.liquidity).slice(0, 8)) {
      const worst = r.g.defects.find((d) => !d.fixable);
      console.log(`  ${usd(r.m.liquidity).padStart(7)}  ${r.m.question}`);
      console.log(`           ${worst.code}: ${worst.detail.slice(0, 90)}`);
    }
  }
}

if (process.argv.includes("--build")) {
  const markets = assembleFromRaw();
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify({ fetched_at: new Date().toISOString(), markets }, null, 1));
  console.error(`assembled ${markets.length} unique markets into ${cachePath}`);
}

if (!existsSync(cachePath)) {
  console.error("no cache -- download pages with curl, then: node bin/survey.mjs --build");
  process.exit(1);
}

const cache = JSON.parse(readFileSync(cachePath, "utf8"));
console.log(`cache fetched ${cache.fetched_at}\n`);
report(cache.markets, process.argv.includes("--samples"));
