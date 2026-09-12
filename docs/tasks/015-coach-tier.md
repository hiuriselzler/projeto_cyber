# Task 015 — Coach Tier

**Depends on:** all of v1 · **Blocks:** nothing · **Size:** XL · **Target: v1.1, after launch**

## Goal
A personal trainer manages athletes: assigns plans, sees adherence, adjusts programmes. The third
paid tier in [09 §3](../09-business-model.md).

## Why this is not a v1 feature

It is priced as a tier, which makes it sound like a flag. It is not — **it is a second product.**

1. **It breaks the data model.** Every invariant in this project assumes one owner per row
   (INV-15), enforced twice, in the repository layer and in Postgres RLS. A coach reading and
   writing an athlete's rows is not a widened query scope; it is a genuine permission layer, and
   bolting one onto RLS carelessly is how a cross-tenant leak happens.
2. **It is a second interface.** Athlete list, adherence at a glance, plan assignment, messaging.
   That is a whole app's worth of screens with none of v1's designs reusable.
3. **It carries the worst privacy risk in the project.** Athletes have GPS traces. A bug that shows
   coach A athlete B's home address is categorically worse than anything in the single-owner
   product ([04 §6](../04-security-and-auth.md)).
4. **Solo capacity.** Building an athlete-facing and a coach-facing product simultaneously is how
   neither ships.

Announce the tier when it exists. Do not sell it before.

## Scope, when it happens

### Permissions — design this first, alone, and review it hard
- `coach_athlete_links (coach_user_id, athlete_user_id, status, scopes, invited_at, accepted_at,
  revoked_at)`.
- **The athlete grants access, always.** A coach invites; the athlete accepts. No coach ever gains
  access by being billed for a seat.
- **Revocable instantly, by the athlete, without asking the coach.**
- **Scoped, and narrow by default:** training log and plans **yes**; body weight **opt-in**;
  **GPS traces and precise locations excluded by default and shared only by deliberate athlete
  action.** Coaches see distance, pace and duration — not routes — unless the athlete says
  otherwise.
- The permission layer sits **beside** INV-15, never replacing it: a coach's access is an explicit
  grant checked in addition to ownership, not a hole in it. RLS policies extend; they do not relax.
- Every coach read of athlete data is **audit-logged**. This is the one place in the product where
  one person reads another's data, and it must be inspectable.

### Coach surface
- Athlete roster with adherence, last session, and current block at a glance.
- Assign or author a mesocycle in an athlete's account; the athlete sees who wrote it.
- Notes and comments per session.
- No coach may see another coach's athletes, obviously — but write the test.

### Billing
- Base subscription plus per-athlete seats ([09 §2](../09-business-model.md)) — validate that model
  against real trainers before building it; per-seat pricing is easy to get wrong.
- **An athlete's data is the athlete's.** When a coaching relationship ends, or a coach stops
  paying, the athlete keeps everything — their history, their plans, their account (INV-26).
- An athlete does not need a Pro subscription to be coached; the coach's seat covers the planner
  for that athlete. Otherwise the same person is charged twice.

## Acceptance criteria
- [ ] A coach cannot see any athlete data before the athlete accepts
- [ ] An athlete revoking access cuts it off immediately, on every device
- [ ] **A coach cannot see an athlete's GPS route or start location by default** — verified by
      inspecting the API response, not the UI
- [ ] Coach A cannot reach coach B's athletes, at any endpoint, with any ID
- [ ] With RLS on and the application check deliberately broken, coach access still fails closed
- [ ] Ending a relationship leaves the athlete with all their data intact
- [ ] Every coach read of athlete data appears in the audit log
- [ ] A dedicated security review is completed before release — **not optional for this task**

## Notes
- **Start with the permission model and a threat model, not the UI.** The screens are the easy part.
- Consider whether coaches need a web interface. Managing twenty athletes on a phone is miserable,
  and a web app is currently a v1 non-goal — this feature may be what changes that, which is
  another reason it is not a launch feature.
