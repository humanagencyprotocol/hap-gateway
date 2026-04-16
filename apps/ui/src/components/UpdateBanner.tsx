import { useEffect, useRef, useState } from 'react';
import { useUpdateCheck } from '../hooks/useUpdateCheck';

// Clear any previous container by name AND by port (handles the case where
// an older instance was started under a different name), then pull and run.
const UPDATE_CMD = 'docker rm -f hap-gateway 2>/dev/null; docker ps -q --filter publish=7400 --filter publish=7430 | xargs -r docker rm -f; docker pull ghcr.io/humanagencyprotocol/hap-gateway:latest && docker run -d --name hap-gateway -p 7400:3000 -p 7430:3030 -v $HOME/.hap:/app/data ghcr.io/humanagencyprotocol/hap-gateway';

export function UpdateBanner() {
  const { updateAvailable } = useUpdateCheck();
  const show = updateAvailable;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Push sidebar + main-content down by the banner's measured height so it
  // doesn't overlap content. Uses a CSS var read by the layout rules.
  useEffect(() => {
    if (!show) {
      document.documentElement.style.removeProperty('--update-banner-h');
      document.body.classList.remove('has-update-banner');
      return;
    }
    document.body.classList.add('has-update-banner');
    const measure = () => {
      const h = ref.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty('--update-banner-h', `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--update-banner-h');
      document.body.classList.remove('has-update-banner');
    };
  }, [show, expanded]);

  if (!show) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(UPDATE_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — leave feedback untouched */
    }
  };

  return (
    <div ref={ref} className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-row">
        <span className="update-banner-text">Update available.</span>
        <button
          type="button"
          className={`btn btn-sm ${expanded ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? 'Hide' : 'Update'}
        </button>
      </div>

      {expanded && (
        <>
          <p className="update-banner-hint">
            Paste this into your terminal (Terminal on macOS/Linux, PowerShell on Windows) to update:
          </p>
          <div className="update-banner-row update-banner-cmd-row">
            <code className="update-banner-cmd">{UPDATE_CMD}</code>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleCopy}
            >
              {copied ? 'Copied' : 'Copy Command'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
