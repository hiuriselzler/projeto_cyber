// expect: boundaries/dependencies
// A new folder under src/ may import nothing until it is given rules of its own.
import { createApiClient } from '@/sync';

export const reached = createApiClient;
