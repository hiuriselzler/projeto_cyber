// expect: boundaries/dependencies
// The root layout may call db/'s migration entry point, and nothing else in db/ (ADR-012 § Amendment).
import { readLocalDatabaseState } from '@/db/diagnostics';

export const reached = readLocalDatabaseState;
