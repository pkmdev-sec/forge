```
    ╔══════════════════════════════════════════════════════════════╗
    ║       ✦  ·  ✧                                               ║
    ║      ✧ · ✦  ·                                               ║
    ║        ╔═══╗           ███████╗ ██████╗  ██████╗  ██████╗ ███████╗  ║
    ║       ╔╝   ╚╗          ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝  ║
    ║      ╔╝ ▄█▄ ╚╗         █████╗  ██║   ██║██████╔╝██║  ███╗█████╗    ║
    ║     ╔╝ █████ ╚╗        ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝    ║
    ║    ╔╝ ███████ ╚╗       ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗  ║
    ║    ║ █████████ ║       ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝  ║
    ║    ╠═══════════╣                                                     ║
    ║    ║ ░░░▓▓▓░░░ ║       ⚒  CUSTOM TOOL FACTORY                      ║
    ║    ╚═══════════╝                                                     ║
    ╚══════════════════════════════════════════════════════════════╝
```

> **Build MCP tools from YAML definitions. Share via Marketplace.**

## Overview

**FORGE** is a custom tool factory that lets you define, build, validate, and serve MCP (Model Context Protocol) tools from simple YAML definitions. It includes a tool registry for managing installed tools and a marketplace for sharing and discovering tools.

## Features

- **Tool Builder** — Build MCP-compatible tools from YAML/JSON definitions
- **Schema Generator** — Auto-generate JSON schemas from simple type descriptions
- **MCP Server** — Auto-generate a working MCP server from tool definitions
- **Tool Registry** — Install, uninstall, update, and manage custom tools locally
- **Marketplace** — Publish, search, browse, and install shared tools

## Quick Start

```bash
# Install dependencies
npm install

# Validate a tool definition
npx forge validate templates/jira-tool.yaml

# Build a tool (outputs MCP schema)
npx forge build templates/slack-tool.yaml

# Start MCP server with all templates
npx forge serve templates/

# Install a tool to local registry
npx forge install templates/db-query-tool.yaml

# List installed tools
npx forge list
```

## Architecture

```
forge/
├── lib/
│   ├── schema-generator.mjs   # JSON Schema from type descriptions
│   ├── tool-builder.mjs        # Build MCP tools from YAML
│   ├── mcp-server.mjs          # Auto-generate MCP server
│   ├── tool-registry.mjs       # Manage installed tools
│   └── marketplace.mjs         # Share & discover tools
├── templates/
│   ├── jira-tool.yaml          # Jira search tool template
│   ├── slack-tool.yaml         # Slack messaging tool template
│   └── db-query-tool.yaml      # Database query tool template
├── tests/                       # Comprehensive test suite
├── docs/                        # Documentation
├── cli.mjs                     # CLI entry point
├── index.mjs                   # Library exports
└── banner.mjs                  # ASCII banner
```

## YAML Tool Definition Format

```yaml
name: my-tool
description: What this tool does
version: "1.0.0"
author: your-name
tags:
  - category

handler_type: shell          # shell | http
handler: "echo {{input}}"   # Command or URL with {{param}} placeholders
timeout: 30000

parameters:
  input:
    type: string             # string | number | integer | boolean | array<T> | enum:a,b,c
    description: "Parameter description"
    required: true
    default: "value"
```

## Supported Handler Types

### Shell Handler
Executes a shell command with parameter interpolation. Values are sanitized to prevent injection.

```yaml
handler_type: shell
handler: "sqlite3 -json {{db_path}} '{{query}}'"
```

### HTTP Handler
Makes HTTP requests with parameter interpolation in URL and headers.

```yaml
handler_type: http
handler: "https://api.example.com/v1/{{endpoint}}"
http_method: POST
headers:
  Authorization: "Bearer {{token}}"
```

## Supported Types

| Type String | JSON Schema Type |
|-------------|-----------------|
| `string`, `str`, `text` | `string` |
| `number`, `num` | `number` |
| `integer`, `int` | `integer` |
| `boolean`, `bool` | `boolean` |
| `array`, `list` | `array` |
| `array<string>` | `array` with `items: {type: string}` |
| `object`, `map` | `object` |
| `enum:a,b,c` | `string` with `enum: [a, b, c]` |

## CLI Commands

| Command | Description |
|---------|-------------|
| `forge build <file>` | Build and output MCP schema from YAML |
| `forge validate <file>` | Validate a tool definition |
| `forge serve <dir>` | Start MCP server from tools directory |
| `forge install <file>` | Install tool to local registry |
| `forge uninstall <name>` | Remove tool from registry |
| `forge list` | List installed tools |
| `forge publish <file>` | Publish to marketplace |
| `forge search <query>` | Search marketplace |
| `forge browse` | Browse all marketplace tools |

## Programmatic Usage

```javascript
import { buildTool, createServer, createRegistry, createMarketplace } from '@pkmdev/forge';

// Build a tool from YAML
const tool = buildTool('templates/jira-tool.yaml');
console.log(tool.schema);

// Create an MCP server
const server = createServer({
  tools: ['templates/jira-tool.yaml', 'templates/slack-tool.yaml'],
});
server.start();

// Manage tools
const registry = createRegistry();
registry.install('templates/db-query-tool.yaml', { name: 'db-query' });
console.log(registry.list());

// Share tools
const mp = createMarketplace();
mp.publish({ name: 'my-tool', file: 'my-tool.yaml', version: '1.0.0' });
```

## Testing

```bash
npm test
```

80 tests across 5 modules covering schema generation, tool building, MCP server, registry, and marketplace.

## License

MIT
