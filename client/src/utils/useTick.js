import { useEffect, useState } from 'react';

/** Re-renders every `ms` and returns Date.now(). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Milliseconds left until `expiresAt` (0 when expired or unset). */
export function useCountdown(expiresAt) {
  const now = useNow(250);
  return expiresAt ? Math.max(0, expiresAt - now) : 0;
}
