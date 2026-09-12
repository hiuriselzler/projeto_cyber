import { create } from 'zustand';

interface DiagnosticsState {
  readonly taps: number;
  tap: () => void;
}

/** Zustand's smoke test: ephemeral UI state only, never the only copy of data (INV-09). */
export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  taps: 0,
  tap: () => set((state) => ({ taps: state.taps + 1 })),
}));
