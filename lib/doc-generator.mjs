#!/usr/bin/env node

/**
 * FORGE Documentation Generator
 * Generates Markdown documentation from tool definitions.
 * Includes name, description, parameters table, examples, and handler info.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadToolDefinition } from './tool-builder.mjs';
import { generateToolSchema } from './schema-generator.mjs';

/**
 * Documentation generator for FORGE tools.
 */
export class DocGenerator {
  /**
   * Generate Markdown documentation for a tool.
   * @param {string|Object} toolDef - Tool definition file path or object
   * @returns {string} Markdown documentation
   */
  generate(toolDef) {
    try {
      // Load definition if it's a file path
      const def = typeof toolDef === 'string' ? loadToolDefinition(toolDef) : toolDef;

      // Generate schema for additional information
      const schema = generateToolSchema(def);

      let md = '';

      // Title and description
      md += `# ${def.name}\n\n`;
      md += `${def.description}\n\n`;

      // Metadata section
      md += `## Metadata\n\n`;
      md += `| Field | Value |\n`;
      md += `|-------|-------|\n`;
      md += `| **Version** | ${def.version || '1.0.0'} |\n`;
      md += `| **Author** | ${def.author || 'Unknown'} |\n`;
      md += `| **Handler Type** | \`${def.handler_type || 'shell'}\` |\n`;
      md += `| **Timeout** | ${def.timeout || 30000}ms |\n`;

      if (def.tags && def.tags.length > 0) {
        md += `| **Tags** | ${def.tags.map(t => `\`${t}\``).join(', ')} |\n`;
      }

      md += '\n';

      // Parameters section
      md += `## Parameters\n\n`;

      const params = def.parameters || {};
      const paramCount = Object.keys(params).length;

      if (paramCount === 0) {
        md += `This tool accepts no parameters.\n\n`;
      } else {
        md += `This tool accepts ${paramCount} parameter${paramCount === 1 ? '' : 's'}:\n\n`;
        md += `| Parameter | Type | Required | Default | Description |\n`;
        md += `|-----------|------|----------|---------|-------------|\n`;

        for (const [name, paramDef] of Object.entries(params)) {
          const type = this._formatType(paramDef);
          const required = paramDef.required ? '✓' : '✗';
          const defaultVal = paramDef.default !== undefined
            ? `\`${JSON.stringify(paramDef.default)}\``
            : '-';
          const description = paramDef.description || 'No description';

          md += `| \`${name}\` | ${type} | ${required} | ${defaultVal} | ${description} |\n`;
        }

        md += '\n';

        // Parameter constraints section
        const constrainedParams = Object.entries(params).filter(([_, p]) =>
          p.minimum !== undefined ||
          p.maximum !== undefined ||
          p.minLength !== undefined ||
          p.maxLength !== undefined ||
          p.pattern !== undefined ||
          p.enum !== undefined
        );

        if (constrainedParams.length > 0) {
          md += `### Parameter Constraints\n\n`;

          for (const [name, paramDef] of constrainedParams) {
            md += `**\`${name}\`**:\n`;

            if (paramDef.enum) {
              md += `- Allowed values: ${paramDef.enum.map(v => `\`${v}\``).join(', ')}\n`;
            }
            if (paramDef.minimum !== undefined) {
              md += `- Minimum: ${paramDef.minimum}\n`;
            }
            if (paramDef.maximum !== undefined) {
              md += `- Maximum: ${paramDef.maximum}\n`;
            }
            if (paramDef.minLength !== undefined) {
              md += `- Min length: ${paramDef.minLength}\n`;
            }
            if (paramDef.maxLength !== undefined) {
              md += `- Max length: ${paramDef.maxLength}\n`;
            }
            if (paramDef.pattern) {
              md += `- Pattern: \`${paramDef.pattern}\`\n`;
            }

            md += '\n';
          }
        }
      }

      // Handler section
      md += `## Handler\n\n`;
      md += `**Type**: \`${def.handler_type || 'shell'}\`\n\n`;

      if (def.handler) {
        md += `**Template**:\n\n`;
        md += '```\n';
        md += def.handler;
        md += '\n```\n\n';

        // Extract placeholders
        const placeholders = (def.handler.match(/\{\{(\w+)\}\}/g) || [])
          .map(p => p.replace(/\{\{|\}\}/g, ''));

        if (placeholders.length > 0) {
          md += `**Parameters used**: ${placeholders.map(p => `\`${p}\``).join(', ')}\n\n`;
        }
      }

      // HTTP-specific details
      if (def.handler_type === 'http') {
        md += `**HTTP Method**: ${def.http_method || 'GET'}\n\n`;

        if (def.headers) {
          md += `**Headers**:\n\n`;
          md += '```json\n';
          md += JSON.stringify(def.headers, null, 2);
          md += '\n```\n\n';
        }
      }

      // Examples section
      if (def.examples && Array.isArray(def.examples) && def.examples.length > 0) {
        md += `## Examples\n\n`;

        def.examples.forEach((example, idx) => {
          md += `### Example ${idx + 1}${example.description ? `: ${example.description}` : ''}\n\n`;

          if (example.parameters) {
            md += '```json\n';
            md += JSON.stringify(example.parameters, null, 2);
            md += '\n```\n\n';
          }

          if (example.output) {
            md += '**Expected output**:\n\n';
            md += '```\n';
            md += example.output;
            md += '\n```\n\n';
          }
        });
      }

      // Dependencies section
      if (def.dependencies && Object.keys(def.dependencies).length > 0) {
        md += `## Dependencies\n\n`;
        md += `This tool requires the following dependencies:\n\n`;

        for (const [depName, versionRange] of Object.entries(def.dependencies)) {
          md += `- \`${depName}\` (${versionRange})\n`;
        }

        md += '\n';
      }

      // MCP Schema section
      md += `## MCP Schema\n\n`;
      md += `The generated MCP tool schema:\n\n`;
      md += '```json\n';
      md += JSON.stringify(schema, null, 2);
      md += '\n```\n\n';

      // Usage section
      md += `## Usage\n\n`;
      md += `### Installation\n\n`;
      md += '```bash\n';
      md += `npx forge install ${def.name}.yaml\n`;
      md += '```\n\n';

      md += `### Validation\n\n`;
      md += '```bash\n';
      md += `npx forge validate ${def.name}.yaml\n`;
      md += '```\n\n';

      md += `### Running\n\n`;
      md += '```bash\n';
      md += `npx forge serve /path/to/tools/directory\n`;
      md += '```\n\n';

      // Footer
      md += `---\n\n`;
      md += `*Documentation generated by FORGE*\n`;

      return md;
    } catch (err) {
      throw new Error(`Failed to generate documentation: ${err.message}`);
    }
  }

  /**
   * Generate documentation and save to a file.
   * @param {string|Object} toolDef - Tool definition file path or object
   * @param {string} outputPath - Path to save the documentation
   * @returns {string} Path to the saved file
   */
  save(toolDef, outputPath) {
    try {
      const markdown = this.generate(toolDef);
      const absPath = resolve(outputPath);

      writeFileSync(absPath, markdown, 'utf-8');

      return absPath;
    } catch (err) {
      throw new Error(`Failed to save documentation: ${err.message}`);
    }
  }

  /**
   * Generate documentation for multiple tools.
   * @param {Array<string|Object>} toolDefs - Array of tool definitions
   * @returns {string} Combined Markdown documentation
   */
  generateMultiple(toolDefs) {
    if (!Array.isArray(toolDefs)) {
      throw new Error('Expected an array of tool definitions');
    }

    let md = '# Tool Documentation\n\n';
    md += `Documentation for ${toolDefs.length} tool${toolDefs.length === 1 ? '' : 's'}.\n\n`;
    md += '---\n\n';

    toolDefs.forEach((toolDef, idx) => {
      if (idx > 0) {
        md += '\n---\n\n';
      }
      md += this.generate(toolDef);
    });

    return md;
  }

  /**
   * Generate an index/table of contents for multiple tools.
   * @param {Array<string|Object>} toolDefs - Array of tool definitions
   * @returns {string} Markdown table of contents
   */
  generateIndex(toolDefs) {
    if (!Array.isArray(toolDefs)) {
      throw new Error('Expected an array of tool definitions');
    }

    let md = '# Tool Index\n\n';
    md += `${toolDefs.length} tool${toolDefs.length === 1 ? '' : 's'} available.\n\n`;

    md += '| Name | Description | Version | Author |\n';
    md += '|------|-------------|---------|--------|\n';

    toolDefs.forEach(toolDef => {
      const def = typeof toolDef === 'string' ? loadToolDefinition(toolDef) : toolDef;
      const name = def.name || 'unknown';
      const description = (def.description || 'No description').substring(0, 80);
      const version = def.version || '1.0.0';
      const author = def.author || 'Unknown';

      md += `| [\`${name}\`](#${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) | ${description} | ${version} | ${author} |\n`;
    });

    md += '\n';

    return md;
  }

  /**
   * Format a parameter type for documentation.
   * @private
   */
  _formatType(paramDef) {
    let type = paramDef.type || 'string';

    if (paramDef.enum) {
      const values = paramDef.enum.slice(0, 3).map(v => `\`${v}\``).join(', ');
      const more = paramDef.enum.length > 3 ? `, +${paramDef.enum.length - 3} more` : '';
      return `enum (${values}${more})`;
    }

    if (type.startsWith('enum:')) {
      const values = type.substring(5).split(',').slice(0, 3).map(v => `\`${v.trim()}\``).join(', ');
      return `enum (${values})`;
    }

    if (type.includes('array<')) {
      const innerType = type.match(/array<(.+)>/)?.[1] || 'any';
      return `\`array<${innerType}>\``;
    }

    return `\`${type}\``;
  }
}

export default DocGenerator;
