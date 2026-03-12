import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer, createServerFromDirectory } from '../lib/mcp-server.mjs';

const TEMPLATES_DIR = resolve(import.meta.dirname, '..', 'templates');

describe('createServer', () => {
  it('should create a server with no tools', () => {
    const server = createServer();
    assert.strictEqual(server.getToolCount(), 0);
    assert.deepStrictEqual(server.getToolList(), []);
  });

  it('should create a server with tool definitions', () => {
    const server = createServer({
      tools: [
        {
          name: 'test-tool',
          description: 'A test tool',
          parameters: { input: { type: 'string', required: true } },
        },
      ],
    });
    assert.strictEqual(server.getToolCount(), 1);
    assert.strictEqual(server.getToolList()[0].name, 'test-tool');
  });

  it('should handle initialize request', () => {
    const server = createServer({ name: 'test-server', version: '2.0.0' });
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });

    assert.strictEqual(response.id, 1);
    assert.strictEqual(response.result.serverInfo.name, 'test-server');
    assert.strictEqual(response.result.serverInfo.version, '2.0.0');
    assert.ok(response.result.capabilities.tools);
  });

  it('should handle tools/list request', () => {
    const server = createServer({
      tools: [
        { name: 'tool-a', description: 'Tool A' },
        { name: 'tool-b', description: 'Tool B' },
      ],
    });

    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    assert.strictEqual(response.result.tools.length, 2);
    assert.strictEqual(response.result.tools[0].name, 'tool-a');
    assert.strictEqual(response.result.tools[1].name, 'tool-b');
  });

  it('should handle tools/call for known tool', () => {
    const server = createServer({
      tools: [{ name: 'echo', description: 'Echo tool' }],
    });

    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'echo', arguments: { text: 'hello' } },
    });

    assert.ok(response.__async);
    assert.strictEqual(response.id, 3);
  });

  it('should return error for unknown tool', () => {
    const server = createServer();
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'nonexistent' },
    });

    assert.ok(response.error);
    assert.strictEqual(response.error.code, -32602);
  });

  it('should return null for notifications', () => {
    const server = createServer();
    const response = server.handleRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    assert.strictEqual(response, null);
  });

  it('should return method not found for unknown methods', () => {
    const server = createServer();
    const response = server.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'unknown/method',
    });
    assert.ok(response.error);
    assert.strictEqual(response.error.code, -32601);
  });
});

describe('createServerFromDirectory', () => {
  it('should load tools from templates directory', () => {
    const server = createServerFromDirectory(TEMPLATES_DIR);
    assert.ok(server.getToolCount() >= 3);
    const names = server.getToolList().map(t => t.name);
    assert.ok(names.includes('jira-search'));
    assert.ok(names.includes('slack-post-message'));
    assert.ok(names.includes('db-query'));
  });

  it('should throw for nonexistent directory', () => {
    assert.throws(
      () => createServerFromDirectory('/nonexistent/dir'),
      /not found/
    );
  });
});
