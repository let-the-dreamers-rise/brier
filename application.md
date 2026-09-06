# Rain Builder Grant — Application Draft

Form: the "Apply for a Grant" block at rain.one (Builder Grants).
Fields: Project Name*, The Concept*, Website URL, Contact Email*, Telegram Handle, X Handle.

Status: **draft, not submitted.** The email, Telegram and X fields are yours to fill.

---

## Project Name

```
Brier
```

---

## The Concept

> The form asks: *"Describe your idea and how it utilizes the protocol."*
> Long version below; a 900-character version follows if the field is capped.

```
Brier is the admission layer for agent-created prediction markets. A market that
cannot be settled never opens.

THE CEILING

Every oracle in this market works at the exit, on a question that already has
money on it, and there is a measured limit to how far that can go. The most
recent evaluation of multi-agent AI oracles (arXiv 2605.30802, 1,189 KalshiBench
questions) reports:

  best architecture             83.4%   (deliberation made it worse, 76.1%)
  Companies / Crypto / Econ     58-67%  "resist improvement regardless of
                                         architecture"
  hard core                     13.8%   164 of 1,189 resist correction by ANY
                                         multi-agent approach
  ensemble error correlation    r=.53-.69  "a fundamental limit on
                                            ensemble-based approaches"
  unanimous + high confidence   97.9%   but on only 47% of the set

There is a floor of questions no resolver will ever get right, and it is a
property of the question, not the resolver. The only place to raise that floor is
before the market opens.

THE DOOR IS UNOCCUPIED

The same paper states what nobody is doing, in its own words: "No admission-time
screening is proposed or implemented ... questions fundamentally unsuitable for
automated resolution are identified through error analysis post-hoc rather than
filtered pre-resolution."

At the exit, the field is crowded and funded -- Cournot (YZi Labs, live as the
resolution layer for 42), UMA, Kleros + Reality.eth, Tellor. At the door there is
nobody. Kalshi comes closest, by having lawyers draft contract terms per market
and file them with the CFTC, each naming a Source Agency. That is correct and it
cannot scale to markets an agent writes from a prompt.

This makes Cournot a customer rather than a competitor. A better resolver still
inherits whatever question it is handed. Brier improves the input to all of them,
the way a type checker does not compete with the runtime.

THE GAP ON RAIN

Rain's SDK lets an agent turn a prompt into a live market. buildCreateMarketTx
takes marketQuestion and marketDescription as free text, plus one boolean,
isPublicPoolResolverAi. There is no structured field for how the market is
settled: no resolution source, no data field, no observation timestamp, no
tie-break, no ambiguity branch. Market creation has been industrialised. Market
resolution is still prose.

That matters because resolution is where prediction markets actually lose money.
A governance attack moved Polymarket's Ukraine mineral-deal market from 9% to
100% and settled "Yes" with no agreement in place, on 5M UMA cast across three
accounts. The WSJ found that in most disputed Polymarket markets, over half the
votes came from ten wallets. Traders sued over a UMA resolution in July 2026.
Every one of those happened where a careful human wrote the rules text. Rain
generates that text from a prompt.

WHAT BRIER DOES

1. Resolution contract. Every market created through Brier carries a signed,
   structured spec: the source, the exact field to read, the observation
   timestamp in UTC, the comparator, the tie-break, and the explicit conditions
   under which the market voids. The spec is hashed and the hash is written into
   marketDescription, so the rules cannot be reinterpreted after the fact. This
   requires no protocol change — it rides in a field Rain already has.

2. Admission grading. Before a market opens, Brier dry-runs the spec against the
   live source and confirms it returns exactly one well-typed value. Then it
   attacks the question: enumerate the plausible readings and check whether the
   spec picks out exactly one. If two readings survive, the question is
   underspecified and is rejected with the defect named. Bad markets never open.

3. Settlement is deliberately NOT the pitch. The unanimity gate is built and
   correct -- unanimous settles with a receipt, anything less abstains and
   escalates with evidence attached, and a resolver that could not read the
   source counts as a hold rather than a vote. But that mechanism is published
   prior art (the same paper measures it at 97.9% on 47%) and it is a funded
   competitor's core product. Brier cites it instead of claiming it, and stays
   compatible with whatever resolver a platform already runs.

4. Receipts. Spec hash, source bytes hash, fetch timestamps, every verdict, the
   final action. The losing side can verify the settlement without trusting us.

HOW IT USES THE PROTOCOL

Brier is a platform, not an oracle sitting outside the flow. Markets are created
and traded through it on Rain rails: buildCreateMarketTx, buildBuyOptionRawTx,
buildLimitBuyOptionTx, buildResolveMarketTx, buildClaimTx, with RainAA for
account abstraction and sponsored gas, and subscribeToMarketEvents for live
pricing. It generates volume and earns the 0.5% share. It plugs into the existing
dispute path rather than replacing it: isDisputed and isAppealed already exist,
and Brier's abstention is what should set them.

WHY IT HELPS RAIN SPECIFICALLY

A 0.5%-of-volume rebate paid from the token allocation invites wash trading —
agents cycling volume against each other to farm it. Brier's receipts make honest
volume legible and self-dealing obvious. It defends the grant budget instead of
mining it. And it makes the long tail safe enough for a market maker to quote,
which is the actual constraint: Rain's marquee World Cup market did $1.3M and the
next ten did $40K–$300K, against $100M of committed liquidity. Liquidity is not
the bottleneck. Tradeable, trustworthy market supply is.

LAUNCH VERTICAL

AI outcomes: model releases, benchmark scores, competition results. Resolution
sources are machine-readable, so the spec discipline is provable on day one
rather than aspirational. I am an active ARC-AGI-3 competitor, so these are
questions I can pose credibly to an audience that already argues about them.

WHO IS BUILDING IT

I build one thing repeatedly: systems that know when their evidence is not good
enough, and abstain instead of guessing. An abstain-unless-unanimous rule learner
for ARC-AGI-3. A version-space eliminator that kills goal hypotheses using
negative evidence. A guarded executor that voids its plan when the world stops
matching its model. Rein, a smart account an AI agent can operate but cannot
drain, deployed and source-verified with allowed and refused transactions as
evidence. Germline, an optimiser that returns a receipt a customer can verify
without trusting the vendor.

Brier is that discipline pointed at the place where it pays: deciding whether a
market can be settled, and refusing to settle it when it cannot.

WHAT ALREADY RUNS

This is not a proposal for software that does not exist. Implemented and tested:

  src/spec.mjs     ResolutionSpec: canonical serialisation, sha256, and the
                   binding into Rain's existing marketDescription field.
                   Order-independent, so two specs meaning the same thing hash
                   identically. Structural validation refuses http sources,
                   non-UTC instants, comparators without units, missing void
                   branches, and any fallback other than abstain.
  src/grader.mjs   Admission grading. Six probes detect constructs that admit
                   more than one reading, and each names the spec field that
                   would collapse it. Two (vague predicate, unbound entity) are
                   unresolvable by construction and force a rewrite.
  src/settle.mjs   The unanimity gate. Any disagreement abstains; a resolver
                   that could not read the source counts as a hold, never a
                   vote; total failure hits the void branch. Emits a frozen
                   receipt with the spec hash and the sha256 of every fetch.

  35 tests passing (node --test). Corpus of 20 adversarial questions.

MEASURED ON REAL MARKETS NOBODY HERE WROTE

Surveyed every open market Polymarket's public API returns, ranked by liquidity:
1,192 markets, $427.0M of liquidity. This needs no labelling from me --
Polymarket publishes a resolutionSource field, and it either holds a fetchable
URL or it does not:

  no fetchable resolutionSource    907/1192   76.1%
    as a share of liquidity        $383.9M    89.9%
  settles on human judgement       864/1192   72.5%
    as a share of liquidity        $295.5M    69.2%

Nine of the ten deepest books with no source are the 2028 Democratic nomination
ladder -- $2.8M each on Kim Kardashian, MrBeast, Oprah -- every one settling on
"a consensus." The deepest, $3.0M on a September Fed cut, names no source at all.

The attack pattern is still live. The grader refuses "Iran agrees to end
enrichment of uranium by December 31?" on the same unresolvable predicate --
"agrees" -- that it fires on the Ukraine minerals market whose odds were driven
9% to 100% and settled Yes with no agreement in place. Same defect, still open,
still taking money.

WHERE THIS IS WEAKER THAN THE HEADLINE

The survey needs no labelling. The grader's own accuracy is a separate, more
modest claim over those same 1,192 markets:

  refused unrewritably    9/1192   0.8%
  SUPERLATIVE_UNTIED        102    8.6%
  TEMPORAL_VAGUE             83    7.0%
  VAGUE_PREDICATE             9    0.8%

Three caveats I state before anyone asks. The grader refuses all 1,192 on
structural grounds, but that is an artifact, not a finding -- Polymarket has no
selector or void-branch fields to populate, so the check is trivially true and I
do not count it. TEMPORAL_VAGUE over-fires: it flags "before 2027", which is
precise apart from timezone, so read 7.0% as an upper bound on a minor defect.
And the probes are lexical, not semantic -- they will miss a question that is
ambiguous for a reason no probe knows about.

The strong grader result is the narrow one: the VAGUE_PREDICATE cluster is real,
it is the defect that was exploited for money, and it is live on Polymarket now.

The repo also carries a 20-question adversarial corpus that passes 20/20. That
number is circular -- one author wrote both labels and probes -- so it is a
regression test, not evidence.

NEXT (2 weeks)

Independently labelled corpus; live resolvers doing real fetches; market creation
and trading on the Rain SDK; a public receipt page per market. Then the
comparison that decides whether this is a business: how often does the native AI
resolver settle a question it should have held?
```

### Short version (~900 characters, if the field is capped)

```
Every oracle works at the exit, on a question that already has money on it — and
that has a measured ceiling. The latest multi-agent oracle evaluation (arXiv
2605.30802) tops out at 83.4%, drops to 58-67% on Companies and Crypto, and finds
13.8% of questions resist correction by any architecture. That floor is a
property of the question, not the resolver.

Brier works at the door. Every market created through it carries a signed,
machine-checkable resolution contract — source, field, UTC instant, comparator,
tie-break, void conditions — hashed into marketDescription, a field Rain already
has, so no protocol change is needed. Questions that survive more than one reading
never open. The same paper confirms nobody does this: "No admission-time screening
is proposed or implemented."

Surveying 1,192 live Polymarket markets holding $427M: 76% carry no fetchable
resolution source, and that is 90% of the liquidity.

It trades on Rain rails, so it generates volume and earns the 0.5% — and its
receipts make honest volume legible, which protects the rebate from wash trading.

The spec schema, admission grader and unanimity gate are implemented and tested
(35 tests). Surveying 1,192 live Polymarket markets holding $427M: 76% carry no
fetchable resolution source, and that is 90% of the liquidity. 72% defer to
phrasing like "a consensus of credible reporting" instead of an instrument. The
grader still refuses "Iran agrees to end enrichment of uranium by December 31?"
on the same unresolvable predicate as the Ukraine market that was driven 9% to
100% and settled Yes with no agreement in place.
```

---

## Website URL

```
https://claude.ai/code/artifact/10fb7116-4199-4391-9454-3463d4f52bd4
```

> Live now, but **private by default** — open the page's share menu and make it
> public before pasting this into the form, or a reviewer gets a login wall.
>
> Better option before submitting: deploy `web/index.html` to Vercel on your own
> domain. You are already authed as `let-the-dreamers-rise`. From `brier/web`:
> `vercel deploy --prod --yes`. A grant reviewer reads a claude.ai link as a
> mockup and a real domain as a project.

---

## Contact Email

```
(yours — the Whitechain application used ashwingoyal2006@gmail.com)
```

## Telegram Handle

```
(yours)
```

## X Handle

```
(yours — @AshwinGo was used on the Whitechain application)
```

---

## Facts used, with sources

| Claim | Source |
|---|---|
| `buildCreateMarketTx` params; no resolution-criteria field | github.com/rain1-labs/rain-sdk README |
| `isDisputed`, `isAppealed`, `resolverIsAI`, `oracleEndTime` exist on market details | same |
| $5M program, $3M builders / $2M daily rewards, grants to $50K, flat 0.5% volume share from token allocation | The Block press release, 20 Mar 2026 |
| TVL $100.1M, volume $142.4M, 36.6K users, 375K txs (13 Aug 2026) | DefiLlama |
| World Cup winner market $1.3M; next ten $40K–$300K | Weiss Ratings, 14 Jul 2026 |
| $100M liquidity commitment, V2, third largest by TVL | Rain announcement via Yahoo Finance |
| UMA attack: 9%→100%, 5M UMA across 3 accounts, 25% of votes | Orochi Network |
| WSJ: >50% of votes from ten wallets in most disputed markets; July 2026 lawsuit | Laika Labs / crypto.news summaries |
| Bots are 14 of top 20 Polymarket wallets, >30% of activity, 37% profitable vs 7–13% of humans | CoinDesk, 15 Mar 2026 |
| 1,192 live markets, $427.0M liquidity; 76.1% no fetchable source (89.9% of liquidity); 72.5% judgement-settled | `bin/survey.mjs` over gamma-api.polymarket.com, cached in `corpus/polymarket-live.json` |

## Deliberately not claimed

- No claim that Brier has users, volume, or a deployed contract. It does not yet.
- No claim that the 20/20 corpus result generalises. One author wrote the labels
  and the probes; it is a regression test, not an accuracy measurement.
- No claim from the "grader refused 1192/1192" figure. That is structural and
  trivially true, because Polymarket has no selector or void-branch fields. Only
  the 0.8% unrewritable figure is a real grader result.
- TEMPORAL_VAGUE over-fires on "before 2027" (precise apart from timezone).
  Stated as an upper bound, not hidden.
- The settlement panel on the site is an **example panel**, labelled as such. The
  rule it runs is the real one from `src/settle.mjs` and the byte hashes are real
  sha256 of the values shown, but no live fetch happens yet.
- The 0.5% share is paid in RAIN from the token allocation. In July 2026 RAIN
  traded near 75x its own product's TVL with roughly $7B team-controlled supply.
  Revenue denominated in that is not yet revenue. Do not model it as cash.
- No claim to a moat on the mechanism. Admission screening is a lint and is
  cloneable in a weekend, by Cournot or by Rain. The only defensible asset is a
  corpus of questions labelled by someone else and tied to realised dispute
  outcomes. That corpus does not exist yet, and Cournot is funded and shipping.
- No claim to have invented unanimity gating. arXiv 2605.30802 measured it first
  (97.9% accuracy on 47% of questions). Cite, do not claim.
- No claim that resolution failure explains Rain's $1.3M marquee market. Sports
  resolution is easy; the argument is that the **long tail** is where resolution
  risk bites, and that is where agent-created markets are heading.
- No revenue projection. 0.5% of a long-tail vertical is small money for a while,
  and saying otherwise to a grant committee that can do the arithmetic is a
  credibility loss.
