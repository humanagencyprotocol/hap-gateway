import { useUpdateCheck } from '../hooks/useUpdateCheck';

// Clear any previous container by name AND by port (handles the case where
// an older instance was started under a different name), then pull and run.
const UPDATE_CMD = 'docker rm -f hap-gateway 2>/dev/null; docker ps -q --filter publish=7400 --filter publish=7430 | xargs -r docker rm -f; docker pull ghcr.io/humanagencyprotocol/hap-gateway:latest && docker run -d --name hap-gateway -p 7400:3000 -p 7430:3030 -v $HOME/.hap:/app/data ghcr.io/humanagencyprotocol/hap-gateway';

export function UpdateBanner() {
  const { updateAvailable, dismiss } = useUpdateCheck();
  if (!updateAvailable) return null;

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <span className="update-banner-text">Update available.</span>
        <code className="update-banner-cmd">{UPDATE_CMD}</code>
      </div>
      <button className="update-banner-dismiss" onClick={dismiss}>Dismiss</button>
    </div>
  );
}
