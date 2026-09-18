/**
 * The account, for screens: the flows, the session state, and the errors they raise (ADR-012). Screens reach the
 * network and the privacy key only through here.
 */
import { accountServices } from './bootstrap';
import * as flows from './flows';

export type { LocalAccount } from '@/db/account';
export { ACCOUNT_ERROR_CODES, AccountError, type AccountErrorCode } from './errors';
export type { AccountChanges, Credentials, DeviceSession, Registration } from './flows';
export { getSessionState, subscribeToSession, type SessionState } from './session';

export const register = (registration: flows.Registration) => flows.register(accountServices(), registration);
export const signIn = (credentials: flows.Credentials) => flows.signIn(accountServices(), credentials);
export const signOut = () => flows.signOut(accountServices());
export const signOutEverywhere = () => flows.signOutEverywhere(accountServices());
export const changePassword = (change: { readonly currentPassword: string; readonly newPassword: string }) =>
  flows.changePassword(accountServices(), change);
export const requestPasswordReset = (email: string) => flows.requestPasswordReset(accountServices(), email);
export const confirmPasswordReset = (reset: { readonly token: string; readonly newPassword: string }) =>
  flows.confirmPasswordReset(accountServices(), reset);
export const verifyEmail = (token: string) => flows.verifyEmail(accountServices(), token);
export const resendVerification = () => flows.resendVerification(accountServices());
export const changeEmail = (change: { readonly currentPassword: string; readonly newEmail: string }) =>
  flows.changeEmail(accountServices(), change);
export const updateAccount = (changes: flows.AccountChanges) => flows.updateAccount(accountServices(), changes);
export const listSessions = () => flows.listSessions(accountServices());
export const revokeSession = (sessionId: string) => flows.revokeSession(accountServices(), sessionId);
export const requestAccountDeletion = (password: string) => flows.requestAccountDeletion(accountServices(), password);
export const cancelAccountDeletion = () => flows.cancelAccountDeletion(accountServices());
