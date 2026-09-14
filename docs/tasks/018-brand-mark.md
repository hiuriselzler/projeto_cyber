# Task 018 — The Mark

**Depends on:** [task 011](011-design-system.md), for its slots · **Blocks:** the store listing, and so the launch ·
**Size:** M · **Made by:** the project owner, by hand

> **Added 2026-09-12.** Split from task 011 so the design system does not wait on a drawing. Task 011 builds every
> slot the mark fills and leaves a plainly marked placeholder in each; this task replaces them.

## Goal
The octopus exists as a real drawing, reduced along 07's ladder into every asset the app and the store listing use.
Implements [07 §1–2](../07-brand-and-ui.md).

## Scope

### 1. The drawing
- **A drawn creature, not a geometric abstraction.** An anatomically credible octopus in the language of a
  19th-century engraved zoological plate: the true mantle shape, horizontal slot-pupil eyes with a level gaze, eight
  tapering arms with sucker rows, each placed deliberately, and the web, funnel and brow ridge; hatching, stipple and
  contour lines, no flat fills. Never simplified into a logo shape.
- **Tone gate before anything else:** it must read as *analytical*, not cute. Reference scientific illustration, not
  character design. If it would work on a cereal box, restart.
- **In black ink on white first.** Colour is added last and never carries meaning alone (INV-24).
- No barbell, no shoes, no cybernetics — [07 §1](../07-brand-and-ui.md) lists the traps, and why each one is a trap.

### 2. The ladder ([07 §1](../07-brand-and-ui.md))
Each level is a subtraction from the one above, chosen by the size at which it is shown:
- **reduced drawing**, ≥128 dp — splash, headers;
- **silhouette + eyes**, 32–128 dp — the launcher icon, and the Play Store icon kept identical to it;
- **glyph**, ≤32 dp — the notification icon, which Android draws from its alpha channel alone, and the favicon.

### 3. Into the app and the store
- Replace the placeholder SVGs in `apps/mobile/assets/brand/`, light and dark, run the render step task 011 built, and
  commit what it produces.
- The wordmark — **CyberAthlete** in the display face, with the emblem in its fixed relationship and clear space
  ([07 §1](../07-brand-and-ui.md)).
- The store listing's icon and feature graphic.

## Acceptance criteria
- [ ] The glyph is recognisable at 16 px in one flat colour
- [ ] The mark reads as serious to three people asked cold — "what does this feel like?" — with no prompting toward
      the answer
- [ ] Each level, set beside the one above it, is visibly the same creature with marks removed, not a redrawing
- [ ] No placeholder remains in any slot the mark fills — the render step reports none
- [ ] **One canonical drawing.** Nothing personal, per-user or data-driven exists ([07 §2](../07-brand-and-ui.md))

## Notes and risks
- **The tone gate is the part most likely to drift.** "Serious and logical" is easy to agree with and hard to hold —
  every iteration will be tempted toward friendlier.
- **The mark carries no product mechanic.** An earlier design made the user's own octopus the Progress screen; that
  was dropped for the reasons in [07 §2](../07-brand-and-ui.md), and it will be proposed again because it is a
  charming idea. It hardcodes a fixed number of tracks the product no longer has, and a figure with empty limbs reads
  as a to-do list for sports nobody prescribed. Draw the mark; do not build a dashboard out of it.
- **Trademark clearance on "CyberAthlete"** ([07 §9](../07-brand-and-ui.md), open question 1) comes before any spend on
  the name — a commissioned wordmark included.
- An engraved drawing converted to SVG can be heavy. The full drawing belongs to the about screen and marketing; the
  levels the app draws often are the light ones.
