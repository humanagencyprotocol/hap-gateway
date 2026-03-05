# HAP Demo

A working implementation of the [Human Agency Protocol](https://humanagencyprotocol.org) — the infrastructure layer that ensures AI agents can only execute real-world actions within human-defined bounds.

This demo connects three services: a **React UI** where domain owners create time-limited, scope-bounded authorizations, a **Control Plane** that manages authentication and proxies requests, and an **MCP Server** where AI agents call tools that are enforced by a **Gatekeeper** at runtime. Every tool call is verified against cryptographically signed attestations before execution proceeds.

**The core guarantee:** an agent authorized to make payments up to $100 in USD cannot make a $200 payment, pay in EUR, or act after the authorization expires. The Gatekeeper rejects it — no configuration, no trust, no override.

---

## How It Works

```
Domain Owner (Browser)                    AI Agent (Claude, etc.)
       │                                         │
       │  1. Create authorization                 │
       │  (bounds, gates, sign)                   │
       ▼                                         │
┌─────────────┐    proxy    ┌──────────────┐      │
│  Control    │◄──────────►│  External SP  │      │
│  Plane      │   /api/*   │              │      │
│  port 3000  │            │  Signs with   │      │
│             │            │  Ed25519 key  │      │
│  • Auth     │            └──────────────┘      │
│  • UI serve │                                   │
│  • Gate     │──── /internal/* ────┐             │
│    content  │   (loopback only)   │             │
└─────────────┘                     ▼             │
                            ┌──────────────┐      │
                            │  MCP Server  │◄─────┘
                            │  port 3030   │  2. Call tool
                            │              │  (make-payment,
                            │  • Gatekeeper│   send-email)
                            │  • Tools     │
                            │  • Cache     │  3. Gatekeeper
                            │  • Gate store│  verifies bounds
                            └──────────────┘  → approve/reject
```

### The Authorization Flow

1. **Owner logs in** with an API key. The Control Plane exchanges it for a session with the external Service Provider.

2. **Owner creates an authorization** through a 6-step gate wizard:
   - **Profile & Path** — Select what kind of action (payment, email) and scope (routine, large)
   - **Bounds** — Set field constraints: `amount_max: 100`, `currency: USD`, `target_env: production`
   - **Problem** — Why is this authorization needed?
   - **Objective** — What should the agent achieve?
   - **Tradeoffs** — What risks are you accepting?
   - **Commit** — Review everything, sign the attestation

3. **The SP signs the attestation** with its Ed25519 key. Gate content hashes (never plaintext) are embedded in the attestation.

4. **The agent connects** via MCP and sees only tools it's authorized to use, with current bounds in each tool's description.

5. **On every tool call**, the Gatekeeper verifies: signature validity, frame hash match, TTL not expired, domain coverage, and bounds compliance. Only then does execution proceed.

### What the Agent Sees

When an agent connects, it receives a mandate brief describing its authorities:

```
You are an agent operating under the Human Agency Protocol (HAP).
You have bounded authorities granted by human decision owners.

=== ACTIVE AUTHORITIES ===

[payment-routine] payment-gate@0.3 (28 min remaining)
  Bounds: amount_max: 100, currency: USD, target_env: production
  Problem: Monthly supplier invoices need timely processing.
  Objective: Pay approved invoices within terms without manual review.
  Tradeoffs: Rounding < 2 USD acceptable. Late payments not acceptable.
```

Tools without active authorizations are hidden. When an authorization expires, the tool disappears from the agent's available tools in real time.

---

## Quick Start

### Option A: One-Line Install (Recommended)

Requires [Docker](https://docs.docker.com/get-docker/).

```bash
docker run -d --name hap-demo -p 3000:3000 -p 3030:3030 -v hap-data:/app/data ghcr.io/humanagencyprotocol/hap-demo
```

Open `http://localhost:3000`. The MCP server is available at `http://localhost:3030`.

To stop: `docker stop hap-demo`. To restart: `docker start hap-demo`. To remove: `docker rm -f hap-demo`.

### Option B: Build from Source

```bash
git clone https://github.com/humanagencyprotocol/hap-demo.git
cd hap-demo
docker compose up --build
```

### Option C: Local Development

Three terminals:

```bash
# Prerequisites
pnpm install && pnpm build
```

```bash
# Terminal 1 — Control Plane (port 3000)
pnpm dev:control
```

```bash
# Terminal 2 — MCP Server (port 3030)
pnpm dev:mcp
```

```bash
# Terminal 3 — UI dev server (port 3002, proxies to Control Plane)
pnpm dev:ui
```

Open `http://localhost:3002` (dev) or `http://localhost:3000` (production build).

### Create Your First Authorization

1. Open the UI and log in with your API key
2. Click **Agent Authorization** in the sidebar
3. Select profile `payment-gate@0.3` and path `payment-routine`
4. Set bounds: `amount_max: 100`, `currency: USD`, `target_env: production`
5. Answer the three gate questions (problem, objective, tradeoffs)
6. Review and commit — the attestation is signed and the MCP server is notified

The agent can now make payments up to $100 USD for the next 30 minutes.

### Connect an Agent

Any MCP-compatible client can connect to `http://localhost:3030`:

```
Streamable HTTP:  POST http://localhost:3030/mcp     (recommended)
SSE transport:    GET  http://localhost:3030/sse
Health check:     GET  http://localhost:3030/health
```

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hap": {
      "url": "http://localhost:3030/sse"
    }
  }
}
```

---

## Security Model

### What Is Enforced

| Layer | Enforcement |
|---|---|
| **Attestation signing** | Ed25519 signatures from the external SP. No local signing keys exist. |
| **Signature verification** | Every tool call triggers full EdDSA signature verification against the SP's public key. |
| **Frame binding** | Attestations are bound to a specific frame hash. Changing any frame field invalidates the attestation. |
| **TTL enforcement** | Expired attestations are rejected. The cache auto-evicts them. |
| **Domain coverage** | Multi-domain paths (e.g., `payment-large` requires `finance` + `compliance`) block execution until all domains attest. |
| **Bounds checking** | `max` constraints (amount <= limit) and `enum` constraints (value in allowed set) are checked at runtime. |
| **Verification order** | Auth errors (signature, TTL, domain) are checked before bounds. A forged attestation never reaches bounds logic. |

### Gate Content Privacy

Plaintext gate content (what you wrote in problem/objective/tradeoffs) **never leaves your infrastructure**:

- The browser hashes gate content with SHA-256 before sending hashes to the SP
- Plaintext is sent only to the local MCP server (via the Control Plane) and stored at `~/.hap/gates.json`
- The MCP server verifies that the plaintext hashes match what the SP attested to
- The agent reads gate content from the local store to understand its mandate

### Internal Endpoint Protection

The MCP server exposes `/internal/*` endpoints for the Control Plane to push session configuration and gate content. These are restricted to loopback IP (`127.0.0.1`, `::1`) — only the co-located Control Plane can call them.

### Authentication

Session-based authentication via the external SP. The Control Plane proxies auth requests, rewrites cookies for localhost compatibility, and pushes the session cookie to the MCP server so it can make authenticated SP API calls on behalf of the logged-in user.

---

## Architecture

### Services

| Service | Port | Package | Purpose |
|---|---|---|---|
| **Control Plane** | 3000 | `@hap/control-plane` | Auth, SP proxy, UI serving, gate content routing |
| **MCP Server** | 3030 | `@hap/mcp-server` | MCP tool provider, Gatekeeper, attestation cache |
| **UI** | 3002 (dev) | `@hap/ui` | React SPA, 6-gate wizard, dashboard |
| **hap-core** | — | `@hap/core` | Shared protocol logic, types, crypto |

### MCP Tools

| Tool | Profile | Input | Gatekeeper Check |
|---|---|---|---|
| `make-payment` | `payment-gate@0.3` | amount, currency, recipient | amount <= amount_max, currency in allowed set |
| `send-email` | `comms-send@0.3` | to, subject, body | recipient count <= max_recipients, channel in allowed set |
| `list-authorizations` | — | (none) | No enforcement (read-only) |
| `check-pending-attestations` | — | domain | No enforcement (read-only) |

### Profiles

**`payment-gate@0.3`** — Financial transactions

| Path | Required Domains | Default TTL |
|---|---|---|
| `payment-routine` | finance | 1 hour |
| `payment-large` | finance + compliance | 4 hours |

Bounds: `amount_max` (number, max), `currency` (string, enum), `target_env` (string, enum)

**`comms-send@0.3`** — Communications

| Path | Required Domains | Default TTL |
|---|---|---|
| `send-internal` | communications | 1 hour |
| `send-external` | communications + security | 4 hours |

Bounds: `max_recipients` (number, max), `channel` (string, enum)

---

## Project Structure

```
demo-hap/
├── apps/
│   ├── control-plane/         # Express — auth proxy, UI serving
│   │   └── src/
│   │       ├── index.ts       # Server setup, SP proxy, gate-content routing
│   │       ├── routes/
│   │       │   ├── auth.ts    # Login/logout via SP session
│   │       │   └── vault.ts   # Phase 2 credential storage (stubbed)
│   │       └── lib/
│   │           ├── mcp-bridge.ts  # HTTP client to MCP /internal/* endpoints
│   │           └── vault.ts       # Phase 2 AES-256-GCM (stubbed)
│   │
│   ├── mcp-server/            # MCP tool provider + Gatekeeper
│   │   ├── bin/http.ts        # Express server, SSE + Streamable HTTP transports
│   │   └── src/
│   │       ├── index.ts       # MCP server factory, tool registration
│   │       ├── tools/
│   │       │   ├── payment.ts         # make-payment tool handler
│   │       │   ├── email.ts           # send-email tool handler
│   │       │   ├── authorizations.ts  # list-authorizations tool handler
│   │       │   └── pending.ts         # check-pending-attestations tool handler
│   │       └── lib/
│   │           ├── gatekeeper.ts        # MCPGatekeeper — verification wrapper
│   │           ├── sp-client.ts         # SP HTTP client with session cookie
│   │           ├── attestation-cache.ts # In-memory cache with TTL eviction
│   │           ├── gate-store.ts        # Local gate content persistence
│   │           ├── mandate-brief.ts     # Agent system instructions builder
│   │           ├── gate-content.ts      # SHA-256 hashing + hash verification
│   │           ├── shared-state.ts      # Singleton state container
│   │           └── connectors/
│   │               ├── payment.ts       # Mock payment execution
│   │               └── email.ts         # Mock email sending
│   │
│   └── ui/                    # React SPA
│       └── src/
│           ├── App.tsx        # Routes + auth guard
│           ├── contexts/AuthContext.tsx   # Session state
│           ├── pages/
│           │   ├── LoginPage.tsx          # API key login
│           │   ├── DashboardPage.tsx      # Overview + quick actions
│           │   ├── AgentNewPage.tsx       # Step 1: profile/path selection
│           │   ├── GateWizardPage.tsx     # Steps 2-5: bounds + gate questions
│           │   ├── AgentReviewPage.tsx    # Step 6: review + commit
│           │   ├── DeployReviewPage.tsx   # Deploy gate flow (PR-based)
│           │   ├── GroupsPage.tsx         # Group management
│           │   ├── AuditPage.tsx          # Audit trail
│           │   └── OnboardingPage.tsx     # First-run setup
│           ├── components/               # Reusable UI components
│           ├── lib/
│           │   ├── sp-client.ts          # API client (all requests via /api proxy)
│           │   └── frame.ts             # Browser-side frame hashing (SubtleCrypto)
│           └── styles/design-system.css  # CSS custom properties, dark/light themes
│
├── packages/
│   └── hap-core/              # Shared protocol logic
│       └── src/
│           ├── types.ts       # Protocol types (attestation, profile, gatekeeper)
│           ├── frame.ts       # Frame canonicalization + SHA-256 hashing
│           ├── attestation.ts # Blob encoding/decoding, EdDSA verification
│           ├── gatekeeper.ts  # §8.6 verification: signature, frame, TTL, domains, bounds
│           └── profiles/      # Profile definitions (payment-gate, comms-send)
│
├── Dockerfile                 # Two-stage build, tini for PID 1
├── docker-compose.yml         # Single-service deployment
├── entrypoint.sh              # Starts MCP server + Control Plane
└── pnpm-workspace.yaml
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HAP_SP_URL` | `https://service.humanagencyprotocol.org` | External Service Provider URL |
| `HAP_CP_PORT` | `3000` | Control Plane port |
| `HAP_MCP_PORT` | `3030` | MCP Server port |
| `HAP_MCP_INTERNAL_URL` | `http://127.0.0.1:3030` | MCP internal endpoint (Control Plane → MCP) |
| `HAP_UI_DIST` | `../../ui/dist` | Path to built UI assets (for production serving) |
| `HAP_DATA_DIR` | `~/.hap` | Gate content storage directory |

---

## Docker

The Docker image runs both services in a single container:

```bash
# Build and run
docker compose up --build

# Or build manually
docker build -t hap-demo .
docker run -p 3000:3000 -p 3030:3030 \
  -e HAP_SP_URL=https://service.humanagencyprotocol.org \
  -v hap-data:/app/data \
  hap-demo
```

The container uses `tini` as PID 1 for proper signal handling. If either service exits, both are stopped. Gate content persists in the `/app/data` volume.

---

## Testing

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @hap/core test
pnpm --filter @hap/mcp-server test
```

The `hap-core` test suite includes full cryptographic integration tests — real Ed25519 key generation, attestation signing, and Gatekeeper verification. No mocks for the protocol layer.

---

## What Is Real vs. What Is Mocked

| Concern | Status |
|---|---|
| Attestation signing (EdDSA) | Real — external SP |
| Gatekeeper verification | Real — full signature + bounds checking |
| Gate content hashing | Real — SHA-256 (browser + server) |
| Session authentication | Real — API key exchange with SP |
| Internal endpoint protection | Real — loopback-only middleware |
| Payment execution | **Mock** — returns `TXN-000001` style IDs |
| Email sending | **Mock** — returns `MSG-000001` style IDs |
| Vault / credential encryption | **Phase 2 stub** — no-ops |
| Service credentials | **Phase 2 stub** — 501 |

The protocol enforcement is real. The connectors that execute after enforcement are mocks — swap them with actual payment processors or email services for production use.

---

## Protocol Compliance

This demo implements [HAP v0.3](https://humanagencyprotocol.org/review).

| Spec Section | Implementation |
|---|---|
| §4 Profiles | `payment-gate@0.3` and `comms-send@0.3` with field constraints |
| §5 Frames | Canonical frame hashing (SHA-256 of key-ordered fields) |
| §6 Attestations | Ed25519 signatures, TTL enforcement, gate content hashes |
| §7 Domains | Role-based attestations with per-path required domain lists |
| §8 Gatekeeper | Stateless verification + runtime bounds enforcement |
| §8.6.4 | Auth errors checked before bounds (verification order) |
| §17.1 AI Constraints | Agent operates within human-defined bounds; cannot self-authorize |

---

See [humanagencyprotocol.org](https://humanagencyprotocol.org) for the full specification.
