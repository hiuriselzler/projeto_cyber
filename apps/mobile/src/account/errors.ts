/**
 * Why an account flow did not complete, as a code a screen turns into words (`account.errors.<code>`, INV-27).
 */
import { PrivacyKeyError } from '@/crypto';
import { ApiUnreachableError, SessionEndedError, type ApiResponse } from '@/sync';

export const ACCOUNT_ERROR_CODES = [
  'invalid_credentials',
  'email_unavailable',
  'email_unchanged',
  'password_too_short',
  'password_too_long',
  'password_breached',
  'password_incorrect',
  'invalid_token',
  'email_unverified',
  'rate_limited',
  'offline',
  'signed_out',
  'privacy_key_missing',
  'unknown',
] as const;

export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number];

const KNOWN: ReadonlySet<string> = new Set(ACCOUNT_ERROR_CODES);

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(`account: ${code}`);
    this.name = 'AccountError';
  }
}

/** The API's `{"error": code}`, when this build knows the code. */
export function accountErrorFrom(response: ApiResponse): AccountError {
  if (response.status === 429) {
    return new AccountError('rate_limited');
  }
  try {
    const { error } = JSON.parse(response.body) as { error?: unknown };
    if (typeof error === 'string' && KNOWN.has(error)) {
      return new AccountError(error as AccountErrorCode);
    }
  } catch {
    // Not the API's error shape: a proxy's page, an empty body.
  }
  return new AccountError('unknown');
}

export function asAccountError(error: unknown): AccountError {
  if (error instanceof AccountError) {
    return error;
  }
  if (error instanceof ApiUnreachableError) {
    return new AccountError('offline');
  }
  if (error instanceof SessionEndedError) {
    return new AccountError('signed_out');
  }
  if (error instanceof PrivacyKeyError && error.reason === 'missing') {
    return new AccountError('privacy_key_missing');
  }
  return new AccountError('unknown');
}
