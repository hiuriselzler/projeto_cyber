# Task 012 — Onboarding and First-Run Experience

**Depends on:** 003, 004, 011 · **Blocks:** launch · **Size:** M

## Goal
A stranger installs the app and logs their first set within three minutes (NFR-10), without
reading anything they did not choose to read.

This task exists because the product became multi-user. The earlier premise — one user, the
author, fluent in RIR and mesocycles — is retired, and with it the assumption that the UI could
skip explanation entirely.

Implements FR-1.1b, FR-1.1c.

## The principle: progressive disclosure, not dumbing down
No advanced feature is removed to accommodate beginners, and no beginner is blocked by vocabulary
they do not have ([07 §5](../07-brand-and-ui.md)).

Concretely: a user who never opens the planner still has a complete workout logger. RIR, deloads,
mesocycles, e1RM and HR zones are introduced **in context, the first time they are relevant**, in
one sentence, with a way to skip and a way to read more.

## Scope

### 1. First run — as short as it can be
Ask only what the app cannot work without:

1. **Units** — metric or imperial, **pre-selected from the device region**, so for most people this
   is a confirmation rather than a decision. One tap. Language is **not** asked: it comes from the
   device and can be changed in settings ([ADR-008](../decisions/ADR-008.md)).
2. **What do you train?** — multi-select over the six v1 sports plus gym. Drives which half of the
   app leads and which starter routines are offered. It does **not** create gamification tracks —
   only logging does ([08 §2](../08-gamification.md)) — so answering it wrongly costs nothing and
   changing your mind later requires no settings trip.
3. **Experience** — optional, three options, used only to decide whether to *offer* the planner
   up front or leave it in the menu.

Everything else — body weight, max HR, birth date — is asked later, in context, or never.
**Do not build a seven-screen wizard.** Every screen before the first logged set is a screen some
users will quit on.

### 2. First value
- **Straight to a workout.** Offer a starter routine matched to what they selected, or "just start
  an empty workout". Both paths reach the set row immediately.
- The first time a set is completed, one sentence introduces RIR with the chips already visible —
  skippable, never modal-blocking.
- The planner is *offered* after the first completed workout, never before. A mesocycle builder as
  a first screen is how you lose everyone who is not already convinced.

### 3. Contextual education
One-sentence explainers, each shown once, dismissible, re-readable from a glossary:

| Trigger | Explains |
|---|---|
| First set completed | RIR — "how many more reps you could have done" |
| First plan created | What a mesocycle is, and why blocks end |
| First deload cycle reached | Why doing less on purpose is the point |
| First e1RM shown | What it estimates, and why it needs RIR (INV-07) |
| First cardio recording | Why background location is needed ([04 §6](../04-security-and-auth.md)) |
| First privacy zone prompt | That traces are private by default and can be trimmed |

### 4. Permissions, asked honestly
- **Location is requested at the first tap of "record"**, never at launch, with a plain
  explanation. Background permission only after foreground recording has worked once
  ([05 §1](../05-integrations.md)).
- Non-GPS sports never trigger a location prompt ([05 §1a](../05-integrations.md)).
- Notifications are requested when the user first sets a session reminder — never on first run.

### 5. Empty states
Every list has a first-run state that says what goes there and offers the action that fills it.
Rendered as technical line diagrams in the mark's visual language
([07 §9](../07-brand-and-ui.md)) — **never spot illustrations of smiling people exercising.**

### 6. Gamification introduction
- A new account has **only the four quality tracks**; discipline tracks appear as the user logs
  each sport ([08 §2](../08-gamification.md)). Explain on the first XP award, in one sentence.
- **The first time a discipline track appears, say so once and plainly** — "You've started a Pool
  swim track." It is a fact worth stating, not a fanfare, and it is the moment the adaptive track
  set becomes legible without ever having to describe it in advance.
- The first award a new user is likely to see should be an ordinary session, not an achievement
  fanfare — set the tone early ([08 §6](../08-gamification.md)).
- The disable switch (FR-8.9) is findable in settings without hunting.

## Acceptance criteria
- [ ] Install → first logged set in **under three minutes**, timed with a real person who has not
      seen the app (NFR-10)
- [ ] Fewer than four screens between launching the app and the set row
- [ ] A user who skips every explainer has a fully working logger
- [ ] A user who never opens the planner is never nagged to
- [ ] No location prompt appears for a user who only lifts
- [ ] Every explainer is dismissible, shown once, and re-readable from the glossary
- [ ] No empty state is a blank screen
- [ ] Tested with someone who does not know what RIR is — and who is not corrected by the tester

## Notes and risks
- **Watch a real stranger do this.** Onboarding is the one flow where the author's intuition is
  worth the least, because the author cannot un-know the vocabulary.
- The temptation is to explain the planner early, because it is the best part. Resist. It is the
  best part *once you are already training*.
- Starter routines are content, not code. A handful of good ones (full-body 3×, upper/lower 4×,
  push/pull/legs, couch-to-5k) is worth more than a routine builder tutorial.
