#!/usr/bin/env node
/**
 * Run the admission grader over the adversarial corpus and report agreement
 * with the human label. This is the measurement the roast said should come
 * before the build, not after it.
 *
 *   node bin/grade.mjs            summary
 *   node bin/grade.mjs --verbose  every case with its defects
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { grade, explain, ADMIT, REFUSE } from "../src/grader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, "..", "corpus", "questions.json"), "utf8"));
const verbose = process.argv.includes("--verbose");

const results = corpus.cases.map((c) => {
  const result = grade(c.question, c.spec);
  return { ...c, result, agrees: result.decision === c.expect };
});

const refuseCases = results.filter((r) => r.expect === REFUSE);
const admitCases = results.filter((r) => r.expect === ADMIT);
const caught = refuseCases.filter((r) => r.agrees).length;
const cleanPassed = admitCases.filter((r) => r.agrees).length;
const falseRefusals = admitCases.length - cleanPassed;

if (verbose) {
  for (const r of results) {
    const mark = r.agrees ? "ok  " : "MISS";
    console.log(`\n[${mark}] ${r.id}  expect=${r.expect} got=${r.result.decision}`);
    console.log(`       "${r.question}"`);
    if (r.result.decision === REFUSE) {
      console.log(explain(r.result).split("\n").map((l) => `       ${l}`).join("\n"));
    }
  }
  console.log("");
}

const pct = (n, d) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(0)}%`);

console.log("Brier admission grader -- corpus result");
console.log("=======================================");
console.log(`cases                       ${results.length}`);
console.log(`unsettleable, refused       ${caught}/${refuseCases.length}  (${pct(caught, refuseCases.length)} caught)`);
console.log(`settleable, admitted        ${cleanPassed}/${admitCases.length}  (${pct(cleanPassed, admitCases.length)} passed)`);
console.log(`false refusals              ${falseRefusals}`);
console.log(`agreement with human label  ${pct(results.filter((r) => r.agrees).length, results.length)}`);

const historical = results.filter((r) => r.historical);
if (historical.length > 0) {
  console.log("\nHistorical disputed markets:");
  for (const h of historical) {
    console.log(`  ${h.result.decision === REFUSE ? "refused" : "ADMITTED"}  ${h.id}`);
    console.log(`    fired: ${h.result.fired.join(", ") || "none"}`);
  }
}

process.exit(results.every((r) => r.agrees) ? 0 : 1);
