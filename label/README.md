# Outside labelling

The corpus in `corpus/questions.json` scores 20/20 and is worth nothing. The
same person wrote the questions and the probes, so it measures whether the
author is internally consistent, which was never in doubt. Every claim about
the admission grader rests on labels produced by someone who is not the author,
under conditions the author cannot adjust afterwards.

This directory is that procedure. It is deliberately boring and mostly
mechanical, because the value is in what it forbids.

## The procedure

```bash
node bin/label.mjs draw --seed "some words you commit to in public"
```

Draws 60 questions from the 1,187 live Polymarket markets in
`corpus/polymarket-live.json`, freezes what the grader says about each, and
writes two files to `label/out/`:

- `prereg-<seed>.json` — the commitment. Check it in before sending anything out.
- `form-<seed>.html` — the form. Open it in any browser; nothing is uploaded.

Send the form to **at least two** people who did not write the probes. Then:

```bash
node bin/label.mjs score label/out/prereg-<seed>.json sheet-a.json sheet-b.json
```

## What stops this from being circular

**The labeller cannot see the verdict.** The form contains the question, the
market's own resolution text, its liquidity and close date. No verdict, no
probe names, no counts, no framing. `formItems` whitelists fields rather than
blacklisting them, so a field added to the corpus later cannot leak by default,
and a test asserts that no probe code appears in the rendered HTML.

**The question asked is not "is this ambiguous".** That invites the labeller to
reverse-engineer the probe list. They are asked whether two independent people
paid to settle the market would return the same answer — a prediction about
disputes, answerable by someone who has never heard of this project, and
checkable later against what actually happened.

**The grader cannot move afterwards.** `score` re-derives every prediction from
the grader as it currently stands and refuses to print anything if one changed.
Editing a probe after seeing labels does not produce a better number; it
produces a hard failure naming the markets whose verdict moved. Forgery of the
commitment document and drift of the grader underneath it are detected
separately and reported as different failures.

**The draw is seeded and the seed is published.** Re-rolling until the sample
looks friendly would change the seed.

**Human-human agreement is printed first.** It is the ceiling. If two labellers
only agree with each other at kappa 0.4, a grader agreeing with them at 0.4 is
not a weak result, it is the task's noise floor. A grader-human number quoted
without that ceiling is not interpretable, so the tool refuses to present one
that way.

**Accuracy is not reported at all.** The draw is balanced on the grader's own
verdict, so sample prevalence is a design choice. An accuracy figure would
describe the draw, not the grader.

## What this still will not prove

The outcome measured is *predicted* disagreement, not realised disputes. The
asset actually worth owning is a corpus tied to markets that did in fact get
disputed, and that requires waiting for these markets to close. This is the
instrument for the first half.

The grader's structural half (`SPEC_INVALID`: no source, no void branch) is
excluded from the test. It refuses all 1,192 surveyed markets because Polymarket
has no such fields — an artifact of their schema, not a finding about their
questions, and nothing a human can label.

Only the probes that actually fire on the drawn sample can be tested. On the
first draw that is three of six: `TEMPORAL_VAGUE` (15), `SUPERLATIVE_UNTIED`
(12), `VAGUE_PREDICATE` (3). `MISSING_UNIT`, `COMPOUND_CONDITION` and
`UNBOUND_ENTITY` do not appear and remain untested by that draw.

Sixty items across two labellers is small. Treat a first result as a smoke
signal, not a finding.

## The first draw

```
seed        rain-admission-2026-09-09
pool        1,187 markets (liquidity >= $1,000, question >= 20 chars)
strata      989 no probe fires / 198 at least one fires
drawn       30 + 30, interleaved
commitment  02a68ba3fccab3b6dc8dea4bb008ed5400339a6038699907ff06bb41714c4e38
```
