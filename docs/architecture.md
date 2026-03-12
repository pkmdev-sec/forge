# FORGE Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FORGE CLI (cli.mjs)                       │
│    build │ validate │ serve │ install │ publish │ search         │
└────┬─────┴────┬─────┴───┬───┴────┬────┴────┬────┴───────────────┘
     │          │         │        │         │
     ▼          ▼         ▼        ▼         ▼
┌─────────┐ ┌────────┐ ┌──────┐ ┌────────┐ ┌───────────┐
│  Tool   │ │Schema  │ │ MCP  │ │  Tool  │ │Marketplace│
│ Builder │ │Generat.│ │Server│ │Registry│ │           │
│         │◄┤        │ │      │ │        │◄┤           │
└────┬────┘ └────────┘ └──┬───┘ └───┬────┘ └───────────┘
     │                    │         │
     ▼                    ▼         ▼
┌─────────────┐   ┌────────────┐  ┌──────────────┐
│ YAML/JSON   │   │ stdio/     │  │ ~/.forge/    │
│ Definitions │   │ JSON-RPC   │  │ registry.json│
│ (templates/)│   │ Transport  │  │ tools/       │
└─────────────┘   └────────────┘  └──────────────┘
```

## Module Dependency Graph

```
index.mjs (re-exports)
    │
    ├── schema-generator.mjs   ← No dependencies (leaf module)
    │
    ├── tool-builder.mjs       ← Depends on: schema-generator
    │
    ├── mcp-server.mjs         ← Depends on: tool-builder
    │
    ├── tool-registry.mjs      ← No internal dependencies (uses fs)
    │
    └── marketplace.mjs        ← Depends on: tool-registry
```

## Data Flow: Building a Tool

```
YAML File                    Parsed Definition             MCP Tool Schema
┌──────────────┐   parse    ┌──────────────────┐  build  ┌────────────────┐
│ name: my-tool│──────────►│ { name, desc,    │────────►│ { name,        │
│ description: │           │   parameters,    │         │   description, │
│ parameters:  │           │   handler,       │         │   inputSchema: │
│   input:     │           │   handler_type } │         │   { type, ... }│
│     type: str│           └────────┬─────────┘         │ }              │
└──────────────┘                    │                    └────────────────┘
                                    │
                            ┌───────▼────────┐
                            │ Handler Func   │
                            │ (shell | http) │
                            │ async (args)=> │
                            │   result       │
                            └────────────────┘
```

## Data Flow: MCP Server Request Handling

```
Client                    MCP Server                   Tool Handler
  │                          │                              │
  │──initialize──────────►  │                              │
  │◄─────serverInfo────────│                              │
  │                          │                              │
  │──tools/list───────────►│                              │
  │◄─────tool schemas──────│                              │
  │                          │                              │
  │──tools/call────────────►│──invoke handler──────────►  │
  │                          │◄─────result─────────────────│
  │◄─────tool result────────│                              │
```

## Registry Storage Layout

```
~/.forge/
├── registry.json          # Tool metadata index
│   {
│     "tools": {
│       "jira-search": {
│         "name": "jira-search",
│         "file": "jira-tool.yaml",
│         "path": "~/.forge/tools/jira-tool.yaml",
│         "version": "1.0.0",
│         "installedAt": "2026-03-12T..."
│       }
│     }
│   }
├── tools/                 # Installed tool definition files
│   ├── jira-tool.yaml
│   ├── slack-tool.yaml
│   └── db-query-tool.yaml
└── marketplace/
    └── catalog.json       # Published tool catalog
```

## Type Resolution Pipeline

```
Input String         resolveType()          JSON Schema Fragment
─────────────       ───────────────        ────────────────────
"string"         →  { type: "string" }
"integer"        →  { type: "integer" }
"array<string>"  →  { type: "array", items: { type: "string" } }
"enum:a,b,c"     →  { type: "string", enum: ["a","b","c"] }
"boolean"        →  { type: "boolean" }
```
