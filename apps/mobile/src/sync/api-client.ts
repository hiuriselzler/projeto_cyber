/**
 * The app's only HTTP client. src/sync is the only folder allowed to talk to the network.
 *
 * Transport rule (04 §5): a release build talks to the API over https only. A debug build may also
 * use http, but only to this machine — reached from a physical device over `adb reverse`. Android's
 * network security config enforces the same rule underneath (plugins/withDebugOnlyLocalhostCleartext.js).
 */

export type BuildKind = 'debug' | 'release';

export interface ApiResponse {
  readonly status: number;
  readonly body: string;
}

export interface ApiClient {
  readonly baseUrl: string;
  get(path: string): Promise<ApiResponse>;
}

export class InsecureApiBaseUrlError extends Error {
  constructor(reason: string) {
    super(`refusing the API base URL: ${reason} (04 §5)`);
    this.name = 'InsecureApiBaseUrlError';
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const DEBUG_DEFAULT_BASE_URL = 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = 10_000;

// Parsed by hand: React Native's URL implementation does not reliably expose the hostname.
const HTTP_URL = /^(https?):\/\/([^/:?#\s]+)(?::\d{1,5})?(?:\/\S*)?$/i;

export function currentBuildKind(): BuildKind {
  return __DEV__ ? 'debug' : 'release';
}

/** Returns the base URL, without a trailing slash, if this build may use it; throws otherwise. */
export function assertApiBaseUrlAllowed(baseUrl: string, build: BuildKind): string {
  const candidate = baseUrl.trim();
  const match = HTTP_URL.exec(candidate);
  if (match === null) {
    throw new InsecureApiBaseUrlError(`"${baseUrl}" is not an http or https URL`);
  }
  const [, scheme = '', host = ''] = match;
  if (scheme.toLowerCase() !== 'https') {
    if (build === 'release') {
      throw new InsecureApiBaseUrlError('a release build talks to the API over https only');
    }
    if (!LOCAL_HOSTS.has(host.toLowerCase())) {
      throw new InsecureApiBaseUrlError(
        'a debug build uses http only to localhost, reached over adb reverse',
      );
    }
  }
  return candidate.replace(/\/+$/, '');
}

export function createApiClient(baseUrl: string, build: BuildKind): ApiClient {
  const allowedBaseUrl = assertApiBaseUrlAllowed(baseUrl, build);
  return {
    baseUrl: allowedBaseUrl,
    async get(path) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${allowedBaseUrl}${path}`, { signal: controller.signal });
        return { status: response.status, body: await response.text() };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/** The client for this build, from EXPO_PUBLIC_API_BASE_URL, which Expo inlines at build time. */
export function createConfiguredApiClient(): ApiClient {
  const build = currentBuildKind();
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured === undefined || configured === '') {
    if (build === 'release') {
      throw new InsecureApiBaseUrlError('EXPO_PUBLIC_API_BASE_URL is not set for this release build');
    }
    return createApiClient(DEBUG_DEFAULT_BASE_URL, build);
  }
  return createApiClient(configured, build);
}

/**
 * Debug diagnostics only: a raw request that skips the guard above, to show that Android's network
 * security config refuses cleartext on its own. A failure here can also mean nothing is listening;
 * logcat's "Cleartext HTTP traffic … not permitted" is what distinguishes the two.
 */
export async function probeRawRequest(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    return `reached, HTTP ${response.status} — cleartext was NOT refused`;
  } catch (error) {
    return `request failed: ${String(error)}`;
  }
}
