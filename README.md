# HAP Agent Gateway

The local runtime for the [Human Agency Protocol](https://humanagencyprotocol.org). It sits between AI agents and real-world tools — payments, email, deployments, infrastructure — enforcing cryptographically signed, human-defined bounds on every action.

The gateway connects to the HAP Service Provider at [humanagencyprotocol.com](https://humanagencyprotocol.com) for attestation signing, domain management, and audit trails.

> **Alpha (v0.1.0-alpha)** — Under active development. APIs and behavior may change without notice. Use at your own risk.

---

## How It Works

```
Human (Browser)                           AI Agent (Claude, etc.)
       │                                         │
       │  1. Create authorization                 │
       │  (bounds, gates, sign)                   │
       ▼                                         │
┌─────────────┐    proxy    ┌──────────────┐      │
│  Admin      │◄──────────►│  External SP  │      │
│  :3000      │   /api/*   │              │      │
│             │            │  Signs with   │      │
│  • Auth     │            │  Ed25519 key  │      │
│  • UI       │            └──────────────┘      │
│  • Vault    │                                   │
│  • Gate     │──── /internal/* ────┐             │
│    content  │   (loopback only)   │             │
└─────────────┘                     ▼             │
                            ┌──────────────┐      │
                            │  MCP Gateway │◄─────┘
                            │  :3030       │  2. Call tool
                            │              │  (make-payment,
                            │  • Gatekeeper│   send-email)
                            │  • Tools     │
                            │  • Cache     │  3. Gatekeeper
                            │  • Gate store│  verifies bounds
                            └──────────────┘  → approve/reject
```

A human creates an authorization through a structured gate flow — defining bounds, articulating the problem, objective, and tradeoffs. The SP signs it. The agent connects via MCP and sees only the tools it's authorized to use. On every tool call, the Gatekeeper verifies the signature, checks TTL, confirms domain coverage, and enforces bounds. Only then does execution proceed.

---

## Quick Start

Requires [Docker](https://docs.docker.com/get-docker/).

```bash
docker run -d --name hap-gateway -p 3000:3000 -p 3030:3030 -v hap-data:/app/data ghcr.io/humanagencyprotocol/hap-gateway
```

Open `http://localhost:3000`. The MCP server is available at `http://localhost:3030`.

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

## Documentation

| Document | Contents |
|---|---|
| [Authorization Flow](docs/authorization-flow.md) | Gate wizard, mandate brief, what the agent sees |
| [Security Model](docs/security.md) | Enforcement layers, gate content privacy, what's real vs. mocked |
| [Architecture](docs/architecture.md) | Services, tools, profiles, project structure, protocol compliance |
| [Development](docs/development.md) | Local dev setup, env vars, Docker, testing |

---

See [humanagencyprotocol.org](https://humanagencyprotocol.org) for the full specification.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability arising from the use of this software.

This is alpha software. No support, SLA, or backwards compatibility is guaranteed. Use it, break it, fork it — but do not depend on it for anything you cannot afford to lose.
