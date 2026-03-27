# HAP Agent Gateway

Part of [humanagencyprotocol.com](https://humanagencyprotocol.com) — the first service applying the [Human Agency Protocol](https://humanagencyprotocol.org).

AI systems are probabilistic — flexible, adaptive, powerful. Real-world actions are deterministic — irreversible, accountable. You can't safely let a probabilistic system directly control deterministic consequences.

HAP separates intelligence from authority and enforces that boundary at execution. Let AI think freely. Only let it act within explicitly authorized human bounds.

The gateway is where that boundary is enforced. It sits between AI agents and real-world tools — payments, email, CRM, deployments, infrastructure — and verifies every action against cryptographic proof of human authorization. Planning is unrestricted. Execution is strictly enforced.

The result: more AI capability does not mean more risk. Organizations can safely grant agents real authority over consequential actions — because the bounds hold.

> **Alpha (v0.1.0-alpha)** — Under active development.

---

## Two Modes of Commitment

A human creates an authorization by defining bounds and articulating the problem, objective, and accepted tradeoffs. The Service Provider at [humanagencyprotocol.com](https://humanagencyprotocol.com) signs the attestation. How the agent then operates depends on the commitment mode:

**Fully committed** — The human commits to specific bounds upfront: max amounts, allowed actions, time windows. The agent executes autonomously within those bounds. On every tool call, the Gatekeeper verifies the action falls within the attested bounds and the SP issues a signed receipt. No per-action human approval needed. One authorization, many actions, each individually proven.

**Committed per action** — The human defines bounds but defers full commitment. When the agent proposes an action, it becomes a proposal that the human reviews in the gateway UI — seeing exactly which tool, which arguments, which execution context. The human commits or rejects. Only after all required domain owners commit does execution proceed.

Both modes are bounded. Both produce receipts. Both create a full audit trail. The difference is delegation depth — whether the human trusts the bounds enough for autonomous execution, or wants to review each action the agent proposes.

---

## How It Works

```
Human                                 AI Agent
  |                                       |
  | 1. Define bounds,                     |
  |    articulate direction,              |
  |    commit (or defer)                  |
  v                                       |
Service Provider                          |
  | 2. Sign attestation (Ed25519)         |
  v                                       |
Gateway                                   |
  |              3. Connect via MCP ----->|
  |              4. Tool call <-----------|
  |                                       |
  | 5. Fully committed:                   |
  |    Gatekeeper verifies bounds         |
  |    -> receipt issued, execute         |
  |                                       |
  |    Deferred commitment:               |
  |    -> proposal created                |
  |    -> human reviews in UI             |
  |    -> commit or reject                |
  |    -> execute on commit               |
```

The agent never holds credentials or signing authority. It is a bounded executor of human decisions — high autonomy without losing accountability.

---

## What the Agent Sees

When an agent connects, it receives a compact authority brief — active authorizations with bounds, live consumption, and available tools:

```
=== ACTIVE AUTHORITIES ===

[spend-routine] charge@0.4 (45 min remaining)
  Bounds: amount_max: 100, currency: USD, action_type: charge
  Usage: $234/$500 daily, $1280/$5000 monthly, 8/20 tx
  Problem: Enable automated purchasing for business operations.
  4 gated tools, 19 read-only
```

No credentials. No signing keys. Just the scope of what the agent is allowed to do — and the human's stated reason for granting it.

---

## Quick Start

Requires [Docker](https://docs.docker.com/get-docker/).

```bash
docker run -d --name hap-gateway -p 7400:3000 -p 7430:3030 -v $HOME/.hap:/app/data ghcr.io/humanagencyprotocol/hap-gateway
```

Open `http://localhost:7400`. The MCP server is at `http://localhost:7430`.

Any MCP-compatible client can connect:

```
Streamable HTTP:  POST http://localhost:7430/mcp
SSE transport:    GET  http://localhost:7430/sse
```

---

## Technical Documentation

| Document | Contents |
|---|---|
| [Architecture](docs/architecture.md) | System overview, services, data storage, project structure |
| [Authorization Flow](docs/authorization-flow.md) | Data flow, gate wizard, tool execution, agent context |
| [Security Model](docs/security.md) | Enforcement layers, verification, encryption, fail-closed design |
| [Development](docs/development.md) | Local setup, env vars, Docker, testing |

---

Protocol specification: [humanagencyprotocol.org](https://humanagencyprotocol.org)

## License

MIT — see [LICENSE](LICENSE).
