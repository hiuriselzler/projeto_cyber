// expect: boundaries/dependencies
// Account flows hold no screens; features import account, never the other way round.
import { HomeScreen } from '@/features/home';

export const reached = HomeScreen;
