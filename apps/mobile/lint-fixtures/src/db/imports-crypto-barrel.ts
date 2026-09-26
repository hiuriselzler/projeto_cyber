// expect: boundaries/dependencies
// src/db may mint a row id through src/crypto/identifiers.ts (INV-16, ADR-012 § Amendment 2026-09-19)
// and reach nothing else in that folder. The barrel is the rest of the folder, so it is refused —
// which is the whole of what "only that file" means.
import { uuidV7 } from '@/crypto';

export const reached = uuidV7;
