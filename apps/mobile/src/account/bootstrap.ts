import { createConfiguredApiClient, type ApiClient } from '@/sync';

let apiClient: ApiClient | null = null;

/**
 * What the root layout calls at launch (ADR-012 § Amendment).
 *
 * Today it only proves the API base URL is one this build may use — throwing otherwise, so the app
 * refuses to start (04 §5). Task 003 adds restoring the session; task 006 adds starting sync.
 */
export function bootstrapAccount(): ApiClient {
  apiClient ??= createConfiguredApiClient();
  return apiClient;
}
