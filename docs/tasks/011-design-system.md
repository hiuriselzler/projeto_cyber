# Task 011 — Brand Assets and Design System

**Depends on:** 001 · **Blocks:** 004 onward (in practice) · **Size:** M

> **Build order note:** numbered 011 because it was added late, but it belongs **immediately after
> [task 001](001-project-bootstrap.md)** — before [task 004](004-exercise-catalog-and-logging.md)
> builds the set row. See [README.md](README.md). Building the app's most important component
> against ad-hoc styles and retrofitting a system later is the expensive path.

## Goal
The octopus mark exists as real assets, and `src/ui/` has a token-driven component library that
every screen is built from. Implements [07-brand-and-ui.md](../07-brand-and-ui.md).

## Scope

### 1. The mark ([07 §1](../07-brand-and-ui.md))
- Design the octopus on a strict radial grid: mantle, one slot-pupil eye, eight arms at exact 45°
  intervals on a single repeated curve ratio.
- **Tone gate before anything else:** it must read as *analytical*, not cute. Reference scientific
  illustration and heraldry, not character design. If it would work on a cereal box, restart.
- Deliver all four reduction levels (≥128 px, 32–128, 16–32, favicon), each recognisable in one
  flat colour. **Design in black on white first**; colour is added last and never carries meaning
  alone (INV-24).
- Export SVG, light and dark. App icon, splash, notification icon, favicon.
- **There is one octopus and it is symmetric.** No personal, per-user or data-driven variant exists
  ([07 §2](../07-brand-and-ui.md)) — the mark is never deformed by training state, and Progress is
  a plain list of tracks, not a figure.

### 2. Tokens (INV-23)
- One token source consumed by `src/ui/` — colour (both themes), type scale, spacing, radii,
  easing, durations. Exact values in [07 §3–4, §7](../07-brand-and-ui.md).
- **No component may contain a literal hex, font size, or duration.** Add a lint rule; this is the
  kind of discipline that decays silently and takes dark mode down with it.
- Both themes wired end to end, with the system setting honoured and a manual override.

### 2a. Language and units ([ADR-008](../decisions/ADR-008.md))
- `i18next` with ICU MessageFormat and `expo-localization`; catalogs `en.json` and `pt-BR.json` in
  `packages/shared/i18n/`. **A lint rule rejects literal user-facing strings in components**
  (INV-27), and CI fails if the two catalogs do not have identical key sets.
- The formatting module: SI in, the user's unit system and locale out — kg ↔ lb, km ↔ mi, a decimal
  comma in pt-BR. The custom keypad shows the locale's separator and accepts both.
- **Every component tested in Portuguese — 20–30 % longer — and in pounds.** The set row in pt-BR at
  200 % system font scale is the layout most likely to break.

### 3. Components
Priority order, most valuable first:

1. **The set row** ([07 §6](../07-brand-and-ui.md)) — 56 dp, weight/reps/RIR/✓, previous
   performance inline.
2. **The custom numeric keypad** — must not cover the row being edited; handles `,` and `.` as
   decimal separators.
3. **RIR chips** `0 1 2 3 4 5+` — one tap, never typed.
4. **Metric tile** — a number in `display`/`metric` size with a unit, tabular figures (INV-24).
5. Cycle cell (plan grid), chip, sheet, segmented control, empty state, level-up state.
6. **Track row** — name, level, XP progress, last award reason, and the discipline hue as one of
   several signals (INV-24). This is the whole Progress screen ([07 §6](../07-brand-and-ui.md)):
   a list of rows, sized to work at six rows and at fifteen.

### 4. Motion and accessibility
- The damped house easing ([07 §7](../07-brand-and-ui.md)). **No spring bounce anywhere** — it
  reads as playful and this brand is not.
- Reduce-motion honoured: transitions become cross-fades, emphasis becomes a static state.
- Accessibility labels on every custom control. The set row's label reads as one coherent
  sentence: "Set 3, 40 kilograms, 6 reps, RIR 2, incomplete".
- System font scale to 200 % without loss of function (Dynamic Type: [task 016](016-ios-platform.md)).

## Acceptance criteria
- [ ] The mark is recognisable at 16 px in one flat colour
- [ ] The mark reads as serious to three people asked cold — "what does this feel like?" — with no
      prompting toward the answer
- [ ] Light and dark both pass contrast: body 4.5:1, UI 3:1, workout numerals 7:1 (INV-24)
- [ ] A grep for hex literals in `src/features/` returns nothing (INV-23)
- [ ] Changing one token value visibly updates every screen using it
- [ ] Every state that uses colour also carries an icon, label or shape (INV-24)
- [ ] All changing numbers use tabular figures — verified by watching a live pace readout not jitter
- [ ] TalkBack can complete a full set-logging flow (VoiceOver: [task 016](016-ios-platform.md))
- [ ] Reduce-motion produces no animation longer than a cross-fade

## Notes and risks
- **The set row is the product** ([task 004](004-exercise-catalog-and-logging.md)). Prototype it on
  a real phone, with sweaty hands, before building anything around it.
- The tone gate on the mark is the part most likely to drift. "Serious and logical" is easy to
  agree with and hard to hold — every iteration will be tempted toward friendlier.
- Resist designing screens here. This task produces the vocabulary; the feature tasks write the
  sentences.
- **The mark carries no product mechanic.** An earlier design made the user's own octopus the
  Progress screen; that was dropped for the reasons in [07 §2](../07-brand-and-ui.md), and it will
  be proposed again because it is a charming idea. It hardcodes a fixed number of tracks the
  product no longer has, and a figure with empty limbs reads as a to-do list for sports nobody
  prescribed. Build the mark; do not build a dashboard out of it.
