import { useState, useEffect } from 'react';

interface Props {
  expiresAt: number; // Unix timestamp in seconds
}

const DAY = 86400;
const HOUR = 3600;
const MIN = 60;
const MONTH = 30 * DAY; // approx — for display only

/**
 * Adaptive TTL format:
 * - > 90 days: "4 months"
 * - 7–90 days: "29 days"
 * - 2–7 days:  "5 days 12h"
 * - 2h – 2d:   "23h 15m"
 * - 1m – 2h:   "34m 12s" (live countdown)
 * - < 1m:      "32s"
 */
function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired';

  if (seconds > 90 * DAY) {
    const mo = Math.floor(seconds / MONTH);
    return `${mo} ${mo === 1 ? 'month' : 'months'} remaining`;
  }

  if (seconds > 7 * DAY) {
    const d = Math.floor(seconds / DAY);
    return `${d} ${d === 1 ? 'day' : 'days'} remaining`;
  }

  if (seconds >= 2 * DAY) {
    const d = Math.floor(seconds / DAY);
    const h = Math.floor((seconds % DAY) / HOUR);
    return `${d} ${d === 1 ? 'day' : 'days'} ${h}h remaining`;
  }

  if (seconds >= 2 * HOUR) {
    const h = Math.floor(seconds / HOUR);
    const m = Math.floor((seconds % HOUR) / MIN);
    return `${h}h ${String(m).padStart(2, '0')}m remaining`;
  }

  if (seconds >= MIN) {
    const m = Math.floor(seconds / MIN);
    const s = Math.floor(seconds % MIN);
    return `${m}m ${String(s).padStart(2, '0')}s remaining`;
  }

  return `${Math.floor(seconds)}s remaining`;
}

export function TTLBadge({ expiresAt }: Props) {
  const [remaining, setRemaining] = useState(() => expiresAt - Date.now() / 1000);

  // Tick every 1s once we're inside 2h; every 60s when the clock is far away.
  const fastTick = remaining < 2 * HOUR;
  useEffect(() => {
    const interval = setInterval(
      () => setRemaining(expiresAt - Date.now() / 1000),
      fastTick ? 1000 : 60_000,
    );
    return () => clearInterval(interval);
  }, [expiresAt, fastTick]);

  const warn = remaining < 300; // < 5 min
  return (
    <span className={`ttl-badge ${warn ? 'ttl-warn' : 'ttl-ok'}`}>
      {formatRemaining(remaining)}
    </span>
  );
}
