# 09 — Business Model

**Product name: CyberAthlete.** Directory codename `projeto_SHS` stays as-is; the paths are not
worth churning.

Money enters the product here for the first time, and it interacts with
[08-gamification.md](08-gamification.md) in ways that need stating explicitly rather than
discovering later. The governing decision is [ADR-006](decisions/ADR-006.md).

---

## 1. The tiers

| | **Trial** | **Free** | **Pro** | **Coach** |
|---|---|---|---|---|
| When | First 3 months | After trial | Subscription | Subscription, **v1.1** |
| Price | — | — | **$9.99/mo · $59.99/yr** | **$19.99/mo** + seats |
| Card required | **No** | — | Yes | Yes |
| Logging, history, all 6 sports | ✅ | ✅ | ✅ | ✅ |
| Multi-device sync | ✅ | ✅ | ✅ | ✅ |
| Data export | ✅ | ✅ | ✅ | ✅ |
| Gamification tracks | ✅ | ✅ | ✅ | ✅ |
| **The planner** — mesocycles, 5 strategies, reconciliation | ✅ | ❌ | ✅ | ✅ |
| Cardio plans | ✅ | ❌ | ✅ | ✅ |
| Advanced analytics — RIR trend, volume per muscle, adherence | ✅ | ❌ | ✅ | ✅ |
| Manage athletes | ❌ | ❌ | ❌ | ✅ |

### Why three months, and why no card

A **training block is 8–12 microcycles**. Three months is not a generous trial, it is *the
shortest period in which the product can demonstrate what it does* — plan a block, follow it,
watch it reconcile, take a deload, finish. A 7-day trial of this app shows a user a workout logger
and hides the entire thesis.

**No card up front**, deliberately. Asking for payment details to unlock three months is a large
ask, and a card-on-file trial that auto-charges at month three is the exact surprise-charge
pattern this product should not have. So the trial is not really a trial: it is **three months of
Pro, after which the account becomes Free** unless the user chooses to subscribe. Nobody is ever
charged without deciding to be.

This converts worse than card-up-front. That is the trade, taken knowingly
([ADR-006](decisions/ADR-006.md)).

### Why the planner is the paid line

It is the expensive thing to build, the differentiated thing, and the thing with ongoing value.
Logging is table stakes — Hevy gives it away, and a version of this app that charges for logging
is just a worse Hevy.

**What is never behind the paywall**, at any tier, forever (INV-26):

- **Your own training history** — reading it, charting it, exporting it.
- **Logging a workout or recording an activity.** The core loop always works.
- **Multi-device sync.** Your data reaching your own phone is not a feature.
- **Account deletion and every privacy control**, including privacy zones
  ([04 §6](04-security-and-auth.md)).
- **The cardio volume safety rails** (FR-6.5a). Injury prevention is not an upsell.

A subscription lapsing must never make a user's three years of training inaccessible. Ever.

---

## 2. Pricing

**Decided.** Revisit on evidence after launch, not on nerves before it.

| Plan | USD | BRL |
|---|---|---|
| Pro monthly | **$ 9.99 / mo** | **R$ 24,90 / mês** |
| **Pro annual** | **$ 59.99 / yr** — *50 % off, ≈ $5/mo* | **R$ 149,90 / ano** — *≈ R$12,50/mês* |
| **Founding annual** *(see below)* | **$ 39.99 / yr** | **R$ 99,90 / ano** |
| Coach | **$ 19.99 / mo**, includes 5 athletes, then **$ 3.99 / athlete / mo** | **R$ 49,90 / mês** + **R$ 9,90 / atleta** |

### Where these numbers come from

**The anchor: CyberAthlete replaces two subscriptions.** A user who currently pays for Hevy Pro
(~$24/yr, logging) *and* Strava Premium (~$80/yr, cardio) spends **~$104/yr** — and still has no
planner in either. At $59.99 the app is comfortably cheaper than the pair it replaces while doing
the thing neither does. That comparison is the pitch, and it should be on the paywall screen.

**The ceiling:** RP Hypertrophy (~$180/yr) and Juggernaut AI (~$35/mo) do RIR-based mesocycle
programming — the closest direct comparables, and proof the market pays real money for exactly
this. But they carry established coaching brands and CyberAthlete carries none. **Charging near
them from a standing start would be pricing on their credibility, not ours.**

**The floor:** Hevy at $24/yr. Pricing there would signal "logger with extras" and misrepresent
what this is. It also would not survive the moment support time becomes the binding constraint
([06 §9](06-operations.md)).

$59.99 sits deliberately between: **structured periodisation at roughly a third of what the
periodisation apps charge, and less than the two apps it displaces.**

### Why $9.99/month rather than something modest

**The three-month free period is what earns the right to a real price.** A user reaching the
paywall has already planned a block, trained it, reconciled it and taken a deload. They are not
being asked to gamble — they have used the product for a full mesocycle. That is precisely the
situation in which a confident price is credible and a timid one is suspicious.

The monthly price is also set high relative to annual **on purpose**: at 50 % off, annual is the
obvious choice, and annual is what this product wants. Training blocks run 3–12 months, so the
annual term matches the natural rhythm of use; it also means cash up front and far less churn
admin for a solo developer.

### Brazil is priced separately, not converted

R$ 149,90/yr is **not** $59.99 at the exchange rate — that would be ~R$330 and unsellable. It is
roughly 45 % of the US price, which is the normal purchasing-power adjustment for the market, and
it lands sensibly against local reference points (Strava BR ≈ R$30/mo; a Smart Fit membership
≈ R$110/mo). The developer is in Brazil and early users will be too; getting this wrong locally
would be the expensive mistake.

Both stores support per-territory pricing. Use it for other markets as they appear rather than
shipping one global number.

### Founding pricing — decided: yes

**Anyone who subscribes during the first 12 months after launch keeps the founding price for as
long as their subscription stays active.** $39.99/yr, R$ 99,90/yr.

**The window opens once, at the Android launch, and does not reopen when iOS ships**
([ADR-009](decisions/ADR-009.md)). Founding pricing rewards the risk of backing an unproven app from an
unknown developer; by the time iOS arrives the app is no longer unproven, so iPhone users are offered
the standard price like any later subscriber. A founding subscription bought on Android still carries
to iOS on the same account, as every entitlement does.

It costs almost nothing (those users would likely not have paid more), it rewards the people
taking a real risk on an unproven app from an unknown developer, and it converts early adopters
into advocates.

**It is deliberately framed with no artificial scarcity** — no counter, no "only 50 left", no
countdown. A whole year, honestly stated. [ADR-006](decisions/ADR-006.md) bans manufactured
urgency, and a fabricated founding-member counter would violate it in spirit even while being
technically true.

### Coach pricing

$19.99/mo including five athlete seats, then $3.99 per additional athlete.

A personal trainer charges roughly $50–200/month per client (R$100–300 in Brazil). Five athletes
costs the trainer $20/month total — **around 2 % of the revenue from those clients.** At that
ratio the tool is trivially justifiable, which is where a professional tool wants to sit. Bundling
five seats into the base lets a trainer start without doing arithmetic.

Validate this against actual trainers before building [task 015](tasks/015-coach-tier.md).
Per-seat pricing is easy to get wrong and the tier is v1.1 regardless.

### What this means financially

Store fees are 30 %, or **15 % under Google Play's reduced-fee tier and the Apple Small Business
Program** — both apply at this scale, and each **must be enrolled in before its own store launch**,
since neither is retroactive. Android ships first ([ADR-009](decisions/ADR-009.md)), so Google's comes
first and Apple's belongs to [task 016](tasks/016-ios-platform.md).

| | |
|---|---|
| Annual plan, gross | $59.99 |
| Net after 15 % store fee | **~$51** |
| Storage and compute per user/year | ~$0.30–1.00 |
| Fixed costs ([06 §9](06-operations.md)) | ~$50–100/month |
| **Break-even** | **≈ 25 annual subscribers** |
| 500 annual subscribers | ~$25,000/yr net |

Twenty-five paying users covers the entire infrastructure. That is a low enough bar that pricing
should be set for long-term sustainability rather than for survival — which is exactly why the
answer is $59.99 and not $24.

### What would change these numbers

- **Conversion far below ~3 %** after the trial: the problem is more likely *what is in Pro* than
  the price. Look there first ([ADR-006 § Revisit if](decisions/ADR-006.md)).
- **Conversion far above ~10 %**: priced too low. Raise it for *new* subscribers only — never for
  existing ones, and never for founding members.
- Support load per user turning out much higher than expected: that is the real cost driver, and
  the first thing that would justify a higher price.

---

## 3. The Coach tier — v1.1, and honestly harder than it looks

A trainer managing athletes is **a second product**, not a pricing tier with a flag.

What it actually requires:
- A coach↔athlete relationship with **explicit, revocable consent from the athlete**.
- A coach writing plans into an athlete's account — which breaks the strict single-owner model
  that INV-15 depends on, and needs a genuine permission layer rather than a widened query scope.
- A coach *reading* athlete data — including, potentially, **GPS traces that reveal where the
  athlete lives** ([04 §6](04-security-and-auth.md)). Location must be excluded from coach
  visibility by default, and shared only by deliberate athlete action.
- A coach-side interface: athlete list, adherence at a glance, plan assignment, messaging.
- Billing for seats, and what happens to an athlete's data when the relationship ends
  (answer: it is the athlete's, and it stays with them).

Because of the permission model, **the schema should not assume single ownership is permanent** —
but the feature itself is [task 015](tasks/015-coach-tier.md), after v1 ships. Building an
athlete-facing product and a coach-facing product simultaneously, solo, is how neither gets
finished.

It also needs its own security review. A bug that shows coach A athlete B's home address is a
categorically worse failure than anything in the single-owner product.

---

## 4. The uncomfortable interaction with gamification

Worth naming plainly, because it is the one place where the business model and
[ADR-005](decisions/ADR-005.md) touch.

**The gamification scores adherence to a plan. The plan is the paid feature.** So a Free user has
no prescription, and the scorer can only award them the reduced-rate "unplanned training" path
([08 §3](08-gamification.md)). Their Consistency and Recovery tracks will barely move.

That is a real coupling and it creates an upsell that writes itself. Two rules keep it honest:

1. **State the reason, do not manufacture the feeling.** "Consistency measures completed planned
   sessions — Pro includes the planner" is true and useful. A dimmed, locked, tantalising progress
   bar engineered to nag is a dark pattern, and it is banned by the same clause that bans
   loss aversion ([08 §6](08-gamification.md)).
2. **Free users' tracks still grow.** Unplanned training earns real XP, never zero. A Free user who
   trains hard for a year has something to show for it.

**And the pre-existing ban stands, unchanged and now more important:** no streak protection, no XP,
no levels, and no achievements may ever be purchased (INV-22, [08 §6](08-gamification.md)). Money
buys *features*. It never buys *progress*.

---

## 5. Why a subscription is the safe model here

The dangerous monetisation patterns are the ones where **revenue scales with time-in-app**: ads,
consumable IAP, loot boxes, purchasable streak saves. Those create pressure to maximise
engagement, and in a fitness app maximised engagement means people training when they should rest.

A flat subscription earns from **retention**, and retention in a training app comes from users
getting results. The incentive and the user's interest point the same direction — which is exactly
why [ADR-005](decisions/ADR-005.md) survives contact with a price tag, where it would not have
survived an ad-supported or IAP model.

**Explicitly never:** advertising · selling or sharing user data (least of all location) ·
consumable purchases · anything that pays for opening the app rather than training.

---

## 6. Settled, and still open

**Settled**
- **Prices** (§2): $9.99/mo, $59.99/yr, $39.99/yr founding; R$ 24,90 / R$ 149,90 / R$ 99,90.
- **Founding pricing**: yes — first 12 months after the **Android** launch, not reopened for iOS, locked while the subscription stays
  active, no artificial scarcity.
- **A lapsed subscription leaves an in-progress mesocycle read-only**, never deleted, never hidden
  (FR-9.5, INV-26).
- **Refunds**: honour any request, no questions asked, beyond whatever the stores already do. The
  support cost is trivial; the goodwill and the reputation are not.

**Still open**
1. **Family or multi-athlete household plan?** Cheap to offer and a common ask, but it overlaps
   awkwardly with the Coach tier's seat model. Decide after Coach ships, not before.
2. **Other territories.** Brazil and the US are priced (§2). Add markets with real
   purchasing-power adjustment as users appear there — never by exchange-rate conversion.
3. **Whether to offer a lifetime plan.** Recommendation: **no.** It trades away the recurring
   revenue that funds ongoing development, and this product is a long-lived service with real
   per-user costs, not a one-off purchase.
