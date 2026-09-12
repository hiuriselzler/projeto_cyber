// expect: boundaries/dependencies
// A feature never calls the sync layer; account flows go through src/account (ADR-012).
import { createApiClient } from '@/sync';

export const reached = createApiClient;
