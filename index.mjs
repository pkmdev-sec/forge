/**
 * FORGE — Custom Tool Factory
 * Main entry point. Re-exports all modules.
 */

export { generateInputSchema, generateToolSchema, generateMultipleSchemas, resolveType } from './lib/schema-generator.mjs';
export { buildTool, buildTools, loadToolDefinition, validateToolDefinition, buildHandler } from './lib/tool-builder.mjs';
export { createServer, createServerFromDirectory } from './lib/mcp-server.mjs';
export { createRegistry } from './lib/tool-registry.mjs';
export { createMarketplace } from './lib/marketplace.mjs';
