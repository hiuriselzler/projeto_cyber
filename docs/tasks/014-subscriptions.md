# Task 014 — Subscriptions and Entitlements

**Depends on:** 003, 005 (the planner is what Pro gates) · **Blocks:** launch · **Size:** M

## Goal
Three months of Pro for every new account with no card, then Free or a paid subscription, with
entitlements that work offline and a paywall that never touches a user's own data.

Implements [09-business-model.md](../09-business-model.md) / FR-9.x under
[ADR-006](../decisions/ADR-006.md).

## Scope

### 1. Entitlement model
```sql
subscriptions (
  user_id uuid PK → users,
  tier tier_enum NOT NULL DEFAULT 'trial',       -- trial | free | pro | coach
  trial_started_at  timestamptz NOT NULL,        -- = users.created_at
  trial_ends_at     timestamptz NOT NULL,        -- + 3 months (FR-9.1)
  store store_enum NULL,                         -- apple | google
  store_product_id text NULL,
  current_period_end timestamptz NULL,
  cancelled_at timestamptz NULL,
  ‹sync›
)
```
- **The trial is server-side, from `created_at`** — not a store introductory offer, because no card
  is taken ([ADR-006](../decisions/ADR-006.md)).
- Effective tier is a pure function of `(tier, trial_ends_at, current_period_end, now)`. Put it in
  the domain core with everything else — it is a decision, and both sides need it.

### 2. Store integration
- RevenueCat over Google Play Billing ([05 §5a](../05-integrations.md)). StoreKit 2 joins in
  [task 016](016-ios-platform.md) as a second store behind the same integration.
- Server verifies via RevenueCat webhooks and is the source of truth for `subscriptions`.
- Products to configure ([09 §2](../09-business-model.md)):

  | Product ID | USD | BRL |
  |---|---|---|
  | `pro_monthly` | $9.99 | R$ 24,90 |
  | `pro_annual` | $59.99 | R$ 149,90 |
  | `pro_annual_founding` | $39.99 | R$ 99,90 |

- **`pro_annual_founding` is available for the first 12 months after the Android launch** — the
  window opens once and does not reopen when iOS ships ([09 §2](../09-business-model.md)) — and, once
  bought,
  renews at that price for as long as the subscription stays active. Implement it as a separate
  store product with its own renewal price — **not** as a discount code or a promotional offer,
  which do not survive renewal on either store.
- **Enrol in Google Play's reduced-fee tier before launch.** It is the difference between a 30 % and
  a 15 % fee, and it is not retroactive. The Apple Small Business Program has the same rule and
  belongs to [task 016](016-ios-platform.md).
- Restore purchases, and entitlement that belongs to the **account**, not the store or the device — so
  a subscription bought on Android will carry to iOS when it ships.

### 3. Gating — the part to get right
- One `useEntitlement()` / `require_tier()` boundary. Gating scattered through feature code is how
  INV-26 gets violated by accident.
- **Gated (Pro):** creating and editing mesocycles and cardio plans, generation, reconciliation,
  advanced analytics (RIR trend, volume per muscle, adherence).
- **Never gated, at any tier including expired (INV-26, FR-9.4):** reading/charting/exporting one's
  own history · logging a workout · recording an activity · sync · account deletion · privacy
  controls · the cardio volume safety rails.
- **Lapse behaviour (FR-9.5):** an in-progress mesocycle becomes **read-only** — fully visible,
  manually completable, never deleted, never hidden. The engine simply stops re-projecting.
- **Offline (FR-9.7):** entitlement is cached with a grace period and **fails open** on a network
  error. A Pro user in a basement gym must never lose their planner. A few days of unpaid Pro is
  vastly cheaper than one paying user locked out mid-workout.

### 4. The paywall surface
- A single screen: what Pro adds, both prices, and the annual saving as a percentage (**50 %**).
- **Lead with the replacement comparison** ([09 §2](../09-business-model.md)): Hevy Pro + Strava
  Premium is ~$104/yr and still has no planner. $59.99 is the honest, concrete pitch.
- During the founding window, say plainly that this price is locked for as long as the
  subscription stays active — **as a fact, with no counter and no countdown.**
- **Upgrade prompts state the reason and nothing more** (FR-9.8): *"Consistency measures completed
  planned sessions — Pro includes the planner."* True, useful, and not a nag.
- **Banned:** countdown timers, "offer expires", decaying or dimmed progress engineered to
  frustrate, interstitials on launch, or any loss-aversion framing
  ([08 §6](../08-gamification.md)).
- Trial status is visible but not nagged: a quiet line in settings, and **one** honest notice near
  the end. Not a banner from day one.
- Cancelling is reachable from within the app (FR-9.9).

## Acceptance criteria
- [ ] A new account gets Pro for 3 months **with no payment method**, then becomes Free
- [ ] **An expired account can still open its history, log a full workout, record an activity,
      sync it, and export everything** (INV-26) — the single most important test here
- [ ] A lapsed user's in-progress mesocycle is visible and read-only, not deleted or hidden
- [ ] A Pro user in airplane mode for three days keeps full planner access (FR-9.7)
- [ ] An entitlement check that errors fails **open**, not closed
- [ ] Entitlement is keyed to the account: signing in on a second Android device with the same account
      grants Pro, with no second purchase
- [ ] Restore purchases works after a reinstall
- [ ] No XP, level, streak or achievement can be purchased anywhere (INV-22)
- [ ] No paywall screen contains a countdown, an expiring offer, or loss framing
- [ ] Cancelling is reachable in ≤ 3 taps from settings
- [ ] A founding subscriber **renews at $39.99 / R$ 99,90**, not at the standard price — verify by
      inspecting the store product's renewal price, not the purchase price
- [ ] BRL prices appear for a Brazilian store account and are the configured values, not converted
      ones
- [ ] The paywall, store listing, subscription disclosure and cancellation flow are complete in
      **both** English and Portuguese — store review reads the disclosure in the storefront's
      language ([ADR-008](../decisions/ADR-008.md))

## Notes and risks
- **Fail open.** It is worth repeating: the failure mode of a strict entitlement check is a paying
  customer locked out of their workout in a place with no signal. That is far more expensive than
  the alternative.
- Store review pays close attention to subscription disclosure. Prices, period, and what happens at
  the end must be on the paywall screen itself, not only in the terms.
- Do not scatter `if (isPro)` through feature code. One boundary, and INV-26 as a review checklist
  item on every PR that touches it.
- The trial being server-side means clock manipulation on-device cannot extend it — but also means
  the server must be reachable at least once to establish it. Register-time is the natural moment.
