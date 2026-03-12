#!/usr/bin/env node

/**
 * Example: Deploy a Custom MCP Tool
 *
 * This script demonstrates the complete workflow for deploying a custom MCP tool:
 * 1. Load a YAML tool definition
 * 2. Build the tool using the tool-builder
 * 3. Register it in the local tool registry
 * 4. Start an MCP server serving the tool
 *
 * Run this with: node examples/deploy-tool.mjs [path-to-tool.yaml]
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTool } from '../lib/tool-builder.mjs';
import { createRegistry } from '../lib/tool-registry.mjs';
import { createServer } from '../lib/mcp-server.mjs';

// Get tool file path from command line or use default
const toolFile = process.argv[2] || './examples/create-tool.yaml';
const absToolPath = resolve(toolFile);

console.log('='.repeat(60));
console.log('FORGE Tool Deployment Example');
console.log('='.repeat(60));
console.log();

try {
  // Step 1: Load the tool definition
  console.log(`[1/4] Loading tool definition from: ${absToolPath}`);
  const tool = buildTool(absToolPath);
  console.log(`      ✓ Tool loaded: ${tool.schema.name}`);
  console.log(`      Description: ${tool.schema.description}`);
  console.log();

  // Step 2: Display the generated schema
  console.log(`[2/4] Generated MCP Schema:`);
  console.log(JSON.stringify(tool.schema, null, 2));
  console.log();

  // Step 3: Register the tool in the local registry
  console.log(`[3/4] Registering tool in local registry...`);
  const registry = createRegistry();

  // Install with metadata from the definition
  const installedTool = registry.install(absToolPath, {
    name: tool.definition.name,
    version: tool.definition.version || '1.0.0',
    author: tool.definition.author || 'unknown',
    tags: tool.definition.tags || [],
  });

  console.log(`      ✓ Tool registered: ${installedTool.name}`);
  console.log(`      Version: ${installedTool.version}`);
  console.log(`      Installed at: ${installedTool.installedAt}`);
  console.log();

  // Display all installed tools
  const allTools = registry.list();
  console.log(`      Registry now contains ${allTools.length} tool(s):`);
  allTools.forEach(t => {
    console.log(`        - ${t.name} (v${t.version})`);
  });
  console.log();

  // Step 4: Create and start an MCP server
  console.log(`[4/4] Starting MCP server...`);
  console.log(`      Server will serve the following tools:`);
  console.log(`        - ${tool.schema.name}`);
  console.log();
  console.log(`      Server info:`);
  console.log(`        Protocol: MCP (Model Context Protocol)`);
  console.log(`        Transport: stdio (JSON-RPC 2.0)`);
  console.log(`        Tools: 1`);
  console.log();

  // Create server with the registered tool
  const server = createServer({
    name: 'forge-example-server',
    version: '1.0.0',
    tools: [absToolPath],
    maxConcurrency: 5,
  });

  console.log(`      ✓ Server created successfully`);
  console.log();
  console.log('='.repeat(60));
  console.log('Server is now running. Send MCP commands via stdin.');
  console.log('Press Ctrl+C to stop the server.');
  console.log('='.repeat(60));
  console.log();
  console.log('Example MCP request (copy and paste):');
  console.log(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  }));
  console.log();

  // Start the server (blocks until shutdown)
  server.start();

} catch (error) {
  console.error();
  console.error('❌ Error:', error.message);
  console.error();
  console.error('Stack trace:');
  console.error(error.stack);
  process.exit(1);
}
