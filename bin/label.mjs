#!/usr/bin/env node
/**
 * Collect outside labels for the admission grader.
 *
 * The corpus in corpus/questions.json scores 20/20 and is worth nothing as
 * evidence, because the same person wrote the questions and the probes. This
 * is the fix, and it is procedural rather than clever:
 *
 *   node bin/label.mjs draw --seed <words>     draw a sample, freeze the
 *                                              grader's predictions, emit a
 *                                              blind form
 *   node bin/label.mjs score <prereg> <sheets...>
 *                                              score returned sheets, but only
 *                                              if the grader has not moved
 *
 * Draw once, send the form to at least two people who did not write the
 * probes, and score what comes back. Two labellers is the minimum that means
 * anything: with one you cannot tell a bad grader from a hard task.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { drawSample } from "../label/sample.mjs";
import { preregister } from "../label/protocol.mjs";
import { renderForm } from "../label/form.mjs";
import { score } from "../label/score.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const corpusPath = join(root, "corpus", "polymarket-live.json");
const outDir = join(root, "label", "out");

function loadCorpus() {
  const cache = JSON.parse(readFileSync(corpusPath, "utf8"));
  return cache.markets;
}

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function pct(x) {
  return x === null || x === undefined ? "  n/a" : `${(100 * x).toFixed(1)}%`;
}

function kap(k) {
  return k === null || k === undefined ? " n/a" : k.toFixed(3);
}

function draw() {
  const seed = flag("seed");
  if (!seed) {
    console.error("a seed is required: --seed 'some words you commit to'");
    process.exit(2);
  }
  const markets = loadCorpus();
  const perStratum = Number(flag("per-stratum", 30));
  const minLiquidity = Number(flag("min-liquidity", 1000));

  const { items, provenance } = drawSample({ markets, seed, perStratum, minLiquidity });
  const prereg = preregister(items, provenance);

  mkdirSync(outDir, { recursive: true });
  const preregPath = join(outDir, `prereg-${seed}.json`);
  const formPath = join(outDir, `form-${seed}.html`);
  writeFileSync(preregPath, JSON.stringify(prereg, null, 1));
  writeFileSync(formPath, renderForm({ markets: items, seed }));

  const differ = prereg.predictions.filter((p) => p.predicts === "DIFFER").length;
  console.log(`drew ${items.length} questions from a pool of ${provenance.pool_size}`);
  console.log(`  strata in pool     no_probe ${provenance.stratum_sizes.no_probe}, ` +
    `probe_fires ${provenance.stratum_sizes.probe_fires}`);
  console.log(`  drawn              no_probe ${provenance.drawn.no_probe}, ` +
    `probe_fires ${provenance.drawn.probe_fires}`);
  console.log(`  grader predicts    DIFFER on ${differ}, SAME on ${items.length - differ}`);
  console.log(`\ncommitment  ${prereg.hash}`);
  console.log(`prereg      ${preregPath}`);
  console.log(`form        ${formPath}`);
  console.log("\nSend the form to at least two people who did not write the probes.");
  console.log("Do not tell them what the grader said. That is the whole experiment.");
}

function runScore() {
  const [, , , preregArg, ...sheetArgs] = process.argv;
  if (!preregArg || sheetArgs.length === 0) {
    console.error("usage: node bin/label.mjs score <prereg.json> <sheet.json> [more...]");
    process.exit(2);
  }
  const prereg = JSON.parse(readFileSync(resolve(preregArg), "utf8"));
  const sheets = sheetArgs.map((path) => JSON.parse(readFileSync(resolve(path), "utf8")));
  const marketsById = new Map(loadCorpus().map((m) => [String(m.id), m]));

  const result = score({ prereg, marketsById, sheets });

  if (!result.ok) {
    console.error("REFUSING TO SCORE.\n");
    console.error(result.reason);
    console.error(`\n  prereg file intact   ${result.file_intact ? "yes" : "NO"}`);
    console.error(`  grader unchanged     ${result.grader_stable ? "yes" : "NO"}`);
    if (!result.file_intact) {
      console.error(`  committed hash       ${result.committed_hash}`);
      console.error(`  rebuilt hash         ${result.rebuilt_hash}`);
    }
    if (result.changed.length > 0) {
      console.error(`\n${result.changed.length} market(s) changed verdict:`);
      for (const change of result.changed.slice(0, 20)) {
        console.error(`  ${change.id}  ${change.reason}`);
      }
      if (result.changed.length > 20) {
        console.error(`  ... and ${result.changed.length - 20} more`);
      }
    }
    process.exit(1);
  }

  console.log(`commitment verified  ${result.committed_hash}`);
  console.log(`labellers            ${result.labellers.join(", ")}\n`);

  console.log("HUMAN vs HUMAN -- this is the ceiling, read it first");
  if (result.human_vs_human.length === 0) {
    console.log("  only one labeller: no ceiling, and no way to tell a bad");
    console.log("  grader from a hard task. Get a second person.\n");
  } else {
    for (const pair of result.human_vs_human) {
      console.log(`  ${pair.between.join(" vs ")}`.padEnd(34) +
        `kappa ${kap(pair.kappa)}  agree ${pct(pair.observed)}  n=${pair.n}` +
        (pair.abstain_either ? `  (${pair.abstain_either} abstained)` : ""));
    }
    console.log("");
  }

  console.log("GRADER vs EACH LABELLER");
  for (const row of result.grader_vs_labeller) {
    console.log(`  ${row.labeller}`.padEnd(34) +
      `kappa ${kap(row.kappa)}  agree ${pct(row.observed)}  n=${row.n}` +
      (row.abstained ? `  (${row.abstained} abstained)` : ""));
  }
  const m = result.grader_vs_majority;
  console.log(`  ${"majority"}`.padEnd(34) +
    `kappa ${kap(m.kappa)}  agree ${pct(m.observed)}  n=${m.n}\n`);

  console.log("  confusion vs majority (grader | human):");
  for (const [cell, count] of Object.entries(m.confusion).sort()) {
    console.log(`    ${cell.padEnd(24)} ${count}`);
  }

  console.log("\nPER PROBE -- which probes outside labellers actually back");
  const probes = Object.entries(result.per_probe).sort((a, b) => b[1].fired - a[1].fired);
  if (probes.length === 0) console.log("  no probe fired on any labelled item");
  for (const [code, cell] of probes) {
    const rate = cell.fired ? pct(cell.backed / cell.fired) : "  n/a";
    console.log(`  ${code.padEnd(20)} fired ${String(cell.fired).padStart(3)}  ` +
      `backed ${String(cell.backed).padStart(3)} (${rate})  ` +
      `contradicted ${cell.contradicted}  abstained ${cell.abstained}`);
  }

  console.log("\nEFFECT OF SEEING THE RESOLUTION TEXT");
  console.log(`  question only     kappa ${kap(result.by_exposure.question_only.kappa)}  ` +
    `n=${result.by_exposure.question_only.n}`);
  console.log(`  saw resolution    kappa ${kap(result.by_exposure.saw_description.kappa)}  ` +
    `n=${result.by_exposure.saw_description.n}`);

  console.log("\nAccuracy is deliberately not reported: the draw is balanced on the");
  console.log("grader's own verdict, so any accuracy figure would describe the draw.");
}

const command = process.argv[2];
if (command === "draw") draw();
else if (command === "score") runScore();
else {
  console.error("usage:");
  console.error("  node bin/label.mjs draw --seed <words> [--per-stratum 30] [--min-liquidity 1000]");
  console.error("  node bin/label.mjs score <prereg.json> <sheet.json> [more...]");
  process.exit(2);
}
