#!/usr/bin/env node

/**
 * Tool Template Test Script
 *
 * This script tests a tool definition to ensure it's valid and ready for deployment.
 * It validates the YAML structure, schema generation, and parameter constraints.
 *
 * Usage: node test.mjs [tool-file.yaml]
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTool, validateToolDefinition, loadToolDefinition } from '../../lib/tool-builder.mjs';
import { generateToolSchema } from '../../lib/schema-generator.mjs';

// Get tool file from command line or use template
const toolFile = process.argv[2] || './tool.yaml';
const absPath = resolve(toolFile);

console.log('='.repeat(60));
console.log('FORGE Tool Template Test');
console.log('='.repeat(60));
console.log();

// Check if file exists
if (!existsSync(absPath)) {
  console.error(`❌ Error: File not found: ${absPath}`);
  console.error();
  console.error('Usage: node test.mjs [tool-file.yaml]');
  process.exit(1);
}

console.log(`Testing: ${absPath}`);
console.log();

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
    return true;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    testsFailed++;
    return false;
  }
}

// Test 1: Load tool definition
console.log('[1/5] Loading tool definition...');
let definition;
const loadSuccess = runTest('Load YAML/JSON file', () => {
  definition = loadToolDefinition(absPath);
  if (!definition) throw new Error('Definition is null or undefined');
});
console.log();

if (!loadSuccess) {
  console.error('Cannot continue without valid definition');
  process.exit(1);
}

// Test 2: Validate tool definition
console.log('[2/5] Validating tool definition...');
let validation;
runTest('Tool definition structure', () => {
  validation = validateToolDefinition(definition);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }
});

runTest('Tool name format', () => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(definition.name)) {
    throw new Error('Invalid tool name format');
  }
});

runTest('Tool has description', () => {
  if (!definition.description || definition.description.length < 10) {
    throw new Error('Description should be at least 10 characters');
  }
});
console.log();

// Test 3: Generate and validate schema
console.log('[3/5] Generating MCP schema...');
let schema;
runTest('Schema generation', () => {
  schema = generateToolSchema(definition);
  if (!schema.name || !schema.inputSchema) {
    throw new Error('Generated schema missing required fields');
  }
});

runTest('Schema is valid JSON', () => {
  const json = JSON.stringify(schema);
  JSON.parse(json); // Will throw if invalid
});

runTest('Input schema structure', () => {
  if (schema.inputSchema.type !== 'object') {
    throw new Error('Input schema must be an object type');
  }
  if (!schema.inputSchema.properties) {
    throw new Error('Input schema must have properties');
  }
});
console.log();

// Test 4: Validate parameters
console.log('[4/5] Validating parameters...');
const params = definition.parameters || {};
const paramCount = Object.keys(params).length;

runTest('Parameters defined', () => {
  if (paramCount === 0) {
    throw new Error('Tool should define at least one parameter');
  }
});

runTest('Parameter types valid', () => {
  for (const [name, def] of Object.entries(params)) {
    if (!def.type) {
      throw new Error(`Parameter "${name}" missing type`);
    }
    if (!def.description || def.description.length < 5) {
      throw new Error(`Parameter "${name}" needs a better description`);
    }
  }
});

runTest('Required parameters marked', () => {
  const hasRequired = Object.values(params).some(p => p.required === true);
  if (!hasRequired) {
    console.log('  Warning: No required parameters defined');
  }
});
console.log();

// Test 5: Build complete tool
console.log('[5/5] Building complete tool...');
let tool;
runTest('Build tool with handler', () => {
  tool = buildTool(absPath);
  if (!tool.schema || !tool.handler || !tool.definition) {
    throw new Error('Built tool missing required components');
  }
});

runTest('Handler is callable', () => {
  if (typeof tool.handler !== 'function') {
    throw new Error('Handler must be a function');
  }
});

runTest('Handler template valid', () => {
  if (definition.handler) {
    // Check for valid placeholder syntax
    const placeholders = definition.handler.match(/\{\{(\w+)\}\}/g) || [];
    const paramNames = Object.keys(params);

    for (const placeholder of placeholders) {
      const paramName = placeholder.replace(/\{\{|\}\}/g, '');
      if (!paramNames.includes(paramName)) {
        throw new Error(`Handler references undefined parameter: ${paramName}`);
      }
    }
  }
});
console.log();

// Summary
console.log('='.repeat(60));
console.log('Test Summary');
console.log('='.repeat(60));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log();

if (testsFailed === 0) {
  console.log('✓ All tests passed! Tool is ready for deployment.');
  console.log();
  console.log('Tool Details:');
  console.log(`  Name: ${definition.name}`);
  console.log(`  Version: ${definition.version || '1.0.0'}`);
  console.log(`  Author: ${definition.author || 'unknown'}`);
  console.log(`  Parameters: ${paramCount}`);
  console.log(`  Handler Type: ${definition.handler_type || 'shell'}`);
  console.log();
  console.log('Next steps:');
  console.log('  1. npx forge validate', absPath);
  console.log('  2. npx forge build', absPath);
  console.log('  3. npx forge install', absPath);
  console.log();
  process.exit(0);
} else {
  console.log('✗ Some tests failed. Please fix the errors above.');
  console.log();
  process.exit(1);
}
