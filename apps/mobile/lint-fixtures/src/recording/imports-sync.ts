// expect: boundaries/dependencies
// Recording writes to the local database; sync uploads later.
import { createApiClient } from '@/sync';

export const reached = createApiClient;
