// expect: boundaries/dependencies
// A design-system primitive takes props; it never reads the database.
import { db } from '@/db/client';

export const reached = db;
