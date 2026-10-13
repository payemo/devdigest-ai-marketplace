import { useEffect, useState } from 'react';

/** True only once `active` has stayed true for `ms` (skeletons shouldn't flash on fast loads). */
export function useDelayedFlag(active, ms = 200) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) { setOn(false); return undefined; }
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return on;
}
