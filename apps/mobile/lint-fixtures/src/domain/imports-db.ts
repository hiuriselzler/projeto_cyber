// expect: boundaries/dependencies
// The domain imports nothing from src/ (INV-10).
import { db } from '@/db/client';

export const reached = db;
