# 07 — Brand and UI/UX

The visual and interaction system. The mark and the reward mechanic are **deliberately separate
objects** — see §2 for why an earlier version tied them together and why that was undone.

---

## 1. The mark: an octopus

### Why an octopus is the right animal, beyond wanting one

The brief was "serious and logical, representing the diversity of sports". The octopus earns that
on more than resemblance:

- **Eight arms, one creature.** The product's whole claim is that strength and cardio are one
  training life, not two apps. Gym, pool, road, trail — one body doing all of it.
- **Distributed intelligence.** An octopus carries roughly two-thirds of its neurons *in its
  arms*. Each arm solves problems semi-independently while the central brain sets intent. That is
  literally this system's architecture — [ADR-001](decisions/ADR-001.md)'s local-first client
  computing on its own, and [ADR-002](decisions/ADR-002.md)'s planner setting intent while each
  session adapts to reality. The metaphor is structural, not decorative.
- **Deliberate, never frantic.** Octopuses are methodical, patient problem-solvers. Progressive
  overload is a patient discipline. The animal and the method agree.
- **Adaptive by nature.** Changing form to meet conditions is exactly what reconciliation does to
  a plan when a cycle goes badly.
- **Blue blood.** Hemocyanin is copper-based. It gives the palette a real origin instead of an
  arbitrary one (§3).

### Tone: what it must never be

| Never | Instead |
|---|---|
| Cartoon eyes, smile, waving arms | A steady, level gaze from slot pupils |
| Bouncy, rubbery, squishy | Weighted, deliberate, alive |
| Bright, playful, saturated | Deep, cold, restrained |
| A mascot with a personality | A creature with intelligence |
| Cute | Watchful |

The reference is **scientific illustration** — a naturalist's plate, not character design. It
should look like something drawn from careful observation and etched onto a good instrument. If it
would work as a tattoo or an engraving, it is right. If it would work on a children's cereal box,
start again.

### It is a drawn creature

**Not a geometric abstraction.** A real, anatomically credible octopus, drawn — with the
seriousness coming from *how it is rendered*, not from reducing it to shapes.

The reference is **19th-century zoological illustration**: Haeckel's cephalopod plates, engraved
natural-history frontispieces, the kind of drawing made by someone studying the animal rather than
decorating with it. Precise, detailed, unsentimental, and unmistakably alive.

Anatomy is respected, because credibility is where the intelligence reads from:

- **Mantle** — the true bulbous-then-tapering shape, not a ball or a dome.
- **Eyes** — horizontal **slot pupils**, the real cephalopod shape. This single detail does most
  of the work: a slot pupil reads as watchful and analytical where a round pupil reads as cute.
  Level gaze, directed at the viewer, unhurried.
- **Arms** — eight, with visible sucker rows, tapering properly, each one placed deliberately.
  Real octopuses curl and hold arms with intent; nothing flails.
- **Web, funnel, brow ridge** — present. The details that separate an octopus from a cartoon
  squid.
- **Texture** — engraving language: hatching, stipple, contour lines following form. No flat
  cartoon fills, no gradients, no airbrush.

### Serious, not stiff

"Not dumb" is the whole brief. The creature should look like it is **assessing you** — the way an
octopus in a tank actually watches a person. Calm, attentive, slightly imperious. Its intelligence
is the point of the drawing.

| Never | Instead |
|---|---|
| Round pupils, eyebrows, a mouth | Slot pupils, level gaze, no facial expression |
| Waving, dancing, action poses | Settled, poised, arms held with evident intent |
| Flat cartoon fills | Engraved hatching and contour |
| Simplified into a logo shape | A drawing that happens to work as a mark |
| Anthropomorphised — holding a dumbbell, wearing shoes | An animal, taken seriously |

Weightlifting props are the specific trap here. The octopus does **not** hold a barbell. The eight
arms already say "many disciplines"; adding equipment turns a serious animal into a mascot in one
stroke.

### The reduction problem, honestly

A detailed drawing does not survive to 16 px. Pretending one asset does everything is how brands
end up with an illegible app icon, so the ladder is explicit about where the drawing stops and a
derived mark begins.

**Sizes are rendered sizes** — dp on a device, px on the web — because legibility depends on how large
the mark appears, not on the pixel count of the file. A launcher icon is exported at 432 px and still
shown about 48 dp across, roughly 9 mm: at that size engraved hatching is noise.

| Rendered size | Uses | Form |
|---|---|---|
| Full width, or print | About screen, marketing, print, the store feature graphic | **The full drawing.** Engraved detail, full anatomy |
| ≥ 128 dp | Splash (Android 12 and later mask it to a circle under 200 dp), headers, social avatars | **Reduced drawing.** Same creature, same pose, fewer marks: contour and essential hatching only |
| 32–128 dp | Launcher icon (48 dp), and the Play Store icon, kept identical to it | **Silhouette + eyes.** Mantle and arm mass as one form, with the slot-pupil eyes retained — they are the most recognisable single element |
| ≤ 32 dp | Notification icon (24 dp), favicon (16 px) | **Glyph.** Mantle silhouette with eight arm strokes, in one flat colour. Derived from the drawing, not a different idea. Android draws a notification icon from its alpha channel alone, so the glyph must read as a pure silhouette |

Each step is drawn *from* the one above, never redesigned. Do the full drawing first in black ink
on white; every reduction is a subtraction from it. Colour is added last and never carries meaning
alone (INV-24).

**Who draws it: the project owner, by hand** (decided 2026-09-12). Until the drawing exists, every
slot the mark fills — app icon, splash, notification icon, favicon — holds a plainly marked
placeholder. Never a quick stand-in octopus: a stand-in that ships becomes the mark by default.

### Wordmark — **CyberAthlete**

Set in the display face (§4), tight tracking, all caps or small caps, never italic. Emblem above or
left of the wordmark, fixed relationship, clear space of one mantle-width on all sides.

Set as one word with an internal capital — **CyberAthlete** — not "Cyber Athlete", not "CYBERATHLETE"
in running text.

### Resolving "Cyber" against a hand-drawn animal

There is a real tension between the name and the mark, and it is better resolved deliberately than
discovered halfway through the design. "Cyber" pulls toward neon, glitch, chrome and circuitry. The
octopus pulls toward ink, water and natural history. Left alone, they fight.

**The resolution: biology observed through instruments.**

An octopus is not a counterpoint to "cyber" — it is nature's own distributed computer. Half a
billion neurons, most of them in the arms, running parallel processes and adaptive camouflage. The
name and the animal agree on the actual subject: **intelligence, precisely observed.** And
scientific illustration is exactly the visual language of studying biology with instruments — an
engraved plate *is* measurement applied to a living thing.

So the brand is an **organic subject rendered with technical precision**. The existing palette
already sits there: hemocyanin blue, deep water, copper. Typography is precise and tabular. The
creature is warm-blooded (metaphorically; it is not) and everything around it is instrumentation.

**Therefore, banned as "cyber" clichés** — every one of them would fight the engraving:
neon glow · glitch and scanline effects · circuit-board traces · chrome and metallic gradients ·
matrix rain · wireframe or low-poly rendering · a robotic or cybernetic octopus.

The word "Cyber" carries the technology; the mark carries the intelligence. Neither needs to do
the other's job.

### Naming due diligence — before any store listing

- **"Cyberathlete Professional League" (CPL)** was a well-known esports organisation (1997–2008).
  The term therefore has prior commercial use in a games context. Almost certainly a different
  Nice class from a fitness app, but this needs an actual trademark search — not an assumption —
  before a store submission or any spend on the name.
- Check availability: App Store and Play name uniqueness, `.com` and `.app` domains, and the
  handle on the two or three social platforms that matter.

---

## 2. The mark is a mark, not a dashboard

**The octopus is the brand's figure for a multi-sport app. It does not visualise anyone's
progress.**

An earlier version of this document made the user's own octopus the Progress screen — eight arms
coiling and extending by track level, "the primary way progress is felt". That idea is **dropped**,
and it is worth recording why, because it was attractive and someone will propose it again.

- **It hardcoded eight.** The arms mapped one-to-one onto eight fixed tracks. But the track set is
  now per user and assembles itself from the sports they actually do ([08 §2](08-gamification.md)):
  a gym-and-swim user has two discipline tracks, a triathlete has four or five. An eight-armed
  figure cannot represent a set whose size is not eight without either inventing tracks to fill
  arms or hiding tracks that have no arm. Both are worse than a list.
- **A figure with empty limbs is a to-do list.** A coiled arm was meant to read as "room to grow".
  On a screen the user opens after training, next to seven other arms, it reads as incomplete —
  and the way to complete it is to go and do a sport nobody prescribed. That is exactly the
  volume pressure [ADR-005](decisions/ADR-005.md) is built to keep out.
- **It made the brand load-bearing for a mechanic.** Tying the mark to the reward system meant
  every future change to scoring became a change to the logo's meaning. The mark should outlive
  the mechanic.

So: **one canonical drawing, used as a brand asset only** — app icon, splash, about screen,
marketing, print. It is never personalised, never deformed, never animated by user data, and it
never appears as a progress readout. Progress is a plain list of the user's tracks (§6).

The animal still earns its place for the reason in §1 — eight arms, one creature, many disciplines
under one training life. It says that about the *product*. It does not need to say anything about
*you*.

---

## 3. Colour

**Dark-first.** Gyms are dim, phones come out in dark rooms and at dawn, and a bright screen
between sets is hostile. Light mode is a genuine, fully-designed alternative for daylight
outdoors — not an afterthought.

**The app follows the system's light or dark setting**, and a manual override — system, light or dark — wins over
it. The override is kept **on the device only** and never synced: a phone used in a dark gym and a tablet on a desk
can reasonably disagree.

### Origin
The accent is **hemocyanin blue** — octopus blood — with **copper** as its counterpart, the metal
that makes hemocyanin blue in the first place. Cold blue for data and calm; warm copper for
effort and intensity. The whole palette descends from one true fact about the animal.

### Dark (primary)

| Token | Hex | Use |
|---|---|---|
| `bg-abyss` | `#0A0D12` | App background |
| `bg-surface` | `#131820` | Cards, sheets |
| `bg-elevated` | `#1C232E` | Modals, active rows |
| `border-subtle` | `#232C38` | Decorative hairlines — never the only edge of a control |
| `border-strong` | `#5F7081` | The edge of a control: a field, an unselected chip |
| `text-primary` | `#E8EDF2` | Headings, numbers — **the only colour for live-workout numerals** |
| `text-secondary` | `#9AA7B5` | Labels, units |
| `text-muted` | `#7F8C9A` | Hints, previous performance, disabled |
| `text-on-accent` | `#0A0D12` | Text and icons on an `accent` fill |
| `accent` | `#4A9FD4` | Primary action, focus, links, the edge of a selected control |
| `accent-deep` | `#135278` | Selected and pressed fills; carries `text-primary` |
| `copper` | `#C67B45` | Effort, intensity, strength track |
| `success` | `#4FA88B` | PRs, targets met |
| `warning` | `#D9A441` | Approaching a limit |
| `danger` | `#D96962` | Destructive, missed |
| `shadow-elevated` | none | Elevation is shown by `bg-elevated` alone |

### Light

Every token exists in both themes, with the same use.

| Token | Hex |
|---|---|
| `bg-abyss` | `#F4F6F8` |
| `bg-surface` | `#FFFFFF` |
| `bg-elevated` | `#FFFFFF`, raised by `shadow-elevated` |
| `border-subtle` | `#DFE5EB` |
| `border-strong` | `#7D8EA0` |
| `text-primary` | `#0F1519` |
| `text-secondary` | `#4A5764` |
| `text-muted` | `#64717E` |
| `text-on-accent` | `#FFFFFF` |
| `accent` | `#1F6F9E` |
| `accent-deep` | `#D0E8FA` — a tint here, because in both themes it carries `text-primary` |
| `copper` | `#9A5B2C` |
| `success` | `#2F7A62` |
| `warning` | `#926702` |
| `danger` | `#A63F3A` |
| `shadow-elevated` | `#0F1519` at 12 % opacity, 2 dp down, 8 dp blur |

### How the palette was corrected (2026-09-12)

The first version of these tables failed its own contrast rule. Dark `text-muted` was 3.50:1 on
`bg-elevated` — exactly where §6 puts the set row's previous-performance line. `danger`, `ride` and
`row` could not be text on an active row. `border-strong`, at 1.5–1.9:1, could not mark a control, and
light mode had no `text-muted`, `border-strong`, `accent-deep`, `warning` or shadow at all.

Each failing colour was moved **in lightness only**, keeping hue and chroma (OKLCH), until it cleared
its floor by 0.1 on the theme's hardest background. The missing light tokens were derived from their
dark counterparts in the same way. Light `accent-deep` became a tint of `accent`, and `text-on-accent`
was added because a primary button's label had no colour. **Nothing that already passed was changed.**

| Token | Was | Now | Worst ratio, was → now |
|---|---|---|---|
| dark `text-muted` | `#6B7885` | `#7F8C9A` | 3.50 → 4.60 |
| dark `danger` | `#C85A54` | `#D96962` | 3.80 → 4.62 |
| dark `border-strong` | `#334252` | `#5F7081` | 1.54 → 3.10 |
| dark `accent-deep` | `#1F5C82` | `#135278` | 6.12 → 7.11, under `text-primary` |
| dark `ride` hue | `#8B7BD8` | `#8E7EDB` | 4.46 → 4.63 |
| dark `row` hue | `#C25E7A` | `#D06B86` | 3.89 → 4.61 |
| light `swim` hue | `#1E7F7F` | `#187B7B` | 4.41 → 4.66 |

### Discipline hues

There is one track per sport ([08 §2](08-gamification.md)), but **not one hue per track.** Eleven
competing colours would read as a toy, and the palette must stay restrained as sports are added.

So hues are assigned by **discipline family**, and related sports share one: an outdoor run and a
treadmill run are separate tracks that look alike, which is honest — they are the same discipline
recorded differently. The four **quality** tracks share the neutral accent at varying luminance.

| Hue | Tracks sharing it | Dark | Light |
|---|---|---|---|
| Strength | `strength` | `#C67B45` | `#9A5B2C` |
| Run | `run`, `treadmill`, `trail_run` | `#4A9FD4` | `#1F6F9E` |
| Ride | `ride`, `indoor_bike` | `#8E7EDB` | `#5B4CA8` |
| Swim | `swim_pool`, `open_water_swim` | `#3FB5B5` | `#187B7B` |
| Walk | `walk`, `hike` | `#7FA86B` | `#4C6B3E` |
| Row | `row_indoor` | `#D06B86` | `#8E3A52` |
| Quality | all four quality tracks, and the catch-all `other` sport | `#8494A4` → `#B8C4D0` by level | `#5A6874` → `#2C3742` |

`gamification_tracks.hue_token` stores which of these a track uses, so the sharing is data rather
than a lookup in a component — and colour is never the only signal anyway (§Non-negotiables).

### Non-negotiables
- **Colour is never the only signal.** Every state also carries an icon, a label, or a shape.
  Roughly 8 % of men have a colour vision deficiency, and this app is read mid-effort, in bad
  light, by tired people.
- **Contrast is checked for every token against every background of its theme** — `bg-abyss`,
  `bg-surface` and `bg-elevated` — so a token that passes can be used anywhere without a second check:
  - every text, icon, status and hue token ≥ 4.5:1, so any of them may set text;
  - `border-strong` ≥ 3:1. `border-subtle` is decorative and exempt, which is why it is never the only
    thing marking a control;
  - `text-primary` ≥ 7:1, and it is **the only colour a live-workout numeral may use**;
  - `text-primary` on `accent-deep` ≥ 7:1, because a selected RIR chip is a workout numeral, and
    `text-on-accent` on `accent` ≥ 4.5:1.
- **A selected state is three signals:** an `accent-deep` fill, an `accent` edge, and its label or
  check mark. Never the fill alone — in light mode the fill is a tint that barely separates from the
  surface, on purpose.
- Charts follow the `dataviz` conventions, drawing categorical colours from the four discipline
  hues rather than inventing a second palette.

---

## 4. Typography

**Numbers are the product.** A weight, a rep count, an RIR chip, a running pace — these are read
in a glance, at arm's length, while breathing hard.

| Role | Face | Notes |
|---|---|---|
| UI | **Inter** | Variable, excellent legibility at small sizes |
| Numerals | **Inter, tabular figures** (`font-variant-numeric: tabular-nums`) | **Mandatory** for any changing number |
| Display / wordmark | **Inter Display**, tight tracking | Or a geometric grotesque if the brand later wants more character |
| Code / debug | System mono | Not user-facing |

**Tabular figures are a hard requirement, not a preference.** A live pace readout with
proportional digits shifts horizontally on every update; it looks broken and is measurably harder
to read while moving.

### Scale (dp)

| Token | Size / line | Face | Use |
|---|---|---|---|
| `display` | 48 / 52 | Inter Display SemiBold, tabular | The one number on a live screen |
| `metric-lg` | 34 / 38 | Inter Display SemiBold, tabular | Set weight, activity distance |
| `metric` | 24 / 28 | Inter SemiBold, tabular | Secondary metrics |
| `title` | 20 / 26 | Inter SemiBold | Screen titles |
| `body` | 16 / 22 | Inter Regular | Default |
| `label` | 14 / 18 | Inter Medium | Field labels |
| `caption` | 12 / 16 | Inter Regular | Hints, units, timestamps |

Units are always set one step smaller than their number and in `text-secondary` — `**62.5** kg`,
never `62.5 KG` at equal weight. System font scaling is respected up to 200 %; layouts reflow rather
than truncate.

**Font files.** Static cuts of Inter 4.1, bundled with the app under the SIL Open Font License: Inter Regular, Medium
and SemiBold, and Inter Display SemiBold. Not the variable font: React Native on Android cannot set a variable font's
axes, so its optical sizes would be unreachable. Inter Display already carries its own tighter spacing, so letter
spacing stays 0 in every style.

### Spacing, radii and sizes (dp)

A 4 dp base — Android's 8 dp grid, with half-steps for the tight places.

| Token | dp | Use |
|---|---|---|
| `space-1` | 4 | An icon to its label |
| `space-2` | 8 | Inside a control |
| `space-3` | 12 | Between related controls |
| `space-4` | 16 | Screen edges, card padding |
| `space-6` | 24 | Between groups |
| `space-8` | 32 | Between sections |
| `space-12` | 48 | Around an empty state |

| Token | dp | Use |
|---|---|---|
| `radius-sm` | 4 | Tags, progress bars |
| `radius-md` | 8 | Controls — chips, keys, fields |
| `radius-lg` | 12 | Cards, and a sheet's top corners |

Nothing is fully round except a status dot. A pill-shaped control reads as friendly, and the brand is watchful.

| Token | dp | Use |
|---|---|---|
| `target-min` | 48 | Every tap target (§5) |
| `target-workout` | 56 | Tap targets during a workout or an activity, and the set row's height (§5, §6) |
| `icon` | 24 | Every icon, including the state icons that carry meaning beside a colour |
| `edge-hairline` | 1 | `border-subtle` and `border-strong` |
| `edge-selected` | 2 | A selected control's `accent` edge — a shape signal as well as a colour (INV-24) |

---

## 5. Interaction principles

1. **Three seconds, one thumb, one hand.** The user is mid-set or mid-run. Every in-workout
   action is reachable in the bottom third of the screen by the thumb of the hand holding the
   phone.
2. **Wet, sweaty, gloved, cold.** Tap targets are ≥ 48 dp everywhere and ≥ 56 dp during a
   workout or an activity. The pool-swim length counter (FR-4.13) is far larger still. No
   precision gestures, no small close buttons, no swipe-only actions without a visible
   alternative.
3. **The app never blocks on the network.** No spinner stands between the user and logging a set
   ([ADR-001](decisions/ADR-001.md)). Sync is ambient and quiet.
4. **Progressive disclosure.** RIR, deload policy and progression strategy are all optional
   surfaces. A newcomer logs weight and reps and is never blocked by vocabulary they do not have
   yet; an advanced user reaches every control without digging. **This is new with multi-user** —
   the earlier single-user premise let us assume fluency, and that assumption is now retired.
5. **Show the reason.** When a number changes — "62.5 kg, +2.5 kg from last cycle (target met)" —
   the cause is visible. The planner is only trustworthy if it explains itself.
6. **Never nag.** No streak-panic, no guilt, no dark patterns. Enforced by
   [ADR-005](decisions/ADR-005.md).
7. **Two languages and two unit systems, neither an afterthought.** Every screen is designed in
   English and in Portuguese — which runs 20–30 % longer — and in kilograms and in pounds
   ([ADR-008](decisions/ADR-008.md)). Layouts reflow rather than truncate. Numbers follow the
   locale (`62,5 kg` in pt-BR, `137.5 lb` for an imperial user), and a unit is always set one step
   smaller than its number (§4), in either language.

---

## 6. Core screens

### The set row — the single most important component
```
┌──────────────────────────────────────────────────┐
│  3    40 kg   ×   6      RIR 2            ✓      │   ← 56 dp tall
│       40 × 6 @2 last time                        │   ← caption, text-muted
└──────────────────────────────────────────────────┘
```
- Custom numeric keypad that **never covers the row being edited**. The OS keyboard is not used
  for weights — it is slow, it fights the decimal separator (a Brazilian locale uses `,`), and it
  eats the screen.
  - **Reserving the keypad's height as list padding is part of the rule, not an implementation detail.** The scroll
    geometry may compute a perfect offset and a `ScrollView` will still clamp it to `content − viewport`: with one
    exercise logged the content is barely taller than the viewport, the clamp is about zero, and the row does not
    move at all. On a 2340 px phone that is invisible; on a 1600 px screen the keypad covered the edited row
    completely. *(Found and fixed 2026-09-21, task 004 stage 3 device pass.)*
- RIR is a chip row `0 1 2 3 4 5+` — **one tap, never typed** (FR-2.10).
- ✓ advances focus to the next set. Haptic on completion.
- Previous performance is always visible, never a tap away.
- **The ✓ never wraps.** It is a fixed column beside the numbers, not a word in their sentence, and it stays a full
  56 dp target vertically centred however the numbers reflow. *(Changed 2026-09-21: it used to take part in the wrap
  and, on a Galaxy S21 FE at font scale 0.86, lost by about three dp — breaking to a second line with a third of the
  row empty beside it. Task 004 stage 3 device pass.)*

> **⚠ Open question — must the numbers hold one line at default font scale, and what pays for it?**
>
> The picture above shows one line, and on a 360 dp phone the numbers do not fit one at default scale. Measured on a
> Galaxy S21 FE, scale 1.0: 312 dp of row, 64 for the ✓ and its gap, ~250 needed by `40 kg × 6 RIR 7` against the 248
> left — it loses by about two dp. And that is the *easy* case: the realistic heavy set, **`100 kg × 12 RIR 10`, wraps
> at every scale**, so no amount of gap-shaving reaches "always one line" while the numerals stay the size INV-24
> wants them mid-effort.
>
> Tightening the inter-number gap from `space[2]` to `space[1]` was tried on the device: it wins the line at 0.86 and
> **still loses at 1.0**, so it was reverted rather than kept — cramping the most important component in the app for a
> case it does not win is the wrong trade.
>
> Three ways out, none of them taken yet, because this is a design call and not an implementation detail:
> 1. **Accept the reflow.** `RIR n` drops beneath the weight and reps, the ✓ stays anchored, and the picture above is
>    redrawn as two lines. Costs nothing but the drawing; the row grows to ~96 dp for long values.
> 2. **Drop the leading set number** from the visual row, keeping it in the spoken sentence. It is not in the picture
>    above in the first place, and it buys ~32 dp — enough for one line at default scale for ordinary values.
> 3. **Shrink the unit label** (`kg` / `lb`) or drop it once the header states the unit. Buys ~20 dp, and costs the
>    at-a-glance unit an imperial user arguably needs most.
>
> Until this is answered the row reflows, which is correct behaviour against the criterion that matters — *reflowed,
> never truncated, every target still 56 dp* — and wrong against the picture.
>
> **This is not only a drawing question: it decides the short-screen keypad rule below.** A wrapped row is ~124 dp
> tall, and on a 1600 px screen the list has ~78 dp of clear space above the keypad — so a wrapped row *cannot* be
> fully revealed, while a one-line 56 dp row fits with room over. Answering this answers both.

### Live cardio
One dominant metric in `display` size, chosen by the sport profile (INV-19), with three or four
secondary metrics beneath. A ride shows km/h; a run shows min/km; a pool swim shows lengths and
has **no map at all**. Controls are large and bottom-anchored.

### Plan / block view
**Two views that must agree** (FR-3.3a, INV-25):
- **Cycle view** — microcycle × day index. A 9-day microcycle is nine columns, not "a week and a
  bit". This is how a programme is authored.
- **Calendar view** — real dates. This is what answers "what am I doing Thursday", and with a
  non-7-day cycle it looks nothing like the cycle view.

Deload cycles visually distinct (desaturated, marked). Status per cycle is a shape as well as a
colour (INV-24). Any cycle is tappable, including future ones.

### Today
The default screen. What is prescribed today from either half, one tap to start. Nothing else
competes for attention.

### Progress
**A plain list of the user's own tracks** — nothing more. One row per active track: name, level,
XP toward the next level, and what earned the most recent award, stated as a fact ("Deload cycle
completed as prescribed · +300").

A gym-and-swim user sees six rows: Strength, Pool swim, and the four quality tracks. They do not
see a Ride row at zero, and there is no "add a sport" affordance — logging one is what creates its
track ([08 §2](08-gamification.md)).

No avatar, no figure, no radial chart, no arms (§2). The screen's job is to state what is true,
legibly, and then get out of the way.

---

## 7. Motion

**Damped, never bouncy.** The house easing is a critically-damped curve — motion as if moving
through water, settling without overshoot. Spring physics with visible bounce is banned; it reads
as playful, and this brand is not.

**The curve, exactly: `cubic-bezier(0.18, 0, 0.06, 1)`.** It is a fit to a critically-damped step response,
`x(t) = 1 − (1 + ωt)·e^(−ωt)`, with the motion ending once it is within 0.5 % of rest: it starts from rest, never
overshoots, and stays within 2.6 % of the physical curve. It is written once, as a curve, and every animation is a
timing with it — a spring API is banned by lint even when configured as critically damped
([ADR-014](decisions/ADR-014.md)).

| Motion | Duration | Easing |
|---|---|---|
| State change (tap, toggle) | 120 ms | house |
| Transition (screen, sheet) | 240 ms | house |
| Emphasis (PR, level-up) | 600 ms, once | house |
| Cross-fade (any of the above, under reduce motion) | 120 ms | linear |

Reduce-motion settings are honoured: every transition becomes a 120 ms cross-fade and the emphasis animation is
replaced with a static state — so with reduce motion on, nothing travels and nothing lasts longer than a cross-fade.
No decorative or looping animation anywhere — an idle animation is battery the user did not agree to spend.

---

## 8. Accessibility

Not a checklist item; the operating conditions demand it.

- WCAG 2.2 AA minimum; live-workout numerals aim higher (§3).
- Full screen-reader labelling, including the set row, where the accessible label states set
  number, weight, reps and RIR as one coherent sentence.
- System font scaling to 200 % without loss of function — Android font size now, Dynamic Type when
  iOS ships ([task 016](tasks/016-ios-platform.md)).
- Reduce-motion and reduce-transparency honoured.
- No information conveyed by colour alone (§3).
- Every custom control (numeric keypad, RIR chips, lap counter) gets explicit accessibility
  roles and hints — custom controls are where accessibility usually silently fails.

---

## 9. Deliverables and open questions

**To produce**
- The mark, at all four reduction levels, in light and dark, as SVG.
- App icon, splash, notification icon, favicon.
- The design tokens above as a shared source consumed by `src/ui/` — a token file, not values
  copy-pasted into components.
- Component inventory: set row, RIR chips, numeric keypad, metric tile, cycle cell, chip, sheet,
  segmented control, empty state, level-up state.
- **A terminology glossary for both languages** ([ADR-008](decisions/ADR-008.md)), decided once so
  that vocabulary is not chosen screen by screen:

  | English | Português (Brasil) | Note |
  |---|---|---|
  | RIR | RIR | Kept as the acronym; explained as *repetições em reserva* |
  | e1RM | 1RM estimado | |
  | Microcycle · Mesocycle | Microciclo · Mesociclo | Standard periodisation vocabulary |
  | Deload | Deload | Used untranslated in Brazilian gyms; *semana leve* only in explanations |
  | Set · Rep | Série · Repetição | |
  | Working set · Warm-up | Série válida · Aquecimento | The set-type chip reads *Válida* |
  | Track (gamification) | Trilha | **Conflict:** the sport *hike* is also *Trilha*. Open — see below |
  | Pace | Ritmo | |
  | Device (signed in) | Aparelho | Only for phones and tablets; a gym machine is always *máquina* |
  | Sign in · Sign out | Entrar · Sair | |
  | Privacy zone | Zona de privacidade | |
  | Weight (on a set) | Carga | Never *peso*, which is body weight |

  The Portuguese column is a starting position, **to be reviewed by a native speaker who trains**.
  Terminology that reads as translated rather than native is its own kind of bug.

  **An AI pre-check was run on 2026-09-14** over both catalogs — every exercise name, every screen and
  email — against this table and ordinary Brazilian gym usage. It fixed what it could and left two
  questions: the *Trilha* conflict above, and whether *Afundo* and *Avanço* should stay two words for
  lunges. It does not replace the native-speaker review, which stays a launch blocker.

**Open**
1. **Trademark clearance on "CyberAthlete"** (§1, Naming due diligence) — needed before any store
   submission or spend on the name.
2. **Illustration style beyond the mark** — empty states and onboarding. Recommendation:
   technical line diagrams in the same language as the mark, never spot illustrations of smiling
   people exercising.

*(The former third question — whether the personal octopus survives prototyping — is closed. The
personal octopus is not built at all; see §2.)*
