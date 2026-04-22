/**
 * GHCR update checker — compares running build against latest on GHCR.
 *
 * - Boots with a 30s initial delay to avoid hammering GHCR on every restart.
 * - Re-checks in the background once per hour as a safety net for idle tabs.
 * - Callers (e.g. /health?refresh=1) can force an immediate check via
 *   forceCheck(), which the UI uses on every mount/login so users who just
 *   opened the app get an accurate update status in the same response.
 *
 * Rules:
 *   - HAP_BUILD_SHA === 'dev' (running from source) → update available.
 *   - Running digest differs from latest on GHCR → update available.
 */

const IMAGE = 'humanagencyprotocol/hap-gateway';
const CHECK_INTERVAL = 60 * 60 * 1000; // 60 minutes
const INITIAL_DELAY = 30_000; // 30 seconds after boot

let updateAvailable = false;
let lastCheckedAt = 0;
const buildSha = process.env.HAP_BUILD_SHA ?? 'dev';

export function getUpdateStatus() {
  return { updateAvailable, runningSha: buildSha, lastCheckedAt };
}

/**
 * Force an immediate GHCR check, bypassing the cache. Used by /health?refresh=1
 * on UI mount so login / reload always reflects the real state. Swallows errors
 * to avoid blocking the health response.
 */
export async function forceCheck(): Promise<void> {
  try {
    await check();
  } catch {
    // GHCR unreachable — state stays at last-known value
  }
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
  try {
    const token = await getToken();
    const latestDigest = await getDigest('latest', token);
    if (!latestDigest) return;

    if (buildSha === 'dev') {
      updateAvailable = true;
      lastCheckedAt = Date.now();
      return;
    }

    const runningDigest = await getDigest(buildSha.slice(0, 7), token);

    if (!runningDigest || runningDigest !== latestDigest) {
      updateAvailable = true;
    } else {
      updateAvailable = false;
    }
    lastCheckedAt = Date.now();
  } catch {
    // GHCR unreachable — skip
  }
}

export function startUpdateChecker(): void {
  setTimeout(() => {
    check().catch(() => {});
    setInterval(() => check().catch(() => {}), CHECK_INTERVAL);
  }, INITIAL_DELAY);
}
