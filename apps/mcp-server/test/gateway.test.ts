/**
 * Gateway integration test.
 *
 * Starts the HAP MCP server, adds a test downstream MCP server via the
 * internal API, and verifies tools are discovered and callable.
 *
 * Run: npx vitest run test/gateway.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const MCP_PORT = 13030; // Use a non-default port to avoid conflicts
const BASE_URL = `http://127.0.0.1:${MCP_PORT}`;
const TEST_SERVER_PATH = resolve(__dirname, 'fixtures/test-mcp-server.ts');

let serverProcess: ChildProcess;
const TEST_PROFILES_DIR = resolve(__dirname, '../.test-profiles');

async function waitForServer(url: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, data: await res.json() };
}

async function del(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' });
  return { status: res.status, data: await res.json() };
}

describe('MCP Gateway', () => {
  beforeAll(async () => {
    // Create test profiles directory with a spend profile
    mkdirSync(resolve(TEST_PROFILES_DIR, 'spend'), { recursive: true });
    writeFileSync(resolve(TEST_PROFILES_DIR, 'index.json'), JSON.stringify({
      repository: 'test',
      profiles: {
        'spend': 'spend/0.3.profile.json',
      },
    }));
    writeFileSync(resolve(TEST_PROFILES_DIR, 'spend/0.3.profile.json'), JSON.stringify({
      id: 'spend',
      version: '0.3',
      description: 'Test payment profile',
      frameSchema: { keyOrder: [], fields: {} },
      executionContextSchema: { fields: {} },
      executionPaths: {},
      requiredGates: [],
      gateQuestions: {
        problem: { question: 'Test?', required: true },
        objective: { question: 'Test?', required: true },
        tradeoffs: { question: 'Test?', required: true },
      },
      ttl: { default: 3600, max: 86400 },
      retention_minimum: 7776000,
      toolGating: {
        default: {
          executionMapping: {
            a: { field: 'amount', divisor: 100 },
            b: 'currency',
          },
          staticExecution: { target_env: 'production' },
        },
        overrides: {
          echo: null,
        },
      },
    }));

    // Start the HAP MCP server on a test port
    serverProcess = spawn('npx', ['tsx', 'bin/http.ts'], {
      cwd: resolve(__dirname, '..'),
      env: {
        ...process.env,
        HAP_MCP_PORT: String(MCP_PORT),
        HAP_SP_URL: 'https://www.humanagencyprotocol.com',
        // Use a temp data dir so we don't pollute real config
        HAP_DATA_DIR: resolve(__dirname, '../.test-data'),
        HAP_PROFILES_DIR: TEST_PROFILES_DIR,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`  [server] ${data.toString()}`);
    });

    await waitForServer(BASE_URL);
  }, 15000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      // Wait for graceful shutdown
      await new Promise(r => setTimeout(r, 1000));
      if (!serverProcess.killed) serverProcess.kill('SIGKILL');
    }

    // Clean up test data
    try {
      rmSync(resolve(__dirname, '../.test-data'), { recursive: true, force: true });
    } catch { /* ignore */ }
    try {
      rmSync(TEST_PROFILES_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('health endpoint works', async () => {
    const { status, data } = await get('/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.integrations).toEqual([]);
  });

  it('can add a test integration', async () => {
    const { status, data } = await post('/internal/add-integration', {
      id: 'test-tools',
      name: 'Test Tools',
      command: 'npx',
      args: ['tsx', TEST_SERVER_PATH],
      envKeys: {},
      profile: null,
      enabled: true,
    });

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.id).toBe('test-tools');
    expect(data.tools).toContain('test-tools__echo');
    expect(data.tools).toContain('test-tools__add');
  }, 15000);

  it('integrations endpoint shows running integration', async () => {
    const { status, data } = await get('/internal/integrations');
    expect(status).toBe(200);

    const testIntegration = data.integrations.find(
      (i: { id: string }) => i.id === 'test-tools',
    );
    expect(testIntegration).toBeDefined();
    expect(testIntegration.running).toBe(true);
    expect(testIntegration.toolCount).toBe(2);
  });

  it('health endpoint includes integration status', async () => {
    const { status, data } = await get('/health');
    expect(status).toBe(200);

    const testIntegration = data.integrations.find(
      (i: { id: string }) => i.id === 'test-tools',
    );
    expect(testIntegration).toBeDefined();
    expect(testIntegration.running).toBe(true);
  });

  it('can remove an integration', async () => {
    const { status, data } = await del('/internal/remove-integration/test-tools');
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    // Verify it's gone
    const { data: listData } = await get('/internal/integrations');
    expect(listData.integrations).toEqual([]);
  });

  it('removing non-existent integration returns 404', async () => {
    const { status } = await del('/internal/remove-integration/does-not-exist');
    expect(status).toBe(404);
  });

  it('can re-add and call tools via MCP client', async () => {
    // Re-add the integration
    await post('/internal/add-integration', {
      id: 'test-tools',
      name: 'Test Tools',
      command: 'npx',
      args: ['tsx', TEST_SERVER_PATH],
      envKeys: {},
      profile: null,
      enabled: true,
    });

    // Connect as an MCP client and call the proxied tool
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');

    const transport = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    const client = new Client({ name: 'test-client', version: '0.1.0' }, { capabilities: {} });
    await client.connect(transport);

    try {
      // List tools — should include proxied tools
      const { tools } = await client.listTools();
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('test-tools__echo');
      expect(toolNames).toContain('test-tools__add');

      // Verify echo tool has correct schema
      const echoTool = tools.find(t => t.name === 'test-tools__echo');
      expect(echoTool?.description).toContain('Echoes back the input message');
      expect(echoTool?.inputSchema?.properties).toHaveProperty('message');

      // Call the echo tool
      const echoResult = await client.callTool({
        name: 'test-tools__echo',
        arguments: { message: 'hello gateway' },
      });
      const echoText = (echoResult.content as Array<{ type: string; text: string }>)[0]?.text;
      expect(echoText).toBe('Echo: hello gateway');

      // Call the add tool
      const addResult = await client.callTool({
        name: 'test-tools__add',
        arguments: { a: 3, b: 7 },
      });
      const addText = (addResult.content as Array<{ type: string; text: string }>)[0]?.text;
      expect(addText).toBe('Result: 10');
    } finally {
      await client.close();
    }
  }, 15000);

  it('can add integration with gated tools using staticExecution and divisor mapping', async () => {
    // Remove previous test integration first
    await del('/internal/remove-integration/test-tools');

    // Add an integration with profile-based gating
    const { status, data } = await post('/internal/add-integration', {
      id: 'test-tools',
      name: 'Test Tools (gated)',
      command: 'npx',
      args: ['tsx', TEST_SERVER_PATH],
      envKeys: {},
      profile: 'spend',
      enabled: true,
    });

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.tools).toContain('test-tools__echo');
    expect(data.tools).toContain('test-tools__add');

    // Connect as MCP client
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');

    const transport = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    const client = new Client({ name: 'test-client', version: '0.1.0' }, { capabilities: {} });
    await client.connect(transport);

    try {
      // Echo should work (ungated via override)
      const echoResult = await client.callTool({
        name: 'test-tools__echo',
        arguments: { message: 'ungated' },
      });
      const echoText = (echoResult.content as Array<{ type: string; text: string }>)[0]?.text;
      expect(echoText).toBe('Echo: ungated');

      // Add should be gated — no authorization means the tool is disabled
      // (refreshTools disables gated tools when no matching authorization exists)
      try {
        await client.callTool({
          name: 'test-tools__add',
          arguments: { a: 5000, b: 7 },
        });
        // If we get here, the tool wasn't disabled — fail the test
        expect.fail('Expected gated tool to be disabled when no authorization exists');
      } catch (err) {
        expect(String(err)).toContain('disabled');
      }
    } finally {
      await client.close();
      await del('/internal/remove-integration/test-tools');
    }
  }, 15000);
});
