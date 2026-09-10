# Brier

A market maker for the long tail of prediction markets, with a quoting risk
policy measured against 3,464 settled markets instead of guessed.

**On markets above $6.8M of volume, questions these checks flag were disputed
twice as often — 16.2% against 8.1%, z=3.33.** That holds with sports removed,
and it is measured against realised outcomes rather than anyone's opinion.
Below $6.8M there is no measurable effect. Both numbers are in the table below,
and the quoter uses only the checks that earned their place.

---

## The quoter

```bash
node bin/quote.mjs                  # the book it would post on Rain right now
node bin/quote.mjs --budget 50000   # the same book at a larger inventory
```

Reads Rain's live production markets through the Rain SDK and prints the quote
book it would post: which markets, which outcomes, bid, ask and size. It signs
nothing and sends nothing. Turning a line into an order is
`buildLimitBuyOptionTx`, which needs inventory and a key this code does not
hold.

On its latest run it quoted 19 of 30 live markets across 52 outcome legs. It
took three versions against live data to get there, each fixing what the last
one got wrong:

- **v1 quoted nothing.** It handled binary markets only, and most live markets
  had three to eight outcomes. Every outcome is now its own leg.
- **v2 would have given money away.** It quoted "by March 31, 2026" at 23.8% in
  September 2026. Outcome legs dated in the past are now dropped. Dates are read
  only when a month and a year are both named, because `Date.parse("100")` — a
  real Metascore bucket — is the year 100.
- **v3 states its limit.** Most quoted markets have a single participant, so
  the listed price is the creator's opening guess. Those are quoted wider. On
  most of the book there is no fair value independent of that guess yet.

The risk policy, in `mm/policy.mjs`, is the dispute table turned into rules,
each citing the lift it came from:

| check | dispute lift | what the quoter does |
|---|---|---|
| VAGUE_PREDICATE | 2.92x | does not quote |
| TEMPORAL_VAGUE | 1.55x | quotes wider |
| SUPERLATIVE_UNTIED | 1.10x | nothing — measured noise |
| MISSING_UNIT | 0.00x | nothing — fired 155 times, zero disputes |
| COMPOUND_CONDITION, UNBOUND_ENTITY | too few to measure | quotes wider |

---

## Where the risk policy comes from: does question wording predict disputes?

Polymarket's UMA record logs every proposal and dispute a market went through.
That is a realised outcome written by the protocol, on markets nobody here
authored or selected. So the question is answerable without anyone labelling
anything.

**3,464 settled markets. $26B of volume. 157 disputes.**

| stratum | flagged | disputed | clean | disputed | lift | z |
|---|---|---|---|---|---|---|
| non-sports | 632 | 4.6% | 1,964 | 4.7% | **0.98x** | -0.10 |
| sports | 55 | 16.4% | 813 | 3.3% | 4.93x | 4.70 |
| volume low (to $1.35M) | 327 | 1.2% | 827 | 0.5% | 2.53x | 1.36 |
| volume mid ($1.35–6.82M) | 193 | 3.6% | 961 | 3.6% | **1.00x** | -0.01 |
| volume high ($6.82M+) | 167 | 16.2% | 989 | 8.1% | 2.00x | 3.33 |
| volume high, non-sports | 144 | 15.3% | 749 | 8.7% | 1.76x | 2.45 |
| **pooled (do not quote)** | 687 | 5.5% | 2,777 | 4.3% | 1.29x | 1.41 |

Read the strata, not the pooled row. Pooling over a mixture is how the first
version of this fooled its author.

**What this says.** The effect is real and it is bounded. Above $6.8M of
volume flagged questions are disputed about twice as often, and that survives
removing sports (1.76x, z=2.45) — which is where the money and the disputes
both are. Below that threshold, and pooled across all sizes, there is nothing.
A checker that fires on a $200K market is not telling you anything I can
defend.

**A retraction.** An earlier cut over 500 markets read 2.03x at z=2.53 and
looked like a finding. That sample came from volume-ordered offset paging, so
it was the fattest books on the site. Drawn properly over monthly windows the
effect collapses to the table above. The 2.03x was wrong.

### Per check

| check | fired | disputed | rate | lift vs 4.3% base |
|---|---|---|---|---|
| TEMPORAL_VAGUE | 331 | 22 | 6.6% | 1.55x |
| SUPERLATIVE_UNTIED | 169 | 8 | 4.7% | 1.10x |
| MISSING_UNIT | 155 | 0 | 0.0% | **0.00x** |
| VAGUE_PREDICATE | 72 | 9 | 12.5% | **2.92x** |
| COMPOUND_CONDITION | 3 | 0 | 0.0% | — |
| UNBOUND_ENTITY | 1 | 0 | 0.0% | — |

One check carries most of the signal. Two fired hundreds of times and predicted
nothing. They are still in the code: removing a check invalidates the
pre-registered sample in `label/`, and the scorer refuses to report any number
once a check has moved, which is the point of building it that way.

### The largest flagged markets that were actually disputed

```
$242.2M  [TEMPORAL_VAGUE]     Will Zelenskyy wear a suit before July?
 $78.7M  [TEMPORAL_VAGUE]     Xi Jinping out in 2025?
 $65.4M  [TEMPORAL_VAGUE]     Will Polymarket US go live in 2025?
 $56.5M  [SUPERLATIVE_UNTIED] Trump ends Ukraine war in first 90 days?
 $51.8M  [TEMPORAL_VAGUE]     Israel x Iran ceasefire before July?
```

### Reproduce it

```bash
npm test              # 76 tests
node bin/disputes.mjs # the table above, from the committed corpus
```

The corpus is `corpus/closed-resolved.json`, assembled from monthly
`end_date` windows of `gamma-api.polymarket.com/markets?closed=true`.

---

## A second measurement, needing no labels at all

Polymarket publishes a `resolutionSource` field per market. It either holds a
fetchable URL or it does not. Counting that is a fact about their data.

Over 1,192 open markets holding $427M of liquidity:

- **76.1%** carry no fetchable resolution source — **89.9% of the liquidity**
- **72.5%** settle on human judgement ("a consensus of credible reporting")

```bash
node bin/survey.mjs --samples
```

---

## What is in here

| path | what it is |
|---|---|
| `src/spec.mjs` | the resolution contract: canonical serialisation, sha256, binding into a market description |
| `src/grader.mjs` | the admission checks |
| `src/settle.mjs` | unanimity gate — any disagreement abstains; a resolver that could not read its source is a hold, never a vote |
| `edge/disputes.mjs` | the dispute analysis |
| `mm/policy.mjs` | the quoting risk policy, each rule citing its measured lift |
| `mm/quoter.mjs` | read-only quote book from a live market listing |
| `label/` | a blind instrument for collecting labels the author cannot influence, with a pre-registered commitment |
| `corpus/` | the committed data, so the numbers reproduce |

---

## What is not claimed

- **No orders placed, no users, no volume.** The quoter is read-only.
- **No fair value yet on most of the book.** Where a market has one
  participant, the quote is centred on the creator's guess.
- **The strongest result may not transfer.** It is measured above $6.8M of
  volume. Zero of the 1,156 markets in that stratum are as small as a typical
  long-tail market.
- **The checks are lexical, not semantic.** They catch constructs that have
  produced disputes. They will miss a question that is ambiguous for a reason
  no check knows about.
- **`corpus/questions.json` passes 20/20 and proves nothing.** One author wrote
  both the questions and the checks. It is a regression test.
- **Unanimity gating is not mine.** arXiv 2605.30802 measured it first, at
  97.9% accuracy on 47% of questions. Cited, not claimed.
- **The dispute analysis is observational.** Question defects and disputes may
  share a cause — contentious topics attract both loose wording and motivated
  disputers. Nothing here establishes that fixing the wording prevents the
  dispute.

Named after Glenn Brier, who introduced the forecast verification score in 1950.
