/**
 * The domain core, from the client's side: pure, synchronous, no React, no Expo, no clock, no
 * randomness (INV-10). Under ADR-004 option B, a thin wrapper over the `@cyberathlete/core-native`
 * binding — the only folder allowed to import it (ADR-012).
 */
import { RoundingMode as NativeRoundingMode, roundToIncrement } from '@cyberathlete/core-native';

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
