# Brier

Decides whether a prediction market can be settled, before it opens.

**On markets above $6.8M of volume, questions these checks flag were disputed
twice as often — 16.2% against 8.1%, z=3.33.** That holds with sports removed,
and it is measured against realised outcomes rather than anyone's opinion:
3,464 settled Polymarket markets and the UMA record of which ones actually blew
up. Below $6.8M there is no measurable effect. Both numbers are in the table.

---

## Does question wording predict that a market gets disputed?

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
| `edge/disputes.mjs` | the analysis above |
| `label/` | a blind instrument for collecting labels the author cannot influence, with a pre-registered commitment |
| `corpus/` | the committed data, so the numbers reproduce |

---

## What is not claimed

- **No users, no volume, no deployed contract.** None of this is in production.
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
