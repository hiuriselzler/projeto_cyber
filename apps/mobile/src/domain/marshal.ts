/**
 * The translation between the app's shapes and the binding's, shared by every file in `src/domain/`. Marshalling
 * only — no calculation may appear here, for the reason `index.ts` gives.
 */
import { SetType as NativeSetType, type LoggedSet as NativeLoggedSet } from '@cyberathlete/core-native';

/** The five values of the schema's `set_type` column (03 §4). */
export type SetType = 'warmup' | 'working' | 'drop' | 'backoff' | 'amrap';

export const NATIVE_SET_TYPE: Record<SetType, NativeSetType> = {
  warmup: NativeSetType.Warmup,
  working: NativeSetType.Working,
  drop: NativeSetType.Drop,
  backoff: NativeSetType.Backoff,
  amrap: NativeSetType.Amrap,
};

const SET_TYPE_NAME = new Map<NativeSetType, SetType>(
  (Object.entries(NATIVE_SET_TYPE) as [SetType, NativeSetType][]).map(([name, native]) => [native, name]),
);

/** A set type back from the core. Unreachable failure while the binding and this map agree; it names the drift. */
export function setTypeName(native: NativeSetType): SetType {
  const name = SET_TYPE_NAME.get(native);
  if (name === undefined) throw new Error(`unknown set type from the core: ${String(native)}`);
  return name;
}

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

/**
 * UniFFI renders a Rust `Option` as an optional property — `number | undefined` — while SQLite and
 * the rest of the app speak `null`. These two functions are the whole of that translation, and they
 * matter more than they look: INV-03 turns on "not recorded" staying distinguishable from 0, and a
 * `rir` that arrived back as `undefined` would slip past every `=== null` check written against it.
 */
export function absent<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

export function present<T>(value: T | undefined): T | null {
  return value ?? null;
}

export function toNativeLoggedSet(set: LoggedSet): NativeLoggedSet {
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
