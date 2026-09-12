// expect: boundaries/dependencies
// src/crypto imports nothing from src/.
import { describePlatform } from '@/platform';

export const reached = describePlatform;
