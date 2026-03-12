#!/usr/bin/env node

/**
 * FORGE CLI — Custom Tool Factory
 * Command-line interface for building, managing, and serving MCP tools.
 */

import { resolve } from 'node:path';
import { buildTool, validateToolDefinition, loadToolDefinition } from './lib/tool-builder.mjs';
import { createServer, createServerFromDirectory } from './lib/mcp-server.mjs';
import { createRegistry } from './lib/tool-registry.mjs';
import { createMarketplace } from './lib/marketplace.mjs';

const [,, command, ...args] = process.argv;

const HELP = `
\x1b[38;2;249;115;22m⚒  FORGE — Custom Tool Factory\x1b[0m

Usage: forge <command> [options]

Commands:
  build <file>        Build and validate a tool from YAML/JSON definition
  validate <file>     Validate a tool definition file
  serve <dir>         Start MCP server from a tools directory
  install <file>      Install a tool to the local registry
  uninstall <name>    Remove a tool from the registry
  list                List all installed tools
  publish <file>      Publish a tool to the marketplace
  search <query>      Search the marketplace
  browse              Browse all marketplace tools
  help                Show this help message

Examples:
  forge build templates/jira-tool.yaml
  forge serve ./templates
  forge install templates/slack-tool.yaml
  forge search database
`;

async function main() {
  switch (command) {
    case 'build': {
      const file = args[0];
      if (!file) { console.error('Usage: forge build <file>'); process.exit(1); }
      const tool = buildTool(resolve(file));
      console.log(JSON.stringify(tool.schema, null, 2));
      break;
    }

    case 'validate': {
      const file = args[0];
      if (!file) { console.error('Usage: forge validate <file>'); process.exit(1); }
      const def = loadToolDefinition(resolve(file));
      const result = validateToolDefinition(def);
      if (result.valid) {
        console.log('✓ Tool definition is valid');
      } else {
        console.error('✗ Validation errors:');
        result.errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      }
      break;
    }

    case 'serve': {
      const dir = args[0] || './templates';
      const server = createServerFromDirectory(resolve(dir));
      console.error(`FORGE MCP Server started with ${server.getToolCount()} tools`);
      server.start();
      break;
    }

    case 'install': {
      const file = args[0];
      if (!file) { console.error('Usage: forge install <file>'); process.exit(1); }
      const registry = createRegistry();
      const info = registry.install(resolve(file));
      console.log(`✓ Installed: ${info.name} (${info.version})`);
      break;
    }

    case 'uninstall': {
      const name = args[0];
      if (!name) { console.error('Usage: forge uninstall <name>'); process.exit(1); }
      const registry = createRegistry();
      const removed = registry.uninstall(name);
      console.log(removed ? `✓ Uninstalled: ${name}` : `✗ Not found: ${name}`);
      break;
    }

    case 'list': {
      const registry = createRegistry();
      const tools = registry.list();
      if (tools.length === 0) {
        console.log('No tools installed.');
      } else {
        tools.forEach(t => console.log(`  ${t.name} (v${t.version}) — installed ${t.installedAt}`));
      }
      break;
    }

    case 'publish': {
      const file = args[0];
      if (!file) { console.error('Usage: forge publish <file>'); process.exit(1); }
      const def = loadToolDefinition(resolve(file));
      const mp = createMarketplace();
      const entry = mp.publish({ ...def, file: resolve(file) });
      console.log(`✓ Published: ${entry.name} v${entry.version}`);
      break;
    }

    case 'search': {
      const query = args.join(' ');
      if (!query) { console.error('Usage: forge search <query>'); process.exit(1); }
      const mp = createMarketplace();
      const results = mp.search(query);
      if (results.length === 0) {
        console.log('No tools found.');
      } else {
        results.forEach(t => console.log(`  ${t.name} (v${t.version}) by ${t.author} — ${t.description}`));
      }
      break;
    }

    case 'browse': {
      const mp = createMarketplace();
      const results = mp.browse({ sortBy: 'downloads' });
      if (results.length === 0) {
        console.log('Marketplace is empty.');
      } else {
        results.forEach(t => console.log(`  ${t.name} (v${t.version}) ⬇${t.downloads} ★${t.rating} — ${t.description}`));
      }
      break;
    }

    case 'help':
    default:
      console.log(HELP);
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
