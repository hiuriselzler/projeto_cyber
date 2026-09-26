/**
 * The domain core, from the client's side: pure, synchronous, no React, no Expo, no clock, no
 * randomness (INV-10). Under ADR-004 option B, a thin wrapper over the `@cyberathlete/core-native`
 * binding — the only folder allowed to import it (ADR-012).
 *
 * **No calculation may appear in this file.** A total computed here rather than in `core-rs` is
 * precisely the divergence ADR-004 exists to prevent: it would run on the phone and nowhere else,
 * and the server would quietly disagree with it. Everything below marshals and delegates.
 */
import {
  countedSetCount as nativeCountedSetCount,
  detectPrs as nativeDetectPrs,
  e1rm as nativeE1rm,
  e1rmSeries as nativeE1rmSeries,
  isCountedSet as nativeIsCountedSet,
  loadKg as nativeLoadKg,
  missingForCompletion as nativeMissingForCompletion,
  personalBests as nativePersonalBests,
  PrKind as NativePrKind,
  RoundingMode as NativeRoundingMode,
  roundToIncrement,
  sessionMetrics as nativeSessionMetrics,
  SetField as NativeSetField,
  SetType as NativeSetType,
  Tracking as NativeTracking,
  volumeKg as nativeVolumeKg,
  type LoggedSet as NativeLoggedSet,
  type PersonalBests as NativePersonalBests,
  type PrAchievement as NativePrAchievement,
} from '@cyberathlete/core-native';

export type RoundingMode = 'nearest' | 'down' | 'up';

const NATIVE_MODE: Record<RoundingMode, NativeRoundingMode> = {
  nearest: NativeRoundingMode.Nearest,
  down: NativeRoundingMode.Down,
  up: NativeRoundingMode.Up,
};

/** Round a load to a multiple of an increment (INV-02). See core-rs/src/progression/rounding.rs. */
export function roundLoadToIncrement(weightKg: number, incrementKg: number, mode: RoundingMode): number {
  return roundToIncrement(weightKg, incrementKg, NATIVE_MODE[mode]);
}

// ── Strength (task 004) ──────────────────────────────────────────────────────────────────────────

/** The five values of the schema's `set_type` column (03 §4). */
export type SetType = 'warmup' | 'working' | 'drop' | 'backoff' | 'amrap';

const NATIVE_SET_TYPE: Record<SetType, NativeSetType> = {
  warmup: NativeSetType.Warmup,
  working: NativeSetType.Working,
  drop: NativeSetType.Drop,
  backoff: NativeSetType.Backoff,
  amrap: NativeSetType.Amrap,
};

/** The four values of the schema's `pr_kind` column (03 §4). */
export type PrKind = 'max_weight' | 'best_e1rm' | 'max_reps_at_weight' | 'best_session_volume';

const PR_KIND_NAME = new Map<NativePrKind, PrKind>([
  [NativePrKind.MaxWeight, 'max_weight'],
  [NativePrKind.BestE1rm, 'best_e1rm'],
  [NativePrKind.MaxRepsAtWeight, 'max_reps_at_weight'],
  [NativePrKind.BestSessionVolume, 'best_session_volume'],
]);

/**
 * One logged set, as the core wants it.
 *
 * `bodyWeightKg` and `isDeload` are already resolved by the caller: both are database reads, and
 * the core does none (INV-10). Body weight must be the latest entry **on or before this set's
 * `local_date`** — not today's, or every past pull-up's e1RM moves each time the user weighs in
 * (INV-07, INV-17).
 *
 * `rir: null` is "not recorded" and is never sent as 0 (INV-03). Weights are kilograms, always:
 * storage is SI and conversion belongs to `src/ui/`'s formatting module alone (INV-01).
 */
export interface LoggedSet {
  readonly setType: SetType;
  readonly isCompleted: boolean;
  /** Added load for a bodyweight exercise, total load for any other. */
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly rir: number | null;
  readonly usesBodyweight: boolean;
  readonly bodyWeightKg: number | null;
  readonly isDeload: boolean;
}

/** What an exercise's records stood at before the session being judged. */
export interface PersonalBests {
  readonly maxWeightKg: number | null;
  readonly bestE1rmKg: number | null;
  readonly bestSessionVolumeKg: number | null;
  readonly bestRepsAtWeight: readonly { readonly weightKg: number; readonly reps: number }[];
}

/** One record broken in the session just finished. */
export interface PrAchievement {
  readonly kind: PrKind;
  readonly value: number;
  readonly weightKg: number | null;
  readonly reps: number | null;
  readonly rir: number | null;
  /** Which set in the list handed in, by position. Null for a session total. */
  readonly setIndex: number | null;
}

/**
 * UniFFI renders a Rust `Option` as an optional property — `number | undefined` — while SQLite and
 * the rest of the app speak `null`. These two functions are the whole of that translation, and they
 * matter more than they look: INV-03 turns on "not recorded" staying distinguishable from 0, and a
 * `rir` that arrived back as `undefined` would slip past every `=== null` check written against it.
 */
function absent<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function present<T>(value: T | undefined): T | null {
  return value ?? null;
}

function toNative(set: LoggedSet): NativeLoggedSet {
  return {
    setType: NATIVE_SET_TYPE[set.setType],
    isCompleted: set.isCompleted,
    weightKg: absent(set.weightKg),
    reps: absent(set.reps),
    rir: absent(set.rir),
    usesBodyweight: set.usesBodyweight,
    bodyWeightKg: absent(set.bodyWeightKg),
    isDeload: set.isDeload,
  };
}

function toNativeBests(bests: PersonalBests): NativePersonalBests {
  return {
    maxWeightKg: absent(bests.maxWeightKg),
    bestE1rmKg: absent(bests.bestE1rmKg),
    bestSessionVolumeKg: absent(bests.bestSessionVolumeKg),
    bestRepsAtWeight: bests.bestRepsAtWeight.map((best) => ({ weightKg: best.weightKg, reps: best.reps })),
  };
}

function fromNativeBests(bests: NativePersonalBests): PersonalBests {
  return {
    maxWeightKg: present(bests.maxWeightKg),
    bestE1rmKg: present(bests.bestE1rmKg),
    bestSessionVolumeKg: present(bests.bestSessionVolumeKg),
    bestRepsAtWeight: bests.bestRepsAtWeight.map((best) => ({ weightKg: best.weightKg, reps: best.reps })),
  };
}

function fromNativePr(pr: NativePrAchievement): PrAchievement {
  const kind = PR_KIND_NAME.get(pr.kind);
  // Unreachable while the binding and this map agree; throwing names the drift rather than letting
  // an unknown kind reach a celebration screen.
  if (kind === undefined) throw new Error(`unknown PR kind from the core: ${String(pr.kind)}`);
  return {
    kind,
    value: pr.value,
    weightKg: present(pr.weightKg),
    reps: present(pr.reps),
    rir: present(pr.rir),
    setIndex: present(pr.setIndex),
  };
}

/** Whether a set counts toward volume, PRs and set counts (INV-04). */
export function isCountedSet(set: LoggedSet): boolean {
  return nativeIsCountedSet(toNative(set));
}

/** The load a set moved, including the lifter for a bodyweight exercise (INV-07, FR-2.15a). */
export function loadKg(set: LoggedSet): number | null {
  return present(nativeLoadKg(toNative(set)));
}

/** The estimated one-rep max, or null where INV-07 refuses to guess — a blank RIR included. */
export function e1rm(set: LoggedSet): number | null {
  return present(nativeE1rm(toNative(set)));
}

/**
 * {@link e1rm} over many sets in one crossing of the native boundary.
 *
 * What a chart should call. Asking per point would make one JSI hop per row, which is the cost the
 * batch shapes in this file exist to avoid.
 */
export function e1rmSeries(sets: readonly LoggedSet[]): (number | null)[] {
  return nativeE1rmSeries(sets.map(toNative)).map(present);
}

/** Total tonnage of the counted sets, in kilograms (INV-04). */
export function volumeKg(sets: readonly LoggedSet[]): number {
  return nativeVolumeKg(sets.map(toNative));
}

/** How many of these sets counted (INV-04). */
export function countedSetCount(sets: readonly LoggedSet[]): number {
  return nativeCountedSetCount(sets.map(toNative));
}

/**
 * Every record the session broke, in the core's fixed order (FR-2.15, INV-04, INV-08).
 *
 * Per exercise: the caller runs it once for each exercise in the finished workout. The device keeps
 * no `personal_records` table — it is a server-side cache and the phone recomputes (03 §4, §8) — so
 * `previous` comes from {@link personalBests} over the exercise's other sessions.
 */
export function detectPrs(previous: PersonalBests, session: readonly LoggedSet[]): PrAchievement[] {
  return nativeDetectPrs(toNativeBests(previous), session.map(toNative)).map(fromNativePr);
}

/**
 * An exercise's bests after a history of sessions — one workout's sets per session — which is the
 * `previous` {@link detectPrs} judges against (task 004 stage 6).
 *
 * The fold is the core's, not this file's: working out a best applies INV-04 and INV-08 exactly as
 * detection does, and a loop here would be the second copy of both. The whole history crosses the
 * boundary in one call.
 */
export function personalBests(sessions: readonly (readonly LoggedSet[])[]): PersonalBests {
  return fromNativeBests(nativePersonalBests(sessions.map((session) => session.map(toNative))));
}

/** One session of one exercise, reduced to what its history charts (task 004 stage 7). */
export interface SessionMetrics {
  /** The heaviest load of any counted set, lifter included. Null when none has a known load. */
  readonly topLoadKg: number | null;
  /** The highest e1RM of any counted set. Null is a gap in the chart, never a zero (INV-03, INV-07). */
  readonly bestE1rmKg: number | null;
  /** Tonnage of the counted sets. Null when no counted set has a load and reps — nothing to plot. */
  readonly volumeKg: number | null;
  readonly countedSets: number;
}

/**
 * {@link SessionMetrics} for each session, in the order given — a whole history in one crossing. The top set and the
 * best e1RM are aggregations over what counts (INV-04, INV-07), so they are the core's, not a chart's.
 */
export function sessionMetrics(sessions: readonly (readonly LoggedSet[])[]): SessionMetrics[] {
  return nativeSessionMetrics(sessions.map((session) => session.map(toNative))).map((metrics) => ({
    topLoadKg: present(metrics.topLoadKg),
    bestE1rmKg: present(metrics.bestE1rmKg),
    volumeKg: present(metrics.volumeKg),
    countedSets: metrics.countedSets,
  }));
}

/** The four values of the schema's `tracking` column (03 §2, FR-2.3). */
export type Tracking = 'weight_reps' | 'reps_only' | 'duration' | 'distance_duration';

const NATIVE_TRACKING: Record<Tracking, NativeTracking> = {
  weight_reps: NativeTracking.WeightReps,
  reps_only: NativeTracking.RepsOnly,
  duration: NativeTracking.Duration,
  distance_duration: NativeTracking.DistanceDuration,
};

/** A field a set can be missing before it is completed, named as the set row names it. */
export type CompletionField = 'reps' | 'durationS' | 'distanceM';

const COMPLETION_FIELD = new Map<NativeSetField, CompletionField>([
  [NativeSetField.Reps, 'reps'],
  [NativeSetField.DurationS, 'durationS'],
  [NativeSetField.DistanceM, 'distanceM'],
]);

/**
 * What a set of this tracking mode must hold before it can be completed, or null if it holds it — 03 §4's
 * "`is_completed = true` requires the fields its tracking mode needs" (task 004 stages 5c and 8).
 *
 * Reps for the two rep modes, the time for a hold, the distance for a carry; **weight is never required**. The rule is
 * the core's, so the ✓ on the phone and the API's `422` are one function, not two that agree until one changes.
 */
export function missingForCompletion(
  tracking: Tracking,
  set: { readonly reps: number | null; readonly durationS: number | null; readonly distanceM: number | null },
): CompletionField | null {
  const missing = nativeMissingForCompletion(NATIVE_TRACKING[tracking], {
    reps: absent(set.reps),
    durationS: absent(set.durationS),
    distanceM: absent(set.distanceM),
  });
  if (missing === undefined) return null;
  const field = COMPLETION_FIELD.get(missing);
  // Unreachable while the binding and this map agree; throwing names the drift.
  if (field === undefined) throw new Error(`unknown set field from the core: ${String(missing)}`);
  return field;
}
