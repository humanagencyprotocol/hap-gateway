# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
RUN pnpm build

# ─── Production stage ──────────────────────────────────────────────────────
FROM node:22-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends tini git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace structure
COPY --from=build /build/package.json /build/pnpm-workspace.yaml /build/tsconfig.base.json ./
COPY --from=build /build/node_modules/ node_modules/
COPY --from=build /build/packages/ packages/
COPY --from=build /build/apps/ apps/

# Copy integration manifests
COPY content/integrations/ content/integrations/

# Pre-install MCP servers and remote bridge so integrations don't need runtime npm access
RUN npm install -g mcp-remote @humanagencyp/linkedin-mcp @humanagencyp/crm-mcp @humanagencyp/records-mcp @shinzolabs/gmail-mcp

# Fetch profiles from GitHub (public repo)
RUN git clone --depth 1 https://github.com/humanagencyprotocol/hap-profiles.git /hap-profiles \
    && rm -rf /hap-profiles/.git

# Create data directory for gate store
RUN mkdir -p /app/data

# Copy entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Build metadata
ARG GIT_SHA=dev
ENV HAP_BUILD_SHA=$GIT_SHA

# Set UI dist path for control-plane
ENV HAP_UI_DIST=/app/apps/ui/dist
ENV HAP_DATA_DIR=/app/data
# Keep integration node_modules OUTSIDE the mounted /app/data volume — they
# contain arch-specific native binaries (better-sqlite3) that must not be
# shared between the container and a macOS/Windows host.
ENV HAP_INTEGRATIONS_DIR=/app/integrations
ENV HAP_CP_PORT=3000
ENV HAP_MCP_PORT=3030
ENV HAP_MCP_INTERNAL_URL=http://127.0.0.1:3030
ENV HAP_INTEGRATIONS_DIR=/app/content/integrations
ENV HAP_PROFILES_DIR=/hap-profiles
ENV NODE_ENV=production

EXPOSE 3000 3030

ENTRYPOINT ["tini", "--"]
CMD ["/app/entrypoint.sh"]
