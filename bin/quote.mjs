#!/usr/bin/env node
/**
 * Print the quote book Brier would post on Rain right now. Read-only.
 *
 *   node bin/quote.mjs                    live, $1,000 of inventory
 *   node bin/quote.mjs --budget 50000     what the grant would deploy
 *   node bin/quote.mjs --save             also write the snapshot and book
 *
 * Nothing is signed or sent. Turning a line of this book into an order is
 * buildLimitBuyOptionTx on the Rain SDK, which needs inventory and a key.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Rain } from "@buidlrrr/rain-sdk";
import { buildBook } from "../mm/quoter.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

async function liveMarkets() {
  const rain = new Rain({ environment: "production" });
  const seen = new Map();
  for (const sortBy of ["Liquidity", "latest", "Volumn"]) {
    for (let offset = 0; offset < 1000; offset += 100) {
      let batch;
      try {
        batch = await rain.getPublicMarkets({ limit: 100, offset, sortBy, status: "Live" });
      } catch {
        break;
      }
      if (!Array.isArray(batch) || batch.length === 0) break;
      let fresh = 0;
      for (const m of batch) if (!seen.has(m._id)) { seen.set(m._id, m); fresh += 1; }
      if (batch.length < 100 || fresh === 0) break;
    }
  }
  return [...seen.values()];
}

const budget = Number(flag("budget", 1000));
const markets = await liveMarkets();
const book = buildBook(markets, { budget, maxShare: 0.1 });
const pct = (x) => `${(100 * x).toFixed(1)}`.padStart(5);

console.log(`Rain production, ${new Date().toISOString()}`);
console.log(`live markets considered   ${book.considered}`);
console.log(`quoted                    ${book.quoted}`);
console.log(`inventory                 $${book.budget.toLocaleString()}` +
  `   deployed $${Math.round(book.deployed).toLocaleString()}` +
  `   held back $${Math.round(book.undeployed).toLocaleString()}\n`);

console.log("NOT QUOTED, and why");
for (const [reason, n] of Object.entries(book.skip_reasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${reason}`);
}

console.log("\nTHE BOOK   (prices in %, size in USD per market)");
for (const q of [...book.book].sort((a, b) => b.sizeUSD - a.sizeUSD).slice(0, 15)) {
  console.log(`\n  $${String(Math.round(q.sizeUSD)).padStart(4)}  ${q.participants} participants` +
    `  ${q.outcomes}-outcome  ${q.question.slice(0, 60)}` + (q.reasons.length ? "  [widened]" : ""));
  for (const leg of q.legs) {
    console.log(`         ${leg.name.slice(0, 22).padEnd(22)} mid ${pct(leg.mid)}   bid ${pct(leg.bid)}   ask ${pct(leg.ask)}`);
  }
}
if (book.book.length > 15) console.log(`\n  ... and ${book.book.length - 15} more markets`);
const legs = book.book.reduce((a, q) => a + q.legs.length, 0);
console.log(`\n${legs} outcome quotes across ${book.quoted} markets`);

if (process.argv.includes("--save")) {
  const out = join(here, "..", "mm", "out");
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(join(out, `book-${stamp}.json`), JSON.stringify(book, null, 1));
  console.log(`\nsaved mm/out/book-${stamp}.json`);
}
