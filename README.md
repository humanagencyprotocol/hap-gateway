# HAP Agent Gateway

The local runtime for the [Human Agency Protocol](https://humanagencyprotocol.org). It sits between AI agents and real-world tools — payments, email, deployments, infrastructure — enforcing cryptographically signed, human-defined bounds on every action.

The gateway connects to the HAP Service Provider at [humanagencyprotocol.com](https://humanagencyprotocol.com) for attestation signing, domain management, and audit trails.

> **Alpha (v0.1.0-alpha)** — Under active development. APIs and behavior may change without notice. Use at your own risk.

---

## How It Works

```
Human (Browser)                       AI Agent (Claude, etc.)
      |                                       |
      | 1. Create authorization                |
      |    (bounds, gates, sign)               |
      v                                        |
+--------------+  proxy  +--------------+      |
| Admin        |<------->| External SP  |      |
| :3400        | /api/*  |              |      |
|              |         | Signs with   |      |
| - Auth       |         | Ed25519 key  |      |
| - UI         |         +--------------+      |
| - Vault      |                               |
| - Gate       |-- /internal/* --+             |
|   content    |  (loopback only)|             |
+--------------+                 v             |
                          +--------------+     |
                          | MCP Gateway  |<----+
                          | :3430        | 2. Call tool
                          |              |    (make-payment,
                          | - Gatekeeper |     send-email)
                          | - Tools      |
                          | - Cache      | 3. Gatekeeper
                          | - Gate store |    verifies bounds
                          +--------------+    -> approve/reject
```

A human creates an authorization through a structured gate flow — defining bounds, articulating the problem, objective, and tradeoffs. The SP signs it. The agent connects via MCP and sees only the tools it's authorized to use. On every tool call, the Gatekeeper verifies the signature, checks TTL, confirms domain coverage, and enforces bounds. Only then does execution proceed.

---

## What the Agent Sees

The gateway uses a two-tier context model to give agents exactly the information they need without wasting context tokens.

### Tier 1: Mandate Brief (always loaded)

When an agent connects, the MCP `instructions` field contains a compact brief:

```
You are an agent operating under the Human Agency Protocol (HAP).
You have bounded authorities granted by human decision owners.

=== ACTIVE AUTHORITIES ===

[spend-routine] spend@0.3 (45 min remaining)
  Bounds: amount_max: 100, currency: USD, action_type: charge, ...
  Usage: $234/$500 daily, $1280/$5000 monthly, 8/20 tx
  Problem: Enable automated purchasing for business operations.
  4 gated tools, 19 read-only — call list-authorizations(domain: "spend") for details

When you receive a task, call list-authorizations(domain) for full details.
```

Each tool also has a short gating tag in its description: `[HAP: spend — charge, amount checked]`, `[HAP: ungated]`, or `[HAP: spend — no active authorization]`.

### Tier 2: list-authorizations (on demand)

When the agent receives a task, it calls `list-authorizations(domain: "spend")` to load full detail for that domain only:

- **Bounds** with all frame parameters
- **Live consumption** — daily/monthly spend and transaction counts from the execution log
- **Gate content** — problem, objective, and tradeoffs as articulated by the decision owner
- **Capability map** — which tools are gated (with execution field mappings), which are read-only, which use default gating

Calling without a domain returns a refreshed compact overview.

### Organization Context

Place a `context.md` file in `~/.hap/` (or `$HAP_DATA_DIR/`) to provide the agent with organizational context:

```markdown
## Organization
Acme Corp — B2B SaaS for logistics.

## Your Role
Finance operations agent. Escalate unusual requests to #billing-ops.
```

This is included in the mandate brief and refreshed via `list-authorizations`.

---

## Quick Start

Requires [Docker](https://docs.docker.com/get-docker/).

```bash
docker run -d --name hap-gateway -p 7400:3000 -p 7430:3030 -v $HOME/.hap:/app/data ghcr.io/humanagencyprotocol/hap-gateway
```

Open `http://localhost:7400`. The MCP server is available at `http://localhost:7430`.

### Connect an Agent

Any MCP-compatible client can connect to `http://localhost:7430`:

```
Streamable HTTP:  POST http://localhost:7430/mcp     (recommended)
SSE transport:    GET  http://localhost:7430/sse
Health check:     GET  http://localhost:7430/health
```

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hap": {
      "url": "http://localhost:7430/sse"
    }
  }
}
```

---

## Documentation

| Document | Contents |
|---|---|
| [Authorization Flow](docs/authorization-flow.md) | Data flow, privacy model, gate wizard steps, tool execution, agent context, revocation |
| [Security Model](docs/security.md) | Enforcement layers, verification checks, privacy model, encryption, fail-closed design |
| [Architecture](docs/architecture.md) | System overview, services, internal communication, data storage, bounds/context model, project structure |
| [Development](docs/development.md) | Local dev setup (with local or live SP), env vars, Docker, testing, related repos |

---

See [humanagencyprotocol.org](https://humanagencyprotocol.org) for the full specification.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability arising from the use of this software.

This is alpha software. No support, SLA, or backwards compatibility is guaranteed. Use it, break it, fork it — but do not depend on it for anything you cannot afford to lose.
