import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useSession } from './useSession';

/**
 * Shows its children to a signed-in user and sends everyone else to sign in. Restoring takes no network (NFR-1), so the
 * wait is a local read, shown as the splash's ground.
 */
export function SessionGate({ children }: { readonly children: ReactNode }) {
  const session = useSession();
  if (session.status === 'restoring') {
    return null;
  }
  if (session.status === 'signed-out') {
    return <Redirect href="/auth/sign-in" />;
  }
  return children;
}
