/**
 * GHCR update checker — compares the running image digest against latest.
 * Checks every hour. No-op when running in local dev (HAP_BUILD_SHA=dev).
 */

const IMAGE = 'humanagencyprotocol/hap-gateway';
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const INITIAL_DELAY = 30_000; // 30 seconds after boot

let updateAvailable = false;
let latestDigest: string | null = null;
const runningSha = process.env.HAP_BUILD_SHA ?? 'dev';

export function getUpdateStatus() {
  return { updateAvailable, runningSha };
}

async function getToken(): Promise<string> {
  const res = await fetch(
    `https://ghcr.io/token?scope=repository:${IMAGE}:pull`
  );
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function getDigest(tag: string, token: string): Promise<string | null> {
  const res = await fetch(
    `https://ghcr.io/v2/${IMAGE}/manifests/${tag}`,
    {
      method: 'HEAD',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.oci.image.index.v1+json',
      },
    }
  );
  if (!res.ok) return null;
  return res.headers.get('docker-content-digest');
}

async function check(): Promise<void> {
  if (runningSha === 'dev') return;

  const token = await getToken();
  const shortSha = runningSha.slice(0, 7);

  const [latest, running] = await Promise.all([
    getDigest('latest', token),
    getDigest(shortSha, token),
  ]);

  if (latest && running && latest !== running) {
    updateAvailable = true;
    latestDigest = latest;
  } else if (latest && !running) {
    // Running SHA not found in registry — likely an old or local build
    updateAvailable = true;
    latestDigest = latest;
  } else {
    updateAvailable = false;
  }
}

export function startUpdateChecker(): void {
  if (runningSha === 'dev') return;

  setTimeout(() => {
    check().catch(() => {});
    setInterval(() => check().catch(() => {}), CHECK_INTERVAL);
  }, INITIAL_DELAY);
}
