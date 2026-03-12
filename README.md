![Forge Banner](assets/banner.svg)

<p align="center"><strong>Build MCP tools from YAML definitions. Share via Marketplace.</strong></p>
<p align="center">The custom tool factory for Claude Code — define, build, validate, and serve MCP tools from simple YAML definitions.</p>

## Why "Forge"?

The name **FORGE** comes from **metallurgy and blacksmithing** — the ancient craft of shaping raw metal into precision tools through heat, hammer, and skill. A blacksmith's forge is where raw materials are transformed into custom, purpose-built instruments.

This is exactly what FORGE does for AI tooling: it takes **raw YAML definitions** (the unformed metal) and **forges them into fully functional MCP tools** (the finished instruments) — complete with validated schemas, typed parameters, and executable handlers. Just as a master smith crafts bespoke tools for specific trades, FORGE lets you craft bespoke tools for specific AI workflows.

The **anvil** represents the solid foundation of the MCP protocol. The **sparks** represent the creative energy of tool authoring — each spark a new capability being hammered into shape. The **marketplace** is the guild hall where smiths share their finest work.

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

# Create a new tool from the template
cp -r examples/tool-template my-new-tool
cd my-new-tool
# Edit tool.yaml with your tool definition

# Test your tool
node test.mjs tool.yaml

# Validate a tool definition
npx forge validate tool.yaml

# Build a tool (outputs MCP schema)
npx forge build tool.yaml

# Generate documentation
npx forge docs tool.yaml > tool-docs.md

# Start MCP server with all templates
npx forge serve templates/

# Install a tool to local registry
npx forge install tool.yaml

# List installed tools
npx forge list

# Deploy a tool (full workflow)
node examples/deploy-tool.mjs tool.yaml
```

## Architecture

```
forge/
├── lib/
│   ├── schema-generator.mjs   # JSON Schema from type descriptions
│   ├── tool-builder.mjs        # Build MCP tools from YAML
│   ├── mcp-server.mjs          # Auto-generate MCP server
│   ├── tool-registry.mjs       # Manage installed tools
│   ├── marketplace.mjs         # Share & discover tools
│   ├── tool-tester.mjs         # Testing framework for tools
│   └── doc-generator.mjs       # Generate Markdown documentation
├── templates/
│   ├── jira-tool.yaml          # Jira search tool template
│   ├── slack-tool.yaml         # Slack messaging tool template
│   └── db-query-tool.yaml      # Database query tool template
├── examples/
│   ├── create-tool.yaml        # Complete example with detailed comments
│   ├── deploy-tool.mjs         # End-to-end deployment example
│   └── tool-template/          # Scaffold for new tools
│       ├── tool.yaml           # Template with placeholders
│       ├── README.md           # Template usage guide
│       └── test.mjs            # Tool testing script
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

## Examples

FORGE includes comprehensive examples to help you get started:

### 1. Sample Tool Definition (`examples/create-tool.yaml`)

A fully-documented GitHub issue search tool that demonstrates:
- Complete YAML structure with detailed comments
- HTTP handler with API integration
- Parameter types, constraints, and validation
- Enum types and default values
- Authentication patterns
- Best practices for tool definitions

This example serves as a reference for creating your own tools from scratch.

### 2. Deployment Script (`examples/deploy-tool.mjs`)

An end-to-end example showing how to:
- Load a YAML tool definition programmatically
- Build the tool using `tool-builder`
- Register it in the local tool registry
- Start an MCP server serving the tool
- Handle the complete deployment workflow

Run it with: `node examples/deploy-tool.mjs [path-to-tool.yaml]`

### 3. Tool Template (`examples/tool-template/`)

A scaffold directory for creating new tools, including:
- **`tool.yaml`** - Template with placeholder fields and inline documentation
- **`README.md`** - Comprehensive guide on filling in the template, parameter types, constraints, and best practices
- **`test.mjs`** - Testing script that validates structure, schema, and parameters

Perfect for kickstarting new tool development. Just copy the template directory and customize for your needs.

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

## Testing Tools

FORGE includes a comprehensive testing framework for validating tool definitions and execution.

### Tool Tester (`lib/tool-tester.mjs`)

The `ToolTester` class provides automated testing and validation:

**Validation Testing**:
- Validates tool definition structure and required fields
- Checks schema generation and JSON serialization
- Verifies parameter constraints and types
- Validates handler template placeholders
- Checks handler type and configuration
- Warns about potential issues

**Execution Testing**:
- Runs tools with mock input data
- Validates output format and structure
- Tests with configurable timeouts
- Verifies handler responses

**Usage Example**:

```javascript
import { ToolTester } from '@pkmdev/forge';

const tester = new ToolTester();

// Validate a tool
const validation = tester.validate('my-tool.yaml');
if (!validation.valid) {
  console.error('Errors:', validation.errors);
  console.warn('Warnings:', validation.warnings);
}

// Test execution
const execution = await tester.testExecution('my-tool.yaml', {
  param1: 'value1',
  param2: 42
});

// Run all tests
const results = await tester.runAll('my-tool.yaml', {
  mockInput: { /* custom test data */ }
});
console.log('Passed:', results.passed);
```

### Template Test Script

The tool template includes `examples/tool-template/test.mjs` for quick validation:

```bash
node examples/tool-template/test.mjs my-tool.yaml
```

This runs a comprehensive test suite checking structure, schema, parameters, and handler configuration.

## Documentation Generation

FORGE can automatically generate comprehensive Markdown documentation for your tools.

### Doc Generator (`lib/doc-generator.mjs`)

The `DocGenerator` class creates professional documentation including:

- Tool name, description, and metadata
- Complete parameter tables with types and constraints
- Handler configuration and templates
- Usage examples and code snippets
- MCP schema output
- Installation and usage instructions

**Usage Example**:

```javascript
import { DocGenerator } from '@pkmdev/forge';

const docGen = new DocGenerator();

// Generate documentation
const markdown = docGen.generate('my-tool.yaml');
console.log(markdown);

// Save to file
docGen.save('my-tool.yaml', 'docs/my-tool.md');

// Generate for multiple tools
const docs = docGen.generateMultiple([
  'tool1.yaml',
  'tool2.yaml',
  'tool3.yaml'
]);

// Generate an index/table of contents
const index = docGen.generateIndex([
  'tool1.yaml',
  'tool2.yaml'
]);
```

**CLI Usage**:

```bash
# Generate documentation for a tool
npx forge docs my-tool.yaml > my-tool.md

# Generate documentation for all tools in a directory
npx forge docs templates/ > all-tools.md
```

The generated documentation is clean, well-structured Markdown that can be committed to your repository or published to a documentation site.

## Testing

```bash
npm test
```

80 tests across 5 modules covering schema generation, tool building, MCP server, registry, and marketplace.

## License

MIT
