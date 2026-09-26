// expect: no-restricted-syntax [fence:void-dependency]
import { useMemo, useState } from 'react';

declare function read(): number[];

export function useList() {
  const [revision] = useState(0);
  return useMemo(() => {
    void revision;
    return read();
  }, [revision]);
}
