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
} catch {
  // Minimal YAML parser for simple key-value and nested structures
  parseYAML = null;
}

/**
 * Parse a YAML string into an object.
 */
export function parseYaml(content) {
  if (parseYAML) return parseYAML(content);
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
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`Tool definition file not found: ${absPath}`);
  }

  const ext = extname(absPath).toLowerCase();
  const content = readFileSync(absPath, 'utf-8');

  if (ext === '.json') {
    return JSON.parse(content);
  }

  if (ext === '.yaml' || ext === '.yml') {
    return parseYaml(content);
  }

  throw new Error(`Unsupported file format: ${ext}. Use .yaml, .yml, or .json`);
}

/**
 * Validate a tool definition has required fields.
 * @param {Object} def - Tool definition
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateToolDefinition(def) {
  const errors = [];

  if (!def) {
    return { valid: false, errors: ['Definition is null or undefined'] };
  }
  if (!def.name || typeof def.name !== 'string') {
    errors.push('Missing or invalid "name" field (must be a string)');
  }
  if (def.name && !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(def.name)) {
    errors.push('Tool name must start with a letter/underscore and contain only alphanumeric, dash, or underscore');
  }
  if (!def.description || typeof def.description !== 'string') {
    errors.push('Missing or invalid "description" field (must be a string)');
  }
  if (def.parameters && typeof def.parameters !== 'object') {
    errors.push('"parameters" must be an object');
  }
  if (def.handler && typeof def.handler !== 'string') {
    errors.push('"handler" must be a string (command template or function reference)');
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
      const { execSync } = await import('node:child_process');
      let cmd = def.handler;

      // Interpolate {{param}} placeholders, sanitizing values
      for (const [key, value] of Object.entries(args || {})) {
        const sanitized = String(value).replace(/[;&|`$()]/g, '');
        cmd = cmd.replaceAll(`{{${key}}}`, sanitized);
      }

      try {
        const output = execSync(cmd, {
          encoding: 'utf-8',
          timeout: def.timeout || 30000,
          maxBuffer: 1024 * 1024,
        });
        return {
          content: [{ type: 'text', text: output.trim() }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
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
}

/**
 * Build multiple tools from an array of sources.
 * @param {Array<string|Object>} sources
 * @returns {Array<Object>}
 */
export function buildTools(sources) {
  return sources.map(buildTool);
}

export default {
  parseYaml,
  loadToolDefinition,
  validateToolDefinition,
  buildHandler,
  buildTool,
  buildTools,
};
