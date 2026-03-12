/**
 * FORGE MCP Server
 * Auto-generate an MCP server from tool definitions.
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 */

import { buildTool } from './tool-builder.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

/**
 * Create an MCP server instance from tool definitions.
 * @param {Object} options
 * @param {Array<string|Object>} options.tools - Tool file paths or definition objects
 * @param {string} [options.name] - Server name
 * @param {string} [options.version] - Server version
 * @returns {Object} Server instance with start() method
 */
export function createServer(options = {}) {
  const {
    tools: toolSources = [],
    name = 'forge-mcp-server',
    version = '1.0.0',
  } = options;

  const tools = new Map();

  // Build and register all tools
  for (const source of toolSources) {
    const built = buildTool(source);
    tools.set(built.schema.name, built);
  }

  /**
   * Handle JSON-RPC requests
   */
  function handleRequest(request) {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name, version },
          },
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: Array.from(tools.values()).map(t => t.schema),
          },
        };

      case 'tools/call': {
        const toolName = params?.name;
        const tool = tools.get(toolName);
        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Unknown tool: ${toolName}` },
          };
        }
        // Return a marker that this needs async resolution
        return { __async: true, tool, args: params?.arguments || {}, id };
      }

      case 'notifications/initialized':
        return null; // No response for notifications

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }

  /**
   * Start the stdio transport
   */
  function start() {
    let buffer = '';

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', async (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const request = JSON.parse(line);
          const response = handleRequest(request);

          if (response === null) continue; // Notification, no response

          if (response.__async) {
            // Handle async tool calls
            try {
              const result = await response.tool.handler(response.args);
              const rpcResponse = {
                jsonrpc: '2.0',
                id: response.id,
                result,
              };
              process.stdout.write(JSON.stringify(rpcResponse) + '\n');
            } catch (err) {
              const rpcResponse = {
                jsonrpc: '2.0',
                id: response.id,
                result: {
                  content: [{ type: 'text', text: `Error: ${err.message}` }],
                  isError: true,
                },
              };
              process.stdout.write(JSON.stringify(rpcResponse) + '\n');
            }
          } else {
            process.stdout.write(JSON.stringify(response) + '\n');
          }
        } catch (err) {
          const errResponse = {
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          };
          process.stdout.write(JSON.stringify(errResponse) + '\n');
        }
      }
    });

    process.stdin.on('end', () => process.exit(0));
  }

  return {
    tools,
    handleRequest,
    start,
    getToolList: () => Array.from(tools.values()).map(t => t.schema),
    getToolCount: () => tools.size,
  };
}

/**
 * Load all YAML/JSON tools from a directory and create a server.
 * @param {string} toolsDir - Directory containing tool definition files
 * @param {Object} [options] - Additional server options
 * @returns {Object} Server instance
 */
export function createServerFromDirectory(toolsDir, options = {}) {
  const absDir = resolve(toolsDir);
  if (!existsSync(absDir)) {
    throw new Error(`Tools directory not found: ${absDir}`);
  }

  const files = readdirSync(absDir)
    .filter(f => ['.yaml', '.yml', '.json'].includes(extname(f).toLowerCase()))
    .map(f => join(absDir, f));

  return createServer({ ...options, tools: files });
}

// CLI entry: serve tools from a directory
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const toolsDir = process.argv[2] || './templates';
  const server = createServerFromDirectory(toolsDir, {
    name: 'forge-mcp-server',
    version: '1.0.0',
  });
  server.start();
}

export default { createServer, createServerFromDirectory };
