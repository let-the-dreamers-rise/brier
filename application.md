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
Brier is a prediction market platform on Rain where no market opens without a
machine-checkable resolution contract, and no market settles unless independent
resolvers agree on the answer.

THE GAP

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

3. Abstaining settlement. At oracleEndTime, N independent resolvers execute the
   same spec — different models, independent fetches. Unanimous, and Brier calls
   buildResolveMarketTx and publishes a receipt. Not unanimous, and Brier does
   not settle. It abstains, flags the dispute, publishes every resolver's fetched
   bytes and verdict, and hands the human oracle a pre-assembled evidence packet.
   A wrong settlement is far more expensive than a slow one.

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

MEASURED, WITH ITS LIMITATION STATED

  unsettleable, refused    12/12
  settleable, admitted      8/8
  false refusals            0

The grader refuses "Will Ukraine agree to Trump's mineral deal before April?" --
the market whose odds were driven 9% to 100% and settled Yes with no agreement in
place. It fires VAGUE_PREDICATE on "agree" and TEMPORAL_VAGUE on "before April".
The defect was in the question and was checkable before a dollar was staked.

That 100% is circular and I will not present it otherwise: the same author wrote
the corpus labels and the probes. It shows the mechanism runs and that the
historical failure is inside its reach. It is not evidence of accuracy on unseen
questions. The probes are lexical, not semantic. The next measurement is a corpus
somebody else labels.

NEXT (2 weeks)

Independently labelled corpus; live resolvers doing real fetches; market creation
and trading on the Rain SDK; a public receipt page per market. Then the
comparison that decides whether this is a business: how often does the native AI
resolver settle a question it should have held?
```

### Short version (~900 characters, if the field is capped)

```
Rain's SDK lets an agent turn a prompt into a live market. But
buildCreateMarketTx takes free-text marketQuestion and one boolean,
isPublicPoolResolverAi — there is no structured field for the resolution source,
the observation timestamp, the tie-break, or the ambiguity branch. Creation is
industrialised; resolution is still prose. That is where prediction markets lose
money: a governance attack flipped a Polymarket market 9% to 100%, and traders
sued over a UMA resolution in July 2026 — all with hand-written rules.

Brier is a Rain platform where every market carries a signed, machine-checkable
resolution contract (source, field, timestamp, tie-break, void conditions),
hashed into marketDescription so it cannot be reinterpreted. Questions that
survive more than one reading are rejected before opening. At settlement, N
independent resolvers run the same spec; unanimous settles with a public receipt,
otherwise Brier abstains and hands the human oracle a prepared evidence packet.

It trades on Rain rails, so it generates volume and earns the 0.5% — and its
receipts make honest volume legible, which protects the rebate from wash trading.

The spec schema, admission grader and unanimity gate are implemented and tested
(35 tests). On a 20-question adversarial corpus the grader refuses all 12
unsettleable questions with zero false refusals — including the exact Polymarket
question whose odds were driven 9% to 100% and settled Yes with no agreement in
place. That number is circular (one author wrote both corpus and probes) and the
next step is a corpus labelled by someone else.
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

## Deliberately not claimed

- No claim that Brier has users, volume, or a deployed contract. It does not yet.
- No claim that the 100% corpus result generalises. One author wrote the labels
  and the probes; it is a demonstration that the mechanism runs, not an accuracy
  measurement. Say this out loud before anyone asks.
- The settlement panel on the site is an **example panel**, labelled as such. The
  rule it runs is the real one from `src/settle.mjs` and the byte hashes are real
  sha256 of the values shown, but no live fetch happens yet.
- The 0.5% share is paid in RAIN from the token allocation. In July 2026 RAIN
  traded near 75x its own product's TVL with roughly $7B team-controlled supply.
  Revenue denominated in that is not yet revenue. Do not model it as cash.
- No claim that resolution failure explains Rain's $1.3M marquee market. Sports
  resolution is easy; the argument is that the **long tail** is where resolution
  risk bites, and that is where agent-created markets are heading.
- No revenue projection. 0.5% of a long-tail vertical is small money for a while,
  and saying otherwise to a grant committee that can do the arithmetic is a
  credibility loss.
