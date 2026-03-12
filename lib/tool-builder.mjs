/**
 * FORGE Tool Builder
 * Build MCP tools from YAML definitions.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { generateToolSchema } from './schema-generator.mjs';

// Inline YAML parser for simple YAML (avoids requiring install for core logic)
// Falls back to 'yaml' package if available
let parseYAML;
try {
  const yamlMod = await import('yaml');
  parseYAML = yamlMod.parse || yamlMod.default?.parse;
} catch (err) {
  // Only catch MODULE_NOT_FOUND, re-throw other errors
  if (err.code !== 'ERR_MODULE_NOT_FOUND' && err.code !== 'MODULE_NOT_FOUND') {
    throw err;
  }
  // Minimal YAML parser for simple key-value and nested structures
  parseYAML = null;
}

/**
 * Parse a YAML string into an object.
 */
export function parseYaml(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('YAML content must be a non-empty string');
  }

  if (parseYAML) {
    try {
      return parseYAML(content);
    } catch (err) {
      throw new Error(`YAML parsing failed: ${err.message}`);
    }
  }

  // Fallback: use JSON if it looks like JSON
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('YAML parser not available. Install "yaml" package: npm install yaml');
  }
}

/**
 * Load and parse a YAML tool definition file.
 * @param {string} filePath - Path to the YAML file
 * @returns {Object} Parsed tool definition
 */
export function loadToolDefinition(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path must be a non-empty string');
    }

    const absPath = resolve(filePath);
    if (!existsSync(absPath)) {
      throw new Error(`Tool definition file not found: ${absPath}`);
    }

    const ext = extname(absPath).toLowerCase();
    const content = readFileSync(absPath, 'utf-8');

    if (ext === '.json') {
      try {
        return JSON.parse(content);
      } catch (err) {
        throw new Error(`Invalid JSON in ${absPath}: ${err.message}`);
      }
    }

    if (ext === '.yaml' || ext === '.yml') {
      return parseYaml(content);
    }

    throw new Error(`Unsupported file format: ${ext}. Use .yaml, .yml, or .json`);
  } catch (err) {
    if (err.message.includes('Tool definition file') ||
        err.message.includes('Unsupported file format') ||
        err.message.includes('Invalid JSON') ||
        err.message.includes('YAML') ||
        err.message.includes('File path must')) {
      throw err;
    }
    throw new Error(`Failed to load tool definition from ${filePath}: ${err.message}`);
  }
}

/**
 * Validate a tool definition has required fields.
 * Supports MCP tool types: tool (default), resource, prompt.
 * @param {Object} def - Tool definition
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateToolDefinition(def) {
  const errors = [];

  if (!def) {
    return { valid: false, errors: ['Definition is null or undefined'] };
  }

  // Determine tool type (default to 'tool')
  const toolType = def.type || 'tool';
  if (!['tool', 'resource', 'prompt'].includes(toolType)) {
    errors.push(`Invalid tool type "${toolType}". Must be one of: tool, resource, prompt`);
  }

  // Common validations for all types
  if (!def.name || typeof def.name !== 'string') {
    errors.push('Missing or invalid "name" field (must be a string)');
  }
  if (def.name && !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(def.name)) {
    errors.push('Tool name must start with a letter/underscore and contain only alphanumeric, dash, or underscore');
  }
  if (!def.description || typeof def.description !== 'string') {
    errors.push('Missing or invalid "description" field (must be a string)');
  }

  // Type-specific validations
  if (toolType === 'resource') {
    // Resource type requires URI or URI template
    if (!def.uri && !def.uriTemplate) {
      errors.push('Resource type requires either "uri" or "uriTemplate" field');
    }
    if (def.uri && typeof def.uri !== 'string') {
      errors.push('"uri" must be a string');
    }
    if (def.uriTemplate && typeof def.uriTemplate !== 'string') {
      errors.push('"uriTemplate" must be a string');
    }
    // Optional: validate mime types
    if (def.mimeType && typeof def.mimeType !== 'string') {
      errors.push('"mimeType" must be a string');
    }
  } else if (toolType === 'prompt') {
    // Prompt type requires arguments schema
    if (def.arguments) {
      if (typeof def.arguments !== 'object' || Array.isArray(def.arguments)) {
        errors.push('"arguments" must be an object (schema definition)');
      }
    }
  } else {
    // Standard tool type
    if (def.parameters && typeof def.parameters !== 'object') {
      errors.push('"parameters" must be an object');
    }
    if (def.handler && typeof def.handler !== 'string') {
      errors.push('"handler" must be a string (command template or function reference)');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build a handler function from a tool definition's handler template.
 * Supports shell command templates with {{param}} interpolation.
 * @param {Object} def - Tool definition with handler
 * @returns {Function} Async handler function (args) => result
 */
export function buildHandler(def) {
  if (!def.handler) {
    return async (args) => ({
      content: [{ type: 'text', text: `Tool "${def.name}" executed with args: ${JSON.stringify(args)}` }],
    });
  }

  const handlerType = def.handler_type || 'shell';

  if (handlerType === 'shell') {
    return async (args) => {
      const { spawn } = await import('node:child_process');

      // Parse command template to extract command and arguments
      const template = def.handler;

      // Split on spaces, but respect {{param}} placeholders
      const parts = [];
      let current = '';
      let inPlaceholder = false;

      for (let i = 0; i < template.length; i++) {
        if (template[i] === '{' && template[i + 1] === '{') {
          inPlaceholder = true;
          current += '{{';
          i++;
        } else if (template[i] === '}' && template[i + 1] === '}' && inPlaceholder) {
          inPlaceholder = false;
          current += '}}';
          i++;
        } else if (template[i] === ' ' && !inPlaceholder) {
          if (current) parts.push(current);
          current = '';
        } else {
          current += template[i];
        }
      }
      if (current) parts.push(current);

      // Interpolate placeholders - sanitize dangerous characters
      const interpolated = parts.map(part => {
        let result = part;
        for (const [key, value] of Object.entries(args || {})) {
          const placeholder = `{{${key}}}`;
          if (result.includes(placeholder)) {
            // Sanitize: remove shell metacharacters
            // This includes: ; & | ` $ ( ) < > / \n \r * ? [ ] { } ' " \
            const sanitized = String(value)
              .replace(/[;&|`$()<>\/\n\r*?\[\]{}'"\\\t]/g, '')
              .trim();
            result = result.replaceAll(placeholder, sanitized);
          }
        }
        return result;
      });

      if (interpolated.length === 0) {
        throw new Error('Invalid shell command template');
      }

      const command = interpolated[0];
      const cmdArgs = interpolated.slice(1);

      // Use spawn with explicit arguments (no shell) for better security
      return new Promise((resolve) => {
        const proc = spawn(command, cmdArgs, {
          timeout: def.timeout || 30000,
          shell: false,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('error', (err) => {
          resolve({
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true,
          });
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({
              content: [{ type: 'text', text: stdout.trim() }],
            });
          } else {
            resolve({
              content: [{ type: 'text', text: `Error (exit ${code}): ${stderr || stdout}` }],
              isError: true,
            });
          }
        });
      });
    };
  }

  if (handlerType === 'http') {
    return async (args) => {
      let url = def.handler;
      const method = (def.http_method || 'GET').toUpperCase();

      for (const [key, value] of Object.entries(args || {})) {
        url = url.replaceAll(`{{${key}}}`, encodeURIComponent(String(value)));
      }

      try {
        const options = { method };
        if (method !== 'GET' && method !== 'HEAD') {
          options.body = JSON.stringify(args);
          options.headers = { 'Content-Type': 'application/json', ...def.headers };
        }

        const resp = await fetch(url, options);
        const text = await resp.text();
        return {
          content: [{ type: 'text', text }],
          isError: !resp.ok,
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `HTTP Error: ${err.message}` }],
          isError: true,
        };
      }
    };
  }

  throw new Error(`Unsupported handler type: ${handlerType}`);
}

/**
 * Build a complete MCP tool from a YAML definition file or object.
 * @param {string|Object} source - File path or definition object
 * @returns {Object} { schema, handler, definition }
 */
export function buildTool(source) {
  try {
    if (!source) {
      throw new Error('Tool source must be provided (file path or definition object)');
    }

    const def = typeof source === 'string' ? loadToolDefinition(source) : source;

    const validation = validateToolDefinition(def);
    if (!validation.valid) {
      throw new Error(`Invalid tool definition: ${validation.errors.join(', ')}`);
    }

    const schema = generateToolSchema(def);
    const handler = buildHandler(def);

    return {
      schema,
      handler,
      definition: def,
    };
  } catch (err) {
    if (err.message.includes('Invalid tool definition') ||
        err.message.includes('Tool source must') ||
        err.message.includes('Tool definition file') ||
        err.message.includes('Unsupported handler type')) {
      throw err;
    }
    throw new Error(`Failed to build tool: ${err.message}`);
  }
}

/**
 * Build multiple tools from an array of sources.
 * @param {Array<string|Object>} sources
 * @returns {Array<Object>}
 */
export function buildTools(sources) {
  if (!Array.isArray(sources)) {
    throw new Error('Sources must be an array');
  }
  return sources.map((source, idx) => {
    try {
      return buildTool(source);
    } catch (err) {
      throw new Error(`Failed to build tool at index ${idx}: ${err.message}`);
    }
  });
}

export default {
  parseYaml,
  loadToolDefinition,
  validateToolDefinition,
  buildHandler,
  buildTool,
  buildTools,
};
