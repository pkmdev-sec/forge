#!/usr/bin/env node

/**
 * FORGE Tool Tester
 * Testing framework for validating tool definitions and execution.
 * Validates schemas, runs mock executions, and verifies output formats.
 */

import { loadToolDefinition, validateToolDefinition, buildTool } from './tool-builder.mjs';
import { generateToolSchema, generateInputSchema } from './schema-generator.mjs';

/**
 * Tool testing framework.
 * Provides comprehensive validation and testing for tool definitions.
 */
export class ToolTester {
  constructor() {
    this.results = [];
  }

  /**
   * Validate a tool definition's structure and schema.
   * @param {string|Object} toolDef - Tool definition file path or object
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  validate(toolDef) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Load definition if it's a file path
      const def = typeof toolDef === 'string' ? loadToolDefinition(toolDef) : toolDef;

      // Basic validation
      const basicValidation = validateToolDefinition(def);
      if (!basicValidation.valid) {
        results.valid = false;
        results.errors.push(...basicValidation.errors);
        return results;
      }

      // Schema generation validation
      try {
        const schema = generateToolSchema(def);
        if (!schema.name || !schema.inputSchema) {
          results.errors.push('Generated schema missing required fields');
          results.valid = false;
        }

        // Validate JSON serialization
        JSON.stringify(schema);
      } catch (err) {
        results.errors.push(`Schema generation failed: ${err.message}`);
        results.valid = false;
      }

      // Parameter validation
      const params = def.parameters || {};
      if (Object.keys(params).length === 0) {
        results.warnings.push('No parameters defined (tool will accept no input)');
      }

      // Check for required parameters
      const hasRequired = Object.values(params).some(p => p.required === true);
      if (!hasRequired && Object.keys(params).length > 0) {
        results.warnings.push('No required parameters (all parameters are optional)');
      }

      // Handler validation
      if (!def.handler) {
        results.warnings.push('No handler defined (tool will return mock response)');
      } else {
        // Check handler template references
        const placeholders = (def.handler.match(/\{\{(\w+)\}\}/g) || [])
          .map(p => p.replace(/\{\{|\}\}/g, ''));
        const paramNames = Object.keys(params);

        for (const placeholder of placeholders) {
          if (!paramNames.includes(placeholder)) {
            results.errors.push(
              `Handler references undefined parameter: ${placeholder}`
            );
            results.valid = false;
          }
        }

        // Check for missing placeholders
        for (const paramName of paramNames) {
          if (params[paramName].required && !placeholders.includes(paramName)) {
            results.warnings.push(
              `Required parameter "${paramName}" is not used in handler template`
            );
          }
        }
      }

      // Handler type validation
      const handlerType = def.handler_type || 'shell';
      if (!['shell', 'http'].includes(handlerType)) {
        results.errors.push(`Invalid handler_type: ${handlerType} (must be 'shell' or 'http')`);
        results.valid = false;
      }

      // HTTP-specific validation
      if (handlerType === 'http') {
        if (def.http_method && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(def.http_method.toUpperCase())) {
          results.warnings.push(`Unusual HTTP method: ${def.http_method}`);
        }

        if (def.handler && !def.handler.match(/^https?:\/\//)) {
          results.errors.push('HTTP handler must be a valid URL starting with http:// or https://');
          results.valid = false;
        }
      }

      // Version format validation
      if (def.version && !def.version.match(/^\d+\.\d+\.\d+/)) {
        results.warnings.push('Version should follow semantic versioning (e.g., 1.0.0)');
      }

      // Description quality check
      if (def.description && def.description.length < 20) {
        results.warnings.push('Description is very short (consider adding more detail)');
      }

      // Timeout validation
      if (def.timeout) {
        if (typeof def.timeout !== 'number' || def.timeout <= 0) {
          results.errors.push('Timeout must be a positive number');
          results.valid = false;
        } else if (def.timeout < 1000) {
          results.warnings.push('Timeout is very short (< 1 second)');
        } else if (def.timeout > 300000) {
          results.warnings.push('Timeout is very long (> 5 minutes)');
        }
      }

    } catch (err) {
      results.valid = false;
      results.errors.push(`Validation error: ${err.message}`);
    }

    return results;
  }

  /**
   * Test tool execution with mock input data.
   * @param {string|Object} toolDef - Tool definition file path or object
   * @param {Object} mockInput - Mock parameter values
   * @returns {Promise<{ success: boolean, output: any, error?: string }>}
   */
  async testExecution(toolDef, mockInput = {}) {
    try {
      // Build the tool
      const tool = typeof toolDef === 'string' ? buildTool(toolDef) : buildTool(toolDef);

      // Validate input against schema
      const validationErrors = this._validateInput(tool.schema.inputSchema, mockInput);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: `Input validation failed: ${validationErrors.join(', ')}`,
        };
      }

      // Execute handler with timeout
      const timeout = tool.definition.timeout || 30000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout)
      );

      const result = await Promise.race([
        tool.handler(mockInput),
        timeoutPromise,
      ]);

      // Validate output format
      if (!result || typeof result !== 'object') {
        return {
          success: false,
          error: 'Handler returned invalid result (expected object)',
        };
      }

      if (!result.content || !Array.isArray(result.content)) {
        return {
          success: false,
          error: 'Handler result missing content array',
        };
      }

      return {
        success: !result.isError,
        output: result,
        error: result.isError ? result.content[0]?.text : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: `Execution failed: ${err.message}`,
      };
    }
  }

  /**
   * Run all tests on a tool definition.
   * @param {string|Object} toolDef - Tool definition file path or object
   * @param {Object} [options] - Test options
   * @param {Object} [options.mockInput] - Mock input for execution test
   * @param {boolean} [options.skipExecution] - Skip execution tests
   * @returns {Promise<{ passed: boolean, validation: Object, execution?: Object }>}
   */
  async runAll(toolDef, options = {}) {
    const results = {
      passed: true,
      validation: null,
      execution: null,
    };

    // Validation tests
    results.validation = this.validate(toolDef);
    if (!results.validation.valid) {
      results.passed = false;
    }

    // Execution tests (if enabled and validation passed)
    if (!options.skipExecution && results.validation.valid) {
      const def = typeof toolDef === 'string' ? loadToolDefinition(toolDef) : toolDef;
      const mockInput = options.mockInput || this._generateMockInput(def);

      results.execution = await this.testExecution(toolDef, mockInput);
      if (!results.execution.success) {
        results.passed = false;
      }
    }

    return results;
  }

  /**
   * Validate input against a JSON Schema.
   * @private
   */
  _validateInput(schema, input) {
    const errors = [];

    if (!schema || schema.type !== 'object') {
      return errors;
    }

    const { properties = {}, required = [] } = schema;

    // Check required fields
    for (const field of required) {
      if (!(field in input)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate field types
    for (const [field, value] of Object.entries(input)) {
      const fieldSchema = properties[field];
      if (!fieldSchema) {
        continue; // Allow extra fields
      }

      const typeError = this._validateType(fieldSchema, value, field);
      if (typeError) {
        errors.push(typeError);
      }
    }

    return errors;
  }

  /**
   * Validate a value against a type schema.
   * @private
   */
  _validateType(schema, value, fieldName) {
    if (!schema.type) return null;

    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          return `Field "${fieldName}" must be a string`;
        }
        if (schema.minLength && value.length < schema.minLength) {
          return `Field "${fieldName}" too short (min: ${schema.minLength})`;
        }
        if (schema.maxLength && value.length > schema.maxLength) {
          return `Field "${fieldName}" too long (max: ${schema.maxLength})`;
        }
        if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
          return `Field "${fieldName}" does not match pattern`;
        }
        if (schema.enum && !schema.enum.includes(value)) {
          return `Field "${fieldName}" must be one of: ${schema.enum.join(', ')}`;
        }
        break;

      case 'number':
      case 'integer':
        if (typeof value !== 'number') {
          return `Field "${fieldName}" must be a number`;
        }
        if (schema.type === 'integer' && !Number.isInteger(value)) {
          return `Field "${fieldName}" must be an integer`;
        }
        if (schema.minimum !== undefined && value < schema.minimum) {
          return `Field "${fieldName}" below minimum (${schema.minimum})`;
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
          return `Field "${fieldName}" above maximum (${schema.maximum})`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Field "${fieldName}" must be a boolean`;
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return `Field "${fieldName}" must be an array`;
        }
        if (schema.minItems && value.length < schema.minItems) {
          return `Field "${fieldName}" has too few items (min: ${schema.minItems})`;
        }
        if (schema.maxItems && value.length > schema.maxItems) {
          return `Field "${fieldName}" has too many items (max: ${schema.maxItems})`;
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return `Field "${fieldName}" must be an object`;
        }
        break;
    }

    return null;
  }

  /**
   * Generate mock input for a tool definition.
   * @private
   */
  _generateMockInput(def) {
    const input = {};
    const params = def.parameters || {};

    for (const [name, paramDef] of Object.entries(params)) {
      // Use default if available
      if (paramDef.default !== undefined) {
        input[name] = paramDef.default;
        continue;
      }

      // Generate mock value based on type
      const type = paramDef.type || 'string';

      if (paramDef.enum) {
        input[name] = paramDef.enum[0];
      } else if (type.startsWith('enum:')) {
        const values = type.substring(5).split(',').map(v => v.trim());
        input[name] = values[0];
      } else if (type.includes('string') || type.includes('text')) {
        input[name] = 'test-value';
      } else if (type.includes('int') || type.includes('num')) {
        input[name] = paramDef.minimum || 1;
      } else if (type.includes('bool')) {
        input[name] = true;
      } else if (type.includes('array')) {
        input[name] = ['item1'];
      } else {
        input[name] = 'mock-value';
      }
    }

    return input;
  }
}

export default ToolTester;
