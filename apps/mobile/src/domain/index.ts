/**
 * The domain core, from the client's side: pure, synchronous, no React, no Expo, no clock, no
 * randomness (INV-10). Under ADR-004 option B, a thin wrapper over the core-rs binding — the only
 * folder allowed to import it (ADR-012). Under option A, the TypeScript implementation.
 *
 * Empty until the ADR-004 spike.
 */
export {};
