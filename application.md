# Rain Builder Grant — Application Draft

Form: the "Apply for a Grant" block at rain.one (Builder Grants).
Fields: Project Name*, The Concept*, Website URL, Contact Email*, Telegram Handle, X Handle.

Status: **draft, not submitted.** Email, Telegram and X are yours to fill.

---

## Project Name

```
Brier
```

---

## The Concept

> ~640 words. The previous draft was 1,580 and led with someone else's paper.

```
Brier decides whether a prediction market can be settled, before it opens, and
leaves a receipt that the losing side can check.

WHAT I MEASURED

I tested whether the wording of a question predicts that the market actually
gets disputed. Not my judgement of "ambiguous" -- Polymarket's own UMA record,
which logs every proposal and dispute a market went through. 3,464 settled
markets, $26B of volume, realised outcomes, nothing labelled by me.

  markets above $6.8M volume     16.2% disputed when flagged vs 8.1%   2.00x  z=3.33
  the same, excluding sports     15.3% vs 8.7%                         1.76x  z=2.45
  vague predicates              ("agrees", "announces", "significant")
                                 12.5% vs 4.3%                         2.92x
  all 3,464 pooled                5.5% vs 4.3%                         1.29x  z=1.41
  non-sports pooled               4.6% vs 4.7%                         0.98x

The last two rows are null results and I am reporting them because they are
mine. Two of my six checks fired 155 and 169 times and predicted nothing; I
deleted them. An earlier cut of this over 500 markets read 2.03x and looked
like a finding -- that sample was volume-ordered, and the effect did not
survive a proper draw. The analysis reproduces from a committed corpus in the
repo.

WHERE THIS DOES NOT APPLY TO RAIN -- SAID FIRST, NOT IN A FOOTNOTE

That effect lives above $6.8M of volume, median $15.5M. Rain's marquee market
did $1.3M and the long tail does $40K-$300K, which sits in the band where I
measure no effect at all (1.00x). Zero of the 1,156 markets in my strongest
stratum are as small as Rain's largest.

So I am not claiming Brier prevents disputes on Rain today. At Rain's size,
disputes are roughly 1% and neither I nor anyone else can show a filter helps.
Anyone who tells you otherwise has not run the numbers.

WHAT IS ACTUALLY RELEVANT TO RAIN NOW

The 0.5%-of-volume rebate is paid from the token allocation to whoever
generates volume, and market creation is already automated by your SDK. That
is a standing invitation for agents to mint junk markets and trade them
against each other. Rain's near-term risk is not disputes. It is the rebate
being farmed, with the token allocation paying for it.

Brier is the admission check and the receipt. Every market carries a signed
spec -- source, the exact field, the observation instant in UTC, comparator,
tie-break, and the conditions under which it voids -- hashed into
marketDescription, a field the SDK already has, so this needs no protocol
change. Markets that cannot be settled are refusable at creation, and honest
volume becomes distinguishable from cycled volume. It defends the grant budget
instead of mining it.

The second-order effect is the one that matters commercially: a market maker
will not quote a book whose resolution risk they cannot price. That is why
your long tail is thin while $100M of liquidity sits committed. Liquidity is
not your bottleneck; quotable supply is.

WHAT ALREADY RUNS

spec.mjs (canonical serialisation, sha256, binding into marketDescription),
grader.mjs (admission checks, calibrated and pruned against the dispute data
above), settle.mjs (unanimity gate: any disagreement abstains, a resolver that
could not read its source is a hold and never a vote), plus the dispute
analysis and a blind labelling instrument. 76 tests. Unanimity gating is not
my invention -- arXiv 2605.30802 measured it first at 97.9% on 47% of
questions. I cite it rather than claim it, and Brier stays compatible with
whatever resolver a platform already runs, which makes Cournot a customer and
not a competitor.

WHAT I HAVE NOT DONE

No users, no volume, no deployed contract, and not one line of Rain SDK code
executed. Everything above was measured on Polymarket because your API sits
behind a bot challenge I will not work around. Closing that gap is milestone
one, and it is the first thing the money buys.
```

### Short version — 899 characters, verified

```
Brier decides whether a market can be settled before it opens, and leaves a
receipt.

I tested question wording against Polymarket's UMA dispute record: 3,464
settled markets, $26B volume, realised outcomes, nothing labelled by me. Above
$6.8M volume, flagged questions were disputed 16.2% vs 8.1% (2.00x, z=3.33).
Pooled across all sizes it is 1.29x and not significant -- I report the null
because it is mine, and I deleted two checks that predicted nothing.

That effect is measured above $6.8M. Rain's biggest market was $1.3M, so I do
not claim it prevents disputes on Rain today.

What is relevant now: a 0.5% volume rebate plus automated market creation
invites agents to farm it with junk markets. Brier signs a resolution spec into
marketDescription -- no protocol change -- so unsettleable markets are
refusable at creation and honest volume is legible.

76 tests. No users, no deployment yet.
```

---

## The ask, milestones, and use of funds

> The form has no field for this. Put it in the Concept box if it fits, and in
> the first message to whoever replies. The previous draft named no amount and
> no deliverable, which is the single most common reason a grant is declined.

**Asking $18,000 over 8 weeks.** Grants go to $50K; this is deliberately the
smallest amount that answers the open question, because the open question is
whether any of this transfers to Rain at all.

| # | Weeks | Deliverable | Verifiable by | $ |
|---|---|---|---|---|
| 1 | 1–2 | The dispute analysis re-run on **Rain's own** resolution history. Public report, same method, including a null result if that is what it shows. | Published notebook + committed corpus | 4,000 |
| 2 | 3–5 | 50 markets created on Rain mainnet via `buildCreateMarketTx`, each carrying a signed spec hash in `marketDescription`. Public receipt page per market with source bytes and their sha256. | On-chain market IDs + contract addresses | 7,000 |
| 3 | 6–8 | Resolution-risk score published for every open Rain market, and a measurement of whether scored markets attract deeper books than unscored ones. | Public dashboard + the raw comparison | 7,000 |

**Use of funds**

| Line | $ |
|---|---|
| 8 weeks of build time, sole developer | 12,000 |
| Infrastructure: resolver fetch nodes, archival storage of source bytes, receipt hosting | 3,000 |
| Mainnet gas and USDT seed liquidity for the 50 milestone-2 markets | 2,000 |
| External review of the resolution spec schema by someone who is not me | 1,000 |
| **Total** | **18,000** |

**Kill criterion.** If milestone 1 shows no relationship between question
defects and disputes on Rain's own history, I will publish that result saying
so plainly and return the unspent balance. I would rather hand back $14,000
than spend it proving something I already measured as false on a bigger
dataset.

**What I need from Rain that is not money:** API access for `getPublicMarkets`
and `getMarketDetails`, and a subgraph key. Milestone 1 is blocked without it —
`prod-api.rain.one` returns 403 to an unauthenticated client and I am not going
to route around a bot challenge to get your own data.

---

## Website URL

```
(deploy web/index.html first — see below)
```

> The current link is a **private claude.ai artifact**. A reviewer clicking it
> gets a login wall, which ends the application on the spot. Before submitting,
> from `brier/web`: `vercel deploy --prod --yes`. A real domain reads as a
> project; a claude.ai link reads as a mockup.

## Contact Email / Telegram / X

```
(yours — the Whitechain application used ashwingoyal2006@gmail.com and @AshwinGo)
```

---

## Risks, and what I would do about them

> The previous draft had a "Deliberately not claimed" section that read as a
> list of reasons to decline. Same facts, stated as a builder would state them.

**The mechanism is cloneable.** Admission screening is a lint; Rain or Cournot
could ship one in a sprint. What is not cloneable in a sprint is the calibration
set — 3,464 settled markets tied to realised UMA dispute outcomes, which is what
told me two of my own six checks were worthless. Anyone can write probes. The
asset is knowing which ones survive contact with settled money. That set grows
every month and I am the only one publishing it.

**Cournot is funded and shipping.** They work at the exit and inherit whatever
question they are handed. A better resolver does not fix an unanswerable
question, the same way a faster runtime does not fix a type error. If they ship
admission screening first, I lose — stated plainly, and it is the main reason to
fund the 8-week version rather than a 6-month one.

**The rebate is paid in RAIN, from the token allocation.** In July 2026 RAIN
traded near 75x its own product's TVL against roughly $7B of team-controlled
supply. I am not modelling that as cash and neither should you. The 0.5% is an
alignment mechanism, not my revenue plan, and I have not put a revenue
projection in this application because 0.5% of a long-tail vertical is small
money for a long time and you can do that arithmetic yourself.

**My strongest result may not transfer.** It is measured above $6.8M of volume
and Rain has nothing that large. Milestone 1 exists to find out, and the kill
criterion above says what happens if the answer is no.

**The 20-question corpus in the repo passes 20/20 and proves nothing.** One
author wrote both the questions and the checks. It is a regression test. The
dispute analysis is the evidence; that is a regression test.

---

## Facts used, with sources

| Claim | Source |
|---|---|
| `buildCreateMarketTx` takes free-text question/description plus one AI-resolver boolean; no structured resolution field | github.com/rain1-labs/rain-sdk README |
| `isDisputed`, `isAppealed`, `resolverIsAI`, `oracleEndTime` exist on market details | same |
| `prod-api.rain.one`; `getPublicMarkets` / `getMarketDetails` are API-backed, price history needs a subgraph key | same |
| $5M program, $3M builders, grants to $50K, flat 0.5% volume share from token allocation | The Block, 20 Mar 2026 |
| TVL $100.1M, volume $142.4M, 36.6K users (13 Aug 2026) | DefiLlama |
| World Cup market $1.3M; next ten $40K–$300K | Weiss Ratings, 14 Jul 2026 |
| UMA attack: 9%→100% on 5M UMA across 3 accounts | Orochi Network |
| WSJ: >50% of votes from ten wallets in most disputed markets | crypto.news summary |
| Unanimity gating at 97.9% on 47% of questions | arXiv 2605.30802 |
| 3,464 settled markets, $26B volume, dispute lift by stratum | `bin/disputes.mjs` over gamma-api.polymarket.com, corpus committed at `corpus/closed-resolved.json` |
| 1,192 live markets, $427M, 76.1% with no fetchable resolution source | `bin/survey.mjs`, corpus at `corpus/polymarket-live.json` |
