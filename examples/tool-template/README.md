# Tool Template Guide

This template provides a scaffold for creating new FORGE MCP tools. Follow the steps below to create your own custom tool.

## Quick Start

1. **Copy this template directory** to a new location for your tool
2. **Edit `tool.yaml`** with your tool's configuration
3. **Test your tool** using `test.mjs`
4. **Deploy your tool** using the deployment example

## Tool Configuration Fields

### Required Fields

- **name**: Unique identifier for your tool (lowercase, hyphens/underscores only)
- **description**: Clear explanation of what the tool does
- **handler_type**: Either `shell` (for CLI commands) or `http` (for API calls)
- **handler**: The command template or URL with `{{parameter}}` placeholders
- **parameters**: Object defining all input parameters

### Optional Fields

- **version**: Semantic version string (default: "1.0.0")
- **author**: Tool creator's name
- **tags**: Array of category tags for discovery
- **timeout**: Execution timeout in milliseconds (default: 30000)
- **http_method**: HTTP method for API calls (default: "GET")
- **headers**: HTTP headers object (for http handler_type)

## Parameter Types

FORGE supports these parameter types:

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text value | `"hello world"` |
| `number` | Numeric value (int or float) | `42`, `3.14` |
| `integer` | Integer value only | `42` |
| `boolean` | True/false value | `true`, `false` |
| `array` | List of values | `["a", "b", "c"]` |
| `array<T>` | Typed array | `array<string>` |
| `enum:a,b,c` | Limited choices | `enum:json,yaml,xml` |

## Parameter Constraints

Add validation constraints to parameters:

```yaml
my_param:
  type: string
  description: "Description"
  required: true
  minLength: 1      # Minimum string length
  maxLength: 100    # Maximum string length
  pattern: "^[a-z]+$"  # Regex pattern

numeric_param:
  type: integer
  minimum: 0        # Minimum value
  maximum: 100      # Maximum value
  default: 10       # Default value

choice_param:
  type: string
  enum:             # Allowed values only
    - option1
    - option2
    - option3
```

## Handler Types

### Shell Handler

Execute command-line programs with parameter substitution:

```yaml
handler_type: shell
handler: "curl -s {{url}} | jq '.{{field}}'"
timeout: 10000

parameters:
  url:
    type: string
    description: "URL to fetch"
    required: true
  field:
    type: string
    description: "JSON field to extract"
    required: true
```

### HTTP Handler

Make HTTP API requests:

```yaml
handler_type: http
handler: "https://api.example.com/v1/{{endpoint}}"
http_method: POST
headers:
  Authorization: "Bearer {{api_token}}"
  Content-Type: "application/json"
timeout: 15000

parameters:
  endpoint:
    type: string
    description: "API endpoint path"
    required: true
  api_token:
    type: string
    description: "Authentication token"
    required: true
```

## Testing Your Tool

Use the included `test.mjs` script to test your tool:

```bash
# Run tests
node test.mjs

# Test with custom tool file
node test.mjs my-tool.yaml
```

The test script will:
- Validate the YAML syntax
- Check the schema structure
- Verify parameter constraints
- Test handler template interpolation

## Deploying Your Tool

Once your tool is ready:

```bash
# Validate
npx forge validate tool.yaml

# Build (see generated schema)
npx forge build tool.yaml

# Install to local registry
npx forge install tool.yaml

# Publish to marketplace (if configured)
npx forge publish tool.yaml
```

## Examples

See `../create-tool.yaml` for a complete, well-documented example of a GitHub issue search tool.

## Best Practices

1. **Clear descriptions**: Make tool and parameter descriptions helpful and specific
2. **Validation**: Add appropriate constraints (min/max, pattern, enum) to parameters
3. **Error handling**: Consider what happens when commands fail
4. **Security**: Never include secrets in the YAML (use parameters instead)
5. **Versioning**: Use semantic versioning and update when making changes
6. **Testing**: Test with various inputs before publishing

## Getting Help

- Read the main FORGE README at `../../README.md`
- Check example tools in `../../templates/`
- Review the documentation in `../../docs/`
