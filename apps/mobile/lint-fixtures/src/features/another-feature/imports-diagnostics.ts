// expect: boundaries/dependencies
// Features never import another feature; anything shared moves down into domain, db or ui.
import { DiagnosticsScreen } from '@/features/diagnostics';

export const reached = DiagnosticsScreen;
