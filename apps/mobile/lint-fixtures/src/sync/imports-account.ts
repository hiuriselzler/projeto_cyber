// expect: boundaries/dependencies
// src/sync never imports src/account (ADR-012).
import { bootstrapAccount } from '@/account/bootstrap';

export const reached = bootstrapAccount;
