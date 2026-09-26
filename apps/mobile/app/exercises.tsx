import { SessionGate } from '@/features/account';
import { CatalogScreen } from '@/features/strength';

/** The exercise catalog. Thin, like every route: it composes a feature and nothing else. */
export default function Exercises() {
  return (
    <SessionGate>
      <CatalogScreen />
    </SessionGate>
  );
}
