# Development

## Build from Source

```bash
git clone https://github.com/humanagencyprotocol/hap-demo.git
cd hap-demo
docker compose up --build
```

## Local Development

Three terminals:

```bash
# Prerequisites
pnpm install && pnpm build
```

```bash
# Terminal 1 — Admin server (port 3000)
pnpm dev:control
```

```bash
# Terminal 2 — MCP Server (port 3030)
pnpm dev:mcp
```

```bash
# Terminal 3 — UI dev server (port 3002, proxies to admin server)
pnpm dev:ui
```

Open `http://localhost:3002` (dev) or `http://localhost:3000` (production build).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HAP_SP_URL` | `https://www.humanagencyprotocol.com` | External Service Provider URL |
| `HAP_CP_PORT` | `3000` | Control Plane port |
| `HAP_MCP_PORT` | `3030` | MCP Server port |
| `HAP_MCP_INTERNAL_URL` | `http://127.0.0.1:3030` | MCP internal endpoint (Control Plane → MCP) |
| `HAP_UI_DIST` | `../../ui/dist` | Path to built UI assets (for production serving) |
| `HAP_DATA_DIR` | `~/.hap` | Gate content storage directory |
| `HAP_PROFILES_DIR` | `../../hap-profiles` (relative to cwd) | HAP profiles directory |

## Docker

The Docker image runs both services in a single container:

```bash
# Build and run
docker compose up --build

# Or build manually
docker build -t hap-demo .
docker run -p 3000:3000 -p 3030:3030 \
  -e HAP_SP_URL=https://www.humanagencyprotocol.com \
  -v hap-data:/app/data \
  hap-demo
```

The container uses `tini` as PID 1 for proper signal handling. If either service exits, both are stopped. Gate content persists in the `/app/data` volume.

## Testing

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @hap/core test
pnpm --filter @hap/mcp-server test
```

The `hap-core` test suite includes full cryptographic integration tests — real Ed25519 key generation, attestation signing, and Gatekeeper verification. No mocks for the protocol layer.

## Login Re-sync

When you log in through the control-plane UI, the login flow automatically:

1. Pushes the SP session cookie and vault key to the MCP server
2. Re-pushes all stored service credentials (Stripe API key, etc.)
3. Re-syncs all stored gate content with the SP attestation cache

This means after restarting the MCP server, a single login restores the full state — no need to re-enter credentials or re-create authorizations.
