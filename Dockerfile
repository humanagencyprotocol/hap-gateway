# ─── Build stage ────────────────────────────────────────────────────────────
FROM node:22-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/

RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install
RUN pnpm build

# Clone profiles here so the production stage doesn't need git
RUN git clone --depth 1 https://github.com/humanagencyprotocol/hap-profiles.git /hap-profiles \
    && rm -rf /hap-profiles/.git

# ─── Production stage ──────────────────────────────────────────────────────
FROM node:22-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Workspace skeleton — pnpm needs these to resolve `workspace:*` references.
COPY --from=build /build/package.json /build/pnpm-workspace.yaml /build/tsconfig.base.json ./

# Each workspace package: only the package.json + built dist. No src/, no tests,
# no devDeps. pnpm install --prod below will recreate the runtime node_modules
# without the dev tree (vite, tsup, typescript, vitest, @types/*, …).
COPY --from=build /build/packages/hap-core/package.json packages/hap-core/
COPY --from=build /build/packages/hap-core/dist packages/hap-core/dist/
COPY --from=build /build/apps/control-plane/package.json apps/control-plane/
COPY --from=build /build/apps/control-plane/dist apps/control-plane/dist/
COPY --from=build /build/apps/mcp-server/package.json apps/mcp-server/
COPY --from=build /build/apps/mcp-server/dist apps/mcp-server/dist/
COPY --from=build /build/apps/ui/package.json apps/ui/
COPY --from=build /build/apps/ui/dist apps/ui/dist/

RUN pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod

# Copy integration manifests (UI reads these; separate from runtime-installed
# npm packages for each integration's MCP server).
COPY content/integrations/ content/integrations/

# Pre-install MCP servers so the first run doesn't need npm network access.
RUN npm install -g mcp-remote @humanagencyp/linkedin-mcp @humanagencyp/crm-mcp @humanagencyp/records-mcp @shinzolabs/gmail-mcp \
    && npm cache clean --force

# Profiles copied from build stage (no git in production anymore)
COPY --from=build /hap-profiles /hap-profiles

# Data directory for gate store (mount point)
RUN mkdir -p /app/data

# Entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Build metadata
ARG GIT_SHA=dev
ENV HAP_BUILD_SHA=$GIT_SHA

# Runtime env
ENV HAP_UI_DIST=/app/apps/ui/dist
ENV HAP_DATA_DIR=/app/data
ENV HAP_CP_PORT=3000
ENV HAP_MCP_PORT=3030
ENV HAP_MCP_INTERNAL_URL=http://127.0.0.1:3030
# Manifest source (read-only) and runtime install target (writable) are
# intentionally separate. Pointing the runtime installer at the manifest dir
# polluted the image with a writable node_modules tree inside read-only
# sources.
ENV HAP_MANIFESTS_DIR=/app/content/integrations
ENV HAP_INTEGRATIONS_DIR=/app/integrations
ENV HAP_PROFILES_DIR=/hap-profiles
ENV NODE_ENV=production

EXPOSE 3000 3030

ENTRYPOINT ["tini", "--"]
CMD ["/app/entrypoint.sh"]
