// expect: boundaries/dependencies
// A feature never touches the privacy key; src/account calls src/crypto on its behalf (ADR-012).
import { readDiagnosticsProbe } from '@/crypto';

export const reached = readDiagnosticsProbe;
