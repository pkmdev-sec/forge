# Creating Custom Tools

## Step 1: Write a YAML Definition

Create a `.yaml` file with your tool definition:

```yaml
name: github-issues
description: Search GitHub issues by repository and query
version: "1.0.0"
author: your-name
tags:
  - github
  - issues

handler_type: shell
handler: "gh issue list --repo {{repo}} --search '{{query}}' --limit {{limit}} --json number,title,state"
timeout: 15000

parameters:
  repo:
    type: string
    description: "GitHub repository (owner/repo)"
    required: true
  query:
    type: string
    description: "Search query"
    required: true
  limit:
    type: integer
    description: "Max results"
    required: false
    default: 10
    minimum: 1
    maximum: 100
```

## Step 2: Validate

```bash
forge validate my-tool.yaml
# ✓ Tool definition is valid
```

## Step 3: Build & Test

```bash
# View generated MCP schema
forge build my-tool.yaml

# Serve as MCP server for testing
forge serve ./my-tools/
```

## Step 4: Install & Share

```bash
# Install locally
forge install my-tool.yaml

# Publish to marketplace
forge publish my-tool.yaml

# Others can find and install it
forge search github
forge browse
```

## Parameter Types Reference

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text value | `"hello"` |
| `integer` | Whole number | `42` |
| `number` | Decimal number | `3.14` |
| `boolean` | True/false | `true` |
| `array<string>` | List of strings | `["a", "b"]` |
| `enum:a,b,c` | One of values | `"b"` |

## Parameter Constraints

```yaml
parameters:
  count:
    type: integer
    minimum: 1          # Min value
    maximum: 100        # Max value
    default: 25         # Default if not provided
  query:
    type: string
    pattern: "^SELECT"  # Regex pattern
    minLength: 5        # Min string length
    maxLength: 1000     # Max string length
```

## Handler Types

### Shell
Runs a shell command. Parameters are interpolated via `{{param}}` and automatically sanitized.

### HTTP
Makes an HTTP request. URL parameters interpolated, body sent as JSON for POST/PUT/PATCH.

```yaml
handler_type: http
handler: "https://api.example.com/search?q={{query}}"
http_method: GET
headers:
  Authorization: "Bearer {{token}}"
```
