/**
 * FORGE MCP Server
 * Auto-generate an MCP server from tool definitions.
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 */

import { buildTool } from './tool-builder.mjs';
import { readFileSync, readdirSync, existsSync, watch } from 'node:fs';
import { resolve, join, extname } from 'node:path';

/**
 * Create an MCP server instance from tool definitions.
 * @param {Object} options
 * @param {Array<string|Object>} options.tools - Tool file paths or definition objects
 * @param {string} [options.name] - Server name
 * @param {string} [options.version] - Server version
 * @param {number} [options.maxConcurrency] - Max concurrent tool calls (default: 10)
 * @param {boolean} [options.hotReload] - Enable hot-reload of tool files (default: false)
 * @param {string} [options.watchDir] - Directory to watch for tool changes
 * @returns {Object} Server instance with start() method
 */
export function createServer(options = {}) {
  const {
    tools: toolSources = [],
    name = 'forge-mcp-server',
    version = '1.0.0',
    maxConcurrency = 10,
    hotReload = false,
    watchDir = null,
  } = options;

  // Validate configuration
  if (!Array.isArray(toolSources)) {
    throw new Error('Tools must be an array of file paths or definition objects');
  }

  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Server name must be a non-empty string');
  }

  if (typeof version !== 'string' || !version.trim()) {
    throw new Error('Server version must be a non-empty string');
  }

  if (typeof maxConcurrency !== 'number' || maxConcurrency < 1) {
    throw new Error('maxConcurrency must be a positive number');
  }

  const tools = new Map();
  const toolFiles = new Map(); // Map tool names to file paths
  let activeCalls = 0;
  const callQueue = [];
  let watcher = null;
  let isShuttingDown = false;
  let healthStatus = { status: 'healthy', uptime: 0, startTime: Date.now() };

  /**
   * Load or reload a tool from a source.
   */
  function loadTool(source) {
    const built = buildTool(source);
    const toolName = built.schema.name;

    // Store or update tool
    tools.set(toolName, built);

    // Track file path for hot-reload
    if (typeof source === 'string') {
      toolFiles.set(toolName, resolve(source));
    }

    return built;
  }

  /**
   * Reload a tool by file path.
   */
  function reloadToolByPath(filePath) {
    try {
      const absPath = resolve(filePath);

      // Find tool(s) using this file
      for (const [toolName, toolPath] of toolFiles.entries()) {
        if (toolPath === absPath) {
          console.error(`[Hot-Reload] Reloading tool: ${toolName}`);
          loadTool(absPath);
        }
      }
    } catch (err) {
      console.error(`[Hot-Reload] Failed to reload ${filePath}: ${err.message}`);
    }
  }

  // Build and register all tools
  try {
    for (const source of toolSources) {
      const built = loadTool(source);
      if (tools.size !== new Set(tools.keys()).size) {
        throw new Error(`Duplicate tool name: ${built.schema.name}`);
      }
    }
  } catch (err) {
    throw new Error(`Failed to initialize server: ${err.message}`);
  }

  // Set up hot-reload watcher if enabled
  if (hotReload && watchDir) {
    const dirToWatch = resolve(watchDir);
    if (existsSync(dirToWatch)) {
      try {
        watcher = watch(dirToWatch, { recursive: false }, (eventType, filename) => {
          if (!filename) return;
          const filePath = join(dirToWatch, filename);
          const ext = extname(filename).toLowerCase();

          // Only reload YAML/JSON files
          if (['.yaml', '.yml', '.json'].includes(ext)) {
            if (eventType === 'change') {
              // Debounce: wait a bit for file to be fully written
              setTimeout(() => reloadToolByPath(filePath), 100);
            }
          }
        });
        console.error(`[Hot-Reload] Watching directory: ${dirToWatch}`);
      } catch (err) {
        console.error(`[Hot-Reload] Failed to set up watcher: ${err.message}`);
      }
    }
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

      case 'health/check':
      case 'health':
        // Health check endpoint
        healthStatus.uptime = Date.now() - healthStatus.startTime;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            ...healthStatus,
            toolCount: tools.size,
            activeCalls,
            queuedCalls: callQueue.length,
          },
        };

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
   * Execute a tool call with concurrency limiting.
   */
  async function executeToolCall(tool, args, id) {
    // Wait if at max concurrency
    if (activeCalls >= maxConcurrency) {
      await new Promise(resolve => callQueue.push(resolve));
    }

    activeCalls++;
    try {
      const result = await tool.handler(args);
      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        },
      };
    } finally {
      activeCalls--;
      // Release next queued call
      if (callQueue.length > 0) {
        const nextResolve = callQueue.shift();
        nextResolve();
      }
    }
  }

  /**
   * Start the stdio transport
   */
  function start() {
    let buffer = '';

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', async (chunk) => {
      if (isShuttingDown) return;

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
            // Handle async tool calls with concurrency limiting
            const rpcResponse = await executeToolCall(
              response.tool,
              response.args,
              response.id
            );
            process.stdout.write(JSON.stringify(rpcResponse) + '\n');
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

    process.stdin.on('end', () => shutdown());

    // Graceful shutdown on signals
    process.on('SIGTERM', () => shutdown());
    process.on('SIGINT', () => shutdown());
  }

  /**
   * Graceful shutdown handler
   */
  async function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    healthStatus.status = 'shutting_down';

    console.error('[Server] Shutting down gracefully...');

    // Close file watcher
    if (watcher) {
      watcher.close();
    }

    // Wait for active calls to complete (with timeout)
    const shutdownTimeout = 5000;
    const startTime = Date.now();

    while (activeCalls > 0 && Date.now() - startTime < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (activeCalls > 0) {
      console.error(`[Server] Shutdown timeout: ${activeCalls} calls still active`);
    }

    process.exit(0);
  }

  return {
    tools,
    handleRequest,
    start,
    shutdown,
    reload: reloadToolByPath,
    getToolList: () => Array.from(tools.values()).map(t => t.schema),
    getToolCount: () => tools.size,
    getHealth: () => ({
      ...healthStatus,
      uptime: Date.now() - healthStatus.startTime,
      toolCount: tools.size,
      activeCalls,
      queuedCalls: callQueue.length,
    }),
  };
}

/**
 * Load all YAML/JSON tools from a directory and create a server.
 * @param {string} toolsDir - Directory containing tool definition files
 * @param {Object} [options] - Additional server options
 * @returns {Object} Server instance
 */
export function createServerFromDirectory(toolsDir, options = {}) {
  try {
    if (!toolsDir || typeof toolsDir !== 'string') {
      throw new Error('Tools directory path must be a non-empty string');
    }

    const absDir = resolve(toolsDir);
    if (!existsSync(absDir)) {
      throw new Error(`Tools directory not found: ${absDir}`);
    }

    const files = readdirSync(absDir)
      .filter(f => ['.yaml', '.yml', '.json'].includes(extname(f).toLowerCase()))
      .map(f => join(absDir, f));

    if (files.length === 0) {
      throw new Error(`No tool definition files (.yaml, .yml, .json) found in ${absDir}`);
    }

    return createServer({ ...options, tools: files });
  } catch (err) {
    throw new Error(`Failed to create server from directory: ${err.message}`);
  }
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
