import { useEffect, useState } from 'react';
import { serverNow } from '../sync/room-store';

/** Server-clock time, refreshed every `intervalMs` (0 = never refresh). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!intervalMs) return;
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
