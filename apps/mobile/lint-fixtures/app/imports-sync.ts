// expect: boundaries/dependencies
// A route composes features and ui, and never reaches the network layer.
import { createApiClient } from '@/sync';

export const reached = createApiClient;
