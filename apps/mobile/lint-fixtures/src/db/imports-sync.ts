// expect: boundaries/dependencies
// The local database never calls the network.
import { createApiClient } from '@/sync';

export const reached = createApiClient;
