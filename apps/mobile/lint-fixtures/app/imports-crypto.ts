// expect: boundaries/dependencies
// A route reaches the privacy key only through src/account (ADR-012).
import { hasPrivacyKey } from '@/crypto';

export const check = hasPrivacyKey;
