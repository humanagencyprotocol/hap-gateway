#!/bin/sh
set -e

echo "[entrypoint] Starting HAP Platform..."

# Start MCP server in background
echo "[entrypoint] Starting MCP server on :3030..."
node /app/apps/mcp-server/dist/http.mjs &
MCP_PID=$!

# Start control-plane in foreground
echo "[entrypoint] Starting control-plane on :3000..."
node /app/apps/control-plane/dist/index.mjs &
CP_PID=$!

# If either process exits, kill both
trap "kill $MCP_PID $CP_PID 2>/dev/null; exit" EXIT INT TERM

# Wait for either to exit
wait -n $MCP_PID $CP_PID
EXIT_CODE=$?

echo "[entrypoint] Process exited with code $EXIT_CODE, shutting down..."
kill $MCP_PID $CP_PID 2>/dev/null
exit $EXIT_CODE
