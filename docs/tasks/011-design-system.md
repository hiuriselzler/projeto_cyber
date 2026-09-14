# Task 011 — Brand Assets and Design System

**Depends on:** 001 · **Blocks:** 004 onward (in practice) · **Size:** L

> **Device checks (2026-09-12):** there is no physical device before [task 017](017-local-toolchain-device-spike.md),
> so the criteria that can only be seen on one — token changes on screen, live numerals, TalkBack, the set row at
> 200 % font scale in Portuguese, the keypad beside the row it edits, plurals under Hermes — moved there. This task
> closes on the rest.

> **The mark moved to [task 018](018-brand-mark.md) (2026-09-12).** The project owner draws it by hand, later. This
> task builds every slot the mark fills and leaves a plainly marked placeholder in each, so nothing here waits on the
> drawing.

> **Build order note:** numbered 011 because it was added late, but it belongs **immediately after
> [task 001](001-project-bootstrap.md)** — before [task 004](004-exercise-catalog-and-logging.md)
> builds the set row. See [README.md](README.md). Building the app's most important component
> against ad-hoc styles and retrofitting a system later is the expensive path.

## Goal
`src/ui/` has a token-driven component library that every screen is built from, and every slot the octopus mark will
fill exists, holding a placeholder. Implements [07-brand-and-ui.md](../07-brand-and-ui.md).

## Scope

### 1. The mark's slots ([07 §1](../07-brand-and-ui.md))
- The drawing is [task 018](018-brand-mark.md). This task builds where it goes: SVG sources for the levels of 07's
  ladder in `apps/mobile/assets/brand/`, a render step that turns them into the launcher icon, the adaptive icon's
  layers, the splash, the notification icon and the favicon, and a `Mark` component in `src/ui/`.
- **Each slot holds a plainly marked placeholder** — a crossed box, never a stand-in octopus, which would become the
  mark by default.
- The committed PNGs are exactly what the render step produces: CI renders them again and fails on any difference.
- The icon's and splash's background colours come from the token source, checked by a test. The notification icon and
  favicon are rendered but not yet wired: nothing sends a notification before task 007, and there is no web app.

### 2. Tokens (INV-23, [ADR-014](../decisions/ADR-014.md))
- One token file, `src/ui/tokens.ts` — colour (both themes), type scale, spacing, radii, sizes, easing, durations.
  Exact values in [07 §3–4, §7](../07-brand-and-ui.md). Plain data with no React Native import, so build scripts read
  it too.
- **No literal hex, colour string, font size, line height, letter spacing or animation duration anywhere else**,
  enforced by an ESLint fence and proven by known-bad fixtures. This is the kind of discipline that decays silently
  and takes dark mode down with it.
- Contrast is a test over the tokens, with 07 §3's rule: every token against every background of its theme.
- Both themes wired end to end: the system setting honoured, and a manual override — system, light or dark — kept on
  the device only.
- Inter 4.1 as static font files, bundled: Regular, Medium and SemiBold, and Inter Display SemiBold ([07 §4](../07-brand-and-ui.md)).

### 2a. Language and units ([ADR-008](../decisions/ADR-008.md))
- `i18next` with ICU MessageFormat and `expo-localization`; catalogs `en.json` and `pt-BR.json` in
  `packages/shared/i18n/`. The device supplies the defaults as ADR-008 says, and Hermes gets the `Intl` polyfills
  that ICU plurals need.
- **A lint rule rejects literal user-facing strings in `src/ui/` and `src/features/`** (INV-27) — the debug-only
  `src/features/diagnostics/` excepted by name ([ADR-014](../decisions/ADR-014.md)) — and CI fails if the two
  catalogs differ in their keys or in the arguments a message takes.
- The formatting module: SI in, the user's unit system and locale out — kg ↔ lb, km ↔ mi, m ↔ ft, °C ↔ °F, a decimal
  comma in pt-BR. It parses keypad input back to SI, accepting `,` and `.`. Pace formats arrive with sport profiles in
  [task 007](007-cardio-recording.md), because a pace's unit belongs to the sport (INV-19).
- **Every component tested in both languages and both unit systems, in both themes.** Language and unit system are
  independent settings (ADR-008), so all eight combinations: the realistic pairs users see — Portuguese with kilograms,
  English with pounds — and the crossed ones, including Portuguese, which runs 20–30 % longer, with pounds. The set
  row in pt-BR at 200 % system font scale is the layout most likely to break; it is checked on a device in task 017.

### 3. Components
Priority order, most valuable first:

1. **The set row** ([07 §6](../07-brand-and-ui.md)) — 56 dp, weight/reps/RIR/✓, previous
   performance inline.
2. **The custom numeric keypad** — must not cover the row being edited; handles `,` and `.` as
   decimal separators.
3. **RIR chips** `0 1 2 3 4 5+` — one tap, never typed. What `5+` stores is task 004's decision; the chips take their
   values as a prop.
4. **Metric tile** — a number in `display`/`metric` size with a unit, tabular figures (INV-24).
5. Cycle cell (plan grid), chip, sheet, segmented control, empty state, level-up state.
6. **Track row** — name, level, XP progress, last award reason, and the discipline hue as one of
   several signals (INV-24). This is the whole Progress screen ([07 §6](../07-brand-and-ui.md)):
   a list of rows, sized to work at six rows and at fifteen.

### 4. Motion and accessibility
- The damped house easing, `cubic-bezier(0.18, 0, 0.06, 1)` ([07 §7](../07-brand-and-ui.md)). **No spring
  anywhere**, banned by lint — it reads as playful and this brand is not.
- Reduce-motion honoured: transitions become 120 ms cross-fades, emphasis becomes a static state.
- Accessibility labels on every custom control. The set row's label reads as one coherent
  sentence: "Set 3, 40 kilograms, 6 reps, RIR 2, incomplete".
- System font scale to 200 % without loss of function (Dynamic Type: [task 016](016-ios-platform.md)).

## Acceptance criteria
- [x] Light and dark both pass contrast, proven by a test over every token against every background of its theme:
      body 4.5:1, UI 3:1, workout numerals 7:1 ([07 §3](../07-brand-and-ui.md), INV-24)
- [x] A grep for hex literals in `src/features/` returns nothing (INV-23)
- [x] The `design-tokens`, `no-bounce` and literal-string lint rules each report a known-bad fixture in CI
      ([ADR-014](../decisions/ADR-014.md))
- [x] Every state that uses colour also carries an icon, label or shape (INV-24)
- [x] Reduce-motion produces no animation longer than a cross-fade
- [x] `en.json` and `pt-BR.json` have the same keys, and every message takes the same arguments in both, checked in
      CI (INV-27)
- [x] The formatting module shows every load on a 5 lb grid, after storage precision, as an exact multiple of 5 lb;
      pt-BR shows a decimal comma; keypad input with `,` or `.` parses to the same kilograms in both languages
      (INV-01, INV-02)
- [x] Every component in §3 is tested in both languages and both unit systems, in both themes — all eight
      combinations; the set row's accessibility label is one sentence in each, and a blank RIR reads as not recorded
      (INV-03)
- [x] The theme follows the system setting, and a manual override wins over it and is stored on the device
- [x] Every slot the mark fills holds a placeholder, and CI fails if a committed PNG differs from its render

## Notes and risks
- **The set row is the product** ([task 004](004-exercise-catalog-and-logging.md)). Prototype it on
  a real phone, with sweaty hands, before building anything around it — in task 017, the first moment a
  phone is available, and before task 004.
- **Jest is not a phone.** Layout at 200 % font scale, the keypad beside the row it edits, and `Intl` under Hermes
  pass or fail only on a device, which is why those checks are task 017's. Node has full `Intl` and Hermes does not,
  so a plural that renders in a test can still break on the phone if the polyfills are not loaded.
- **Inter's release publishes no checksum.** The font files come from Inter 4.1's GitHub release over HTTPS; their
  SHA-256 is recorded in the decision log.
- Resist designing screens here. This task produces the vocabulary; the feature tasks write the sentences.
- The mark's own risks — tone drift, and the dashboard that will be proposed again — are
  [task 018](018-brand-mark.md)'s.
