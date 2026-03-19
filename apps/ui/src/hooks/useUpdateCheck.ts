import { useState, useEffect } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = () => {
      fetch('/health')
        .then(r => r.json())
        .then(data => { if (data.updateAvailable) setUpdateAvailable(true); })
        .catch(() => {});
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, []);

  return {
    updateAvailable: updateAvailable && !dismissed,
    dismiss: () => setDismissed(true),
  };
}
