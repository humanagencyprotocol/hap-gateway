# Development

## Prerequisites

- **Node.js 20+** — check with `node -v`
- **pnpm 9+** — install with `corepack enable` (built into Node.js) or `npm install -g pnpm`
- **hap-profiles** — must be cloned as a sibling directory (or set `HAP_PROFILES_DIR`)

```
Development/
├── hap-gateway/     ← you are here
├── hap-profiles/    ← must exist
├── hap-sp/          ← optional, for local SP
└── hap-e2e/         ← optional, for E2E tests
```

## First-Time Setup

```bash
cd hap-gateway
pnpm install
pnpm build
```

## Running Locally

### One command (recommended)

```bash
pnpm dev
```

This starts all three services concurrently with auto-reload:

| Service | Port | What it does |
|---------|------|-------------|
| UI | 3400 | Vite dev server with hot module replacement |
| Control Plane | 3402 | Auth, vault, SP proxy — auto-restarts on file changes |
| MCP Server | 3430 | Gatekeeper, tool proxy — auto-restarts on file changes |

Open `http://localhost:3400` for the UI (proxies API calls to the control plane).

### Individual services

If you only need to work on one part:

```bash
pnpm dev:ui        # UI only (port 3400, HMR)
pnpm dev:control   # Control plane only (port 3402, auto-restart)
pnpm dev:mcp       # MCP server only (port 3430, auto-restart)
```

### With local SP

To run against a local Service Provider instead of production:

```bash
# Terminal 1 — start local SP
cd ../hap-sp && pnpm dev

# Terminal 2 — start gateway pointing to local SP
HAP_SP_URL=http://localhost:4100 pnpm dev
```

### With live SP

By default, the gateway connects to `https://www.humanagencyprotocol.com`. Just run `pnpm dev` and log in with your SP API key.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HAP_SP_URL` | `https://www.humanagencyprotocol.com` | Service Provider URL |
| `HAP_CP_PORT` | `3402` | Control Plane port |
| `HAP_MCP_PORT` | `3430` | MCP Server port |
| `HAP_MCP_INTERNAL_URL` | `http://127.0.0.1:3430` | MCP internal endpoint (Control Plane → MCP) |
| `HAP_INTERNAL_SECRET` | (empty = skip check) | Shared secret for internal endpoints |
| `HAP_UI_DIST` | `../../ui/dist` | Path to built UI assets |
| `HAP_DATA_DIR` | `~/.hap` | Persistent storage directory |
| `HAP_PROFILES_DIR` | `../../hap-profiles` (relative to cwd) | HAP profiles directory |
| `HAP_INTEGRATIONS_DIR` | `../../content/integrations` (relative to cwd) | Integration manifests directory |

## Testing

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @hap/core test
pnpm --filter @hap/mcp-server test

# Watch mode
pnpm --filter @hap/mcp-server test:watch
```

| Package | Tests | What |
|---------|-------|------|
| `hap-core` | 84 | Bounds/context hashing, gatekeeper verification, attestation encoding, hash determinism, profile loading |
| `mcp-server` | 78 | Tool handlers, mandate brief, consumption tracking, gate store encryption, session restore, SP receipt integration |

### Cross-service E2E tests

Run from the [hap-e2e](https://github.com/humanagencyprotocol/hap-e2e) repo:

```bash
cd ../hap-e2e
MOLLIE_TEST_KEY=test_xxx pnpm test
```

## Docker

Docker is for testing production builds, not day-to-day development.

```bash
docker compose up --build
```

Or manually:

```bash
docker build -t hap-gateway .
docker run -p 7400:3000 -p 7430:3030 \
  -e HAP_SP_URL=https://www.humanagencyprotocol.com \
  -v $HOME/.hap:/app/data \
  hap-gateway
```

## Login Re-sync

After restarting services, a single login in the UI restores the full state:

1. Pushes SP session cookie and vault key to the MCP server
2. Re-pushes all stored service credentials (Mollie access token, etc.)
3. Re-syncs all stored gate content with the SP attestation cache

## Related Repositories

| Repo | Purpose |
|------|---------|
| [hap-core](https://github.com/humanagencyprotocol/hap-core) | Shared protocol types, hashing, verification |
| [hap-sp](https://github.com/humanagencyprotocol/hap-sp) | Service Provider (attestation signing, receipts, groups) |
| [hap-profiles](https://github.com/humanagencyprotocol/hap-profiles) | Profile definitions (spend, ship, data, publish, provision) |
| [hap-e2e](https://github.com/humanagencyprotocol/hap-e2e) | Cross-service E2E test suite |
| [hap-protocol](https://github.com/humanagencyprotocol/hap-protocol) | Protocol specification + website |
