import { useState, useEffect } from 'react';

interface Props {
  expiresAt: number; // Unix timestamp in seconds
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} remaining`;
  return `${m}:${String(s).padStart(2, '0')} remaining`;
}

export function TTLBadge({ expiresAt }: Props) {
  const [remaining, setRemaining] = useState(() => expiresAt - Date.now() / 1000);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(expiresAt - Date.now() / 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const warn = remaining < 300; // < 5 min
  return (
    <span className={`ttl-badge ${warn ? 'ttl-warn' : 'ttl-ok'}`}>
      {formatRemaining(remaining)}
    </span>
  );
}
